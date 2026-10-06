/**
 * google-sync Worker — 排程＋儀表板 API
 * ─────────────────────────────────────────────────────────────────────────────
 * 排程（wrangler.toml triggers，UTC）：
 *   "0 21 * * *"  → 氣象預報與天氣規則（runWeather）
 *   "30 22 * * *" → Google Ads 活動日成效同步（runAdsSync）
 * HTTP（儀表板呼叫，帶 Supabase 登入 token）：
 *   GET  /health
 *   POST /auth/link            → 產生一次性 nonce（manager+）
 *   GET  /auth/start?nonce=    → 導向 Google 同意畫面
 *   GET  /auth/callback        → 存 refresh token，導回儀表板
 *   GET  /auth/status          → { connected }
 *   POST /auth/disconnect      → 解除連結（admin）
 *   GET  /ads/accounts         → 可存取的 Google Ads 帳號清單
 *   GET  /ads/campaigns?customer=&days=   → 活動成效（同時寫入 google_ads_daily）
 *   GET  /ads/search-terms?customer=      → 近 30 天搜尋字詞
 *   POST /ads/keyword-ideas    → { customer, seeds[], url?, geo?, lang?, limit? } 關鍵字建議
 *   POST /ads/gaql             → { customer, query }（admin）
 *   POST /run/weather、/run/ads-sync → 手動觸發（admin，或 header x-run-token）
 */
import { Env, loadSettings } from './supabase'
import { runWeather } from './weather'
import { runAdsSync } from './ads-sync'
import { requireUser, HttpError } from './auth'
import { GEnv, createLinkNonce, authStartUrl, authCallback, isConnected, disconnect, listAccessibleCustomers, campaignDaily, keywordIdeas, searchTerms, gaql } from './google'
import { upsert } from './supabase'

type E = GEnv & { RUN_TOKEN?: string }

function cors(req: Request, env: E, res: Response) {
  const origin = req.headers.get('Origin') || ''
  const allow = (env.DASHBOARD_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
  const h = new Headers(res.headers)
  h.set('Access-Control-Allow-Origin', allow.length ? (allow.includes(origin) ? origin : allow[0]) : '*')
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-run-token')
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  h.set('Vary', 'Origin')
  return new Response(res.body, { status: res.status, headers: h })
}
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

export default {
  async scheduled(controller: ScheduledController, env: E, ctx: ExecutionContext) {
    switch (controller.cron) {
      case '0 21 * * *': ctx.waitUntil(runWeather(env)); break
      case '30 22 * * *': ctx.waitUntil(runAdsSync(env)); break
      default: ctx.waitUntil(runWeather(env))
    }
  },

  async fetch(req: Request, env: E): Promise<Response> {
    if (req.method === 'OPTIONS') return cors(req, env, new Response(null, { status: 204 }))
    try { return cors(req, env, await route(req, env)) }
    catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500
      return cors(req, env, json({ ok: false, error: String(e?.message || e) }, status))
    }
  },
}

async function route(req: Request, env: E): Promise<Response> {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  const p = url.pathname

  if (p === '/health') return json({ ok: true, time: new Date().toISOString(), connected: await isConnected(env).catch(() => false) })

  // ── OAuth 連結 ──
  if (p === '/auth/link' && req.method === 'POST') {
    const u = await requireUser(req, env)
    const { returnTo } = await req.json().catch(() => ({ returnTo: '' }))
    const nonce = await createLinkNonce(env, returnTo || '', u.email)
    return json({ ok: true, url: `${origin}/auth/start?nonce=${nonce}` })
  }
  if (p === '/auth/start') {
    const nonce = url.searchParams.get('nonce') || ''
    return Response.redirect(await authStartUrl(env, origin, nonce), 302)
  }
  if (p === '/auth/callback') {
    const code = url.searchParams.get('code'), state = url.searchParams.get('state')
    if (!code || !state) return new Response('缺少 code/state', { status: 400 })
    const back = await authCallback(env, origin, code, state)
    return Response.redirect(back ? `${back}${back.includes('#') ? '' : '#marketing-ads'}` : '/', 302)
  }
  if (p === '/auth/status') { await requireUser(req, env, ['admin', 'manager', 'viewer']); return json({ ok: true, connected: await isConnected(env) }) }
  if (p === '/auth/disconnect' && req.method === 'POST') { await requireUser(req, env, ['admin']); await disconnect(env); return json({ ok: true }) }

  // ── Ads 讀取 ──
  const get = await loadSettings(env, { 'google.login_customer_id': '', 'google.geo_target': 2158, 'google.language': 1018, 'google.idea_limit': 50 })
  const login = String(get('google.login_customer_id') || '') || undefined

  if (p === '/ads/accounts') { await requireUser(req, env); return json({ ok: true, accounts: await listAccessibleCustomers(env, login) }) }
  if (p === '/ads/campaigns') {
    await requireUser(req, env)
    const customer = url.searchParams.get('customer') || ''
    if (!customer) throw new HttpError(400, '缺少 customer')
    const days = Number(url.searchParams.get('days') || 30)
    const rows = await campaignDaily(env, customer, days, login)
    if (rows.length) await upsert(env, 'google_ads_daily', rows.map(({ status, ...r }) => r)).catch(() => 0)
    return json({ ok: true, rows })
  }
  if (p === '/ads/search-terms') {
    await requireUser(req, env)
    const customer = url.searchParams.get('customer') || ''
    if (!customer) throw new HttpError(400, '缺少 customer')
    return json({ ok: true, rows: await searchTerms(env, customer, login) })
  }
  if (p === '/ads/keyword-ideas' && req.method === 'POST') {
    await requireUser(req, env)
    const b = await req.json()
    if (!b.customer) throw new HttpError(400, '缺少 customer')
    const ideas = await keywordIdeas(env, b.customer, { seeds: b.seeds, url: b.url, geo: Number(b.geo || get('google.geo_target')), lang: Number(b.lang || get('google.language')), limit: Number(b.limit || get('google.idea_limit')) }, login)
    return json({ ok: true, ideas })
  }
  if (p === '/ads/gaql' && req.method === 'POST') {
    await requireUser(req, env, ['admin'])
    const b = await req.json()
    return json({ ok: true, rows: await gaql(env, b.customer, b.query, login) })
  }

  // ── 手動觸發 ──
  if ((p === '/run/weather' || p === '/run/ads-sync') && req.method === 'POST') {
    const byToken = env.RUN_TOKEN && req.headers.get('x-run-token') === env.RUN_TOKEN
    if (!byToken) await requireUser(req, env, ['admin'])
    const n = p === '/run/weather' ? await runWeather(env) : await runAdsSync(env)
    return json({ ok: true, rows: n ?? null })
  }

  return new Response('google-sync worker', { status: 200 })
}

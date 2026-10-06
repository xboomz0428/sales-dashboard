/**
 * google.ts — Google Ads API（REST）用戶端：OAuth 連結、取 token、GAQL、關鍵字建議
 * ─────────────────────────────────────────────────────────────────────────────
 * 老闆在儀表板按「連結 Google Ads」→ /auth/start → Google 同意 → /auth/callback 把 refresh token 存 KV。
 * 之後所有呼叫用 refresh token 換 access token（KV 快取 50 分鐘）。
 * 存取等級：Explorer 即可讀報表；generateKeywordIdeas（關鍵字規劃）需要 Basic 以上，
 * 若回 403/PERMISSION_DENIED 會把 Google 的原文回給儀表板顯示。
 */
import { Env } from './supabase'

export interface GEnv extends Env {
  TOKENS: KVNamespace
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_ADS_DEVELOPER_TOKEN?: string   // 2026-09 後可省略；有填就帶
  GOOGLE_ADS_API_VERSION?: string       // 預設 v25
  DASHBOARD_ORIGIN?: string             // 逗號分隔的允許來源
}

const SCOPE = 'https://www.googleapis.com/auth/adwords'
const KV_REFRESH = 'google_refresh_token'
const KV_ACCESS = 'google_access_token'
const KV_NONCE = 'oauth_nonce:'

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)))

// ── OAuth ──────────────────────────────────────────────────────────────────
export async function createLinkNonce(env: GEnv, returnTo: string, email: string) {
  const nonce = crypto.randomUUID()
  await env.TOKENS.put(KV_NONCE + nonce, JSON.stringify({ returnTo, email }), { expirationTtl: 600 })
  return nonce
}

export async function authStartUrl(env: GEnv, origin: string, nonce: string) {
  const raw = await env.TOKENS.get(KV_NONCE + nonce)
  if (!raw) throw new Error('連結已過期，請回儀表板重新按「連結 Google Ads」')
  const state = b64(JSON.stringify({ nonce }))
  const p = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${origin}/auth/callback`,
    response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

export async function authCallback(env: GEnv, origin: string, code: string, state: string) {
  const { nonce } = JSON.parse(unb64(state))
  const raw = await env.TOKENS.get(KV_NONCE + nonce)
  if (!raw) throw new Error('state 無效或已過期')
  const { returnTo } = JSON.parse(raw)
  await env.TOKENS.delete(KV_NONCE + nonce)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: `${origin}/auth/callback`, grant_type: 'authorization_code' }),
  })
  const j: any = await r.json()
  if (!r.ok || !j.refresh_token) throw new Error(`Google 未回 refresh token：${JSON.stringify(j).slice(0, 300)}`)
  await env.TOKENS.put(KV_REFRESH, j.refresh_token)
  await env.TOKENS.put(KV_ACCESS, JSON.stringify({ token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 }), { expirationTtl: 3600 })
  return returnTo || '/'
}

export async function isConnected(env: GEnv) { return !!(await env.TOKENS.get(KV_REFRESH)) }
export async function disconnect(env: GEnv) { await env.TOKENS.delete(KV_REFRESH); await env.TOKENS.delete(KV_ACCESS) }

export async function accessToken(env: GEnv): Promise<string> {
  const cached = await env.TOKENS.get(KV_ACCESS)
  if (cached) { const c = JSON.parse(cached); if (c.exp > Date.now()) return c.token }
  const refresh = await env.TOKENS.get(KV_REFRESH)
  if (!refresh) throw new Error('尚未連結 Google Ads 帳號')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refresh, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, grant_type: 'refresh_token' }),
  })
  const j: any = await r.json()
  if (!r.ok) throw new Error(`換取 access token 失敗：${j.error_description || j.error || r.status}`)
  await env.TOKENS.put(KV_ACCESS, JSON.stringify({ token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 }), { expirationTtl: 3600 })
  return j.access_token
}

// ── Ads API ────────────────────────────────────────────────────────────────
const ver = (env: GEnv) => env.GOOGLE_ADS_API_VERSION || 'v25'
const cid = (s: string) => String(s || '').replace(/-/g, '').trim()

export async function adsFetch(env: GEnv, path: string, body?: any, loginCustomerId?: string, method = 'POST') {
  const token = await accessToken(env)
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (loginCustomerId) headers['login-customer-id'] = cid(loginCustomerId)
  const r = await fetch(`https://googleads.googleapis.com/${ver(env)}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let j: any = {}; try { j = JSON.parse(text) } catch { j = { raw: text } }
  if (!r.ok) {
    const detail = j?.error?.details?.[0]?.errors?.[0]?.message || j?.error?.message || text.slice(0, 300)
    throw new Error(`Google Ads API ${r.status}：${detail}`)
  }
  return j
}

export async function listAccessibleCustomers(env: GEnv, loginCustomerId?: string) {
  const j = await adsFetch(env, 'customers:listAccessibleCustomers', undefined, loginCustomerId, 'GET')
  const ids: string[] = (j.resourceNames || []).map((r: string) => r.split('/')[1])
  const out: any[] = []
  for (const id of ids.slice(0, 15)) {
    try {
      const rows = await gaql(env, id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.time_zone FROM customer LIMIT 1', loginCustomerId)
      const c = rows[0]?.customer || {}
      out.push({ id, name: c.descriptiveName || '', currency: c.currencyCode || '', manager: !!c.manager, timeZone: c.timeZone || '' })
    } catch (e: any) { out.push({ id, name: '', error: String(e.message || e) }) }
  }
  return out
}

export async function gaql(env: GEnv, customerId: string, query: string, loginCustomerId?: string, maxPages = 5) {
  const results: any[] = []
  let pageToken: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const j = await adsFetch(env, `customers/${cid(customerId)}/googleAds:search`, { query, pageSize: 10000, pageToken }, loginCustomerId)
    results.push(...(j.results || []))
    pageToken = j.nextPageToken
    if (!pageToken) break
  }
  return results
}

/** 關鍵字建議（Keyword Planner）。需 Basic 以上存取等級。 */
export async function keywordIdeas(env: GEnv, customerId: string, opts: { seeds?: string[]; url?: string; geo?: number; lang?: number; limit?: number }, loginCustomerId?: string) {
  const seeds = (opts.seeds || []).map(s => s.trim()).filter(Boolean).slice(0, 20)
  const body: any = {
    language: `languageConstants/${opts.lang || 1018}`,
    geoTargetConstants: [`geoTargetConstants/${opts.geo || 2158}`],
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    pageSize: Math.min(Math.max(opts.limit || 50, 10), 500),
  }
  if (seeds.length && opts.url) body.keywordAndUrlSeed = { keywords: seeds, url: opts.url }
  else if (opts.url) body.urlSeed = { url: opts.url }
  else body.keywordSeed = { keywords: seeds }
  const j = await adsFetch(env, `customers/${cid(customerId)}:generateKeywordIdeas`, body, loginCustomerId)
  return (j.results || []).map((r: any) => {
    const m = r.keywordIdeaMetrics || {}
    return {
      text: r.text,
      avgMonthlySearches: Number(m.avgMonthlySearches || 0),
      competition: m.competition || 'UNSPECIFIED',
      competitionIndex: m.competitionIndex != null ? Number(m.competitionIndex) : null,
      lowTopBid: m.lowTopOfPageBidMicros ? Number(m.lowTopOfPageBidMicros) / 1e6 : null,
      highTopBid: m.highTopOfPageBidMicros ? Number(m.highTopOfPageBidMicros) / 1e6 : null,
      monthly: (m.monthlySearchVolumes || []).map((v: any) => ({ year: Number(v.year), month: v.month, searches: Number(v.monthlySearches || 0) })),
    }
  })
}

/** 近 N 天各活動逐日成效 → 給 google_ads_daily */
export async function campaignDaily(env: GEnv, customerId: string, days: number, loginCustomerId?: string) {
  const q = `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_${days <= 7 ? 7 : days <= 14 ? 14 : 30}_DAYS ORDER BY segments.date`
  const rows = await gaql(env, customerId, q, loginCustomerId)
  return rows.map((r: any) => ({
    customer_id: cid(customerId), campaign_id: String(r.campaign?.id), campaign_name: r.campaign?.name || '', status: r.campaign?.status || '',
    date: r.segments?.date, cost_micros: Number(r.metrics?.costMicros || 0), impressions: Number(r.metrics?.impressions || 0), clicks: Number(r.metrics?.clicks || 0),
    conversions: Number(r.metrics?.conversions || 0), conv_value: Number(r.metrics?.conversionsValue || 0),
  }))
}

/** 搜尋字詞（近 30 天）：給關鍵字池比對用 */
export async function searchTerms(env: GEnv, customerId: string, loginCustomerId?: string) {
  const q = 'SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 500'
  const rows = await gaql(env, customerId, q, loginCustomerId, 1)
  return rows.map((r: any) => ({ keyword: r.searchTermView?.searchTerm, impressions: Number(r.metrics?.impressions || 0), clicks: Number(r.metrics?.clicks || 0), cost_micros: Number(r.metrics?.costMicros || 0), conversions: Number(r.metrics?.conversions || 0) }))
}

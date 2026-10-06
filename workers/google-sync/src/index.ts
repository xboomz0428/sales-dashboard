/**
 * google-sync Worker — 排程入口
 * ─────────────────────────────────────────────────────────────────────────────
 * 依 controller.cron 分流（wrangler.toml 的 triggers）：
 *   "0 21 * * *"  → 氣象預報與天氣規則（runWeather）
 *   "30 22 * * *" → Google Ads／GA4／GSC 日同步（第二階段：見 docs/Google廣告_GA_GSC串接規劃.md 第 4 節）
 * 本機測試：npm run dev 後 curl "http://localhost:8787/__scheduled?cron=0+21+*+*+*"
 * HTTP GET /health 回狀態，GET /run/weather 可手動觸發（需 header x-run-token = RUN_TOKEN secret）。
 */
import { Env } from './supabase'
import { runWeather } from './weather'

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    switch (controller.cron) {
      case '0 21 * * *':
        ctx.waitUntil(runWeather(env))
        break
      case '30 22 * * *':
        // TODO 第二階段：Google Ads GAQL → google_ads_daily；GA4 runReport → ga4_daily；GSC searchAnalytics → gsc_daily
        break
      default:
        ctx.waitUntil(runWeather(env))
    }
  },

  async fetch(req: Request, env: Env & { RUN_TOKEN?: string }) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return Response.json({ ok: true, dataset: env.CWA_DATASET, time: new Date().toISOString() })
    if (url.pathname === '/run/weather') {
      if (!env.RUN_TOKEN || req.headers.get('x-run-token') !== env.RUN_TOKEN) return new Response('forbidden', { status: 403 })
      try { await runWeather(env); return Response.json({ ok: true }) }
      catch (e: any) { return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 }) }
    }
    return new Response('google-sync worker', { status: 200 })
  },
}

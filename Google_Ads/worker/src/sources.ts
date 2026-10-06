/**
 * sources.ts — 關鍵字閉迴路的四個資料來源（同一組 Google OAuth，scope 加大即可）
 *   GSC   https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query   scope: webmasters.readonly
 *   GA4   https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport        scope: analytics.readonly
 *   Trends 官方 API 仍是申請制 alpha（2026）：先走 (a) 設定頁 CSV 匯入 (b) SerpApi/DataForSEO 等代理（選用 secret）(c) 核准後改官方
 *   Keyword Planner  見 google.ts keywordIdeas（需 Basic 存取等級）
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export async function gscQuery(fetchAuth: Fetch, site: string, startDate: string, endDate: string, rowLimit = 5000) {
  const r = await fetchAuth(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions: ['date', 'query', 'page'], rowLimit, dataState: 'final' }),
  })
  if (!r.ok) throw new Error(`GSC ${r.status}: ${await r.text()}`)
  const { rows = [] } = await r.json() as any
  return rows.map((x: any) => ({ day: x.keys[0], query: x.keys[1], page: x.keys[2], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }))
}

export async function ga4Report(fetchAuth: Fetch, propertyId: string, startDate: string, endDate: string) {
  const r = await fetchAuth(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }, { name: 'addToCarts' }],
      limit: 10000,
    }),
  })
  if (!r.ok) throw new Error(`GA4 ${r.status}: ${await r.text()}`)
  const { rows = [] } = await r.json() as any
  return rows.map((x: any) => {
    const d = x.dimensionValues.map((v: any) => v.value), m = x.metricValues.map((v: any) => Number(v.value))
    return { day: `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`, source: d[1], medium: d[2], campaign: d[3], sessions: m[0], users: m[1], purchases: m[2], revenue: m[3], add_to_cart: m[4] }
  })
}

/** GA4 落地頁 × 關鍵字對照用：landingPage + sessionGoogleAdsKeyword（Ads 連結後才有值） */
export async function ga4Keywords(fetchAuth: Fetch, propertyId: string, startDate: string, endDate: string) {
  const r = await fetchAuth(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'sessionGoogleAdsKeyword' }, { name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }], limit: 5000 }),
  })
  if (!r.ok) throw new Error(`GA4 ${r.status}: ${await r.text()}`)
  const { rows = [] } = await r.json() as any
  return rows.map((x: any) => ({ keyword: x.dimensionValues[0].value, page: x.dimensionValues[1].value, sessions: Number(x.metricValues[0].value), purchases: Number(x.metricValues[1].value), revenue: Number(x.metricValues[2].value) }))
}

/** Trends：CSV 匯入（Google Trends 網頁「下載」的檔），欄位 週,關鍵字,興趣度 或 trends.google.com 匯出格式 */
export function parseTrendsCsv(csv: string, keyword?: string) {
  const out: { week: string; keyword: string; interest: number }[] = []
  const lines = csv.split(/\r?\n/).filter(Boolean)
  let header: string[] = []
  for (const line of lines) {
    const cells = line.split(',').map(s => s.trim())
    if (/^(週|Week|Day|日期)/i.test(cells[0]) || (!header.length && isNaN(Number(cells[1])))) { header = cells; continue }
    if (!/^\d{4}-\d{2}-\d{2}/.test(cells[0])) continue
    cells.slice(1).forEach((v, i) => {
      const kw = keyword || (header[i + 1] || '').replace(/:.*$/, '') || `col${i + 1}`
      out.push({ week: cells[0], keyword: kw, interest: Number(v === '<1' ? 0 : v) || 0 })
    })
  }
  return out
}

/** 關鍵字四來源判斷：Planner 月量 × GSC 排名 × GA4 轉換 × Trends 趨勢 → 判斷與分數 */
export interface KwSignals { keyword: string; planner_volume?: number; competition?: string; bid_high?: number; gsc_position?: number; gsc_impressions?: number; ga4_sessions?: number; ga4_purchases?: number; trends_slope?: number; ads_cost7?: number; ads_conv7?: number; in_pool?: string; banned?: boolean }
export function judgeKeyword(s: KwSignals, cfg: { wasted_cost: number; seo_rank_min: number; seo_rank_max: number; seo_min_impr: number; target_cpa: number }) {
  const r: { judgement: string; reason: string; score: number; seo: boolean } = { judgement: '', reason: '', score: 0, seo: false }
  const vol = s.planner_volume || 0, pos = s.gsc_position, trend = s.trends_slope || 0
  if (s.in_pool === 'negative') return { ...r, judgement: 'negative', reason: '已在否定清單' }
  if ((s.ads_cost7 || 0) >= cfg.wasted_cost && !(s.ads_conv7 || 0)) return { ...r, judgement: 'waste', reason: `7 天花 ${Math.round(s.ads_cost7!)} 元 0 轉換`, score: -2 }
  if ((s.ads_conv7 || 0) > 0 && (s.ads_cost7 || 0) / s.ads_conv7! <= cfg.target_cpa) return { ...r, judgement: 'converting', reason: `已投放且 CPA ${Math.round(s.ads_cost7! / s.ads_conv7!)} 元達標 → 改完全比對`, score: 3 }
  if ((s.ga4_purchases || 0) > 0) return { ...r, judgement: 'converting', reason: `GA4 有 ${s.ga4_purchases} 筆購買`, score: 3 }
  if (pos && pos <= 3) return { ...r, judgement: 'covered', reason: `GSC 第 ${pos.toFixed(0)} 名，自然已覆蓋`, score: 1 }
  if (pos && pos >= cfg.seo_rank_min && pos <= cfg.seo_rank_max && (s.gsc_impressions || 0) >= cfg.seo_min_impr) return { ...r, judgement: 'content', reason: `GSC 第 ${pos.toFixed(0)} 名、曝光 ${s.gsc_impressions} → 寫文章衝前三`, score: 2, seo: true }
  if (pos && pos > cfg.seo_rank_max && pos <= 30) return { ...r, judgement: 'content', reason: `GSC 第 ${pos.toFixed(0)} 名，可衝內容`, score: 1.5, seo: true }
  if (vol >= 100 && trend > 0.15) return { ...r, judgement: 'opportunity', reason: `月量 ${vol}、Trends 上升 ${(trend * 100).toFixed(0)}%，未投放`, score: 2.5 }
  if (vol >= 100 && (s.competition === 'LOW' || s.competition === 'MEDIUM')) return { ...r, judgement: 'opportunity', reason: `月量 ${vol}、競爭${s.competition === 'LOW' ? '低' : '中'}`, score: 2 }
  if (vol >= 1000 && (s.bid_high || 0) > cfg.target_cpa * 0.1) return { ...r, judgement: 'pricey', reason: `出價上限 ${s.bid_high} 元偏高`, score: 0.5 }
  if (vol > 0 && vol < 100) return { ...r, judgement: 'longtail', reason: `月量 ${vol}，當長尾／文章用`, score: 1, seo: true }
  return { ...r, judgement: 'watch', reason: '資料不足，觀察', score: 0 }
}

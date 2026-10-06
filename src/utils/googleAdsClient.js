/**
 * googleAdsClient.js — 儀表板呼叫 google-sync Worker 的 Google Ads 端點
 * 身分：帶 Supabase 登入 token（Worker 會向 Supabase 驗證並查角色）。
 */
import { supabase, supabaseReady } from '../config/supabase'

async function token() {
  if (!supabaseReady) return ''
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || ''
}

export async function adsApi(workerUrl, path, { method = 'GET', body } = {}) {
  const base = String(workerUrl || '').trim().replace(/\/$/, '')
  if (!base) throw new Error('請先在「設定 → Google 廣告」填 Worker 網址')
  const t = await token()
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let j = {}
  try { j = await r.json() } catch { /* 非 JSON */ }
  if (!r.ok || j.ok === false) throw new Error(j.error || `Worker 回應 ${r.status}`)
  return j
}

export const getStatus = (w) => adsApi(w, '/auth/status')
export const linkUrl = (w, returnTo) => adsApi(w, '/auth/link', { method: 'POST', body: { returnTo } })
export const disconnect = (w) => adsApi(w, '/auth/disconnect', { method: 'POST' })
export const listAccounts = (w) => adsApi(w, '/ads/accounts')
export const campaigns = (w, customer, days = 30) => adsApi(w, `/ads/campaigns?customer=${encodeURIComponent(customer)}&days=${days}`)
export const searchTerms = (w, customer) => adsApi(w, `/ads/search-terms?customer=${encodeURIComponent(customer)}`)
export const keywordIdeas = (w, body) => adsApi(w, '/ads/keyword-ideas', { method: 'POST', body })
export const runAdsSync = (w) => adsApi(w, '/run/ads-sync', { method: 'POST' })

/** 把 Worker 回來的活動逐日列彙總成每檔一列 */
export function summarizeCampaigns(rows = []) {
  const m = {}
  for (const r of rows) {
    const o = (m[r.campaign_id] ||= { id: r.campaign_id, name: r.campaign_name, status: r.status, cost: 0, impressions: 0, clicks: 0, conversions: 0, value: 0, days: new Set() })
    o.cost += (r.cost_micros || 0) / 1e6; o.impressions += r.impressions || 0; o.clicks += r.clicks || 0
    o.conversions += r.conversions || 0; o.value += r.conv_value || 0; o.days.add(r.date)
  }
  return Object.values(m).map(o => ({
    ...o, days: o.days.size,
    ctr: o.impressions ? o.clicks / o.impressions : 0,
    cpc: o.clicks ? o.cost / o.clicks : 0,
    cpa: o.conversions ? o.cost / o.conversions : null,
    roas: o.cost ? o.value / o.cost : null,
  })).sort((a, b) => b.cost - a.cost)
}

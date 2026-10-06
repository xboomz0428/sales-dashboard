/**
 * ads-sync.ts — 每日 06:30 把 Google Ads 活動逐日成效寫進 google_ads_daily（回抓 N 天）
 * 客戶 ID、login-customer-id、回抓天數都讀行銷設定中心。
 */
import { upsert, loadSettings, logSync } from './supabase'
import { GEnv, campaignDaily, isConnected } from './google'

const DEFAULTS = { 'google.customer_id': '', 'google.login_customer_id': '', 'sync.ads_lookback_days': 7 }

export async function runAdsSync(env: GEnv) {
  const get = await loadSettings(env, DEFAULTS)
  const customer = String(get('google.customer_id') || '').trim()
  if (!customer) { await logSync(env, 'google_ads', 0, false, '尚未在設定中心填 Google Ads 客戶 ID'); return }
  if (!(await isConnected(env))) { await logSync(env, 'google_ads', 0, false, '尚未連結 Google Ads 帳號'); return }
  try {
    const rows = await campaignDaily(env, customer, Number(get('sync.ads_lookback_days')) || 7, String(get('google.login_customer_id') || '') || undefined)
    const n = await upsert(env, 'google_ads_daily', rows.map(({ status, ...r }) => r))
    await logSync(env, 'google_ads', n, true)
    return n
  } catch (e: any) {
    await logSync(env, 'google_ads', 0, false, String(e?.message || e))
    throw e
  }
}

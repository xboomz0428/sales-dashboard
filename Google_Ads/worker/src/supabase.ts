/**
 * supabase.ts — 用 service key 走 PostgREST（Worker 內不用 supabase-js，省啟動時間）
 */
export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  CWA_API_KEY: string
  CWA_DATASET: string
  LINE_CHANNEL_TOKEN?: string
  LINE_TARGET_ID?: string
}

function headers(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export async function select<T = any>(env: Env, table: string, query: string): Promise<T[]> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headers(env) })
  if (!r.ok) throw new Error(`select ${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

/** upsert（依主鍵合併） */
export async function upsert(env: Env, table: string, rows: any[]): Promise<number> {
  if (!rows.length) return 0
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`)
  return rows.length
}

export async function insert(env: Env, table: string, rows: any[]): Promise<void> {
  if (!rows.length) return
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers(env, { Prefer: 'return=minimal' }), body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${await r.text()}`)
}

/** 讀行銷設定中心：DB 有改過的值優先，否則用這裡的 fallback */
export async function loadSettings(env: Env, fallback: Record<string, any>): Promise<(key: string) => any> {
  const rows = await select<{ key: string; value: any }>(env, 'marketing_settings', 'select=key,value&value=not.is.null')
  const map: Record<string, any> = { ...fallback }
  for (const r of rows) map[r.key] = r.value
  return (key: string) => map[key]
}

export async function logSync(env: Env, source: string, rows: number, ok: boolean, error?: string) {
  await insert(env, 'google_sync_log', [{ source, rows, ok, error: error ?? null }])
}

/** LINE 推播（沿用儀表板「LINE 通知」頁同步到 dashboard_settings 的 token） */
export async function linePush(env: Env, text: string) {
  let token = env.LINE_CHANNEL_TOKEN, to = env.LINE_TARGET_ID
  if (!token || !to) {
    const rows = await select<{ key: string; value: string }>(env, 'dashboard_settings', 'select=key,value&key=in.(line_channel_token,line_target_id)')
    for (const r of rows) { if (r.key === 'line_channel_token') token ||= r.value; if (r.key === 'line_target_id') to ||= r.value }
  }
  if (!token || !to) return false
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  })
  return r.ok
}

/**
 * weather.ts — 中央氣象署一週縣市預報 → weather_daily → 天氣觸發規則 → marketing_alerts
 * ─────────────────────────────────────────────────────────────────────────────
 * 資料集預設 F-D0047-091（臺灣各縣市未來一週）。欄位名稱以 elementName 模糊比對（MinT／MaxT／PoP12h／Wx），
 * 首次部署請用 `wrangler tail` 看 log 確認解析到的欄位；若氣象署改版，只需調整 pickElement。
 */
import { Env, upsert, insert, select, loadSettings, logSync, linePush } from './supabase'

const DEFAULTS = {
  'weather.regions': ['臺北市', '新北市', '桃園市'],
  'weather.cold_min_temp': 16,
  'weather.cold_drop': 5,
  'weather.rain_pop': 70,
  'weather.rain_max_temp': 20,
}

type Daily = { region: string; date: string; t_min: number | null; t_max: number | null; pop: number | null; wx: string | null }

function pickElement(elements: any[], ...names: string[]) {
  return elements.find(e => names.some(n => String(e.elementName || e.ElementName || '').toLowerCase().includes(n.toLowerCase())))
}
function timesOf(el: any): any[] { return el?.time || el?.Time || [] }
function valueOf(t: any): string {
  const v = t.elementValue ?? t.ElementValue
  if (Array.isArray(v)) { const first = v[0] || {}; return String(first.value ?? first.Value ?? Object.values(first)[0] ?? '') }
  return String(v?.value ?? v ?? '')
}
function dateOf(t: any): string { return String(t.startTime || t.StartTime || t.dataTime || t.DataTime || '').slice(0, 10) }

export async function fetchWeather(env: Env, regions: string[]): Promise<Daily[]> {
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${env.CWA_DATASET}?Authorization=${env.CWA_API_KEY}&format=JSON&locationName=${encodeURIComponent(regions.join(','))}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`CWA ${r.status}`)
  const j: any = await r.json()
  const locs: any[] = j?.records?.locations?.[0]?.location || j?.records?.Locations?.[0]?.Location || j?.records?.location || []
  const out: Daily[] = []
  for (const loc of locs) {
    const region = loc.locationName || loc.LocationName
    const els = loc.weatherElement || loc.WeatherElement || []
    const byDate: Record<string, Daily> = {}
    const put = (d: string) => (byDate[d] ||= { region, date: d, t_min: null, t_max: null, pop: null, wx: null })
    for (const t of timesOf(pickElement(els, 'MinT', '最低溫'))) { const d = dateOf(t); const v = Number(valueOf(t)); if (d && Number.isFinite(v)) { const x = put(d); x.t_min = x.t_min == null ? v : Math.min(x.t_min, v) } }
    for (const t of timesOf(pickElement(els, 'MaxT', '最高溫'))) { const d = dateOf(t); const v = Number(valueOf(t)); if (d && Number.isFinite(v)) { const x = put(d); x.t_max = x.t_max == null ? v : Math.max(x.t_max, v) } }
    for (const t of timesOf(pickElement(els, 'PoP12h', 'PoP', '降雨機率'))) { const d = dateOf(t); const v = Number(valueOf(t)); if (d && Number.isFinite(v)) { const x = put(d); x.pop = x.pop == null ? v : Math.max(x.pop, v) } }
    for (const t of timesOf(pickElement(els, 'Wx', '天氣現象'))) { const d = dateOf(t); const v = valueOf(t); if (d && v) { const x = put(d); x.wx ||= v } }
    out.push(...Object.values(byDate))
  }
  return out
}

export async function runWeather(env: Env) {
  const get = await loadSettings(env, DEFAULTS)
  const regions: string[] = Array.isArray(get('weather.regions')) ? get('weather.regions') : DEFAULTS['weather.regions']
  try {
    const rows = await fetchWeather(env, regions)
    await upsert(env, 'weather_daily', rows)
    await logSync(env, 'weather', rows.length, true)
    await evaluateRules(env, get, rows)
  } catch (e: any) {
    await logSync(env, 'weather', 0, false, String(e?.message || e))
    throw e
  }
}

async function evaluateRules(env: Env, get: (k: string) => any, rows: Daily[]) {
  const today = new Date().toISOString().slice(0, 10)
  const next3 = rows.filter(r => r.date >= today && r.date <= addDays(today, 3))
  const coldMin = Number(get('weather.cold_min_temp')), drop = Number(get('weather.cold_drop'))
  const rainPop = Number(get('weather.rain_pop')), rainMax = Number(get('weather.rain_max_temp'))
  const alerts: any[] = []
  for (const region of new Set(rows.map(r => r.region))) {
    const n3 = next3.filter(r => r.region === region)
    if (!n3.length) continue
    const minT = Math.min(...n3.map(r => r.t_min ?? 99))
    // 前 3 天的實況用資料庫既有預報代替（簡化）
    const prev = await select<Daily>(env, 'weather_daily', `select=t_min&region=eq.${encodeURIComponent(region)}&date=gte.${addDays(today, -3)}&date=lt.${today}`)
    const prevMin = prev.length ? Math.min(...prev.map(r => r.t_min ?? 99)) : null
    if (minT <= coldMin || (prevMin != null && prevMin - minT >= drop)) {
      alerts.push({ rule: 'weather.cold', level: 'info', message: `${region} 未來 3 天最低溫 ${minT}°C，符合降溫規則：建議出「足好暖湯浴包＋感溫足浴袋」企劃卡`, data: { region, minT, prevMin } })
    }
    const wet = n3.length >= 3 && n3.every(r => (r.pop ?? 0) >= rainPop && (r.t_max ?? 99) <= rainMax)
    if (wet) alerts.push({ rule: 'weather.wet', level: 'info', message: `${region} 連續 3 天濕冷（降雨機率 ≥ ${rainPop}%、最高溫 ≤ ${rainMax}°C）：建議推足好輕湯浴包、淨境噴霧`, data: { region } })
  }
  // 同一規則同一區域當天只發一次
  const existing = await select<{ rule: string; data: any }>(env, 'marketing_alerts', `select=rule,data&created_at=gte.${today}T00:00:00`)
  const fresh = alerts.filter(a => !existing.some(e => e.rule === a.rule && e.data?.region === a.data.region))
  if (fresh.length) {
    await insert(env, 'marketing_alerts', fresh)
    await linePush(env, `🌧️ 天氣觸發\n` + fresh.map(a => `・${a.message}`).join('\n'))
  }
}

function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

/**
 * MarketingHub — 行銷作戰室（好漢草）
 * ─────────────────────────────────────────────────────────────────────────────
 * 四個分頁：總覽（提示卡＋KPI＋預算進度）、行事曆（節氣／民俗／電商／送禮）、
 * 企劃卡（AI 生成 → 合規標紅 → 核准／退回 → 匯出上線文字）、設定中心（所有參數在這裡改）。
 * 設計規則見 docs/數位行銷頁面介面設計.md：字大、對比高、可點區 ≥ 56px、顏色＝分類、手機一欄／桌機三欄。
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase, supabaseReady } from '../../config/supabase'
import { useMarketingSettings } from '../../hooks/useMarketingSettings'
import { parseProductPool, asList } from '../../config/marketingDefaults'
import { buildCalendarRange, upcomingEvents, eventsByDate, KINDS, TIERS, todayISO, addDays } from '../../utils/marketingCalendar'
import { generateBriefDraft, regenerateBriefDraft, briefToEditorText } from '../../utils/marketingAI'
import { getStoredApiKey, setStoredApiKey } from '../../utils/ai'

// ─── 小元件 ──────────────────────────────────────────────────────────────────
const CARD = 'bg-white dark:bg-gray-800 rounded-2xl border-2 border-[var(--line-strong)] dark:border-gray-700 p-4'
const BTN = 'min-h-[56px] px-5 rounded-2xl font-bold text-lg border-2 border-gray-900 dark:border-gray-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_PRIMARY = 'min-h-[56px] px-5 rounded-2xl font-bold text-lg text-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
const fmt = n => n == null ? '—' : Math.round(n).toLocaleString()
const fmtW = n => n == null ? '—' : Math.abs(n) >= 1e4 ? (n / 1e4).toFixed(1) + ' 萬' : Math.round(n).toLocaleString()
const STATUS = {
  draft:    { label: '草稿',   cls: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100' },
  approved: { label: '已核准', cls: 'bg-[var(--mint-100)] text-[#0b5536]' },
  live:     { label: '已上線', cls: 'bg-[var(--sky-100)] text-[#0b6ea3]' },
  done:     { label: '已結束', cls: 'bg-[var(--lilac-100)] text-[#5a3fb0]' },
  rejected: { label: '退回',   cls: 'bg-[var(--coral-100)] text-[#9b1c1c]' },
}

function Chip({ kind, children, className = '' }) {
  const k = KINDS[kind] || KINDS.custom
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-bold whitespace-nowrap ${className}`} style={{ background: k.bg, color: k.color }}>
    <span className="w-2.5 h-2.5 rounded-full" style={{ background: k.dot }} />{children}
  </span>
}
function Kpi({ label, value, sub, color = 'var(--mint-500)', onClick }) {
  return <button type="button" onClick={onClick} className={`${CARD} text-left w-full relative overflow-hidden`} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    <span className="absolute left-0 top-0 bottom-0 w-2" style={{ background: color }} />
    <p className="text-base font-semibold text-gray-700 dark:text-gray-300 pl-2">{label}</p>
    <p className="text-3xl font-black mt-1 pl-2 tabular-nums">{value}</p>
    {sub && <p className="text-base font-semibold mt-1 pl-2 text-gray-700 dark:text-gray-300">{sub}</p>}
  </button>
}
function Seg({ options, value, onChange }) {
  return <div className="flex gap-1 p-1 rounded-2xl border-2 border-gray-900 dark:border-gray-200 bg-white dark:bg-gray-800 overflow-x-auto">
    {options.map(o => (
      <button key={o.id} type="button" onClick={() => onChange(o.id)}
        className={`flex-1 min-w-[88px] min-h-[52px] rounded-xl px-3 text-lg font-bold whitespace-nowrap ${value === o.id ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-900 dark:text-gray-100'}`}>
        {o.icon ? `${o.icon} ` : ''}{o.label}{o.badge ? <span className="ml-2 inline-block min-w-[26px] rounded-full bg-[var(--coral-500)] text-white text-sm px-1.5">{o.badge}</span> : null}
      </button>
    ))}
  </div>
}
function Highlight({ text, hits }) {
  if (!hits?.length) return <>{text}</>
  const parts = []; let i = 0
  for (const h of hits) {
    if (h.index > i) parts.push(text.slice(i, h.index))
    parts.push(<mark key={h.index} className="bg-[var(--coral-100)] text-[#9b1c1c] font-black rounded px-0.5" title={`${h.category}：${h.suggestion}`}>{h.word}</mark>)
    i = h.index + h.word.length
  }
  if (i < text.length) parts.push(text.slice(i))
  return <>{parts}</>
}

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export default function MarketingHub({ allRows = [], monthlyExpenses = {}, canManage = false, role = 'viewer', userEmail = '', fontScale }) {
  const ms = useMarketingSettings(userEmail)
  const { get } = ms
  const [view, setView] = useState(() => localStorage.getItem('mkt_view') || 'overview')
  useEffect(() => { localStorage.setItem('mkt_view', view) }, [view])

  const today = todayISO()
  const thisMonth = today.slice(0, 7)
  const brand = get('scope.brand')
  const official = get('scope.official_customer')

  // ── 品牌資料切片 ─────────────────────────────────────────────────────────
  const brandRows = useMemo(() => allRows.filter(r => r.brand === brand || (r.brand || '').includes(brand)), [allRows, brand])
  const monthly = useMemo(() => {
    const m = {}
    for (const r of brandRows) {
      const k = r.yearMonth; if (!k) continue
      const o = (m[k] ||= { ym: k, revenue: 0, official: 0, orders: new Set() })
      o.revenue += r.subtotal || 0
      if (r.customer === official) o.official += r.subtotal || 0
      if (r.orderId) o.orders.add(r.orderId)
    }
    return Object.values(m).map(o => ({ ...o, orders: o.orders.size })).sort((a, b) => a.ym.localeCompare(b.ym))
  }, [brandRows, official])
  const last12 = useMemo(() => monthly.filter(m => m.ym <= thisMonth).slice(-12), [monthly, thisMonth])
  const cur = useMemo(() => monthly.find(m => m.ym === thisMonth) || { revenue: 0, official: 0, orders: 0 }, [monthly, thisMonth])
  const outliers = new Set(asList(get('budget.outlier_months')))
  const avgMonthly = useMemo(() => {
    const xs = last12.filter(m => m.ym !== thisMonth && !outliers.has(m.ym))
    return xs.length ? xs.reduce((s, m) => s + m.revenue, 0) / xs.length : 0
  }, [last12, thisMonth, outliers])

  const adLabels = asList(get('budget.google_expense_labels'))
  const adSpend = useMemo(() => (monthlyExpenses[thisMonth] || [])
    .filter(it => ['廣告費用', '行銷'].includes(it.category) && adLabels.some(l => (it.label || '').includes(l)))
    .reduce((s, it) => s + (Number(it.amount) || 0), 0), [monthlyExpenses, thisMonth, adLabels])
  const cap = Number(get('budget.google_monthly_cap')) || 0
  const rate = cur.revenue > 0 ? adSpend / cur.revenue : 0
  const rateColor = rate * 100 > Number(get('rate.red')) ? 'var(--coral-500)' : rate * 100 > Number(get('rate.yellow')) ? 'var(--peach-500)' : 'var(--mint-500)'

  // ── 品項池統計（近 90 天）────────────────────────────────────────────────
  const pool = useMemo(() => parseProductPool(get('scope.products')), [get])
  const poolStats = useMemo(() => {
    const from = addDays(today, -90)
    return pool.map(p => {
      const rows = brandRows.filter(r => r.date >= from && (r.product || '').includes(p.keyword))
      const qty = rows.reduce((s, r) => s + (r.quantity || 0), 0)
      const rev = rows.reduce((s, r) => s + (r.subtotal || 0), 0)
      return { ...p, qty, revenue: rev, price: qty ? rev / qty : 0 }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [pool, brandRows, today])

  // ── 行事曆 ───────────────────────────────────────────────────────────────
  const year = Number(today.slice(0, 4))
  const events = useMemo(() => buildCalendarRange(year - 1, year + 1, get), [year, get])
  const upcoming = useMemo(() => upcomingEvents(events, today, 60), [events, today])

  // ── 雲端表：企劃卡、警示、同步、天氣 ──────────────────────────────────────
  const [briefs, setBriefs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [syncLog, setSyncLog] = useState([])
  const [weather, setWeather] = useState([])
  const loadCloud = useCallback(async () => {
    if (!supabaseReady) { try { setBriefs(JSON.parse(localStorage.getItem('mkt_briefs') || '[]')) } catch {} ; return }
    const [b, a, s, w] = await Promise.all([
      supabase.from('marketing_briefs').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('marketing_alerts').select('*').is('acked_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('google_sync_log').select('*').order('run_at', { ascending: false }).limit(20),
      supabase.from('weather_daily').select('*').gte('date', today).lte('date', addDays(today, 3)).order('date'),
    ])
    if (!b.error) setBriefs(b.data || [])
    if (!a.error) setAlerts(a.data || [])
    if (!s.error) setSyncLog(s.data || [])
    if (!w.error) setWeather(w.data || [])
  }, [today])
  useEffect(() => { loadCloud() }, [loadCloud])

  const persistBrief = useCallback(async (row) => {
    if (!supabaseReady) {
      const list = briefs.filter(b => b.id !== row.id); const next = [row, ...list]
      setBriefs(next); localStorage.setItem('mkt_briefs', JSON.stringify(next)); return row
    }
    const { data, error } = await supabase.from('marketing_briefs').upsert(row, { onConflict: 'id' }).select().single()
    if (error) throw new Error(error.message)
    setBriefs(list => [data, ...list.filter(b => b.id !== data.id)])
    return data
  }, [briefs])

  const ackAlert = useCallback(async (id) => {
    setAlerts(a => a.filter(x => x.id !== id))
    if (supabaseReady) await supabase.from('marketing_alerts').update({ acked_at: new Date().toISOString(), acked_by: userEmail }).eq('id', id)
  }, [userEmail])

  const pendingCount = briefs.filter(b => b.status === 'draft').length
  const views = [
    { id: 'overview', label: '總覽', icon: '🧭' },
    { id: 'calendar', label: '行事曆', icon: '📅' },
    { id: 'briefs',   label: '企劃卡', icon: '✍️', badge: pendingCount || null },
    { id: 'settings', label: '設定', icon: '⚙️' },
  ]

  const ctx = { get, pool: poolStats, events, upcoming, brand, cur, avgMonthly, adSpend, cap, rate, rateColor, last12, thisMonth, briefs, alerts, syncLog, weather, canManage, role, userEmail, persistBrief, ackAlert, fontScale, ms, today }

  return (
    <div className="space-y-3" data-pdf-section data-pdf-title="行銷作戰室">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0"><Seg options={views} value={view} onChange={setView} /></div>
        {fontScale && (
          <button type="button" onClick={fontScale.bump} aria-label="切換字級" title={`字級 ${fontScale.scale}px，點一下放大`}
            className="shrink-0 w-14 h-14 rounded-2xl border-2 border-gray-900 dark:border-gray-200 bg-white dark:bg-gray-800 font-black text-xl">A+</button>
        )}
      </div>
      {ms.error && <p className="text-base font-bold text-[#9b1c1c] bg-[var(--coral-100)] rounded-xl px-3 py-2">設定讀取失敗：{ms.error}（尚未建立資料表？請先執行 migration）</p>}
      {view === 'overview' && <Overview {...ctx} onGo={setView} />}
      {view === 'calendar' && <CalendarView {...ctx} />}
      {view === 'briefs'   && <Briefs {...ctx} />}
      {view === 'settings' && <Settings {...ctx} />}
    </div>
  )
}

// ─── 總覽 ────────────────────────────────────────────────────────────────────
function Overview({ get, brand, cur, avgMonthly, adSpend, cap, rate, rateColor, last12, thisMonth, upcoming, alerts, syncLog, weather, poolStats, ackAlert, onGo, briefs }) {
  const pct = cap > 0 ? Math.min(100, adSpend / cap * 100) : 0
  const latestSync = useMemo(() => {
    const m = {}; for (const r of syncLog) if (!m[r.source]) m[r.source] = r; return Object.values(m)
  }, [syncLog])
  const regions = useMemo(() => {
    const m = {}; for (const w of weather) (m[w.region] ||= []).push(w); return m
  }, [weather])
  const coldMin = Number(get('weather.cold_min_temp'))

  return <div className="space-y-3">
    {/* 本週提示 */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {upcoming.slice(0, 3).map(e => (
        <div key={e.id} className={CARD} style={{ borderColor: KINDS[e.kind].dot }}>
          <div className="flex items-center justify-between gap-2"><Chip kind={e.kind}>{KINDS[e.kind].label}</Chip><span className="text-base font-bold text-gray-700 dark:text-gray-300">{e.date.slice(5).replace('-', '/')}</span></div>
          <p className="text-2xl font-black mt-2">{e.name} <span className="text-lg font-bold text-gray-700 dark:text-gray-300">{e.days_to <= 0 ? '進行中' : `還有 ${e.days_to} 天`}</span></p>
          <p className="text-base font-semibold mt-1">{e.in_lead ? '✅ 已進入提前期，該出企劃卡了' : `提前 ${e.lead_days} 天開始`}｜主推：{e.product_tags.join('、') || '—'}</p>
        </div>
      ))}
      {!upcoming.length && <div className={CARD}><p className="text-lg font-bold">60 天內沒有重點檔期</p></div>}
    </div>

    {/* 天氣 */}
    <div className={CARD} style={{ borderColor: KINDS.weather.dot }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Chip kind="weather">天氣觸發</Chip>
        <span className="text-base font-semibold text-gray-700 dark:text-gray-300">降溫規則：未來 3 天最低溫 ≤ {coldMin}°C 推足好暖湯浴包</span>
      </div>
      {Object.keys(regions).length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
          {Object.entries(regions).map(([r, days]) => {
            const min = Math.min(...days.map(d => Number(d.t_min))); const hit = min <= coldMin
            return <div key={r} className="rounded-xl p-3 border-2" style={{ borderColor: hit ? KINDS.weather.dot : 'var(--line)', background: hit ? KINDS.weather.bg : 'transparent' }}>
              <p className="text-lg font-black">{r} {hit ? '🔥 觸發' : ''}</p>
              <p className="text-base font-semibold">{days.map(d => `${d.date.slice(5)} ${d.t_min}~${d.t_max}° ${d.pop ?? ''}%`).join('｜')}</p>
            </div>
          })}
        </div>
      ) : <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">尚無氣象資料：部署 workers/google-sync 後每天 05:00 自動寫入。</p>}
    </div>

    {/* KPI */}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Kpi label={`${brand} 本月營收（全通路）`} value={'NT$ ' + fmtW(cur.revenue)} sub={avgMonthly ? `月均 ${fmtW(avgMonthly)}` : ''} />
      <Kpi label="本月官網營收" value={'NT$ ' + fmtW(cur.official)} sub={cur.revenue ? `佔 ${(cur.official / cur.revenue * 100).toFixed(1)}%` : ''} color="var(--sky-500)" />
      <Kpi label="本月 Google 廣告花費" value={'NT$ ' + fmt(adSpend)} sub={`費率 ${(rate * 100).toFixed(1)}%`} color={rateColor} />
      <Kpi label="待核准企劃卡" value={briefs.filter(b => b.status === 'draft').length} sub={alerts.length ? `${alerts.length} 則警示` : '無警示'} color={alerts.length ? 'var(--coral-500)' : 'var(--lilac-500)'} onClick={() => onGo('briefs')} />
    </div>

    {/* 預算進度 */}
    <div className={CARD}>
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <p className="text-lg font-black">本月 Google 預算進度</p>
        <p className="text-base font-bold text-gray-700 dark:text-gray-300">{fmt(adSpend)} / {fmt(cap)} 元（{pct.toFixed(0)}%）</p>
      </div>
      <div className="h-5 rounded-full mt-2 overflow-hidden bg-[var(--bg-muted)] dark:bg-gray-700">
        <div className="h-full rounded-full" style={{ width: pct + '%', background: rateColor }} />
      </div>
      <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">黃燈 {get('rate.yellow')}%、紅燈 {get('rate.red')}%；上限與門檻在「設定」改。</p>
    </div>

    {/* 12 個月營收 */}
    <div className={CARD}>
      <p className="text-lg font-black">{brand} 近 12 個月營收（萬元）</p>
      <div className="h-56 mt-2">
        <ResponsiveContainer>
          <BarChart data={last12.map(m => ({ ...m, w: Math.round(m.revenue / 1000) / 10 }))} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="ym" tickFormatter={v => v.slice(2).replace('-', '/')} interval={0} />
            <YAxis />
            <Tooltip formatter={v => [v + ' 萬', '營收']} />
            <Bar dataKey="w" radius={[4, 4, 0, 0]}>
              {last12.map(m => <Cell key={m.ym} fill={m.ym === thisMonth ? '#0b5536' : '#10744a'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* 品項池 */}
    <div className={CARD}>
      <p className="text-lg font-black">品項池（近 90 天）</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-2">
        {poolStats.map(p => (
          <div key={p.category} className="rounded-xl border-2 border-[var(--line)] p-3 flex items-center justify-between gap-2">
            <div><p className="text-lg font-black">{p.category}</p><p className="text-base font-semibold text-gray-700 dark:text-gray-300">{fmt(p.qty)} 件｜均價 {fmt(p.price)}</p></div>
            <p className="text-xl font-black tabular-nums">{fmtW(p.revenue)}</p>
          </div>
        ))}
      </div>
    </div>

    {/* 警示與同步 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className={CARD}>
        <p className="text-lg font-black">警示（{alerts.length}）</p>
        {alerts.length ? alerts.slice(0, 6).map(a => (
          <div key={a.id} className="flex items-start justify-between gap-2 py-2 border-t-2 border-[var(--line)] first:border-t-0">
            <p className="text-base font-semibold"><span className={`mr-2 ${a.level === 'critical' ? 'text-[#9b1c1c]' : 'text-[#8a4b00]'}`}>●</span>{a.message}</p>
            <button type="button" className="min-h-[44px] px-3 rounded-xl border-2 border-gray-900 dark:border-gray-200 font-bold" onClick={() => ackAlert(a.id)}>已讀</button>
          </div>
        )) : <p className="text-base font-semibold mt-1 text-gray-700 dark:text-gray-300">目前沒有警示</p>}
      </div>
      <div className={CARD}>
        <p className="text-lg font-black">資料同步狀態</p>
        {latestSync.length ? latestSync.map(s => (
          <p key={s.source} className="text-base font-semibold py-1">{s.ok ? '✅' : '❌'} {s.source}：{new Date(s.run_at).toLocaleString('zh-TW', { hour12: false })}｜{s.rows ?? 0} 筆{s.error ? `｜${s.error}` : ''}</p>
        )) : <p className="text-base font-semibold mt-1 text-gray-700 dark:text-gray-300">Google Ads／GA4／GSC 同步尚未啟用（見 docs/Google廣告_GA_GSC串接規劃.md）。</p>}
      </div>
    </div>
  </div>
}

// ─── 行事曆 ──────────────────────────────────────────────────────────────────
function CalendarView({ events, today }) {
  const [ym, setYm] = useState(today.slice(0, 7))
  const [sel, setSel] = useState(today)
  const byDate = useMemo(() => eventsByDate(events), [events])
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)]
  const move = n => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const monthEvents = events.filter(e => e.date.startsWith(ym) || e.end_date.startsWith(ym))
  const selEvents = byDate[sel] || []

  return <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
    <div className={`${CARD} xl:col-span-2`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={BTN} onClick={() => move(-1)} aria-label="上個月">‹</button>
        <p className="text-2xl font-black">{y} 年 {m} 月</p>
        <button type="button" className={BTN} onClick={() => move(1)} aria-label="下個月">›</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">{Object.entries(KINDS).filter(([k]) => k !== 'custom' || events.some(e => e.kind === 'custom')).map(([k, v]) => <Chip key={k} kind={k}>{v.label}</Chip>)}</div>
      <div className="grid grid-cols-7 gap-1 mt-3 text-center text-base font-bold text-gray-700 dark:text-gray-300">{['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1 mt-1">
        {cells.map((d, i) => d ? (
          <button key={d} type="button" onClick={() => setSel(d)}
            className={`min-h-[64px] md:min-h-[84px] rounded-xl border-2 p-1 text-left flex flex-col ${sel === d ? 'border-gray-900 dark:border-gray-100' : 'border-[var(--line)]'} ${d === today ? 'bg-[var(--mint-50)] dark:bg-gray-700' : ''}`}>
            <span className={`text-base font-black ${d === today ? 'text-[var(--mint-700)]' : ''}`}>{Number(d.slice(8))}</span>
            <span className="flex flex-wrap gap-1 mt-auto">{(byDate[d] || []).slice(0, 4).map(e => <span key={e.id} className="w-3 h-3 rounded-full" style={{ background: KINDS[e.kind].dot }} title={e.name} />)}</span>
            <span className="hidden md:block text-sm font-bold truncate">{(byDate[d] || []).filter(e => e.date === d).map(e => e.name).join('、')}</span>
          </button>
        ) : <div key={'e' + i} />)}
      </div>
    </div>
    <div className="space-y-3">
      <div className={CARD}>
        <p className="text-lg font-black">{sel.replace(/-/g, '/')}</p>
        {selEvents.length ? selEvents.map(e => (
          <div key={e.id} className="py-2 border-t-2 border-[var(--line)] first:border-t-0">
            <div className="flex items-center gap-2 flex-wrap"><Chip kind={e.kind}>{e.name}</Chip><span className="text-base font-bold">{TIERS[e.tier]?.label}</span></div>
            <p className="text-base font-semibold mt-1">提前 {e.lead_days} 天｜倍率 {e.multiplier}×｜{e.product_tags.join('、') || '不觸發生成'}</p>
          </div>
        )) : <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-1">這天沒有檔期</p>}
      </div>
      <div className={CARD}>
        <p className="text-lg font-black">本月檔期（{monthEvents.length}）</p>
        {monthEvents.map(e => (
          <button key={e.id} type="button" onClick={() => setSel(e.date)} className="w-full text-left flex items-center justify-between gap-2 py-2 border-t-2 border-[var(--line)] first:border-t-0 min-h-[52px]">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: KINDS[e.kind].dot }} /><span className="text-base font-bold">{e.name}</span></span>
            <span className="text-base font-semibold text-gray-700 dark:text-gray-300">{e.date.slice(5).replace('-', '/')}{e.end_date !== e.date ? `～${e.end_date.slice(5).replace('-', '/')}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
}

// ─── 企劃卡 ──────────────────────────────────────────────────────────────────
function Briefs({ get, upcoming, events, poolStats, briefs, persistBrief, canManage, userEmail, cur, avgMonthly, today }) {
  const [open, setOpen] = useState(null)          // 正在看的企劃卡
  const [creating, setCreating] = useState(false)
  const [eventId, setEventId] = useState(upcoming[0]?.id || '')
  const [cats, setCats] = useState(() => new Set(upcoming[0]?.product_tags?.map(t => t.split('-')[0]) || []))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [apiKey, setApiKey] = useState(getStoredApiKey())
  const [feedback, setFeedback] = useState('')
  const hardBlock = !!get('gen.compliance_hard_block')

  const candidates = useMemo(() => {
    const ids = new Set(upcoming.map(e => e.id))
    const future = events.filter(e => e.focus && e.date >= today && !ids.has(e.id)).slice(0, 12)
    return [...upcoming, ...future]
  }, [upcoming, events, today])
  const ev = candidates.find(e => e.id === eventId) || null

  const buildCtx = (event) => ({
    get, event,
    trigger: event ? `${KINDS[event.kind]?.label}：${event.name}` : '手動',
    period: event ? { start: addDays(event.date, -event.lead_days), end: event.end_date } : { start: today, end: addDays(today, 14) },
    products: poolStats.filter(p => cats.has(p.category)).map(p => ({ name: p.category, price: Math.round(p.price), note: note || undefined })),
    keywords: asList(get('keywords.core')),
    winningTitles: [],
    stats: { 本月營收: Math.round(cur.revenue), 月均營收: Math.round(avgMonthly) },
  })

  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const { draft, flags } = await generateBriefDraft(buildCtx(ev))
      const row = {
        id: crypto.randomUUID(), event_id: ev?.id || null, event_name: ev?.name || '手動企劃', trigger: ev ? KINDS[ev.kind]?.label : '手動',
        period_start: ev ? addDays(ev.date, -ev.lead_days) : today, period_end: ev ? ev.end_date : addDays(today, 14),
        products: [...cats], draft, flags, status: 'draft', created_by: userEmail || null, created_at: new Date().toISOString(),
      }
      const saved = await persistBrief(row)
      setOpen(saved); setCreating(false)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const regen = async () => {
    if (!open) return
    setBusy(true); setErr(null)
    try {
      const event = events.find(e => e.id === open.event_id) || null
      const { draft, flags } = await regenerateBriefDraft(buildCtx(event), open.draft, feedback)
      const saved = await persistBrief({ ...open, draft, flags, status: 'draft', feedback })
      setOpen(saved); setFeedback('')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const setStatus = async (status) => {
    if (!open) return
    const patch = { ...open, status }
    if (status === 'approved') { patch.approved_by = userEmail || null; patch.approved_at = new Date().toISOString() }
    const saved = await persistBrief(patch); setOpen(saved)
  }
  const copyText = async () => { try { await navigator.clipboard.writeText(briefToEditorText(open)); alert('已複製，可貼到 Google Ads Editor 或記事本') } catch { alert('複製失敗，請手動選取') } }

  const flagsByPath = useMemo(() => Object.fromEntries((open?.flags || []).map(f => [f.path, f.hits])), [open])
  const blocked = hardBlock && (open?.flags?.length > 0)

  // ── 畫面 ──
  if (open) {
    const d = open.draft || {}
    const Sec = ({ title, children }) => <div className={CARD}><p className="text-lg font-black mb-2">{title}</p>{children}</div>
    const Line = ({ path, text, i }) => <p className="text-lg py-1.5 border-t-2 border-[var(--line)] first:border-t-0"><span className="text-gray-700 dark:text-gray-300 font-bold mr-2">{i != null ? i + 1 + '.' : ''}</span><Highlight text={text} hits={flagsByPath[path]} /></p>
    return <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className={BTN} onClick={() => setOpen(null)}>‹ 返回清單</button>
        <span className={`rounded-full px-3 py-1.5 text-base font-black ${STATUS[open.status]?.cls}`}>{STATUS[open.status]?.label}</span>
        <p className="text-2xl font-black">{d.campaign_name || open.event_name}</p>
      </div>
      <div className={CARD} style={{ borderColor: open.flags?.length ? 'var(--coral-500)' : 'var(--mint-500)' }}>
        <p className="text-lg font-black">{open.flags?.length ? `🔴 合規前置檢查：${open.flags.length} 處需改（紅字）` : '🟢 合規前置檢查通過（仍建議人工覆核）'}</p>
        <p className="text-base font-semibold mt-1">{open.event_name}｜{open.period_start}～{open.period_end}｜品項：{(open.products || []).join('、')}</p>
        {d.angle && <p className="text-lg font-bold mt-1">切角：{d.angle}</p>}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Sec title="受眾">{(d.audiences || []).map((a, i) => <div key={i} className="py-1.5 border-t-2 border-[var(--line)] first:border-t-0"><p className="text-lg font-black">{a.name}</p><p className="text-base font-semibold">{a.who}｜在意：{a.pain}｜切角：<Highlight text={a.hook || ''} hits={flagsByPath[`audiences[${i}].hook`]} /></p></div>)}</Sec>
        <Sec title={`Google 標題（${(d.rsa_headlines || []).length}）`}>{(d.rsa_headlines || []).map((t, i) => <Line key={i} i={i} path={`rsa_headlines[${i}]`} text={t} />)}</Sec>
        <Sec title="Google 描述">{(d.rsa_descriptions || []).map((t, i) => <Line key={i} i={i} path={`rsa_descriptions[${i}]`} text={t} />)}</Sec>
        <Sec title="社群三版">{['fb', 'ig', 'threads'].map(k => <div key={k} className="py-1.5 border-t-2 border-[var(--line)] first:border-t-0"><p className="text-base font-black uppercase">{k}</p><p className="text-lg whitespace-pre-line"><Highlight text={d.social?.[k] || ''} hits={flagsByPath[`social.${k}`]} /></p></div>)}</Sec>
        <Sec title="EDM 主旨與 LINE">{(d.edm_subjects || []).map((t, i) => <Line key={i} i={i} path={`edm_subjects[${i}]`} text={t} />)}<p className="text-base font-black mt-2">LINE 推播</p><p className="text-lg"><Highlight text={d.line_push || ''} hits={flagsByPath.line_push} /></p></Sec>
        <Sec title="關鍵字（功效字可留在這層）">
          {['exact', 'phrase', 'broad'].map(k => <p key={k} className="text-base py-1"><b className="mr-2">{{ exact: '完全', phrase: '詞組', broad: '廣泛' }[k]}</b>{(d.keywords?.[k] || []).join('、')}</p>)}
          <p className="text-base py-1"><b className="mr-2 text-[#9b1c1c]">否定</b>{(d.negatives || []).join('、')}</p>
        </Sec>
        <Sec title="設定建議"><pre className="text-base whitespace-pre-wrap font-sans">{JSON.stringify(d.settings || {}, null, 2)}</pre>{(d.compliance_self_check || []).length > 0 && <p className="text-base font-bold mt-2 text-[#8a4b00]">AI 自評疑慮：{d.compliance_self_check.join('；')}</p>}</Sec>
      </div>
      {err && <p className="text-base font-bold text-[#9b1c1c]">{err}</p>}
      {canManage && (
        <div className={`${CARD} sticky bottom-20 md:bottom-2 space-y-2`}>
          {open.status === 'draft' && <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="修改意見（可空白：預設把紅字全部改成合規情境句）" className="w-full text-lg rounded-xl border-2 border-[var(--line-strong)] p-3 bg-white dark:bg-gray-900" />}
          <div className="flex flex-wrap gap-2">
            {open.status === 'draft' && <button type="button" className={BTN} disabled={busy} onClick={regen}>{busy ? '重寫中…' : '退回重寫'}</button>}
            {open.status === 'draft' && <button type="button" className={BTN_PRIMARY} style={{ background: blocked ? '#8d968f' : 'var(--mint-600)' }} disabled={busy || blocked} title={blocked ? '合規未過，不能核准' : ''} onClick={() => setStatus('approved')}>核准</button>}
            {open.status === 'approved' && <button type="button" className={BTN_PRIMARY} style={{ background: '#0b6ea3' }} onClick={() => setStatus('live')}>標記已上線</button>}
            {open.status === 'live' && <button type="button" className={BTN} onClick={() => setStatus('done')}>結束檔期</button>}
            {open.status !== 'rejected' && open.status !== 'done' && <button type="button" className={BTN} onClick={() => setStatus('rejected')}>作廢</button>}
            <button type="button" className={BTN} onClick={copyText}>複製上線文字</button>
          </div>
          {blocked && <p className="text-base font-bold text-[#9b1c1c]">合規硬關卡：紅字沒改完不能核准（設定 → AI 生成 可調整，但好漢草建議維持）。</p>}
        </div>
      )}
    </div>
  }

  return <div className="space-y-3">
    {canManage && !creating && <button type="button" className={BTN_PRIMARY + ' w-full'} style={{ background: 'var(--mint-600)' }} onClick={() => setCreating(true)}>＋ 新企劃卡（AI 生成建議）</button>}
    {creating && (
      <div className={CARD} style={{ borderColor: 'var(--mint-500)' }}>
        <p className="text-xl font-black">新企劃卡</p>
        {!apiKey && (
          <div className="mt-2 rounded-xl p-3 bg-[var(--peach-100)]">
            <p className="text-base font-bold text-[#8a4b00]">需要 Google AI Studio 金鑰（與「AI 分析」分頁共用，只存在這台裝置）</p>
            <div className="flex gap-2 mt-2"><input type="password" placeholder="貼上金鑰" className="flex-1 min-h-[52px] rounded-xl border-2 border-[var(--line-strong)] px-3 text-lg bg-white dark:bg-gray-900" onChange={e => setApiKey(e.target.value)} /><button type="button" className={BTN} onClick={() => { setStoredApiKey(apiKey); setApiKey(getStoredApiKey()) }}>儲存</button></div>
          </div>
        )}
        <label className="block text-lg font-bold mt-3">檔期</label>
        <select value={eventId} onChange={e => { setEventId(e.target.value); const x = candidates.find(c => c.id === e.target.value); if (x) setCats(new Set(x.product_tags.map(t => t.split('-')[0]))) }} className="w-full min-h-[56px] rounded-xl border-2 border-[var(--line-strong)] px-3 text-lg bg-white dark:bg-gray-900">
          <option value="">手動（不綁檔期）</option>
          {candidates.map(e => <option key={e.id} value={e.id}>{e.date.slice(5).replace('-', '/')} {e.name}（{KINDS[e.kind].label}{e.days_to != null ? `，${e.days_to <= 0 ? '進行中' : e.days_to + ' 天後'}` : ''}）</option>)}
        </select>
        <p className="text-lg font-bold mt-3">主推品項（可多選）</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {poolStats.map(p => { const on = cats.has(p.category); return <button key={p.category} type="button" onClick={() => setCats(s => { const n = new Set(s); on ? n.delete(p.category) : n.add(p.category); return n })}
            className={`min-h-[52px] px-4 rounded-full text-lg font-bold border-2 ${on ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)]'}`}>{p.category}</button> })}
        </div>
        <label className="block text-lg font-bold mt-3">補充（選填：促銷方式、特別想講的事）</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full text-lg rounded-xl border-2 border-[var(--line-strong)] p-3 bg-white dark:bg-gray-900" />
        {err && <p className="text-base font-bold text-[#9b1c1c] mt-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <button type="button" className={BTN_PRIMARY + ' flex-1'} style={{ background: 'var(--mint-600)' }} disabled={busy || !apiKey} onClick={run}>{busy ? 'AI 生成中（約 20 秒）…' : '生成企劃卡'}</button>
          <button type="button" className={BTN} disabled={busy} onClick={() => setCreating(false)}>取消</button>
        </div>
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {briefs.map(b => (
        <button key={b.id} type="button" onClick={() => setOpen(b)} className={`${CARD} text-left`} style={{ borderColor: b.flags?.length ? 'var(--coral-500)' : (b.status === 'approved' || b.status === 'live') ? 'var(--mint-500)' : 'var(--line-strong)' }}>
          <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-3 py-1 text-base font-black ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span><span className="text-base font-bold text-gray-700 dark:text-gray-300">{(b.created_at || '').slice(5, 10).replace('-', '/')}</span></div>
          <p className="text-xl font-black mt-2">{b.draft?.campaign_name || b.event_name}</p>
          <p className="text-base font-semibold mt-1">{b.period_start}～{b.period_end}｜{(b.products || []).join('、')}</p>
          <p className="text-base font-bold mt-1" style={{ color: b.flags?.length ? '#9b1c1c' : '#0b5536' }}>{b.flags?.length ? `${b.flags.length} 處合規待改` : '合規通過'}</p>
        </button>
      ))}
      {!briefs.length && !creating && <div className={CARD}><p className="text-lg font-bold">還沒有企劃卡。按上方按鈕，選一個檔期讓 AI 先出草稿。</p></div>}
    </div>
  </div>
}

// ─── 設定中心 ────────────────────────────────────────────────────────────────
function Settings({ ms, role, canManage, fontScale }) {
  const { defs, groups, get, save, reset, isOverridden, meta, exportJSON, importJSON } = ms
  const [g, setG] = useState(groups[0].id)
  const [dirty, setDirty] = useState({})     // key → 編輯中的值
  const [saving, setSaving] = useState(null)
  const fields = defs.filter(d => d.group === g)
  const canEdit = d => canManage && (d.role !== 'admin' || role === 'admin')

  const toInput = (d, v) => d.type === 'list' ? asList(v).join('\n') : d.type === 'json' ? JSON.stringify(v ?? null, null, 2) : v ?? ''
  const fromInput = (d, s) => {
    if (d.type === 'list') return asList(s)
    if (d.type === 'json') return JSON.parse(s)
    if (['number', 'percent', 'days'].includes(d.type)) { const n = Number(s); return Number.isFinite(n) ? n : d.default }
    return s
  }
  const commit = async (d) => {
    if (!(d.key in dirty)) return
    setSaving(d.key)
    try { await save(d.key, fromInput(d, dirty[d.key])); setDirty(x => { const n = { ...x }; delete n[d.key]; return n }) }
    catch (e) { alert('儲存失敗：' + e.message) } finally { setSaving(null) }
  }
  const commitAll = async () => { for (const d of fields) await commit(d) }

  return <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
    <div className="xl:col-span-1 flex xl:flex-col gap-2 overflow-x-auto pb-1">
      {groups.map(gr => <button key={gr.id} type="button" onClick={() => setG(gr.id)}
        className={`shrink-0 min-h-[56px] px-4 rounded-2xl border-2 text-lg font-bold text-left whitespace-nowrap ${g === gr.id ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)] bg-white dark:bg-gray-800'}`}>
        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ background: gr.color }} />{gr.icon} {gr.label}
      </button>)}
      <button type="button" onClick={() => setG('display')} className={`shrink-0 min-h-[56px] px-4 rounded-2xl border-2 text-lg font-bold text-left whitespace-nowrap ${g === 'display' ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)] bg-white dark:bg-gray-800'}`}>👓 顯示（本機）</button>
    </div>
    <div className="xl:col-span-3 space-y-3">
      {g === 'display' ? (
        <div className={CARD}>
          <p className="text-xl font-black">字體大小（只影響這台裝置）</p>
          <div className="flex flex-wrap gap-2 mt-2">{fontScale?.scales.map(s => <button key={s.value} type="button" onClick={() => fontScale.setScale(s.value)} className={`min-h-[56px] px-5 rounded-2xl border-2 font-bold ${fontScale.scale === s.value ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)]'}`} style={{ fontSize: s.value }}>{s.label}（{s.value}）</button>)}</div>
          <p className="text-xl font-black mt-4">高對比</p>
          <div className="flex gap-2 mt-2">{[[true, '開（深字、粗框）'], [false, '關']].map(([v, l]) => <button key={String(v)} type="button" onClick={() => fontScale?.setHighContrast(v)} className={`min-h-[56px] px-5 rounded-2xl border-2 text-lg font-bold ${fontScale?.highContrast === v ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)]'}`}>{l}</button>)}</div>
        </div>
      ) : (
        <>
          {fields.map(d => {
            const v = d.key in dirty ? dirty[d.key] : toInput(d, get(d.key))
            const editable = canEdit(d)
            const ov = isOverridden(d.key)
            const common = `w-full rounded-xl border-2 px-3 text-lg bg-white dark:bg-gray-900 ${editable ? 'border-[var(--line-strong)]' : 'border-[var(--line)] opacity-70'}`
            return <div key={d.key} className={CARD} style={{ borderColor: ov ? 'var(--sky-500)' : undefined }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div><p className="text-lg font-black">{d.label}{d.role === 'admin' && <span className="ml-2 text-base font-bold text-gray-700 dark:text-gray-300">🔒 管理員</span>}</p>{d.help && <p className="text-base font-semibold text-gray-700 dark:text-gray-300">{d.help}</p>}</div>
                {ov && <span className="text-base font-bold text-[#0b6ea3]">已自訂{meta[d.key]?.updated_by ? `・${meta[d.key].updated_by}` : ''}</span>}
              </div>
              <div className="flex items-stretch gap-2 mt-2 flex-wrap">
                {d.type === 'boolean' ? (
                  <div className="flex gap-2">{[[true, '開'], [false, '關']].map(([b, l]) => <button key={String(b)} type="button" disabled={!editable} onClick={() => setDirty(x => ({ ...x, [d.key]: b }))} className={`min-h-[56px] px-6 rounded-2xl border-2 text-lg font-bold ${(d.key in dirty ? dirty[d.key] : !!get(d.key)) === b ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)]'}`}>{l}</button>)}</div>
                ) : ['textarea', 'list', 'json'].includes(d.type) ? (
                  <textarea value={v} disabled={!editable} rows={Math.min(10, Math.max(3, String(v).split('\n').length + 1))} onChange={e => setDirty(x => ({ ...x, [d.key]: e.target.value }))} className={common + ' py-2 font-mono'} />
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <input type={['number', 'percent', 'days'].includes(d.type) ? 'number' : 'text'} step="any" min={d.min} max={d.max} value={v} disabled={!editable} onChange={e => setDirty(x => ({ ...x, [d.key]: e.target.value }))} className={common + ' min-h-[56px] flex-1'} />
                    {d.unit && <span className="text-lg font-bold">{d.unit}</span>}
                  </div>
                )}
                {editable && d.key in dirty && <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--mint-600)' }} disabled={saving === d.key} onClick={() => commit(d)}>{saving === d.key ? '儲存中' : '儲存'}</button>}
                {editable && ov && !(d.key in dirty) && <button type="button" className={BTN} onClick={() => reset(d.key)}>恢復預設</button>}
              </div>
            </div>
          })}
          {canManage && (
            <div className="flex flex-wrap gap-2 sticky bottom-20 md:bottom-2">
              {Object.keys(dirty).length > 0 && <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--mint-600)' }} onClick={commitAll}>全部儲存（{Object.keys(dirty).length}）</button>}
              <button type="button" className={BTN} onClick={() => { const blob = new Blob([exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `marketing-settings-${new Date().toISOString().slice(0, 10)}.json`; a.click() }}>匯出設定</button>
              <label className={BTN + ' inline-flex items-center cursor-pointer'}>匯入設定<input type="file" accept="application/json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await importJSON(await f.text()); alert('已匯入') } catch (x) { alert('匯入失敗：' + x.message) } }} /></label>
            </div>
          )}
        </>
      )}
    </div>
  </div>
}

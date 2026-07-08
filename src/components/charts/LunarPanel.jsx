import { useMemo, useState } from 'react'
import solarlunar from 'solarlunar'

/**
 * 農曆/節氣銷售視角 — 把西曆銷售資料對齊農曆與 24 節氣重新聚合
 * 三個視角：
 *   1) 農曆月份（正月～臘月，跨年度平均）— 看民俗週期
 *   2) 24 節氣期間（每節氣約 15 天）— 看季節性備貨節奏
 *   3) 民俗檔期卡（春節/媽祖生/端午/中元/中秋/冬至…）— 檔期 vs 平日 uplift 與主力商品
 */
const LUNAR_MONTHS = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','臘月']
const TERMS = ['小寒','大寒','立春','雨水','驚蟄','春分','清明','穀雨','立夏','小滿','芒種','夏至','小暑','大暑','立秋','處暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至']

// 民俗檔期（農曆），window = [起, 迄]（含），跨月以 {m,d} 表示
const FESTIVALS = [
  { id: 'cny',      name: '🧧 春節檔',   desc: '臘月15～正月15（含年前採買）', from: { m: 12, d: 15 }, to: { m: 1, d: 15 } },
  { id: 'mazu',     name: '🏮 媽祖生',   desc: '農曆3/1～3/23（進香/遶境季）', from: { m: 3, d: 1 },  to: { m: 3, d: 23 } },
  { id: 'dragon',   name: '🐉 端午檔',   desc: '農曆4/20～5/5',              from: { m: 4, d: 20 }, to: { m: 5, d: 5 } },
  { id: 'ghost',    name: '🕯️ 中元檔',   desc: '農曆7/1～7/15（普渡）',       from: { m: 7, d: 1 },  to: { m: 7, d: 15 } },
  { id: 'moon',     name: '🌕 中秋檔',   desc: '農曆8/1～8/15',              from: { m: 8, d: 1 },  to: { m: 8, d: 15 } },
  { id: 'winter',   name: '❄️ 冬至進補', desc: '節氣冬至期間（約15天）',       term: '冬至' },
  { id: 'qingming', name: '🌱 清明檔',   desc: '節氣清明期間（約15天）',       term: '清明' },
]

const fmtW = v => {
  if (v == null) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}

// 農曆日是否落在 [from, to] 檔期內（支援跨年，如 臘月→正月）
function inLunarWindow(lm, ld, from, to) {
  const v = lm * 100 + ld, f = from.m * 100 + from.d, t = to.m * 100 + to.d
  return f <= t ? v >= f && v <= t : v >= f || v <= t
}

export default function LunarPanel({ allRows = [] }) {
  const [view, setView] = useState('festival')   // festival | lunarMonth | term
  const [activeFest, setActiveFest] = useState('cny')

  // 每個「不重複日期」轉一次農曆＋節氣（約 3000 個日期，快取後 O(1) 查詢）
  const dateInfo = useMemo(() => {
    const distinct = [...new Set(allRows.map(r => r.date))].sort()
    const map = {}
    let currentTerm = null
    for (const d of distinct) {
      const [yy, mm, dd] = d.split('-').map(Number)
      let lunar
      try { lunar = solarlunar.solar2lunar(yy, mm, dd) } catch { continue }
      if (lunar?.term) currentTerm = lunar.term          // 節氣日 → 更新目前節氣期間
      map[d] = { lMonth: lunar.lMonth, lDay: lunar.lDay, term: currentTerm }
    }
    return map
  }, [allRows])

  const yearCount = useMemo(
    () => new Set(allRows.map(r => r.year)).size || 1, [allRows])

  // 視角 1：農曆月份（平均每年）
  const byLunarMonth = useMemo(() => {
    const sums = Array(12).fill(0)
    for (const r of allRows) {
      const info = dateInfo[r.date]
      if (info) sums[info.lMonth - 1] += r.subtotal || 0
    }
    return sums.map((s, i) => ({ label: LUNAR_MONTHS[i], avg: s / yearCount }))
  }, [allRows, dateInfo, yearCount])

  // 視角 2：節氣期間（平均每年）
  const byTerm = useMemo(() => {
    const sums = {}
    for (const r of allRows) {
      const t = dateInfo[r.date]?.term
      if (t) sums[t] = (sums[t] || 0) + (r.subtotal || 0)
    }
    return TERMS.map(t => ({ label: t, avg: (sums[t] || 0) / yearCount }))
  }, [allRows, dateInfo, yearCount])

  // 全年日均（uplift 基準）
  const dailyBaseline = useMemo(() => {
    const days = Object.keys(dateInfo).length || 1
    const total = allRows.reduce((s, r) => s + (r.subtotal || 0), 0)
    return total / days
  }, [allRows, dateInfo])

  // 視角 3：民俗檔期
  const festivals = useMemo(() => FESTIVALS.map(f => {
    let days = new Set(), rev = 0
    const prodMap = {}
    for (const r of allRows) {
      const info = dateInfo[r.date]
      if (!info) continue
      const hit = f.term ? info.term === f.term : inLunarWindow(info.lMonth, info.lDay, f.from, f.to)
      if (!hit) continue
      days.add(r.date)
      rev += r.subtotal || 0
      if (r.product) prodMap[r.product] = (prodMap[r.product] || 0) + (r.subtotal || 0)
    }
    const dayCount = days.size || 1
    const daily = rev / dayCount
    return {
      ...f,
      avgYearRev: rev / yearCount,
      uplift: dailyBaseline > 0 ? daily / dailyBaseline - 1 : null,
      topProducts: Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
    }
  }), [allRows, dateInfo, yearCount, dailyBaseline])

  if (!allRows.length) return <p className="text-gray-400 dark:text-gray-500 text-base py-8 text-center">暫無資料</p>

  const bars = view === 'lunarMonth' ? byLunarMonth : byTerm
  const maxAvg = Math.max(1, ...bars.map(b => b.avg))
  const fest = festivals.find(f => f.id === activeFest)

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🏮 農曆／節氣銷售視角</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {yearCount} 年資料對齊農曆重新聚合（平均每年）——民俗檔期抓備貨節奏，別人用西曆看不到的規律
            </p>
          </div>
          <div className="flex gap-1">
            {[['festival', '民俗檔期'], ['lunarMonth', '農曆月份'], ['term', '24節氣']].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  view === id
                    ? 'border-rose-400 bg-rose-50 text-rose-700 font-bold dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>{label}</button>
            ))}
          </div>
        </div>

        {/* 長條視角：農曆月 / 節氣 */}
        {view !== 'festival' && (
          <div className="mt-4 space-y-1.5">
            {bars.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-12 text-xs text-gray-500 dark:text-gray-400 text-right shrink-0">{b.label}</span>
                <div className="flex-1 h-5 bg-gray-50 dark:bg-gray-900/40 rounded-md overflow-hidden">
                  <div className="h-full rounded-md bg-gradient-to-r from-rose-300 to-rose-500 dark:from-rose-700 dark:to-rose-500"
                    style={{ width: `${(b.avg / maxAvg * 100).toFixed(1)}%` }} />
                </div>
                <span className="w-16 text-xs font-mono text-gray-600 dark:text-gray-300 shrink-0">{fmtW(b.avg)}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
              {view === 'lunarMonth'
                ? '💡 判讀：臘月/正月高 → 年節備貨要提前一個月；七月若低（民俗月效應）→ 檔期避開、改推居家淨化類'
                : '💡 判讀：節氣約 15 天一檔，冬至/立冬高 → 足浴/進補類提前備貨；清明前 → 淨身/平安類需求'}
            </p>
          </div>
        )}

        {/* 民俗檔期卡 */}
        {view === 'festival' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {festivals.map(f => (
                <button key={f.id} onClick={() => setActiveFest(f.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    activeFest === f.id
                      ? 'border-rose-400 bg-rose-50 dark:bg-rose-900/20 ring-2 ring-rose-300'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 hover:border-rose-200'
                  }`}>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{f.name}</p>
                  <p className="text-base font-black text-gray-800 dark:text-gray-100 mt-1 tabular-nums">{fmtW(f.avgYearRev)}<span className="text-xs font-normal text-gray-400"> /年</span></p>
                  <p className={`text-xs font-bold mt-0.5 ${f.uplift == null ? 'text-gray-400' : f.uplift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {f.uplift == null ? '—' : `日均 ${f.uplift >= 0 ? '+' : ''}${(f.uplift * 100).toFixed(0)}% vs 平日`}
                  </p>
                </button>
              ))}
            </div>

            {fest && (
              <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{fest.name}（{fest.desc}）主力商品 Top 8</p>
                <div className="mt-2 space-y-1">
                  {fest.topProducts.length ? fest.topProducts.map(([name, amt], i) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-xs text-gray-400 text-right">{i + 1}.</span>
                      <span className="flex-1 text-gray-700 dark:text-gray-200 truncate" title={name}>{name}</span>
                      <span className="font-mono text-gray-500 dark:text-gray-400 text-xs">{fmtW(amt)}</span>
                    </div>
                  )) : <p className="text-xs text-gray-400">此檔期無銷售資料</p>}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  💡 用法：檔期 uplift 為正的品項提前 30～45 天備貨與鋪貨；好漢草平安包/淨身類特別注意媽祖生、中元、春節三檔。行銷文案涉草本功效需過合規審查。
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

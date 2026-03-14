import { useState, useMemo } from 'react'
import { useGoals } from '../hooks/useGoals'
import { callClaude, extractJSON } from '../utils/ai'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'

/* ── 格式化 ── */
const fmtM = v => {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}
const fmtPct = (v, showSign = false) => {
  const n = Math.round(v)
  return (showSign && n > 0 ? '+' : '') + n + '%'
}

/* ── 節奏狀態 ── */
function paceLabel(pct, elapsed) {
  if (!elapsed) return null
  const expected = elapsed * 100
  const diff = pct - expected
  if (diff >= 5) return { text: '超前進度', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '🚀' }
  if (diff >= -5) return { text: '符合節奏', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: '✅' }
  if (diff >= -15) return { text: '略落後', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠️' }
  return { text: '明顯落後', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: '🔴' }
}

/* ── 月份季節性分佈（用歷史比例拆解年度目標）── */
function distributeBySeasonality(annualTarget, historicalMonthly) {
  const monthlyTotals = {}
  historicalMonthly.forEach(d => {
    const m = parseInt(d.yearMonth.split('-')[1])
    monthlyTotals[m] = (monthlyTotals[m] || 0) + d.subtotal
  })
  const total = Object.values(monthlyTotals).reduce((s, v) => s + v, 0)
  const result = {}
  for (let m = 1; m <= 12; m++) {
    const ratio = total > 0 ? (monthlyTotals[m] || 0) / total : 1 / 12
    result[m] = Math.round(annualTarget * ratio)
  }
  return result
}

/* ─────── 進度條 ─────── */
function ProgressBar({ value, target, height = 'h-3' }) {
  const pct = target > 0 ? Math.min(100, value / target * 100) : 0
  const color = pct >= 100 ? '#10B981' : pct >= 80 ? '#3B82F6' : pct >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <div className={`w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden ${height}`}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ─────── 大進度環（SVG）─────── */
function ProgressRing({ pct, size = 120, stroke = 10 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct / 100, 1))
  const color = pct >= 100 ? '#10B981' : pct >= 80 ? '#3B82F6' : pct >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  )
}

/* ─────── 月份追蹤表 ─────── */
function MonthlyTracker({ year, annualTarget, trendData }) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const isCurrentYear = parseInt(year) === currentYear

  const seasonDist = useMemo(() => distributeBySeasonality(annualTarget, trendData), [annualTarget, trendData])

  const actuals = useMemo(() => {
    const map = {}
    trendData.filter(d => d.yearMonth.startsWith(year)).forEach(d => {
      const m = parseInt(d.yearMonth.split('-')[1])
      map[m] = d.subtotal
    })
    return map
  }, [trendData, year])

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  let cumTarget = 0, cumActual = 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th className="text-left px-3 py-2.5 font-semibold">月份</th>
            <th className="text-right px-3 py-2.5 font-semibold">月目標</th>
            <th className="text-right px-3 py-2.5 font-semibold">實績</th>
            <th className="text-right px-3 py-2.5 font-semibold">達成率</th>
            <th className="text-right px-3 py-2.5 font-semibold">累積目標</th>
            <th className="text-right px-3 py-2.5 font-semibold">累積實績</th>
            <th className="w-32 px-3 py-2.5 font-semibold">進度</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => {
            const mTarget = seasonDist[m] || 0
            const mActual = actuals[m] ?? null
            cumTarget += mTarget
            if (mActual != null) cumActual += mActual
            const pct = mTarget > 0 && mActual != null ? Math.round(mActual / mTarget * 100) : null
            const isFuture = isCurrentYear && m > currentMonth
            const isCurrent = isCurrentYear && m === currentMonth

            return (
              <tr key={m} className={`border-t border-gray-50 dark:border-gray-700 ${isCurrent ? 'bg-blue-50/40 dark:bg-blue-900/20' : ''} ${isFuture ? 'opacity-40' : ''} hover:bg-gray-50/60 dark:hover:bg-gray-700/40`}>
                <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-200">
                  {m} 月 {isCurrent && <span className="text-xs text-blue-500">本月</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400">{fmtM(mTarget)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800 dark:text-gray-100">
                  {mActual != null ? fmtM(mActual) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {pct != null ? (
                    <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-blue-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {pct}%
                    </span>
                  ) : <span className="text-gray-200 dark:text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-400 dark:text-gray-500">{fmtM(cumTarget)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">{cumActual > 0 ? fmtM(cumActual) : '—'}</td>
                <td className="px-3 py-2.5">
                  {!isFuture && mTarget > 0 && (
                    <ProgressBar value={mActual ?? 0} target={mTarget} height="h-2" />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─────── 維度目標卡（品牌/通路）─────── */
function DimGoalSection({ title, icon, dimKey, items, dimGoals, onEdit }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-700 dark:text-gray-200">{icon} {title}目標</h3>
        <button onClick={onEdit} className="text-sm text-blue-600 hover:underline">編輯目標</button>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-300 dark:text-gray-600 text-base">無資料</p>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 8).map(item => {
            const target = dimGoals?.[item.name]?.subtotal || 0
            const pct = target > 0 ? Math.round(item.subtotal / target * 100) : null
            return (
              <div key={item.name}>
                <div className="flex justify-between text-base mb-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[40%]">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gray-600 dark:text-gray-300">{fmtM(item.subtotal)}</span>
                    {target > 0 ? (
                      <span className={`font-bold w-12 text-right ${pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>
                        {pct}%
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600 text-sm w-12 text-right">未設目標</span>
                    )}
                  </div>
                </div>
                <ProgressBar value={item.subtotal} target={target > 0 ? target : item.subtotal * 1.2} height="h-2" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─────── AI 目標編輯 Modal ─────── */
function GoalEditorModal({ byYear, goals, brandData, channelData, onSave, onClose, editSection }) {
  const currentYear = new Date().getFullYear()
  const nextYears = [0, 1, 2].map(i => String(currentYear + i))

  const [tab, setTab] = useState(editSection || 'annual')
  const [draft, setDraft] = useState(() => ({
    annual: Object.fromEntries(nextYears.map(y => [y, {
      subtotal: goals.annual[y]?.subtotal || 0,
      quantity: goals.annual[y]?.quantity || 0,
    }])),
    longTerm: {
      '3year': { label: '3 年', targetYear: currentYear + 3, subtotal: goals.longTerm?.['3year']?.subtotal || 0, quantity: goals.longTerm?.['3year']?.quantity || 0 },
      '5year': { label: '5 年', targetYear: currentYear + 5, subtotal: goals.longTerm?.['5year']?.subtotal || 0, quantity: goals.longTerm?.['5year']?.quantity || 0 },
      '10year': { label: '10 年', targetYear: currentYear + 10, subtotal: goals.longTerm?.['10year']?.subtotal || 0, quantity: goals.longTerm?.['10year']?.quantity || 0 },
    },
    brands: { ...(goals.brands || {}) },
    channels: { ...(goals.channels || {}) },
    kpis: {
      avgOrderValue: goals.kpis?.avgOrderValue || 0,
      customerCountGrowth: goals.kpis?.customerCountGrowth || 0,
      newCustomerRate: goals.kpis?.newCustomerRate || 0,
      topChannelMaxPct: goals.kpis?.topChannelMaxPct || 0,
    },
  }))
  const [loading, setLoading] = useState(false)
  const [aiNote, setAiNote] = useState('')

  const setA = (year, field, v) => setDraft(d => ({ ...d, annual: { ...d.annual, [year]: { ...d.annual[year], [field]: Number(v) || 0 } } }))
  const setL = (key, field, v) => setDraft(d => ({ ...d, longTerm: { ...d.longTerm, [key]: { ...d.longTerm[key], [field]: Number(v) || 0 } } }))
  const setDim = (dimKey, name, v) => setDraft(d => ({ ...d, [dimKey]: { ...d[dimKey], [name]: { ...(d[dimKey][name] || {}), subtotal: Number(v) || 0 } } }))
  const setKpi = (k, v) => setDraft(d => ({ ...d, kpis: { ...d.kpis, [k]: Number(v) || 0 } }))

  const generateWithAI = async () => {
    setLoading(true)
    setAiNote('')
    try {
      const historySummary = byYear.map(r =>
        `  ${r.year}年：銷售額 ${fmtM(r.subtotal)}，數量 ${Math.round(r.quantity).toLocaleString()} 件`
      ).join('\n')
      const growthRates = byYear.map((r, i) => {
        if (i === 0) return null
        const prev = byYear[i - 1]
        return prev.subtotal > 0 ? `  ${r.year}vs${prev.year}：${((r.subtotal - prev.subtotal) / prev.subtotal * 100).toFixed(1)}%` : null
      }).filter(Boolean).join('\n')

      const prompt = `你是專業銷售顧問，請根據歷史數據給出合理目標建議。

歷年銷售：
${historySummary}

歷年成長率：
${growthRates || '資料不足'}

請考量：市場成熟度、實際可達成性、不過度樂觀也不保守。

回覆 JSON（金額為整數元，無逗號）：
{
  "cagr": 12,
  "analysis": "50字以內分析",
  "annual": {
    "${nextYears[0]}": {"subtotal": 0, "quantity": 0},
    "${nextYears[1]}": {"subtotal": 0, "quantity": 0},
    "${nextYears[2]}": {"subtotal": 0, "quantity": 0}
  },
  "longTerm": {
    "3year": {"subtotal": 0, "quantity": 0},
    "5year": {"subtotal": 0, "quantity": 0},
    "10year": {"subtotal": 0, "quantity": 0}
  },
  "kpis": {
    "avgOrderValueGrowthPct": 10,
    "customerCountGrowthPct": 15,
    "newCustomerRatePct": 30,
    "topChannelMaxPct": 60
  }
}`
      const text = await callClaude(prompt, 1200)
      const json = extractJSON(text)
      setAiNote(`📊 ${json.analysis || ''}（建議 CAGR：${json.cagr || '—'}%）`)
      setDraft(d => {
        const annual = { ...d.annual }
        nextYears.forEach(y => { if (json.annual?.[y]) annual[y] = { subtotal: json.annual[y].subtotal || 0, quantity: json.annual[y].quantity || 0 } })
        const longTerm = { ...d.longTerm }
        Object.entries(json.longTerm || {}).forEach(([k, v]) => { if (longTerm[k]) longTerm[k] = { ...longTerm[k], subtotal: v.subtotal || 0, quantity: v.quantity || 0 } })
        const kpis = { ...d.kpis }
        if (json.kpis) {
          kpis.avgOrderValue = json.kpis.avgOrderValueGrowthPct || 0
          kpis.customerCountGrowth = json.kpis.customerCountGrowthPct || 0
          kpis.newCustomerRate = json.kpis.newCustomerRatePct || 0
          kpis.topChannelMaxPct = json.kpis.topChannelMaxPct || 0
        }
        return { ...d, annual, longTerm, kpis }
      })
    } catch (e) {
      setAiNote(`⚠️ AI 失敗：${e.message === 'NO_API_KEY' ? '請先設定 API Key（點右上角 🔑）' : e.message}`)
    }
    setLoading(false)
  }

  const TABS = [
    { id: 'annual', label: '年度目標' },
    { id: 'monthly', label: '月份分配說明' },
    { id: 'dims', label: '品牌/通路目標' },
    { id: 'kpis', label: '策略 KPI' },
    { id: 'longterm', label: '長期里程碑' },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">🏆 編輯目標</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
        </div>

        {/* AI 按鈕 */}
        <div className="px-6 pt-4 pb-3 bg-gradient-to-r from-blue-50 dark:from-blue-900/20 to-indigo-50 dark:to-indigo-900/20 border-b border-blue-100 dark:border-blue-700/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-blue-800 dark:text-blue-300">🤖 AI 智能建議</p>
              <p className="text-sm text-blue-400 dark:text-blue-500">{aiNote || '根據歷史數據自動計算合理成長目標'}</p>
            </div>
            <button onClick={generateWithAI} disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {loading ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />分析中...</> : '✨ AI 建議'}
            </button>
          </div>
        </div>

        {/* 子頁籤 */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 px-4 flex-shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* 年度目標 */}
          {tab === 'annual' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 dark:text-gray-500">設定每年度總銷售目標，系統會依歷史季節性自動拆解至各月份。</p>
              <table className="w-full text-base">
                <thead>
                  <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-2 pr-4">年份</th>
                    <th className="text-right py-2 pr-4">銷售金額目標（元）</th>
                    <th className="text-right py-2">銷售數量目標（件）</th>
                  </tr>
                </thead>
                <tbody>
                  {nextYears.map(y => (
                    <tr key={y} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-3 pr-4 font-bold text-gray-700 dark:text-gray-200">{y} 年</td>
                      <td className="py-3 pr-4 text-right">
                        <input type="number" value={draft.annual[y]?.subtotal || ''} onChange={e => setA(y, 'subtotal', e.target.value)}
                          className="w-40 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="0" />
                      </td>
                      <td className="py-3 text-right">
                        <input type="number" value={draft.annual[y]?.quantity || ''} onChange={e => setA(y, 'quantity', e.target.value)}
                          className="w-32 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 月份說明 */}
          {tab === 'monthly' && (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-700/50 rounded-xl p-4 text-base text-blue-700 dark:text-blue-400">
                月份目標由系統根據歷史各月份銷售比例自動拆解，無需手動設定。設定好年度目標後，「月份追蹤」頁面會自動顯示各月份應達成數字。
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-700/50 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                <p className="font-bold mb-1">季節性調整說明</p>
                <p>若過去 12 個月資料中，7 月平均佔全年 12%，則年度目標的 12% 會分配到 7 月。資料越多，分配越準確。</p>
              </div>
            </div>
          )}

          {/* 品牌/通路目標 */}
          {tab === 'dims' && (
            <div className="space-y-6">
              <div>
                <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">品牌目標</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">設定各品牌年度銷售金額目標（當年度）</p>
                <div className="space-y-2">
                  {(brandData || []).slice(0, 10).map(b => (
                    <div key={b.name} className="flex items-center gap-3">
                      <span className="text-base text-gray-700 dark:text-gray-200 w-32 flex-shrink-0 truncate">{b.name}</span>
                      <span className="text-sm text-gray-400 dark:text-gray-500 w-20 text-right flex-shrink-0">實績 {fmtM(b.subtotal)}</span>
                      <input type="number" value={draft.brands[b.name]?.subtotal || ''} onChange={e => setDim('brands', b.name, e.target.value)}
                        className="flex-1 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="目標金額" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">通路目標</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">設定各通路年度銷售金額目標（當年度）</p>
                <div className="space-y-2">
                  {(channelData || []).slice(0, 8).map(ch => (
                    <div key={ch.name} className="flex items-center gap-3">
                      <span className="text-base text-gray-700 dark:text-gray-200 w-32 flex-shrink-0 truncate">{ch.name}</span>
                      <span className="text-sm text-gray-400 dark:text-gray-500 w-20 text-right flex-shrink-0">實績 {fmtM(ch.subtotal)}</span>
                      <input type="number" value={draft.channels[ch.name]?.subtotal || ''} onChange={e => setDim('channels', ch.name, e.target.value)}
                        className="flex-1 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="目標金額" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 策略 KPI */}
          {tab === 'kpis' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 dark:text-gray-500">設定非財務面的策略性 KPI 目標，幫助品牌長期健康成長。</p>
              {[
                { key: 'customerCountGrowth', label: '客戶數成長率目標', unit: '%', desc: '今年客戶數較去年成長多少 %' },
                { key: 'newCustomerRate', label: '新客戶佔比目標', unit: '%', desc: '新客戶佔總客戶數的比例上限/下限' },
                { key: 'topChannelMaxPct', label: '單一通路佔比上限', unit: '%', desc: '避免過度集中在單一通路，建議 ≤ 60%' },
                { key: 'avgOrderValue', label: '客單價成長目標', unit: '%', desc: '平均每筆訂單金額較去年成長 %' },
              ].map(({ key, label, unit, desc }) => (
                <div key={key} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-gray-700 dark:text-gray-200">{label}</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">{desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={draft.kpis[key] || ''} onChange={e => setKpi(key, e.target.value)}
                      className="w-24 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="0" />
                    <span className="text-base text-gray-500 dark:text-gray-400">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 長期里程碑 */}
          {tab === 'longterm' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400 dark:text-gray-500">設定 3、5、10 年長期業績里程碑，對齊公司願景。</p>
              {Object.entries(draft.longTerm).map(([key, lt]) => (
                <div key={key} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">{lt.label}目標（{lt.targetYear} 年達成）</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">金額</span>
                      <input type="number" value={lt.subtotal || ''} onChange={e => setL(key, 'subtotal', e.target.value)}
                        className="flex-1 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="0" />
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">數量</span>
                      <input type="number" value={lt.quantity || ''} onChange={e => setL(key, 'quantity', e.target.value)}
                        className="flex-1 text-right px-3 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base" placeholder="0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-base hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
          <button onClick={() => { onSave(draft); onClose() }}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-base font-bold hover:bg-blue-700">儲存目標</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   主元件 GoalDashboard
═══════════════════════════════════════════ */
export default function GoalDashboard({ trendData = [], comparisonData, summary, brandData = [], channelData = [], metric }) {
  const { goals, save } = useGoals()
  const [editing, setEditing] = useState(false)
  const [editSection, setEditSection] = useState('annual')
  const [viewTab, setViewTab] = useState('annual')

  const currentYear = String(new Date().getFullYear())
  const currentMonth = new Date().getMonth() + 1
  const byYear = comparisonData?.byYear || []

  /* 當年進度 */
  const target = goals.annual[currentYear] || {}
  const salesPct = target.subtotal > 0 ? (summary?.totalSales || 0) / target.subtotal * 100 : 0
  const qtyPct = target.quantity > 0 ? (summary?.totalQty || 0) / target.quantity * 100 : 0

  /* 節奏分析：以當前月份推算應完成比例 */
  const elapsedRatio = currentMonth / 12
  const pace = target.subtotal > 0 ? paceLabel(salesPct, elapsedRatio) : null

  /* 預估年底達成 */
  const estimatedYearEnd = useMemo(() => {
    const monthsWithData = trendData.filter(d => d.yearMonth.startsWith(currentYear)).length
    if (!monthsWithData) return null
    const curActual = summary?.totalSales || 0
    return Math.round(curActual / monthsWithData * 12)
  }, [trendData, currentYear, summary])

  /* 差距 */
  const gap = target.subtotal > 0 ? target.subtotal - (summary?.totalSales || 0) : 0
  const remainingMonths = 12 - currentMonth
  const monthlyNeeded = gap > 0 && remainingMonths > 0 ? Math.round(gap / remainingMonths) : 0

  /* 月份圖表資料 */
  const monthChartData = useMemo(() => {
    if (!target.subtotal) return []
    const dist = distributeBySeasonality(target.subtotal, trendData)
    const actuals = {}
    trendData.filter(d => d.yearMonth.startsWith(currentYear)).forEach(d => {
      actuals[parseInt(d.yearMonth.split('-')[1])] = d.subtotal
    })
    return Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}月`,
      目標: dist[i + 1] || 0,
      實績: actuals[i + 1] ?? null,
    }))
  }, [target.subtotal, trendData, currentYear])

  /* CAGR 計算 */
  const cagr = useMemo(() => {
    const last = byYear[byYear.length - 1]
    const first = byYear[0]
    if (!last || !first || last.subtotal <= 0 || first.subtotal <= 0 || last.year === first.year) return null
    const years = parseInt(last.year) - parseInt(first.year)
    return ((Math.pow(last.subtotal / first.subtotal, 1 / years) - 1) * 100)
  }, [byYear])

  const openEdit = (section = 'annual') => { setEditSection(section); setEditing(true) }

  const handleSave = draft => {
    save({ ...goals, annual: { ...goals.annual, ...draft.annual }, longTerm: draft.longTerm, brands: draft.brands, channels: draft.channels, kpis: draft.kpis })
  }

  const noTarget = !target.subtotal && !target.quantity

  const VIEW_TABS = [
    { id: 'annual', label: '年度追蹤' },
    { id: 'monthly', label: '月份進度' },
    { id: 'dims', label: '品牌/通路' },
    { id: 'kpis', label: '策略 KPI' },
    { id: 'longterm', label: '長期里程碑' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">🏆 目標管理</h2>
          <p className="text-base text-gray-400 dark:text-gray-500 mt-0.5">年度目標追蹤、月份節奏、品牌通路分目標、策略 KPI</p>
        </div>
        <button onClick={() => openEdit('annual')}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all">
          ✏️ 編輯目標
        </button>
      </div>

      {noTarget ? (
        /* 引導設定 */
        <div className="bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-indigo-50 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-700/50 rounded-2xl p-10 text-center">
          <p className="text-5xl mb-4">🎯</p>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mb-2">尚未設定目標</p>
          <p className="text-base text-blue-400 dark:text-blue-500 mb-6">設定年度業績目標，系統自動追蹤節奏、拆解月份、分析差距</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => openEdit('annual')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700">
              ✨ 手動設定目標
            </button>
            <button onClick={() => { setEditing(true); setEditSection('annual') }}
              className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400 rounded-xl font-bold text-base hover:bg-blue-50 dark:hover:bg-blue-900/20">
              🤖 讓 AI 建議目標
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 當年進度概覽 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 進度環 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <ProgressRing pct={salesPct} size={100} stroke={9} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black text-gray-800 dark:text-gray-100">{Math.round(salesPct)}%</span>
                </div>
              </div>
              <div>
                <p className="text-base font-bold text-gray-700 dark:text-gray-200">{currentYear} 年銷售達成</p>
                <p className="text-2xl font-black text-gray-800 dark:text-gray-100 mt-0.5">{fmtM(summary?.totalSales)}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">目標 {fmtM(target.subtotal)}</p>
                {pace && (
                  <span className={`inline-flex items-center gap-1 text-sm font-semibold mt-2 px-2 py-0.5 rounded-full border ${pace.color} ${pace.bg} ${pace.border}`}>
                    {pace.icon} {pace.text}
                  </span>
                )}
              </div>
            </div>

            {/* 節奏分析 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">📊 節奏分析</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-base">
                  <span className="text-gray-500 dark:text-gray-400">已過年度</span>
                  <span className="font-bold text-gray-800 dark:text-gray-100">{Math.round(elapsedRatio * 100)}%（{currentMonth} 月）</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-gray-500 dark:text-gray-400">目前達成</span>
                  <span className="font-bold text-gray-800 dark:text-gray-100">{Math.round(salesPct)}%</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-gray-500 dark:text-gray-400">預估年底達成</span>
                  <span className={`font-bold ${estimatedYearEnd >= target.subtotal ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {fmtM(estimatedYearEnd)}
                  </span>
                </div>
                {gap > 0 && (
                  <div className="flex justify-between text-base border-t border-gray-50 dark:border-gray-700 pt-2 mt-2">
                    <span className="text-gray-500 dark:text-gray-400">尚差目標</span>
                    <span className="font-bold text-red-500">{fmtM(gap)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 行動建議 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">🎬 需要的行動</p>
              {gap > 0 && remainingMonths > 0 ? (
                <div className="space-y-2.5">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-700/50 rounded-xl p-3">
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">每月需達成</p>
                    <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{fmtM(monthlyNeeded)}</p>
                    <p className="text-xs text-amber-500">剩餘 {remainingMonths} 個月平均需求</p>
                  </div>
                  {monthlyNeeded > 0 && trendData.length > 0 && (() => {
                    const avgActual = (summary?.totalSales || 0) / (currentMonth || 1)
                    const uplift = avgActual > 0 ? ((monthlyNeeded - avgActual) / avgActual * 100) : 0
                    return uplift > 0 ? (
                      <p className="text-sm text-gray-500">較過去月均需提升 <span className="font-bold text-red-500">{Math.round(uplift)}%</span></p>
                    ) : (
                      <p className="text-sm text-emerald-600 font-semibold">✅ 按目前節奏即可達成</p>
                    )
                  })()}
                </div>
              ) : salesPct >= 100 ? (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-700/50 rounded-xl p-4 text-center">
                  <p className="text-3xl mb-1">🎉</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">已達成年度目標！</p>
                </div>
              ) : (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-700/50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">按目前節奏預計年底達成 {fmtM(estimatedYearEnd)}</p>
                </div>
              )}
            </div>
          </div>

          {/* 子頁籤 */}
          <div className="flex border-b border-gray-200 dark:border-gray-600 overflow-x-auto">
            {VIEW_TABS.map(t => (
              <button key={t.id} onClick={() => setViewTab(t.id)}
                className={`flex-shrink-0 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${viewTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 年度追蹤 */}
          {viewTab === 'annual' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-200">📅 各年度目標對照</h3>
                <button onClick={() => openEdit('annual')} className="text-sm text-blue-600 hover:underline">編輯目標</button>
              </div>
              {cagr != null && (
                <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-700/50 rounded-xl text-sm text-blue-700 dark:text-blue-400">
                  <span className="font-bold">歷史 CAGR</span> {cagr.toFixed(1)}% / 年
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-base">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-3 py-2.5 font-semibold">年份</th>
                      <th className="text-right px-3 py-2.5 font-semibold">金額目標</th>
                      <th className="text-right px-3 py-2.5 font-semibold">數量目標</th>
                      <th className="text-right px-3 py-2.5 font-semibold">實際金額</th>
                      <th className="text-right px-3 py-2.5 font-semibold">達成率</th>
                      <th className="text-right px-3 py-2.5 font-semibold">YoY 成長</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allYears = [...new Set([
                        ...byYear.map(r => r.year),
                        ...[0, 1, 2].map(i => String(new Date().getFullYear() + i))
                      ])].sort()
                      return allYears.map((year, idx) => {
                        const tgt = goals.annual[year] || {}
                        const actual = byYear.find(r => r.year === year)
                        const isCurrentYear = year === currentYear
                        const actualVal = isCurrentYear ? (summary?.totalSales || 0) : (actual?.subtotal ?? null)
                        const pct = tgt.subtotal > 0 && actualVal != null ? Math.round(actualVal / tgt.subtotal * 100) : null
                        const prevActual = byYear.find(r => r.year === String(parseInt(year) - 1))?.subtotal
                        const yoy = prevActual > 0 && actualVal != null ? (actualVal - prevActual) / prevActual * 100 : null
                        return (
                          <tr key={year} className={`border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 ${isCurrentYear ? 'bg-blue-50/30 dark:bg-blue-900/20' : ''}`}>
                            <td className="px-3 py-3 font-bold text-gray-800 dark:text-gray-100">
                              {year} {isCurrentYear && <span className="text-xs text-blue-500 font-normal ml-1">本年</span>}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">{tgt.subtotal ? fmtM(tgt.subtotal) : <span className="text-gray-200 dark:text-gray-600">未設定</span>}</td>
                            <td className="px-3 py-3 text-right font-mono">{tgt.quantity ? tgt.quantity.toLocaleString() : <span className="text-gray-200 dark:text-gray-600">—</span>}</td>
                            <td className="px-3 py-3 text-right font-mono font-semibold text-gray-700 dark:text-gray-200">{actualVal != null ? fmtM(actualVal) : '—'}</td>
                            <td className="px-3 py-3 text-right">
                              {pct != null ? (
                                <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-blue-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                                  {pct}%
                                </span>
                              ) : <span className="text-gray-200 dark:text-gray-600">—</span>}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {yoy != null ? (
                                <span className={`font-semibold ${yoy >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {fmtPct(yoy, true)}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 月份進度 */}
          {viewTab === 'monthly' && (
            <div className="space-y-4">
              {target.subtotal > 0 && (
                <>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-gray-700 dark:text-gray-200">📊 {currentYear} 年月份目標 vs 實績</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={monthChartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={fmtM} tick={{ fontSize: 12 }} width={52} />
                        <Tooltip formatter={v => [fmtM(v)]} />
                        <Bar dataKey="目標" fill="#e0e7ff" radius={[3, 3, 0, 0]} maxBarSize={20} />
                        <Bar dataKey="實績" radius={[3, 3, 0, 0]} maxBarSize={20}>
                          {monthChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.實績 >= entry.目標 ? '#10B981' : entry.實績 != null ? '#3B82F6' : '#e5e7eb'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <MonthlyTracker year={currentYear} annualTarget={target.subtotal} trendData={trendData} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 品牌/通路 */}
          {viewTab === 'dims' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DimGoalSection title="品牌" icon="✨" dimKey="brands" items={brandData} dimGoals={goals.brands} onEdit={() => openEdit('dims')} />
              <DimGoalSection title="通路" icon="🏪" dimKey="channels" items={channelData} dimGoals={goals.channels} onEdit={() => openEdit('dims')} />
            </div>
          )}

          {/* 策略 KPI */}
          {viewTab === 'kpis' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: 'customerCountGrowth', label: '客戶數成長率目標', icon: '👥', unit: '%',
                  actual: (() => {
                    const curY = byYear.find(r => r.year === currentYear)
                    const prevY = byYear.find(r => r.year === String(parseInt(currentYear) - 1))
                    return curY && prevY && prevY.customerCount > 0
                      ? (curY.customerCount - prevY.customerCount) / prevY.customerCount * 100 : null
                  })(),
                  desc: '今年客戶數較去年成長率',
                },
                { key: 'avgOrderValue', label: '客單價成長目標', icon: '💰', unit: '%', actual: null, desc: '平均每筆訂單金額成長率' },
                { key: 'newCustomerRate', label: '新客戶佔比目標', icon: '🌱', unit: '%', actual: null, desc: '新客戶佔總客戶比例' },
                { key: 'topChannelMaxPct', label: '單一通路集中上限', icon: '🏪', unit: '%',
                  actual: (() => {
                    if (!channelData.length) return null
                    const total = channelData.reduce((s, d) => s + (d.subtotal || 0), 0)
                    return total > 0 ? channelData[0].subtotal / total * 100 : null
                  })(),
                  desc: '最大通路佔總銷售比例',
                },
              ].map(({ key, label, icon, unit, actual, desc }) => {
                const tgt = goals.kpis?.[key] || 0
                const pct = tgt > 0 && actual != null ? actual / tgt * 100 : null
                return (
                  <div key={key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{icon}</span>
                        <span className="text-base font-bold text-gray-700 dark:text-gray-200">{label}</span>
                      </div>
                      {tgt > 0 && (
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">目標 {tgt}{unit}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">{desc}</p>
                    {actual != null ? (
                      <div>
                        <div className="flex justify-between text-base mb-1.5">
                          <span className="text-gray-500 dark:text-gray-400">目前</span>
                          <span className="font-bold text-gray-800 dark:text-gray-100">{actual.toFixed(1)}{unit}</span>
                        </div>
                        {tgt > 0 && <ProgressBar value={actual} target={key === 'topChannelMaxPct' ? tgt : actual > tgt ? actual : tgt} />}
                        {tgt > 0 && key === 'topChannelMaxPct' && actual > tgt && (
                          <p className="text-sm text-red-500 mt-1.5 font-semibold">⚠️ 超出集中度上限，建議分散通路</p>
                        )}
                        {tgt > 0 && key !== 'topChannelMaxPct' && actual >= tgt && (
                          <p className="text-sm text-emerald-600 mt-1.5 font-semibold">✅ 已達成目標</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-300 dark:text-gray-600 text-base">
                        {tgt ? `目標 ${tgt}${unit}，實績資料不足` : (
                          <button onClick={() => openEdit('kpis')} className="text-blue-500 hover:underline text-sm">+ 設定目標</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="md:col-span-2 text-right">
                <button onClick={() => openEdit('kpis')} className="text-sm text-blue-600 hover:underline">編輯策略 KPI 目標</button>
              </div>
            </div>
          )}

          {/* 長期里程碑 */}
          {viewTab === 'longterm' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: '3year', label: '3 年里程碑', icon: '📍', color: 'blue' },
                  { key: '5year', label: '5 年里程碑', icon: '🏁', color: 'purple' },
                  { key: '10year', label: '10 年里程碑', icon: '🌟', color: 'amber' },
                ].map(({ key, label, icon, color }) => {
                  const lt = goals.longTerm?.[key]
                  const yr = lt?.targetYear || (new Date().getFullYear() + parseInt(key))
                  const curSales = summary?.totalSales || 0
                  const growth = lt?.subtotal > 0 && curSales > 0 ? (lt.subtotal / curSales - 1) * 100 : null
                  const yearsLeft = yr - new Date().getFullYear()
                  const impliedCAGR = lt?.subtotal > 0 && curSales > 0 && yearsLeft > 0
                    ? (Math.pow(lt.subtotal / curSales, 1 / yearsLeft) - 1) * 100 : null
                  const colors = {
                    blue: 'border-blue-100 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-900/20',
                    purple: 'border-purple-100 dark:border-purple-700/50 bg-purple-50/50 dark:bg-purple-900/20',
                    amber: 'border-amber-100 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/20',
                  }
                  const textColors = { blue: 'text-blue-700 dark:text-blue-400', purple: 'text-purple-700 dark:text-purple-400', amber: 'text-amber-700 dark:text-amber-400' }
                  return (
                    <div key={key} className={`rounded-2xl border p-5 ${colors[color]}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-2xl">{icon}</span>
                        <div>
                          <p className="text-base font-bold text-gray-800 dark:text-gray-100">{label}</p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">{yr} 年達成</p>
                        </div>
                      </div>
                      {lt?.subtotal ? (
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">銷售額目標</p>
                            <p className={`text-2xl font-black ${textColors[color]}`}>{fmtM(lt.subtotal)}</p>
                          </div>
                          {lt.quantity > 0 && (
                            <div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">數量目標</p>
                              <p className="text-base font-bold text-gray-700 dark:text-gray-200">{lt.quantity.toLocaleString()} 件</p>
                            </div>
                          )}
                          <div className="border-t border-white/60 pt-2 space-y-1">
                            {growth != null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">較目前需成長</span>
                                <span className={`font-bold ${textColors[color]}`}>+{Math.round(growth)}%</span>
                              </div>
                            )}
                            {impliedCAGR != null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">隱含年複成長</span>
                                <span className={`font-bold ${textColors[color]}`}>{impliedCAGR.toFixed(1)}% CAGR</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openEdit('longterm')} className="text-sm text-gray-400 hover:text-blue-600 hover:underline">
                          + 設定里程碑
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 長期走勢圖 */}
              {byYear.length > 0 && (() => {
                const chartPoints = [
                  ...byYear.map(r => ({ year: r.year, 實績: r.subtotal })),
                  ...['3year', '5year', '10year'].map(k => {
                    const lt = goals.longTerm?.[k]
                    return lt?.subtotal ? { year: String(lt.targetYear || ''), 目標: lt.subtotal } : null
                  }).filter(Boolean),
                ].sort((a, b) => a.year.localeCompare(b.year))
                return (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                    <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">📈 歷史實績 + 長期里程碑</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartPoints} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={fmtM} tick={{ fontSize: 12 }} width={55} />
                        <Tooltip formatter={v => [fmtM(v)]} />
                        <Line dataKey="實績" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                        <Line dataKey="目標" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 5, fill: '#F59E0B' }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}

      {editing && (
        <GoalEditorModal
          byYear={byYear}
          goals={goals}
          brandData={brandData}
          channelData={channelData}
          onSave={handleSave}
          onClose={() => setEditing(false)}
          editSection={editSection}
        />
      )}
    </div>
  )
}

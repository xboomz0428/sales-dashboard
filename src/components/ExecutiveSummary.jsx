import { useMemo, useState, useCallback } from 'react'
import { callClaude } from '../utils/ai'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

const YEAR_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

const fmtM = v => {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

const fmtPct = v => (v >= 0 ? '+' : '') + Math.round(v) + '%'

const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function KPICard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-700/50 text-blue-700 dark:text-blue-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-700/50 text-amber-700 dark:text-amber-400',
    red:    'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-700/50 text-red-700 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-700/50 text-purple-700 dark:text-purple-400',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-black">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <span className="text-base font-bold text-gray-700 dark:text-gray-200">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const fmtPctRaw = (cur, prev) => {
  if (!prev || prev === 0) return null
  const pct = (cur - prev) / prev * 100
  return { pct, label: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', up: pct >= 0 }
}

function MultiYearMonthlyChart({ trendData, comparisonData, metric }) {
  const years = useMemo(() => comparisonData?.byYear?.map(d => d.year) || [], [comparisonData])

  const chartData = useMemo(() => {
    const monthMap = {}
    trendData.forEach(d => {
      const [year, month] = d.yearMonth.split('-')
      if (!years.includes(year)) return
      const mIdx = parseInt(month) - 1
      const mLabel = MONTH_ZH[mIdx]
      if (!monthMap[mLabel]) monthMap[mLabel] = { month: mLabel, mIdx }
      monthMap[mLabel][year] = (monthMap[mLabel][year] || 0) + d[metric]
    })
    return Object.values(monthMap).sort((a, b) => a.mIdx - b.mIdx)
  }, [trendData, years, metric])

  // average YoY growth per month
  const avgGrowthData = useMemo(() => {
    if (years.length < 2) return []
    return chartData.map(md => {
      const vals = years.map(y => md[y] || 0)
      const growths = []
      for (let i = 1; i < vals.length; i++) {
        if (vals[i - 1] > 0) growths.push((vals[i] - vals[i - 1]) / vals[i - 1] * 100)
      }
      const avg = growths.length ? growths.reduce((s, g) => s + g, 0) / growths.length : null
      return { month: md.month, avgGrowth: avg != null ? Math.round(avg * 10) / 10 : null }
    })
  }, [chartData, years])

  const [chartType, setChartType] = useState('line')

  if (years.length < 2) return null

  const fmtY = v => {
    if (!v) return '0'
    if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
    if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
    return Math.round(v).toLocaleString()
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-sm min-w-[160px]">
        <p className="font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1.5 mb-1.5">{label}</p>
        {[...payload].sort((a, b) => (b.value || 0) - (a.value || 0)).map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.stroke || e.fill }} />
              {e.name}
            </span>
            <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{fmtY(e.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between flex-wrap gap-2">
        <span className="text-base font-bold text-gray-700 dark:text-gray-200">📊 各年月份比對</span>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {[{ v: 'line', l: '折線' }, { v: 'bar', l: '柱狀' }].map(({ v, l }) => (
            <button key={v} onClick={() => setChartType(v)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${chartType === v ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {/* Year legend */}
        <div className="flex items-center gap-4 flex-wrap mb-3">
          {years.map((y, i) => (
            <span key={y} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300">
              <span className="w-3 h-3 rounded-full" style={{ background: YEAR_COLORS[i % YEAR_COLORS.length] }} />
              {y}
            </span>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 13 }} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 12 }} width={52} />
              <Tooltip content={<CustomTooltip />} />
              {years.map((y, i) => (
                <Line key={y} type="monotone" dataKey={y} stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={2.5} dot={{ r: 3, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 6 }} connectNulls />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData} barCategoryGap="20%" barGap={2} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 13 }} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 12 }} width={52} />
              <Tooltip content={<CustomTooltip />} />
              {years.map((y, i) => (
                <Bar key={y} dataKey={y} fill={YEAR_COLORS[i % YEAR_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={36} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Avg YoY growth per month */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2">各月平均年增率</p>
          <div className="flex flex-wrap gap-1.5">
            {avgGrowthData.map(({ month, avgGrowth }) => (
              <div key={month} className="flex flex-col items-center">
                <span className="text-xs text-gray-400 dark:text-gray-500">{month}</span>
                {avgGrowth != null ? (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    avgGrowth > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                    avgGrowth < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    'text-gray-400'
                  }`}>
                    {avgGrowth > 0 ? '+' : ''}{avgGrowth}%
                  </span>
                ) : <span className="text-xs text-gray-300">—</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExecutiveSummary({ summary, trendData, productData, customerData, brandData, channelData, metric, allRows, filters, comparisonData }) {
  const [aiText, setAiText]     = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState('')
  const [selectedYears, setSelectedYears] = useState([])
  const [monthlyChartType, setMonthlyChartType] = useState('line')

  const metricLabel = metric === 'subtotal' ? '銷售額' : '數量'

  // Available years in trend data
  const availableYears = useMemo(() => {
    const ys = [...new Set(trendData.map(d => d.yearMonth?.slice(0, 4)).filter(Boolean))].sort()
    return ys
  }, [trendData])

  // Active selected years — fallback to latest year if nothing valid selected
  const activeSelectedYears = useMemo(() => {
    if (!availableYears.length) return []
    const valid = selectedYears.filter(y => availableYears.includes(y))
    return valid.length > 0 ? valid : [availableYears[availableYears.length - 1]]
  }, [selectedYears, availableYears])

  const isMultiYear = activeSelectedYears.length > 1
  const activeYear = activeSelectedYears[0] || ''

  const toggleYear = useCallback((y) => {
    setSelectedYears(prev => {
      const valid = prev.filter(x => availableYears.includes(x))
      const base  = valid.length > 0 ? valid : [availableYears[availableYears.length - 1]]
      if (base.includes(y)) {
        return base.length === 1 ? base : base.filter(x => x !== y)
      }
      return [...base, y].sort()
    })
  }, [availableYears])

  const multiYearMonthData = useMemo(() => {
    if (!isMultiYear) return []
    const map = {}
    trendData.forEach(d => {
      const [year, month] = d.yearMonth.split('-')
      if (!activeSelectedYears.includes(year)) return
      const mIdx   = parseInt(month) - 1
      const mLabel = MONTH_ZH[mIdx]
      if (!map[mLabel]) map[mLabel] = { month: mLabel, mIdx }
      map[mLabel][year] = (map[mLabel][year] || 0) + d[metric]
    })
    return Object.values(map).sort((a, b) => a.mIdx - b.mIdx)
  }, [trendData, activeSelectedYears, isMultiYear, metric])

  // Monthly trend for selected year — all 12 months (fill missing with 0)
  const yearlyTrend = useMemo(() => {
    if (!activeYear) return []
    const map = {}
    trendData.forEach(d => {
      if (d.yearMonth?.startsWith(activeYear)) map[d.yearMonth] = d
    })
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      const ym = `${activeYear}-${mm}`
      return map[ym] || { yearMonth: ym, subtotal: 0, quantity: 0, _empty: true }
    })
  }, [trendData, activeYear])

  const maxYearly    = useMemo(() => Math.max(...yearlyTrend.map(d => d[metric] || 0), 1), [yearlyTrend, metric])
  const avgMonthly   = useMemo(() => {
    const filled = yearlyTrend.filter(d => (d[metric] || 0) > 0)
    if (!filled.length) return 0
    return filled.reduce((s, d) => s + (d[metric] || 0), 0) / filled.length
  }, [yearlyTrend, metric])

  const bestYM  = useMemo(() => yearlyTrend.reduce((b, d) => (d[metric]||0) > (b[metric]||0) ? d : b, yearlyTrend[0] || {}), [yearlyTrend, metric])
  const worstYM = useMemo(() => {
    const nonEmpty = yearlyTrend.filter(d => (d[metric]||0) > 0)
    if (!nonEmpty.length) return yearlyTrend[0] || {}
    return nonEmpty.reduce((w, d) => (d[metric]||0) < (w[metric]||0) ? d : w, nonEmpty[0])
  }, [yearlyTrend, metric])

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (filters?.dateRange?.start && filters?.dateRange?.end) {
      return `${filters.dateRange.start} ～ ${filters.dateRange.end}`
    }
    if (filters?.years?.length || filters?.months?.length) {
      const y = filters.years?.length ? filters.years.join('、') + ' 年' : ''
      const m = filters.months?.length ? filters.months.map(m => parseInt(m) + '月').join('、') : ''
      return [y, m].filter(Boolean).join(' ')
    }
    if (trendData.length) {
      const first = trendData[0].yearMonth
      const last  = trendData[trendData.length - 1].yearMonth
      return first === last ? first : `${first} ～ ${last}`
    }
    return '全部期間'
  }, [filters, trendData])

  // YoY & MoM stats
  const yoyStats = useMemo(() => {
    if (!trendData.length) return null
    const latest = trendData[trendData.length - 1]
    const [ly, lm] = latest.yearMonth.split('-')
    const prevYM   = `${parseInt(ly) - 1}-${lm}`
    const prev = trendData.find(d => d.yearMonth === prevYM)
    if (!prev) return null
    const chg = prev[metric] > 0 ? (latest[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { latest: latest[metric], prev: prev[metric], chg, yearMonth: latest.yearMonth }
  }, [trendData, metric])

  const momStats = useMemo(() => {
    if (trendData.length < 2) return null
    const cur  = trendData[trendData.length - 1]
    const prev = trendData[trendData.length - 2]
    const chg  = prev[metric] > 0 ? (cur[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { cur: cur[metric], prev: prev[metric], chg }
  }, [trendData, metric])

  const topProduct  = productData?.[0]
  const topCustomer = customerData?.[0]
  const topBrand    = brandData?.[0]

  const bestMonth  = useMemo(() => trendData.length ? trendData.reduce((b, d) => d[metric] > b[metric] ? d : b, trendData[0]) : null, [trendData, metric])
  const worstMonth = useMemo(() => trendData.length ? trendData.reduce((w, d) => d[metric] < w[metric] ? d : w, trendData[0]) : null, [trendData, metric])

  const channelConc = useMemo(() => {
    if (!channelData?.length) return null
    const total = channelData.reduce((s, d) => s + (d[metric] || 0), 0)
    const top   = channelData[0]
    if (!total || !top) return null
    return { name: top.name, pct: (top[metric] / total * 100) }
  }, [channelData, metric])

  // AI prompt — enhanced with recommendations + revenue formula angle
  const handleAI = async () => {
    setAiLoading(true); setAiError('')
    try {
      const prompt = `你是一位頂尖的商業分析顧問，請根據以下銷售數據撰寫一份給老闆看的決策摘要，使用繁體中文，語言精煉有力，每段 2-3 句，共 5-6 段。

【分析時間區間】
- 期間：${dateRangeLabel}
- 涵蓋 ${trendData.length} 個月（${trendData[0]?.yearMonth || '—'} ～ ${trendData[trendData.length - 1]?.yearMonth || '—'}）
- 分析指標：${metricLabel}

【整體績效】
- 總${metricLabel}：${fmtM(summary?.totalSales)}
- 客戶數：${summary?.customerCount}，訂單數：${summary?.orderCount}
- 月增率（最新 vs 上月）：${momStats ? fmtPct(momStats.chg) : '無'}
- 年增率（最新 vs 去年同月）：${yoyStats ? fmtPct(yoyStats.chg) : '無'}（${yoyStats?.yearMonth || ''}）

【最佳表現】
- 最佳月份：${bestMonth?.yearMonth}（${fmtM(bestMonth?.[metric])}）
- 最低月份：${worstMonth?.yearMonth}（${fmtM(worstMonth?.[metric])}）
- 頂尖產品：${topProduct?.name || '未知'}（${fmtM(topProduct?.[metric])}）
- 頂尖客戶：${topCustomer?.name || '未知'}（${fmtM(topCustomer?.[metric])}）
- 頂尖品牌：${topBrand?.name || '未知'}（${fmtM(topBrand?.[metric])}）

【通路集中度】
- 主要通路「${channelConc?.name || '未知'}」佔比 ${channelConc ? channelConc.pct.toFixed(0) : '—'}%

請根據以上資料，從「業績 = 銷售數量 × 銷售金額 − 退貨 − 客訴」的角度出發，提供以下五部分：

1. **整體現況**（點明期間與核心數字）
2. **亮點表現**（最值得稱讚的成果）
3. **風險警示**（值得老闆關注的問題）
4. **提升銷售數量的具體建議**（如拓展客群、增加回購、提升轉單率）
5. **提升銷售金額的具體建議**（如提高單價、改善產品組合、減少過度折扣）
6. **降低退貨與客訴的具體建議**（品質控管、售後服務優化、客訴快速處理機制）

建議請具體可執行，不要泛泛而談。`

      const text = await callClaude(prompt, 1200)
      setAiText(text)
    } catch (e) {
      setAiError(e.message)
    }
    setAiLoading(false)
  }

  if (!summary) return (
    <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-base bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
      無資料，請先上傳銷售資料
    </div>
  )

  const avgPct = maxYearly > 0 ? avgMonthly / maxYearly * 100 : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">👔 老闆視角</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-base text-gray-400 dark:text-gray-500">一頁式關鍵指標決策總覽</p>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-700/50 text-sm font-medium text-blue-600 dark:text-blue-400">
              🗓️ {dateRangeLabel}
            </span>
          </div>
        </div>
        <button onClick={handleAI} disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-60">
          {aiLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🤖'}
          {aiLoading ? 'AI 撰寫中...' : 'AI 生成摘要＋建議'}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon="💰" label={`總${metricLabel}`} value={fmtM(summary.totalSales)} color="blue" />
        <KPICard icon="👥" label="客戶數" value={summary.customerCount?.toLocaleString()} color="purple" />
        <KPICard icon="📦" label="訂單數" value={summary.orderCount?.toLocaleString()} color="green" />
        <KPICard icon="📈" label="月增率" value={momStats ? fmtPct(momStats.chg) : '—'}
          color={momStats?.chg >= 0 ? 'green' : 'red'} sub={`上月 ${fmtM(momStats?.prev)}`} />
        <KPICard icon="📅" label="年增率" value={yoyStats ? fmtPct(yoyStats.chg) : '—'}
          color={yoyStats?.chg >= 0 ? 'green' : 'red'} sub={yoyStats?.yearMonth} />
        <KPICard icon="🏷️" label="產品數" value={summary.productCount?.toLocaleString()} color="amber" />
      </div>

      {/* ── 年度比對（篩選多年度時顯示）──────────────────────────────── */}
      {comparisonData?.byYear?.length >= 2 && (
        <Section title="📅 年度業績比對">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="text-left py-2 pr-4 font-semibold">年度</th>
                  <th className="text-right py-2 pr-4 font-semibold">{metric === 'subtotal' ? '銷售金額' : '銷售數量'}</th>
                  <th className="text-right py-2 pr-4 font-semibold">年增率</th>
                  <th className="text-right py-2 pr-4 font-semibold">訂單數</th>
                  <th className="text-right py-2 pr-4 font-semibold">客戶數</th>
                  <th className="text-right py-2 font-semibold">品項數</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.byYear.map((row, i) => {
                  const prev = comparisonData.byYear[i - 1]
                  const yoy = prev ? fmtPctRaw(row[metric], prev[metric]) : null
                  return (
                    <tr key={row.year} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 pr-4 font-bold text-gray-800 dark:text-gray-100">{row.year} 年</td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold text-gray-800 dark:text-gray-100">{fmtM(row[metric])}</td>
                      <td className="py-3 pr-4 text-right">
                        {yoy ? (
                          <span className={`font-mono font-bold ${yoy.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                            {yoy.label}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-600 dark:text-gray-300 font-mono">{row.orderCount?.toLocaleString?.() ?? '—'}</td>
                      <td className="py-3 pr-4 text-right text-gray-600 dark:text-gray-300 font-mono">{row.customerCount?.toLocaleString?.() ?? '—'}</td>
                      <td className="py-3 text-right text-gray-600 dark:text-gray-300 font-mono">{row.productCount?.toLocaleString?.() ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* 長條比較圖 */}
          <div className="mt-4 space-y-2">
            {(() => {
              const maxVal = Math.max(...comparisonData.byYear.map(r => r[metric] || 0), 1)
              const colors = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']
              return comparisonData.byYear.map((row, i) => {
                const pct = maxVal > 0 ? (row[metric] || 0) / maxVal * 100 : 0
                return (
                  <div key={row.year} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-300 w-14 flex-shrink-0">{row.year}</span>
                    <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                    </div>
                    <span className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-200 w-16 text-right flex-shrink-0">
                      {fmtM(row[metric])}
                    </span>
                  </div>
                )
              })
            })()}
          </div>
        </Section>
      )}

      {/* ── 各年月份比對圖（有多年資料時顯示）── */}
      {comparisonData?.byYear?.length >= 2 && (
        <MultiYearMonthlyChart trendData={trendData} comparisonData={comparisonData} metric={metric} />
      )}

      {/* AI narrative */}
      {(aiText || aiError) && (
        <Section title="🤖 AI 決策摘要 ＋ 行動建議">
          {aiError ? (
            <p className="text-red-500 text-base">{aiError}</p>
          ) : (
            <div className="prose prose-base max-w-none space-y-3">
              {aiText.split('\n').filter(l => l.trim()).map((line, i) => {
                const isBold = /^\*\*/.test(line.trim()) || /^\d+\./.test(line.trim())
                return (
                  <p key={i} className={`text-base leading-relaxed ${isBold ? 'font-bold text-gray-800 dark:text-gray-100 mt-4 mb-1' : 'text-gray-700 dark:text-gray-200'}`}>
                    {line.replace(/\*\*/g, '')}
                  </p>
                )
              })}
            </div>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Monthly Trend ── */}
        <Section title="📈 月份走勢">
          <div>
            {/* Year selection: multi-select toggles */}
            {availableYears.length > 1 && (
              <div className="flex gap-1.5 mb-4 flex-wrap items-center">
                <button
                  onClick={() => setSelectedYears([...availableYears])}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  全選
                </button>
                {availableYears.map(y => (
                  <button
                    key={y}
                    onClick={() => toggleYear(y)}
                    className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                      activeSelectedYears.includes(y)
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {y} 年
                  </button>
                ))}
                {isMultiYear && (
                  <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 ml-auto">
                    {[{ v: 'line', l: '折線' }, { v: 'bar', l: '柱狀' }].map(({ v, l }) => (
                      <button key={v} onClick={() => setMonthlyChartType(v)}
                        className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${monthlyChartType === v ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isMultiYear ? (
              /* ── Multi-year recharts chart ── */
              <div>
                <div className="flex items-center gap-4 flex-wrap mb-3">
                  {activeSelectedYears.map((y, i) => (
                    <span key={y} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      <span className="w-3 h-3 rounded-full" style={{ background: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                      {y} 年
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  {monthlyChartType === 'line' ? (
                    <LineChart data={multiYearMonthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={fmtM} tick={{ fontSize: 11 }} width={48} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-sm min-w-[150px]">
                            <p className="font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1.5 mb-1.5">{label}</p>
                            {[...payload].sort((a, b) => (b.value || 0) - (a.value || 0)).map((e, i) => (
                              <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.stroke }} />
                                  {e.name} 年
                                </span>
                                <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{fmtM(e.value)}</span>
                              </div>
                            ))}
                          </div>
                        )
                      }} />
                      {activeSelectedYears.map((y, i) => (
                        <Line key={y} type="monotone" dataKey={y} name={y} stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                          strokeWidth={2} dot={{ r: 3, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={multiYearMonthData} barCategoryGap="20%" barGap={2} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={fmtM} tick={{ fontSize: 11 }} width={48} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-sm min-w-[150px]">
                            <p className="font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1.5 mb-1.5">{label}</p>
                            {[...payload].sort((a, b) => (b.value || 0) - (a.value || 0)).map((e, i) => (
                              <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: e.fill }} />
                                  {e.name} 年
                                </span>
                                <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{fmtM(e.value)}</span>
                              </div>
                            ))}
                          </div>
                        )
                      }} />
                      {activeSelectedYears.map((y, i) => (
                        <Bar key={y} dataKey={y} name={y} fill={YEAR_COLORS[i % YEAR_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              /* ── Single-year horizontal bar chart ── */
              <div>
                <div className="flex items-center gap-3 mb-3 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" /> 最高月</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400 inline-block" /> 最低月</span>
                  <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-amber-400 inline-block" /> 月均</span>
                </div>
                <div className="space-y-1.5">
                  {yearlyTrend.map((d, i) => {
                    const isBest  = d.yearMonth === bestYM?.yearMonth && (d[metric] || 0) > 0
                    const isWorst = d.yearMonth === worstYM?.yearMonth && (d[metric] || 0) > 0
                    const pct     = maxYearly > 0 ? (d[metric] || 0) / maxYearly * 100 : 0
                    const isEmpty = !d[metric] || d[metric] === 0
                    const barColor  = isBest ? 'bg-emerald-400' : isWorst ? 'bg-red-400' : 'bg-indigo-400'
                    const textColor = isBest
                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                      : isWorst ? 'text-red-500 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-200'
                    return (
                      <div key={d.yearMonth} className="flex items-center gap-2">
                        <span className={`text-sm w-8 flex-shrink-0 ${isBest || isWorst ? textColor : 'text-gray-500 dark:text-gray-400'}`}>
                          {MONTH_ZH[i]}
                        </span>
                        <div className="relative flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-visible">
                          <div className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-amber-400 z-10"
                            style={{ left: `${avgPct}%` }} />
                          {!isEmpty && (
                            <div className={`h-full rounded-full transition-all ${barColor} ${isBest ? 'ring-2 ring-emerald-300' : isWorst ? 'ring-2 ring-red-300' : ''}`}
                              style={{ width: `${Math.max(pct, 0.5)}%` }} />
                          )}
                        </div>
                        <span className={`text-sm font-mono w-16 text-right flex-shrink-0 ${isEmpty ? 'text-gray-300 dark:text-gray-600' : textColor}`}>
                          {isEmpty ? '—' : fmtM(d[metric])}
                        </span>
                        <span className="text-xs w-6 flex-shrink-0">
                          {isBest ? '🏆' : isWorst ? '⚠️' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {avgMonthly > 0 && (
                  <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    月均 {fmtM(avgMonthly)}（虛線位置）
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* Top performers */}
        <Section title="🏆 各維度排名第一">
          <div className="space-y-3">
            {[
              { label: '最佳產品', value: topProduct?.name,   sub: fmtM(topProduct?.[metric]) },
              { label: '最佳客戶', value: topCustomer?.name,  sub: fmtM(topCustomer?.[metric]) },
              { label: '最佳品牌', value: topBrand?.name,     sub: fmtM(topBrand?.[metric]) },
              { label: '最佳月份', value: bestMonth?.yearMonth, sub: fmtM(bestMonth?.[metric]) },
            ].map(({ label, value, sub }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                <span className="text-base text-gray-500 dark:text-gray-400">{label}</span>
                <div className="text-right">
                  <span className="text-base font-bold text-gray-800 dark:text-gray-100">{value || '—'}</span>
                  {sub && <span className="ml-2 text-base text-emerald-600 font-mono font-semibold">{sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Channel concentration */}
        <Section title="🏪 通路集中度分析">
          {channelData?.length ? (
            <div className="space-y-3">
              {(() => {
                const total = channelData.reduce((s, d) => s + (d[metric] || 0), 0)
                return channelData.slice(0, 5).map((ch) => {
                  const pct = total > 0 ? (ch[metric] / total * 100) : 0
                  return (
                    <div key={ch.name}>
                      <div className="flex justify-between text-base mb-1">
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">{ch.name}</span>
                        <span className="font-mono text-gray-600 dark:text-gray-300">
                          {fmtM(ch[metric])} <span className="text-gray-400 dark:text-gray-500">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : <p className="text-gray-400 dark:text-gray-500 text-base">無通路資料</p>}
        </Section>

        {/* Risk signals */}
        <Section title="⚠️ 風險訊號">
          <div className="space-y-3">
            {(() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3  = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
              const pct   = total > 0 ? top3 / total * 100 : 0
              const level = pct > 70 ? 'high' : pct > 50 ? 'medium' : 'low'
              const colors = {
                high:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400',
                medium: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400',
                low:    'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
              }
              return (
                <div className={`rounded-xl border p-3 ${colors[level]}`}>
                  <p className="text-base font-bold">客戶集中度</p>
                  <p className="text-sm opacity-80">
                    前 3 大客戶佔總{metricLabel} {pct.toFixed(0)}%
                    {pct > 70 ? ' — 高度集中，單一客戶流失風險大' : pct > 50 ? ' — 中度集中，建議分散客源' : ' — 客源分散，健康'}
                  </p>
                </div>
              )
            })()}

            {momStats && momStats.chg < -10 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">月度下滑警告</p>
                <p className="text-sm opacity-80">最新月份較上月下降 {Math.abs(momStats.chg).toFixed(0)}%，需關注原因</p>
              </div>
            )}

            {yoyStats && yoyStats.chg < -15 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">年度同期下滑</p>
                <p className="text-sm opacity-80">{yoyStats.yearMonth} 年增率 {fmtPct(yoyStats.chg)}，低於去年同期</p>
              </div>
            )}

            {(!momStats || momStats.chg >= -10) && (!yoyStats || yoyStats.chg >= -15) && (() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3  = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
              return total > 0 && top3 / total <= 0.7
            })() && (
              <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400 p-3">
                <p className="text-base font-bold">✅ 整體運營健康</p>
                <p className="text-sm opacity-80">各項指標正常，無明顯風險訊號</p>
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-center">
        本摘要依篩選期間「{dateRangeLabel}」自動生成 · 業績公式：銷售數量 × 銷售金額 − 退貨 − 客訴
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import ChartCard from '../ChartCard'
import { calcValueAxisWidth, getMaxValue } from '../../utils/chartUtils'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16']
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function fmtVal(v, metric) {
  if (v == null || v === 0) return '—'
  if (metric === 'quantity') return Math.round(v).toLocaleString()
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function GrowthBadge({ rate }) {
  if (rate == null) return <span className="text-gray-300 text-base">—</span>
  const cls = rate > 0
    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50'
    : rate < 0
    ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50'
    : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-base font-bold ${cls}`}>
      {rate > 0 ? '▲' : rate < 0 ? '▼' : ''} {Math.abs(rate).toFixed(0)}%
    </span>
  )
}

function RankBadge({ rank }) {
  const cls = rank === 1 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700/50'
    : rank === 2 ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
    : rank === 3 ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700/50'
    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-gray-600'
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-base font-bold border ${cls}`}>
      {rank}
    </span>
  )
}

// 計算說明提示
function CalcHint({ type }) {
  const hints = {
    yoy: '同比成長 = (本期 − 同期去年) ÷ 同期去年 × 100%',
    qoq_year: '年度成長 = (本年 − 上年) ÷ 上年 × 100%',
    qoq_quarter: '季度成長 = (本季 − 上年同季) ÷ 上年同季 × 100%',
    mom: '月度成長 = (本月 − 上年同月) ÷ 上年同月 × 100%',
  }
  return (
    <div className="inline-flex items-center gap-1 group relative">
      <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-xs flex items-center justify-center cursor-help font-bold">?</span>
      <div className="absolute left-5 top-0 hidden group-hover:block z-20 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap shadow-xl min-w-max">
        {hints[type]}
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">{title}</h3>
      {subtitle && <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-sm min-w-[150px]">
      <p className="font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1.5 mb-1.5">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: e.fill || e.stroke }} />
            {e.name}
          </span>
          <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{(e.value || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ─── YoY Section ─────────────────────────────────────────────────────────────
function YoYSection({ comparisonData, metric }) {
  const { byYear } = comparisonData
  const metricLabel = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const yoyRows = useMemo(() => {
    const rows = byYear.map((d, i) => {
      const prev = byYear[i - 1]
      const growth = prev && prev[metric] > 0 ? ((d[metric] - prev[metric]) / prev[metric] * 100) : null
      return { ...d, growth }
    })
    const sorted = [...rows].sort((a, b) => b[metric] - a[metric])
    const rankMap = {}
    sorted.forEach((r, i) => { rankMap[r.year] = i + 1 })
    return rows.map(r => ({ ...r, rank: rankMap[r.year] }))
  }, [byYear, metric])

  if (!yoyRows.length) return <p className="text-gray-400 dark:text-gray-500 text-base py-8 text-center">暫無資料</p>

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <SectionHeader title="年度銷售對比" subtitle="各年度總銷售額及同比成長率" />
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={yoyRows} barCategoryGap="35%" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="year" tick={{ fontSize: 14, fontWeight: 600 }} />
            <YAxis tickFormatter={v => fmtVal(v, metric)} tick={{ fontSize: 13 }} width={calcValueAxisWidth(getMaxValue(yoyRows, metric), v => fmtVal(v, metric))} />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Bar dataKey={metric} name={metricLabel} fill="#3B82F6" radius={[8, 8, 0, 0]} maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <SectionHeader title="年度明細" />
        <table className="w-full">
          <thead>
            <tr className="text-base text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th className="text-center py-2 pr-4 w-12">排名</th>
              <th className="text-left py-2 pr-6">年份</th>
              <th className="text-right py-2 pr-6">{metricLabel}</th>
              <th className="text-right py-2 pr-6">較上年差異</th>
              <th className="text-right py-2">
                <span className="flex items-center justify-end gap-1.5">
                  同比成長 <CalcHint type="yoy" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {yoyRows.map((row) => {
              const prev = yoyRows.find(r => String(parseInt(row.year) - 1) === r.year)
              const diff = prev ? row[metric] - prev[metric] : null
              return (
                <tr key={row.year} className="border-b border-gray-50 dark:border-gray-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors">
                  <td className="py-2.5 pr-4 text-center"><RankBadge rank={row.rank} /></td>
                  <td className="py-2.5 pr-6 font-bold text-gray-800 dark:text-gray-200 text-base">{row.year}</td>
                  <td className="py-2.5 pr-6 text-right font-mono font-semibold text-base text-gray-800 dark:text-gray-200">
                    {fmtVal(row[metric], metric)}
                  </td>
                  <td className="py-2.5 pr-6 text-right font-mono text-base">
                    {diff != null ? (
                      <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                        {diff >= 0 ? '+' : ''}{fmtVal(Math.abs(diff), metric)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <GrowthBadge rate={row.growth} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── QoQ Section ─────────────────────────────────────────────────────────────
function QoQSection({ comparisonData, metric }) {
  const { byYear, byQuarter } = comparisonData
  const metricLabel = metric === 'subtotal' ? '銷售金額' : '銷售數量'
  const years = useMemo(() => byYear.map(d => d.year), [byYear])

  const chartData = useMemo(() => ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
    const entry = { quarter: q }
    years.forEach(year => {
      const qNum = parseInt(q[1])
      const found = byQuarter.find(d => d.year === year && d.quarter === qNum)
      entry[year] = found ? found[metric] : null
    })
    return entry
  }), [byQuarter, years, metric])

  const yearRankMap = useMemo(() => {
    const totals = years.map(year => ({ year, val: byYear.find(d => d.year === year)?.[metric] || 0 }))
    const sorted = [...totals].sort((a, b) => b.val - a.val)
    const map = {}
    sorted.forEach((r, i) => { map[r.year] = i + 1 })
    return map
  }, [years, byYear, metric])

  if (!byQuarter.length) return <p className="text-gray-400 dark:text-gray-500 text-base py-8 text-center">暫無資料</p>

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <SectionHeader title="季度銷售對比" subtitle="各年度 Q1–Q4 季度比較" />
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="25%" barGap={4} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 14, fontWeight: 600 }} />
            <YAxis tickFormatter={v => fmtVal(v, metric)} tick={{ fontSize: 13 }} width={calcValueAxisWidth(getMaxValue(chartData, years), v => fmtVal(v, metric))} />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {years.map((year, i) => (
              <Bar key={year} dataKey={year} fill={COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} maxBarSize={60} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 overflow-x-auto">
        <SectionHeader title="季度明細" />
        <p className="text-base text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
          括號內數字為與上年同季對比 <CalcHint type="qoq_quarter" />
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-base text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th className="text-center py-2 pr-3 w-12">排名</th>
              <th className="text-left py-2 pr-5">年份</th>
              {['Q1','Q2','Q3','Q4'].map(q => (
                <th key={q} className="text-right py-2 px-4">{q}</th>
              ))}
              <th className="text-right py-2 pl-4 border-l border-gray-100 dark:border-gray-700">
                <span className="flex items-center justify-end gap-1.5">全年合計 <CalcHint type="qoq_year" /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((year, yi) => {
              const yearTotal = byYear.find(d => d.year === year)?.[metric] || 0
              const prevYear = years[yi - 1]
              const prevTotal = prevYear ? byYear.find(d => d.year === prevYear)?.[metric] : null
              const yGrowth = prevTotal > 0 ? ((yearTotal - prevTotal) / prevTotal * 100) : null
              return (
                <tr key={year} className="border-b border-gray-50 dark:border-gray-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors">
                  <td className="py-2.5 pr-3 text-center"><RankBadge rank={yearRankMap[year]} /></td>
                  <td className="py-2.5 pr-5 font-bold text-base text-gray-800 dark:text-gray-200">{year}</td>
                  {[1,2,3,4].map(q => {
                    const found = byQuarter.find(d => d.year === year && d.quarter === q)
                    const prevYFound = prevYear ? byQuarter.find(d => d.year === prevYear && d.quarter === q) : null
                    const qGrowth = prevYFound && prevYFound[metric] > 0
                      ? ((found?.[metric] || 0) - prevYFound[metric]) / prevYFound[metric] * 100
                      : null
                    return (
                      <td key={q} className="py-2.5 px-4 text-right">
                        <div className="font-mono text-base text-gray-800 dark:text-gray-200 font-semibold">
                          {found ? fmtVal(found[metric], metric) : '—'}
                        </div>
                        {qGrowth != null && (
                          <div className="mt-0.5"><GrowthBadge rate={qGrowth} /></div>
                        )}
                      </td>
                    )
                  })}
                  <td className="py-2.5 pl-4 text-right border-l border-gray-100 dark:border-gray-700">
                    <div className="font-mono font-bold text-base text-blue-700 dark:text-blue-400">{fmtVal(yearTotal, metric)}</div>
                    {yGrowth != null && (
                      <div className="mt-0.5"><GrowthBadge rate={yGrowth} /></div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── MoM Section ─────────────────────────────────────────────────────────────
function MoMSection({ trendData, comparisonData, metric }) {
  const { byYear } = comparisonData
  const metricLabel = metric === 'subtotal' ? '銷售金額' : '銷售數量'
  const years = useMemo(() => byYear.map(d => d.year), [byYear])

  const chartData = useMemo(() => {
    const monthMap = {}
    trendData.forEach(d => {
      const [year, month] = d.yearMonth.split('-')
      const mIdx = parseInt(month) - 1
      const mLabel = MONTH_LABELS[mIdx]
      if (!monthMap[mLabel]) monthMap[mLabel] = { month: mLabel, mIdx }
      monthMap[mLabel][year] = (monthMap[mLabel][year] || 0) + d[metric]
    })
    return Object.values(monthMap).sort((a, b) => a.mIdx - b.mIdx)
  }, [trendData, metric])

  const yearRankMap = useMemo(() => {
    const totals = years.map(year => ({
      year,
      val: chartData.reduce((s, md) => s + (md[year] || 0), 0)
    }))
    const sorted = [...totals].sort((a, b) => b.val - a.val)
    const map = {}
    sorted.forEach((r, i) => { map[r.year] = i + 1 })
    return map
  }, [years, chartData])

  // For each month, rank which year had the highest value
  const monthRankMap = useMemo(() => {
    const map = {}
    chartData.forEach(md => {
      const sorted = [...years].sort((a, b) => (md[b] || 0) - (md[a] || 0))
      map[md.month] = {}
      sorted.forEach((year, i) => { map[md.month][year] = i + 1 })
    })
    return map
  }, [chartData, years])

  if (!trendData.length) return <p className="text-gray-400 dark:text-gray-500 text-base py-8 text-center">暫無資料</p>

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <SectionHeader title="月度銷售對比" subtitle="各年度月份銷售走勢比較" />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 13 }} />
            <YAxis tickFormatter={v => fmtVal(v, metric)} tick={{ fontSize: 13 }} width={calcValueAxisWidth(getMaxValue(chartData, years), v => fmtVal(v, metric))} />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {years.map((year, i) => (
              <Line
                key={year} type="monotone" dataKey={year}
                stroke={COLORS[i % COLORS.length]} strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 overflow-x-auto">
        <SectionHeader title="月度明細" />
        <p className="text-base text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
          括號內數字為與上年同月對比 <CalcHint type="mom" />
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-base text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th className="text-center py-2 pr-3 w-12 sticky left-0 bg-white dark:bg-gray-800">排名</th>
              <th className="text-left py-2 pr-4 sticky left-12 bg-white dark:bg-gray-800">年份</th>
              {MONTH_LABELS.map(m => (
                <th key={m} className="text-right py-2 px-2 whitespace-nowrap">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year, yi) => {
              const prevYear = years[yi - 1]
              return (
                <tr key={year} className="border-b border-gray-50 dark:border-gray-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors">
                  <td className="py-2.5 pr-3 text-center sticky left-0 bg-white dark:bg-gray-800"><RankBadge rank={yearRankMap[year]} /></td>
                  <td className="py-2.5 pr-4 font-bold text-base text-gray-800 dark:text-gray-200 sticky left-12 bg-white dark:bg-gray-800">{year}</td>
                  {chartData.map(md => {
                    const val = md[year]
                    const prevVal = prevYear ? md[prevYear] : null
                    const growth = prevVal > 0 && val != null ? ((val - prevVal) / prevVal * 100) : null
                    const mRank = monthRankMap[md.month]?.[year]
                    return (
                      <td key={md.month} className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {mRank === 1 && val > 0 && (
                            <span className="text-yellow-500 text-xs">★</span>
                          )}
                          <span className="font-mono text-base text-gray-800 dark:text-gray-200 font-semibold whitespace-nowrap">
                            {val != null ? fmtVal(val, metric) : '—'}
                          </span>
                        </div>
                        {growth != null && (
                          <div className="mt-0.5"><GrowthBadge rate={growth} /></div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ComparisonChart({ comparisonData, trendData, filtered, metric }) {
  const [activeSection, setActiveSection] = useState('yoy')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [showProductList, setShowProductList] = useState(false)

  const SECTIONS = [
    { id: 'yoy', label: '年 對 年', icon: '📅', desc: 'YoY' },
    { id: 'qoq', label: '季 對 季', icon: '📊', desc: 'QoQ' },
    { id: 'mom', label: '月 對 月', icon: '📈', desc: 'MoM' },
  ]

  // All products from filtered rows
  const products = useMemo(() =>
    [...new Set((filtered || []).map(r => r.product).filter(Boolean))].sort(),
    [filtered]
  )

  const filteredProducts = useMemo(() =>
    productQuery ? products.filter(p => p.toLowerCase().includes(productQuery.toLowerCase())) : products,
    [products, productQuery]
  )

  // Compute data for selected product (or use pre-computed comparisonData/trendData for all)
  const { activeCompData, activeTrendData } = useMemo(() => {
    if (!selectedProduct || !filtered) return { activeCompData: comparisonData, activeTrendData: trendData }

    const rows = filtered.filter(r => r.product === selectedProduct)

    // byYear
    const yearMap = {}
    rows.forEach(r => {
      if (!yearMap[r.year]) yearMap[r.year] = { year: r.year, subtotal: 0, quantity: 0 }
      yearMap[r.year].subtotal += r.subtotal || 0
      yearMap[r.year].quantity += r.quantity || 0
    })
    const byYear = Object.values(yearMap).sort((a, b) => a.year.localeCompare(b.year))

    // byQuarter
    const qMap = {}
    rows.forEach(r => {
      const q = Math.ceil(parseInt(r.month) / 3)
      const key = `${r.year}-Q${q}`
      if (!qMap[key]) qMap[key] = { label: key, year: r.year, quarter: q, subtotal: 0, quantity: 0 }
      qMap[key].subtotal += r.subtotal || 0
      qMap[key].quantity += r.quantity || 0
    })
    const byQuarter = Object.values(qMap).sort((a, b) => a.label.localeCompare(b.label))

    // trendData (byYearMonth)
    const tmMap = {}
    rows.forEach(r => {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`
      if (!tmMap[key]) tmMap[key] = { yearMonth: key, subtotal: 0, quantity: 0 }
      tmMap[key].subtotal += r.subtotal || 0
      tmMap[key].quantity += r.quantity || 0
    })
    const newTrendData = Object.values(tmMap).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

    return { activeCompData: { byYear, byQuarter }, activeTrendData: newTrendData }
  }, [filtered, selectedProduct, comparisonData, trendData])

  return (
    <ChartCard title="對比分析" subtitle="Year / Quarter / Month 同比對比">
      <div className="space-y-4">
        {/* Product selector */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-bold text-gray-700 dark:text-gray-200">單一產品篩選</span>
            {selectedProduct ? (
              <div className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-sm font-bold">
                <span>{selectedProduct}</span>
                <button
                  onClick={() => { setSelectedProduct(''); setProductQuery(''); }}
                  className="w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center text-xs font-bold"
                >✕</button>
              </div>
            ) : (
              <span className="text-sm text-gray-400 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5">
                全部（彙總）
              </span>
            )}
            <div className="relative">
              <button
                onClick={() => setShowProductList(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 transition-all"
              >
                🔍 選擇產品
                <span className="text-xs text-gray-400">({products.length})</span>
              </button>
              {showProductList && (
                <div className="absolute top-10 left-0 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-72 overflow-hidden">
                  <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <input
                      type="text"
                      value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
                      placeholder="搜尋產品名稱..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-400 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedProduct(''); setProductQuery(''); setShowProductList(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-gray-50 dark:border-gray-700 ${!selectedProduct ? 'font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-600 dark:text-gray-300'}`}
                    >
                      全部（彙總）
                    </button>
                    {filteredProducts.map(p => (
                      <button
                        key={p}
                        onClick={() => { setSelectedProduct(p); setProductQuery(''); setShowProductList(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${selectedProduct === p ? 'font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        {p}
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-6">找不到產品</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section selector */}
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-bold transition-all border ${
                activeSection === s.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200 dark:shadow-blue-900/50'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              <span className={`text-sm font-normal ${activeSection === s.id ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                {s.desc}
              </span>
            </button>
          ))}
        </div>

        {activeSection === 'yoy' && (
          <YoYSection comparisonData={activeCompData} metric={metric} />
        )}
        {activeSection === 'qoq' && (
          <QoQSection comparisonData={activeCompData} metric={metric} />
        )}
        {activeSection === 'mom' && (
          <MoMSection trendData={activeTrendData} comparisonData={activeCompData} metric={metric} />
        )}
      </div>
    </ChartCard>
  )
}

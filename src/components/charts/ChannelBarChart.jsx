import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList
} from 'recharts'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'
import { calcNameAxisWidth, calcValueAxisWidth, getMaxValue } from '../../utils/chartUtils'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1']

function fmtY(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

// ─── Heatmap color helpers ─────────────────────────────────────────────────────
function hmValueColor(value, max, isDark) {
  if (isDark) {
    if (max === 0) return '#1f2937'
    const r = value / max
    if (r === 0) return '#1f2937'
    return `rgb(${Math.round(30+r*66)},${Math.round(58+r*107)},${Math.round(138+r*112)})`
  }
  if (max === 0) return '#f3f4f6'
  const r = value / max
  if (r === 0) return '#f9fafb'
  return `rgb(${Math.round(219-r*180)},${Math.round(234-r*160)},${Math.round(254-r*80)})`
}
function hmGrowthColor(rate, maxAbs, isDark) {
  if (rate == null) return isDark ? '#1f2937' : '#f9fafb'
  if (maxAbs === 0) return isDark ? '#374151' : '#f3f4f6'
  const ratio = Math.min(Math.abs(rate) / maxAbs, 1)
  if (rate > 0) {
    if (isDark) return `rgb(${Math.round(10+(1-ratio)*40)},${Math.round(100+ratio*100)},${Math.round(40+ratio*20)})`
    return `rgb(${Math.round(220-ratio*170)},${Math.round(252-ratio*80)},${Math.round(220-ratio*185)})`
  }
  if (rate < 0) {
    if (isDark) return `rgb(${Math.round(80+ratio*130)},25,25)`
    return `rgb(255,${Math.round(220-ratio*165)},${Math.round(220-ratio*165)})`
  }
  return isDark ? '#374151' : '#f3f4f6'
}
function hmValueText(value, max, isDark) {
  const high = max > 0 && value / max > 0.5
  return isDark ? (high ? '#ffffff' : '#93c5fd') : (high ? '#1e3a5f' : '#6b7280')
}
function hmGrowthText(rate, isDark) {
  if (rate == null) return isDark ? '#4b5563' : '#d1d5db'
  if (rate > 0) return isDark ? '#86efac' : '#15803d'
  if (rate < 0) return isDark ? '#fca5a5' : '#dc2626'
  return isDark ? '#9ca3af' : '#6b7280'
}
function fmtGrowth(v) {
  if (v == null) return '—'
  return `${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v).toFixed(0)}%`
}

const RADIAN = Math.PI / 180
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  return (
    <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700}>
      {Math.round(percent * 100)}%
    </text>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 min-w-[180px]">
      <p className="text-base font-bold text-gray-700 dark:text-gray-200 border-b dark:border-gray-700 pb-2 mb-2">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-base">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: e.fill || e.color }} />{e.name}
          </span>
          <span className="font-mono font-bold text-base text-gray-800 dark:text-gray-100">{Math.round(e.value || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Channel × Brand × Month Heatmap ──────────────────────────────────────────
const CELL_W = 76

function ChannelBrandMonthTable({ channelBrandMonthData, metric }) {
  const { map, channels, months } = channelBrandMonthData
  const [selectedChannel, setSelectedChannel] = useState(() => channels[0] || '')
  const [displayMode, setDisplayMode] = useState('value')
  const isDark = document.documentElement.classList.contains('dark')
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const { rows, activeMonths } = useMemo(() => {
    if (!selectedChannel || !map[selectedChannel]) return { rows: [], activeMonths: [] }
    const chMap = map[selectedChannel]
    // 取該通路前 20 大品牌
    const brandTotals = {}
    Object.entries(chMap).forEach(([br, mMap]) => {
      brandTotals[br] = Object.values(mMap).reduce((s, v) => s + v, 0)
    })
    const topBrands = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([b]) => b)
    const rows = topBrands.map(br => {
      const entry = { brand: br }
      months.forEach(m => { entry[m] = chMap[br]?.[m] || 0 })
      return entry
    }).filter(row => months.some(m => row[m] > 0))
    const activeMonths = months.filter(m => rows.some(row => row[m] > 0))
    return { rows, activeMonths }
  }, [selectedChannel, map, months])

  const maxVal = useMemo(() => {
    let max = 0
    rows.forEach(row => { activeMonths.forEach(m => { if ((row[m] || 0) > max) max = row[m] }) })
    return max
  }, [rows, activeMonths])

  const yearGroups = useMemo(() => {
    const groups = {}
    activeMonths.forEach(m => {
      const y = m.slice(0, 4)
      if (!groups[y]) groups[y] = []
      groups[y].push(m)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [activeMonths])

  const growthRows = useMemo(() => {
    if (displayMode === 'value') return null
    return rows.map(row => {
      const entry = { brand: row.brand }
      activeMonths.forEach(m => {
        const v = row[m] || 0
        if (displayMode === 'mom') {
          const [y, mo] = m.split('-').map(Number)
          const prevMo = mo === 1 ? 12 : mo - 1
          const prevY  = mo === 1 ? y - 1 : y
          const prevM  = `${prevY}-${String(prevMo).padStart(2, '0')}`
          const prevV  = months.includes(prevM) ? (row[prevM] ?? 0) : null
          entry[m] = (prevV != null && prevV > 0) ? (v - prevV) / prevV * 100 : null
        } else {
          const prevYearM = `${parseInt(m.slice(0, 4)) - 1}${m.slice(4)}`
          const prevV = months.includes(prevYearM) ? (row[prevYearM] ?? 0) : null
          entry[m] = (prevV != null && prevV > 0) ? (v - prevV) / prevV * 100 : null
        }
      })
      return entry
    })
  }, [rows, activeMonths, months, displayMode])

  const growthMaxAbs = useMemo(() => {
    if (!growthRows) return 0
    let max = 0
    growthRows.forEach(row => {
      activeMonths.forEach(m => { if (row[m] != null && Math.abs(row[m]) > max) max = Math.abs(row[m]) })
    })
    return max || 100
  }, [growthRows, activeMonths])

  const rowTotals = useMemo(() => {
    const t = {}
    rows.forEach(row => { t[row.brand] = activeMonths.reduce((s, m) => s + (row[m] || 0), 0) })
    return t
  }, [rows, activeMonths])

  const colTotals = useMemo(() => {
    const t = {}
    activeMonths.forEach(m => { t[m] = rows.reduce((s, row) => s + (row[m] || 0), 0) })
    return t
  }, [rows, activeMonths])

  const grandTotal = useMemo(() => Object.values(rowTotals).reduce((s, v) => s + v, 0), [rowTotals])
  const isGrowthMode = displayMode !== 'value'

  if (!channels.length) {
    return <div className="flex items-center justify-center h-64 text-gray-400">無通路月度資料</div>
  }

  return (
    <div className="space-y-4">
      {/* 通路選擇 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">選擇通路</h4>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch, i) => (
            <button key={ch} onClick={() => setSelectedChannel(ch)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedChannel === ch ? 'text-white border-transparent shadow-sm' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
              style={selectedChannel === ch ? { background: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] } : {}}>
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* 顯示模式 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">顯示模式：</span>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
          {[{ v: 'value', l: '銷售值' }, { v: 'mom', l: '月環比' }, { v: 'yoy', l: '年同比' }].map(({ v, l }) => (
            <button key={v} onClick={() => setDisplayMode(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                displayMode === v
                  ? v === 'value' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'bg-emerald-500 text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}>
              {l}
            </button>
          ))}
        </div>
        {isGrowthMode && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 px-2 py-1 rounded-lg font-medium">
            {displayMode === 'mom' ? '▲▼ 與上個月比較' : '▲▼ 與去年同月比較'}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          {selectedChannel ? '此通路無品牌月度數據' : '請選擇通路'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <div className="mb-3">
            <h4 className="text-base font-bold text-gray-700 dark:text-gray-200">
              {selectedChannel} — 各品牌月度{isGrowthMode ? (displayMode === 'mom' ? '月環比' : '年同比') : label}
            </h4>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {rows.length} 個品牌 × {activeMonths.length} 個月{isGrowthMode && ' · 綠色成長 / 紅色衰退'}
            </p>
          </div>

          {/* 圖例 */}
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-4">
            {isGrowthMode ? (
              <>
                <span className="font-medium text-red-500 dark:text-red-400">衰退</span>
                <div className="flex rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                  {[-1, -0.5, -0.15, 0.15, 0.5, 1].map(r => (
                    <div key={r} className="w-8 h-5" style={{ background: hmGrowthColor(r * growthMaxAbs, growthMaxAbs, isDark) }} />
                  ))}
                </div>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">成長</span>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded-lg">±{Math.round(growthMaxAbs)}%</span>
              </>
            ) : (
              <>
                <span className="font-medium">低</span>
                <div className="flex rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                  {[0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map(r => (
                    <div key={r} className="w-8 h-5" style={{ background: hmValueColor(r * maxVal, maxVal, isDark) }} />
                  ))}
                </div>
                <span className="font-medium">高</span>
              </>
            )}
          </div>

          <p className="sm:hidden text-xs text-center text-gray-400 mb-2">← 左右滑動 →</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
            <table className="border-collapse" style={{ minWidth: `${activeMonths.length * CELL_W + 200}px` }}>
              <thead>
                <tr>
                  <th rowSpan={2} className="text-left px-3 py-3 text-sm text-gray-500 dark:text-gray-400 font-bold sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 border-b-2 border-r-2 border-gray-200 dark:border-gray-600" style={{ minWidth: 140 }}>
                    品牌
                  </th>
                  {yearGroups.map(([year, mos]) => (
                    <th key={year} colSpan={mos.length} className="text-center py-2 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-b border-blue-200 dark:border-blue-700/50">
                      {year}年
                    </th>
                  ))}
                  {!isGrowthMode && (
                    <th rowSpan={2} className="text-right px-3 py-3 text-sm text-gray-600 dark:text-gray-300 font-bold bg-gray-100 dark:bg-gray-700/50 border-b-2 border-l-2 border-gray-200 dark:border-gray-600 whitespace-nowrap" style={{ minWidth: 72 }}>
                      合計
                    </th>
                  )}
                </tr>
                <tr>
                  {activeMonths.map((m, idx) => {
                    const isFirst = idx === 0 || activeMonths[idx - 1].slice(0, 4) !== m.slice(0, 4)
                    return (
                      <th key={m} className={`text-center py-2 text-sm text-gray-600 dark:text-gray-300 font-semibold bg-gray-50 dark:bg-gray-800 border-b-2 border-b-gray-200 dark:border-b-gray-600 ${isFirst ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-gray-100 dark:border-l-gray-700'}`} style={{ minWidth: CELL_W }}>
                        {parseInt(m.slice(5))}月
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isEven = rowIdx % 2 === 0
                  const stickyBg = isEven ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/40'
                  const growthRow = growthRows?.find(r => r.brand === row.brand)
                  return (
                    <tr key={row.brand} className={`border-b border-gray-100 dark:border-gray-700/80 ${isEven ? '' : 'bg-gray-50/30 dark:bg-gray-700/10'}`}>
                      <td className={`px-3 py-3 text-sm text-gray-700 dark:text-gray-200 font-bold sticky left-0 z-10 border-r-2 border-gray-200 dark:border-gray-600 whitespace-nowrap ${stickyBg}`}>
                        {row.brand}
                      </td>
                      {activeMonths.map((m, idx) => {
                        const rawVal = row[m] || 0
                        const growthVal = growthRow?.[m] ?? null
                        const bg = isGrowthMode ? hmGrowthColor(growthVal, growthMaxAbs, isDark) : hmValueColor(rawVal, maxVal, isDark)
                        const textColor = isGrowthMode ? hmGrowthText(growthVal, isDark) : hmValueText(rawVal, maxVal, isDark)
                        const isFirst = idx === 0 || activeMonths[idx - 1].slice(0, 4) !== m.slice(0, 4)
                        return (
                          <td key={m}
                            title={isGrowthMode
                              ? `${row.brand} / ${m}：${growthVal != null ? fmtGrowth(growthVal) : '無前期'}\n實際：${rawVal.toLocaleString()}`
                              : `${row.brand} / ${m}：${rawVal.toLocaleString()}`}
                            className={`text-center py-3 text-sm font-semibold ${isFirst ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-white/70 dark:border-l-gray-800'}`}
                            style={{ background: bg, color: textColor }}>
                            {isGrowthMode ? fmtGrowth(growthVal) : fmtY(rawVal)}
                          </td>
                        )
                      })}
                      {!isGrowthMode && (
                        <td className={`text-right px-3 py-3 text-sm font-bold text-blue-700 dark:text-blue-400 border-l-2 border-gray-200 dark:border-gray-600 whitespace-nowrap ${stickyBg}`}>
                          {fmtY(rowTotals[row.brand] || 0)}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {!isGrowthMode && (
                  <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/60">
                    <td className="px-3 py-3 text-sm font-black text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-100 dark:bg-gray-700/60 border-r-2 border-gray-200 dark:border-gray-600 whitespace-nowrap z-10">合計</td>
                    {activeMonths.map((m, idx) => {
                      const isFirst = idx === 0 || activeMonths[idx - 1].slice(0, 4) !== m.slice(0, 4)
                      return (
                        <td key={m} className={`text-center py-3 text-sm font-bold text-gray-700 dark:text-gray-300 ${isFirst ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-gray-200 dark:border-l-gray-600'}`}>
                          {fmtY(colTotals[m] || 0)}
                        </td>
                      )
                    })}
                    <td className="text-right px-3 py-3 text-sm font-black text-blue-800 dark:text-blue-300 border-l-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/60 whitespace-nowrap">
                      {fmtY(grandTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ChannelBarChart ──────────────────────────────────────────────────────
export default function ChannelBarChart({ channelData, channelTypeData, channelCustomerData, channelBrandMonthData, metric }) {
  const [view, setView] = useState('channel')

  const dataKey = view === 'customerCount' ? 'customerCount' : metric
  const barLabel = view === 'customerCount' ? '客戶數' : (metric === 'subtotal' ? '銷售金額' : '銷售數量')
  const data = view === 'channel' ? channelData : view === 'channelType' ? channelTypeData : (channelCustomerData || [])

  const VIEWS = [
    { v: 'channel',       l: '網路/實體' },
    { v: 'channelType',   l: '通路類型' },
    { v: 'customerCount', l: '客戶數統計' },
    { v: 'monthly_brand', l: '📅 月度品牌' },
  ]

  const viewSelector = (
    <div className="overflow-x-auto pb-0.5 -mb-0.5">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl w-max min-w-full">
        {VIEWS.map(({ v, l }) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-1.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs sm:text-base font-medium transition-all whitespace-nowrap ${view === v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <ChartCard title={`通路分析 — ${barLabel}`}>
      {(expanded) => {
        const chartH = expanded ? 'calc(50vh - 60px)' : (typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 300)
        return (
          <div className="space-y-4">
            {viewSelector}

            {/* 月度品牌熱力表 */}
            {view === 'monthly_brand' && (
              channelBrandMonthData
                ? <ChannelBrandMonthTable channelBrandMonthData={channelBrandMonthData} metric={metric} />
                : <div className="flex items-center justify-center h-64 text-base text-gray-400 dark:text-gray-500">無資料，請先上傳銷售數據</div>
            )}

            {view !== 'monthly_brand' && data.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-base text-gray-400 dark:text-gray-500">無資料</div>
            ) : view !== 'monthly_brand' && (
              <div className={`grid gap-4 ${expanded ? 'grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Bar chart */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">
                    {view === 'customerCount' ? '各通路類型客戶數' : '銷售比較'}
                  </h4>
                  <div style={{ height: chartH, minHeight: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {(() => {
                        const nameW = calcNameAxisWidth(data)
                        const maxV = getMaxValue(data, dataKey)
                        const labelW = view === 'customerCount'
                          ? String(maxV).length * 9 + 24
                          : fmtY(maxV).length * 9 + 24
                        return (
                      <BarChart data={data} layout="vertical" margin={{ top: 5, right: labelW, left: 4, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                        <XAxis type="number" tickFormatter={view === 'customerCount' ? undefined : fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#6b7280' }} width={nameW} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 14 }} />
                        <Bar dataKey={dataKey} name={barLabel} radius={[0, 6, 6, 0]} maxBarSize={32}>
                          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          <LabelList dataKey={dataKey} position="right"
                            formatter={view === 'customerCount' ? v => v + ' 位' : fmtY}
                            style={{ fontSize: 14, fill: '#9ca3af' }} />
                        </Bar>
                      </BarChart>
                        )
                      })()}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie chart or customer detail */}
                {view === 'customerCount' ? (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                    <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">通路客群詳情</h4>
                    <div className="space-y-3 overflow-y-auto" style={{ maxHeight: expanded ? 'calc(50vh - 80px)' : 280 }}>
                      {data.map((d, i) => (
                        <div key={d.name} className="p-3 rounded-lg bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-base font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name}
                            </span>
                            <span className="text-base font-bold" style={{ color: COLORS[i % COLORS.length] }}>{d.customerCount} 位</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center">
                            <div className="bg-gray-50 dark:bg-gray-700/60 rounded-md p-2 border border-gray-100 dark:border-gray-600">
                              <div className="text-base font-bold text-gray-700 dark:text-gray-200">{d.brandCount || 0}</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500">品牌</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/60 rounded-md p-2 border border-gray-100 dark:border-gray-600">
                              <div className="text-base font-bold text-gray-700 dark:text-gray-200">{d.productCount || 0}</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500">品項</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/60 rounded-md p-2 border border-gray-100 dark:border-gray-600">
                              <div className="text-base font-bold text-gray-700 dark:text-gray-200">{fmtY(d.subtotal)}</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500">金額</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                    <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">佔比分析</h4>
                    <div style={{ height: chartH, minHeight: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data} dataKey={dataKey} nameKey="name" cx="50%" cy="50%" outerRadius="70%" labelLine={false} label={PieLabel}>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => v.toLocaleString()} />
                          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 14 }}
                            formatter={(v, e) => <span className="text-gray-700 dark:text-gray-300">{v} ({fmtY(e.payload[dataKey])})</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!expanded && view !== 'customerCount' && view !== 'monthly_brand' && data.length > 0 && (
              <ChartDataTable
                title={view === 'channel' ? '通路銷售數據' : '通路類型銷售數據'}
                data={data.map((d, i) => ({ ...d, rank: i + 1 }))}
                columns={[
                  { key: 'rank', label: '#', align: 'right' },
                  { key: 'name', label: '通路名稱' },
                  { key: 'subtotal', label: '銷售金額', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                  { key: 'quantity', label: '銷售數量', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                  { key: 'count', label: '訂單數', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                ]}
              />
            )}
            {!expanded && view === 'customerCount' && data.length > 0 && (
              <ChartDataTable
                title="通路客群統計數據"
                data={data}
                columns={[
                  { key: 'name', label: '通路類型' },
                  { key: 'customerCount', label: '客戶數', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                  { key: 'brandCount', label: '品牌數', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                  { key: 'productCount', label: '品項數', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                  { key: 'subtotal', label: '銷售金額', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                ]}
              />
            )}
          </div>
        )
      }}
    </ChartCard>
  )
}

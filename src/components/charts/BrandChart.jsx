import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
  LineChart, Line, AreaChart, Area,
} from 'recharts'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'
import { calcValueAxisWidth, getXAxisTickProps, getMaxValue } from '../../utils/chartUtils'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1',
]

const MONTH_NAMES = {
  '01':'1月','02':'2月','03':'3月','04':'4月','05':'5月','06':'6月',
  '07':'7月','08':'8月','09':'9月','10':'10月','11':'11月','12':'12月',
}

function fmtY(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

const RADIAN = Math.PI / 180
function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={14}>
      {Math.round(percent * 100)}%
    </text>
  )
}

function LinesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 min-w-[200px]">
      <p className="text-base font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">{label}</p>
      {[...payload].filter(e => e.value != null).sort((a, b) => b.value - a.value).map((e, i) => (
        <div key={i} className="flex justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-base text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.stroke }} />
            <span className="truncate max-w-[140px]">{e.name}</span>
          </span>
          <span className="font-mono font-bold text-base text-gray-800 dark:text-gray-100">{e.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Brand × Channel Comparison ───────────────────────────────────────────────
const CH_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#84CC16',
]

function ChannelTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  const metricLabel = metric === 'subtotal' ? '銷售金額' : '銷售數量'
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 min-w-[200px]">
      <p className="text-base font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">{label} 年</p>
      {[...payload].sort((a, b) => b.value - a.value).map((e, i) => (
        <div key={i} className="flex justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.fill || e.stroke || e.color }} />
            {e.name}
          </span>
          <span className="font-mono font-bold text-sm text-gray-800 dark:text-gray-100">{e.value?.toLocaleString()}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex justify-between gap-4 pt-1.5 mt-1 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-400">合計 {metricLabel}</span>
          <span className="font-mono font-bold text-xs text-gray-600 dark:text-gray-300">
            {payload.reduce((s, e) => s + (e.value || 0), 0).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

function BrandChannelChart({ brandChannelData, metric }) {
  const { map, brands, channels, years } = brandChannelData
  const [selectedBrand, setSelectedBrand]   = useState(() => brands[0] || '')
  const [chartStyle, setChartStyle]         = useState('grouped')
  const [activeChannels, setActiveChannels] = useState(() => new Set(channels))
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  // Keep activeChannels valid when channels prop changes
  const activeChannelList = useMemo(
    () => channels.filter(ch => activeChannels.has(ch)),
    [channels, activeChannels]
  )

  const toggleChannel = (ch) => {
    setActiveChannels(prev => {
      if (prev.has(ch) && prev.size <= 1) return prev // keep at least 1
      const next = new Set(prev)
      prev.has(ch) ? next.delete(ch) : next.add(ch)
      return next
    })
  }

  // Full chart data (all channels, all years)
  const chartData = useMemo(() => {
    if (!selectedBrand || !map[selectedBrand]) return []
    return years.map(y => {
      const entry = { year: y }
      channels.forEach(ch => { entry[ch] = map[selectedBrand]?.[ch]?.[y] || 0 })
      return entry
    })
  }, [selectedBrand, map, channels, years])

  // ── Top-3 indices per active channel (for label rendering) ──────────────────
  const top3ByChannel = useMemo(() => {
    const res = {}
    activeChannelList.forEach(ch => {
      const sorted = chartData
        .map((d, i) => ({ i, v: d[ch] || 0 }))
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)
      res[ch] = new Set(sorted.map(x => x.i))
    })
    return res
  }, [chartData, activeChannelList])

  // Top-3 total indices for stacked chart
  const top3Totals = useMemo(() => {
    const sorted = chartData
      .map((d, i) => ({ i, v: activeChannelList.reduce((s, ch) => s + (d[ch] || 0), 0) }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
    return new Set(sorted.map(x => x.i))
  }, [chartData, activeChannelList])

  // Channel totals (all channels, sorted by total, with original index for color)
  const channelTotals = useMemo(() => {
    if (!selectedBrand || !map[selectedBrand]) return []
    return channels
      .map((ch, origIdx) => ({
        ch, origIdx,
        total: years.reduce((s, y) => s + (map[selectedBrand]?.[ch]?.[y] || 0), 0),
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [selectedBrand, map, channels, years])

  const grandTotal = channelTotals.reduce((s, c) => s + c.total, 0)

  // Y-axis width based on active channels only (auto domain from Recharts)
  const yW = useMemo(() => calcValueAxisWidth(
    Math.max(1, ...chartData.flatMap(d => activeChannelList.map(ch => d[ch] || 0))),
    fmtY
  ), [chartData, activeChannelList])

  if (!brands.length)   return <div className="flex items-center justify-center h-64 text-gray-400">無品牌通路資料</div>
  if (!channels.length) return <div className="flex items-center justify-center h-64 text-gray-400">資料中無通路欄位，無法比較</div>

  const CHART_STYLES = [
    { v: 'grouped', l: '群組長條', icon: '▦', desc: '各年各通路並排，方便直接對比數量' },
    { v: 'stacked', l: '堆疊長條', icon: '▬', desc: '顯示總量結構，看各通路佔比消長' },
    { v: 'line',    l: '面積趨勢', icon: '◉', desc: '連續曲線，看通路成長軌跡與交叉點' },
  ]

  // ── Custom label content renderers (only top-3 per series) ─────────────────
  const barLabel = (ch) => ({ x, y, width, index }) => {
    if (!top3ByChannel[ch]?.has(index)) return null
    const v = chartData[index]?.[ch]; if (!v) return null
    return <text key={`bl${ch}${index}`} x={(x||0)+(width||0)/2} y={(y||0)-4} textAnchor="middle" fontSize={13} fill="#6b7280">{fmtY(v)}</text>
  }
  const stackLabel = ({ x, y, width, index }) => {
    if (!top3Totals.has(index)) return null
    const total = activeChannelList.reduce((s, ch) => s + (chartData[index]?.[ch] || 0), 0)
    if (!total) return null
    return <text key={`sl${index}`} x={(x||0)+(width||0)/2} y={(y||0)-4} textAnchor="middle" fontSize={13} fill="#6b7280">{fmtY(total)}</text>
  }
  const areaLabel = (ch) => ({ x, y, index }) => {
    if (!top3ByChannel[ch]?.has(index)) return null
    const v = chartData[index]?.[ch]; if (!v) return null
    return <text key={`al${ch}${index}`} x={x} y={(y||0)-9} textAnchor="middle" fontSize={13} fill="#6b7280">{fmtY(v)}</text>
  }

  return (
    <div className="space-y-4">

      {/* ── Brand picker ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">選擇品牌</h4>
        <div className="flex flex-wrap gap-2">
          {brands.slice(0, 20).map((b, i) => (
            <button key={b} onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedBrand === b ? 'text-white border-transparent shadow-sm' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
              style={selectedBrand === b ? { background: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] } : {}}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart style selector ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CHART_STYLES.map(s => (
          <button key={s.v} onClick={() => setChartStyle(s.v)}
            className={`flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 transition-all text-left ${chartStyle === s.v ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{s.icon}</span>
              <span className={`text-sm font-bold ${chartStyle === s.v ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>{s.l}</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-snug">{s.desc}</p>
          </button>
        ))}
      </div>

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="mb-4">
          <h4 className="text-base font-bold text-gray-700 dark:text-gray-200">
            {selectedBrand} — 通路歷年{label}比較
          </h4>
          <p className="text-sm text-gray-400 mt-0.5">
            顯示 {activeChannelList.length} / {channels.length} 個通路 × {years.length} 年
            {activeChannelList.length < channels.length && <span className="ml-2 text-blue-500 font-medium">（部分通路已隱藏）</span>}
          </p>
        </div>

        {/* Grouped bar */}
        {chartStyle === 'grouped' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 24, right: 20, left: 4, bottom: 4 }} barCategoryGap="28%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 13, fill: '#9ca3af' }} tickFormatter={v => v + '年'} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} width={yW} />
              <Tooltip content={<ChannelTooltip metric={metric} />} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              {activeChannelList.map(ch => {
                const ci = channels.indexOf(ch)
                return (
                  <Bar key={ch} dataKey={ch} name={ch} fill={CH_COLORS[ci % CH_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={46}>
                    <LabelList dataKey={ch} content={barLabel(ch)} />
                  </Bar>
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Stacked bar */}
        {chartStyle === 'stacked' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 24, right: 20, left: 4, bottom: 4 }} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 13, fill: '#9ca3af' }} tickFormatter={v => v + '年'} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} width={yW} />
              <Tooltip content={<ChannelTooltip metric={metric} />} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              {activeChannelList.map((ch, i) => {
                const ci = channels.indexOf(ch)
                const isLast = i === activeChannelList.length - 1
                return (
                  <Bar key={ch} dataKey={ch} name={ch} stackId="s"
                    fill={CH_COLORS[ci % CH_COLORS.length]}
                    radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={80}>
                    {isLast && <LabelList content={stackLabel} />}
                  </Bar>
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Area chart */}
        {chartStyle === 'line' && (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ top: 24, right: 20, left: 4, bottom: 4 }}>
              <defs>
                {channels.map((ch, i) => (
                  <linearGradient key={ch} id={`bcc_grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CH_COLORS[i % CH_COLORS.length]} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={CH_COLORS[i % CH_COLORS.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="year" tick={{ fontSize: 13, fill: '#9ca3af' }} tickFormatter={v => v + '年'} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} width={yW} />
              <Tooltip content={<ChannelTooltip metric={metric} />} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              {activeChannelList.map(ch => {
                const ci = channels.indexOf(ch)
                return (
                  <Area key={ch} type="monotone" dataKey={ch} name={ch}
                    stroke={CH_COLORS[ci % CH_COLORS.length]} strokeWidth={2.5}
                    fill={`url(#bcc_grad_${ci})`}
                    dot={{ r: 3, fill: CH_COLORS[ci % CH_COLORS.length] }}
                    activeDot={{ r: 5 }}
                    label={{ content: areaLabel(ch) }}
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Channel toggle cards ──────────────────────────────────────────── */}
      {channelTotals.length > 0 && (
        <>
          <p className="text-xs text-gray-400 -mb-1 pl-1">點擊卡片可開關圖表中的通路資料</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {channelTotals.map(c => {
              const isActive = activeChannels.has(c.ch)
              const color    = CH_COLORS[c.origIdx % CH_COLORS.length]
              const share    = grandTotal > 0 ? (c.total / grandTotal * 100).toFixed(1) : '0'
              return (
                <div key={c.ch} onClick={() => toggleChannel(c.ch)}
                  className={`cursor-pointer select-none rounded-2xl border-2 p-4 transition-all duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-gray-800 shadow-sm hover:shadow-md'
                      : 'bg-gray-50 dark:bg-gray-800/40 opacity-45 hover:opacity-60'
                  }`}
                  style={{ borderColor: isActive ? color : '#d1d5db' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">{c.ch}</span>
                    </div>
                    <span className={`text-xs font-bold flex-shrink-0 ml-1 ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>
                      {isActive ? '✓' : '–'}
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-800 dark:text-gray-100 font-mono leading-tight">{fmtY(c.total)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">佔 {share}%</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Brand Trend Chart ────────────────────────────────────────────────────────
function BrandTrendChart({ trendByBrand, metric }) {
  const { data, series } = trendByBrand
  const [selectedBrands, setSelectedBrands] = useState(() => series.slice(0, 3))
  const [showYoY, setShowYoY] = useState(false)
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const years = useMemo(() => [...new Set(data.map(d => d.yearMonth.slice(0, 4)))].sort(), [data])
  const multiYear = years.length > 1

  const trendData = useMemo(() => data.map(d => {
    const entry = { yearMonth: d.yearMonth }
    selectedBrands.forEach(b => { entry[b] = d[b] ?? null })
    return entry
  }), [data, selectedBrands])

  // YoY: pivot to {month -> {year: value}} for first selected brand
  const yoyData = useMemo(() => {
    if (!multiYear || !showYoY || !selectedBrands.length) return []
    const brand = selectedBrands[0]
    const monthMap = {}
    data.forEach(d => {
      const year = d.yearMonth.slice(0, 4)
      const month = d.yearMonth.slice(5)
      if (!monthMap[month]) monthMap[month] = { month, label: MONTH_NAMES[month] || month }
      monthMap[month][year] = (monthMap[month][year] || 0) + (d[brand] || 0)
    })
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))
  }, [data, selectedBrands, showYoY, multiYear])

  // Peak/off-peak: monthly average across all selected brands
  const seasonData = useMemo(() => {
    const totals = {}, counts = {}
    data.forEach(d => {
      const month = d.yearMonth.slice(5)
      const val = selectedBrands.reduce((s, b) => s + (d[b] || 0), 0)
      if (val === 0) return
      totals[month] = (totals[month] || 0) + val
      counts[month] = (counts[month] || 0) + 1
    })
    const rows = Object.entries(totals)
      .map(([m, t]) => ({ month: m, name: MONTH_NAMES[m] || m, avg: Math.round(t / (counts[m] || 1)) }))
      .sort((a, b) => a.month.localeCompare(b.month))
    if (rows.length < 4) return { rows: [], peak: [], low: [] }
    const sorted = [...rows].sort((a, b) => b.avg - a.avg)
    const peakSet = new Set(sorted.slice(0, 3).map(d => d.month))
    const lowSet = new Set(sorted.slice(-3).map(d => d.month))
    return {
      rows: rows.map(d => ({ ...d, isPeak: peakSet.has(d.month), isLow: lowSet.has(d.month) })),
      peak: sorted.slice(0, 3),
      low: sorted.slice(-3).reverse(),
    }
  }, [data, selectedBrands])

  const toggleBrand = (brand) => {
    if (selectedBrands.includes(brand)) {
      setSelectedBrands(prev => prev.filter(b => b !== brand))
    } else if (selectedBrands.length < 5) {
      setSelectedBrands(prev => [...prev, brand])
    }
  }

  if (!data.length || !series.length) {
    return <div className="flex items-center justify-center h-64 text-gray-400">無品牌趨勢資料</div>
  }

  return (
    <div className="space-y-4">
      {/* Brand selector */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="text-base font-bold text-gray-700 dark:text-gray-200">選擇品牌（最多 5 個）</h4>
            <p className="text-base text-gray-400 dark:text-gray-500 mt-0.5">已選 {selectedBrands.length} / {series.length} 個品牌</p>
          </div>
          <div className="flex gap-2">
            {multiYear && (
              <button onClick={() => setShowYoY(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${showYoY ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                📅 年度比較
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {series.map((brand, i) => {
            const active = selectedBrands.includes(brand)
            const color = COLORS[i % COLORS.length]
            return (
              <button key={brand} onClick={() => toggleBrand(brand)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${active ? 'text-white border-transparent shadow-sm' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'} ${!active && selectedBrands.length >= 5 ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={active ? { background: color, borderColor: color } : {}}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? 'rgba(255,255,255,0.7)' : color }} />
                  {brand}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedBrands.length === 0 && (
        <div className="flex items-center justify-center h-40 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          請至少選擇一個品牌
        </div>
      )}

      {/* Monthly trend */}
      {!showYoY && selectedBrands.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">品牌月趨勢 — {label}</h4>
          {(() => {
            const xtp = getXAxisTickProps(trendData.length, { maxFlat: 18, maxAngle30: 36 })
            const yW = calcValueAxisWidth(getMaxValue(trendData, selectedBrands), fmtY)
            return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 4, bottom: xtp.height - 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="yearMonth" tick={{ fontSize: 13, fill: '#9ca3af', angle: xtp.angle, textAnchor: xtp.textAnchor }} tickFormatter={v => v.slice(2)} height={xtp.height} interval={xtp.interval} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} width={yW} />
              <Tooltip content={<LinesTooltip />} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              {selectedBrands.map(brand => (
                <Line key={brand} type="monotone" dataKey={brand}
                  stroke={COLORS[series.indexOf(brand) % COLORS.length]}
                  strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
            )
          })()}
        </div>
      )}

      {/* YoY comparison */}
      {showYoY && multiYear && selectedBrands.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 dark:text-gray-200">年度對比 — {selectedBrands[0]}</h4>
            <p className="text-base text-gray-400 dark:text-gray-500 mt-0.5">同月份跨年比較（以首選品牌為準）</p>
          </div>
          {(() => {
            const yW2 = calcValueAxisWidth(getMaxValue(yoyData, years), fmtY)
            return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yoyData} margin={{ top: 5, right: 20, left: 4, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#9ca3af' }} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} width={yW2} />
              <Tooltip formatter={(v, n) => [v?.toLocaleString(), n + ' 年']} />
              <Legend wrapperStyle={{ fontSize: 14 }} formatter={v => v + ' 年'} />
              {years.map((year, i) => (
                <Line key={year} type="monotone" dataKey={year}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2.5}
                  dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
            )
          })()}
        </div>
      )}

      {/* Peak / off-peak season */}
      {seasonData.rows.length >= 4 && selectedBrands.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">淡旺季分析 — 月均{label}</h4>
            <p className="text-base text-gray-400 dark:text-gray-500 mb-4">
              <span className="inline-flex items-center gap-1 mr-3"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 旺季</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-300 inline-block" /> 淡季</span>
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seasonData.rows} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 14, fill: '#6b7280' }} />
                <YAxis tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} width={55} />
                <Tooltip formatter={v => [v?.toLocaleString(), '月均']} />
                <Bar dataKey="avg" name="月均" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {seasonData.rows.map((d, i) => (
                    <Cell key={i} fill={d.isPeak ? '#10b981' : d.isLow ? '#93c5fd' : '#e5e7eb'} />
                  ))}
                  <LabelList dataKey="avg" position="top" formatter={fmtY} style={{ fontSize: 14, fill: '#9ca3af' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌟</span>
                <span className="text-base font-bold text-emerald-700">旺季 Top 3</span>
              </div>
              <div className="space-y-2.5">
                {seasonData.peak.map((d, i) => (
                  <div key={d.month} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-base font-semibold text-gray-700 dark:text-gray-200">{d.name}</span>
                    </div>
                    <span className="text-base font-bold font-mono text-emerald-700">{fmtY(d.avg)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">❄️</span>
                <span className="text-base font-bold text-blue-700">淡季 Bottom 3</span>
              </div>
              <div className="space-y-2.5">
                {seasonData.low.map((d, i) => (
                  <div key={d.month} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-400 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-base font-semibold text-gray-700 dark:text-gray-200">{d.name}</span>
                    </div>
                    <span className="text-base font-bold font-mono text-blue-700">{fmtY(d.avg)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main BrandChart ──────────────────────────────────────────────────────────
export default function BrandChart({ brandData, trendByBrand, brandChannelData, metric }) {
  const [tab, setTab] = useState('ranking')
  const top20 = brandData.slice(0, 20)
  const top8 = brandData.slice(0, 8)
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const hasChannelData = brandChannelData?.channels?.length > 0

  const tabs = [
    { v: 'ranking',  l: '📊 排行分析' },
    { v: 'trend',    l: '📈 品牌趨勢' },
    { v: 'channel',  l: '🔀 通路比較', hidden: !hasChannelData },
  ].filter(t => !t.hidden)

  return (
    <ChartCard title={`品牌分析 — ${label}`}>
      {(expanded) => {
        const chartH = expanded ? 'calc(60vh - 80px)' : 420
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
              {tabs.map(t => (
                <button key={t.v} onClick={() => setTab(t.v)}
                  className={`px-2 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-sm sm:text-base font-medium transition-all ${tab === t.v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>

      {tab === 'ranking' && (
        <>
          {top20.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-base text-gray-400">無資料</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">品牌排行（前20名）</h4>
                <div style={{ height: chartH, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top20} layout="vertical" margin={{ top: 5, right: 80, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 14, fill: '#6b7280' }} width={90} />
                      <Tooltip formatter={(v, name) => [v.toLocaleString(), name]} />
                      <Legend wrapperStyle={{ fontSize: 14 }} />
                      <Bar dataKey={metric} name={label} radius={[0, 4, 4, 0]}>
                        {top20.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        <LabelList dataKey={metric} position="right" formatter={fmtY} style={{ fontSize: 14, fill: '#6b7280' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">前8大品牌佔比</h4>
                <div style={{ height: chartH, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={top8} dataKey={metric} nameKey="name" cx="50%" cy="45%" outerRadius="60%" labelLine={false} label={renderLabel}>
                        {top8.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [v.toLocaleString(), name]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 14 }}
                        formatter={(value, entry) => (
                          <span className="text-gray-700 dark:text-gray-300">{value} ({fmtY(entry.payload[metric])})</span>
                        )} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
          {!expanded && brandData.length > 0 && (
            <ChartDataTable
              title="品牌銷售數據"
              data={brandData.map((d, i) => {
                const total = brandData.reduce((s, r) => s + r.subtotal, 0)
                return { ...d, rank: i + 1, share: total > 0 ? Math.round(d.subtotal / total * 100) + '%' : '—' }
              })}
              columns={[
                { key: 'rank', label: '#', align: 'right', sortable: true },
                { key: 'name', label: '品牌名稱', sortable: true },
                { key: 'subtotal', label: '銷售金額', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—', sortable: true },
                { key: 'quantity', label: '銷售數量', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—', sortable: true },
                { key: 'count', label: '訂單數', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—', sortable: true },
                { key: 'share', label: '佔比', sortable: true },
              ]}
            />
          )}
        </>
      )}

      {tab === 'trend' && trendByBrand && (
        <BrandTrendChart trendByBrand={trendByBrand} metric={metric} />
      )}
      {tab === 'trend' && !trendByBrand && (
        <div className="flex items-center justify-center h-64 text-base text-gray-400">無趨勢資料</div>
      )}

      {tab === 'channel' && brandChannelData && (
        <BrandChannelChart brandChannelData={brandChannelData} metric={metric} />
      )}
        </div>
        )
      }}
    </ChartCard>
  )
}

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
  LineChart, Line,
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
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-4 min-w-[200px]">
      <p className="text-base font-bold text-gray-700 border-b border-gray-100 pb-2 mb-2">{label}</p>
      {[...payload].filter(e => e.value != null).sort((a, b) => b.value - a.value).map((e, i) => (
        <div key={i} className="flex justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-base text-gray-600">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.stroke }} />
            <span className="truncate max-w-[140px]">{e.name}</span>
          </span>
          <span className="font-mono font-bold text-base text-gray-800">{e.value?.toLocaleString()}</span>
        </div>
      ))}
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="text-base font-bold text-gray-700">選擇品牌（最多 5 個）</h4>
            <p className="text-base text-gray-400 mt-0.5">已選 {selectedBrands.length} / {series.length} 個品牌</p>
          </div>
          <div className="flex gap-2">
            {multiYear && (
              <button onClick={() => setShowYoY(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${showYoY ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${active ? 'text-white border-transparent shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'} ${!active && selectedBrands.length >= 5 ? 'opacity-40 cursor-not-allowed' : ''}`}
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
        <div className="flex items-center justify-center h-40 text-gray-400 bg-white rounded-2xl border border-gray-100">
          請至少選擇一個品牌
        </div>
      )}

      {/* Monthly trend */}
      {!showYoY && selectedBrands.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="text-base font-bold text-gray-700 mb-4">品牌月趨勢 — {label}</h4>
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700">年度對比 — {selectedBrands[0]}</h4>
            <p className="text-base text-gray-400 mt-0.5">同月份跨年比較（以首選品牌為準）</p>
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
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h4 className="text-base font-bold text-gray-700 mb-1">淡旺季分析 — 月均{label}</h4>
            <p className="text-base text-gray-400 mb-4">
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
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌟</span>
                <span className="text-base font-bold text-emerald-700">旺季 Top 3</span>
              </div>
              <div className="space-y-2.5">
                {seasonData.peak.map((d, i) => (
                  <div key={d.month} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-base font-semibold text-gray-700">{d.name}</span>
                    </div>
                    <span className="text-base font-bold font-mono text-emerald-700">{fmtY(d.avg)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">❄️</span>
                <span className="text-base font-bold text-blue-700">淡季 Bottom 3</span>
              </div>
              <div className="space-y-2.5">
                {seasonData.low.map((d, i) => (
                  <div key={d.month} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-400 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-base font-semibold text-gray-700">{d.name}</span>
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
export default function BrandChart({ brandData, trendByBrand, metric }) {
  const [tab, setTab] = useState('ranking')
  const top20 = brandData.slice(0, 20)
  const top8 = brandData.slice(0, 8)
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const tabs = [
    { v: 'ranking', l: '📊 排行分析' },
    { v: 'trend', l: '📈 品牌趨勢' },
  ]

  return (
    <ChartCard title={`品牌分析 — ${label}`}>
      {(expanded) => {
        const chartH = expanded ? 'calc(60vh - 80px)' : 420
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {tabs.map(t => (
                <button key={t.v} onClick={() => setTab(t.v)}
                  className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${tab === t.v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
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
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-base font-bold text-gray-700 mb-3">品牌排行（前20名）</h4>
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

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-base font-bold text-gray-700 mb-3">前8大品牌佔比</h4>
                <div style={{ height: chartH, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={top8} dataKey={metric} nameKey="name" cx="50%" cy="45%" outerRadius="60%" labelLine={false} label={renderLabel}>
                        {top8.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [v.toLocaleString(), name]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 14 }}
                        formatter={(value, entry) => (
                          <span style={{ color: '#374151' }}>{value} ({fmtY(entry.payload[metric])})</span>
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
        </div>
        )
      }}
    </ChartCard>
  )
}

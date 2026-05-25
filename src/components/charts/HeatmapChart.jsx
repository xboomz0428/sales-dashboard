import { useState, useMemo } from 'react'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'

// ─── Color helpers ────────────────────────────────────────────────────────────
function getValueColor(value, max, isDark) {
  if (isDark) {
    if (max === 0) return '#1f2937'
    const ratio = value / max
    if (ratio === 0) return '#1f2937'
    const r = Math.round(30 + ratio * (96 - 30))
    const g = Math.round(58 + ratio * (165 - 58))
    const b = Math.round(138 + ratio * (250 - 138))
    return `rgb(${r},${g},${b})`
  }
  if (max === 0) return '#f3f4f6'
  const ratio = value / max
  if (ratio === 0) return '#f9fafb'
  const r = Math.round(219 - ratio * 180)
  const g = Math.round(234 - ratio * 160)
  const b = Math.round(254 - ratio * 80)
  return `rgb(${r},${g},${b})`
}

function getGrowthColor(rate, maxAbs, isDark) {
  if (rate == null) return isDark ? '#1f2937' : '#f9fafb'
  if (maxAbs === 0) return isDark ? '#374151' : '#f3f4f6'
  const ratio = Math.min(Math.abs(rate) / maxAbs, 1)
  if (rate > 0) {
    if (isDark) return `rgb(${Math.round(10 + (1 - ratio) * 40)}, ${Math.round(100 + ratio * 100)}, ${Math.round(40 + ratio * 20)})`
    return `rgb(${Math.round(220 - ratio * 170)}, ${Math.round(252 - ratio * 80)}, ${Math.round(220 - ratio * 185)})`
  }
  if (rate < 0) {
    if (isDark) return `rgb(${Math.round(80 + ratio * 130)}, ${Math.round(25)}, ${Math.round(25)})`
    return `rgb(255, ${Math.round(220 - ratio * 165)}, ${Math.round(220 - ratio * 165)})`
  }
  return isDark ? '#374151' : '#f3f4f6'
}

function getValueTextColor(value, max, isDark) {
  const isHigh = max > 0 && value / max > 0.5
  return isDark ? (isHigh ? '#ffffff' : '#93c5fd') : (isHigh ? '#1e3a5f' : '#6b7280')
}

function getGrowthTextColor(rate, isDark) {
  if (rate == null) return isDark ? '#4b5563' : '#d1d5db'
  if (rate > 0) return isDark ? '#86efac' : '#15803d'
  if (rate < 0) return isDark ? '#fca5a5' : '#dc2626'
  return isDark ? '#9ca3af' : '#6b7280'
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtVal(v, metric) {
  if (v === 0) return '—'
  if (metric === 'subtotal') {
    if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
    if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
    return Math.round(v).toLocaleString()
  }
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function fmtGrowth(v) {
  if (v == null) return '—'
  const sign = v > 0 ? '▲' : v < 0 ? '▼' : ''
  return `${sign}${Math.abs(v).toFixed(0)}%`
}

// ─── HeatmapGrid ─────────────────────────────────────────────────────────────
function HeatmapGrid({ heatData, metric, isDark, dimensionLabel, displayMode }) {
  const { data, months } = heatData

  const maxVal = useMemo(() => {
    let max = 0
    data.forEach(row => { months.forEach(m => { if ((row[m] || 0) > max) max = row[m] }) })
    return max
  }, [data, months])

  const yearGroups = useMemo(() => {
    const groups = {}
    months.forEach(m => {
      const y = m.slice(0, 4)
      if (!groups[y]) groups[y] = []
      groups[y].push(m)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [months])

  // Growth data (MoM or YoY)
  const growthData = useMemo(() => {
    if (displayMode === 'value') return null
    return data.map(row => {
      const entry = { channelType: row.channelType }
      months.forEach((m, idx) => {
        const v = row[m] || 0
        if (displayMode === 'mom') {
          const prevM = months[idx - 1]
          const prevV = prevM != null ? (row[prevM] || 0) : null
          entry[m] = (prevV != null && prevV > 0) ? (v - prevV) / prevV * 100 : null
        } else {
          const year = parseInt(m.slice(0, 4))
          const prevYearM = `${year - 1}${m.slice(4)}`
          const prevV = months.includes(prevYearM) ? (row[prevYearM] || 0) : null
          entry[m] = (prevV != null && prevV > 0) ? (v - prevV) / prevV * 100 : null
        }
      })
      return entry
    })
  }, [data, months, displayMode])

  const growthMaxAbs = useMemo(() => {
    if (!growthData) return 0
    let max = 0
    growthData.forEach(row => {
      months.forEach(m => { if (row[m] != null && Math.abs(row[m]) > max) max = Math.abs(row[m]) })
    })
    return max || 100
  }, [growthData, months])

  const rowTotals = useMemo(() => {
    const t = {}
    data.forEach(row => { t[row.channelType] = months.reduce((s, m) => s + (row[m] || 0), 0) })
    return t
  }, [data, months])

  const colTotals = useMemo(() => {
    const t = {}
    months.forEach(m => { t[m] = data.reduce((s, row) => s + (row[m] || 0), 0) })
    return t
  }, [data, months])

  const grandTotal = useMemo(() => Object.values(rowTotals).reduce((s, v) => s + v, 0), [rowTotals])

  if (data.length === 0 || months.length === 0) {
    return <div className="flex items-center justify-center h-64 text-base text-gray-400">無資料</div>
  }

  const isGrowthMode = displayMode !== 'value'
  const CELL_W = 76

  return (
    <>
      {/* Legend */}
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-5">
        {isGrowthMode ? (
          <>
            <span className="font-medium text-red-500 dark:text-red-400">衰退</span>
            <div className="flex rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
              {[-1, -0.5, -0.15, 0.15, 0.5, 1].map(r => (
                <div key={r} className="w-10 h-6" style={{ background: getGrowthColor(r * growthMaxAbs, growthMaxAbs, isDark) }} />
              ))}
            </div>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">成長</span>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1 rounded-lg font-medium">
              最大振幅：±{Math.round(growthMaxAbs)}%
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">低</span>
            <div className="flex rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
              {[0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map(r => (
                <div key={r} className="w-10 h-6" style={{ background: getValueColor(r * maxVal, maxVal, isDark) }} />
              ))}
            </div>
            <span className="font-medium">高</span>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1 rounded-lg font-medium">
              最高：{fmtVal(maxVal, metric)}
            </span>
          </>
        )}
      </div>

      <p className="sm:hidden text-xs text-center text-gray-400 dark:text-gray-500 mb-2">← 左右滑動 →</p>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="border-collapse" style={{ minWidth: `${months.length * CELL_W + 220}px` }}>
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="text-left px-3 py-3 text-sm text-gray-500 dark:text-gray-400 font-bold sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 border-b-2 border-r-2 border-gray-200 dark:border-gray-600"
                style={{ minWidth: 130 }}
              >
                {dimensionLabel}
              </th>
              {yearGroups.map(([year, mos]) => (
                <th
                  key={year}
                  colSpan={mos.length}
                  className="text-center py-2 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-b border-blue-200 dark:border-blue-700/50 border-b-gray-200 dark:border-b-gray-600"
                >
                  {year}年
                </th>
              ))}
              {!isGrowthMode && (
                <th
                  rowSpan={2}
                  className="text-right px-3 py-3 text-sm text-gray-600 dark:text-gray-300 font-bold bg-gray-100 dark:bg-gray-700/50 border-b-2 border-l-2 border-gray-200 dark:border-gray-600 whitespace-nowrap"
                  style={{ minWidth: 72 }}
                >
                  合計
                </th>
              )}
            </tr>
            <tr>
              {months.map((m, idx) => {
                const isFirstOfYear = idx === 0 || months[idx - 1].slice(0, 4) !== m.slice(0, 4)
                return (
                  <th
                    key={m}
                    className={`text-center py-2 text-sm text-gray-600 dark:text-gray-300 font-semibold bg-gray-50 dark:bg-gray-800 border-b-2 border-b-gray-200 dark:border-b-gray-600 ${isFirstOfYear ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-gray-100 dark:border-l-gray-700'}`}
                    style={{ minWidth: CELL_W }}
                  >
                    {parseInt(m.slice(5))}月
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => {
              const isEven = rowIdx % 2 === 0
              const stickyBg = isEven ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/40'
              return (
                <tr key={row.channelType} className={`border-b border-gray-100 dark:border-gray-700/80 ${isEven ? '' : 'bg-gray-50/30 dark:bg-gray-700/10'}`}>
                  <td className={`px-3 py-3 text-sm text-gray-700 dark:text-gray-200 font-bold sticky left-0 z-10 border-r-2 border-gray-200 dark:border-gray-600 whitespace-nowrap ${stickyBg}`}>
                    {row.channelType}
                  </td>
                  {months.map((m, idx) => {
                    const rawVal = row[m] || 0
                    const growthVal = growthData ? growthData.find(r => r.channelType === row.channelType)?.[m] : null
                    const displayVal = isGrowthMode ? growthVal : rawVal
                    const bg = isGrowthMode
                      ? getGrowthColor(growthVal, growthMaxAbs, isDark)
                      : getValueColor(rawVal, maxVal, isDark)
                    const textColor = isGrowthMode
                      ? getGrowthTextColor(growthVal, isDark)
                      : getValueTextColor(rawVal, maxVal, isDark)
                    const isFirstOfYear = idx === 0 || months[idx - 1].slice(0, 4) !== m.slice(0, 4)
                    const tooltipText = isGrowthMode
                      ? `${row.channelType} / ${m}：${growthVal != null ? fmtGrowth(growthVal) : '無前期資料'}\n實際值：${rawVal.toLocaleString()}`
                      : `${row.channelType} / ${m}：${rawVal.toLocaleString()}`
                    return (
                      <td
                        key={m}
                        title={tooltipText}
                        className={`text-center py-3 text-sm font-semibold ${isFirstOfYear ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-white/70 dark:border-l-gray-800'}`}
                        style={{ background: bg, color: textColor }}
                      >
                        {isGrowthMode ? fmtGrowth(displayVal) : fmtVal(rawVal, metric)}
                      </td>
                    )
                  })}
                  {!isGrowthMode && (
                    <td className={`text-right px-3 py-3 text-sm font-bold text-blue-700 dark:text-blue-400 border-l-2 border-gray-200 dark:border-gray-600 whitespace-nowrap ${stickyBg}`}>
                      {fmtVal(rowTotals[row.channelType] || 0, metric)}
                    </td>
                  )}
                </tr>
              )
            })}
            {!isGrowthMode && (
              <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/60">
                <td className="px-3 py-3 text-sm font-black text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-100 dark:bg-gray-700/60 border-r-2 border-gray-200 dark:border-gray-600 whitespace-nowrap z-10">
                  合計
                </td>
                {months.map((m, idx) => {
                  const isFirstOfYear = idx === 0 || months[idx - 1].slice(0, 4) !== m.slice(0, 4)
                  return (
                    <td
                      key={m}
                      className={`text-center py-3 text-sm font-bold text-gray-700 dark:text-gray-300 ${isFirstOfYear ? 'border-l-2 border-l-blue-200 dark:border-l-blue-700/50' : 'border-l border-l-gray-200 dark:border-l-gray-600'}`}
                    >
                      {fmtVal(colTotals[m] || 0, metric)}
                    </td>
                  )
                })}
                <td className="text-right px-3 py-3 text-sm font-black text-blue-800 dark:text-blue-300 border-l-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/60 whitespace-nowrap">
                  {fmtVal(grandTotal, metric)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!isGrowthMode && (
        <ChartDataTable
          title={`熱力圖數據明細（${dimensionLabel}）`}
          data={data.map(row => {
            const total = months.reduce((s, m) => s + (row[m] || 0), 0)
            return { channelType: row.channelType, ...Object.fromEntries(months.map(m => [m.slice(5), row[m] || 0])), 合計: total }
          })}
          columns={[
            { key: 'channelType', label: dimensionLabel },
            ...months.map(m => ({ key: m.slice(5), label: `${parseInt(m.slice(5))}月`, align: 'right', fmt: v => v > 0 ? Math.round(v).toLocaleString() : '—' })),
            { key: '合計', label: '合計', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—', cls: () => 'font-bold text-blue-700' },
          ]}
          defaultOpen={false}
        />
      )}
    </>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function HeatmapChart({ heatmapData, heatmapBrandData, metric }) {
  const [view, setView] = useState('channel')
  const [displayMode, setDisplayMode] = useState('value')
  const isDark = document.documentElement.classList.contains('dark')

  const activeData = view === 'channel' ? heatmapData : (heatmapBrandData || heatmapData)
  const dimensionLabel = view === 'channel' ? '通路類型' : '品牌'
  const hasBrandData = heatmapBrandData?.data?.length > 0

  const modeLabels = { value: '銷售值', mom: '月環比 %', yoy: '年同比 %' }
  const title = `熱力圖 — 月份 × ${dimensionLabel}（${displayMode === 'value' ? (metric === 'subtotal' ? '銷售金額' : '銷售數量') : modeLabels[displayMode]}）`

  return (
    <ChartCard title={title}>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Dimension toggle */}
        {hasBrandData && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">維度：</span>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
              {[{ v: 'channel', l: '通路類型' }, { v: 'brand', l: '品牌' }].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    view === v
                      ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Display mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">顯示：</span>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
            {[
              { v: 'value', l: '銷售值' },
              { v: 'mom',   l: '月環比' },
              { v: 'yoy',   l: '年同比' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setDisplayMode(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  displayMode === v
                    ? v === 'value'
                      ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'bg-emerald-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {displayMode !== 'value' && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 px-2 py-1 rounded-lg font-medium">
              {displayMode === 'mom' ? '與上個月比較' : '與去年同月比較'}
            </span>
          )}
        </div>
      </div>

      <HeatmapGrid
        heatData={activeData}
        metric={metric}
        isDark={isDark}
        dimensionLabel={dimensionLabel}
        displayMode={displayMode}
      />
    </ChartCard>
  )
}

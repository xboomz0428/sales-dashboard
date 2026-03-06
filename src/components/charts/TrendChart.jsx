import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar, ReferenceLine,
} from 'recharts'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'
import { calcValueAxisWidth, getXAxisTickProps, getMaxValue } from '../../utils/chartUtils'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1']

function fmtY(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].filter(e => e.value != null).sort((a, b) => b.value - a.value)
  const mainEntries = sorted.filter(e => !e.name?.includes('▸'))
  const compEntries = sorted.filter(e => e.name?.includes('▸'))
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-4 min-w-[200px]">
      <p className="text-base font-bold text-gray-700 border-b border-gray-100 pb-2 mb-2">{label}</p>
      {mainEntries.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-1">
          <span className="flex items-center gap-2 text-base text-gray-600">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.stroke || e.fill }} />
            <span className="truncate max-w-[140px]">{e.name}</span>
          </span>
          <span className="font-mono font-bold text-base text-gray-800">{e.value?.toLocaleString()}</span>
        </div>
      ))}
      {compEntries.length > 0 && (
        <>
          <div className="border-t border-dashed border-gray-200 my-2" />
          <p className="text-sm text-gray-400 mb-1">對比期</p>
          {compEntries.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-3 h-0.5 inline-block" style={{ background: e.stroke }} />
                <span className="truncate max-w-[140px]">{e.name?.replace('▸', '').trim()}</span>
              </span>
              <span className="font-mono text-sm text-gray-500">{e.value?.toLocaleString()}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function mergeComparison(main, comp, metric, compLabel) {
  const compMap = Object.fromEntries(comp.map(d => [d.yearMonth, d[metric]]))
  return main.map(d => ({ ...d, [`▸ ${compLabel}`]: compMap[d.yearMonth] ?? null }))
}

function calcLinearRegression(dataArr, metric) {
  const n = dataArr.length
  if (n < 2) return dataArr.map(d => ({ ...d, trendLine: d[metric] }))
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  dataArr.forEach((d, i) => { sumX += i; sumY += d[metric]; sumXY += i * d[metric]; sumX2 += i * i })
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return dataArr.map(d => ({ ...d, trendLine: d[metric] }))
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return dataArr.map((d, i) => ({ ...d, trendLine: Math.round(slope * i + intercept) }))
}

export default function TrendChart({ trendData, trendDataYoY, trendDataMoM, trendByChannel, trendByBrand, trendByProduct, metric }) {
  const [groupBy, setGroupBy] = useState('none')
  const [chartType, setChartType] = useState('line')
  const [comparison, setComparison] = useState('none')
  const [showTrend, setShowTrend] = useState(false)
  const [showAvg, setShowAvg] = useState(false)

  const metricLabel = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const { data, series } = useMemo(() => {
    let baseData, baseSeries
    if (groupBy === 'channel') { baseData = trendByChannel.data; baseSeries = trendByChannel.series }
    else if (groupBy === 'brand') { baseData = trendByBrand.data; baseSeries = trendByBrand.series }
    else if (groupBy === 'product') { baseData = trendByProduct.data; baseSeries = trendByProduct.series }
    else { baseData = trendData; baseSeries = null }
    if (groupBy !== 'none' || comparison === 'none') return { data: baseData, series: baseSeries }
    const compData = comparison === 'yoy' ? trendDataYoY : trendDataMoM
    const compLabel = comparison === 'yoy' ? '去年同期' : '上月同期'
    return { data: mergeComparison(baseData, compData, metric, compLabel), series: null }
  }, [groupBy, comparison, metric, trendData, trendDataYoY, trendDataMoM, trendByChannel, trendByBrand, trendByProduct])

  const { dataWithTrend, avgValue } = useMemo(() => {
    if (groupBy !== 'none' || !data.length) return { dataWithTrend: data, avgValue: 0 }
    const sum = data.reduce((s, d) => s + (d[metric] || 0), 0)
    const avg = Math.round(sum / data.length)
    return { dataWithTrend: calcLinearRegression(data, metric), avgValue: avg }
  }, [data, groupBy, metric])

  const compLabel = comparison === 'yoy' ? '去年同期' : '上月同期'
  const hasComparison = comparison !== 'none' && groupBy === 'none'

  const renderChart = (expanded) => {
    const h = expanded ? 'calc(100vh - 420px)' : 380
    if (!data.length) return <div className="flex items-center justify-center h-72 text-gray-400 text-base">無資料</div>
    const chartData = (groupBy === 'none' && showTrend) ? dataWithTrend : data
    const xTickProps = getXAxisTickProps(chartData.length, { maxFlat: 18, maxAngle30: 36 })
    const yWidth = calcValueAxisWidth(getMaxValue(chartData, series ? series : [metric]), fmtY)
    const commonProps = { data: chartData, margin: { top: 10, right: 24, bottom: xTickProps.height - 10, left: 4 } }
    const xAxis = (
      <XAxis dataKey="yearMonth"
        tick={{ fontSize: 13, fill: '#9ca3af', angle: xTickProps.angle, textAnchor: xTickProps.textAnchor }}
        height={xTickProps.height} interval={xTickProps.interval}
        axisLine={false} tickLine={false} />
    )
    const yAxis = <YAxis tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={yWidth} />
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
    const tooltip = <Tooltip content={<CustomTooltip />} />
    const legend = <Legend wrapperStyle={{ fontSize: 14, paddingTop: 12 }} />
    const avgLine = groupBy === 'none' && showAvg && avgValue > 0 && (
      <ReferenceLine y={avgValue} stroke="#F59E0B" strokeDasharray="6 3" strokeWidth={1.5}
        label={{ value: `平均 ${fmtY(avgValue)}`, position: 'insideTopRight', fontSize: 14, fill: '#d97706' }} />
    )
    const trendLine = groupBy === 'none' && showTrend && (
      <Line type="linear" dataKey="trendLine" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="8 4" dot={false} name="趨勢線" legendType="none" />
    )

    const inner = (() => {
      if (chartType === 'area' && !series) return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
            {hasComparison && <linearGradient id="areaGradComp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1} /><stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
            </linearGradient>}
          </defs>
          {grid}{xAxis}{yAxis}{tooltip}{legend}{avgLine}
          {hasComparison && <Area type="monotone" dataKey={`▸ ${compLabel}`} stroke="#9ca3af" fill="url(#areaGradComp)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />}
          <Area type="monotone" dataKey={metric} stroke="#3B82F6" fill="url(#areaGrad)" strokeWidth={2.5} dot={false} name={metricLabel} />
          {trendLine}
        </AreaChart>
      )
      if (chartType === 'bar') return (
        <ComposedChart {...commonProps}>
          {grid}{xAxis}{yAxis}{tooltip}{legend}{avgLine}
          {series ? series.map((s, i) => (
            <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} name={s} stackId="a" radius={i === series.length - 1 ? [4,4,0,0] : 0} maxBarSize={36} />
          )) : <>
            <Bar dataKey={metric} fill="#3B82F6" name={metricLabel} radius={[5,5,0,0]} maxBarSize={36} />
            {hasComparison && <Line type="monotone" dataKey={`▸ ${compLabel}`} stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 3" dot={false} />}
          </>}
          {trendLine}
        </ComposedChart>
      )
      return (
        <LineChart {...commonProps}>
          {grid}{xAxis}{yAxis}{tooltip}{legend}{avgLine}
          {hasComparison && <Line type="monotone" dataKey={`▸ ${compLabel}`} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
          {series ? series.map((s, i) => (
            <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2.5} name={s} />
          )) : <Line type="monotone" dataKey={metric} stroke="#3B82F6" dot={false} strokeWidth={2.5} name={metricLabel} />}
          {trendLine}
        </LineChart>
      )
    })()

    return (
      <div style={{ height: h, minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">{inner}</ResponsiveContainer>
      </div>
    )
  }

  const controls = (
    <div className="flex flex-wrap gap-2 mb-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[{ v: 'none', l: '整體' }, { v: 'channel', l: '依通路' }, { v: 'brand', l: '依品牌' }, { v: 'product', l: '依產品' }].map(({ v, l }) => (
          <button key={v} onClick={() => { setGroupBy(v); if (v !== 'none') setComparison('none') }}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${groupBy === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[{ v: 'line', l: '折線' }, { v: 'area', l: '面積' }, { v: 'bar', l: '長條' }].map(({ v, l }) => (
          <button key={v} onClick={() => setChartType(v)}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${chartType === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>
      {groupBy === 'none' && (
        <div className="flex gap-1 bg-amber-50 p-1 rounded-xl border border-amber-100">
          {[{ v: 'none', l: '無對比' }, { v: 'yoy', l: '同比去年' }, { v: 'mom', l: '環比上月' }].map(({ v, l }) => (
            <button key={v} onClick={() => setComparison(v)}
              className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${comparison === v ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-100'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {groupBy === 'none' && (
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
          <button onClick={() => setShowTrend(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${showTrend ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            趨勢線
          </button>
          <button onClick={() => setShowAvg(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-all ${showAvg ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            平均線
          </button>
        </div>
      )}
    </div>
  )

  return (
    <ChartCard title={`月度趨勢 — ${metricLabel}`}>
      {(expanded) => (
        <>
          {controls}
          {renderChart(expanded)}
          {!expanded && (
            <ChartDataTable
              title="月度趨勢數據"
              data={trendData}
              columns={[
                { key: 'yearMonth', label: '月份', sortable: true },
                { key: 'subtotal', label: '銷售金額', align: 'right', fmt: v => v?.toLocaleString(), sortable: true },
                { key: 'quantity', label: '銷售數量', align: 'right', fmt: v => v?.toLocaleString(), sortable: true },
              ]}
            />
          )}
        </>
      )}
    </ChartCard>
  )
}

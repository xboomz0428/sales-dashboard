import { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Area
} from 'recharts'

const fmtM = v => {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

// Simple linear regression
function linearRegression(points) {
  const n = points.length
  if (n < 2) return null
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  points.forEach(({ x, y }) => {
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x
  })
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

// Add N months to a yearMonth string
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function useForecast(trendData, metric, months = 6) {
  return useMemo(() => {
    if (trendData.length < 3) return { chartData: [], forecast: [], r2: null }

    const historical = trendData.map((d, i) => ({ x: i, y: d[metric] || 0, yearMonth: d.yearMonth }))
    const reg = linearRegression(historical)
    if (!reg) return { chartData: [], forecast: [], r2: null }

    // R² calculation
    const meanY = historical.reduce((s, p) => s + p.y, 0) / historical.length
    const ssTot = historical.reduce((s, p) => s + (p.y - meanY) ** 2, 0)
    const ssRes = historical.reduce((s, p) => s + (p.y - (reg.slope * p.x + reg.intercept)) ** 2, 0)
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

    // Seasonal adjustment: compute monthly average ratio vs trend
    const monthlyRatios = {}
    historical.forEach(({ x, y, yearMonth }) => {
      const m = parseInt(yearMonth.split('-')[1])
      const trend = reg.slope * x + reg.intercept
      if (!monthlyRatios[m]) monthlyRatios[m] = []
      if (trend > 0) monthlyRatios[m].push(y / trend)
    })
    const seasonalIdx = {}
    for (let m = 1; m <= 12; m++) {
      const arr = monthlyRatios[m] || []
      seasonalIdx[m] = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 1
    }

    // Build forecast points
    const lastIdx = historical.length - 1
    const lastYM = trendData[trendData.length - 1].yearMonth
    const forecast = Array.from({ length: months }, (_, i) => {
      const x = lastIdx + i + 1
      const ym = addMonths(lastYM, i + 1)
      const mon = parseInt(ym.split('-')[1])
      const base = reg.slope * x + reg.intercept
      const value = Math.max(0, Math.round(base * (seasonalIdx[mon] || 1)))
      // Confidence interval: ±15% for now (simplistic)
      return { x, yearMonth: ym, [metric]: value, lower: Math.round(value * 0.85), upper: Math.round(value * 1.15), isForecast: true }
    })

    // Combine for chart
    const chartData = [
      ...historical.map(({ yearMonth, y }) => ({ yearMonth, [metric]: y, isForecast: false })),
      ...forecast.map(f => ({ yearMonth: f.yearMonth, forecast: f[metric], lower: f.lower, upper: f.upper, isForecast: true })),
    ]

    return { chartData, forecast, r2 }
  }, [trendData, metric, months])
}

const METRIC_LABELS = { subtotal: '銷售額', quantity: '數量' }

export default function SalesForecast({ trendData, metric }) {
  const [months, setMonths] = useState(6)
  const { chartData, forecast, r2 } = useForecast(trendData, metric, months)

  const splitIdx = chartData.findIndex(d => d.isForecast)
  const splitYM = splitIdx >= 0 ? chartData[splitIdx].yearMonth : null

  const metricLabel = METRIC_LABELS[metric] || metric

  if (!trendData.length) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-base bg-white rounded-2xl border border-gray-100">
      無趨勢資料，請先上傳資料
    </div>
  )

  if (trendData.length < 3) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-base bg-white rounded-2xl border border-gray-100">
      資料不足（需至少 3 個月），無法建立預測模型
    </div>
  )

  const totalForecast = forecast.reduce((s, f) => s + (f[metric] || 0), 0)
  const lastActual = trendData[trendData.length - 1]?.[metric] || 0
  const nextMonthForecast = forecast[0]?.[metric] || 0
  const mom = lastActual > 0 ? ((nextMonthForecast - lastActual) / lastActual * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🔮 銷售預測分析</h2>
          <p className="text-base text-gray-400 mt-0.5">基於線性回歸 + 季節性調整，預測未來銷售走勢</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-gray-500">預測月數</span>
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400">
            {[3, 6, 9, 12].map(v => <option key={v} value={v}>{v} 個月</option>)}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-sm text-blue-600 font-semibold">模型準確度 R²</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{r2 != null ? (r2 * 100).toFixed(0) + '%' : '—'}</p>
          <p className="text-xs text-blue-400 mt-0.5">{r2 >= 0.8 ? '高擬合' : r2 >= 0.5 ? '中擬合' : '低擬合'}</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-sm text-purple-600 font-semibold">下月預測{metricLabel}</p>
          <p className="text-2xl font-black text-purple-700 mt-1">{fmtM(nextMonthForecast)}</p>
          <p className={`text-xs mt-0.5 ${mom >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            較上月 {mom >= 0 ? '+' : ''}{mom.toFixed(0)}%
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-sm text-emerald-600 font-semibold">未來 {months} 月預測總計</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{fmtM(totalForecast)}</p>
          <p className="text-xs text-emerald-400 mt-0.5">含季節性調整</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-sm text-amber-600 font-semibold">歷史資料月數</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{trendData.length}</p>
          <p className="text-xs text-amber-400 mt-0.5">
            {trendData[0]?.yearMonth} ~ {trendData[trendData.length - 1]?.yearMonth}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-base font-bold text-gray-700">歷史實績 + 預測走勢</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">藍色 = 歷史</span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">紫色 = 預測</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">灰色區間 = 信賴區間 ±15%</span>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="yearMonth" tick={{ fontSize: 12 }} interval={Math.max(0, Math.floor(chartData.length / 18) - 1)} angle={-30} textAnchor="end" height={52} />
            <YAxis tickFormatter={fmtM} tick={{ fontSize: 12 }} width={60} />
            <Tooltip formatter={(v, name) => {
              if (name === '信賴上界' || name === '信賴下界') return [fmtM(v), name]
              return [fmtM(v), name === metric ? '實績' : '預測']
            }} />
            <Legend />
            {splitYM && <ReferenceLine x={splitYM} stroke="#a855f7" strokeDasharray="6 3" label={{ value: '預測起點', fill: '#a855f7', fontSize: 12 }} />}
            {/* Confidence band */}
            <Area dataKey="upper" fill="#e9d5ff" stroke="none" name="信賴上界" legendType="none" />
            <Area dataKey="lower" fill="#fff" stroke="none" name="信賴下界" legendType="none" />
            <Bar dataKey={metric} fill="#3b82f6" name="實績" maxBarSize={20} radius={[3, 3, 0, 0]} />
            <Line dataKey="forecast" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#a855f7' }} name="預測" strokeDasharray="6 3" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Forecast table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 bg-gray-50">
          <span className="text-base font-bold text-gray-700">預測明細</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-500">月份</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">預測{metricLabel}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">低估（-15%）</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">高估（+15%）</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">月增率</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((f, i) => {
                const prev = i === 0 ? lastActual : forecast[i - 1]?.[metric] || 0
                const val = f[metric] || 0
                const chg = prev > 0 ? ((val - prev) / prev * 100) : 0
                return (
                  <tr key={f.yearMonth} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-700">{f.yearMonth}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-purple-700">{fmtM(val)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">{fmtM(f.lower)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">{fmtM(f.upper)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${chg >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(0)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">
        ⚠️ 預測基於歷史線性趨勢與月份季節性指數，僅供參考。市場突發事件、產品變更等因素不在模型範圍內。
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'

function getColor(value, max) {
  if (max === 0) return '#f3f4f6'
  const ratio = value / max
  if (ratio === 0) return '#f9fafb'
  const r = Math.round(219 - ratio * 180)
  const g = Math.round(234 - ratio * 160)
  const b = Math.round(254 - ratio * 80)
  return `rgb(${r},${g},${b})`
}

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

export default function HeatmapChart({ heatmapData, metric }) {
  const { data, months, channelTypes } = heatmapData

  const maxVal = useMemo(() => {
    let max = 0
    data.forEach(row => { months.forEach(m => { if (row[m] > max) max = row[m] }) })
    return max
  }, [data, months])

  const title = `熱力圖 — 月份 × 通路類型（${metric === 'subtotal' ? '銷售金額' : '銷售數量'}）`

  if (data.length === 0 || months.length === 0) {
    return (
      <ChartCard title={title}>
        <div className="flex items-center justify-center h-64 text-base text-gray-400">無資料</div>
      </ChartCard>
    )
  }

  return (
    <ChartCard title={title}>
      <div className="flex items-center gap-3 text-base text-gray-500 mb-4">
        <span>低</span>
        <div className="flex rounded overflow-hidden">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(r => (
            <div key={r} className="w-8 h-5" style={{ background: getColor(r * maxVal, maxVal) }} />
          ))}
        </div>
        <span>高</span>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: `${months.length * 64 + 140}px` }}>
          <thead>
            <tr>
              <th className="text-left p-2 text-base text-gray-500 font-bold w-32 sticky left-0 bg-white z-10">通路類型</th>
              {months.map(m => (
                <th key={m} className="p-1 text-center text-sm text-gray-500 font-medium" style={{ minWidth: 60 }}>
                  {m.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.channelType}>
                <td className="p-2 text-base text-gray-700 font-bold sticky left-0 bg-white z-10 border-r border-gray-100 whitespace-nowrap">
                  {row.channelType}
                </td>
                {months.map(m => {
                  const v = row[m] || 0
                  const bg = getColor(v, maxVal)
                  const dark = v / maxVal > 0.5
                  return (
                    <td key={m} title={`${row.channelType} / ${m}\n${v.toLocaleString()}`}
                      className="text-center p-1.5 border border-white text-sm font-medium"
                      style={{ background: bg, color: dark ? '#1e3a5f' : '#6b7280' }}>
                      {fmtVal(v, metric)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChartDataTable
        title="熱力圖數據明細"
        data={data.map(row => {
          const total = months.reduce((s, m) => s + (row[m] || 0), 0)
          return { channelType: row.channelType, ...Object.fromEntries(months.map(m => [m.slice(5), row[m] || 0])), 合計: total }
        })}
        columns={[
          { key: 'channelType', label: '通路類型' },
          ...months.map(m => ({ key: m.slice(5), label: m.slice(5), align: 'right', fmt: v => v > 0 ? Math.round(v).toLocaleString() : '—' })),
          { key: '合計', label: '合計', align: 'right', fmt: v => v != null ? Math.round(v).toLocaleString() : '—', cls: () => 'font-bold text-blue-700' },
        ]}
        defaultOpen={false}
      />
    </ChartCard>
  )
}

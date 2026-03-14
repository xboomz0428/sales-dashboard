import { useState } from 'react'
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
          <span className="font-mono font-bold text-base text-gray-800 dark:text-gray-100">{e.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function ChannelBarChart({ channelData, channelTypeData, channelCustomerData, metric }) {
  const [view, setView] = useState('channel')

  const dataKey = view === 'customerCount' ? 'customerCount' : metric
  const barLabel = view === 'customerCount' ? '客戶數' : (metric === 'subtotal' ? '銷售金額' : '銷售數量')
  const data = view === 'channel' ? channelData : view === 'channelType' ? channelTypeData : (channelCustomerData || [])

  const VIEWS = [
    { v: 'channel', l: '網路/實體' },
    { v: 'channelType', l: '通路類型' },
    { v: 'customerCount', l: '客戶數統計' },
  ]

  const viewSelector = (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
      {VIEWS.map(({ v, l }) => (
        <button key={v} onClick={() => setView(v)}
          className={`px-2 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-sm sm:text-base font-medium transition-all ${view === v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          {l}
        </button>
      ))}
    </div>
  )

  return (
    <ChartCard title={`通路分析 — ${barLabel}`}>
      {(expanded) => {
        const chartH = expanded ? 'calc(50vh - 60px)' : 300
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {viewSelector}
            </div>

            {data.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-base text-gray-400 dark:text-gray-500">無資料</div>
            ) : (
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

            {!expanded && view !== 'customerCount' && data.length > 0 && (
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

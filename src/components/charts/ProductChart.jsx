import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, PieChart, Pie,
} from 'recharts'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'
import { calcNameAxisWidth, calcValueAxisWidth, getMaxValue } from '../../utils/chartUtils'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#14B8A6','#F43F5E']

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
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={600}>
      {Math.round(percent * 100)}%
    </text>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 text-sm min-w-[200px]">
      <p className="font-bold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: e.color || e.fill }} />{e.name}</span>
          <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{e.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function RankingTable({ data, metric }) {
  const tableData = data.map((d, i) => ({
    rank: i + 1,
    name: d.name,
    subtotal: d.subtotal,
    quantity: d.quantity,
    count: d.count,
    avgOrderValue: d.avgOrderValue,
    customerCount: d.customerCount,
  }))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
      <ChartDataTable
        title="產品完整銷售數據"
        defaultOpen={true}
        data={tableData}
        columns={[
          { key: 'rank', label: '#', align: 'right', sortable: true },
          { key: 'name', label: '產品名稱', sortable: true },
          { key: 'subtotal', label: '銷售金額', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'quantity', label: '銷售數量', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'count', label: '訂單數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'avgOrderValue', label: '平均客單', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'customerCount', label: '客戶數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
        ]}
      />
    </div>
  )
}

function RankingChart({ data, metric }) {
  const top20 = data.slice(0, 20)
  const top8 = data.slice(0, 8)
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'
  const nameW = calcNameAxisWidth(top20)
  const maxV = getMaxValue(top20, metric)
  const labelW = calcValueAxisWidth(maxV, fmtY)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">產品排行（前20名）</h4>
        <ResponsiveContainer width="100%" height={520}>
          <BarChart data={top20} layout="vertical" margin={{ top: 4, right: labelW, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 13, fill: '#9ca3af' }} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#374151' }} width={nameW} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={metric} name={label} radius={[0, 6, 6, 0]} maxBarSize={22}>
              {top20.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              <LabelList dataKey={metric} position="right" formatter={fmtY} style={{ fontSize: 13, fill: '#9ca3af' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">前8大產品佔比</h4>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={top8} dataKey={metric} nameKey="name" cx="50%" cy="50%" outerRadius={115} labelLine={false} label={PieLabel}>
              {top8.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => v.toLocaleString()} />
            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 13 }}
              formatter={(v, e) => <span className="text-gray-700 dark:text-gray-300">{v} ({fmtY(e.payload[metric])})</span>} />
          </PieChart>
        </ResponsiveContainer>
        {/* Summary table */}
        <div className="mt-4 border-t dark:border-gray-700 pt-4">
          <table className="w-full text-base">
            <thead><tr className="text-gray-400 dark:text-gray-500">
              <th className="text-left py-2 pr-2">產品</th>
              <th className="text-right py-2 pr-2">金額</th>
              <th className="text-right py-2 pr-2">數量</th>
              <th className="text-right py-2">客戶</th>
            </tr></thead>
            <tbody>
              {top8.map((d, i) => (
                <tr key={d.name} className="border-t border-gray-50 dark:border-gray-700">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-base text-gray-700 dark:text-gray-200 truncate max-w-[120px]">{d.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2 pr-2 font-mono text-base text-gray-700 dark:text-gray-200">{fmtY(d.subtotal)}</td>
                  <td className="text-right py-2 pr-2 font-mono text-base text-gray-500 dark:text-gray-400">{d.quantity.toLocaleString()}</td>
                  <td className="text-right py-2 text-base text-gray-500 dark:text-gray-400">{d.customerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ChannelChart({ productByChannel, metric }) {
  const { data, series } = productByChannel
  if (!data.length) return <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-base">無資料</div>
  const maxNameLen = Math.max(0, ...data.map(d => d.product?.length || 0))
  const yAxisWidth = Math.min(220, Math.max(120, maxNameLen * 8))
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
      <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">產品 × 通路銷售分布（前15產品，堆疊）</h4>
      <ResponsiveContainer width="100%" height={500}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
          <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false} />
          <YAxis type="category" dataKey="product" tick={{ fontSize: 14, fill: '#374151' }} width={yAxisWidth} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 14 }} />
          {series.map((s, i) => (
            <Bar key={s} dataKey={s} stackId="a" fill={COLORS[i % COLORS.length]} name={s}
              radius={i === series.length - 1 ? [0, 5, 5, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function CustomerDistChart({ productData, productCustomerData, metric }) {
  const top8 = productData.slice(0, 8)
  if (!top8.length) return <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-base">無資料</div>
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {top8.map((prod, pi) => {
        const customers = productCustomerData[prod.name] || []
        return (
          <div key={prod.name} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: COLORS[pi % COLORS.length] }}>
                  {pi + 1}
                </span>
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{prod.name}</span>
              </div>
              <span className="text-sm text-gray-400 dark:text-gray-500">{fmtY(prod[metric])}</span>
            </div>
            {customers.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">無客戶資料</p>
            ) : (
              <div className="space-y-2.5">
                {customers.map((c, i) => {
                  const pct = customers[0][metric] > 0 ? (c[metric] / customers[0][metric]) * 100 : 0
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-200">{c.name}</span>
                        <span className="font-mono text-gray-700 dark:text-gray-200">{fmtY(c[metric])}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[pi % COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ProductChart({ productData, productByChannel, productCustomerData, metric }) {
  const [subTab, setSubTab] = useState('ranking')
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  const tabs = [
    { v: 'ranking', l: '📊 圖表排行' },
    { v: 'channel', l: '🏪 通路分布' },
    { v: 'customer', l: '👥 客戶分布' },
  ]

  return (
    <ChartCard title={`產品分析 — ${label}`}>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
            {tabs.map(t => (
              <button key={t.v} onClick={() => setSubTab(t.v)}
                className={`px-2 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-sm sm:text-base font-medium transition-all ${subTab === t.v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {productData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-base text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border dark:border-gray-700">
            無產品資料（請確認檔案有「產品名稱」欄位）
          </div>
        ) : (
          <>
            {subTab === 'ranking' && <RankingChart data={productData} metric={metric} />}
            {subTab === 'channel' && <ChannelChart productByChannel={productByChannel} metric={metric} />}
            {subTab === 'customer' && <CustomerDistChart productData={productData} productCustomerData={productCustomerData} metric={metric} />}
            <RankingTable data={productData} metric={metric} />
          </>
        )}
      </div>
    </ChartCard>
  )
}

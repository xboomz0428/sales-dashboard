import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts'
import ChartDataTable from '../ChartDataTable'
import ChartCard from '../ChartCard'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#14B8A6','#F43F5E']

function fmtY(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function CustomerTooltip({ active, payload, label, customerData }) {
  if (!active || !payload?.length) return null
  const d = customerData.find(c => c.name === label)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 text-xs min-w-[200px]">
      <p className="font-bold text-gray-800 dark:text-gray-100 border-b dark:border-gray-700 pb-1.5 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">銷售金額</span><span className="font-mono font-semibold">{fmtY(d?.subtotal || 0)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">銷售數量</span><span className="font-mono">{(d?.quantity || 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">訂單筆數</span><span className="font-mono">{(d?.count || 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">平均客單</span><span className="font-mono">{fmtY(d?.avgOrderValue || 0)}</span></div>
        {d?.channelTypes?.length > 0 && <div className="pt-1 border-t dark:border-gray-700"><span className="text-gray-400 dark:text-gray-500">通路：</span><span className="text-gray-600 dark:text-gray-300">{d.channelTypes.join('、')}</span></div>}
        {d?.brands?.length > 0 && <div><span className="text-gray-400 dark:text-gray-500">品牌：</span><span className="text-gray-600 dark:text-gray-300">{d.brands.slice(0, 5).join('、')}{d.brands.length > 5 ? `... +${d.brands.length - 5}` : ''}</span></div>}
      </div>
    </div>
  )
}

function RankingChart({ customerData, metric }) {
  const top30 = customerData.slice(0, 30)
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'
  if (!top30.length) return <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">無客戶資料</div>
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bar chart */}
      <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">客戶銷售排行（前30名）</h4>
        <ResponsiveContainer width="100%" height={520}>
          <BarChart data={top30} layout="vertical" margin={{ top: 5, right: 80, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 14, fill: '#6b7280' }} width={110} />
            <Tooltip content={<CustomerTooltip customerData={customerData} />} />
            <Bar dataKey={metric} name={label} radius={[0, 6, 6, 0]} maxBarSize={18}>
              {top30.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              <LabelList dataKey={metric} position="right" formatter={fmtY} style={{ fontSize: 14, fill: '#9ca3af' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Top 10 cards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Top 10 客戶詳情</h4>
        <div className="space-y-3 overflow-y-auto max-h-[500px]">
          {customerData.slice(0, 10).map((c, i) => (
            <div key={c.name} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                  {i + 1}
                </span>
                <span className="text-base font-semibold text-gray-700 dark:text-gray-200 truncate">{c.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-base">
                <span className="text-gray-400 dark:text-gray-500">金額</span><span className="font-mono font-semibold text-gray-700 dark:text-gray-200 text-right">{fmtY(c.subtotal)}</span>
                <span className="text-gray-400 dark:text-gray-500">數量</span><span className="font-mono font-semibold text-gray-500 dark:text-gray-400 text-right">{c.quantity.toLocaleString()}</span>
                <span className="text-gray-400 dark:text-gray-500">客單價</span><span className="font-mono font-semibold text-gray-500 dark:text-gray-400 text-right">{fmtY(c.avgOrderValue)}</span>
              </div>
              {c.channelTypes.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1.5">
                  {c.channelTypes.map(ct => <span key={ct} className="text-sm px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{ct}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChannelCustomerChart({ channelCustomerData }) {
  if (!channelCustomerData.length) return <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">無資料</div>
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">各通路類型客戶數</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={channelCustomerData} layout="vertical" margin={{ top: 5, right: 70, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 14, fill: '#6b7280' }} width={90} />
            <Tooltip formatter={(v) => [v + ' 個', '客戶數']} />
            <Bar dataKey="customerCount" name="客戶數" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {channelCustomerData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              <LabelList dataKey="customerCount" position="right" style={{ fontSize: 14, fill: '#9ca3af' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Channel detail cards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">通路客群詳情</h4>
        <div className="space-y-3 max-h-[280px] overflow-y-auto">
          {channelCustomerData.map((d, i) => (
            <div key={d.name} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-base font-semibold text-gray-700 dark:text-gray-200">{d.name}</span>
                </div>
                <span className="text-base font-bold" style={{ color: COLORS[i % COLORS.length] }}>{d.customerCount} 位客戶</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-base text-center">
                <div className="bg-white dark:bg-gray-700 rounded-md p-1.5 border border-gray-100 dark:border-gray-600">
                  <div className="font-bold text-gray-700 dark:text-gray-200">{d.brandCount}</div>
                  <div className="text-gray-400 dark:text-gray-500">品牌</div>
                </div>
                <div className="bg-white dark:bg-gray-700 rounded-md p-1.5 border border-gray-100 dark:border-gray-600">
                  <div className="font-bold text-gray-700 dark:text-gray-200">{d.productCount}</div>
                  <div className="text-gray-400 dark:text-gray-500">品項</div>
                </div>
                <div className="bg-white dark:bg-gray-700 rounded-md p-1.5 border border-gray-100 dark:border-gray-600">
                  <div className="font-bold text-gray-700 dark:text-gray-200">{fmtY(d.subtotal)}</div>
                  <div className="text-gray-400 dark:text-gray-500">金額</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CustomerChart({ customerData, channelCustomerData, metric }) {
  const [subTab, setSubTab] = useState('ranking')
  const label = metric === 'subtotal' ? '銷售金額' : '銷售數量'

  return (
    <ChartCard title={`客戶分析 — ${label}`}>
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-lg">
          {[{ v: 'ranking', l: '客戶排行' }, { v: 'channel', l: '通路客群' }].map(t => (
            <button key={t.v} onClick={() => setSubTab(t.v)}
              className={`px-3 py-1.5 rounded-md text-base font-medium transition-all ${subTab === t.v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {customerData.length === 0 && subTab === 'ranking' ? (
        <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          無客戶資料（請確認檔案有「客戶名稱」欄位）
        </div>
      ) : (
        <>
          {subTab === 'ranking' && <RankingChart customerData={customerData} metric={metric} />}
          {subTab === 'channel' && <ChannelCustomerChart channelCustomerData={channelCustomerData} />}

          {/* Always-visible full customer table */}
          {customerData.length > 0 && (
            <ChartDataTable
              title="客戶銷售數據"
              defaultOpen={true}
              data={customerData.map((d, i) => ({
                rank: i + 1, name: d.name,
                subtotal: d.subtotal, quantity: d.quantity,
                count: d.count, avgOrderValue: d.avgOrderValue,
                channels: d.channelTypes?.join('、') || '—',
              }))}
              columns={[
                { key: 'rank', label: '#', align: 'right', sortable: true },
                { key: 'name', label: '客戶名稱', sortable: true },
                { key: 'subtotal', label: '銷售金額', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'quantity', label: '銷售數量', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'count', label: '訂單數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'avgOrderValue', label: '平均客單', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'channels', label: '購買通路', sortable: true },
              ]}
            />
          )}

          {/* Channel customer table for channel tab */}
          {subTab === 'channel' && channelCustomerData.length > 0 && (
            <ChartDataTable
              title="通路客群數據"
              defaultOpen={true}
              data={[...channelCustomerData].sort((a, b) => b.subtotal - a.subtotal)}
              columns={[
                { key: 'name', label: '通路類型', sortable: true },
                { key: 'customerCount', label: '客戶數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'brandCount', label: '品牌數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'productCount', label: '品項數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
                { key: 'subtotal', label: '銷售金額', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
              ]}
            />
          )}
        </>
      )}
    </div>
    </ChartCard>
  )
}

import { useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis,
} from 'recharts'
import ChartCard from '../ChartCard'
import ChartDataTable from '../ChartDataTable'

function fmtY(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

const QUADRANTS = [
  { key: 'star',      label: '⭐ 明星',  desc: '高業績 × 高銷量',  color: '#10B981', bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700', headerBg: 'bg-emerald-500' },
  { key: 'cash',      label: '💰 金牛',  desc: '高業績 × 低銷量',  color: '#3B82F6', bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700',    headerBg: 'bg-blue-500' },
  { key: 'potential', label: '🚀 潛力',  desc: '低業績 × 高銷量',  color: '#F59E0B', bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',   headerBg: 'bg-amber-500' },
  { key: 'review',    label: '⚠️ 待檢討', desc: '低業績 × 低銷量', color: '#EF4444', bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700',     headerBg: 'bg-red-500' },
]

function classify(d, medSubtotal, medQuantity) {
  const hi = d.subtotal >= medSubtotal, hq = d.quantity >= medQuantity
  if (hi && hq) return 'star'
  if (hi && !hq) return 'cash'
  if (!hi && hq) return 'potential'
  return 'review'
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-4 text-sm min-w-[200px]">
      <p className="font-bold text-gray-800 border-b border-gray-100 pb-2 mb-2">{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between"><span className="text-gray-400">銷售金額</span><span className="font-mono font-bold">{fmtY(d.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">銷售數量</span><span className="font-mono">{d.quantity?.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">訂單筆數</span><span className="font-mono">{d.count?.toLocaleString()}</span></div>
        {d.avgOrderValue > 0 && <div className="flex justify-between"><span className="text-gray-400">平均客單</span><span className="font-mono">{fmtY(d.avgOrderValue)}</span></div>}
      </div>
    </div>
  )
}

// Quadrant detail table
function QuadrantTable({ items, q, dimension }) {
  if (!items.length) return (
    <div className={`rounded-2xl border p-4 ${q.bg} ${q.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-bold px-3 py-1 rounded-full text-white ${q.headerBg}`}>{q.label}</span>
        <span className={`text-sm font-medium ${q.text}`}>{q.desc}</span>
      </div>
      <p className="text-sm text-gray-400">此象限無資料</p>
    </div>
  )
  return (
    <div className={`rounded-2xl border ${q.bg} ${q.border} overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-3 ${q.headerBg}`}>
        <span className="text-sm font-bold text-white">{q.label} — {q.desc}</span>
        <span className="text-sm font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-full">{items.length} 項</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/60">
              <th className={`text-center px-3 py-3 font-semibold ${q.text} w-10`}>#</th>
              <th className={`text-left px-3 py-3 font-semibold ${q.text}`}>{dimension === 'product' ? '產品名稱' : '通路名稱'}</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>銷售金額</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>銷售數量</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>訂單數</th>
              {dimension === 'product' && <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>平均客單</th>}
              {dimension === 'product' && <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>客戶數</th>}
            </tr>
          </thead>
          <tbody>
            {items.sort((a, b) => b.subtotal - a.subtotal).map((d, i) => (
              <tr key={d.name} className={`border-t border-white/40 ${i % 2 === 0 ? '' : 'bg-white/30'}`}>
                <td className={`text-center px-3 py-3 text-sm font-medium ${q.text}`}>{i + 1}</td>
                <td className="px-3 py-3 text-sm font-medium text-gray-800">{d.name}</td>
                <td className="px-3 py-3 text-right font-mono text-sm text-gray-700">{d.subtotal.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-sm text-gray-600">{d.quantity.toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-sm text-gray-500">{d.count?.toLocaleString() || '—'}</td>
                {dimension === 'product' && <td className="px-3 py-3 text-right font-mono text-sm text-gray-500">{d.avgOrderValue ? d.avgOrderValue.toLocaleString() : '—'}</td>}
                {dimension === 'product' && <td className="px-3 py-3 text-right text-sm text-gray-500">{d.customerCount || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PerformanceMatrix({ performanceData, metric }) {
  const [dimension, setDimension] = useState('product')
  const { productPerf, channelPerf, productMedian, channelMedian } = performanceData

  const data = dimension === 'product' ? productPerf : channelPerf
  const med = dimension === 'product' ? productMedian : channelMedian
  const label = dimension === 'product' ? '產品' : '通路'

  const classified = data.map(d => ({ ...d, quadrant: classify(d, med.subtotal, med.quantity) }))
  const byQuadrant = {}
  QUADRANTS.forEach(q => { byQuadrant[q.key] = classified.filter(d => d.quadrant === q.key) })

  const topByMetric = [...classified].sort((a, b) => b[metric] - a[metric]).slice(0, 5)

  return (
    <ChartCard title="績效矩陣 — 老闆視角" subtitle="銷售金額 × 銷售數量 · 四象限分析">
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[{ v: 'product', l: '產品維度' }, { v: 'channel', l: '通路維度' }].map(t => (
            <button key={t.v} onClick={() => setDimension(t.v)}
              className={`px-4 py-2 rounded-lg text-base font-medium transition-all ${dimension === t.v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Quadrant summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {QUADRANTS.map(q => (
          <div key={q.key} className={`p-4 rounded-2xl border ${q.bg} ${q.border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-bold ${q.text}`}>{q.label}</span>
              <span className={`text-lg font-black ${q.text}`}>{byQuadrant[q.key].length}</span>
            </div>
            <p className="text-base text-gray-500">{q.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Scatter chart */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="text-base font-bold text-gray-700 mb-1">{label}績效散佈圖</h4>
          <p className="text-sm text-gray-400 mb-4">虛線為中位數分界 · 氣泡大小代表訂單數</p>
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-base">無資料</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="subtotal" name="銷售金額" tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false}
                  label={{ value: '← 銷售金額 →', position: 'insideBottom', offset: -16, fontSize: 14, fill: '#9ca3af' }} />
                <YAxis dataKey="quantity" name="銷售數量" tickFormatter={fmtY} tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false}
                  label={{ value: '銷量 ↑', angle: -90, position: 'insideLeft', fontSize: 14, fill: '#9ca3af' }} />
                <ZAxis dataKey="count" range={[50, 400]} />
                <Tooltip content={<ScatterTooltip />} />
                <ReferenceLine x={med.subtotal} stroke="#d1d5db" strokeDasharray="5 4" strokeWidth={1.5} />
                <ReferenceLine y={med.quantity} stroke="#d1d5db" strokeDasharray="5 4" strokeWidth={1.5} />
                <Scatter
                  data={classified}
                  shape={(props) => {
                    const { cx, cy, payload } = props
                    const q = QUADRANTS.find(q => q.key === payload.quadrant)
                    const r = Math.max(7, Math.min(24, Math.sqrt(payload.count || 1) * 3.5))
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={r} fill={q?.color || '#9ca3af'} fillOpacity={0.7} stroke={q?.color || '#9ca3af'} strokeWidth={1.5} />
                        {r >= 12 && (
                          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="white" fontWeight={700}>
                            {payload.name?.slice(0, 4)}
                          </text>
                        )}
                      </g>
                    )
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Rankings sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h4 className="text-sm font-bold text-emerald-700 mb-4">⭐ Top 5 熱銷{label}</h4>
            <div className="space-y-3">
              {topByMetric.map((d, i) => {
                const q = QUADRANTS.find(q => q.key === d.quadrant)
                return (
                  <div key={d.name} className="flex items-start gap-3">
                    <span className="text-base font-black text-gray-200 w-5 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-700 truncate">{d.name}</span>
                        <span className={`text-sm px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${q?.bg} ${q?.text}`}>{q?.label}</span>
                      </div>
                      <div className="text-base text-gray-400">{fmtY(d.subtotal)} · {d.quantity?.toLocaleString()} 件</div>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(d[metric] / (topByMetric[0]?.[metric] || 1)) * 100}%`, background: q?.color || '#3B82F6' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${byQuadrant['review'].length === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <h4 className={`text-sm font-bold mb-3 ${byQuadrant['review'].length === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {byQuadrant['review'].length === 0 ? '🎉 無待檢討項目' : `⚠️ 待檢討 ${label}（${byQuadrant['review'].length} 項）`}
            </h4>
            {byQuadrant['review'].slice(0, 5).map(d => (
              <div key={d.name} className="p-2.5 rounded-xl bg-red-100/60 border border-red-100 mb-2">
                <div className="text-sm font-medium text-red-700">{d.name}</div>
                <div className="text-base text-red-400 mt-0.5">{fmtY(d.subtotal)} · {d.quantity?.toLocaleString()} 件</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
            <h4 className="text-sm font-bold text-blue-700 mb-3">📊 分析摘要</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">分析{label}數</span><span className="font-bold text-gray-700">{data.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">金額中位數</span><span className="font-bold text-gray-700">{fmtY(med.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">數量中位數</span><span className="font-bold text-gray-700">{med.quantity?.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Quadrant detail tables */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-4">📋 各象限{label}詳細清單</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {QUADRANTS.map(q => (
            <QuadrantTable key={q.key} items={byQuadrant[q.key]} q={q} dimension={dimension} />
          ))}
        </div>
      </div>

      {/* Channel dimension: full sortable data table */}
      {dimension === 'channel' && data.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <ChartDataTable
            title="通路完整銷售數據"
            defaultOpen={true}
            data={[...data].sort((a, b) => b.subtotal - a.subtotal).map((d, i) => ({ ...d, rank: i + 1 }))}
            columns={[
              { key: 'rank', label: '#', align: 'right', sortable: true },
              { key: 'name', label: '通路名稱', sortable: true },
              { key: 'subtotal', label: '銷售金額', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
              { key: 'quantity', label: '銷售數量', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
              { key: 'count', label: '訂單數', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
            ]}
          />
        </div>
      )}
    </div>
    </ChartCard>
  )
}

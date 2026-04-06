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
  { key: 'star',      label: '⭐ 明星',  desc: '高業績 × 高銷量',  color: '#10B981', bg: 'bg-emerald-50 dark:bg-emerald-900/20',  border: 'border-emerald-200 dark:border-emerald-800/50', text: 'text-emerald-700', headerBg: 'bg-emerald-500' },
  { key: 'cash',      label: '💰 金牛',  desc: '高業績 × 低銷量',  color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800/50',    text: 'text-blue-700',    headerBg: 'bg-blue-500' },
  { key: 'potential', label: '🚀 潛力',  desc: '低業績 × 高銷量',  color: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20',    border: 'border-amber-200 dark:border-amber-800/50',   text: 'text-amber-700',   headerBg: 'bg-amber-500' },
  { key: 'review',    label: '⚠️ 待檢討', desc: '低業績 × 低銷量', color: '#EF4444', bg: 'bg-red-50 dark:bg-red-900/20',      border: 'border-red-200 dark:border-red-800/50',     text: 'text-red-700',     headerBg: 'bg-red-500' },
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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 text-sm min-w-[200px]">
      <p className="font-bold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between"><span className="text-gray-400 dark:text-gray-500">銷售金額</span><span className="font-mono font-bold">{fmtY(d.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400 dark:text-gray-500">銷售數量</span><span className="font-mono">{d.quantity?.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-400 dark:text-gray-500">訂單筆數</span><span className="font-mono">{d.count?.toLocaleString()}</span></div>
        {d.avgOrderValue > 0 && <div className="flex justify-between"><span className="text-gray-400 dark:text-gray-500">平均客單</span><span className="font-mono">{fmtY(d.avgOrderValue)}</span></div>}
      </div>
    </div>
  )
}

const DIM_CONFIG = {
  product:  { nameLabel: '產品名稱',  extraCols: [{ label: '平均客單', key: 'avgOrderValue', mono: true }, { label: '客戶數', key: 'customerCount' }] },
  channel:  { nameLabel: '通路名稱',  extraCols: [] },
  brand:    { nameLabel: '品牌名稱',  extraCols: [] },
  customer: { nameLabel: '客戶名稱',  extraCols: [{ label: '平均客單', key: 'avgOrderValue', mono: true }] },
}

// Quadrant detail table
function QuadrantTable({ items, q, dimension }) {
  const { nameLabel, extraCols } = DIM_CONFIG[dimension] || DIM_CONFIG.product
  if (!items.length) return (
    <div className={`rounded-2xl border p-4 ${q.bg} ${q.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-bold px-3 py-1 rounded-full text-white ${q.headerBg}`}>{q.label}</span>
        <span className={`text-sm font-medium ${q.text}`}>{q.desc}</span>
      </div>
      <p className="text-sm text-gray-400 dark:text-gray-500">此象限無資料</p>
    </div>
  )
  return (
    <div className={`rounded-2xl border ${q.bg} ${q.border} overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-3 ${q.headerBg}`}>
        <span className="text-sm font-bold text-white">{q.label} — {q.desc}</span>
        <span className="text-sm font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-full">{items.length} 項</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-white/60">
              <th className={`text-center px-3 py-3 font-semibold ${q.text} w-10`}>#</th>
              <th className={`text-left px-3 py-3 font-semibold ${q.text}`}>{nameLabel}</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>銷售金額</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>銷售數量</th>
              <th className={`text-right px-3 py-3 font-semibold ${q.text}`}>訂單數</th>
              {extraCols.map(col => (
                <th key={col.key} className={`text-right px-3 py-3 font-semibold ${q.text}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.sort((a, b) => b.subtotal - a.subtotal).map((d, i) => (
              <tr key={d.name} className={`border-t border-white/40 ${i % 2 === 0 ? '' : 'bg-white/30 dark:bg-white/5'}`}>
                <td className={`text-center px-3 py-3 text-base font-medium ${q.text}`}>{i + 1}</td>
                <td className="px-3 py-3 text-base font-medium text-gray-800 dark:text-gray-200">{d.name}</td>
                <td className="px-3 py-3 text-right font-mono text-base text-gray-700 dark:text-gray-200">{d.subtotal.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-base text-gray-600 dark:text-gray-300">{d.quantity.toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-base text-gray-500 dark:text-gray-400">{d.count?.toLocaleString() || '—'}</td>
                {extraCols.map(col => (
                  <td key={col.key} className={`px-3 py-3 text-right text-base text-gray-500 dark:text-gray-400 ${col.mono ? 'font-mono' : ''}`}>
                    {d[col.key] != null ? d[col.key].toLocaleString() : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const DIMENSIONS = [
  { v: 'product',  l: '產品維度',  icon: '🏷️' },
  { v: 'channel',  l: '通路維度',  icon: '🏪' },
  { v: 'brand',    l: '品牌維度',  icon: '✨' },
  { v: 'customer', l: '客戶維度',  icon: '👥' },
]

export default function PerformanceMatrix({ performanceData, metric }) {
  const [dimension, setDimension] = useState('product')
  const { productPerf, channelPerf, brandPerf, customerPerf,
          productMedian, channelMedian, brandMedian, customerMedian } = performanceData

  const dimMap = {
    product:  { data: productPerf,  med: productMedian,  label: '產品' },
    channel:  { data: channelPerf,  med: channelMedian,  label: '通路' },
    brand:    { data: brandPerf,    med: brandMedian,    label: '品牌' },
    customer: { data: customerPerf, med: customerMedian, label: '客戶' },
  }
  const { data, med, label } = dimMap[dimension]

  const classified = data.map(d => ({ ...d, quadrant: classify(d, med.subtotal, med.quantity) }))
  const byQuadrant = {}
  QUADRANTS.forEach(q => { byQuadrant[q.key] = classified.filter(d => d.quadrant === q.key) })

  const topByMetric = [...classified].sort((a, b) => b[metric] - a[metric]).slice(0, 5)

  return (
    <ChartCard title="績效矩陣 — 老闆視角" subtitle="銷售金額 × 銷售數量 · 四象限分析">
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
          {DIMENSIONS.map(t => (
            <button key={t.v} onClick={() => setDimension(t.v)}
              className={`flex items-center gap-1.5 px-2 sm:px-4 py-2 min-h-[36px] rounded-lg text-sm sm:text-base font-medium transition-all ${dimension === t.v ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              <span>{t.icon}</span>{t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Quadrant summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUADRANTS.map(q => (
          <div key={q.key} className={`p-4 rounded-2xl border ${q.bg} ${q.border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-bold ${q.text}`}>{q.label}</span>
              <span className={`text-lg font-black ${q.text}`}>{byQuadrant[q.key].length}</span>
            </div>
            <p className="text-base text-gray-500 dark:text-gray-400">{q.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Scatter chart */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">{label}績效散佈圖</h4>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">虛線為中位數分界 · 氣泡大小代表訂單數</p>
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
                          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="white" fontWeight={700}>
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h4 className="text-sm font-bold text-emerald-700 mb-4">⭐ Top 5 熱銷{label}</h4>
            <div className="space-y-3">
              {topByMetric.map((d, i) => {
                const q = QUADRANTS.find(q => q.key === d.quadrant)
                return (
                  <div key={d.name} className="flex items-start gap-3">
                    <span className="text-base font-black text-gray-200 w-5 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{d.name}</span>
                        <span className={`text-sm px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${q?.bg} ${q?.text}`}>{q?.label}</span>
                      </div>
                      <div className="text-base text-gray-400 dark:text-gray-500">{fmtY(d.subtotal)} · {d.quantity?.toLocaleString()} 件</div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(d[metric] / (topByMetric[0]?.[metric] || 1)) * 100}%`, background: q?.color || '#3B82F6' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${byQuadrant['review'].length === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50'}`}>
            <h4 className={`text-sm font-bold mb-3 ${byQuadrant['review'].length === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {byQuadrant['review'].length === 0 ? '🎉 無待檢討項目' : `⚠️ 待檢討 ${label}（${byQuadrant['review'].length} 項）`}
            </h4>
            {byQuadrant['review'].slice(0, 5).map(d => (
              <div key={d.name} className="p-2.5 rounded-xl bg-red-100/60 dark:bg-red-900/30 border border-red-100 dark:border-red-800/50 mb-2">
                <div className="text-sm font-medium text-red-700 dark:text-red-400">{d.name}</div>
                <div className="text-base text-red-400 dark:text-red-500 mt-0.5">{fmtY(d.subtotal)} · {d.quantity?.toLocaleString()} 件</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-indigo-50 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 p-5">
            <h4 className="text-sm font-bold text-blue-700 mb-3">📊 分析摘要</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">分析{label}數</span><span className="font-bold text-gray-700 dark:text-gray-200">{data.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">金額中位數</span><span className="font-bold text-gray-700 dark:text-gray-200">{fmtY(med.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">數量中位數</span><span className="font-bold text-gray-700 dark:text-gray-200">{med.quantity?.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Quadrant detail tables */}
      <div>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-4">📋 各象限{label}詳細清單</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {QUADRANTS.map(q => (
            <QuadrantTable key={q.key} items={byQuadrant[q.key]} q={q} dimension={dimension} />
          ))}
        </div>
      </div>

      {/* Full sortable data table */}
      {data.length > 0 && (() => {
        const baseColumns = [
          { key: 'rank',     label: '#',     align: 'right', sortable: true },
          { key: 'name',     label: `${label}名稱`, sortable: true },
          { key: 'subtotal', label: '銷售金額', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'quantity', label: '銷售數量', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          { key: 'count',    label: '訂單數',   align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
        ]
        const extraColumns = {
          product:  [
            { key: 'avgOrderValue', label: '平均客單', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
            { key: 'customerCount', label: '客戶數',   align: 'right', sortable: true },
          ],
          channel:  [],
          brand:    [],
          customer: [
            { key: 'avgOrderValue', label: '平均客單', align: 'right', sortable: true, fmt: v => v != null ? Math.round(v).toLocaleString() : '—' },
          ],
        }
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <ChartDataTable
              title={`${label}完整銷售數據`}
              defaultOpen={true}
              data={[...data].sort((a, b) => b.subtotal - a.subtotal).map((d, i) => ({ ...d, rank: i + 1 }))}
              columns={[...baseColumns, ...(extraColumns[dimension] || [])]}
            />
          </div>
        )
      })()}
    </div>
    </ChartCard>
  )
}

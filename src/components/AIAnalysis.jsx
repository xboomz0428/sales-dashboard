import { useState, useRef, useEffect, useCallback } from 'react'
import { buildAIPayload, buildPrompt, streamAnalysis } from '../utils/aiAnalyst'
import { supabase, supabaseReady } from '../config/supabase'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1']
const RADIAN = Math.PI / 180
function PiePct({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  return (
    <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700}>
      {Math.round(percent * 100)}%
    </text>
  )
}

function fmtAI(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

// ─── Chart Dashboard for AI Panel ─────────────────────────────────────────────
function AIChartDashboard({ salesData }) {
  const [chartTab, setChartTab] = useState('bar')
  const { brandData = [], productData = [], channelData = [], channelTypeData = [], summary = {}, trendData = [] } = salesData

  const top8Brands = brandData.slice(0, 8)
  const top10Products = productData.slice(0, 10)
  const metricLabel = '銷售金額'

  // Radar: top 5 brands normalized scores
  const radarBrands = brandData.slice(0, 6)
  const maxSubtotal = Math.max(1, ...radarBrands.map(d => d.subtotal))
  const maxQty = Math.max(1, ...radarBrands.map(d => d.quantity))
  const maxCount = Math.max(1, ...radarBrands.map(d => d.count))
  const radarData = [
    { axis: '銷售金額', ...Object.fromEntries(radarBrands.map(d => [d.name, Math.round(d.subtotal / maxSubtotal * 100)])) },
    { axis: '銷售數量', ...Object.fromEntries(radarBrands.map(d => [d.name, Math.round(d.quantity / maxQty * 100)])) },
    { axis: '訂單筆數', ...Object.fromEntries(radarBrands.map(d => [d.name, Math.round(d.count / maxCount * 100)])) },
  ]

  // KPI color blocks
  const kpis = [
    { label: '總銷售金額', value: fmtAI(summary.totalSales), sub: '元', color: 'from-blue-500 to-blue-700' },
    { label: '銷售數量', value: fmtAI(summary.totalQty), sub: '件', color: 'from-emerald-500 to-teal-600' },
    { label: '訂單筆數', value: fmtAI(summary.orderCount), sub: '筆', color: 'from-violet-500 to-purple-600' },
    { label: '客戶數', value: fmtAI(summary.customerCount), sub: '人', color: 'from-amber-500 to-orange-500' },
    { label: '品項數', value: fmtAI(summary.productCount), sub: '項', color: 'from-rose-500 to-pink-600' },
    { label: '平均折扣', value: summary.avgDiscount > 0 ? Math.round(summary.avgDiscount * 100) + '%' : '無', sub: '', color: 'from-cyan-500 to-sky-600' },
  ]

  const TABS = [
    { id: 'kpi', label: '📊 KPI 色塊' },
    { id: 'bar', label: '📈 長條圖' },
    { id: 'pie', label: '🥧 圓餅圖' },
    { id: 'radar', label: '🕸️ 雷達圖' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setChartTab(t.id)}
            className={`px-4 py-2 rounded-lg text-base font-medium transition-all flex-1 min-w-fit ${chartTab === t.id ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI 色塊 */}
      {chartTab === 'kpi' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {kpis.map(k => (
              <div key={k.label} className={`bg-gradient-to-br ${k.color} rounded-2xl p-5 text-white`}>
                <p className="text-base text-white/70 font-medium">{k.label}</p>
                <p className="text-3xl font-black mt-1">{k.value}</p>
                {k.sub && <p className="text-base text-white/60 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>
          {top8Brands.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">品牌銷售排行</p>
              <div className="space-y-2">
                {top8Brands.map((b, i) => {
                  const pct = top8Brands[0].subtotal > 0 ? b.subtotal / top8Brands[0].subtotal * 100 : 0
                  return (
                    <div key={b.name}>
                      <div className="flex justify-between text-base mb-1">
                        <span className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[60%]">{b.name}</span>
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{fmtAI(b.subtotal)}</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 長條圖 */}
      {chartTab === 'bar' && (
        <div className="space-y-4">
          {top10Products.length > 0 && (
            <div>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">產品銷售 Top 10</p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={top10Products} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtAI} tick={{ fontSize: 13, fill: '#9ca3af' }} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#374151' }} width={130} />
                  <Tooltip formatter={v => v.toLocaleString()} />
                  <Bar dataKey="subtotal" name={metricLabel} radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {top10Products.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {top8Brands.length > 0 && (
            <div>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">品牌銷售 Top 8</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={top8Brands} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis tickFormatter={fmtAI} tick={{ fontSize: 13, fill: '#9ca3af' }} width={55} />
                  <Tooltip formatter={v => v.toLocaleString()} />
                  <Bar dataKey="subtotal" name={metricLabel} radius={[6,6,0,0]} maxBarSize={50}>
                    {top8Brands.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 圓餅圖 */}
      {chartTab === 'pie' && (
        <div className="space-y-4">
          {top8Brands.length > 0 && (
            <div>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">品牌銷售佔比</p>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={top8Brands} dataKey="subtotal" nameKey="name" cx="50%" cy="50%" outerRadius="70%" labelLine={false} label={PiePct}>
                    {top8Brands.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => v.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 13 }} formatter={(v, e) => `${v} (${fmtAI(e.payload.subtotal)})`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {channelData.length > 0 && (
            <div>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">通路銷售佔比</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={channelData} dataKey="subtotal" nameKey="name" cx="50%" cy="50%" outerRadius="65%" labelLine={false} label={PiePct}>
                    {channelData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => v.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 雷達圖 */}
      {chartTab === 'radar' && (
        <div>
          {radarBrands.length < 2 ? (
            <div className="flex items-center justify-center h-48 text-base text-gray-400 dark:text-gray-500">需要至少 2 個品牌才能顯示雷達圖</div>
          ) : (
            <>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">品牌多維績效雷達（正規化 0-100）</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">各指標以最高值為 100 分比例計算</p>
              <ResponsiveContainer width="100%" height={340}>
                <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 14, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  {radarBrands.map((b, i) => (
                    <Radar key={b.name} name={b.name} dataKey={b.name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.15} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Tooltip formatter={(v, n) => [`${v} 分`, n]} />
                </RadarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const ANALYSIS_TYPES = [
  { value: 'comprehensive', label: '📊 完整分析', desc: '全面評估所有面向',    color: 'from-blue-600 to-indigo-600',   light: 'bg-blue-600' },
  { value: 'channel',       label: '🏪 通路分析', desc: '通路深度洞察與優化',  color: 'from-emerald-500 to-teal-600',  light: 'bg-emerald-600' },
  { value: 'product',       label: '🎯 產品開發', desc: '產品策略與新品建議',  color: 'from-violet-500 to-purple-600', light: 'bg-violet-600' },
  { value: 'growth',        label: '🚀 成長策略', desc: '25% 年度成長計畫',   color: 'from-amber-500 to-orange-500',  light: 'bg-amber-600' },
]

const SECTION_THEMES = [
  { grad: 'from-blue-500 to-blue-700',       bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-100 dark:border-blue-700/50',    text: 'text-blue-800 dark:text-blue-300',    dot: 'bg-blue-500',    num: 'bg-blue-600' },
  { grad: 'from-emerald-500 to-teal-600',    bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-700/50', text: 'text-emerald-800 dark:text-emerald-300', dot: 'bg-emerald-500', num: 'bg-emerald-600' },
  { grad: 'from-violet-500 to-purple-600',   bg: 'bg-violet-50 dark:bg-violet-900/20',  border: 'border-violet-100 dark:border-violet-700/50',  text: 'text-violet-800 dark:text-violet-300',  dot: 'bg-violet-500',  num: 'bg-violet-600' },
  { grad: 'from-amber-500 to-orange-600',    bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-100 dark:border-amber-700/50',   text: 'text-amber-800 dark:text-amber-300',   dot: 'bg-amber-500',   num: 'bg-amber-600' },
  { grad: 'from-rose-500 to-pink-600',       bg: 'bg-rose-50 dark:bg-rose-900/20',    border: 'border-rose-100 dark:border-rose-700/50',    text: 'text-rose-800 dark:text-rose-300',    dot: 'bg-rose-500',    num: 'bg-rose-600' },
  { grad: 'from-cyan-500 to-sky-600',        bg: 'bg-cyan-50 dark:bg-cyan-900/20',    border: 'border-cyan-100 dark:border-cyan-700/50',    text: 'text-cyan-800 dark:text-cyan-300',    dot: 'bg-cyan-500',    num: 'bg-cyan-600' },
  { grad: 'from-indigo-500 to-blue-600',     bg: 'bg-indigo-50 dark:bg-indigo-900/20',  border: 'border-indigo-100 dark:border-indigo-700/50',  text: 'text-indigo-800 dark:text-indigo-300',  dot: 'bg-indigo-500',  num: 'bg-indigo-600' },
]

const TYPE_LABELS = { comprehensive: '完整分析', channel: '通路分析', product: '產品開發', growth: '成長策略' }
const HISTORY_KEY = 'ai_analysis_history'

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function addToHistory(entry) {
  const h = getHistory()
  h.unshift(entry)
  if (h.length > 30) h.splice(30)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}

// ─── Supabase DB 儲存/載入 ────────────────────────────────────────────────────
async function saveAnalysisToDb(user, entry) {
  if (!user || !supabaseReady) return null
  try {
    const { data, error } = await supabase
      .from('ai_analysis_records')
      .insert({
        user_id: user.id,
        type: entry.type,
        filename: entry.filename,
        content: entry.content,
        preview: entry.preview,
      })
      .select('id')
      .single()
    if (error) throw error
    return data?.id ?? null
  } catch { return null }
}

async function loadAnalysisFromDb(user) {
  if (!user || !supabaseReady) return []
  try {
    const { data, error } = await supabase
      .from('ai_analysis_records')
      .select('id, type, filename, content, preview, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data || []).map(r => ({
      id: r.id,
      type: r.type,
      filename: r.filename,
      content: r.content,
      preview: r.preview,
      date: new Date(r.created_at).toLocaleDateString('zh-TW'),
      fromDb: true,
    }))
  } catch { return [] }
}

async function deleteAnalysisFromDb(user, id) {
  if (!user || !supabaseReady) return
  try {
    await supabase.from('ai_analysis_records').delete().eq('id', id).eq('user_id', user.id)
  } catch { /* 靜默 */ }
}
function makeFilename(type) {
  const d = new Date().toISOString().slice(0, 10)
  return `${d}_${TYPE_LABELS[type] || type}.md`
}
async function saveToServer(filename, content) {
  try {
    const res = await fetch('/api/save-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.path || null
  } catch { return null }
}

// ─── Inline markdown renderer ─────────────────────────────────────────────────
function renderInline(text) {
  if (typeof text !== 'string') return text
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-bold text-gray-900 dark:text-gray-100">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-100 dark:border-blue-700/50">{p.slice(1, -1)}</code>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return <em key={i} className="italic text-gray-600 dark:text-gray-300">{p.slice(1, -1)}</em>
    return p
  })
}

// ─── Section content renderer ─────────────────────────────────────────────────
function SectionContent({ lines, theme }) {
  const elements = []
  let listType = null, listItems = [], inCode = false, codeLines = [], tableBuffer = []

  const flushList = (key) => {
    if (!listItems.length) return
    if (listType === 'ul') {
      elements.push(
        <ul key={`ul-${key}`} className="my-2.5 space-y-1.5 pl-0">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 leading-relaxed">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${theme?.dot || 'bg-blue-400'}`} />
              <span className="text-base text-gray-700 dark:text-gray-200">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
    } else {
      elements.push(
        <ol key={`ol-${key}`} className="my-2.5 space-y-1.5 pl-0">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 leading-relaxed">
              <span className={`flex-shrink-0 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center ${theme?.num || 'bg-blue-600'}`}>{j + 1}</span>
              <span className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
    }
    listItems = []; listType = null
  }

  const flushTable = (key) => {
    if (!tableBuffer.length) return
    const isSep = l => /^\|[\s|:-]+\|?\s*$/.test(l.trim())
    const parseRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const rows = tableBuffer.filter(l => !isSep(l))
    const [header, ...body] = rows
    const headers = parseRow(header || '')
    const numCols = Math.max(headers.length, ...body.map(r => parseRow(r).length))
    const thBg = theme?.num ? '' : 'bg-blue-600'
    elements.push(
      <div key={`tbl-${key}`} className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-600">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={`${theme ? '' : thBg}`} style={theme ? { background: theme.num?.replace('bg-', '') } : {}}>
              {headers.map((h, j) => (
                <th key={j} className={`px-3 py-2 text-left font-bold text-xs whitespace-nowrap ${theme ? theme.text + ' bg-opacity-20' : 'text-white'}`}
                  style={theme ? { background: 'rgba(0,0,0,0.08)', color: 'inherit' } : {}}>
                  {renderInline(h)}
                </th>
              ))}
              {Array.from({ length: Math.max(0, numCols - headers.length) }).map((_, j) => <th key={`ph-${j}`} />)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => {
              const cells = parseRow(row)
              return (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-800'} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {cells.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{renderInline(c)}</td>
                  ))}
                  {Array.from({ length: Math.max(0, numCols - cells.length) }).map((_, j) => <td key={`pc-${j}`} />)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
    tableBuffer = []
  }

  lines.forEach((line, i) => {
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|')
    if (isTableRow) {
      if (listType) flushList(i)
      tableBuffer.push(line)
      return
    }
    if (tableBuffer.length) flushTable(i)

    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-900 text-emerald-300 rounded-xl p-4 text-xs overflow-x-auto my-3 font-mono leading-relaxed">
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []; inCode = false
      } else { flushList(i); inCode = true }
      return
    }
    if (inCode) { codeLines.push(line); return }

    if (line.startsWith('### ')) {
      flushList(i)
      elements.push(
        <h3 key={`h3-${i}`} className={`text-base font-bold mt-4 mb-2 flex items-center gap-2 ${theme?.text || 'text-gray-800 dark:text-gray-100'}`}>
          <span className={`w-1 h-3.5 rounded-full flex-shrink-0 ${theme?.num || 'bg-blue-600'}`} />
          {renderInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith('#### ')) {
      flushList(i)
      elements.push(
        <h4 key={`h4-${i}`} className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-3 mb-1 uppercase tracking-wider">
          {renderInline(line.slice(5))}
        </h4>
      )
    } else if (/^[-*] /.test(line)) {
      if (listType !== 'ul') flushList(i); listType = 'ul'; listItems.push(line.slice(2))
    } else if (/^\d+\. /.test(line)) {
      if (listType !== 'ol') flushList(i); listType = 'ol'; listItems.push(line.replace(/^\d+\. /, ''))
    } else if (/^-{3,}$/.test(line.trim())) {
      // 只在上一個元素不是 hr 時才渲染，避免連續 --- 堆疊
      flushList(i)
      const last = elements[elements.length - 1]
      if (!last || last.type !== 'hr') {
        elements.push(<hr key={`hr-${i}`} className="border-gray-200 dark:border-gray-600 my-3" />)
      }
    } else if (line.trim() === '') {
      flushList(i)
    } else {
      flushList(i)
      elements.push(
        <p key={`p-${i}`} className="text-base text-gray-700 dark:text-gray-200 leading-relaxed mb-1">
          {renderInline(line)}
        </p>
      )
    }
  })
  flushList('end')
  flushTable('end')
  return <>{elements}</>
}

// ─── Full markdown report with beautiful section cards ─────────────────────────
function MarkdownReport({ text, analysisType }) {
  const typeInfo = ANALYSIS_TYPES.find(t => t.value === analysisType)
  const lines = text.split('\n')
  let docTitle = ''
  const sections = []
  let preLines = [], curr = null

  for (const line of lines) {
    if (line.startsWith('# ') && !docTitle) { docTitle = line.slice(2) }
    else if (line.startsWith('## ')) {
      if (curr) sections.push(curr)
      else if (preLines.length) sections.push({ title: null, lines: preLines })
      curr = { title: line.slice(3), lines: [] }
    } else {
      if (curr) curr.lines.push(line)
      else preLines.push(line)
    }
  }
  if (curr) sections.push(curr)
  else if (preLines.length) sections.push({ title: null, lines: preLines })

  let sectionCount = 0

  return (
    <div className="space-y-4 pb-6">
      {/* Title hero card */}
      <div className={`bg-gradient-to-br ${typeInfo?.color || 'from-blue-600 to-indigo-600'} rounded-2xl p-6 text-white shadow-lg`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0">
            {typeInfo?.label.split(' ')[0] || '🤖'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-sm font-bold uppercase tracking-widest mb-1">AI 智慧分析報告</p>
            <h1 className="text-xl font-black leading-tight break-words">
              {docTitle || (typeInfo?.label.replace(/^[^\s]+\s/, '') || 'AI 分析')}
            </h1>
            <p className="text-white/60 text-xs mt-1.5">
              {new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/20">
          {['🏢 企業管理專家', '📊 市場分析專家', '🎯 產品PM', '🔬 研發評估'].map(e => (
            <span key={e} className="text-sm px-2.5 py-1 rounded-full bg-white/20 font-medium">{e}</span>
          ))}
        </div>
      </div>

      {/* Pre-section content (before first ##) */}
      {preLines.some(l => l.trim()) && (
        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl px-5 py-4 border border-gray-100 dark:border-gray-700">
          <SectionContent lines={preLines} theme={null} />
        </div>
      )}

      {/* Section cards */}
      {sections.filter(s => s.title).map((section, si) => {
        const theme = SECTION_THEMES[sectionCount % SECTION_THEMES.length]
        const num = ++sectionCount
        return (
          <div key={si} className={`rounded-2xl border ${theme.border} overflow-hidden shadow-sm`}>
            <div className={`bg-gradient-to-r ${theme.grad} px-5 py-3.5 flex items-center gap-3`}>
              <span className="w-7 h-7 rounded-lg bg-white/25 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                {num}
              </span>
              <h2 className="text-white font-bold text-base leading-snug flex-1">{renderInline(section.title)}</h2>
            </div>
            <div className={`${theme.bg} px-5 py-4`}>
              <SectionContent lines={section.lines} theme={theme} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ history, onLoad, onClear, onDelete }) {
  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500 gap-3">
        <span className="text-4xl">📂</span>
        <p className="text-sm">尚無分析記錄</p>
        <p className="text-xs text-gray-300 dark:text-gray-600">每次分析完成後自動儲存至資料庫</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{history.length} 筆歷史記錄</span>
        <button onClick={onClear} className="text-xs text-red-400 hover:text-red-600 transition-colors">清除全部（本機）</button>
      </div>
      {history.map((item, i) => {
        const typeInfo = ANALYSIS_TYPES.find(t => t.value === item.type)
        return (
          <div key={item.id || i} className="bg-white dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3.5 hover:border-blue-200 dark:hover:border-blue-600 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg flex-shrink-0">{typeInfo?.label.split(' ')[0] || '🤖'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">{typeInfo?.label || item.type}</span>
                    {item.fromDb
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">☁ 雲端</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">本機</span>
                    }
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{item.date} · {item.filename}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onLoad(item)}
                  className="text-sm px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >載入</button>
                {onDelete && (
                  <button
                    onClick={() => onDelete(item)}
                    className="text-sm px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    title="刪除此筆記錄"
                  >🗑</button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{item.preview}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AIAnalysis({ open, onClose, salesData, onExportFullPDF, user }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('google_ai_studio_api_key') || '')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('google_ai_model') || 'gemini-2.5-flash')
  const [analysisType, setAnalysisType] = useState('comprehensive')
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const [currentType, setCurrentType] = useState('comprehensive')
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState('analysis') // 'analysis' | 'chart' | 'history'
  const [history, setHistory] = useState(getHistory)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saving' | 'saved:db' | 'saved:local' | 'error'
  const [dbLoading, setDbLoading] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [continueRound, setContinueRound] = useState(0)
  const [canManualContinue, setCanManualContinue] = useState(false)
  const outputRef = useRef(null)
  const abortRef = useRef(false)
  const originalPromptRef = useRef('')
  const fullOutputRef = useRef('')

  // 開啟時從 DB 載入歷史記錄，與 localStorage 合併
  useEffect(() => {
    if (!open) return
    const local = getHistory()
    setHistory(local)
    if (!user || !supabaseReady) return
    setDbLoading(true)
    loadAnalysisFromDb(user).then(dbRecords => {
      setHistory(prev => {
        // 以 DB 記錄為主，local 只補充 fromDb 沒有的 id
        const dbIds = new Set(dbRecords.map(r => String(r.id)))
        const localOnly = prev.filter(r => !r.fromDb && !dbIds.has(String(r.id)))
        return [...dbRecords, ...localOnly]
      })
      setDbLoading(false)
    })
  }, [open, user])

  useEffect(() => {
    if (streaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, streaming])

  function saveKey(k) {
    setApiKey(k)
    localStorage.setItem('google_ai_studio_api_key', k)
  }

  function saveModel(m) {
    setAiModel(m)
    localStorage.setItem('google_ai_model', m)
  }

  async function handleAnalyze() {
    if (!apiKey.trim()) { setError('請輸入 Google AI Studio API Key'); return }
    setError('')
    setOutput('')
    setSaveStatus('')
    setContinueRound(0)
    setCanManualContinue(false)
    setStreaming(true)
    setCurrentType(analysisType)
    setActiveTab('analysis')
    abortRef.current = false
    fullOutputRef.current = ''

    // MAX_TOKENS / TRUNCATED（逾時）自動續接；STOP 後若輸出明顯不完整也自動一輪
    const MAX_CONTINUES = 10

    // 建立原始 prompt 並儲存到 ref（供手動繼續使用）
    const dataJson = buildAIPayload(salesData)
    const originalPrompt = buildPrompt(dataJson, analysisType, salesData.filters)
    originalPromptRef.current = originalPrompt

    // 單輪串流，回傳 finishReason
    const runOnce = (messages) => new Promise((resolve) => {
      streamAnalysis({
        apiKey: apiKey.trim(),
        model: aiModel,
        messages,
        onChunk: (text) => {
          if (abortRef.current) return
          fullOutputRef.current += text
          setOutput(prev => prev + text)
        },
        onDone: (reason) => resolve(reason),
        onError: (msg) => { setError(msg); resolve('ERROR') },
      })
    })

    // 判斷是否需要繼續：MAX_TOKENS / TRUNCATED（逾時中斷）一定要繼續
    // STOP 且輸出少於 1500 字，也視為疑似提前截斷，自動再一輪
    const shouldContinue = (reason, round) => {
      if (abortRef.current || round >= MAX_CONTINUES) return false
      if (reason === 'MAX_TOKENS' || reason === 'TRUNCATED') return true
      if (reason === 'STOP' && round === 0 && fullOutputRef.current.length < 1500) return true
      return false
    }

    // 組合續接 messages：只保留最後 4000 字的輸出作為上下文（避免 token 爆炸）
    const buildContinueMessages = () => {
      const tail = fullOutputRef.current.slice(-4000)
      const isHead = fullOutputRef.current.length <= 4000
      return [
        { role: 'user', parts: [{ text: originalPrompt }] },
        {
          role: 'model',
          parts: [{ text: isHead ? fullOutputRef.current : `…（前文已省略）\n\n${tail}` }],
        },
        { role: 'user', parts: [{ text: '請繼續完成分析，從你停止的地方接著寫，保持相同格式，不要重複已有內容。' }] },
      ]
    }

    try {
      // 第一輪
      let finishReason = await runOnce([{ role: 'user', parts: [{ text: originalPrompt }] }])

      // 自動續接（MAX_TOKENS / TRUNCATED / 過短的 STOP）
      let round = 0
      while (shouldContinue(finishReason, round)) {
        round++
        setContinueRound(round)
        finishReason = await runOnce(buildContinueMessages())
      }

      setStreaming(false)
      setContinueRound(0)
      // 非 MAX_TOKENS 結束（STOP 或其他），顯示手動繼續按鈕供用戶判斷
      setCanManualContinue(true)

      const fullOutput = fullOutputRef.current
      const filename = makeFilename(analysisType)
      const preview = fullOutput.replace(/[#*`>\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150) + '…'
      setSaveStatus('saving')

      // 同步儲存至 Supabase DB（主要）+ localStorage（備份）
      const [savedPath, dbId] = await Promise.all([
        saveToServer(filename, fullOutput),
        saveAnalysisToDb(user, { type: analysisType, filename, content: fullOutput, preview }),
      ])
      setSaveStatus(dbId ? 'saved:db' : (savedPath ? `saved:${savedPath}` : 'error'))

      const entry = {
        id: dbId || Date.now(),
        type: analysisType,
        date: new Date().toLocaleDateString('zh-TW'),
        filename, savedPath, preview, content: fullOutput,
        fromDb: !!dbId,
      }
      addToHistory(entry)
      setHistory(prev => [entry, ...prev.filter(h => h.id !== entry.id)])
    } catch (e) {
      setError(e.message); setStreaming(false); setContinueRound(0)
    }
  }

  // 手動繼續生成（當內容看起來不完整時）
  async function handleManualContinue() {
    if (!originalPromptRef.current || streaming) return
    setError('')
    setCanManualContinue(false)
    setStreaming(true)
    abortRef.current = false

    const runOnce = (messages) => new Promise((resolve) => {
      streamAnalysis({
        apiKey: apiKey.trim(),
        model: aiModel,
        messages,
        onChunk: (text) => {
          if (abortRef.current) return
          fullOutputRef.current += text
          setOutput(prev => prev + text)
        },
        onDone: (reason) => resolve(reason),
        onError: (msg) => { setError(msg); resolve('ERROR') },
      })
    })

    const buildContinueMessages = () => {
      const tail = fullOutputRef.current.slice(-4000)
      const isHead = fullOutputRef.current.length <= 4000
      return [
        { role: 'user', parts: [{ text: originalPromptRef.current }] },
        { role: 'model', parts: [{ text: isHead ? fullOutputRef.current : `…（前文已省略）\n\n${tail}` }] },
        { role: 'user', parts: [{ text: '請繼續完成分析，從你停止的地方接著寫，保持相同格式，不要重複已有內容。' }] },
      ]
    }

    try {
      let finishReason = await runOnce(buildContinueMessages())

      let round = 0
      while ((finishReason === 'MAX_TOKENS' || finishReason === 'TRUNCATED') && round < 10 && !abortRef.current) {
        round++
        finishReason = await runOnce(buildContinueMessages())
      }

      setStreaming(false)
      setCanManualContinue(true)

      const fullOutput = fullOutputRef.current
      const filename = makeFilename(currentType)
      const preview = fullOutput.replace(/[#*`>\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150) + '…'
      setSaveStatus('saving')
      const [savedPath, dbId] = await Promise.all([
        saveToServer(filename, fullOutput),
        saveAnalysisToDb(user, { type: currentType, filename, content: fullOutput, preview }),
      ])
      setSaveStatus(dbId ? 'saved:db' : (savedPath ? `saved:${savedPath}` : 'error'))
      const entry = {
        id: dbId || Date.now(), type: currentType,
        date: new Date().toLocaleDateString('zh-TW'),
        filename, savedPath, preview, content: fullOutput,
        fromDb: !!dbId,
      }
      addToHistory(entry)
      setHistory(prev => [entry, ...prev.filter(h => h.id !== entry.id)])
    } catch (e) {
      setError(e.message); setStreaming(false)
    }
  }

  function handleStop() { abortRef.current = true; setStreaming(false) }

  function downloadMD(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename || makeFilename(currentType); a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportAIPDF() {
    if (!output || exportingPDF) return
    setExportingPDF(true)
    try {
      const { exportAIReportPDF } = await import('../utils/pdfExport')
      await exportAIReportPDF({ content: output, analysisType: currentType })
    } finally { setExportingPDF(false) }
  }

  async function handleExportFullPDF() {
    if (!output || !onExportFullPDF || exportingPDF) return
    setExportingPDF(true)
    try { await onExportFullPDF(output, currentType) }
    finally { setExportingPDF(false) }
  }

  if (!open) return null

  const typeInfo = ANALYSIS_TYPES.find(t => t.value === analysisType)
  const currentTypeInfo = ANALYSIS_TYPES.find(t => t.value === currentType)

  const SaveStatusBadge = () => {
    if (saveStatus === 'saving') return (
      <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
        <span className="w-3 h-3 border-2 border-amber-500 dark:border-amber-400 border-t-transparent rounded-full animate-spin" />儲存中...
      </span>
    )
    if (saveStatus === 'saved:db') return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">✓ 已儲存至資料庫</span>
    )
    if (saveStatus.startsWith('saved:')) return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
        <span>✓</span><span className="truncate max-w-[200px]">{saveStatus.slice(6)}</span>
      </span>
    )
    if (saveStatus === 'error') return (
      <span className="text-sm text-orange-500 dark:text-orange-400">⚠ 僅儲存本機（資料庫未連線）</span>
    )
    return null
  }

  function handleClearHistory() {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }

  async function handleDeleteHistoryItem(item) {
    setHistory(prev => prev.filter(h => h.id !== item.id))
    const local = getHistory().filter(h => h.id !== item.id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(local))
    if (item.fromDb && user) {
      await deleteAnalysisFromDb(user, item.id)
    }
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Header ── */}
      <div className={`bg-gradient-to-r ${typeInfo?.color || 'from-blue-600 to-indigo-600'} px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">🤖</div>
          <div>
            <h2 className="text-base font-black text-white">AI 智慧分析</h2>
            <p className="text-xs text-white/70">四位頂尖商業顧問 · {aiModel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(v => v === 'chart' ? 'analysis' : 'chart')}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'chart' ? 'bg-white text-violet-700' : 'bg-white/20 text-white hover:bg-white/30'}`}
          >
            📊 圖表
          </button>
          <button
            onClick={() => setActiveTab(v => v === 'history' ? 'analysis' : 'history')}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white text-blue-700' : 'bg-white/20 text-white hover:bg-white/30'}`}
          >
            📂 歷史
            {history.length > 0 && (
              <span className="bg-white/30 rounded-full px-1.5 text-sm font-bold">{history.length}</span>
            )}
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white flex items-center justify-center font-bold transition-colors text-lg">✕</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left sidebar: config ── */}
        {activeTab === 'analysis' && (
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/80 dark:bg-gray-800/60 overflow-y-auto">
            <div className="p-4 space-y-4">

              {/* API Key */}
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => saveKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono bg-white pr-12"
                  />
                  <button onClick={() => setShowKey(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    {showKey ? '隱藏' : '顯示'}
                  </button>
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">模型</label>
                <select
                  value={aiModel}
                  onChange={e => saveModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="gemini-2.5-flash">2.5 Flash（推薦）</option>
                  <option value="gemini-2.5-pro">2.5 Pro</option>
                  <option value="gemini-2.0-flash">2.0 Flash</option>
                  <option value="gemini-2.0-flash-lite">2.0 Flash Lite</option>
                </select>
              </div>

              {/* Analysis type */}
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wider">分析類型</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANALYSIS_TYPES.map(t => (
                    <button key={t.value} onClick={() => setAnalysisType(t.value)}
                      className={`text-left px-2.5 py-2.5 rounded-xl border text-sm transition-all ${
                        analysisType === t.value
                          ? `bg-gradient-to-br ${t.color} text-white border-transparent shadow-sm`
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-900/20'
                      }`}>
                      <div className="font-bold">{t.label}</div>
                      <div className={`text-xs mt-0.5 leading-tight ${analysisType === t.value ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                {streaming ? (
                  <button onClick={handleStop}
                    className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <span className="animate-pulse">⬛</span> 停止生成
                  </button>
                ) : (
                  <button onClick={handleAnalyze} disabled={!apiKey.trim()}
                    className={`w-full py-2.5 bg-gradient-to-r ${typeInfo?.color || 'from-blue-600 to-indigo-600'} disabled:from-gray-300 disabled:to-gray-300 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md`}>
                    🚀 開始 AI 分析
                  </button>
                )}
                {output && !streaming && (
                  <button onClick={() => { setOutput(''); setSaveStatus('') }}
                    className="w-full py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors">
                    清除結果
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl px-3 py-2.5 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <span className="flex-shrink-0">⚠️</span><span>{error}</span>
                </div>
              )}

              {/* Export actions (shown when output exists) */}
              {output && !streaming && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">匯出</p>
                  <SaveStatusBadge />
                  {canManualContinue && (
                    <button
                      onClick={handleManualContinue}
                      className="w-full text-sm px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      title="若分析報告未完整，點此繼續生成剩餘內容"
                    >
                      ▶ 繼續生成
                    </button>
                  )}
                  <button
                    onClick={() => downloadMD(output, makeFilename(currentType))}
                    className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    ⬇️ 下載 .md
                  </button>
                  <button
                    onClick={handleExportAIPDF}
                    disabled={exportingPDF}
                    className="w-full text-sm px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
                  >
                    📄 AI 報告 PDF
                  </button>
                  {onExportFullPDF && (
                    <button
                      onClick={handleExportFullPDF}
                      disabled={exportingPDF}
                      className="w-full text-sm px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
                    >
                      📊 完整報告 PDF
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Right main content ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {activeTab === 'chart' ? (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">資料圖表總覽</h3>
                <p className="text-base text-gray-400 dark:text-gray-500 mt-0.5">依當前篩選條件即時生成，可切換圖表類型</p>
              </div>
              <AIChartDashboard salesData={salesData} />
            </div>
          ) : activeTab === 'history' ? (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {dbLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400 mb-3">
                  <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  從資料庫載入記錄...
                </div>
              )}
              <HistoryPanel
                history={history}
                onLoad={(item) => {
                  setOutput(item.content)
                  setCurrentType(item.type)
                  setSaveStatus(item.fromDb ? 'saved:db' : (item.savedPath ? `saved:${item.savedPath}` : ''))
                  setActiveTab('analysis')
                }}
                onClear={handleClearHistory}
                onDelete={handleDeleteHistoryItem}
              />
            </div>
          ) : (
            <div ref={outputRef} className="flex-1 overflow-y-auto px-8 py-6">
              {!output && !streaming && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                  <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${typeInfo?.color || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-5xl shadow-lg`}>
                    🤖
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-700 dark:text-gray-200">AI 分析就緒</p>
                    <p className="text-base text-gray-400 dark:text-gray-500 mt-1">從左側選擇分析類型後點擊「開始 AI 分析」</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {['🏢 企業管理專家', '📊 市場分析專家', '🎯 產品PM', '🔬 研發評估'].map(e => (
                      <span key={e} className="text-sm px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">{e}</span>
                    ))}
                  </div>
                </div>
              )}

              {streaming && !output && (
                <div className="flex flex-col items-center justify-center h-48 gap-3 mt-8">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-base text-blue-600 dark:text-blue-400 font-medium">AI 正在分析中，請稍候...</p>
                </div>
              )}

              {output && (
                <>
                  <MarkdownReport text={output} analysisType={currentType} />
                  {streaming && (
                    <div className="flex items-center gap-2 mt-2 text-blue-500 text-sm pb-4">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>
                        {continueRound > 0
                          ? `自動繼續生成第 ${continueRound} 段...`
                          : '生成中...'}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

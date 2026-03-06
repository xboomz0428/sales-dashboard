import { useState, useRef, useEffect } from 'react'
import { buildAIPayload, buildPrompt, streamAnalysis } from '../utils/aiAnalyst'
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
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setChartTab(t.id)}
            className={`px-4 py-2 rounded-lg text-base font-medium transition-all flex-1 min-w-fit ${chartTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
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
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-base font-bold text-gray-700 mb-3">品牌銷售排行</p>
              <div className="space-y-2">
                {top8Brands.map((b, i) => {
                  const pct = top8Brands[0].subtotal > 0 ? b.subtotal / top8Brands[0].subtotal * 100 : 0
                  return (
                    <div key={b.name}>
                      <div className="flex justify-between text-base mb-1">
                        <span className="text-gray-700 font-medium truncate max-w-[60%]">{b.name}</span>
                        <span className="font-mono font-bold text-gray-800">{fmtAI(b.subtotal)}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
              <p className="text-base font-bold text-gray-700 mb-3">產品銷售 Top 10</p>
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
              <p className="text-base font-bold text-gray-700 mb-3">品牌銷售 Top 8</p>
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
              <p className="text-base font-bold text-gray-700 mb-3">品牌銷售佔比</p>
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
              <p className="text-base font-bold text-gray-700 mb-3">通路銷售佔比</p>
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
            <div className="flex items-center justify-center h-48 text-base text-gray-400">需要至少 2 個品牌才能顯示雷達圖</div>
          ) : (
            <>
              <p className="text-base font-bold text-gray-700 mb-1">品牌多維績效雷達（正規化 0-100）</p>
              <p className="text-sm text-gray-400 mb-3">各指標以最高值為 100 分比例計算</p>
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
  { grad: 'from-blue-500 to-blue-700',       bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-800',    dot: 'bg-blue-500',    num: 'bg-blue-600' },
  { grad: 'from-emerald-500 to-teal-600',    bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', num: 'bg-emerald-600' },
  { grad: 'from-violet-500 to-purple-600',   bg: 'bg-violet-50',  border: 'border-violet-100',  text: 'text-violet-800',  dot: 'bg-violet-500',  num: 'bg-violet-600' },
  { grad: 'from-amber-500 to-orange-600',    bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500',   num: 'bg-amber-600' },
  { grad: 'from-rose-500 to-pink-600',       bg: 'bg-rose-50',    border: 'border-rose-100',    text: 'text-rose-800',    dot: 'bg-rose-500',    num: 'bg-rose-600' },
  { grad: 'from-cyan-500 to-sky-600',        bg: 'bg-cyan-50',    border: 'border-cyan-100',    text: 'text-cyan-800',    dot: 'bg-cyan-500',    num: 'bg-cyan-600' },
  { grad: 'from-indigo-500 to-blue-600',     bg: 'bg-indigo-50',  border: 'border-indigo-100',  text: 'text-indigo-800',  dot: 'bg-indigo-500',  num: 'bg-indigo-600' },
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
      return <strong key={i} className="font-bold text-gray-900">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-100">{p.slice(1, -1)}</code>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return <em key={i} className="italic text-gray-600">{p.slice(1, -1)}</em>
    return p
  })
}

// ─── Section content renderer ─────────────────────────────────────────────────
function SectionContent({ lines, theme }) {
  const elements = []
  let listType = null, listItems = [], inCode = false, codeLines = []

  const flushList = (key) => {
    if (!listItems.length) return
    if (listType === 'ul') {
      elements.push(
        <ul key={`ul-${key}`} className="my-2.5 space-y-1.5 pl-0">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 leading-relaxed">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${theme?.dot || 'bg-blue-400'}`} />
              <span className="text-base text-gray-700">{renderInline(item)}</span>
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
              <span className="text-sm text-gray-700 mt-0.5">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
    }
    listItems = []; listType = null
  }

  lines.forEach((line, i) => {
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
        <h3 key={`h3-${i}`} className={`text-base font-bold mt-4 mb-2 flex items-center gap-2 ${theme?.text || 'text-gray-800'}`}>
          <span className={`w-1 h-3.5 rounded-full flex-shrink-0 ${theme?.num || 'bg-blue-600'}`} />
          {renderInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith('#### ')) {
      flushList(i)
      elements.push(
        <h4 key={`h4-${i}`} className="text-sm font-semibold text-gray-500 mt-3 mb-1 uppercase tracking-wider">
          {renderInline(line.slice(5))}
        </h4>
      )
    } else if (/^[-*] /.test(line)) {
      if (listType !== 'ul') flushList(i); listType = 'ul'; listItems.push(line.slice(2))
    } else if (/^\d+\. /.test(line)) {
      if (listType !== 'ol') flushList(i); listType = 'ol'; listItems.push(line.replace(/^\d+\. /, ''))
    } else if (line.startsWith('---')) {
      flushList(i); elements.push(<hr key={`hr-${i}`} className="border-gray-200 my-3" />)
    } else if (line.trim() === '') {
      flushList(i)
    } else {
      flushList(i)
      elements.push(
        <p key={`p-${i}`} className="text-base text-gray-700 leading-relaxed mb-1">
          {renderInline(line)}
        </p>
      )
    }
  })
  flushList('end')
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
        <div className="bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
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
function HistoryPanel({ history, onLoad, onClear }) {
  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <span className="text-4xl">📂</span>
        <p className="text-sm">尚無分析記錄</p>
        <p className="text-xs text-gray-300">每次分析完成後自動儲存</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-500">{history.length} 筆歷史記錄</span>
        <button onClick={onClear} className="text-xs text-red-400 hover:text-red-600 transition-colors">清除全部</button>
      </div>
      {history.map((item, i) => {
        const typeInfo = ANALYSIS_TYPES.find(t => t.value === item.type)
        return (
          <div key={item.id || i} className="bg-white border border-gray-100 rounded-xl p-3.5 hover:border-blue-200 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg flex-shrink-0">{typeInfo?.label.split(' ')[0] || '🤖'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-700 truncate">{typeInfo?.label || item.type}</div>
                  <div className="text-sm text-gray-400">{item.date} · {item.filename}</div>
                </div>
              </div>
              <button
                onClick={() => onLoad(item)}
                className="text-sm px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex-shrink-0 transition-colors"
              >
                載入
              </button>
            </div>
            <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{item.preview}</p>
            {item.savedPath && (
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-sm text-emerald-600">✓ {item.savedPath}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AIAnalysis({ open, onClose, salesData, onExportFullPDF }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('google_ai_studio_api_key') || '')
  const [analysisType, setAnalysisType] = useState('comprehensive')
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const [currentType, setCurrentType] = useState('comprehensive')
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState('analysis') // 'analysis' | 'chart' | 'history'
  const [history, setHistory] = useState(getHistory)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saving' | 'saved:path' | 'error'
  const [exportingPDF, setExportingPDF] = useState(false)
  const outputRef = useRef(null)
  const abortRef = useRef(false)

  useEffect(() => {
    if (streaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, streaming])

  function saveKey(k) {
    setApiKey(k)
    localStorage.setItem('google_ai_studio_api_key', k)
  }

  async function handleAnalyze() {
    if (!apiKey.trim()) { setError('請輸入 Google AI Studio API Key'); return }
    setError('')
    setOutput('')
    setSaveStatus('')
    setStreaming(true)
    setCurrentType(analysisType)
    setActiveTab('analysis')
    abortRef.current = false

    let fullOutput = ''
    try {
      const dataJson = buildAIPayload(salesData)
      const prompt = buildPrompt(dataJson, analysisType)
      await streamAnalysis({
        apiKey: apiKey.trim(),
        prompt,
        onChunk: (text) => {
          if (abortRef.current) return
          fullOutput += text
          setOutput(prev => prev + text)
        },
        onDone: async () => {
          setStreaming(false)
          const filename = makeFilename(analysisType)
          setSaveStatus('saving')
          const savedPath = await saveToServer(filename, fullOutput)
          setSaveStatus(savedPath ? `saved:${savedPath}` : 'error')

          const entry = {
            id: Date.now(),
            type: analysisType,
            date: new Date().toLocaleDateString('zh-TW'),
            filename,
            savedPath,
            preview: fullOutput.replace(/[#*`>\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150) + '…',
            content: fullOutput,
          }
          addToHistory(entry)
          setHistory(getHistory())
        },
        onError: (msg) => { setError(msg); setStreaming(false) },
      })
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
      <span className="text-sm text-amber-600 flex items-center gap-1">
        <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />儲存中...
      </span>
    )
    if (saveStatus.startsWith('saved:')) return (
      <span className="text-sm text-emerald-600 flex items-center gap-1">
        <span>✓</span><span className="truncate max-w-[200px]">{saveStatus.slice(6)}</span>
      </span>
    )
    if (saveStatus === 'error') return (
      <span className="text-sm text-orange-500">⚠ 伺服器不可用（請用 npm run dev）</span>
    )
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl z-50 flex flex-col">

        {/* ── Header ── */}
        <div className={`bg-gradient-to-r ${typeInfo?.color || 'from-blue-600 to-indigo-600'} px-6 py-4 flex items-center justify-between flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">🤖</div>
            <div>
              <h2 className="text-base font-black text-white">AI 智慧分析</h2>
              <p className="text-sm text-white/70">四位頂尖商業顧問 · Gemini 2.0 Flash</p>
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
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold transition-colors">✕</button>
          </div>
        </div>

        {/* ── Chart tab ── */}
        {activeTab === 'chart' ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800">資料圖表總覽</h3>
              <p className="text-base text-gray-400 mt-0.5">依當前篩選條件即時生成，可切換圖表類型</p>
            </div>
            <AIChartDashboard salesData={salesData} />
          </div>
        ) : activeTab === 'history' ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <HistoryPanel
              history={history}
              onLoad={(item) => {
                setOutput(item.content)
                setCurrentType(item.type)
                setSaveStatus(item.savedPath ? `saved:${item.savedPath}` : '')
                setActiveTab('analysis')
              }}
              onClear={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]) }}
            />
          </div>
        ) : activeTab === 'analysis' ? (
          <>
            {/* ── Config section ── */}
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 space-y-3 bg-gradient-to-b from-gray-50/80 to-white">
              {/* API Key */}
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1 uppercase tracking-wider">Google AI Studio API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => saveKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono bg-white pr-14"
                  />
                  <button onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                    {showKey ? '隱藏' : '顯示'}
                  </button>
                </div>
              </div>

              {/* Analysis type */}
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1.5 uppercase tracking-wider">分析類型</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {ANALYSIS_TYPES.map(t => (
                    <button key={t.value} onClick={() => setAnalysisType(t.value)}
                      className={`text-left px-2.5 py-2 rounded-xl border text-sm transition-all ${
                        analysisType === t.value
                          ? `bg-gradient-to-br ${t.color} text-white border-transparent shadow-sm`
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                      }`}>
                      <div className="font-bold">{t.label}</div>
                      <div className={`text-sm mt-0.5 leading-tight ${analysisType === t.value ? 'text-white/70' : 'text-gray-400'}`}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action row */}
              <div className="flex gap-2">
                {streaming ? (
                  <button onClick={handleStop}
                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <span className="animate-pulse">⬛</span> 停止生成
                  </button>
                ) : (
                  <button onClick={handleAnalyze} disabled={!apiKey.trim()}
                    className={`flex-1 py-2.5 bg-gradient-to-r ${typeInfo?.color || 'from-blue-600 to-indigo-600'} disabled:from-gray-300 disabled:to-gray-300 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md`}>
                    🚀 開始 AI 分析
                  </button>
                )}
                {output && !streaming && (
                  <button onClick={() => { setOutput(''); setSaveStatus('') }}
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-xl transition-colors">
                    清除
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
                  <span className="flex-shrink-0">⚠️</span><span>{error}</span>
                </div>
              )}
            </div>

            {/* ── Output area ── */}
            <div ref={outputRef} className="flex-1 overflow-y-auto px-6 py-5">
              {!output && !streaming && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${typeInfo?.color || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-4xl shadow-lg`}>
                    🤖
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-700">AI 分析就緒</p>
                    <p className="text-sm text-gray-400 mt-1">選擇分析類型後點擊「開始 AI 分析」</p>
                    <p className="text-xs text-gray-300 mt-1">分析結果將自動儲存至 <code className="bg-gray-100 px-1 rounded text-gray-400">AI_data/</code> 資料夾</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                    {['🏢 企業管理專家', '📊 市場分析專家', '🎯 產品PM', '🔬 研發評估'].map(e => (
                      <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">{e}</span>
                    ))}
                  </div>
                </div>
              )}

              {streaming && !output && (
                <div className="flex flex-col items-center justify-center h-32 gap-3 mt-8">
                  <div className={`w-10 h-10 border-4 border-t-transparent rounded-full animate-spin ${currentTypeInfo ? 'border-blue-500' : 'border-blue-500'}`} />
                  <p className="text-sm text-blue-600 font-medium">AI 正在分析中，請稍候...</p>
                </div>
              )}

              {output && (
                <>
                  <MarkdownReport text={output} analysisType={currentType} />
                  {streaming && (
                    <div className="flex items-center gap-2 mt-2 text-blue-500 text-sm pb-4">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>生成中...</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Footer actions ── */}
            {output && !streaming && (
              <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/80 flex-shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <SaveStatusBadge />
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={() => downloadMD(output, makeFilename(currentType))}
                      className="text-xs px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      ⬇️ 下載 .md
                    </button>
                    <button
                      onClick={handleExportAIPDF}
                      disabled={exportingPDF}
                      className="text-xs px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                    >
                      📄 AI 報告 PDF
                    </button>
                    {onExportFullPDF && (
                      <button
                        onClick={handleExportFullPDF}
                        disabled={exportingPDF}
                        className="text-xs px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                      >
                        📊 完整報告 PDF
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}

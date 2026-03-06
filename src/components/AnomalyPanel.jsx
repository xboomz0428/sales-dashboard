import { useMemo, useState } from 'react'

const fmtM = v => {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function useAnomalies(allRows, metric, threshold = 20) {
  return useMemo(() => {
    if (!allRows.length) return []
    const alerts = []

    // 找最新月份
    const months = [...new Set(allRows.map(r => r.yearMonth))].sort()
    const latestYM = months[months.length - 1]
    if (!latestYM) return []
    const [latestY, latestM] = latestYM.split('-')
    const prevYM = `${parseInt(latestY) - 1}-${latestM}`

    const curRows = allRows.filter(r => r.yearMonth === latestYM)
    const prevRows = allRows.filter(r => r.yearMonth === prevYM)
    if (!curRows.length || !prevRows.length) return []

    // 依維度聚合比較
    const dims = [
      { name: 'brand', label: '品牌' },
      { name: 'product', label: '產品' },
      { name: 'channelType', label: '通路類型' },
    ]

    dims.forEach(({ name, label }) => {
      const curMap = {}, prevMap = {}
      curRows.forEach(r => { const k = r[name] || '未知'; curMap[k] = (curMap[k] || 0) + r[metric] })
      prevRows.forEach(r => { const k = r[name] || '未知'; prevMap[k] = (prevMap[k] || 0) + r[metric] })

      const allKeys = new Set([...Object.keys(curMap), ...Object.keys(prevMap)])
      allKeys.forEach(k => {
        const cur = curMap[k] || 0
        const prev = prevMap[k] || 0
        if (prev === 0) return
        const chg = (cur - prev) / prev * 100
        if (chg <= -threshold) {
          alerts.push({
            type: 'decline', severity: chg <= -50 ? 'high' : chg <= -30 ? 'medium' : 'low',
            dim: label, name: k, cur, prev, chg,
            msg: `${label}「${k}」${latestYM} 較去年同月下降 ${Math.abs(chg).toFixed(0)}%`
          })
        }
      })
    })

    // 失聯客戶（去年有、今年沒有）
    const curCustomers = new Set(curRows.map(r => r.customer).filter(Boolean))
    const prevCustomers = new Set(prevRows.map(r => r.customer).filter(Boolean))
    prevCustomers.forEach(c => {
      if (!curCustomers.has(c)) {
        const prevVal = prevRows.filter(r => r.customer === c).reduce((s, r) => s + r[metric], 0)
        alerts.push({
          type: 'missing', severity: prevVal > 1e6 ? 'high' : prevVal > 1e4 ? 'medium' : 'low',
          dim: '客戶', name: c, cur: 0, prev: prevVal, chg: -100,
          msg: `客戶「${c}」去年同期有購買，本月未見訂單`
        })
      }
    })

    return alerts.sort((a, b) => {
      const sv = { high: 0, medium: 1, low: 2 }
      return sv[a.severity] - sv[b.severity] || a.chg - b.chg
    })
  }, [allRows, metric, threshold])
}

const SEVERITY = {
  high:   { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700',   icon: '🔴', label: '高風險' },
  medium: { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: '🟡', label: '中風險' },
  low:    { bg: 'bg-blue-50',   border: 'border-blue-100',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700',  icon: '🔵', label: '低風險' },
}

export default function AnomalyPanel({ allRows, metric }) {
  const [threshold, setThreshold] = useState(20)
  const [filter, setFilter] = useState('all')
  const alerts = useAnomalies(allRows, metric, threshold)

  const filtered = filter === 'all' ? alerts : alerts.filter(a =>
    filter === 'missing' ? a.type === 'missing' : a.severity === filter
  )

  const counts = { high: alerts.filter(a => a.severity === 'high').length, medium: alerts.filter(a => a.severity === 'medium').length, low: alerts.filter(a => a.severity === 'low').length }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🔔 異常預警中心</h2>
          <p className="text-base text-gray-400 mt-0.5">與去年同月比較，自動標記異常下滑與失聯客戶</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-gray-500">警示閾值</span>
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400">
            {[10, 15, 20, 30, 50].map(v => <option key={v} value={v}>下降 {v}%</option>)}
          </select>
        </div>
      </div>

      {/* 摘要卡 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: 'all', label: '全部', count: alerts.length, cls: 'bg-gray-50 border-gray-200 text-gray-700' },
          { key: 'high', label: '高風險', count: counts.high, cls: 'bg-red-50 border-red-200 text-red-700' },
          { key: 'medium', label: '中風險', count: counts.medium, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
          { key: 'low', label: '低風險', count: counts.low, cls: 'bg-blue-50 border-blue-100 text-blue-700' },
        ].map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`p-4 rounded-2xl border text-left transition-all ${c.cls} ${filter === c.key ? 'ring-2 ring-blue-400' : ''}`}>
            <div className="text-2xl font-black">{c.count}</div>
            <div className="text-sm font-semibold mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-lg font-bold text-emerald-700">無異常項目</p>
          <p className="text-base text-emerald-400">與去年同月相比，各維度表現正常</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => {
            const sv = SEVERITY[a.severity]
            return (
              <div key={i} className={`rounded-2xl border p-4 ${sv.bg} ${sv.border}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0 mt-0.5">{sv.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sv.badge}`}>{sv.label}</span>
                        <span className="text-xs bg-white/60 text-gray-600 px-2 py-0.5 rounded-full">{a.dim}</span>
                        {a.type === 'missing' && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">失聯客戶</span>}
                      </div>
                      <p className={`text-base font-bold ${sv.text} truncate`}>{a.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{a.msg}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-lg font-black ${sv.text}`}>{a.chg.toFixed(0)}%</div>
                    <div className="text-sm text-gray-400">去年 {fmtM(a.prev)} → 本月 {fmtM(a.cur)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AnomalyBadge({ allRows, metric }) {
  const alerts = useAnomalies(allRows, metric, 20)
  const high = alerts.filter(a => a.severity === 'high').length
  if (!high) return null
  return (
    <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
      {high}
    </span>
  )
}

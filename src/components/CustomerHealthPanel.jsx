import { useMemo, useState } from 'react'

const SEGMENTS = {
  champion: { label: '🏆 冠軍客戶', desc: '高頻 × 高消費 × 近期活躍', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700/50', text: 'text-emerald-700 dark:text-emerald-400', color: '#10B981' },
  loyal:    { label: '💎 忠實客戶', desc: '穩定購買，長期合作',         bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-200 dark:border-blue-700/50',    text: 'text-blue-700 dark:text-blue-400',    color: '#3B82F6' },
  atrisk:   { label: '⚠️ 流失風險', desc: '曾經活躍，近期少見',         bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-200 dark:border-amber-700/50',   text: 'text-amber-700 dark:text-amber-400',   color: '#F59E0B' },
  lost:     { label: '❌ 已流失',   desc: '長期未購買',                 bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-700/50',     text: 'text-red-700 dark:text-red-400',     color: '#EF4444' },
  new:      { label: '🌱 新客戶',   desc: '近期首次購買',               bg: 'bg-purple-50 dark:bg-purple-900/20',  border: 'border-purple-200 dark:border-purple-700/50',  text: 'text-purple-700 dark:text-purple-400',  color: '#8B5CF6' },
}

function scoreQuintile(values, ascending = false) {
  const sorted = [...values].sort((a, b) => ascending ? a - b : b - a)
  return (v) => {
    const rank = sorted.indexOf(v)
    const pct = rank / (sorted.length - 1 || 1)
    return 5 - Math.floor(pct * 4)
  }
}

function useRFM(allRows) {
  return useMemo(() => {
    if (!allRows.length) return []

    const custMap = {}
    allRows.forEach(r => {
      if (!r.customer) return
      if (!custMap[r.customer]) custMap[r.customer] = { name: r.customer, dates: [], subtotals: [], count: 0 }
      custMap[r.customer].dates.push(r.date)
      custMap[r.customer].subtotals.push(r.subtotal)
      custMap[r.customer].count++
    })

    const maxDate = allRows.reduce((m, r) => r.date > m ? r.date : m, '')
    const maxTs = new Date(maxDate).getTime()

    const customers = Object.values(custMap).map(c => {
      const lastDate = c.dates.sort().at(-1)
      const recencyDays = Math.round((maxTs - new Date(lastDate).getTime()) / 86400000)
      const frequency = c.count
      const monetary = c.subtotals.reduce((s, v) => s + v, 0)
      return { name: c.name, recencyDays, frequency, monetary, lastDate }
    })

    const rScore = scoreQuintile(customers.map(c => c.recencyDays), true) // lower = better
    const fScore = scoreQuintile(customers.map(c => c.frequency))
    const mScore = scoreQuintile(customers.map(c => c.monetary))

    return customers.map(c => {
      const r = rScore(c.recencyDays), f = fScore(c.frequency), m = mScore(c.monetary)
      let segment
      if (r >= 4 && f >= 4) segment = 'champion'
      else if (r >= 3 && f >= 3) segment = 'loyal'
      else if (r <= 2 && f >= 3) segment = 'atrisk'
      else if (r <= 2 && f <= 2 && c.recencyDays > 180) segment = 'lost'
      else if (c.frequency <= 2 && c.recencyDays <= 90) segment = 'new'
      else if (r <= 2) segment = 'atrisk'
      else segment = 'loyal'
      return { ...c, r, f, m, rfm: r + f + m, segment }
    }).sort((a, b) => b.rfm - a.rfm)
  }, [allRows])
}

const fmtM = v => {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

export default function CustomerHealthPanel({ allRows }) {
  const rfm = useRFM(allRows)
  const [activeSegment, setActiveSegment] = useState('all')

  const bySegment = useMemo(() => {
    const map = {}
    Object.keys(SEGMENTS).forEach(k => { map[k] = rfm.filter(c => c.segment === k) })
    return map
  }, [rfm])

  const shown = activeSegment === 'all' ? rfm : bySegment[activeSegment] || []

  if (!rfm.length) return (
    <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-base bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
      無客戶資料，請先上傳含客戶欄位的資料
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">💊 客戶健康度分析</h2>
        <p className="text-base text-gray-400 dark:text-gray-500 mt-0.5">RFM 模型（最近購買、購買頻率、消費金額）自動評分分群</p>
      </div>

      {/* 分群卡 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[{ key: 'all', label: '全部客戶', count: rfm.length, bg: 'bg-gray-50 dark:bg-gray-900', border: 'border-gray-200 dark:border-gray-600', text: 'text-gray-700 dark:text-gray-200' },
          ...Object.entries(SEGMENTS).map(([k, s]) => ({ key: k, label: s.label, count: bySegment[k]?.length || 0, bg: s.bg, border: s.border, text: s.text }))
        ].map(c => (
          <button key={c.key} onClick={() => setActiveSegment(c.key)}
            className={`p-4 rounded-2xl border text-left transition-all ${c.bg} ${c.border} ${activeSegment === c.key ? 'ring-2 ring-blue-400 shadow-md' : ''}`}>
            <div className={`text-2xl font-black ${c.text}`}>{c.count}</div>
            <div className={`text-sm font-semibold mt-0.5 ${c.text}`}>{c.label.replace(/^[^\s]+ /, '')}</div>
          </button>
        ))}
      </div>

      {/* 分群說明 */}
      {activeSegment !== 'all' && SEGMENTS[activeSegment] && (
        <div className={`rounded-2xl border p-4 ${SEGMENTS[activeSegment].bg} ${SEGMENTS[activeSegment].border}`}>
          <p className={`text-base font-bold ${SEGMENTS[activeSegment].text}`}>{SEGMENTS[activeSegment].label}</p>
          <p className={`text-base ${SEGMENTS[activeSegment].text} opacity-70`}>{SEGMENTS[activeSegment].desc}</p>
        </div>
      )}

      {/* 客戶清單 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">客戶名稱</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">分群</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">R 近期</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">F 頻率</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">M 金額</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">總消費</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-500 dark:text-gray-400">最後購買</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 50).map((c, i) => {
                const seg = SEGMENTS[c.segment]
                return (
                  <tr key={c.name} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50/60 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">{c.name}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${seg?.bg} ${seg?.text}`}>
                        {seg?.label?.replace(/^\S+ /, '') || c.segment}
                      </span>
                    </td>
                    {[c.r, c.f, c.m].map((score, si) => (
                      <td key={si} className="px-3 py-3 text-right">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${score >= 4 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : score >= 3 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : score >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                          {score}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-mono font-semibold text-gray-700 dark:text-gray-200">{fmtM(c.monetary)}</td>
                    <td className="px-3 py-3 text-right text-gray-400 dark:text-gray-500 text-sm">{c.lastDate}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shown.length > 50 && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-sm text-gray-400 dark:text-gray-500 border-t dark:border-gray-700">顯示前 50 筆，共 {shown.length} 位客戶</div>
          )}
        </div>
      </div>
    </div>
  )
}

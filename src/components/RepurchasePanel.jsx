import { useMemo, useState } from 'react'

/**
 * 回購週期預警 — 耗材/經銷生意的回單管理
 * 每個客戶算「平均回單間隔」，用 距上次購買天數 ÷ 平均間隔 判斷逾期程度：
 *   >2.0 嚴重逾期（紅）、>1.5 逾期（橘）、>1.0 已到期（藍）、其餘 正常
 * 條件：至少 3 個不同購買日、往來 ≥ 60 天才納入（避免單次客戶誤判）。
 */
const fmtW = v => (v >= 1e4 ? (v / 1e4).toFixed(0) + ' 萬' : Math.round(v).toLocaleString())

const LEVELS = {
  severe: { label: '🔴 嚴重逾期', test: r => r > 2,   cls: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400' },
  over:   { label: '🟠 逾期',     test: r => r > 1.5, cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400' },
  due:    { label: '🔵 已到期',   test: r => r > 1,   cls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400' },
  ok:     { label: '🟢 正常',     test: () => true,   cls: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400' },
}
const levelOf = ratio => Object.keys(LEVELS).find(k => LEVELS[k].test(ratio))

export default function RepurchasePanel({ allRows = [] }) {
  const [filter, setFilter] = useState('alert')   // alert = 只看需要行動的

  const customers = useMemo(() => {
    if (!allRows.length) return []
    const maxDate = allRows.reduce((m, r) => (r.date > m ? r.date : m), '')
    const maxTs = new Date(maxDate).getTime()
    const oneYearAgo = new Date(maxTs - 365 * 86400000).toISOString().slice(0, 10)

    const map = {}
    for (const r of allRows) {
      if (!r.customer) continue
      if (!map[r.customer]) map[r.customer] = { name: r.customer, dates: new Set(), rev12: 0, prod: {} }
      const g = map[r.customer]
      g.dates.add(r.date)
      if (r.date >= oneYearAgo) g.rev12 += r.subtotal || 0
      if (r.product) g.prod[r.product] = (g.prod[r.product] || 0) + (r.subtotal || 0)
    }

    return Object.values(map)
      .map(g => {
        const dates = [...g.dates].sort()
        const n = dates.length
        if (n < 3) return null
        const spanDays = (new Date(dates[n - 1]) - new Date(dates[0])) / 86400000
        if (spanDays < 60) return null
        const avgInterval = spanDays / (n - 1)
        const daysSince = Math.round((maxTs - new Date(dates[n - 1]).getTime()) / 86400000)
        const ratio = daysSince / avgInterval
        const expected = new Date(new Date(dates[n - 1]).getTime() + avgInterval * 86400000).toISOString().slice(0, 10)
        const topProduct = Object.entries(g.prod).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
        return {
          name: g.name, orders: n, avgInterval: Math.round(avgInterval), daysSince,
          lastDate: dates[n - 1], expected, ratio, level: levelOf(ratio),
          rev12: g.rev12, topProduct,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.ratio - a.ratio || b.rev12 - a.rev12)
  }, [allRows])

  const counts = useMemo(() => {
    const c = { severe: 0, over: 0, due: 0, ok: 0 }
    customers.forEach(x => { c[x.level]++ })
    return c
  }, [customers])

  const shown = useMemo(() => {
    if (filter === 'alert') return customers.filter(c => c.level !== 'ok')
    if (filter === 'all') return customers
    return customers.filter(c => c.level === filter)
  }, [customers, filter])

  const exportCsv = () => {
    const head = '客戶,狀態,平均回單間隔(天),距上次(天),上次購買,預計回單,近12月營收,主力商品\n'
    const body = shown.map(c =>
      [c.name, LEVELS[c.level].label.replace(/^\S+ /, ''), c.avgInterval, c.daysSince, c.lastDate, c.expected, Math.round(c.rev12), c.topProduct]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `回購預警_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!customers.length) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">⏰ 回購週期預警</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            依每個客戶自己的回單節奏判斷逾期（至少 3 次購買、往來 60 天以上才納入）；適用經銷/實體客戶，平台彙總客戶（如 momo終端）天天有單、通常顯示正常
          </p>
        </div>
        <button onClick={exportCsv}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
          ⬇ 匯出拜訪清單 CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {[['alert', `需行動 ${counts.severe + counts.over + counts.due}`, 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'],
          ...Object.entries(LEVELS).map(([k, v]) => [k, `${v.label} ${counts[k]}`, v.cls])].map(([key, label, cls]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-2 rounded-xl border text-sm font-semibold text-left transition-all ${cls} ${filter === key ? 'ring-2 ring-blue-400' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
              <th className="text-left  py-2 pr-2">客戶</th>
              <th className="text-center py-2 px-2">狀態</th>
              <th className="text-right py-2 px-2">平均回單</th>
              <th className="text-right py-2 px-2">距上次</th>
              <th className="text-right py-2 px-2">上次購買</th>
              <th className="text-right py-2 px-2">預計回單</th>
              <th className="text-right py-2 px-2">近12月</th>
              <th className="text-left  py-2 pl-3">主力商品</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 60).map(c => {
              const lv = LEVELS[c.level]
              return (
                <tr key={c.name} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/40">
                  <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200">{c.name}</td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${lv.cls}`}>{lv.label.replace(/^\S+ /, '')}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{c.avgInterval} 天</td>
                  <td className={`py-2.5 px-2 text-right font-mono font-bold ${c.level === 'severe' ? 'text-red-500' : c.level === 'over' ? 'text-amber-500' : 'text-gray-600 dark:text-gray-300'}`}>{c.daysSince} 天</td>
                  <td className="py-2.5 px-2 text-right text-gray-400 dark:text-gray-500 text-xs">{c.lastDate}</td>
                  <td className="py-2.5 px-2 text-right text-gray-400 dark:text-gray-500 text-xs">{c.expected}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{fmtW(c.rev12)}</td>
                  <td className="py-2.5 pl-3 text-xs text-gray-500 dark:text-gray-400 max-w-[220px] truncate" title={c.topProduct}>{c.topProduct}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length > 60 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">顯示前 60 筆，共 {shown.length} 位（匯出 CSV 可取得完整清單）</p>}
      </div>
    </div>
  )
}

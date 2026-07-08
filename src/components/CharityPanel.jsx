import { useMemo, useState } from 'react'

/**
 * 滯銷品轉公益建議 — 清庫存 × 稅務 × 品牌 三贏
 * 從銷售紀錄找出「曾經賣過、但已停滯或大幅衰退」的品項：
 *   ・滯銷：超過 N 個月無任何銷售（N 可切 3/6/12）
 *   ・大幅衰退：近 12 月營收 < 前 12 月的 30%
 * 供捐贈（婦幼機構/社福）、組合出清、停售決策使用。可匯出捐贈清單 CSV。
 * ⚠️ 本表依「銷售停滯」推斷，實際庫存量與效期請人工確認後再捐贈。
 */
const fmtW = v => {
  if (v == null) return '—'
  if (v >= 1e4) return (v / 1e4).toFixed(1) + ' 萬'
  return Math.round(v).toLocaleString()
}

export default function CharityPanel({ allRows = [], costs = {} }) {
  const [staleMonths, setStaleMonths] = useState(6)
  const [kind, setKind] = useState('all')   // all | stale | decline

  const { items, maxDate } = useMemo(() => {
    if (!allRows.length) return { items: [], maxDate: '' }
    const maxDate = allRows.reduce((m, r) => (r.date > m ? r.date : m), '')
    const maxTs = new Date(maxDate).getTime()
    const cut12 = new Date(maxTs - 365 * 86400000).toISOString().slice(0, 10)
    const cut24 = new Date(maxTs - 730 * 86400000).toISOString().slice(0, 10)
    const staleCut = new Date(maxTs - staleMonths * 30.44 * 86400000).toISOString().slice(0, 10)

    const map = {}
    for (const r of allRows) {
      const p = r.product
      if (!p) continue
      if (!map[p]) map[p] = { name: p, brand: r.brand || '', lastSale: '', totalRev: 0, totalQty: 0, rev12: 0, revPrev12: 0 }
      const g = map[p]
      if (r.date > g.lastSale) { g.lastSale = r.date; g.brand = r.brand || g.brand }
      g.totalRev += r.subtotal || 0
      g.totalQty += r.quantity || 0
      if (r.date >= cut12) g.rev12 += r.subtotal || 0
      else if (r.date >= cut24) g.revPrev12 += r.subtotal || 0
    }

    const items = Object.values(map)
      .map(g => {
        const isStale = g.lastSale < staleCut
        const isDecline = !isStale && g.revPrev12 > 20000 && g.rev12 < g.revPrev12 * 0.3
        if (!isStale && !isDecline) return null
        if (g.totalRev < 1000) return null   // 幾乎沒賣過的雜項不列
        const monthsSince = Math.round((maxTs - new Date(g.lastSale).getTime()) / 86400000 / 30.44)
        const unitCost = costs[g.name]
        const suggestion = isStale
          ? (unitCost != null ? '盤點庫存 → 捐贈婦幼/社福機構' : '盤點庫存 → 捐贈或報廢（先補成本）')
          : '組合促銷出清；仍滯銷再轉捐贈'
        return {
          ...g, type: isStale ? 'stale' : 'decline', monthsSince,
          declinePct: g.revPrev12 > 0 ? 1 - g.rev12 / g.revPrev12 : null,
          unitCost: unitCost ?? null, suggestion,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.type === 'stale') - (a.type === 'stale') || b.totalRev - a.totalRev)
    return { items, maxDate }
  }, [allRows, costs, staleMonths])

  const shown = kind === 'all' ? items : items.filter(i => i.type === kind)
  const staleCount = items.filter(i => i.type === 'stale').length
  const declineCount = items.length - staleCount

  const exportCsv = () => {
    const head = '品項,品牌,類型,最後銷售,停滯月數,歷史總營收,歷史總數量,單位成本,建議\n'
    const body = shown.map(i =>
      [i.name, i.brand, i.type === 'stale' ? '滯銷' : '大幅衰退', i.lastSale, i.monthsSince, Math.round(i.totalRev), Math.round(i.totalQty), i.unitCost ?? '', i.suggestion]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `滯銷轉公益清單_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!items.length) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">💝 滯銷品轉公益建議</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            找出銷售停滯品項供「捐贈／出清／停售」決策（資料至 {maxDate}）。捐贈公益團體之進貨成本可依法認列費用（細節請洽會計師）；<span className="text-amber-500 font-semibold">實際庫存量與效期請人工確認</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => setStaleMonths(n)}
                className={`text-xs px-2 py-1 rounded-lg border ${staleMonths === n ? 'border-pink-400 bg-pink-50 text-pink-700 font-bold dark:bg-pink-900/30 dark:text-pink-300' : 'border-gray-200 dark:border-gray-600 text-gray-400'}`}>
                {n}個月
              </button>
            ))}
          </div>
          <button onClick={exportCsv}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            ⬇ 匯出捐贈清單 CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {[['all', `全部 ${items.length}`], ['stale', `🛑 滯銷 ${staleCount}`], ['decline', `📉 大幅衰退 ${declineCount}`]].map(([id, label]) => (
          <button key={id} onClick={() => setKind(id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${kind === id ? 'border-pink-400 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : 'border-gray-200 dark:border-gray-600 text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
              <th className="text-left  py-2 pr-2">品項</th>
              <th className="text-left  py-2 px-2">品牌</th>
              <th className="text-center py-2 px-2">類型</th>
              <th className="text-right py-2 px-2">最後銷售</th>
              <th className="text-right py-2 px-2">停滯</th>
              <th className="text-right py-2 px-2">歷史營收</th>
              <th className="text-right py-2 px-2">單位成本</th>
              <th className="text-left  py-2 pl-3">建議</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 60).map(i => (
              <tr key={i.name} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/40">
                <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200 max-w-[260px] truncate" title={i.name}>{i.name}</td>
                <td className="py-2.5 px-2 text-xs text-gray-500 dark:text-gray-400">{i.brand || '—'}</td>
                <td className="py-2.5 px-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${i.type === 'stale' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {i.type === 'stale' ? '滯銷' : `衰退 ${i.declinePct != null ? Math.round(i.declinePct * 100) + '%' : ''}`}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right text-xs text-gray-400 dark:text-gray-500">{i.lastSale}</td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{i.monthsSince} 月</td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{fmtW(i.totalRev)}</td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-500 dark:text-gray-400">{i.unitCost != null ? i.unitCost.toLocaleString() : '—'}</td>
                <td className="py-2.5 pl-3 text-xs text-gray-500 dark:text-gray-400">{i.suggestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 60 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">顯示前 60 筆，共 {shown.length} 項（CSV 有完整清單）</p>}
      </div>
    </div>
  )
}

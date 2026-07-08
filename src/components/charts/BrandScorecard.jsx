import { useMemo, useState } from 'react'

/**
 * 代理品牌記分卡 — 續約/砍約談判與資源分配用
 * 視窗固定為「最近 12 個月 vs 前 12 個月」（以資料最新日期為錨，不受篩選年份影響），
 * 每個品牌一列：營收、佔比、YoY、毛利率（依產品成本）、客戶數、通路數、集中度警示。
 */
const fmtW = v => {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}

export default function BrandScorecard({ allRows = [], costs = {} }) {
  const [sortBy, setSortBy] = useState('rev')

  const { list, maxDate, from12, totalRev } = useMemo(() => {
    if (!allRows.length) return { list: [], maxDate: '', from12: '', totalRev: 0 }
    const maxDate = allRows.reduce((m, r) => (r.date > m ? r.date : m), '')
    const anchor = new Date(maxDate)
    const d12 = new Date(anchor); d12.setFullYear(d12.getFullYear() - 1)
    const d24 = new Date(anchor); d24.setFullYear(d24.getFullYear() - 2)
    const from12 = d12.toISOString().slice(0, 10)
    const from24 = d24.toISOString().slice(0, 10)

    const map = {}
    let totalRev = 0
    for (const r of allRows) {
      if (r.date < from24) continue
      const b = r.brand || '（未標品牌）'
      if (!map[b]) map[b] = { name: b, rev: 0, prevRev: 0, qty: 0, cost: 0, coveredRev: 0, customers: new Set(), channels: new Set() }
      const g = map[b]
      if (r.date >= from12) {
        g.rev += r.subtotal || 0
        g.qty += r.quantity || 0
        totalRev += r.subtotal || 0
        if (r.customer) g.customers.add(r.customer)
        if (r.channelType || r.channel) g.channels.add(r.channelType || r.channel)
        const c = costs[r.product]
        if (c != null && !isNaN(c)) { g.cost += (r.quantity || 0) * c; g.coveredRev += r.subtotal || 0 }
      } else {
        g.prevRev += r.subtotal || 0
      }
    }
    const list = Object.values(map)
      .filter(g => g.rev > 0 || g.prevRev > 0)
      .map(g => ({
        ...g,
        share: totalRev > 0 ? g.rev / totalRev : 0,
        yoy: g.prevRev > 0 ? (g.rev - g.prevRev) / g.prevRev : null,
        margin: g.coveredRev > 0 ? (g.coveredRev - g.cost) / g.coveredRev : null,
        coverage: g.rev > 0 ? g.coveredRev / g.rev : 0,
        customerCount: g.customers.size,
        channelCount: g.channels.size,
      }))
    return { list, maxDate, from12, totalRev }
  }, [allRows, costs])

  const sorted = useMemo(() => {
    const arr = [...list]
    if (sortBy === 'rev')    arr.sort((a, b) => b.rev - a.rev)
    if (sortBy === 'yoy')    arr.sort((a, b) => (b.yoy ?? -Infinity) - (a.yoy ?? -Infinity))
    if (sortBy === 'margin') arr.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity))
    return arr
  }, [list, sortBy])

  if (!list.length) return null
  const topShare = Math.max(...list.map(g => g.share))

  const verdict = (g) => {
    if (g.yoy == null) return { t: '新進', c: 'text-gray-400' }
    if (g.yoy > 0.1 && (g.margin == null || g.margin > 0.25)) return { t: '加碼', c: 'text-emerald-600 dark:text-emerald-400 font-bold' }
    if (g.yoy < -0.25) return { t: '檢討', c: 'text-red-500 dark:text-red-400 font-bold' }
    if (g.margin != null && g.margin < 0.15) return { t: '議價', c: 'text-amber-600 dark:text-amber-400 font-bold' }
    return { t: '維持', c: 'text-blue-600 dark:text-blue-400' }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🗂️ 代理品牌記分卡</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            最近 12 個月（{from12} ~ {maxDate}）vs 前 12 個月；供續約談判與資源分配參考
          </p>
        </div>
        <div className="flex gap-1">
          {[['rev', '依營收'], ['yoy', '依成長'], ['margin', '依毛利']].map(([id, label]) => (
            <button key={id} onClick={() => setSortBy(id)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                sortBy === id
                  ? 'border-blue-400 bg-blue-50 text-blue-700 font-bold dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600'
                  : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {topShare > 0.4 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          ⚠️ 品牌集中度警示：最大品牌佔近 12 個月營收 {(topShare * 100).toFixed(0)}%——若該品牌代理生變，直接衝擊約 {(topShare * 100).toFixed(0)}% 業績，建議儲備替代品牌。
        </p>
      )}

      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
              <th className="text-left  py-2 pr-2">品牌</th>
              <th className="text-right py-2 px-2">近12月營收</th>
              <th className="text-right py-2 px-2">佔比</th>
              <th className="text-right py-2 px-2">YoY</th>
              <th className="text-right py-2 px-2">毛利率</th>
              <th className="text-right py-2 px-2">客戶數</th>
              <th className="text-right py-2 px-2">通路數</th>
              <th className="text-center py-2 pl-2">建議</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => {
              const v = verdict(g)
              return (
                <tr key={g.name} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200">{g.name}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-700 dark:text-gray-200">{fmtW(g.rev)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-500 dark:text-gray-400">{(g.share * 100).toFixed(1)}%</td>
                  <td className={`py-2.5 px-2 text-right font-bold ${g.yoy == null ? 'text-gray-400' : g.yoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {g.yoy == null ? '—' : `${g.yoy >= 0 ? '+' : ''}${(g.yoy * 100).toFixed(0)}%`}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {g.margin == null ? <span className="text-gray-400">—</span> : (
                      <span className={g.margin >= 0.3 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : g.margin < 0.15 ? 'text-red-500 dark:text-red-400 font-bold' : 'text-gray-600 dark:text-gray-300'}>
                        {(g.margin * 100).toFixed(1)}%{g.coverage < 0.5 && <span className="text-amber-500 text-xs" title="成本覆蓋率低於 50%，數字僅供參考">*</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right text-gray-500 dark:text-gray-400">{g.customerCount}</td>
                  <td className="py-2.5 px-2 text-right text-gray-500 dark:text-gray-400">{g.channelCount}</td>
                  <td className={`py-2.5 pl-2 text-center text-xs ${v.c}`}>{v.t}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          建議規則：YoY&gt;+10% 且毛利&gt;25% →「加碼」；YoY&lt;−25% →「檢討」；毛利&lt;15% →「議價」；其餘「維持」。* 表示該品牌成本覆蓋率 &lt;50%，毛利僅供參考。
        </p>
      </div>
    </div>
  )
}

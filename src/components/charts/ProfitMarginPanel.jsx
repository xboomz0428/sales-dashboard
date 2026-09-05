import { useMemo, useState } from 'react'

/**
 * ProfitMarginPanel — 品牌／產品毛利排行
 * 以「商品成本管理」設定的單位成本計算：毛利 = 營收(有成本商品) − 數量×單位成本。
 * dim='brand'：各品牌毛利與毛利率（附成本覆蓋率）
 * dim='product'：各產品毛利與毛利率（未設成本的產品另列提醒）
 */
const fmtMoney = (n) => Math.round(n).toLocaleString()

export default function ProfitMarginPanel({ filtered = [], costs = {}, dim = 'brand', excludeBrands = null, excludeProducts = null }) {
  const [showAll, setShowAll] = useState(false)
  const hasCosts = Object.keys(costs || {}).length > 0
  const isBrand = dim === 'brand'

  const { data, uncovered } = useMemo(() => {
    if (!hasCosts) return { data: [], uncovered: { count: 0, revenue: 0 } }
    const map = {}
    const noCost = {}
    for (const r of filtered) {
      // 停售／排除分析項目不列入排行
      if (isBrand && excludeBrands?.has(r.brand)) continue
      if (!isBrand && excludeProducts?.has(r.product)) continue
      const key = isBrand ? (r.brand || '未標品牌') : r.product
      if (!key) continue
      const s = r.subtotal || 0
      const unitCost = costs[r.product]
      const hasCost = unitCost != null && !isNaN(unitCost)
      if (isBrand) {
        const g = (map[key] ||= { name: key, totalRevenue: 0, coveredRevenue: 0, cost: 0, qty: 0 })
        g.totalRevenue += s
        g.qty += r.quantity || 0
        if (hasCost) { g.coveredRevenue += s; g.cost += (r.quantity || 0) * unitCost }
      } else if (hasCost) {
        const g = (map[key] ||= { name: key, brand: r.brand || '', totalRevenue: 0, coveredRevenue: 0, cost: 0, qty: 0 })
        g.totalRevenue += s; g.coveredRevenue += s
        g.cost += (r.quantity || 0) * unitCost
        g.qty += r.quantity || 0
      } else {
        const u = (noCost[key] ||= { revenue: 0 })
        u.revenue += s
      }
    }
    const rows = Object.values(map)
      .map(g => ({
        ...g,
        grossProfit: g.coveredRevenue - g.cost,
        marginRate: g.coveredRevenue > 0 ? (g.coveredRevenue - g.cost) / g.coveredRevenue : null,
        coverage: g.totalRevenue > 0 ? g.coveredRevenue / g.totalRevenue : 0,
      }))
      .filter(g => g.totalRevenue > 0)
      .sort((a, b) => b.grossProfit - a.grossProfit)
    const uncov = Object.values(noCost)
    return {
      data: rows,
      uncovered: { count: uncov.length, revenue: uncov.reduce((s2, u) => s2 + u.revenue, 0) },
    }
  }, [filtered, costs, hasCosts, isBrand, excludeBrands, excludeProducts])

  const maxProfit = useMemo(() => Math.max(1, ...data.map(d => Math.abs(d.grossProfit))), [data])
  const shown = showAll ? data : data.slice(0, 20)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
            {isBrand ? '💹 品牌毛利排行' : '💹 產品毛利排行'}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            依「商品成本管理」設定的單位成本計算；毛利 = 營收 − 數量 × 成本
          </p>
        </div>
      </div>

      {!hasCosts ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
          尚未設定產品成本。請先到「管理 → 商品成本」輸入成本，這裡才能計算毛利。
        </p>
      ) : !data.length ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">目前篩選範圍內無可計算毛利的資料</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
                <th className="text-left  py-2 pr-2">{isBrand ? '品牌' : '產品'}</th>
                {!isBrand && <th className="text-left py-2 px-2 hidden md:table-cell">品牌</th>}
                <th className="text-right py-2 px-2 whitespace-nowrap">營收</th>
                <th className="text-right py-2 px-2 whitespace-nowrap">成本</th>
                <th className="text-right py-2 px-2 whitespace-nowrap">毛利</th>
                <th className="text-right py-2 px-2 whitespace-nowrap">毛利率</th>
                <th className="text-left  py-2 pl-3 w-32 hidden sm:table-cell"></th>
                {isBrand && <th className="text-right py-2 pl-2 whitespace-nowrap">成本覆蓋率</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(d => {
                const up = d.grossProfit >= 0
                return (
                  <tr key={d.name} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200">{d.name}</td>
                    {!isBrand && <td className="py-2.5 px-2 text-xs text-gray-400 dark:text-gray-500 hidden md:table-cell">{d.brand || '—'}</td>}
                    <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtMoney(d.coveredRevenue)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtMoney(d.cost)}</td>
                    <td className={`py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtMoney(d.grossProfit)}</td>
                    <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {d.marginRate != null ? (d.marginRate * 100).toFixed(1) + '%' : '—'}
                    </td>
                    <td className="py-2.5 pl-3 hidden sm:table-cell">
                      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className={`h-full rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.abs(d.grossProfit) / maxProfit * 100}%` }} />
                      </div>
                    </td>
                    {isBrand && (
                      <td className={`py-2.5 pl-2 text-right text-xs whitespace-nowrap ${d.coverage < 0.5 ? 'text-amber-500 font-bold' : 'text-gray-400 dark:text-gray-500'}`}>
                        {(d.coverage * 100).toFixed(0)}%
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.length > 20 && (
            <button onClick={() => setShowAll(v => !v)}
              className="mt-2 w-full py-1.5 text-xs font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              {showAll ? '▲ 收合' : `▼ 顯示全部 ${data.length} 項`}
            </button>
          )}
          {isBrand ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              成本覆蓋率 = 有設定成本商品的營收 ÷ 該品牌總營收。<span className="text-amber-500 font-semibold">低於 50% 標黃</span>，代表毛利數字僅供參考。
            </p>
          ) : uncovered.count > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              ⚠ 另有 {uncovered.count} 項產品未設定成本（期間營收 NT$ {fmtMoney(uncovered.revenue)}），未列入毛利計算——到「管理 → 商品成本」補設定即可納入。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

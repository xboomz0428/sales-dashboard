import { useMemo, useState } from 'react'

/**
 * 通路毛利對比
 * 以「產品成本管理」設定的單位成本，把毛利與毛利率按通路拆開比較。
 * 只有設定了成本的商品會納入毛利計算，故每列附「成本覆蓋率」
 * （有成本商品的營收 ÷ 該通路總營收），覆蓋率低代表毛利數字參考性低。
 */
const fmtMoney = (n) => Math.round(n).toLocaleString()

export default function ChannelMarginPanel({ filtered = [], costs = {} }) {
  const [groupBy, setGroupBy] = useState('channelType')   // channelType | channel

  const hasCosts = Object.keys(costs || {}).length > 0

  const data = useMemo(() => {
    if (!hasCosts) return []
    const map = {}
    filtered.forEach(r => {
      const key = (groupBy === 'channelType' ? r.channelType : r.channel) || '其他'
      if (!map[key]) map[key] = { name: key, totalRevenue: 0, coveredRevenue: 0, cost: 0 }
      const g = map[key]
      g.totalRevenue += r.subtotal || 0
      const unitCost = costs[r.product]
      if (unitCost != null && !isNaN(unitCost)) {
        g.coveredRevenue += r.subtotal || 0
        g.cost += (r.quantity || 0) * unitCost
      }
    })
    return Object.values(map)
      .map(g => ({
        ...g,
        grossProfit: g.coveredRevenue - g.cost,
        marginRate: g.coveredRevenue > 0 ? (g.coveredRevenue - g.cost) / g.coveredRevenue : null,
        coverage: g.totalRevenue > 0 ? g.coveredRevenue / g.totalRevenue : 0,
      }))
      .filter(g => g.totalRevenue > 0)
      .sort((a, b) => b.grossProfit - a.grossProfit)
  }, [filtered, costs, groupBy, hasCosts])

  const maxProfit = useMemo(() => Math.max(1, ...data.map(d => Math.abs(d.grossProfit))), [data])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">通路毛利對比</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            依「產品成本管理」設定的成本計算；僅含已設定成本的商品
          </p>
        </div>
        <div className="flex gap-1">
          {[['channelType', '通路類型'], ['channel', '網路/實體']].map(([id, label]) => (
            <button key={id} onClick={() => setGroupBy(id)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                groupBy === id
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-bold dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600'
                  : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasCosts ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
          尚未設定產品成本。請先到「管理 → 產品成本」輸入成本，這裡才能計算各通路毛利。
        </p>
      ) : !data.length ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">目前篩選範圍內無資料</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
                <th className="text-left  py-2 pr-2">通路</th>
                <th className="text-right py-2 px-2">營收（有成本商品）</th>
                <th className="text-right py-2 px-2">成本</th>
                <th className="text-right py-2 px-2">毛利</th>
                <th className="text-right py-2 px-2">毛利率</th>
                <th className="text-left  py-2 pl-3 w-32 hidden sm:table-cell"></th>
                <th className="text-right py-2 pl-2">成本覆蓋率</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => {
                const up = d.grossProfit >= 0
                return (
                  <tr key={d.name} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200">{d.name}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{fmtMoney(d.coveredRevenue)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-500 dark:text-gray-400">{fmtMoney(d.cost)}</td>
                    <td className={`py-2.5 px-2 text-right font-mono font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtMoney(d.grossProfit)}</td>
                    <td className={`py-2.5 px-2 text-right font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {d.marginRate != null ? (d.marginRate * 100).toFixed(1) + '%' : '—'}
                    </td>
                    <td className="py-2.5 pl-3 hidden sm:table-cell">
                      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className={`h-full rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.abs(d.grossProfit) / maxProfit * 100}%` }} />
                      </div>
                    </td>
                    <td className={`py-2.5 pl-2 text-right text-xs ${d.coverage < 0.5 ? 'text-amber-500 font-bold' : 'text-gray-400 dark:text-gray-500'}`}>
                      {(d.coverage * 100).toFixed(0)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            成本覆蓋率 = 有設定成本商品的營收 ÷ 該通路總營收。<span className="text-amber-500 font-semibold">低於 50% 標黃</span>，代表該通路多數商品尚未設定成本，毛利數字僅供參考。
          </p>
        </div>
      )}
    </div>
  )
}

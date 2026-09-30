import { useMemo, useState } from 'react'
import { opMarginTier, OP_MARGIN_LEGEND } from '../../utils/opMargin'

/**
 * BrandPnlPanel — 🏷️ 品牌別損益（老闆視角）
 * 各品牌：營收 → 商品成本 → 毛利(率) → 費用攤提 → 淨利 / 淨利率（五級燈號）。
 * 費用攤提口徑：期間全部月費用 × 該品牌營收占比（共同費用無法直接歸屬，攤提僅供管理參考）。
 * 期間口徑：銷售篩選範圍 ∩ 有月費用記錄的月份（同獲利分析）。
 */

const fmtN = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString()
const pct = (n) => (n == null || isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%'
const posneg = (v) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
const TH = 'py-2 px-2 text-xs text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap'

export default function BrandPnlPanel({ filtered = [], productCosts = {}, monthlyExpenses = {}, excludeBrands = null }) {
  const [showAll, setShowAll] = useState(false)
  const hasCosts = Object.keys(productCosts || {}).length > 0

  const { rows, total, months } = useMemo(() => {
    const expMonths = new Set(Object.keys(monthlyExpenses).filter(m => (monthlyExpenses[m] || []).length))
    const monthSet = new Set()
    const byBrand = {}
    let totRev = 0
    for (const r of filtered) {
      const m = r.yearMonth
      if (!m || !expMonths.has(m)) continue
      monthSet.add(m)
      const brand = r.brand || '未標品牌'
      if (excludeBrands?.has(brand)) continue
      const s = r.subtotal || 0
      const uc = productCosts[r.product]
      const b = (byBrand[brand] ||= { revenue: 0, cost: 0, coveredRev: 0 })
      b.revenue += s
      totRev += s
      if (uc != null && !isNaN(uc)) { b.cost += (r.quantity || 0) * uc; b.coveredRev += s }
    }
    const totalExpense = [...monthSet].reduce(
      (s, m) => s + (monthlyExpenses[m] || []).reduce((a, it) => a + (Number(it.amount) || 0), 0), 0)

    const rows2 = Object.entries(byBrand).map(([brand, b]) => {
      const gross = b.coveredRev - b.cost
      const share = totRev > 0 ? b.revenue / totRev : 0
      const alloc = totalExpense * share
      const net = gross - alloc
      return {
        brand, ...b, share, gross, alloc, net,
        grossRate: b.coveredRev > 0 ? gross / b.coveredRev : null,
        netRate: b.revenue > 0 ? net / b.revenue : null,
        coverage: b.revenue > 0 ? b.coveredRev / b.revenue : 0,
      }
    }).filter(d => d.revenue > 0).sort((a, b) => b.revenue - a.revenue)

    const t = rows2.reduce((a, d) => ({ revenue: a.revenue + d.revenue, cost: a.cost + d.cost, gross: a.gross + d.gross, alloc: a.alloc + d.alloc, net: a.net + d.net }), { revenue: 0, cost: 0, gross: 0, alloc: 0, net: 0 })
    return { rows: rows2, total: { ...t, netRate: t.revenue > 0 ? t.net / t.revenue : null }, months: [...monthSet].sort() }
  }, [filtered, productCosts, monthlyExpenses, excludeBrands])

  if (!hasCosts || !rows.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🏷️ 品牌別損益</h3>
        <p className="text-sm text-gray-400 py-6 text-center">
          {!hasCosts ? '請先到「管理 → 商品成本」設定成本後才能計算。' : '篩選期間內沒有月費用記錄可對應（費用資料自 2025-01 起）。'}
        </p>
      </div>
    )
  }

  const shown = showAll ? rows : rows.slice(0, 12)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🏷️ 品牌別損益</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">
        期間 {months[0]} ~ {months[months.length - 1]}｜費用依「營收占比」攤提到各品牌（共同費用無法直接歸屬，攤提僅供管理參考）；已排除停售品牌
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead><tr className="border-b border-gray-100 dark:border-gray-700">
            <th className={TH + ' text-left'}>品牌</th>
            <th className={TH + ' text-right'}>營收</th>
            <th className={TH + ' text-right'}>占比</th>
            <th className={TH + ' text-right'}>商品成本</th>
            <th className={TH + ' text-right'}>毛利</th>
            <th className={TH + ' text-right'}>毛利率</th>
            <th className={TH + ' text-right'}>費用攤提</th>
            <th className={TH + ' text-right'}>淨利</th>
            <th className={TH + ' text-right'}>淨利率</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {shown.map(d => {
              const t = opMarginTier(d.netRate)
              return (
                <tr key={d.brand} className={d.net < 0 ? 'bg-red-50/40 dark:bg-red-900/10' : ''}>
                  <td className="py-2.5 px-2 font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    {d.brand}
                    {d.coverage < 0.5 && <span className="ml-1 text-[10px] text-amber-500" title={`成本覆蓋率 ${pct(d.coverage)}，毛利/淨利僅供參考`}>⚠</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.revenue)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-400 whitespace-nowrap">{pct(d.share)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.cost)}</td>
                  <td className={`py-2.5 px-2 text-right font-mono whitespace-nowrap ${posneg(d.gross)}`}>{fmtN(d.gross)}</td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">{pct(d.grossRate)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">({fmtN(d.alloc)})</td>
                  <td className={`py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap ${posneg(d.net)}`}>{fmtN(d.net)}</td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${t.bg} ${t.cls}`}>
                      {pct(d.netRate)}{t.label && <span className="font-semibold">{t.label}</span>}
                    </span>
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
              <td className="py-2 px-2 text-gray-800 dark:text-gray-100">合計</td>
              <td className="py-2 px-2 text-right font-mono">{fmtN(total.revenue)}</td>
              <td className="py-2 px-2 text-right text-gray-400">100%</td>
              <td className="py-2 px-2 text-right font-mono text-gray-400">{fmtN(total.cost)}</td>
              <td className={`py-2 px-2 text-right font-mono ${posneg(total.gross)}`}>{fmtN(total.gross)}</td>
              <td className="py-2 px-2"></td>
              <td className="py-2 px-2 text-right font-mono text-gray-400">({fmtN(total.alloc)})</td>
              <td className={`py-2 px-2 text-right font-mono ${posneg(total.net)}`}>{fmtN(total.net)}</td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {(() => { const t = opMarginTier(total.netRate); return (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${t.bg} ${t.cls}`}>
                    {pct(total.netRate)}{t.label && <span className="font-semibold">{t.label}</span>}
                  </span>
                ) })()}
              </td>
            </tr>
          </tbody>
        </table>
        {rows.length > 12 && (
          <button onClick={() => setShowAll(v => !v)}
            className="mt-2 w-full py-1.5 text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            {showAll ? '▲ 收合' : `▼ 顯示全部 ${rows.length} 個品牌`}
          </button>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          淨利 ＝ 毛利 − 費用攤提（攤提 ＝ 期間費用總額 × 品牌營收占比）。{OP_MARGIN_LEGEND}
        </p>
      </div>
    </div>
  )
}

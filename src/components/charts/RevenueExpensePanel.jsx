import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { opMarginTier, OP_MARGIN_LEGEND } from '../../utils/opMargin'

/**
 * RevenueExpensePanel — 📊 營收・費用關係（老闆視角）
 * 年／季／月三種粒度：營收、費用（柱）＋ 毛利、營業利益（線）＋ 營益率（右軸 %）。
 * 口徑：僅計「有月費用記錄」的月份（2025-01 起）；毛利 = 有設定成本商品的營收 − 數量×成本。
 */

const fmtW = (n) => {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + ' 億'
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(1) + ' 萬'
  return sign + Math.round(abs).toLocaleString()
}
const fmtN = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString()
const pct = (n) => (n == null || isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%'
const posneg = (v) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
const TH = 'py-2 px-2 text-xs text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap'

const quarterOf = (ym) => `${ym.slice(0, 4)}-Q${Math.ceil(Number(ym.slice(5, 7)) / 3)}`

export default function RevenueExpensePanel({ filtered = [], productCosts = {}, monthlyExpenses = {} }) {
  const [gran, setGran] = useState('month')   // month | quarter | year
  const hasCosts = Object.keys(productCosts || {}).length > 0

  const monthly = useMemo(() => {
    const expMonths = new Set(Object.keys(monthlyExpenses).filter(m => (monthlyExpenses[m] || []).length))
    const map = {}
    for (const r of filtered) {
      const m = r.yearMonth
      if (!m || !expMonths.has(m)) continue
      const s = r.subtotal || 0
      const uc = productCosts[r.product]
      const b = (map[m] ||= { revenue: 0, cost: 0, coveredRev: 0 })
      b.revenue += s
      if (uc != null && !isNaN(uc)) { b.cost += (r.quantity || 0) * uc; b.coveredRev += s }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => {
      const expense = (monthlyExpenses[m] || []).reduce((s2, it) => s2 + (Number(it.amount) || 0), 0)
      return { key: m, ...v, expense }
    })
  }, [filtered, productCosts, monthlyExpenses])

  const data = useMemo(() => {
    const groupKey = gran === 'month' ? (m) => m.key : gran === 'quarter' ? (m) => quarterOf(m.key) : (m) => m.key.slice(0, 4)
    const agg = {}
    const order = []
    for (const m of monthly) {
      const k = groupKey(m)
      if (!agg[k]) { agg[k] = { key: k, revenue: 0, cost: 0, coveredRev: 0, expense: 0, months: 0 }; order.push(k) }
      const a = agg[k]
      a.revenue += m.revenue; a.cost += m.cost; a.coveredRev += m.coveredRev; a.expense += m.expense; a.months++
    }
    return order.map(k => {
      const a = agg[k]
      const gross = a.coveredRev - a.cost
      const op = gross - a.expense
      return {
        ...a, gross, op,
        grossRate: a.coveredRev > 0 ? gross / a.coveredRev : null,
        expenseRate: a.revenue > 0 ? a.expense / a.revenue : null,
        opRate: a.revenue > 0 ? op / a.revenue : null,
      }
    })
  }, [monthly, gran])

  const total = useMemo(() => {
    const t = data.reduce((a, d) => ({ revenue: a.revenue + d.revenue, cost: a.cost + d.cost, coveredRev: a.coveredRev + d.coveredRev, expense: a.expense + d.expense }), { revenue: 0, cost: 0, coveredRev: 0, expense: 0 })
    const gross = t.coveredRev - t.cost
    const op = gross - t.expense
    return { ...t, gross, op, grossRate: t.coveredRev > 0 ? gross / t.coveredRev : null, expenseRate: t.revenue > 0 ? t.expense / t.revenue : null, opRate: t.revenue > 0 ? op / t.revenue : null }
  }, [data])

  if (!hasCosts || !data.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">📊 營收・費用關係</h3>
        <p className="text-sm text-gray-400 py-6 text-center">
          {!hasCosts ? '請先到「管理 → 商品成本」設定成本後才能計算。' : '篩選期間內沒有月費用記錄可對應（費用資料自 2025-01 起）。'}
        </p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    name: d.key, 營收: Math.round(d.revenue), 費用: Math.round(d.expense),
    毛利: Math.round(d.gross), 營業利益: Math.round(d.op),
    營益率: d.opRate != null ? +(d.opRate * 100).toFixed(1) : null,
  }))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">📊 營收・費用關係</h3>
          <p className="text-xs text-gray-400 mt-0.5">營收/費用（柱）＋毛利/營業利益（線）＋營益率（右軸 %）；僅計有月費用記錄的期間</p>
        </div>
        <div className="flex gap-1">
          {[['month', '月'], ['quarter', '季'], ['year', '年']].map(([id, label]) => (
            <button key={id} onClick={() => setGran(id)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                gran === id
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-bold dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600'
                  : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="amt" tick={{ fontSize: 11 }} tickFormatter={fmtW} width={56} />
            <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} width={44} />
            <Tooltip formatter={(v, n) => n === '營益率' ? v + '%' : 'NT$ ' + Number(v).toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="amt" dataKey="營收" fill="#60A5FA" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="amt" dataKey="費用" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
            <Line yAxisId="amt" dataKey="毛利" stroke="#A78BFA" strokeWidth={2} dot={{ r: 2 }} />
            <Line yAxisId="amt" dataKey="營業利益" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="rate" dataKey="營益率" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-gray-100 dark:border-gray-700">
            <th className={TH + ' text-left'}>{gran === 'month' ? '月份' : gran === 'quarter' ? '季度' : '年度'}</th>
            <th className={TH + ' text-right'}>營收</th>
            <th className={TH + ' text-right'}>毛利</th>
            <th className={TH + ' text-right'}>毛利率</th>
            <th className={TH + ' text-right'}>費用</th>
            <th className={TH + ' text-right'}>費用率</th>
            <th className={TH + ' text-right'}>營業利益</th>
            <th className={TH + ' text-right'}>營益率</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {data.map(d => (
              <tr key={d.key} className={d.op < 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {d.key}{gran !== 'month' && <span className="ml-1 text-xs text-gray-400">（{d.months} 個月）</span>}
                </td>
                <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.revenue)}</td>
                <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.gross)}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">{pct(d.grossRate)}</td>
                <td className="py-2 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.expense)}</td>
                <td className="py-2 px-2 text-right text-gray-400 whitespace-nowrap">{pct(d.expenseRate)}</td>
                <td className={`py-2 px-2 text-right font-mono font-bold whitespace-nowrap ${posneg(d.op)}`}>{fmtN(d.op)}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  {(() => { const t = opMarginTier(d.opRate); return (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${t.bg} ${t.cls}`}>
                      {pct(d.opRate)}{t.label && <span className="font-semibold">{t.label}</span>}
                    </span>
                  ) })()}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
              <td className="py-2 px-2 text-gray-800 dark:text-gray-100">合計</td>
              <td className="py-2 px-2 text-right font-mono">{fmtN(total.revenue)}</td>
              <td className="py-2 px-2 text-right font-mono">{fmtN(total.gross)}</td>
              <td className="py-2 px-2 text-right">{pct(total.grossRate)}</td>
              <td className="py-2 px-2 text-right font-mono text-gray-400">{fmtN(total.expense)}</td>
              <td className="py-2 px-2 text-right text-gray-400">{pct(total.expenseRate)}</td>
              <td className={`py-2 px-2 text-right font-mono ${posneg(total.op)}`}>{fmtN(total.op)}</td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {(() => { const t = opMarginTier(total.opRate); return (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${t.bg} ${t.cls}`}>
                    {pct(total.opRate)}{t.label && <span className="font-semibold">{t.label}</span>}
                  </span>
                ) })()}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{OP_MARGIN_LEGEND}</p>
      </div>
    </div>
  )
}

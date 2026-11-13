import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

/**
 * AnnualSummary — 📊 年度總表（彈窗）
 * ・年度費用：類別排行（含橫向圖表，一眼看出哪類費用太高）、項目排行（同名跨月加總）、月度費用走勢
 * ・年度發票：客戶發票金額排行（最高/最低）
 * 表格標題皆可點擊排序。
 */

const fmtN = (n) => '$' + Math.round(n).toLocaleString()
const pct = (n, t) => t > 0 ? (n / t * 100).toFixed(1) + '%' : '—'

function itemAmount(i) {
  if (i.count > 0 && i.unitCost > 0) return Number(i.count) * Number(i.unitCost)
  return Number(i.amount) || 0
}

/** 可點擊排序的標題列 */
function SortableHead({ cols, sort, onSort, color = 'text-gray-400' }) {
  return (
    <tr className={`text-xs ${color} dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700`}>
      {cols.map(c => (
        <th key={c.key || c.label} className={`py-2 px-2 whitespace-nowrap ${c.right ? 'text-right' : 'text-left'}`}>
          {c.key ? (
            <button onClick={() => onSort(c.key)} className="uppercase font-bold hover:text-blue-500" title="點擊排序">
              {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          ) : c.label}
        </th>
      ))}
    </tr>
  )
}

function useSort(defaultKey, defaultDir = 'desc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })
  const onSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  const apply = (list) => [...list].sort((a, b) => {
    const va = a[sort.key], vb = b[sort.key]
    const dir = sort.dir === 'asc' ? 1 : -1
    if (typeof va === 'number' || typeof vb === 'number') return dir * ((Number(va) || 0) - (Number(vb) || 0))
    return dir * String(va || '').localeCompare(String(vb || ''), 'zh-TW')
  })
  return { sort, onSort, apply }
}

export default function AnnualSummary({ expenses = {}, invoices = null, categories = [], getColor = () => '#6B7280', onClose }) {
  // 可選年份 = 費用與發票資料出現過的年份
  const years = useMemo(() => {
    const ys = new Set()
    for (const ym of Object.keys(expenses)) if ((expenses[ym] || []).length) ys.add(ym.slice(0, 4))
    for (const ym of Object.keys(invoices || {})) if (((invoices || {})[ym] || []).length) ys.add(ym.slice(0, 4))
    return [...ys].sort().reverse()
  }, [expenses, invoices])
  const [year, setYear] = useState(years[0] || String(new Date().getFullYear()))
  const [tab, setTab] = useState('expense') // expense | invoice
  const [showAllLabels, setShowAllLabels] = useState(false)
  const [showAllCust, setShowAllCust] = useState(false)

  // ── 年度費用彙總 ──
  const exp = useMemo(() => {
    const byCat = {}, byLabel = {}, byMonth = {}
    let total = 0
    for (const [ym, list] of Object.entries(expenses)) {
      if (!ym.startsWith(year)) continue
      for (const it of list || []) {
        const amt = itemAmount(it)
        total += amt
        const cat = it.category || '其他'
        byCat[cat] = (byCat[cat] || 0) + amt
        const lk = cat + '|' + String(it.label || '').trim()
        const l = (byLabel[lk] ||= { category: cat, label: String(it.label || '').trim() || '（未命名）', amount: 0, months: new Set() })
        l.amount += amt; l.months.add(ym)
        byMonth[ym] = (byMonth[ym] || 0) + amt
      }
    }
    const cats = Object.entries(byCat).map(([category, amount]) => ({
      category, amount, share: total > 0 ? amount / total : 0,
      avg: amount / Math.max(1, Object.keys(byMonth).length),
    })).sort((a, b) => b.amount - a.amount)
    const labels = Object.values(byLabel).map(l => ({ ...l, monthCount: l.months.size, avg: l.amount / l.months.size }))
    const months = Array.from({ length: 12 }, (_, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, '0')}`
      return { m: `${i + 1}月`, amount: byMonth[ym] || 0 }
    })
    return { total, cats, labels, months, monthN: Object.keys(byMonth).length }
  }, [expenses, year])

  // ── 年度發票彙總（依客戶）──
  const inv = useMemo(() => {
    const byCust = {}
    let total = 0, count = 0
    for (const [ym, list] of Object.entries(invoices || {})) {
      if (!ym.startsWith(year)) continue
      for (const r of list || []) {
        const amt = Number(r.amount) || 0
        total += amt; count++
        const name = r.billingName || r.store || '（未命名）'
        const c = (byCust[name] ||= { name, taxId: r.taxId || '', amount: 0, n: 0, months: new Set() })
        c.amount += amt; c.n++; c.months.add(ym)
      }
    }
    const custs = Object.values(byCust).map(c => ({ ...c, monthCount: c.months.size, share: total > 0 ? c.amount / total : 0 }))
    return { total, count, custs }
  }, [invoices, year])

  const catSort = useSort('amount')
  const labelSort = useSort('amount')
  const custSort = useSort('amount')

  const sortedCats = catSort.apply(exp.cats)
  const sortedLabels = labelSort.apply(exp.labels)
  const shownLabels = showAllLabels ? sortedLabels : sortedLabels.slice(0, 20)
  const sortedCusts = custSort.apply(inv.custs)
  const shownCusts = showAllCust ? sortedCusts : sortedCusts.slice(0, 20)

  const topCat = exp.cats[0], topLabel = [...exp.labels].sort((a, b) => b.amount - a.amount)[0]
  const topCust = [...inv.custs].sort((a, b) => b.amount - a.amount)[0]
  const minCust = [...inv.custs].sort((a, b) => a.amount - b.amount)[0]

  const TD = 'py-2 px-2 whitespace-nowrap'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
        {/* 標題列 */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">📊 {year} 年度總表</h3>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100">
              {years.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500">✕ 關閉</button>
          </div>
        </div>

        {/* KPI 摘要 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-400">年度費用總額（{exp.monthN} 個月）</p>
            <p className="text-lg font-bold font-mono text-gray-800 dark:text-gray-100">{fmtN(exp.total)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-400">最高費用類別</p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{topCat ? `${topCat.category} ${fmtN(topCat.amount)}` : '—'}</p>
            <p className="text-xs text-gray-400">{topCat ? `占 ${pct(topCat.amount, exp.total)}` : ''}</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-400">最高單一項目</p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate" title={topLabel?.label}>{topLabel ? topLabel.label : '—'}</p>
            <p className="text-xs text-gray-400">{topLabel ? fmtN(topLabel.amount) : ''}</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-400">發票金額最高客戶</p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate" title={topCust?.name}>{topCust ? topCust.name : '—'}</p>
            <p className="text-xs text-gray-400">{topCust ? fmtN(topCust.amount) : ''}</p>
          </div>
        </div>

        {/* 分頁 */}
        <div className="flex gap-1 mb-3">
          <button onClick={() => setTab('expense')}
            className={`px-4 py-1.5 text-sm font-bold rounded-lg ${tab === 'expense' ? 'bg-indigo-600 text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-500'}`}>💰 費用</button>
          <button onClick={() => setTab('invoice')}
            className={`px-4 py-1.5 text-sm font-bold rounded-lg ${tab === 'invoice' ? 'bg-indigo-600 text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-500'}`}>🧾 客戶發票</button>
        </div>

        {tab === 'expense' && (
          <div className="space-y-5">
            {/* 類別橫向圖：一眼比對哪類費用太高 */}
            <div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">類別費用比對（由高到低）</p>
              <div style={{ height: Math.max(180, exp.cats.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exp.cats} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" tickFormatter={v => v >= 1e4 ? (v / 1e4).toFixed(0) + '萬' : v} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" width={76} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => [fmtN(v), '年度費用']} />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]}
                      label={{ position: 'right', fontSize: 11, formatter: (v) => pct(v, exp.total) }}>
                      {exp.cats.map(d => <Cell key={d.category} fill={getColor(d.category)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 月度費用走勢 */}
            <div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">月度費用</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exp.months} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => v >= 1e4 ? (v / 1e4).toFixed(0) + '萬' : v} tick={{ fontSize: 11 }} width={44} />
                    <Tooltip formatter={(v) => [fmtN(v), '費用']} />
                    <Bar dataKey="amount" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 類別排行表 */}
            <div className="overflow-x-auto">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">類別排行</p>
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <SortableHead sort={catSort.sort} onSort={catSort.onSort} cols={[
                    { key: 'category', label: '類別' },
                    { key: 'amount', label: '年度金額', right: true },
                    { key: 'share', label: '占比', right: true },
                    { key: 'avg', label: '月均', right: true },
                  ]} />
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {sortedCats.map(d => (
                    <tr key={d.category}>
                      <td className={TD}><span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: getColor(d.category) }}>{d.category}</span></td>
                      <td className={TD + ' text-right font-mono font-bold'}>{fmtN(d.amount)}</td>
                      <td className={TD + ' text-right text-gray-400'}>{pct(d.amount, exp.total)}</td>
                      <td className={TD + ' text-right font-mono text-gray-500'}>{fmtN(d.avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 項目排行表 */}
            <div className="overflow-x-auto">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">項目排行（同名項目跨月加總）</p>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <SortableHead sort={labelSort.sort} onSort={labelSort.onSort} cols={[
                    { key: 'label', label: '項目' },
                    { key: 'category', label: '類別' },
                    { key: 'amount', label: '年度金額', right: true },
                    { key: 'monthCount', label: '月數', right: true },
                    { key: 'avg', label: '月均', right: true },
                  ]} />
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {shownLabels.map((d, i) => (
                    <tr key={d.category + d.label + i}>
                      <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 break-words max-w-[18rem]">{d.label}</td>
                      <td className={TD}><span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: getColor(d.category) }}>{d.category}</span></td>
                      <td className={TD + ' text-right font-mono font-bold'}>{fmtN(d.amount)}</td>
                      <td className={TD + ' text-right text-gray-400'}>{d.monthCount}</td>
                      <td className={TD + ' text-right font-mono text-gray-500'}>{fmtN(d.avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedLabels.length > 20 && (
                <button onClick={() => setShowAllLabels(v => !v)}
                  className="mt-2 w-full py-1.5 text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                  {showAllLabels ? '▲ 收合' : `▼ 顯示全部 ${sortedLabels.length} 個項目`}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-400">年度發票總額</p>
                <p className="text-base font-bold font-mono text-gray-800 dark:text-gray-100">{fmtN(inv.total)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-400">發票記錄筆數</p>
                <p className="text-base font-bold font-mono text-gray-800 dark:text-gray-100">{inv.count.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-400">金額最高</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate" title={topCust?.name}>{topCust?.name || '—'}</p>
                <p className="text-xs text-gray-400">{topCust ? fmtN(topCust.amount) : ''}</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-400">金額最低</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate" title={minCust?.name}>{minCust?.name || '—'}</p>
                <p className="text-xs text-gray-400">{minCust ? fmtN(minCust.amount) : ''}</p>
              </div>
            </div>

            {/* 客戶發票前 15 名圖表 */}
            <div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">客戶發票金額（前 15 名）</p>
              <div style={{ height: Math.max(180, Math.min(15, inv.custs.length) * 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...inv.custs].sort((a, b) => b.amount - a.amount).slice(0, 15)}
                    layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" tickFormatter={v => v >= 1e4 ? (v / 1e4).toFixed(0) + '萬' : v} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} tickFormatter={n => n.length > 10 ? n.slice(0, 10) + '…' : n} />
                    <Tooltip formatter={(v) => [fmtN(v), '發票金額']} />
                    <Bar dataKey="amount" fill="#0EA5E9" radius={[0, 6, 6, 0]}
                      label={{ position: 'right', fontSize: 11, formatter: (v) => pct(v, inv.total) }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 客戶排行表 */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <SortableHead sort={custSort.sort} onSort={custSort.onSort} cols={[
                    { key: 'name', label: '客戶（發票抬頭）' },
                    { key: 'taxId', label: '統編' },
                    { key: 'amount', label: '年度發票金額', right: true },
                    { key: 'n', label: '筆數', right: true },
                    { key: 'monthCount', label: '月數', right: true },
                    { key: 'share', label: '占比', right: true },
                  ]} />
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {shownCusts.map(c => (
                    <tr key={c.name}>
                      <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 break-words max-w-[16rem]">{c.name}</td>
                      <td className={TD + ' text-gray-400 font-mono text-xs'}>{c.taxId || '—'}</td>
                      <td className={TD + ' text-right font-mono font-bold'}>{fmtN(c.amount)}</td>
                      <td className={TD + ' text-right text-gray-400'}>{c.n}</td>
                      <td className={TD + ' text-right text-gray-400'}>{c.monthCount}</td>
                      <td className={TD + ' text-right text-gray-400'}>{pct(c.amount, inv.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedCusts.length > 20 && (
                <button onClick={() => setShowAllCust(v => !v)}
                  className="mt-2 w-full py-1.5 text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                  {showAllCust ? '▲ 收合' : `▼ 顯示全部 ${sortedCusts.length} 個客戶`}
                </button>
              )}
              <p className="text-xs text-gray-400 mt-2">「一般消費者（雲端發票/載具）」為 B2C 彙總列，與 B2B 客戶並列比較時請留意口徑。</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

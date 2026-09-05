import { useMemo, useState, Fragment } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ReferenceLine, ZAxis, Cell,
} from 'recharts'

/**
 * ProfitAnalysisPanel — 💰 獲利分析（五合一）
 * ① 通路貢獻利益：營收 − 商品成本 − 通路直接費用（momo/蝦皮/日藥的平台・物流・廣告費依費用標籤歸戶）
 * ② 月損益表：毛利 − 全部費用 = 營業利益；損益兩平營收 = 當月費用 ÷ 毛利率
 * ③ ROAS 監控：各通路廣告費率（廣告費 ÷ 通路營收），>5% 黃燈、>8% 紅燈
 * ④ 產品四象限：營收 × 毛利率（明星／引流／潛力／退場）
 * ⑤ 客戶毛利分級：毛利貢獻 Pareto 分 A/B/C 級
 * 口徑：商品成本僅計「已設定成本」商品；費用取「月費用」有記錄的月份（目前 2025-01 起）。
 */

const fmtW = (n) => {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + ' 億'
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(1) + ' 萬'
  return sign + Math.round(abs).toLocaleString()
}
const fmtN = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString()
const pct = (n) => (n == null || isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%'

// 通路歸屬：銷售端（客戶名）與費用端（費用標籤）共用四個通路桶
const CHANNELS = ['momo', '蝦皮', '日藥本舖', '其他通路']
const chanOfCustomer = (c) => {
  const s = String(c || '')
  if (/^momo/i.test(s)) return 'momo'
  if (/蝦皮/.test(s)) return '蝦皮'
  if (/日藥/.test(s)) return '日藥本舖'
  return '其他通路'
}
const chanOfExpense = (label) => {
  const s = String(label || '')
  if (/momo/i.test(s)) return 'momo'
  if (/蝦皮/.test(s)) return '蝦皮'
  if (/日藥/.test(s)) return '日藥本舖'
  return null   // 共同費用
}
const DIRECT_CATS = new Set(['平台費用', '物流費用', '廣告費用', '運費', '行銷'])
const AD_CATS = new Set(['廣告費用', '行銷'])

const CARD = 'bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5'
const TH = 'py-2 px-2 text-xs text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap'
const posneg = (v) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'

export default function ProfitAnalysisPanel({
  filtered = [], productCosts = {}, monthlyExpenses = {}, billingEntities = [],
  excludeProducts = null, excludeBrands = null,
}) {
  const [showAllCustomers, setShowAllCustomers] = useState(false)
  const hasCosts = Object.keys(productCosts || {}).length > 0

  // ── 分析期間：篩選資料的月份 ∩ 有費用記錄的月份 ─────────────────────────
  const core = useMemo(() => {
    const expMonths = new Set(Object.keys(monthlyExpenses).filter(m => (monthlyExpenses[m] || []).length))
    const rowMonths = new Set(filtered.map(r => r.yearMonth).filter(Boolean))
    const months = [...rowMonths].filter(m => expMonths.has(m)).sort()
    const monthSet = new Set(months)

    // 銷售端：逐月 × 通路 營收/成本；產品與客戶彙總（限分析期間）
    const byMonth = {}      // m → { revenue, cost, coveredRev, chan: {ch: {revenue, cost, coveredRev}} }
    const prodAgg = {}      // product → { revenue, cost, qty, brand }（僅有成本產品；排除停售）
    const custAgg = {}      // customer → { revenue, coveredRev, cost }
    let totRev = 0, totCov = 0, totCost = 0
    for (const r of filtered) {
      const m = r.yearMonth
      if (!monthSet.has(m)) continue
      const s = r.subtotal || 0
      const uc = productCosts[r.product]
      const has = uc != null && !isNaN(uc)
      const c = has ? (r.quantity || 0) * uc : 0
      const ch = chanOfCustomer(r.customer)
      const bm = (byMonth[m] ||= { revenue: 0, cost: 0, coveredRev: 0, chan: {} })
      bm.revenue += s
      const bc = (bm.chan[ch] ||= { revenue: 0, cost: 0, coveredRev: 0 })
      bc.revenue += s
      totRev += s
      if (has) { bm.cost += c; bm.coveredRev += s; bc.cost += c; bc.coveredRev += s; totCov += s; totCost += c }
      if (r.product && has && !excludeProducts?.has(r.product) && !excludeBrands?.has(r.brand)) {
        const p = (prodAgg[r.product] ||= { revenue: 0, cost: 0, qty: 0, brand: r.brand || '' })
        p.revenue += s; p.cost += c; p.qty += r.quantity || 0
      }
      if (r.customer) {
        const u = (custAgg[r.customer] ||= { revenue: 0, coveredRev: 0, cost: 0 })
        u.revenue += s
        if (has) { u.coveredRev += s; u.cost += c }
      }
    }
    const overallMargin = totCov > 0 ? (totCov - totCost) / totCov : 0

    // 費用端：逐月 × 類別；通路直接費用歸戶
    const expByMonth = {}   // m → { total, direct: {ch: {平台,物流,廣告}}, common, byCat: {} }
    for (const m of months) {
      const items = monthlyExpenses[m] || []
      const e = (expByMonth[m] = { total: 0, direct: {}, common: 0, byCat: {}, adByChan: {} })
      for (const it of items) {
        const amt = Number(it.amount) || 0
        e.total += amt
        e.byCat[it.category || '其他'] = (e.byCat[it.category || '其他'] || 0) + amt
        const ch = DIRECT_CATS.has(it.category) ? chanOfExpense(it.label) : null
        if (ch) {
          const d = (e.direct[ch] ||= { 平台費用: 0, 物流費用: 0, 廣告費用: 0 })
          const cat = AD_CATS.has(it.category) ? '廣告費用' : (it.category === '運費' ? '物流費用' : it.category)
          d[cat] = (d[cat] || 0) + amt
          if (AD_CATS.has(it.category)) e.adByChan[ch] = (e.adByChan[ch] || 0) + amt
        } else {
          e.common += amt
          if (AD_CATS.has(it.category)) e.adByChan['其他/站外'] = (e.adByChan['其他/站外'] || 0) + amt
        }
      }
    }

    return { months, byMonth, expByMonth, prodAgg, custAgg, overallMargin, totRev, totCov, totCost }
  }, [filtered, monthlyExpenses, productCosts, excludeProducts, excludeBrands])

  const { months, byMonth, expByMonth, prodAgg, custAgg, overallMargin } = core
  const coverage = core.totRev > 0 ? core.totCov / core.totRev : 0
  const periodLabel = months.length ? `${months[0]} ~ ${months[months.length - 1]}` : '—'

  // ── ① 通路貢獻利益 ───────────────────────────────────────────────────────
  const channelContrib = useMemo(() => {
    const agg = {}
    for (const m of months) {
      const bm = byMonth[m]; const e = expByMonth[m]
      for (const ch of CHANNELS) {
        const a = (agg[ch] ||= { revenue: 0, cost: 0, coveredRev: 0, 平台費用: 0, 物流費用: 0, 廣告費用: 0 })
        const bc = bm?.chan[ch]
        if (bc) { a.revenue += bc.revenue; a.cost += bc.cost; a.coveredRev += bc.coveredRev }
        const d = e?.direct[ch]
        if (d) { a.平台費用 += d.平台費用 || 0; a.物流費用 += d.物流費用 || 0; a.廣告費用 += d.廣告費用 || 0 }
      }
    }
    return CHANNELS.map(ch => {
      const a = agg[ch] || {}
      const gross = (a.coveredRev || 0) - (a.cost || 0)
      const fees = (a.平台費用 || 0) + (a.物流費用 || 0) + (a.廣告費用 || 0)
      const contrib = gross - fees
      return {
        ch, ...a, gross, fees, contrib,
        marginRate: a.coveredRev > 0 ? gross / a.coveredRev : null,
        contribRate: a.revenue > 0 ? contrib / a.revenue : null,
        coverage: a.revenue > 0 ? (a.coveredRev || 0) / a.revenue : 0,
      }
    }).filter(d => d.revenue > 0).sort((x, y) => y.contrib - x.contrib)
  }, [months, byMonth, expByMonth])

  // ── ② 月損益表 ───────────────────────────────────────────────────────────
  const pnl = useMemo(() => months.map(m => {
    const bm = byMonth[m] || { revenue: 0, cost: 0, coveredRev: 0 }
    const e = expByMonth[m] || { total: 0 }
    const gross = bm.coveredRev - bm.cost
    const marginRate = bm.coveredRev > 0 ? gross / bm.coveredRev : 0
    const op = gross - e.total
    return {
      m, revenue: bm.revenue, cost: bm.cost, gross, marginRate,
      expense: e.total, op,
      opRate: bm.revenue > 0 ? op / bm.revenue : null,
      breakeven: marginRate > 0 ? e.total / marginRate : null,
    }
  }), [months, byMonth, expByMonth])
  const pnlTotal = useMemo(() => {
    const t = pnl.reduce((a, d) => ({ revenue: a.revenue + d.revenue, cost: a.cost + d.cost, gross: a.gross + d.gross, expense: a.expense + d.expense, op: a.op + d.op }), { revenue: 0, cost: 0, gross: 0, expense: 0, op: 0 })
    return { ...t, opRate: t.revenue > 0 ? t.op / t.revenue : null }
  }, [pnl])

  // ── ③ ROAS／廣告費率 ─────────────────────────────────────────────────────
  const adMonitor = useMemo(() => months.map(m => {
    const e = expByMonth[m] || { adByChan: {} }
    const bm = byMonth[m] || { chan: {} }
    const rows = []
    for (const ch of ['momo', '蝦皮']) {
      const ad = e.adByChan?.[ch] || 0
      const rev = bm.chan[ch]?.revenue || 0
      if (ad || rev) rows.push({ ch, ad, rev, rate: rev > 0 ? ad / rev : null, roas: ad > 0 ? rev / ad : null })
    }
    return { m, rows, otherAd: e.adByChan?.['其他/站外'] || 0 }
  }).filter(d => d.rows.length || d.otherAd), [months, byMonth, expByMonth])

  // ── ④ 產品四象限 ─────────────────────────────────────────────────────────
  const quadrant = useMemo(() => {
    const items = Object.entries(prodAgg).map(([name, p]) => ({
      name, brand: p.brand, revenue: p.revenue,
      marginRate: p.revenue > 0 ? (p.revenue - p.cost) / p.revenue : 0,
      gross: p.revenue - p.cost,
    })).filter(d => d.revenue > 0)
    if (!items.length) return { items: [], revMid: 0, marginMid: 0 }
    const revs = items.map(d => d.revenue).sort((a, b) => a - b)
    const revMid = revs[Math.floor(revs.length / 2)]
    const marginMid = overallMargin
    for (const d of items) {
      d.q = d.revenue >= revMid
        ? (d.marginRate >= marginMid ? '⭐ 明星主力' : '⚠ 引流檢討')
        : (d.marginRate >= marginMid ? '💎 潛力推廣' : '🗑 退場候選')
    }
    return { items, revMid, marginMid }
  }, [prodAgg, overallMargin])
  const Q_COLORS = { '⭐ 明星主力': '#10B981', '⚠ 引流檢討': '#F59E0B', '💎 潛力推廣': '#6366F1', '🗑 退場候選': '#9CA3AF' }

  // ── ⑤ 客戶毛利分級（依群組彙總 → Pareto A/B/C）──────────────────────────
  const customerGrades = useMemo(() => {
    const toGroup = new Map()
    for (const e of billingEntities) for (const s of (e.stores || [])) toGroup.set(s, e.label || e.name)
    const agg = {}
    for (const [cust, v] of Object.entries(custAgg)) {
      const g = toGroup.get(cust) || cust
      const a = (agg[g] ||= { revenue: 0, coveredRev: 0, cost: 0 })
      a.revenue += v.revenue; a.coveredRev += v.coveredRev; a.cost += v.cost
    }
    const list = Object.entries(agg).map(([name, v]) => ({
      name, revenue: v.revenue, gross: v.coveredRev - v.cost,
      marginRate: v.coveredRev > 0 ? (v.coveredRev - v.cost) / v.coveredRev : null,
      coverage: v.revenue > 0 ? v.coveredRev / v.revenue : 0,
    })).filter(d => d.revenue > 0).sort((a, b) => b.gross - a.gross)
    const totalGross = list.reduce((s, d) => s + Math.max(0, d.gross), 0)
    let cum = 0
    for (const d of list) {
      cum += Math.max(0, d.gross)
      d.cumPct = totalGross > 0 ? cum / totalGross : 0
      d.grade = d.gross <= 0 ? 'C' : d.cumPct <= 0.7 ? 'A' : d.cumPct <= 0.9 ? 'B' : 'C'
    }
    return list
  }, [custAgg, billingEntities])

  if (!hasCosts) {
    return (
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">💰 獲利分析</h3>
        <p className="text-sm text-gray-400 py-6 text-center">尚未設定產品成本。請先到「管理 → 商品成本」輸入成本後，這裡才能計算毛利與獲利。</p>
      </div>
    )
  }
  if (!months.length) {
    return (
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">💰 獲利分析</h3>
        <p className="text-sm text-gray-400 py-6 text-center">
          目前篩選期間內沒有「月費用」記錄可對應（費用資料自 2025-01 起）。請把左側時間篩選調整到 2025 之後，或先到「管理 → 月費用」補登費用。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 口徑說明 */}
      <div className="text-xs text-gray-400 dark:text-gray-500 px-1">
        分析期間 <span className="font-semibold text-gray-600 dark:text-gray-300">{periodLabel}</span>（取「銷售篩選範圍 ∩ 有月費用記錄」的月份）｜
        商品成本覆蓋率 <span className={`font-semibold ${coverage < 0.5 ? 'text-amber-500' : 'text-gray-600 dark:text-gray-300'}`}>{pct(coverage)}</span>（毛利僅計已設定成本商品，覆蓋率低時數字僅供參考）
      </div>

      {/* ① 通路貢獻利益 */}
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">① 通路真實獲利（貢獻利益）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">貢獻利益 ＝ 毛利 −（該通路的平台費＋物流費＋廣告費，依費用標籤歸戶）；共同費用（人事/房租等）不分攤、見下方損益表</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-gray-100 dark:border-gray-700">
              <th className={TH + ' text-left'}>通路</th>
              <th className={TH + ' text-right'}>營收</th>
              <th className={TH + ' text-right'}>商品成本</th>
              <th className={TH + ' text-right'}>毛利</th>
              <th className={TH + ' text-right'}>平台費</th>
              <th className={TH + ' text-right'}>物流費</th>
              <th className={TH + ' text-right'}>廣告費</th>
              <th className={TH + ' text-right'}>貢獻利益</th>
              <th className={TH + ' text-right'}>貢獻率</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {channelContrib.map(d => (
                <tr key={d.ch}>
                  <td className="py-2.5 px-2 font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">{d.ch}
                    {d.coverage < 0.5 && <span className="ml-1 text-[10px] text-amber-500" title={`成本覆蓋率 ${pct(d.coverage)}`}>⚠</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.revenue)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.cost)}</td>
                  <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.gross)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.平台費用)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.物流費用)}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.廣告費用)}</td>
                  <td className={`py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap ${posneg(d.contrib)}`}>{fmtN(d.contrib)}</td>
                  <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${posneg(d.contrib)}`}>{pct(d.contribRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">「其他通路」含所有未歸戶通路的彙總；其平台/物流/廣告費為 0 是因為費用已歸給 momo/蝦皮/日藥或屬共同費用。</p>
      </div>

      {/* ② 月損益表 */}
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">② 每月損益表（P&L）＋損益兩平</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">營業利益 ＝ 毛利 − 全部月費用；損益兩平營收 ＝ 當月費用 ÷ 毛利率（營收超過此線才開始賺錢）</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pnl.map(d => ({ ...d, 營收: Math.round(d.revenue), 營業利益: Math.round(d.op), 損益兩平: d.breakeven ? Math.round(d.breakeven) : null }))}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtW} width={56} />
              <Tooltip formatter={(v) => 'NT$ ' + Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="營收" fill="#60A5FA" radius={[4, 4, 0, 0]} />
              <Line dataKey="損益兩平" stroke="#F59E0B" strokeDasharray="6 3" dot={false} strokeWidth={2} />
              <Line dataKey="營業利益" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-gray-100 dark:border-gray-700">
              <th className={TH + ' text-left'}>月份</th>
              <th className={TH + ' text-right'}>營收</th>
              <th className={TH + ' text-right'}>商品成本</th>
              <th className={TH + ' text-right'}>毛利</th>
              <th className={TH + ' text-right'}>毛利率</th>
              <th className={TH + ' text-right'}>費用合計</th>
              <th className={TH + ' text-right'}>營業利益</th>
              <th className={TH + ' text-right'}>營益率</th>
              <th className={TH + ' text-right'}>損益兩平營收</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {pnl.map(d => (
                <tr key={d.m} className={d.op < 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                  <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{d.m}</td>
                  <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.revenue)}</td>
                  <td className="py-2 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.cost)}</td>
                  <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.gross)}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{pct(d.marginRate)}</td>
                  <td className="py-2 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{fmtN(d.expense)}</td>
                  <td className={`py-2 px-2 text-right font-mono font-bold whitespace-nowrap ${posneg(d.op)}`}>{fmtN(d.op)}</td>
                  <td className={`py-2 px-2 text-right whitespace-nowrap ${posneg(d.op)}`}>{pct(d.opRate)}</td>
                  <td className="py-2 px-2 text-right font-mono text-amber-600 dark:text-amber-400 whitespace-nowrap">{fmtN(d.breakeven)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                <td className="py-2 px-2 text-gray-800 dark:text-gray-100">合計</td>
                <td className="py-2 px-2 text-right font-mono">{fmtN(pnlTotal.revenue)}</td>
                <td className="py-2 px-2 text-right font-mono text-gray-400">{fmtN(pnlTotal.cost)}</td>
                <td className="py-2 px-2 text-right font-mono">{fmtN(pnlTotal.gross)}</td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right font-mono text-gray-400">{fmtN(pnlTotal.expense)}</td>
                <td className={`py-2 px-2 text-right font-mono ${posneg(pnlTotal.op)}`}>{fmtN(pnlTotal.op)}</td>
                <td className={`py-2 px-2 text-right ${posneg(pnlTotal.op)}`}>{pct(pnlTotal.opRate)}</td>
                <td className="py-2 px-2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ③ ROAS 監控 */}
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">③ 廣告投資監控（費率／ROAS）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">廣告費率 ＝ 廣告費 ÷ 該通路營收（<span className="text-amber-500 font-semibold">&gt;5% 黃燈</span>、<span className="text-red-500 font-semibold">&gt;8% 紅燈</span>）；ROAS ＝ 通路營收 ÷ 廣告費</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-gray-100 dark:border-gray-700">
              <th className={TH + ' text-left'}>月份</th>
              {['momo', '蝦皮'].map(ch => (
                <th key={ch} className={TH + ' text-right'} colSpan={3}>{ch}（廣告費／費率／ROAS）</th>
              ))}
              <th className={TH + ' text-right'}>其他/站外廣告</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {adMonitor.map(d => {
                const cells = ['momo', '蝦皮'].map(ch => d.rows.find(r => r.ch === ch) || { ad: 0, rate: null, roas: null })
                return (
                  <tr key={d.m}>
                    <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{d.m}</td>
                    {cells.map((r, i) => (
                      <Fragment key={i}>
                        <td className="py-2 px-2 text-right font-mono text-gray-500 whitespace-nowrap">{r.ad ? fmtN(r.ad) : '—'}</td>
                        <td className={`py-2 px-2 text-right font-bold whitespace-nowrap ${r.rate == null ? 'text-gray-300' : r.rate > 0.08 ? 'text-red-500' : r.rate > 0.05 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{pct(r.rate)}</td>
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{r.roas ? r.roas.toFixed(1) + 'x' : '—'}</td>
                      </Fragment>
                    ))}
                    <td className="py-2 px-2 text-right font-mono text-gray-400 whitespace-nowrap">{d.otherAd ? fmtN(d.otherAd) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ④ 產品四象限 */}
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">④ 產品組合四象限（營收 × 毛利率）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">
          分界線：營收中位數 {fmtW(quadrant.revMid)}／整體毛利率 {pct(quadrant.marginMid)}｜⭐ 明星主力（加碼）・⚠ 引流檢討（檢討定價）・💎 潛力推廣・🗑 退場候選（停售清單）｜已排除停售項目
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis type="number" dataKey="revenue" name="營收" tick={{ fontSize: 11 }} tickFormatter={fmtW} scale="sqrt" domain={[0, 'dataMax']} />
              <YAxis type="number" dataKey="marginRate" name="毛利率" tick={{ fontSize: 11 }} tickFormatter={(v) => Math.round(v * 100) + '%'} />
              <ZAxis range={[40, 41]} />
              <ReferenceLine x={quadrant.revMid} stroke="#9CA3AF" strokeDasharray="4 4" />
              <ReferenceLine y={quadrant.marginMid} stroke="#9CA3AF" strokeDasharray="4 4" />
              <Tooltip formatter={(v, n) => n === '毛利率' ? pct(v) : 'NT$ ' + Number(v).toLocaleString()}
                labelFormatter={() => ''} content={({ payload }) => payload?.length ? (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs shadow-lg">
                    <p className="font-bold text-gray-800 dark:text-gray-100">{payload[0].payload.name}</p>
                    <p className="text-gray-500">{payload[0].payload.q}</p>
                    <p>營收 {fmtN(payload[0].payload.revenue)}｜毛利率 {pct(payload[0].payload.marginRate)}</p>
                  </div>
                ) : null} />
              <Scatter data={quadrant.items}>
                {quadrant.items.map((d, i) => <Cell key={i} fill={Q_COLORS[d.q]} fillOpacity={0.75} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {Object.keys(Q_COLORS).map(q => {
            const list = quadrant.items.filter(d => d.q === q).sort((a, b) => b.gross - a.gross).slice(0, 5)
            return (
              <div key={q} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                <p className="text-sm font-bold mb-1.5" style={{ color: Q_COLORS[q] }}>{q}（{quadrant.items.filter(d => d.q === q).length}）</p>
                {list.length ? list.map(d => (
                  <div key={d.name} className="flex justify-between gap-2 text-xs py-0.5">
                    <span className="text-gray-600 dark:text-gray-300 truncate" title={d.name}>{d.name}</span>
                    <span className="font-mono text-gray-400 whitespace-nowrap">{fmtW(d.revenue)}｜{pct(d.marginRate)}</span>
                  </div>
                )) : <p className="text-xs text-gray-300">無</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ⑤ 客戶毛利分級 */}
      <div className={CARD}>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">⑤ 客戶毛利分級（A/B/C）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">依毛利貢獻 Pareto 分級：A ＝ 累計毛利前 70%（重點經營）、B ＝ 70~90%（維持）、C ＝ 其餘與負毛利（檢討折扣或服務成本）；多門市客戶已依群組彙總</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-gray-100 dark:border-gray-700">
              <th className={TH + ' text-center'}>分級</th>
              <th className={TH + ' text-left'}>客戶（群組）</th>
              <th className={TH + ' text-right'}>營收</th>
              <th className={TH + ' text-right'}>毛利</th>
              <th className={TH + ' text-right'}>毛利率</th>
              <th className={TH + ' text-right'}>累計毛利占比</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {(showAllCustomers ? customerGrades : customerGrades.slice(0, 30)).map(d => (
                <tr key={d.name}>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block w-6 h-6 leading-6 rounded-full text-xs font-black text-white ${d.grade === 'A' ? 'bg-emerald-500' : d.grade === 'B' ? 'bg-sky-500' : 'bg-gray-400'}`}>{d.grade}</span>
                  </td>
                  <td className="py-2 px-2 font-semibold text-gray-700 dark:text-gray-200 break-words">
                    {d.name}
                    {d.coverage < 0.5 && <span className="ml-1 text-[10px] text-amber-500" title={`成本覆蓋率 ${pct(d.coverage)}，毛利僅供參考`}>⚠</span>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{fmtN(d.revenue)}</td>
                  <td className={`py-2 px-2 text-right font-mono font-bold whitespace-nowrap ${posneg(d.gross)}`}>{fmtN(d.gross)}</td>
                  <td className={`py-2 px-2 text-right whitespace-nowrap ${posneg(d.gross)}`}>{pct(d.marginRate)}</td>
                  <td className="py-2 px-2 text-right text-gray-400 whitespace-nowrap">{pct(d.cumPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {customerGrades.length > 30 && (
            <button onClick={() => setShowAllCustomers(v => !v)}
              className="mt-2 w-full py-1.5 text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              {showAllCustomers ? '▲ 收合' : `▼ 顯示全部 ${customerGrades.length} 家`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

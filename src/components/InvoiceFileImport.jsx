import { useState, useMemo, useRef } from 'react'
import { parseInvoiceFiles, planExpenseMerge, applyExpenseMerge, expenseDefaultChecked } from '../utils/invoiceImport'
import { aggregateSalesInvoices, planSalesInvoiceMerge, applySalesInvoiceMerge } from '../utils/salesInvoiceImport'
import SalesInvoiceMergePreview from './SalesInvoiceMergePreview'

/**
 * 發票檔匯入（每月費用管理、發票對帳管理共用）。
 * 上傳財政部進銷項查詢檔或電子發票銷項匯出檔（xls/xlsx/zip）後自動判斷：
 * 進項 → 每月費用、銷項 → 發票對帳；兩邊都先與既有資料逐筆比對，預覽標示新增／金額不同／已存在。
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString()
const CHIP = 'px-2 py-0.5 rounded-full border whitespace-nowrap'
const CAT_COLORS = {
  人事: '#3B82F6', 房租: '#10B981', 物流費用: '#F59E0B', 廣告費用: '#EF4444',
  平台費用: '#8B5CF6', 伙食交際: '#EC4899', 油資: '#F97316', 電信: '#06B6D4',
  辦公: '#64748B', 印刷品: '#84CC16', 其他: '#6B7280',
}
// 與每月費用管理的金額算法一致：有數量×單價用乘積，否則用金額
const expenseAmount = (item) => (item.count > 0 && item.unitCost > 0 ? item.count * item.unitCost : Number(item.amount) || 0)
const defaultGenId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

function CatBadge({ category }) {
  return <span className="text-xs px-1.5 py-0.5 rounded mr-1.5 text-white" style={{ background: CAT_COLORS[category] || '#6B7280' }}>{category}</span>
}

export default function InvoiceFileImport({
  label = '📥 匯入進銷項發票', className = '', title,
  expenses = null, onSaveExpenses = null,
  invoices = null, onSaveInvoices = null,
  billingEntities = [], genId = defaultGenId, onMessage = () => {},
}) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [salesUpdateChanged, setSalesUpdateChanged] = useState(true)
  const [checks, setChecks] = useState({})   // `${ym}|${kind}|${label}` → boolean（覆寫預設勾選）

  const canExp = !!(expenses && onSaveExpenses)
  const canInv = !!(invoices && onSaveInvoices)
  const hasIn = !!preview && preview.stats.invoices > 0
  const hasOut = !!preview?.sales

  const expPlan = useMemo(
    () => (preview && canExp ? planExpenseMerge(expenses, preview.months, { amountOf: expenseAmount }) : null),
    [preview, expenses, canExp]
  )
  const salesPlan = useMemo(
    () => (preview?.sales && canInv ? planSalesInvoiceMerge(invoices, preview.sales.months) : null),
    [preview, invoices, canInv]
  )
  const isChecked = (ym, kind, lbl) => {
    const v = checks[`${ym}|${kind}|${lbl}`]
    return v === undefined ? expenseDefaultChecked(kind) : v
  }
  const toggle = (ym, kind, lbl) => setChecks(c => ({ ...c, [`${ym}|${kind}|${lbl}`]: !isChecked(ym, kind, lbl) }))

  const expWork = useMemo(() => {
    const w = { add: 0, change: 0, remove: 0 }
    if (!expPlan) return w
    for (const [ym, m] of Object.entries(expPlan.months)) {
      for (const p of m.rows) {
        if ((p.kind === 'add' || p.kind === 'change') && isChecked(ym, p.kind, String(p.item.label || '').trim())) w[p.kind]++
      }
      for (const st of m.stale) if (isChecked(ym, 'stale', String(st.old.label || '').trim())) w.remove++
    }
    return w
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expPlan, checks])
  const salesChangeCount = salesPlan ? (salesUpdateChanged ? salesPlan.change : 0) : 0
  const salesWork = salesPlan ? salesPlan.add + salesChangeCount : 0
  const totalWork = expWork.add + expWork.change + expWork.remove + salesWork

  async function handleFiles(fileList) {
    const files = [...fileList].filter(f => /\.(xlsx?|zip)$/i.test(f.name))
    if (!files.length) return
    setBusy(true); onMessage(null)
    try {
      const result = await parseInvoiceFiles(files)
      const sales = result.salesRows.length ? aggregateSalesInvoices(result.salesRows) : null
      const hasSales = !!sales && sales.stats.invoices > 0
      if (!result.stats.invoices && !hasSales) {
        onMessage({ ok: false, text: '未解析到任何開立中的進項或銷項發票' })
      } else {
        setSalesUpdateChanged(true); setChecks({})
        setPreview({ ...result, sales: hasSales ? sales : null })
      }
    } catch (e) {
      onMessage({ ok: false, text: '解析失敗：' + (e.message || e) })
    }
    setBusy(false)
  }

  function confirmImport() {
    if (!preview) return
    const parts = []
    if (expPlan) {
      const { months, done } = applyExpenseMerge(expenses, expPlan, { genId, isChecked })
      for (const ym of Object.keys(months).sort()) onSaveExpenses(ym, months[ym])
      parts.push(`進項 → 月費用：新增 ${done.add} 筆（$${fmt(done.addAmt)}）`
        + (done.change ? `、更新金額 ${done.change} 筆` : '')
        + (done.removed ? `、移除 ${done.removed} 筆` : '')
        + `、已存在略過 ${expPlan.same + expPlan.dupOther} 筆`)
    }
    if (salesPlan) {
      const out = applySalesInvoiceMerge(invoices, salesPlan, { genId, billingEntities, updateChanged: salesUpdateChanged })
      for (const ym of Object.keys(out).sort()) onSaveInvoices(ym, out[ym])
      parts.push(`銷項 → 發票對帳：新增 ${salesPlan.add} 筆（$${fmt(salesPlan.addAmt)}）`
        + (salesChangeCount ? `、更新金額 ${salesChangeCount} 筆` : '')
        + `、已存在略過 ${salesPlan.same + salesPlan.dup} 筆`
        + (salesPlan.conflict ? `、需人工確認 ${salesPlan.conflict} 筆未變更` : ''))
    }
    onMessage({ ok: true, text: parts.join('｜') || '沒有需要匯入的資料' })
    setPreview(null)
  }

  const kindLabel = hasIn && hasOut ? '進銷項混合檔' : hasIn ? '進項發票檔' : '銷項發票檔'

  return (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={className}
        title={title || '上傳財政部進銷項查詢檔或電子發票銷項匯出檔（xls/xlsx/zip，可多選）。系統自動判斷是進項、銷項或混合檔：進項分類後入每月費用（排除商品進貨）、銷項彙總後入發票對帳。匯入前逐筆與既有資料比對，標示新增／金額不同／已存在，確認後才寫入。'}>
        {busy ? '解析中…' : label}
      </button>
      <input ref={fileRef} type="file" accept=".xls,.xlsx,.zip" multiple className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 text-left" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-2">📥 發票匯入預覽</h3>
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 mb-3 text-sm text-gray-700 dark:text-gray-200">
              <p className="font-bold">偵測到：{kindLabel}</p>
              {hasIn && <p className="text-xs mt-0.5">進項 {preview.stats.invoices} 張 → 每月費用（{preview.stats.months.join('、')}）</p>}
              {hasOut && <p className="text-xs mt-0.5">銷項 {preview.sales.stats.invoices} 張 → 發票對帳（{preview.sales.stats.months.join('、')}）</p>}
            </div>

            {hasIn && (
              <div className="mb-4">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">進項 → 每月費用</p>
                <p className="text-xs text-gray-400 mb-2">
                  有效發票 {preview.stats.invoices} 張（作廢 {preview.stats.voided}）｜已排除商品進貨 ${fmt(preview.stats.goodsTotal)}（{Object.keys(preview.stats.goodsBySeller).length} 家供應商，屬商品成本不入月費用）
                  {preview.stats.momoSkipped > 0 && `｜略過 momo $${fmt(preview.stats.momoSkipped)}（以 momo 對帳單為準）`}
                  {preview.stats.shopeeFeeSkipped > 0 && `｜略過蝦皮手續費 $${fmt(preview.stats.shopeeFeeSkipped)}（銷售已內扣 20%）`}
                </p>
                {Object.keys(preview.stats.unknownSellers || {}).length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">⚠ 未識別賣方（暫歸「其他」）：{Object.entries(preview.stats.unknownSellers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n2, v]) => `${n2} $${fmt(v)}`).join('、')}</p>
                )}
                {!expPlan && <p className="text-xs text-amber-600 dark:text-amber-400">這個頁面目前無法寫入每月費用，進項請到「每月費用管理」上傳同一份檔。</p>}
                {expPlan && (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2 text-xs font-bold">
                      <span className={`${CHIP} border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20`}>＋ 新增 {expPlan.add} 筆{expPlan.add > 0 ? `　$${fmt(expPlan.addAmt)}` : ''}</span>
                      <span className={`${CHIP} border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20`}>⟳ 金額不同 {expPlan.change} 筆</span>
                      <span className={`${CHIP} border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400`}>✓ 已存在略過 {expPlan.same + expPlan.dupOther} 筆</span>
                      {expPlan.stale > 0 && <span className={`${CHIP} border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400`}>檔案未含 {expPlan.stale} 筆</span>}
                    </div>
                    {Object.keys(expPlan.months).sort().map(ym => {
                      const m = expPlan.months[ym]
                      const act = m.rows.filter(p => p.kind === 'add' || p.kind === 'change')
                      const skip = m.rows.filter(p => p.kind === 'same' || p.kind === 'dupOther')
                      return (
                        <div key={ym} className="mb-2">
                          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1 mb-1">
                            {ym}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              {m.rows.length} 筆（${fmt(m.rows.reduce((s, p) => s + p.item.amount, 0))}）{!act.length && !m.stale.length ? '全部已存在' : `｜已存在 ${skip.length}`}
                            </span>
                          </p>
                          {act.map((p, i) => {
                            const lbl = String(p.item.label || '').trim()
                            return (
                              <label key={p.kind + i} className="flex items-start justify-between gap-2 text-sm py-0.5 cursor-pointer">
                                <span className="flex items-start gap-2 text-gray-700 dark:text-gray-200 break-words">
                                  <input type="checkbox" checked={isChecked(ym, p.kind, lbl)} onChange={() => toggle(ym, p.kind, lbl)} className="accent-emerald-600 w-4 h-4 mt-0.5 shrink-0" />
                                  <span>
                                    {p.kind === 'add'
                                      ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mr-1.5">＋ 新增</span>
                                      : <span className="text-xs font-bold text-amber-600 dark:text-amber-400 mr-1.5">⟳ 金額不同</span>}
                                    <CatBadge category={p.kind === 'change' ? (p.old.category || p.item.category) : p.item.category} />{p.item.label}
                                  </span>
                                </span>
                                <span className="font-mono whitespace-nowrap tabular-nums">
                                  {p.kind === 'change' && <><span className="text-gray-400 line-through">${fmt(p.oldAmt)}</span><span className="mx-1 text-gray-400">→</span></>}
                                  <span className="font-bold text-gray-800 dark:text-gray-100">${fmt(p.item.amount)}</span>
                                </span>
                              </label>
                            )
                          })}
                          {m.stale.map((st, i) => {
                            const lbl = String(st.old.label || '').trim()
                            const rm = isChecked(ym, 'stale', lbl)
                            return (
                              <label key={'s' + i} className="flex items-start justify-between gap-2 text-sm py-0.5 cursor-pointer text-gray-500 dark:text-gray-400">
                                <span className="flex items-start gap-2 break-words">
                                  <input type="checkbox" checked={rm} onChange={() => toggle(ym, 'stale', lbl)} className="accent-red-600 w-4 h-4 mt-0.5 shrink-0" />
                                  <span><span className="text-xs font-bold mr-1.5">檔案未含</span>{st.old.label}<span className="ml-1.5 text-xs">{rm ? '→ 將移除' : '→ 保留（勾選則移除）'}</span></span>
                                </span>
                                <span className="font-mono whitespace-nowrap tabular-nums">${fmt(st.oldAmt)}</span>
                              </label>
                            )
                          })}
                          {skip.length > 0 && (
                            <details className="text-xs text-gray-400 mt-0.5">
                              <summary className="cursor-pointer select-none">✓ 已存在 {skip.length} 筆（點開查看）</summary>
                              {skip.map((p, i) => (
                                <div key={'k' + i} className="flex justify-between gap-2 py-0.5 pl-6">
                                  <span className="break-words">{p.item.label}{p.kind === 'dupOther' ? `（已有其他來源的同名項目 $${fmt(p.oldAmt)}，不重複載入）` : ''}</span>
                                  <span className="font-mono whitespace-nowrap tabular-nums">${fmt(p.item.amount)}</span>
                                </div>
                              ))}
                            </details>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}

            {hasOut && (
              <div className={hasIn ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">銷項 → 發票對帳</p>
                <p className="text-xs text-gray-400 mb-2">
                  有效 {preview.sales.stats.invoices} 張（作廢排除 {preview.sales.stats.voided}）｜總額 ${fmt(preview.sales.stats.total)}
                </p>
                {salesPlan
                  ? <SalesInvoiceMergePreview plan={salesPlan} updateChanged={salesUpdateChanged} onToggleUpdate={setSalesUpdateChanged} />
                  : <p className="text-xs text-amber-600 dark:text-amber-400">這個頁面目前無法寫入發票對帳，銷項請到「發票對帳管理」上傳同一份檔。</p>}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-3">
              <button type="button" onClick={() => setPreview(null)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-500">{totalWork ? '取消' : '關閉'}</button>
              <button type="button" onClick={confirmImport} disabled={!totalWork}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-xl">
                {totalWork ? `✓ 確認匯入（${totalWork} 筆異動）` : '全部已存在，不需匯入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

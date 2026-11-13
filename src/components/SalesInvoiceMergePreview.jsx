/**
 * 銷項發票「比對後合併」預覽：發票對帳頁與每月費用頁的匯入視窗共用。
 * plan 來自 planSalesInvoiceMerge；本元件只顯示，不改資料。
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString()
const CHIP = 'px-2 py-0.5 rounded-full border whitespace-nowrap'

export default function SalesInvoiceMergePreview({ plan, updateChanged, onToggleUpdate }) {
  if (!plan) return null
  const months = Object.keys(plan.months).sort()
  const skipped = plan.same + plan.dup
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 text-xs font-bold">
        <span className={`${CHIP} border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20`}>
          ＋ 新增 {plan.add} 筆{plan.add > 0 ? `　$${fmt(plan.addAmt)}` : ''}
        </span>
        <span className={`${CHIP} border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20`}>
          ⟳ 金額不同 {plan.change} 筆
        </span>
        <span className={`${CHIP} border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400`}>
          ✓ 已存在略過 {skipped} 筆
        </span>
        {plan.conflict > 0 && (
          <span className={`${CHIP} border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20`}>
            ⚠ 需人工確認 {plan.conflict} 筆（不會變更）
          </span>
        )}
        {plan.missing > 0 && (
          <span className={`${CHIP} border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400`}
            title="系統裡有、這次檔案沒有的電子發票列。檔案可能只是部分匯出，所以一律保留不動">
            檔案未含 {plan.missing} 筆（保留）
          </span>
        )}
      </div>

      {plan.change > 0 && (
        <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2 cursor-pointer">
          <input type="checkbox" checked={updateChanged} onChange={e => onToggleUpdate(e.target.checked)}
            className="accent-amber-600 w-4 h-4 mt-0.5" />
          <span>金額不同的 {plan.change} 筆改成這次檔案的金額（入帳狀態與通路對應不變）</span>
        </label>
      )}

      {months.map(ym => {
        const m = plan.months[ym]
        const adds = m.rows.filter(p => p.kind === 'add')
        const changes = m.rows.filter(p => p.kind === 'change')
        const conflicts = m.rows.filter(p => p.kind === 'conflict')
        const skip = m.rows.length - adds.length - changes.length - conflicts.length
        const quiet = !adds.length && !changes.length && !conflicts.length && !m.missing.length
        return (
          <div key={ym} className="mb-2">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-1 mb-1">
              {ym}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {quiet ? `${m.rows.length} 組買方全部已存在` : `${m.rows.length} 組買方｜已存在 ${skip}`}
              </span>
            </p>
            {adds.map((p, i) => (
              <div key={'a' + i} className="flex justify-between gap-2 text-sm py-0.5">
                <span className="text-gray-700 dark:text-gray-200 break-words">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mr-1.5">＋ 新增</span>
                  {p.item.store}{p.item.taxId ? '' : '（無統編）'}
                </span>
                <span className="font-mono font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap tabular-nums">${fmt(p.item.amount)}</span>
              </div>
            ))}
            {changes.map((p, i) => (
              <div key={'c' + i} className="flex justify-between gap-2 text-sm py-0.5">
                <span className="text-gray-700 dark:text-gray-200 break-words">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 mr-1.5">⟳ 金額不同</span>
                  {p.item.store}{p.item.taxId ? '' : '（無統編）'}
                  {p.old.status === 'confirmed' && p.old.taxId ? <span className="ml-1 text-xs text-gray-400">已入帳</span> : null}
                </span>
                <span className="font-mono whitespace-nowrap tabular-nums">
                  <span className="text-gray-400 line-through">${fmt(p.old.amount)}</span>
                  <span className="mx-1 text-gray-400">→</span>
                  <span className="font-bold text-gray-800 dark:text-gray-100">${fmt(p.item.amount)}</span>
                </span>
              </div>
            ))}
            {conflicts.map((p, i) => (
              <div key={'x' + i} className="text-sm py-0.5">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-700 dark:text-gray-200 break-words">
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 mr-1.5">⚠ 需人工確認</span>
                    {p.item.store}{p.item.taxId ? '' : '（無統編）'}
                  </span>
                  <span className="font-mono font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap tabular-nums">${fmt(p.item.amount)}</span>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 pl-1">{p.reason}。這筆不會新增也不會更新。</p>
              </div>
            ))}
            {m.missing.map((r, i) => (
              <div key={'m' + i} className="flex justify-between gap-2 text-xs py-0.5 text-gray-400">
                <span className="break-words">檔案未含：{r.store}</span>
                <span className="font-mono whitespace-nowrap tabular-nums">${fmt(r.amount)}（保留）</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

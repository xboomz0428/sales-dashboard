/**
 * monthSync.js — 發票對帳／月費用「以月份為單位」同步到雲端的欄位對應與寫入流程。
 * 純函式（不碰 React／環境變數），方便單獨測試。
 */

// ─── Invoice 欄位對應（nullable 以外的欄位在資料表都是 NOT NULL）──────────────
export const INVOICE_FIELDS = [
  { app: 'id',              db: 'id',              default: '' },
  { app: 'store',           db: 'store',           default: '' },
  { app: 'billingName',     db: 'billing_name',    default: '' },
  { app: 'taxId',           db: 'tax_id',          default: '' },
  { app: 'mergedStores',    db: 'merged_stores',   default: [] },
  { app: 'invoiceNo',       db: 'invoice_no',      default: '' },
  { app: 'billingStart',    db: 'billing_start',   default: null, nullable: true },
  { app: 'billingEnd',      db: 'billing_end',     default: null, nullable: true },
  { app: 'amount',          db: 'amount',          default: 0 },
  { app: 'invoiceType',     db: 'invoice_type',    default: 'electronic' },
  { app: 'paymentMethod',   db: 'payment_method',  default: 'transfer' },
  { app: 'paymentTerm',     db: 'payment_term',    default: 30 },
  { app: 'issueDate',       db: 'issue_date',      default: null, nullable: true },
  { app: 'status',          db: 'status',          default: 'pending' },
  { app: 'confirmedAt',     db: 'confirmed_at',    default: null, nullable: true },
  { app: 'confirmedAmount', db: 'confirmed_amount',default: null, nullable: true },
  { app: 'note',            db: 'note',            default: '' },
]

// ─── Expense 欄位對應 ─────────────────────────────────────────────────────────
export const EXPENSE_FIELDS = [
  { app: 'id',       db: 'id',        default: '' },
  { app: 'category', db: 'category',  default: '其他' },
  { app: 'label',    db: 'label',     default: '' },
  { app: 'count',    db: 'count',     default: null, nullable: true },
  { app: 'unitCost', db: 'unit_cost', default: null, nullable: true },
  { app: 'amount',   db: 'amount',    default: 0 },
  { app: 'note',     db: 'note',      default: '' },
]

/**
 * App 物件 → DB 列。只有標 nullable 的欄位可以存 null；
 * 其餘欄位是 NOT NULL，空值（''／undefined／null）要補預設值——送 null 會讓整批寫入失敗。
 */
export function appToDbRow(appItem, month, fields) {
  const row = { month }
  for (const f of fields) {
    const v = appItem[f.app]
    const empty = v === '' || v === undefined || v === null
    row[f.db] = empty ? (f.nullable ? null : f.default) : v
  }
  if (!row.id) row.id = Date.now().toString(36) + Math.random().toString(36).slice(2)
  row.updated_at = new Date().toISOString()
  return row
}

/**
 * 以月份為單位同步到雲端：先 upsert 本次的列，成功後才刪掉該月不在清單內的舊列。
 * 任一步失敗就丟出錯誤；寫入失敗時不會刪任何資料。
 */
export async function replaceMonthRows(client, table, month, rows) {
  if (!rows.length) {
    const { error } = await client.from(table).delete().eq('month', month)
    if (error) throw error
    return
  }
  const { error: upErr } = await client.from(table).upsert(rows, { onConflict: 'id' })
  if (upErr) throw upErr
  const ids = rows.map(r => `"${String(r.id).replace(/["\\]/g, '\\$&')}"`).join(',')
  const { error: delErr } = await client.from(table).delete().eq('month', month).not('id', 'in', `(${ids})`)
  if (delErr) {
    // 新資料已寫入，只是多餘舊列沒清掉：標記階段，讓提示訊息能說清楚
    delErr.stage = 'cleanup'
    throw delErr
  }
}

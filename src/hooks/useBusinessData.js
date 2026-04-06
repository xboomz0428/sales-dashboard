/**
 * useBusinessData
 * ─────────────────────────────────────────────────────────────────────────────
 * 管理「發票對帳記錄」與「月費用記錄」的狀態與雲端同步。
 *
 * 策略：
 *   • 狀態以 { 'YYYY-MM': [...items] } 格式存於 React state
 *   • 每次 save 時同步更新 localStorage（離線 / 示範模式用）
 *   • 登入後從 Supabase DB 拉取全量資料（合併至本地）
 *   • 每次 save 時非同步同步到 Supabase（以月份為單位：先刪後插）
 *
 * Supabase 未設定時降級為純 localStorage。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseReady } from '../config/supabase'

const LS_INVOICE  = 'invoice_records'
const LS_EXPENSE  = 'monthly_expenses'
const LS_BILLING  = 'billing_entities'

// ─── 資料表名稱 ───────────────────────────────────────────────────────────────
const TBL_INVOICE = 'invoice_records'
const TBL_EXPENSE = 'monthly_expenses'
const TBL_BILLING = 'billing_entities'

// ─── localStorage 工具 ────────────────────────────────────────────────────────
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
}
function lsGetArr(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}
function lsSetArr(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
}

// ─── 將 DB 陣列列轉成 { 'YYYY-MM': [...] } 格式 ───────────────────────────────
function rowsToMonthMap(rows, fields) {
  const map = {}
  for (const row of rows) {
    const m = row.month
    if (!m) continue
    if (!map[m]) map[m] = []
    const item = {}
    for (const f of fields) item[f.app] = row[f.db] ?? f.default ?? null
    map[m].push(item)
  }
  return map
}

// ─── Invoice 欄位對應 ─────────────────────────────────────────────────────────
const INVOICE_FIELDS = [
  { app: 'id',              db: 'id',              default: '' },
  { app: 'store',           db: 'store',           default: '' },
  { app: 'billingName',     db: 'billing_name',    default: '' },
  { app: 'taxId',           db: 'tax_id',          default: '' },
  { app: 'mergedStores',    db: 'merged_stores',   default: [] },
  { app: 'invoiceNo',       db: 'invoice_no',      default: '' },
  { app: 'billingStart',    db: 'billing_start',   default: null },
  { app: 'billingEnd',      db: 'billing_end',     default: null },
  { app: 'amount',          db: 'amount',          default: 0 },
  { app: 'invoiceType',     db: 'invoice_type',    default: 'electronic' },
  { app: 'paymentMethod',   db: 'payment_method',  default: 'transfer' },
  { app: 'paymentTerm',     db: 'payment_term',    default: 30 },
  { app: 'issueDate',       db: 'issue_date',      default: null },
  { app: 'status',          db: 'status',          default: 'pending' },
  { app: 'confirmedAt',     db: 'confirmed_at',    default: null },
  { app: 'confirmedAmount', db: 'confirmed_amount',default: null },
  { app: 'note',            db: 'note',            default: '' },
]

// ─── Expense 欄位對應 ─────────────────────────────────────────────────────────
const EXPENSE_FIELDS = [
  { app: 'id',       db: 'id',        default: '' },
  { app: 'category', db: 'category',  default: '其他' },
  { app: 'label',    db: 'label',     default: '' },
  { app: 'count',    db: 'count',     default: null },
  { app: 'unitCost', db: 'unit_cost', default: null },
  { app: 'amount',   db: 'amount',    default: 0 },
  { app: 'note',     db: 'note',      default: '' },
]

function appToDbRow(appItem, month, fields) {
  const row = { month }
  for (const f of fields) {
    const v = appItem[f.app]
    row[f.db] = (v === '' || v === undefined) ? null : v
  }
  row.updated_at = new Date().toISOString()
  return row
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useBusinessData(user) {
  const [invoiceRecords, setInvoiceRecords] = useState(() => lsGet(LS_INVOICE))
  const [monthlyExpenses, setMonthlyExpenses] = useState(() => lsGet(LS_EXPENSE))
  const [billingEntities, setBillingEntities] = useState(() => lsGetArr(LS_BILLING))
  const loadedRef = useRef(false)

  // ── 登入後從 Supabase 載入全量資料 ─────────────────────────────────────────
  useEffect(() => {
    if (!user || !supabaseReady || loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      supabase.from(TBL_INVOICE).select('*').order('month'),
      supabase.from(TBL_EXPENSE).select('*').order('month'),
      supabase.from(TBL_BILLING).select('*').order('created_at'),
    ]).then(([invRes, expRes, bilRes]) => {
      if (!invRes.error && invRes.data?.length) {
        const map = rowsToMonthMap(invRes.data, INVOICE_FIELDS)
        setInvoiceRecords(prev => {
          const merged = { ...prev }
          for (const [m, items] of Object.entries(map)) {
            // 以 Supabase 為主（雲端優先），但保留本地有而雲端沒有的月份
            merged[m] = items
          }
          lsSet(LS_INVOICE, merged)
          return merged
        })
      }
      if (!expRes.error && expRes.data?.length) {
        const map = rowsToMonthMap(expRes.data, EXPENSE_FIELDS)
        setMonthlyExpenses(prev => {
          const merged = { ...prev }
          for (const [m, items] of Object.entries(map)) {
            merged[m] = items
          }
          lsSet(LS_EXPENSE, merged)
          return merged
        })
      }
      if (!bilRes.error && bilRes.data?.length) {
        // 雲端資料為主，轉換欄位名
        const entities = bilRes.data.map(r => ({
          id:      r.id,
          name:    r.name,
          taxId:   r.tax_id,
          stores:  r.stores || [],
        }))
        setBillingEntities(entities)
        lsSetArr(LS_BILLING, entities)
      }
    }).catch(() => { /* 靜默失敗，使用 localStorage */ })
  }, [user?.id])

  // ── 儲存發票記錄（月份為單位）────────────────────────────────────────────
  const saveInvoiceRecords = useCallback((month, items) => {
    setInvoiceRecords(prev => {
      const next = { ...prev, [month]: items }
      lsSet(LS_INVOICE, next)
      return next
    })

    if (!supabaseReady) return
    // 非同步：先刪該月所有記錄，再批次插入
    ;(async () => {
      try {
        await supabase.from(TBL_INVOICE).delete().eq('month', month)
        if (items.length) {
          const rows = items.map(item => appToDbRow(item, month, INVOICE_FIELDS))
          await supabase.from(TBL_INVOICE).insert(rows)
        }
      } catch { /* 靜默失敗 */ }
    })()
  }, [])

  // ── 儲存月費用（月份為單位）──────────────────────────────────────────────
  const saveMonthlyExpenses = useCallback((month, items) => {
    setMonthlyExpenses(prev => {
      const next = { ...prev, [month]: items }
      lsSet(LS_EXPENSE, next)
      return next
    })

    if (!supabaseReady) return
    ;(async () => {
      try {
        await supabase.from(TBL_EXPENSE).delete().eq('month', month)
        if (items.length) {
          const rows = items.map(item => appToDbRow(item, month, EXPENSE_FIELDS))
          await supabase.from(TBL_EXPENSE).insert(rows)
        }
      } catch { /* 靜默失敗 */ }
    })()
  }, [])

  // ── 儲存常用抬頭（upsert by id）────────────────────────────────────────
  const saveBillingEntity = useCallback((entity) => {
    // entity: { id, name, taxId, stores[] }
    setBillingEntities(prev => {
      const idx = prev.findIndex(e => e.id === entity.id)
      const next = idx >= 0
        ? prev.map((e, i) => i === idx ? entity : e)
        : [...prev, entity]
      lsSetArr(LS_BILLING, next)
      return next
    })

    if (!supabaseReady) return
    ;(async () => {
      try {
        await supabase.from(TBL_BILLING).upsert({
          id:         entity.id,
          name:       entity.name,
          tax_id:     entity.taxId || '',
          stores:     entity.stores || [],
          updated_at: new Date().toISOString(),
        })
      } catch { /* 靜默失敗 */ }
    })()
  }, [])

  // ── 刪除常用抬頭 ──────────────────────────────────────────────────────
  const deleteBillingEntity = useCallback((id) => {
    setBillingEntities(prev => {
      const next = prev.filter(e => e.id !== id)
      lsSetArr(LS_BILLING, next)
      return next
    })

    if (!supabaseReady) return
    ;(async () => {
      try {
        await supabase.from(TBL_BILLING).delete().eq('id', id)
      } catch { /* 靜默失敗 */ }
    })()
  }, [])

  return {
    invoiceRecords, monthlyExpenses, billingEntities,
    saveInvoiceRecords, saveMonthlyExpenses, saveBillingEntity, deleteBillingEntity,
  }
}

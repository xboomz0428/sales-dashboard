/**
 * useBusinessData
 * ─────────────────────────────────────────────────────────────────────────────
 * 管理「發票對帳記錄」與「月費用記錄」的狀態與雲端同步。
 *
 * 策略：
 *   • 狀態以 { 'YYYY-MM': [...items] } 格式存於 React state
 *   • 每次 save 時同步更新 localStorage（離線 / 示範模式用）
 *   • 登入後從 Supabase DB 拉取全量資料（合併至本地）
 *   • 每次 save 時非同步同步到 Supabase（以月份為單位：先寫入、成功後才刪掉該月多餘的舊列）
 *
 * 寫入失敗時不刪任何資料，並跳出提醒（不可靜默：曾因「先刪後插＋失敗無聲」整月資料被清空）。
 * Supabase 未設定時降級為純 localStorage。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseReady } from '../config/supabase'
import { INVOICE_FIELDS, EXPENSE_FIELDS, appToDbRow, replaceMonthRows } from '../utils/monthSync'

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

function notifySaveError(what, month, error) {
  console.error(`[useBusinessData] ${what} ${month} 雲端儲存失敗`, error)
  try {
    window.alert(`⚠ ${what} ${month} 沒有成功存到雲端，目前只存在這台電腦。\n\n原因：${error?.message || error}\n\n雲端原有資料沒有被更動。請不要清除瀏覽器資料，並把這個訊息提供給開發者。`)
  } catch { /* 非瀏覽器環境 */ }
}

/** 本機有、雲端沒有的月份：列給使用者確認後才上傳（不自動上傳，避免把別台電腦刪掉的月份救回來） */
async function resyncLocalOnly(pending) {
  const sorted = [...pending].sort((a, b) => (a.what + a.month).localeCompare(b.what + b.month))
  const lines = sorted.map(p => `・${p.what} ${p.month}（${p.items.length} 筆）`).join('\n')
  let ok = false
  try {
    ok = window.confirm(`偵測到以下月份的資料只存在這台電腦，雲端沒有（通常是先前雲端儲存失敗造成）：\n\n${lines}\n\n按「確定」現在上傳到雲端；按「取消」暫不處理（下次開啟會再詢問）。`)
  } catch { return }
  if (!ok) return
  const failed = []
  for (const p of sorted) {
    try {
      await replaceMonthRows(supabase, p.table, p.month, p.items.map(item => appToDbRow(item, p.month, p.fields)))
    } catch (e) {
      failed.push(`${p.what} ${p.month}：${e?.message || e}`)
    }
  }
  try {
    window.alert(failed.length
      ? `⚠ 有 ${failed.length} 個月份上傳失敗，資料仍保留在這台電腦：\n\n${failed.join('\n')}`
      : `✓ 已上傳 ${sorted.length} 個月份到雲端。`)
  } catch { /* 非瀏覽器環境 */ }
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
      // 只存在這台電腦、雲端沒有的月份（多半是先前雲端儲存失敗留下的）→ 詢問後補傳
      const pending = []
      const collect = (res, lsKey, table, fields, what) => {
        if (res.error) return
        const cloudMonths = new Set((res.data || []).map(r => r.month))
        for (const [m, items] of Object.entries(lsGet(lsKey))) {
          if (/^\d{4}-\d{2}$/.test(m) && Array.isArray(items) && items.length && !cloudMonths.has(m)) {
            pending.push({ what, table, fields, month: m, items })
          }
        }
      }
      collect(invRes, LS_INVOICE, TBL_INVOICE, INVOICE_FIELDS, '發票對帳')
      collect(expRes, LS_EXPENSE, TBL_EXPENSE, EXPENSE_FIELDS, '每月費用')
      if (pending.length) setTimeout(() => resyncLocalOnly(pending), 800)

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
          label:   r.label || '',
          note:    r.note || '',
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
    replaceMonthRows(supabase, TBL_INVOICE, month, items.map(item => appToDbRow(item, month, INVOICE_FIELDS)))
      .catch(e => notifySaveError('發票對帳', month, e))
  }, [])

  // ── 儲存月費用（月份為單位）──────────────────────────────────────────────
  const saveMonthlyExpenses = useCallback((month, items) => {
    setMonthlyExpenses(prev => {
      const next = { ...prev, [month]: items }
      lsSet(LS_EXPENSE, next)
      return next
    })

    if (!supabaseReady) return
    replaceMonthRows(supabase, TBL_EXPENSE, month, items.map(item => appToDbRow(item, month, EXPENSE_FIELDS)))
      .catch(e => notifySaveError('每月費用', month, e))
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
          label:      entity.label || '',
          note:       entity.note || '',
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

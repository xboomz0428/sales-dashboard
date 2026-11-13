import * as XLSX from 'xlsx'
import { isMofRow, detectOwnTaxId, mofDirection } from './mofInvoice'

/**
 * salesInvoiceImport.js — 電子發票「銷項」→ 發票對帳。雙格式自動辨識：
 * ①財政部平台進銷項查詢檔（btb411w，權威來源，含 momo 代傳、關貿傳送）②加值中心匯出（Excel_NoDetail_Invoice*.xlsx）
 * 財政部檔可能進銷項混合：只取賣方＝本公司的列，進項列計入 stats.purchaseSkipped 後略過。
 * 彙總維度：月份 × 買方——
 * ・有統編（平台/通路/機構）→ 以「買方名稱(統編)」為一組
 * ・無統編（終端客戶）→ 依備註歸組：PINKOI／官網（備註含訂單編號）／其他
 * 每組一筆對帳記錄：張數、發票號碼區間、金額合計。
 * 匯入採「比對後合併」（planSalesInvoiceMerge / applySalesInvoiceMerge）：
 * 同來源列（note 前綴「來源：電子發票匯出」）以 統編（無統編用店名）為鍵逐筆比對，
 * 相同略過、金額不同才更新金額、沒有的才新增；既有列的入帳狀態與群組對應一律保留，檔案沒有的既有列不刪。
 */

export const SALES_INV_NOTE_PREFIX = '來源：電子發票匯出'

function consumerGroup(note) {
  const t = String(note || '')
  if (/PINKOI/i.test(t)) return 'PINKOI 消費者'
  if (/訂單編號/.test(t)) return '官網 一般消費者'
  const tag = t.trim().slice(0, 10)
  return tag ? `${tag} 消費者` : '一般消費者'
}

function lastDay(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** 將兩種格式的原始列正規化：財政部 MIG OUT 檔（權威，含 momo 串接）與加值中心匯出檔 */
function normalizeRow(r) {
  if (r['賣方統一編號'] !== undefined || r['發票狀態'] !== undefined) {
    // 財政部 MIG（btb411w）：買方統編 0000000000 = 無統編消費者
    let taxId = String(r['買方統一編號'] || '').trim()
    if (taxId === '0000000000') taxId = ''
    return {
      status: String(r['發票狀態'] || ''),
      date: String(r['發票日期'] || ''),
      taxId,
      name: String(r['買方名稱'] || '').trim(),
      amt: Number(r['總計']) || 0,
      invNo: r['發票號碼'],
      note: String(r['買受人註記'] || r['總備註'] || ''),
      consumerLabel: '一般消費者（雲端發票/載具）',
    }
  }
  return {
    status: String(r['狀態'] || ''),
    date: String(r['發票日期'] || ''),
    taxId: String(r['買方統編'] || '').trim(),
    name: String(r['買方名稱'] || '').trim(),
    amt: Number(r['總計']) || 0,
    invNo: r['發票號碼'],
    note: String(r['備註'] || ''),
    consumerLabel: null,
  }
}

/** rows：sheet_to_json 的原始列 → { months, stats } */
export function aggregateSalesInvoices(allRows) {
  const agg = {}   // ym|groupKey → data
  const stats = { invoices: 0, voided: 0, months: new Set(), total: 0, purchaseSkipped: 0, purchaseSkippedAmt: 0 }
  const own = detectOwnTaxId(allRows)
  for (const raw of allRows) {
    if (isMofRow(raw) && mofDirection(raw, own) !== 'out') {
      if (mofDirection(raw, own) === 'in' && String(raw['發票狀態'] || '').includes('開立')) {
        stats.purchaseSkipped++
        stats.purchaseSkippedAmt += Number(raw['總計']) || 0
      }
      continue
    }
    const r0 = normalizeRow(raw)
    const status = r0.status
    const ymRaw = r0.date.replace(/\//g, '-')
    const ym = ymRaw.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) continue
    if (status.includes('作廢')) { stats.voided++; continue }
    if (!status.includes('開立')) continue
    const amt = r0.amt
    const taxId = r0.taxId
    const name = r0.name
    const group = taxId ? name : (r0.consumerLabel || consumerGroup(r0.note))
    // 有統編一律以統編為一組（同統編不同抬頭寫法也併成一筆，名稱取第一次出現的），與比對鍵 keyOf 一致
    const key = taxId ? `${ym}|t|${taxId}` : `${ym}|s|${group}`
    ;(agg[key] ||= { ym, group, taxId, amount: 0, count: 0, invNos: [] })
    const a = agg[key]
    a.amount += amt
    a.count++
    if (r0.invNo) a.invNos.push(String(r0.invNo))
    stats.invoices++
    stats.total += amt
    stats.months.add(ym)
  }

  const months = {}
  for (const a of Object.values(agg)) {
    a.invNos.sort()
    const invoiceNo = a.invNos.length > 1 ? `${a.invNos[0]}~${a.invNos[a.invNos.length - 1]}` : (a.invNos[0] || '')
    ;(months[a.ym] ||= []).push({
      store: a.group,
      billingName: a.taxId ? a.group : '',
      taxId: a.taxId,
      mergedStores: [],
      invoiceNo,
      billingStart: `${a.ym}-01`,
      billingEnd: lastDay(a.ym),
      amount: Math.round(a.amount),
      invoiceType: 'electronic',
      paymentMethod: 'transfer',
      paymentTerm: 30,
      issueDate: lastDay(a.ym),
      // 開立 ≠ 付款：B2B（有統編）待銀行匯款對應才入帳；B2C 消費者雲端發票為即時收款
      status: a.taxId ? 'pending' : 'confirmed',
      confirmedAt: a.taxId ? null : lastDay(a.ym),
      confirmedAmount: a.taxId ? null : Math.round(a.amount),
      note: `${SALES_INV_NOTE_PREFIX}（${a.count} 張）`,
      invNos: a.invNos,   // 僅供比對重複用，applySalesInvoiceMerge 寫入前會拿掉
    })
  }
  for (const ym of Object.keys(months)) months[ym].sort((x, y) => y.amount - x.amount)
  return { months, stats: { ...stats, months: [...stats.months].sort() } }
}

const normNo = (s) => String(s || '').trim().toUpperCase()
const amtOf = (r) => Math.round(Number(r.amount) || 0)
const isSameSource = (r) => String(r.note || '').startsWith(SALES_INV_NOTE_PREFIX)
const keyOf = (r) => (String(r.taxId || '').trim() ? 't:' + String(r.taxId).trim() : 's:' + String(r.store || '').trim())

/** 發票號碼 n 是否落在既有列的 invoiceNo（單號或「起~迄」區間）內 */
function noInRange(n, invoiceNo) {
  const s = normNo(invoiceNo)
  if (!s || !n) return false
  const [a, b] = s.split('~').map(x => x.trim())
  if (!b) return n === a
  return n.length === a.length && n >= a && n <= b
}

/** 既有列是否就是 plan 記下的那一筆：有 id 比 id，沒有 id 比物件本身 */
const isOldRow = (r, old) => r === old || (!!old.id && r.id === old.id)

/**
 * 比對「既有發票對帳記錄」與「本次解析結果」，逐筆分類（不動任何資料）：
 * ・same     同來源列、同鍵、金額相同 → 略過
 * ・change   同來源列、同鍵、金額不同 → 可更新金額（保留入帳狀態）
 * ・dup      其他來源列已登錄同一張發票（發票號碼相同，或手動列同統編同金額）→ 略過
 * ・conflict 無法安全判斷（同月同統編有多筆同來源列且合計不符；或消費者發票已用另一種分組方式匯入過）→ 不動，交人工確認
 * ・add      系統沒有 → 新增
 * missing：既有同來源列、本次檔案沒有 → 保留不動（檔案可能只是部分匯出）
 */
export function planSalesInvoiceMerge(existingByMonth, incomingByMonth) {
  const plan = { months: {}, add: 0, addAmt: 0, change: 0, same: 0, dup: 0, conflict: 0, missing: 0 }
  for (const ym of Object.keys(incomingByMonth || {}).sort()) {
    const existing = existingByMonth?.[ym] || []
    const ownRows = existing.filter(isSameSource)
    const own = new Map()   // 鍵 → 同來源列（正常只有一筆）
    for (const r of ownRows) {
      const k = keyOf(r)
      if (!own.has(k)) own.set(k, [])
      own.get(k).push(r)
    }
    const others = existing.filter(r => !isSameSource(r))
    const incoming = incomingByMonth[ym]
    const keys = new Set(incoming.map(keyOf))
    // 既有的無統編同來源列、本次沒有同名分組：可能是同一批消費者發票用另一種分組方式（加值中心格式）匯入的
    const strayConsumer = ownRows.filter(r => !String(r.taxId || '').trim() && !keys.has(keyOf(r)))

    const rows = incoming.map(item => {
      const olds = own.get(keyOf(item)) || []
      if (olds.length === 1) return { kind: amtOf(olds[0]) === item.amount ? 'same' : 'change', item, old: olds[0] }
      if (olds.length > 1) {
        const sum = olds.reduce((s, r) => s + amtOf(r), 0)
        if (sum === item.amount) return { kind: 'same', item, old: olds[0] }
        return {
          kind: 'conflict', item, old: olds[0],
          reason: `系統同月有 ${olds.length} 筆同統編的電子發票列（合計 $${sum.toLocaleString()}），無法判斷要更新哪一筆`,
        }
      }
      const nos = (item.invNos || []).map(normNo)
      if (!item.taxId) {
        const clash = strayConsumer.find(r => nos.some(n => noInRange(n, r.invoiceNo)))
        if (clash) {
          return {
            kind: 'conflict', item, old: clash,
            reason: `系統同月已有不同分組方式的消費者發票列「${clash.store}」，發票號碼重疊，新增會重複計算`,
          }
        }
      }
      const noSet = new Set(nos)
      const dup = others.find(r =>
        (normNo(r.invoiceNo) && noSet.has(normNo(r.invoiceNo))) ||
        (item.taxId && !String(r.note || '').startsWith('來源：') &&
          String(r.taxId || '').trim() === item.taxId && amtOf(r) === item.amount))
      return dup ? { kind: 'dup', item, old: dup } : { kind: 'add', item }
    })
    const missing = ownRows.filter(r => !keys.has(keyOf(r)))
    plan.months[ym] = { rows, missing }
    for (const p of rows) {
      plan[p.kind]++
      if (p.kind === 'add') plan.addAmt += p.item.amount
    }
    plan.missing += missing.length
  }
  return plan
}

/** 無統編彙總列（如一般消費者）新增時，沿用最近一個月同名列的通路對應，未開立比對才不會漏 */
function inheritedStores(existingByMonth, ym, store) {
  const months = Object.keys(existingByMonth || {}).filter(m => m < ym).sort().reverse()
  for (const m of months) {
    const hit = (existingByMonth[m] || []).find(r => !r.taxId && r.store === store && (r.mergedStores || []).length)
    if (hit) return hit.mergedStores
  }
  return null
}

/**
 * 依 plan 產生要寫回的月份資料 { ym: rows }（只含有異動的月份）。
 * 新增列自動套用客戶群組對應；更新列只改金額／發票號碼區間／張數備註。
 */
export function applySalesInvoiceMerge(existingByMonth, plan, { genId, billingEntities = [], updateChanged = true } = {}) {
  const byTaxId = new Map(billingEntities.filter(e => e.taxId).map(e => [e.taxId, e]))
  const byName = new Map(billingEntities.map(e => [e.name, e]))
  const out = {}
  for (const [ym, m] of Object.entries(plan.months)) {
    let rows = [...(existingByMonth?.[ym] || [])]
    let touched = false
    for (const p of m.rows) {
      if (p.kind === 'add') {
        const { invNos, ...item } = p.item
        const ent = (item.taxId && byTaxId.get(item.taxId)) || byName.get(item.store) || null
        const inherited = !ent && !item.taxId ? inheritedStores(existingByMonth, ym, item.store) : null
        rows.push({
          ...item, id: genId(),
          ...(ent ? { mergedStores: ent.stores || [], billingName: ent.name || item.billingName || '' } : {}),
          ...(inherited ? { mergedStores: inherited } : {}),
        })
        touched = true
      } else if (p.kind === 'change' && updateChanged) {
        rows = rows.map(r => (!isOldRow(r, p.old) ? r : {
          ...r, amount: p.item.amount, invoiceNo: p.item.invoiceNo, note: p.item.note,
          // 無統編彙總列為即時收款，已收金額跟著發票額走；有統編的已收金額是實際匯款，不動
          ...(!r.taxId && r.status === 'confirmed' ? { confirmedAmount: p.item.amount } : {}),
        }))
        touched = true
      }
    }
    if (touched) out[ym] = rows
  }
  return out
}

/** files: File[]（.xlsx/.xls 或 .zip 內含之） */
export async function parseSalesInvoiceFiles(files) {
  const rows = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await f.arrayBuffer())
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.xlsx?$/i.test(entry.name)) {
          const wb = XLSX.read(await entry.async('arraybuffer'), { type: 'array' })
          for (const sn of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn]))
        }
      }
    } else if (/\.xlsx?$/i.test(f.name)) {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      for (const sn of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn]))
    }
  }
  return aggregateSalesInvoices(rows)
}

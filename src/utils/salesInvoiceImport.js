import * as XLSX from 'xlsx'

/**
 * salesInvoiceImport.js — 電子發票「銷項」匯出檔（Excel_NoDetail_Invoice*.xlsx / .zip）→ 發票對帳
 * 彙總維度：月份 × 買方——
 * ・有統編（平台/通路/機構）→ 以「買方名稱(統編)」為一組
 * ・無統編（終端客戶）→ 依備註歸組：PINKOI／官網（備註含訂單編號）／其他
 * 每組一筆對帳記錄：張數、發票號碼區間、金額合計、狀態=已確認（此為實際已開立事實）。
 * 冪等：note 前綴「來源：電子發票匯出」，重匯同月自動覆蓋同來源列（手動列保留）。
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

/** rows：sheet_to_json 的原始列 → { months, stats } */
export function aggregateSalesInvoices(allRows) {
  const agg = {}   // ym|groupKey → data
  const stats = { invoices: 0, voided: 0, months: new Set(), total: 0 }
  for (const r of allRows) {
    const status = String(r['狀態'] || '')
    const ymRaw = String(r['發票日期'] || '').replace(/\//g, '-')
    const ym = ymRaw.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) continue
    if (status.includes('作廢')) { stats.voided++; continue }
    if (!status.includes('開立')) continue
    const amt = Number(r['總計']) || 0
    const taxId = String(r['買方統編'] || '').trim()
    const name = String(r['買方名稱'] || '').trim()
    const group = taxId ? name : consumerGroup(r['備註'])
    const key = `${ym}|${group}|${taxId}`
    ;(agg[key] ||= { ym, group, taxId, amount: 0, count: 0, invNos: [] })
    const a = agg[key]
    a.amount += amt
    a.count++
    if (r['發票號碼']) a.invNos.push(String(r['發票號碼']))
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
      status: 'confirmed',
      confirmedAt: lastDay(a.ym),
      confirmedAmount: Math.round(a.amount),
      note: `${SALES_INV_NOTE_PREFIX}（${a.count} 張）`,
    })
  }
  for (const ym of Object.keys(months)) months[ym].sort((x, y) => y.amount - x.amount)
  return { months, stats: { ...stats, months: [...stats.months].sort() } }
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

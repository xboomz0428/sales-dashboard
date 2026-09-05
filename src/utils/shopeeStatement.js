/**
 * shopeeStatement.js — 蝦皮「代收轉付開立發票對帳單」（PDF）解析
 * 這份對帳單告知賣家每月「應開立給蝦皮的發票金額」（代收轉付，抬頭：新加坡商蝦皮娛樂電商 56801904），
 * 並列出蝦皮向賣家收取的「代收轉付服務費」（每筆訂單 2.5 元，由蝦皮開立發票）。
 * 匯入去向：應開立發票金額 → 發票對帳（待開/核對）；服務費 → 月費用（平台費用）。
 * 支援多檔與 ZIP；同月重複自動擇優（驗證通過者優先）。
 * 驗證：A+B+C+D+E ＝ 應開立發票金額；服務費 ≒ 發票筆數 × 2.5（四捨五入）。
 */

export const SHOPEE_STMT_NOTE_PREFIX = '來源：蝦皮對帳單'
export const SHOPEE_TAX_ID = '56801904'
export const SHOPEE_BILLING_NAME = '新加坡商蝦皮娛樂電商有限公司台灣分公司'

const num = (s) => parseInt(String(s).replace(/,/g, ''), 10)

/** 純文字 → 單月結構（Node 可測） */
export function parseShopeeStatementText(text) {
  const t = String(text)
  if (!/代收轉付開立發票對帳單/.test(t)) return null
  const mSeq = t.match(/銷帳序號\s*(\d{4})(\d{2})/)
  if (!mSeq) return null
  const ym = `${mSeq[1]}-${mSeq[2]}`

  const grab = (re) => { const m = t.match(re); return m ? num(m[1]) : null }
  // 【A】~【D】之後可能夾註解括號（無數字），取其後第一個數字
  const A = grab(/【A】[^-\d]*(-?[\d,]+)/)
  const B = grab(/【B】[^-\d]*(-?[\d,]+)/)
  const C = grab(/【C】[^-\d]*(-?[\d,]+)/)
  const D = grab(/【D】[^-\d]*(-?[\d,]+)/)
  // 新版：【E】=非當月個案調整；舊版（~2025 上半年）：【E】=上月協議退款、另有【F】=非當月個案調整
  const E = grab(/【E】[^-\d]*(-?[\d,]+)/) ?? 0
  const F = grab(/【F】[^-\d]*(-?[\d,]+)/) ?? 0
  const amount = grab(/【A\+B\+C\+D\+E(?:\+F)?】[^-\d]*(-?[\d,]+)/)
  // 服務費：「…筆 數 … 服 務 費 … 總 … 額」表頭後接兩個數字（筆數、服務費）
  const mFee = t.match(/筆\s*數[^0-9-]+([\d,]+)\s+([\d,]+)/)
  const invoiceCount = mFee ? num(mFee[1]) : null
  const serviceFee = mFee ? num(mFee[2]) : null

  if (amount == null || A == null) return null
  const sum = (A ?? 0) + (B ?? 0) + (C ?? 0) + (D ?? 0) + E + F
  // 服務費率：2026 起每筆 2.5 元；2025 為每筆 2 元
  const feeOk = invoiceCount == null || serviceFee == null ||
    Math.abs(serviceFee - Math.round(invoiceCount * 2.5)) <= 1 ||
    Math.abs(serviceFee - Math.round(invoiceCount * 2)) <= 1
  const ok = sum === amount && feeOk
  return { ym, A, B, C, D, E, F, amount, invoiceCount, serviceFee, sum, ok }
}

async function extractPdfText(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    text += content.items.map(i => i.str).join(' ') + '\n'
  }
  return text
}

/** files: File[]（.pdf 或 .zip）→ { months: {ym: parsed}, stats } */
export async function parseShopeeFiles(files) {
  const buffers = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await f.arrayBuffer())
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.pdf$/i.test(entry.name)) {
          buffers.push({ name: entry.name, buf: await entry.async('arraybuffer') })
        }
      }
    } else if (/\.pdf$/i.test(f.name)) {
      buffers.push({ name: f.name, buf: await f.arrayBuffer() })
    }
  }

  const byMonth = {}
  const stats = { files: buffers.length, parsed: 0, failed: [], dups: [] }
  for (const { name, buf } of buffers) {
    let parsed = null
    try { parsed = parseShopeeStatementText(await extractPdfText(buf)) } catch { /* failed */ }
    if (!parsed) { stats.failed.push(name); continue }
    stats.parsed++
    const prev = byMonth[parsed.ym]
    if (prev) {
      stats.dups.push(parsed.ym)
      const better = (parsed.ok && !prev.ok) || (parsed.ok === prev.ok && (parsed.amount || 0) > (prev.amount || 0))
      if (!better) continue
    }
    byMonth[parsed.ym] = { ...parsed, file: name }
  }
  return { months: byMonth, stats }
}

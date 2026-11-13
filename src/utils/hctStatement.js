/**
 * hctStatement.js — 新竹物流「請款明細表」（PDF）解析
 * 一份 PDF 一個請款月，內含多個子帳號區段（發送請款／到著請款），每段有小計，
 * 末頁有「運費銷售額／運費稅額」與「發送到著請款總計」（含稅總額＝實際請款金額）。
 * 匯入去向：總計 → 月費用（物流費用，label「新竹物流」，與既往 hct-* 列同格式）。
 * 驗證：銷售額＋稅額 ＝ 總計；各區段小計加總 ＝ 總計。
 */

export const HCT_NOTE_PREFIX = '來源：新竹物流請款明細'
export const HCT_LABEL = '新竹物流'

const num = (s) => parseInt(String(s).replace(/,/g, ''), 10)

/** 純文字 → 單月結構（Node 可測） */
export function parseHctStatementText(text) {
  const t = String(text)
  if (!/新\s*竹\s*物\s*流/.test(t) || !/請\s*款\s*明\s*細\s*表/.test(t)) return null
  const mDate = t.match(/請款日期:\s*(\d{4})年(\d{1,2})月/)
  if (!mDate) return null
  const ym = `${mDate[1]}-${mDate[2].padStart(2, '0')}`

  const grab = (re) => { const m = t.match(re); return m ? num(m[1]) : null }
  const grand = grab(/發送到著請款總計：?\s*([\d,]+)/)
  const sales = grab(/運費銷售額：?\s*([\d,]+)/)
  const tax = grab(/運費稅額：?\s*([\d,]+)/)
  const mNo = t.match(/請款書編號:\s*(\d+)/)

  // 區段小計：「…月份發送請款總計／…月份到著請款總計」
  // （總計行是「月份發送到著請款總計」，上面兩個 pattern 都比不中，不會重複計入）
  let sectionSum = 0, sections = 0
  for (const m of t.matchAll(/月份(?:發送|到著)請款總計：?\s*([\d,]+)/g)) {
    sectionSum += num(m[1]); sections++
  }

  // 託運筆數：明細列「發送日期 站名 明細表號碼(10碼-n-n)」
  const count = [...t.matchAll(/\b20\d{6}\s+\S+\s+\d{10}-\d-\d/g)].length

  const amount = grand ?? (sections ? sectionSum : null)
  if (amount == null || !amount) return null
  const ok =
    (grand == null || sections === 0 || sectionSum === grand) &&
    (sales == null || tax == null || grand == null || sales + tax === grand)
  return { ym, amount, sales, tax, grand, sectionSum, sections, count, invoiceNo: mNo ? mNo[1] : null, ok }
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
export async function parseHctFiles(files) {
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
    try { parsed = parseHctStatementText(await extractPdfText(buf)) } catch { /* failed */ }
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

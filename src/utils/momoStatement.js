/**
 * momoStatement.js — momo 供應商對帳單（PDF）→ 月費用三類自動拆帳
 * 支援多檔與 ZIP 上傳；同月重複自動擇優（加總＝對帳單總計 E 者優先）。
 * 分類：物流/倉租/包材/耗材→物流費用｜行銷/活動贊助/廣告/聯盟→廣告費用｜其餘（獎勵金/平台服務費/罰款等）→平台費用
 * 每份皆驗證「逐項加總 ＝ 費用總計 E」，不符標 ⚠ 供人工複核。
 */

export const MOMO_NOTE_PREFIX = '來源：momo對帳單'
export const MOMO_LABELS = {
  物流費用: 'momo 物流與倉租（對帳單）',
  廣告費用: 'momo 廣告與行銷贊助（對帳單）',
  平台費用: 'momo 平台服務與獎勵金（對帳單）',
}

function classify(name) {
  if (/物流|運費|倉租|包裝|包材|耗材|派工|寄倉|超商/.test(name)) return '物流費用'
  if (/行銷贊助|活動贊助|廣告|聯盟行銷|媒體|曝光|momo卡|moPlus/.test(name)) return '廣告費用'
  return '平台費用'
}

/** 從對帳單全文解析單月資料（純文字進、結構出；Node 可測） */
export function parseStatementText(text) {
  const t = String(text).replace(/ /g, ' ')
  const mm = t.match(/對帳區間\s*(\d{4})\/(\d{2})\/\d{2}/)
  if (!mm) return null
  const month = `${mm[1]}-${mm[2]}`

  const start = t.indexOf('各項費用及罰則')
  let seg = start >= 0 ? t.slice(start) : t
  const endIdx = seg.search(/保\s*留\s*款|前期保留款/)
  if (endIdx > 0) seg = seg.slice(0, endIdx)

  // 兩段費用：E＝各項費用及罰則；F＝貨款扣抵項目（部分月份才有，內含站內廣告費）
  const fIdx = seg.indexOf('貨款扣抵項目')
  const segE = fIdx >= 0 ? seg.slice(0, fIdx) : seg
  const segF = fIdx >= 0 ? seg.slice(fIdx) : ''
  const Em = t.match(/總計\s*E\s*(-?[\d,]+)/)
  const E = Em ? parseInt(Em[1].replace(/,/g, ''), 10) : null
  const Fm = t.match(/總計\s*F\s*(-?[\d,]+)/)
  const F = Fm ? parseInt(Fm[1].replace(/,/g, ''), 10) : null

  const grab = (s) => {
    const items = []
    const re = /([一-鿿][一-鿿A-Za-z()（）\/\-\.]*)\s*(-?[\d,]{1,11})(?![\d\/])/g
    let m
    while ((m = re.exec(s)) !== null) {
      const name = m[1].trim()
      if (/總計|項次|項目|金額|費用及罰則|扣抵項目|保留款|應付|訂單|退貨|發票|折讓|統一編號|供應商|對帳|認證|區間|營業稅|銷售額|列印|窗口|注意/.test(name)) continue
      const amt = parseInt(m[2].replace(/,/g, ''), 10)
      if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 5_000_000) continue
      items.push({ name, amt })
    }
    return items
  }
  const itemsE = grab(segE)
  // F 段先剝除長括號說明（如「(發票列印請至momo平台[廣告設定]頁面)」），避免尾字被誤認為項目名
  const itemsF = grab(segF.replace(/（[^）]{8,}）|\([^)]{8,}\)/g, ' '))
  const sumE = itemsE.reduce((s, x) => s + x.amt, 0)
  const sumF = itemsF.reduce((s, x) => s + x.amt, 0)
  const ok = E != null && sumE === E && (F == null ? itemsF.length === 0 : sumF === F)

  const buckets = {}, detail = {}
  for (const x of [...itemsE, ...itemsF]) {
    const c = classify(x.name)
    buckets[c] = (buckets[c] || 0) + x.amt
    ;(detail[c] ||= []).push(`${x.name}${x.amt}`)
  }
  return { month, E, F, sum: sumE + sumF, ok, buckets, detail, itemCount: itemsE.length + itemsF.length }
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

/** files: File[]（.pdf 或 .zip）→ { months, stats } */
export async function parseMomoFiles(files) {
  const buffers = []   // { name, buf }
  const JSZipMod = null
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
    try {
      parsed = parseStatementText(await extractPdfText(buf))
    } catch (e) { /* 落入 failed */ }
    if (!parsed) { stats.failed.push(name); continue }
    stats.parsed++
    const prev = byMonth[parsed.month]
    if (prev) {
      stats.dups.push(parsed.month)
      // 擇優：驗證通過者優先；同為通過取 E 較大（較完整）
      const better = (parsed.ok && !prev.ok) || (parsed.ok === prev.ok && (parsed.E || 0) > (prev.E || 0))
      if (!better) continue
    }
    byMonth[parsed.month] = { ...parsed, file: name }
  }
  return { months: byMonth, stats }
}

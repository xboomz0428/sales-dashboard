/**
 * mofInvoice.js — 財政部電子發票整合服務平台「進銷項查詢」匯出檔（btb411w）的進／銷分流。
 * 同一份檔可能同時含銷項（賣方＝本公司）與進項（買方＝本公司），
 * 銷項進「發票對帳」、進項進「每月費用」，兩邊的解析器都用這裡判斷方向。
 */

export const OWN_TAX_ID = '53563252'

const tid = (v) => String(v ?? '').trim()

/** 是否為財政部 MIG 格式的主檔列（有買賣雙方統編欄） */
export function isMofRow(r) {
  return !!r && r['賣方統一編號'] !== undefined && r['買方統一編號'] !== undefined
}

/**
 * 推定本公司統編：檔內出現過 OWN_TAX_ID 就採用；
 * 否則取「以買方或賣方身分出現在最多列」的統編（本公司必定出現在每一列）。
 */
export function detectOwnTaxId(rows) {
  const count = new Map()
  for (const r of rows) {
    if (!isMofRow(r)) continue
    const ids = new Set([tid(r['賣方統一編號']), tid(r['買方統一編號'])])
    for (const id of ids) if (id) count.set(id, (count.get(id) || 0) + 1)
  }
  if (!count.size || count.has(OWN_TAX_ID)) return OWN_TAX_ID
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** 'out'＝銷項（本公司開出）｜'in'＝進項（本公司取得）｜null＝與本公司無關 */
export function mofDirection(r, own = OWN_TAX_ID) {
  if (tid(r['賣方統一編號']) === own) return 'out'
  if (tid(r['買方統一編號']) === own) return 'in'
  return null
}

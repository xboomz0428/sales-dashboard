import * as XLSX from 'xlsx'
import { isMofRow, detectOwnTaxId, mofDirection } from './mofInvoice'

/**
 * invoiceImport.js — 財政部「進項發票」匯出檔（IN 檔 xls/xlsx）→ 月費用自動分類
 * 財政部檔可能進銷項混合：只取買方＝本公司的列入費用；賣方＝本公司的銷項列
 * 原樣放進回傳的 salesRows（交給 salesInvoiceImport 進發票對帳），不會被當成費用。
 * 與 2026-09 首次人工匯入使用同一套規則：
 * ・進貨（商品成本）排除，只入營運費用
 * ・蝦皮拆三類：廣告儲值→廣告費用｜手續費/服務費→平台費用｜平台購物→辦公（待確認）
 * ・momo 拆二類：廣告/行銷贊助→廣告費用｜服務管理費→平台費用
 * ・日藥本舖拆三類：物流管理→物流費用｜檔期推廣→廣告費用｜進貨獎勵金→平台費用
 * 匯入端以 note 前綴「來源：進項發票」辨識同來源列，逐筆比對後合併（planExpenseMerge／applyExpenseMerge），不整月覆蓋。
 */

export const IMPORT_NOTE_PREFIX = '來源：進項發票'

// 進貨（商品成本）賣方——排除不入月費用；新供應商請在此維護
export const GOODS_SELLERS = [
  '誠健生物', '澳萃', '圖萌思', '云果', '旭盛', '綠果', '睿兒', '禾口禾口',
  '漢優', '寰品', '自在生物', '虎兒寶', '斯傑利', '定曜', '其樂', '沛祺',
]

const KW_RULES = [
  [/石油|加油站|中油/, '油資', '油資（加油站）'],
  [/餐|小吃|食堂|鍋|爭鮮|和德昌|酒店|美麗華|尚展|幸福食間|快樂一六八|印喬咿|榕屋|緣來|三味|永俐|鮪肚|樂千里|圓昌|蘇杭|石園|六福|茁躍|富利|波西卡|馬越|普立斯|眾旺|茶|咖啡/, '伙食交際', '伙食交際費'],
  [/物流|貨運|運通|速運|報關|順豐/, '物流費用', '其他物流運費'],
  [/印刷/, '印刷品', '印刷品'],
  [/電信|通訊/, '電信', '電信網路'],
  [/廣告/, '廣告費用', '網路廣告'],
  [/網路家庭|果翼|連加|台灣連線|綠界|皇博|商線|誠品|博客來|先科技|利害短網址|華實|鯨躍|關貿|雲時代|酷澎/, '平台費用', '其他平台與服務費'],
]

function readWorkbook(buf) {
  return XLSX.read(buf, { type: 'array' })
}

/** 讀出每個活頁簿的主檔列與品項明細；非財政部格式（加值中心銷項匯出）整本視為銷項 */
async function readBooks(files) {
  const books = []
  const add = (wb) => {
    const mainName = wb.SheetNames.includes('btb411w_xls1') ? 'btb411w_xls1' : wb.SheetNames[0]
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[mainName])
    if (rows.some(isMofRow)) {
      const detailName = wb.SheetNames.find(n => n !== mainName)
      books.push({ mof: true, rows, details: detailName ? XLSX.utils.sheet_to_json(wb.Sheets[detailName]) : [] })
    } else {
      const all = []
      for (const sn of wb.SheetNames) all.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn]))
      books.push({ mof: false, rows: all, details: [] })
    }
  }
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.xlsx?$/i.test(entry.name)) add(readWorkbook(await entry.async('arraybuffer')))
      }
    } else if (/\.xlsx?$/i.test(file.name)) {
      add(readWorkbook(await file.arrayBuffer()))
    }
  }
  return books
}

/**
 * files: File[]（.xls/.xlsx 或內含它們的 .zip）→ { months, salesRows, stats }
 * 自動判斷每一列的方向：進項 → months（月費用）；銷項 → salesRows（交給 aggregateSalesInvoices）
 */
export async function parseInvoiceFiles(files) {
  const agg = {}      // ym|category|label → { amount, sellers:Set }
  const stats = { invoices: 0, voided: 0, goodsTotal: 0, goodsBySeller: {}, months: new Set(), unknownSellers: {}, salesSkipped: 0 }
  const salesRows = []   // 銷項列（賣方＝本公司，或加值中心銷項匯出），不入費用

  const books = await readBooks(files)
  const own = detectOwnTaxId(books.flatMap(bk => (bk.mof ? bk.rows : [])))

  for (const { mof, rows, details } of books) {
    if (!mof) { salesRows.push(...rows); stats.salesSkipped += rows.length; continue }
    const itemsByInv = {}
    for (const d of details) (itemsByInv[d['發票號碼']] ||= []).push(String(d['品名'] || ''))

    for (const r of rows) {
      if (!isMofRow(r)) continue
      const dir = mofDirection(r, own)
      if (dir === 'out') { salesRows.push(r); stats.salesSkipped++; continue }
      if (dir !== 'in') continue
      const status = String(r['發票狀態'] || '')
      if (!status.includes('開立')) { stats.voided++; continue }
      const seller = String(r['賣方名稱'] || '').trim()
      const ym = String(r['發票日期'] || '').slice(0, 7)
      const amt = Number(r['總計']) || 0
      if (!seller || !/^\d{4}-\d{2}$/.test(ym) || !amt) continue
      stats.invoices++
      stats.months.add(ym)

      if (GOODS_SELLERS.some(g => seller.includes(g))) {
        stats.goodsTotal += amt
        stats.goodsBySeller[seller] = (stats.goodsBySeller[seller] || 0) + amt
        continue
      }

      // momo 一律略過：以「momo 對帳單匯入」為準（發票晚一個月且無明細，混用會重複計算）
      if (seller.includes('富邦媒')) { stats.momoSkipped = (stats.momoSkipped || 0) + amt; continue }

      const itemText = (itemsByInv[r['發票號碼']] || [String(r['買受人註記'] || '')]).join('；')
      let cat, label
      if (seller.includes('蝦皮')) {
        if (/廣告儲值金/.test(itemText)) { cat = '廣告費用'; label = '蝦皮 廣告儲值金' }
        else if (/手續費|服務費|運費|推廣費用|包裝寄送|訂閱/.test(itemText)) {
          // 蝦皮手續費略過：銷售資料已於前端內扣 20% 抽成，再記費用會重複計算（淨額口徑）
          stats.shopeeFeeSkipped = (stats.shopeeFeeSkipped || 0) + amt; continue
        }
        else { cat = '辦公'; label = '蝦皮購物採購（待逐筆確認）' }
      } else if (seller.includes('日藥本舖')) {
        if (/獎勵金/.test(itemText)) { cat = '平台費用'; label = '日藥本舖 進貨獎勵金' }
        else if (/物流|管理費|運費/.test(itemText)) { cat = '物流費用'; label = '日藥本舖 物流管理費' }
        else { cat = '廣告費用'; label = '日藥本舖 檔期與推廣' }
      } else if (seller.includes('新竹物流')) { cat = '物流費用'; label = '新竹物流' }
      else if (seller.includes('三井不動產')) { cat = '房租'; label = '南港LALAPORT 櫃位費' }
      else if (seller.includes('震旦行')) { cat = '辦公'; label = '震旦影印機計張費' }
      else if (seller.includes('中華電信')) { cat = '電信'; label = '中華電信' }
      else {
        const kw = KW_RULES.find(([re]) => re.test(seller) || re.test(itemText))
        if (kw) { cat = kw[1]; label = kw[2] }
        else {
          cat = '其他'; label = '其他雜項（發票）'
          stats.unknownSellers[seller] = (stats.unknownSellers[seller] || 0) + amt
        }
      }
      const key = `${ym}|${cat}|${label}`
      ;(agg[key] ||= { amount: 0, sellers: new Set() })
      agg[key].amount += amt
      agg[key].sellers.add(seller.slice(0, 10))
    }
  }

  const months = {}
  for (const [key, d] of Object.entries(agg)) {
    const [ym, category, label] = key.split('|')
    const sellers = [...d.sellers]
    const note = IMPORT_NOTE_PREFIX + (sellers.length > 1 ? `（${sellers.slice(0, 3).join('、')}等${sellers.length}家）` : '')
    ;(months[ym] ||= []).push({ category, label, amount: Math.round(d.amount), note })
  }
  for (const ym of Object.keys(months)) months[ym].sort((a, b) => b.amount - a.amount)
  return { months, salesRows, stats: { ...stats, months: [...stats.months].sort() } }
}

// ─── 費用逐筆比對（匯入預覽用）────────────────────────────────────────────────
const labelOf = (r) => String(r.label || '').trim()
const isImportRow = (r) => String(r.note || '').startsWith(IMPORT_NOTE_PREFIX)
const sameRow = (r, old) => r === old || (!!old.id && r.id === old.id)

/**
 * 比對「既有月費用」與「本次進項發票解析結果」，逐筆分類（不動任何資料）：
 * ・same     同來源列（備註以「來源：進項發票」開頭）、同項目、金額相同 → 略過
 * ・change   同來源列、同項目、金額不同 → 可更新金額
 * ・dupOther 同月已有其他來源（對帳單／請款明細／手動）的同名項目 → 略過，不重複載入
 * ・add      系統沒有 → 新增
 * stale：既有同來源列、本次檔案沒有 → 預設保留（可能是你改過名稱或檔案只是部分匯出），可勾選移除
 */
export function planExpenseMerge(existingByMonth, incomingByMonth, { amountOf = (r) => Number(r.amount) || 0 } = {}) {
  const plan = { months: {}, add: 0, addAmt: 0, change: 0, same: 0, dupOther: 0, stale: 0 }
  for (const ym of Object.keys(incomingByMonth || {}).sort()) {
    const existing = existingByMonth?.[ym] || []
    const own = new Map()
    for (const r of existing) if (isImportRow(r) && !own.has(labelOf(r))) own.set(labelOf(r), r)
    const others = new Map()
    for (const r of existing) if (!isImportRow(r) && !others.has(labelOf(r))) others.set(labelOf(r), r)
    const incoming = incomingByMonth[ym]
    const labels = new Set(incoming.map(labelOf))
    const rows = incoming.map(item => {
      const other = others.get(labelOf(item))
      if (other) return { kind: 'dupOther', item, old: other, oldAmt: Math.round(amountOf(other)) }
      const old = own.get(labelOf(item))
      if (!old) return { kind: 'add', item }
      const oldAmt = Math.round(amountOf(old))
      return { kind: oldAmt === item.amount ? 'same' : 'change', item, old, oldAmt }
    })
    const stale = existing.filter(r => isImportRow(r) && !labels.has(labelOf(r)))
      .map(r => ({ old: r, oldAmt: Math.round(amountOf(r)) }))
    plan.months[ym] = { rows, stale }
    for (const p of rows) {
      plan[p.kind]++
      if (p.kind === 'add') plan.addAmt += p.item.amount
    }
    plan.stale += stale.length
  }
  return plan
}

/** 預覽勾選的預設值：新增與更新預設勾選；「檔案未含」的既有列預設不移除 */
export const expenseDefaultChecked = (kind) => kind === 'add' || kind === 'change'

/**
 * 依 plan 與勾選狀態產生要寫回的月份資料 { ym: rows }（只含有異動的月份）。
 * isChecked(ym, kind, label)：kind 為 'add'｜'change'｜'stale'（stale 勾選＝移除）
 */
export function applyExpenseMerge(existingByMonth, plan, { genId, isChecked = (ym, kind) => expenseDefaultChecked(kind) } = {}) {
  const out = {}
  const done = { add: 0, addAmt: 0, change: 0, removed: 0 }
  for (const [ym, m] of Object.entries(plan.months)) {
    let rows = [...(existingByMonth?.[ym] || [])]
    let touched = false
    for (const p of m.rows) {
      if (p.kind === 'add' && isChecked(ym, 'add', labelOf(p.item))) {
        rows.push({ ...p.item, id: genId(), count: '', unitCost: '' })
        done.add++; done.addAmt += p.item.amount; touched = true
      } else if (p.kind === 'change' && isChecked(ym, 'change', labelOf(p.item))) {
        // 金額以發票為準：清掉數量×單價，否則畫面仍會用舊的乘積
        rows = rows.map(r => (!sameRow(r, p.old) ? r : { ...r, amount: p.item.amount, note: p.item.note, count: '', unitCost: '' }))
        done.change++; touched = true
      }
    }
    for (const st of m.stale) {
      if (isChecked(ym, 'stale', labelOf(st.old))) {
        rows = rows.filter(r => !sameRow(r, st.old))
        done.removed++; touched = true
      }
    }
    if (touched) out[ym] = rows
  }
  return { months: out, done }
}

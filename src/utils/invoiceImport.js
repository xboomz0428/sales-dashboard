import * as XLSX from 'xlsx'

/**
 * invoiceImport.js — 財政部「進項發票」匯出檔（IN 檔 xls/xlsx）→ 月費用自動分類
 * 與 2026-09 首次人工匯入使用同一套規則：
 * ・進貨（商品成本）排除，只入營運費用
 * ・蝦皮拆三類：廣告儲值→廣告費用｜手續費/服務費→平台費用｜平台購物→辦公（待確認）
 * ・momo 拆二類：廣告/行銷贊助→廣告費用｜服務管理費→平台費用
 * ・日藥本舖拆三類：物流管理→物流費用｜檔期推廣→廣告費用｜進貨獎勵金→平台費用
 * 匯入端以 note 前綴「來源：進項發票」做冪等（重匯同月自動先清舊列）。
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

/** files: File[]（瀏覽器）→ { months, stats } */
export async function parseInvoiceFiles(files) {
  const agg = {}      // ym|category|label → { amount, sellers:Set }
  const stats = { invoices: 0, voided: 0, goodsTotal: 0, goodsBySeller: {}, months: new Set(), unknownSellers: {} }

  for (const file of files) {
    const wb = readWorkbook(await file.arrayBuffer())
    const main = wb.Sheets['btb411w_xls1'] || wb.Sheets[wb.SheetNames[0]]
    const detailName = wb.SheetNames.find(n => n !== 'btb411w_xls1')
    const details = detailName ? XLSX.utils.sheet_to_json(wb.Sheets[detailName]) : []
    const itemsByInv = {}
    for (const d of details) (itemsByInv[d['發票號碼']] ||= []).push(String(d['品名'] || ''))

    for (const r of XLSX.utils.sheet_to_json(main)) {
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
        else if (/手續費|服務費|運費|推廣費用|包裝寄送|訂閱/.test(itemText)) { cat = '平台費用'; label = '蝦皮 手續費與服務費' }
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
  return { months, stats: { ...stats, months: [...stats.months].sort() } }
}

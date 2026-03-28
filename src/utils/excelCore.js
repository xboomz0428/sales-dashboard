/**
 * excelCore.js
 * 核心解析邏輯，同時被主執行緒（dataProcessor）和 Web Worker（excelWorker）使用
 */
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

export const FIELD_MAP = {
  date:          ['銷貨日期', '日期', 'Date', 'date'],
  channel:       ['網路/實體', '通路', '銷售通路', 'Channel'],
  channelType:   ['通路類型', '通路種類', 'ChannelType'],
  brand:         ['品牌', 'Brand', 'brand'],
  agentType:     ['代理經銷', '代理類型', '商品類型', 'AgentType'],
  quantity:      ['數量', 'Qty', 'Quantity', 'quantity'],
  subtotal:      ['小計', 'Subtotal', 'subtotal'],
  total:         ['合計', 'Total', 'total'],
  discountRate:  ['折扣率', '折扣', 'Discount'],
  originalPrice: ['原價', 'OriginalPrice'],
  product:       ['產品', '商品', '品名', 'Product', '產品名稱', '商品名稱'],
  orderId:       ['訂單編號', 'OrderID', 'Order', '單號'],
  customer:      ['客戶名稱', '客戶', '通路商', 'Customer', 'client', '買家', '收件人', '客戶代碼'],
}

export function findColumn(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h && h.toString().trim() === c)
    if (idx !== -1) return idx
  }
  for (const c of candidates) {
    const idx = headers.findIndex(h => h && h.toString().includes(c))
    if (idx !== -1) return idx
  }
  return -1
}

export function parseNumeric(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return value
  let str = value.toString().trim().replace(/,/g, '')
  if (str.startsWith('(') && str.endsWith(')')) str = '-' + str.slice(1, -1)
  const parsed = parseFloat(str)
  return isNaN(parsed) ? 0 : parsed
}

export function parseDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      return dayjs(`${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`)
    }
  }
  const str = value.toString().trim()
  const d = dayjs(str.replace(/\//g, '-'))
  return d.isValid() ? d : null
}

/**
 * 解析 ArrayBuffer，回傳 { rows, meta }
 * 此函式設計為可在 Web Worker 中執行
 */
export function parseBuffer(buffer) {
  const data = new Uint8Array(buffer)
  const workbook = XLSX.read(data, {
    type:      'array',
    cellDates: false,
    dense:     true,
    sheets:    0,       // 只解析第一個工作表
  })

  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rawData   = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true })

  if (rawData.length < 2) throw new Error('檔案資料不足')

  const headers = rawData[0].map(h => h ? h.toString().trim() : '')

  const colIdx = {}
  for (const [key, candidates] of Object.entries(FIELD_MAP)) {
    colIdx[key] = findColumn(headers, candidates)
  }

  const rows = []
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.length === 0) continue

    const parsedDate = parseDate(colIdx.date >= 0 ? row[colIdx.date] : null)
    if (!parsedDate) continue

    const subtotal      = colIdx.subtotal      >= 0 ? parseNumeric(row[colIdx.subtotal])      : 0
    const total         = colIdx.total         >= 0 ? parseNumeric(row[colIdx.total])         : 0
    const quantity      = colIdx.quantity      >= 0 ? parseNumeric(row[colIdx.quantity])      : 0
    const originalPrice = colIdx.originalPrice >= 0 ? parseNumeric(row[colIdx.originalPrice]) : 0

    let discountRate = 0
    if (colIdx.discountRate >= 0 && row[colIdx.discountRate] != null) {
      discountRate = parseFloat(row[colIdx.discountRate]) || 0
      if (discountRate > 1) discountRate = discountRate / 100
    } else if (originalPrice > 0 && subtotal > 0) {
      discountRate = 1 - (subtotal / originalPrice)
    }

    const str   = (v) => (v || '').toString().trim()
    const orderId     = str(colIdx.orderId     >= 0 ? row[colIdx.orderId]     : '')
    const channel     = str(colIdx.channel     >= 0 ? row[colIdx.channel]     : '')
    const channelType = str(colIdx.channelType >= 0 ? row[colIdx.channelType] : '')
    const brand       = str(colIdx.brand       >= 0 ? row[colIdx.brand]       : '')
    const agentType   = str(colIdx.agentType   >= 0 ? row[colIdx.agentType]   : '')
    const product     = str(colIdx.product     >= 0 ? row[colIdx.product]     : '')
    const customer    = str(colIdx.customer    >= 0 ? row[colIdx.customer]    : '')
    const dateStr     = parsedDate.format('YYYY-MM-DD')

    const _key = orderId
      ? `id:${orderId}|prod:${product}|sub:${subtotal}|qty:${quantity}`
      : `${dateStr}|${channel}|${channelType}|${brand}|${product}|${customer}|${subtotal}|${quantity}`

    rows.push({
      date: dateStr,
      yearMonth: parsedDate.format('YYYY-MM'),
      year:  parsedDate.year().toString(),
      month: String(parsedDate.month() + 1).padStart(2, '0'),
      channel, channelType, brand, agentType, product, orderId, customer,
      quantity, subtotal, total, discountRate,
      _key,
    })
  }

  // 檔案內去重
  const seenKeys   = new Set()
  const dedupedRows = []
  for (const row of rows) {
    if (!seenKeys.has(row._key)) {
      seenKeys.add(row._key)
      dedupedRows.push(row)
    }
  }

  const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()
  return {
    rows: dedupedRows,
    meta: {
      years:        unique(dedupedRows.map(r => r.year)),
      channels:     unique(dedupedRows.map(r => r.channel)),
      channelTypes: unique(dedupedRows.map(r => r.channelType)),
      brands:       unique(dedupedRows.map(r => r.brand)),
      agentTypes:   unique(dedupedRows.map(r => r.agentType)),
      customers:    unique(dedupedRows.map(r => r.customer)),
      products:     unique(dedupedRows.map(r => r.product)),
      totalRows:    dedupedRows.length,
    },
  }
}

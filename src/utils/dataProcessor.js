import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

const FIELD_MAP = {
  date: ['銷貨日期', '日期', 'Date', 'date'],
  channel: ['網路/實體', '通路', '銷售通路', 'Channel'],
  channelType: ['通路類型', '通路種類', 'ChannelType'],
  brand: ['品牌', 'Brand', 'brand'],
  agentType: ['代理經銷', '代理類型', '商品類型', 'AgentType'],
  quantity: ['數量', 'Qty', 'Quantity', 'quantity'],
  subtotal: ['小計', 'Subtotal', 'subtotal'],
  total: ['合計', 'Total', 'total'],
  discountRate: ['折扣率', '折扣', 'Discount'],
  originalPrice: ['原價', 'OriginalPrice'],
  product: ['產品', '商品', '品名', 'Product', '產品名稱', '商品名稱'],
  orderId: ['訂單編號', 'OrderID', 'Order', '單號'],
  customer: ['客戶名稱', '客戶', '通路商', 'Customer', 'client', '買家', '收件人', '客戶代碼'],
}

function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h && h.toString().trim() === candidate)
    if (idx !== -1) return idx
  }
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h && h.toString().includes(candidate))
    if (idx !== -1) return idx
  }
  return -1
}

function parseDate(value) {
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

export function processExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array', cellDates: false })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true })

        if (rawData.length < 2) { reject(new Error('檔案資料不足')); return }

        const headers = rawData[0].map(h => h ? h.toString().trim() : '')

        const colIdx = {}
        for (const [key, candidates] of Object.entries(FIELD_MAP)) {
          colIdx[key] = findColumn(headers, candidates)
        }

        const rows = []
        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i]
          if (!row || row.length === 0) continue

          const dateVal = colIdx.date >= 0 ? row[colIdx.date] : null
          const parsedDate = parseDate(dateVal)
          if (!parsedDate) continue

          const subtotal = colIdx.subtotal >= 0 ? parseFloat(row[colIdx.subtotal]) || 0 : 0
          const total = colIdx.total >= 0 ? parseFloat(row[colIdx.total]) || 0 : 0
          const quantity = colIdx.quantity >= 0 ? parseFloat(row[colIdx.quantity]) || 0 : 0
          const originalPrice = colIdx.originalPrice >= 0 ? parseFloat(row[colIdx.originalPrice]) || 0 : 0

          let discountRate = 0
          if (colIdx.discountRate >= 0 && row[colIdx.discountRate] != null) {
            discountRate = parseFloat(row[colIdx.discountRate]) || 0
            if (discountRate > 1) discountRate = discountRate / 100
          } else if (originalPrice > 0 && subtotal > 0) {
            discountRate = 1 - (subtotal / originalPrice)
          }

          const orderId = colIdx.orderId >= 0 ? (row[colIdx.orderId] || '').toString().trim() : ''
          const channel = colIdx.channel >= 0 ? (row[colIdx.channel] || '').toString().trim() : ''
          const channelType = colIdx.channelType >= 0 ? (row[colIdx.channelType] || '').toString().trim() : ''
          const brand = colIdx.brand >= 0 ? (row[colIdx.brand] || '').toString().trim() : ''
          const agentType = colIdx.agentType >= 0 ? (row[colIdx.agentType] || '').toString().trim() : ''
          const product = colIdx.product >= 0 ? (row[colIdx.product] || '').toString().trim() : ''
          const customer = colIdx.customer >= 0 ? (row[colIdx.customer] || '').toString().trim() : ''
          const dateStr = parsedDate.format('YYYY-MM-DD')

          const _key = orderId
            ? `id:${orderId}`
            : `${dateStr}|${channel}|${channelType}|${brand}|${product}|${customer}|${subtotal}|${quantity}`

          rows.push({
            date: dateStr,
            yearMonth: parsedDate.format('YYYY-MM'),
            year: parsedDate.year().toString(),
            month: String(parsedDate.month() + 1).padStart(2, '0'),
            channel, channelType, brand, agentType, product, orderId, customer,
            quantity, subtotal, total, discountRate,
            _key,
          })
        }

        const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()
        resolve({
          rows,
          meta: {
            years: unique(rows.map(r => r.year)),
            channels: unique(rows.map(r => r.channel)),
            channelTypes: unique(rows.map(r => r.channelType)),
            brands: unique(rows.map(r => r.brand)),
            agentTypes: unique(rows.map(r => r.agentType)),
            customers: unique(rows.map(r => r.customer)),
            products: unique(rows.map(r => r.product)),
            totalRows: rows.length,
          },
        })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsArrayBuffer(file)
  })
}

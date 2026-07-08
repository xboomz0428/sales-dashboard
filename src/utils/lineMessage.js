// ─── LINE 訊息格式化工具 ─────────────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0')
const WEEKDAYS = ['日','一','二','三','四','五','六']

function fmtDate(d = new Date()) {
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} (週${WEEKDAYS[d.getDay()]})`
}

function fmtMoney(v) {
  if (!v && v !== 0) return '—'
  return `NT$ ${Math.round(v).toLocaleString()}`
}

function arrow(v) {
  if (v > 0) return `🔼 +${fmtMoney(v)}`
  if (v < 0) return `🔽 ${fmtMoney(v)}`
  return '➡️ 持平'
}

function pct(a, b) {
  if (!b) return ''
  const p = ((a - b) / b) * 100
  return `（${p >= 0 ? '+' : ''}${p.toFixed(1)}%）`
}

// ─── 每日業績報告 ────────────────────────────────────────────────────────────
// salesData: { summary, trendData, productData, customerData, brandData }
// allRows: 完整資料列
export function formatDailySalesReport({ summary, trendData, productData, customerData, brandData, allRows }) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // 今日資料
  const todayRows = (allRows || []).filter(r => r.date === todayStr)
  const todayAmt  = todayRows.reduce((s, r) => s + (r.subtotal || 0), 0)
  const todayQty  = todayRows.length

  // 昨日
  const yd = new Date(today); yd.setDate(yd.getDate() - 1)
  const ydStr = yd.toISOString().slice(0, 10)
  const ydAmt = (allRows || []).filter(r => r.date === ydStr).reduce((s, r) => s + (r.subtotal || 0), 0)

  // 本月累計（trendData 最後一筆）
  const monthAmt = summary?.total || 0

  // 今日最高客戶
  const custMap = {}
  todayRows.forEach(r => { if (r.customer) custMap[r.customer] = (custMap[r.customer]||0) + (r.subtotal||0) })
  const topCust = Object.entries(custMap).sort((a,b) => b[1]-a[1])[0]

  // 今日最高品牌
  const brandMap = {}
  todayRows.forEach(r => { if (r.brand) brandMap[r.brand] = (brandMap[r.brand]||0) + (r.subtotal||0) })
  const topBrand = Object.entries(brandMap).sort((a,b) => b[1]-a[1])[0]

  const diff = todayAmt - ydAmt

  let msg = `📊 每日業績報告\n`
  msg += `📅 ${fmtDate(today)}\n`
  msg += `${'─'.repeat(22)}\n`

  if (todayAmt > 0) {
    msg += `💰 今日業績：${fmtMoney(todayAmt)}\n`
    msg += `📦 今日訂單：${todayQty} 筆\n`
    if (topCust)  msg += `👑 最高客戶：${topCust[0]}（${fmtMoney(topCust[1])}）\n`
    if (topBrand) msg += `🏷️  最高品牌：${topBrand[0]}（${fmtMoney(topBrand[1])}）\n`
    msg += `${'─'.repeat(22)}\n`
    msg += `📈 本月累計：${fmtMoney(monthAmt)}\n`
    if (ydAmt > 0) msg += `${arrow(diff)} 較昨日${pct(todayAmt, ydAmt)}\n`
  } else {
    msg += `今日尚無銷售記錄\n`
    msg += `${'─'.repeat(22)}\n`
    msg += `📈 本月累計：${fmtMoney(monthAmt)}\n`
  }

  msg += `\n🤖 銷售分析系統自動發送`
  return msg
}

// ─── 每週對帳進度報告 ────────────────────────────────────────────────────────
// invoiceRecords: { 'YYYY-MM': [...] }
export function formatWeeklyInvoiceReport({ invoiceRecords }) {
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth()+1)}`

  // 本月所有發票
  const items = Object.values(invoiceRecords || {}).flat()
  const monthItems = (invoiceRecords?.[thisMonth] || [])

  const totalAmt     = monthItems.reduce((s,r) => s + (r.amount||0), 0)
  const confirmedAmt = monthItems.filter(r => r.status === 'confirmed' || r.status === 'partial')
                                  .reduce((s,r) => s + (r.confirmedAmount ?? r.amount ?? 0), 0)
  const pendingAmt   = monthItems.filter(r => r.status === 'pending').reduce((s,r) => s + (r.amount||0), 0)
  const overdueList  = monthItems.filter(r => r.status === 'overdue')
  const overdueAmt   = overdueList.reduce((s,r) => s + (r.amount||0), 0)

  const confirmedCount = monthItems.filter(r => r.status === 'confirmed' || r.status === 'partial').length
  const pendingCount   = monthItems.filter(r => r.status === 'pending').length
  const rate = totalAmt > 0 ? Math.round((confirmedAmt / totalAmt) * 100) : 0

  // 跨月份逾期（所有月份）
  const allOverdue = items.filter(r => r.status === 'overdue')

  let msg = `📋 週報：對帳進度\n`
  msg += `📅 ${today.getFullYear()}年${today.getMonth()+1}月份\n`
  msg += `${'─'.repeat(22)}\n`
  msg += `🧾 發票總額：${fmtMoney(totalAmt)}（${monthItems.length} 張）\n`
  msg += `✅ 已入帳：${fmtMoney(confirmedAmt)}（${confirmedCount} 張）${rate ? ` ${rate}%` : ''}\n`
  msg += `⏳ 待入帳：${fmtMoney(pendingAmt)}（${pendingCount} 張）\n`

  if (overdueList.length > 0) {
    msg += `${'─'.repeat(22)}\n`
    msg += `⚠️ 逾期未入帳（${overdueList.length} 張）：\n`
    overdueList.slice(0, 5).forEach(r => {
      msg += `• ${r.store}  ${r.invoiceNo || '—'}\n  ${fmtMoney(r.amount)}\n`
    })
    if (overdueList.length > 5) msg += `…還有 ${overdueList.length - 5} 張\n`
  } else {
    msg += `${'─'.repeat(22)}\n`
    msg += `🎉 本月目前無逾期發票！\n`
  }

  // 跨月逾期追加
  const crossMonth = allOverdue.filter(r => r.issueDate?.slice(0,7) !== thisMonth)
  if (crossMonth.length > 0) {
    msg += `\n📌 跨月逾期（${crossMonth.length} 張）：\n`
    crossMonth.slice(0, 3).forEach(r => {
      msg += `• [${r.issueDate?.slice(0,7)}] ${r.store} ${fmtMoney(r.amount)}\n`
    })
  }

  msg += `\n🤖 銷售分析系統自動發送`
  return msg
}

// ─── 每月經營月報 ────────────────────────────────────────────────────────────
// allRows: 完整資料列；costs: { 品名: 單位成本 }（可選，用於毛利）
// 規則：預設報「上一個日曆月」；該月無資料時退回資料中最新有資料的月份。
export function formatMonthlyReport({ allRows = [], costs = {} }) {
  if (!allRows.length) return '（尚無銷售資料）'

  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  let ym = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`

  const months = [...new Set(allRows.map(r => r.yearMonth))].sort()
  if (!months.includes(ym)) ym = months[months.length - 1]   // 退回最新有資料的月份

  const [y, m] = ym.split('-').map(Number)
  const prevYM = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
  const yoyYM  = `${y - 1}-${pad(m)}`

  const inMonth  = allRows.filter(r => r.yearMonth === ym)
  const sum = rows => rows.reduce((s, r) => s + (r.subtotal || 0), 0)
  const rev     = sum(inMonth)
  const revPrev = sum(allRows.filter(r => r.yearMonth === prevYM))
  const revYoY  = sum(allRows.filter(r => r.yearMonth === yoyYM))
  const qty     = inMonth.reduce((s, r) => s + (r.quantity || 0), 0)
  const orders  = inMonth.length

  // 年累計 + 去年同期累計
  const ytd     = sum(allRows.filter(r => r.year === String(y) && r.yearMonth <= ym))
  const ytdPrev = sum(allRows.filter(r => r.year === String(y - 1) && r.yearMonth <= yoyYM))

  // 毛利（僅含已設定成本的商品）
  let cost = 0, coveredRev = 0
  inMonth.forEach(r => {
    const c = costs[r.product]
    if (c != null && !isNaN(c)) { cost += (r.quantity || 0) * c; coveredRev += r.subtotal || 0 }
  })
  const margin = coveredRev > 0 ? (coveredRev - cost) / coveredRev : null

  const top = (key, n = 3) => {
    const map = {}
    inMonth.forEach(r => { const k = r[key]; if (k) map[k] = (map[k] || 0) + (r.subtotal || 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
  }

  let msg = `📊 ${y}年${m}月 經營月報\n${'─'.repeat(22)}\n`
  msg += `💰 月營收：${fmtMoney(rev)}\n`
  if (revYoY  > 0) msg += `　vs 去年同月 ${pct(rev, revYoY).replace(/[（）]/g, '')}（${fmtMoney(revYoY)}）\n`
  if (revPrev > 0) msg += `　vs 上月 ${pct(rev, revPrev).replace(/[（）]/g, '')}（${fmtMoney(revPrev)}）\n`
  msg += `📦 數量 ${Math.round(qty).toLocaleString()} 件｜訂單 ${orders.toLocaleString()} 筆\n`
  if (margin != null) msg += `📈 毛利率 ${(margin * 100).toFixed(1)}%（含成本商品營收 ${fmtMoney(coveredRev)}）\n`
  msg += `${'─'.repeat(22)}\n`
  msg += `📅 ${y}年累計：${fmtMoney(ytd)}`
  msg += ytdPrev > 0 ? `（同比 ${pct(ytd, ytdPrev).replace(/[（）]/g, '')}）\n` : `\n`
  msg += `${'─'.repeat(22)}\n`
  const secs = [['🏷️ 品牌 Top3', top('brand')], ['⭐ 商品 Top3', top('product')], ['👑 客戶 Top3', top('customer')]]
  secs.forEach(([title, list]) => {
    if (!list.length) return
    msg += `${title}\n`
    list.forEach(([name, amt], i) => {
      const label = name.length > 18 ? name.slice(0, 18) + '…' : name
      msg += `${i + 1}. ${label} ${fmtMoney(amt)}\n`
    })
  })
  msg += `\n🤖 銷售分析系統自動發送`
  return msg
}

// ─── 傳送至 LINE（透過 Supabase Edge Function）──────────────────────────────
// 需在 Supabase 部署 Edge Function（見設定頁說明）
export async function sendToLine({ supabaseUrl, channelToken, targetId, message }) {
  if (!supabaseUrl || !channelToken || !targetId) {
    throw new Error('請先完成 LINE 設定（Channel Token 及 User/Group ID）')
  }

  // 透過 Supabase Edge Function 轉發（避免 CORS 問題）
  const edgeFnUrl = `${supabaseUrl}/functions/v1/line-push`
  const res = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelToken, targetId, message }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`發送失敗：${err}`)
  }
  return true
}

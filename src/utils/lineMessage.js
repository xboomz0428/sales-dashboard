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

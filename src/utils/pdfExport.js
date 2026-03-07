import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/* ═══════════════════════════════════════════════════════════════
   共用工具
═══════════════════════════════════════════════════════════════ */
const fmtN = v => {
  if (!v && v !== 0) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + ' 億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}
const fmtPct = (cur, prev) => {
  if (!prev) return ''
  const p = (cur - prev) / prev * 100
  return (p >= 0 ? '+' : '') + p.toFixed(0) + '%'
}
function esc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* 色階：白 → 色，pct 0~1 */
function heatColor(pct, r = 37, g = 99, b = 235) {
  const a = Math.round(pct * 220)
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`
}

/* 橫向 bar（div） */
function hBar(pct, color = '#3B82F6', h = 7) {
  const w = Math.min(100, Math.max(0, pct))
  return `<div style="background:#e5e7eb;border-radius:${h}px;height:${h}px;overflow:hidden;width:100%">
    <div style="background:${color};height:${h}px;width:${w}%;border-radius:${h}px"></div></div>`
}

/* 色帶 section header */
function secHeader(title, sub, color) {
  return `<div style="background:linear-gradient(135deg,${color},${color}bb);color:white;padding:16px 22px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:15px;font-weight:900">${esc(title)}</div>
      ${sub ? `<div style="font-size:10px;opacity:.7;margin-top:2px">${esc(sub)}</div>` : ''}
    </div>
    <div style="font-size:10px;opacity:.55">${new Date().toLocaleDateString('zh-TW')}</div>
  </div>`
}

/* section 外框 */
function secCard(inner, color) {
  return `<div style="border-radius:12px;overflow:hidden;border:1.5px solid ${color}30;margin-bottom:18px;background:white">${inner}</div>`
}

/* 迷你排行（含 bar），用於封面 */
function miniRank(items, color, maxRows = 5) {
  const maxV = items[0]?.subtotal || 1
  const total = items.reduce((s, d) => s + (d.subtotal || 0), 0)
  return items.slice(0, maxRows).map((d, i) => {
    const pct = total > 0 ? d.subtotal / total * 100 : 0
    const barW = d.subtotal / maxV * 100
    const rankBg = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#e5e7eb'
    const rankFg = i < 3 ? '#fff' : '#6b7280'
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 10px;text-align:center;width:28px">
        <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${rankBg};color:${rankFg};font-size:10px;font-weight:800;line-height:20px;text-align:center">${i + 1}</span>
      </td>
      <td style="padding:6px 8px;font-size:11px;font-weight:600;color:#1f2937;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827;white-space:nowrap">${fmtN(d.subtotal)}</td>
      <td style="padding:6px 8px;text-align:right;font-size:10px;color:#9ca3af;white-space:nowrap">${pct.toFixed(0)}%</td>
      <td style="padding:6px 8px;min-width:70px">${hBar(barW, color, 6)}</td>
    </tr>`
  }).join('')
}

/* ═══════════════════════════════════════════════════════════════
   封面頁（KPI + 快速排行 + 通路摘要）
═══════════════════════════════════════════════════════════════ */
function renderCoverHTML({ summary = {}, trendData = [], comparisonData, productData = [], customerData = [], brandData = [], channelData = [], channelTypeData = [] }) {
  const { totalSales = 0, totalQty = 0, orderCount = 0, customerCount = 0, productCount = 0 } = summary
  const months = trendData.map(d => d.yearMonth).sort()
  const avg = trendData.length > 0 ? Math.round(totalSales / trendData.length) : 0
  const peak = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal >= b.subtotal ? a : b) : null
  const low  = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal <= b.subtotal ? a : b) : null
  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })

  // YoY summary from comparisonData
  const byYear = comparisonData?.byYear || []
  const latestYear = byYear[byYear.length - 1]
  const prevYear   = byYear[byYear.length - 2]
  const yoyChg = latestYear && prevYear ? fmtPct(latestYear.subtotal, prevYear.subtotal) : null

  // Channel type total
  const ctTotal = channelTypeData.reduce((s, d) => s + (d.subtotal || 0), 0)

  const kpis = [
    { label: '總銷售金額', value: `NT$ ${fmtN(totalSales)}`, color: '#2563eb' },
    { label: '年增率',     value: yoyChg || '—',             color: yoyChg?.startsWith('+') ? '#059669' : '#ef4444' },
    { label: '銷售數量',   value: Math.round(totalQty).toLocaleString() + ' 件', color: '#059669' },
    { label: '訂單筆數',   value: Math.round(orderCount).toLocaleString() + ' 筆', color: '#7c3aed' },
    { label: '客戶數',     value: customerCount ? Math.round(customerCount).toLocaleString() : '—', color: '#d97706' },
    { label: '月均銷售',   value: `NT$ ${fmtN(avg)}`,        color: '#0891b2' },
    { label: '品項數',     value: productCount ? Math.round(productCount).toLocaleString() : '—', color: '#e11d48' },
    { label: '分析月數',   value: months.length + ' 個月',   color: '#6366f1' },
  ]

  return `
  <!-- 封面 header -->
  <div style="background:linear-gradient(150deg,#0f172a 0%,#1e3a8a 45%,#2563eb 100%);padding:34px 30px;border-radius:14px;margin-bottom:16px;color:white">
    <div style="font-size:10px;opacity:.5;font-weight:700;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px">銷售數據分析系統 — 完整報告</div>
    <div style="font-size:28px;font-weight:900;margin-bottom:4px">Sales Performance Report</div>
    <div style="font-size:12px;opacity:.6;margin-bottom:20px">產生日期：${dateStr}</div>
    <div style="display:inline-flex;gap:20px;background:rgba(255,255,255,.12);border-radius:10px;padding:10px 16px">
      <div><div style="font-size:9px;opacity:.6;margin-bottom:2px">分析週期</div><div style="font-size:13px;font-weight:700">${months[0] || '—'} ～ ${months[months.length - 1] || '—'}</div></div>
      ${peak ? `<div style="width:1px;background:rgba(255,255,255,.2)"></div>
      <div><div style="font-size:9px;opacity:.6;margin-bottom:2px">最高月份</div><div style="font-size:13px;font-weight:700">${peak.yearMonth}（${fmtN(peak.subtotal)}）</div></div>` : ''}
      ${low ? `<div style="width:1px;background:rgba(255,255,255,.2)"></div>
      <div><div style="font-size:9px;opacity:.6;margin-bottom:2px">最低月份</div><div style="font-size:13px;font-weight:700">${low.yearMonth}（${fmtN(low.subtotal)}）</div></div>` : ''}
    </div>
  </div>

  <!-- 8 KPI 卡 -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${kpis.map(k => `
    <div style="border-radius:10px;border:1.5px solid ${k.color}25;overflow:hidden">
      <div style="height:3px;background:${k.color}"></div>
      <div style="padding:10px 12px">
        <div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600">${k.label}</div>
        <div style="font-size:16px;font-weight:900;color:#111827;line-height:1.1">${k.value}</div>
      </div>
    </div>`).join('')}
  </div>

  <!-- 三欄：Top 產品 / Top 客戶 / 通路分布 -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
    <!-- Top 5 產品 -->
    <div style="border-radius:10px;border:1.5px solid #e11d4820;overflow:hidden">
      <div style="background:#fef2f2;padding:8px 10px;font-size:11px;font-weight:700;color:#991b1b;border-bottom:1px solid #fecaca">🏷️ 產品 TOP 5</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${miniRank(productData, '#e11d48', 5)}</tbody>
      </table>
    </div>
    <!-- Top 5 客戶 -->
    <div style="border-radius:10px;border:1.5px solid #0891b220;overflow:hidden">
      <div style="background:#ecfeff;padding:8px 10px;font-size:11px;font-weight:700;color:#0e7490;border-bottom:1px solid #a5f3fc">👥 客戶 TOP 5</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${miniRank(customerData, '#0891b2', 5)}</tbody>
      </table>
    </div>
    <!-- 通路類型分布 -->
    <div style="border-radius:10px;border:1.5px solid #d9780620;overflow:hidden">
      <div style="background:#fffbeb;padding:8px 10px;font-size:11px;font-weight:700;color:#92400e;border-bottom:1px solid #fde68a">🏪 通路類型分布</div>
      <div style="padding:8px 10px">
        ${channelTypeData.slice(0, 6).map(d => {
          const pct = ctTotal > 0 ? d.subtotal / ctTotal * 100 : 0
          return `<div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">
              <span style="font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px">${esc(d.name)}</span>
              <span style="color:#6b7280;font-family:monospace">${fmtN(d.subtotal)} (${pct.toFixed(0)}%)</span>
            </div>
            ${hBar(pct, '#d97706', 5)}
          </div>`
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Top 3 品牌 + 年度趨勢摘要 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <!-- Top 5 品牌 -->
    <div style="border-radius:10px;border:1.5px solid #7c3aed20;overflow:hidden">
      <div style="background:#faf5ff;padding:8px 10px;font-size:11px;font-weight:700;color:#6b21a8;border-bottom:1px solid #e9d5ff">✨ 品牌 TOP 5</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${miniRank(brandData, '#7c3aed', 5)}</tbody>
      </table>
    </div>
    <!-- 歷年摘要 -->
    <div style="border-radius:10px;border:1.5px solid #05966920;overflow:hidden">
      <div style="background:#f0fdf4;padding:8px 10px;font-size:11px;font-weight:700;color:#166534;border-bottom:1px solid #bbf7d0">📅 歷年銷售摘要</div>
      <table style="width:100%;border-collapse:collapse">
        ${byYear.slice(-5).map((r, i, arr) => {
          const prev = arr[i - 1]
          const chg = prev ? fmtPct(r.subtotal, prev.subtotal) : ''
          const isPos = chg.startsWith('+')
          const maxV = Math.max(...arr.map(x => x.subtotal))
          return `<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#1f2937">${r.year}</td>
            <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827">${fmtN(r.subtotal)}</td>
            <td style="padding:6px 8px;text-align:right;font-size:10px;font-weight:700;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'};white-space:nowrap">${chg || '基準'}</td>
            <td style="padding:6px 8px;min-width:60px">${hBar(r.subtotal / maxV * 100, '#059669', 6)}</td>
          </tr>`
        }).join('')}
      </table>
    </div>
  </div>`
}

/* ═══════════════════════════════════════════════════════════════
   月份趨勢
═══════════════════════════════════════════════════════════════ */
function renderTrendHTML({ trendData = [] }) {
  if (!trendData.length) return ''
  const sorted = [...trendData].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  const recent = sorted.slice(-24)
  const maxVal = Math.max(...recent.map(d => d.subtotal))

  const rows = recent.map((d, i) => {
    const prev = recent[i - 1]
    const chg = prev ? fmtPct(d.subtotal, prev.subtotal) : ''
    const isPos = chg.startsWith('+')
    const barW = maxVal > 0 ? d.subtotal / maxVal * 100 : 0
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:7px 14px;font-size:12px;font-weight:600;color:#374151">${d.yearMonth}</td>
      <td style="padding:7px 14px;text-align:right;font-size:12px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(d.subtotal)}</td>
      <td style="padding:7px 14px;text-align:right;font-size:12px;color:#6b7280;font-family:monospace">${Math.round(d.quantity).toLocaleString()}</td>
      <td style="padding:7px 14px;text-align:right;font-size:12px;font-weight:700;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'}">${chg || '—'}</td>
      <td style="padding:7px 14px;min-width:110px">${hBar(barW, '#059669', 7)}</td>
    </tr>`
  }).join('')

  return secCard(
    secHeader('月份趨勢分析', `最近 ${recent.length} 個月`, '#059669') +
    `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f0fdf4;border-bottom:2px solid #bbf7d0">
        <th style="padding:9px 14px;text-align:left;font-size:10px;color:#166534;font-weight:700">月份</th>
        <th style="padding:9px 14px;text-align:right;font-size:10px;color:#166534;font-weight:700">銷售金額</th>
        <th style="padding:9px 14px;text-align:right;font-size:10px;color:#166534;font-weight:700">數量（件）</th>
        <th style="padding:9px 14px;text-align:right;font-size:10px;color:#166534;font-weight:700">月增率</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;color:#166534;font-weight:700">相對規模</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`,
    '#059669'
  )
}

/* ═══════════════════════════════════════════════════════════════
   年度對比
═══════════════════════════════════════════════════════════════ */
function renderComparisonHTML({ comparisonData }) {
  const byYear = comparisonData?.byYear || []
  const byQuarter = comparisonData?.byQuarter || []
  if (!byYear.length) return ''

  const maxVal = Math.max(...byYear.map(d => d.subtotal))
  const yearRows = byYear.map((r, i) => {
    const prev = byYear[i - 1]
    const chg = prev ? fmtPct(r.subtotal, prev.subtotal) : ''
    const isPos = chg.startsWith('+')
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:9px 14px;font-size:13px;font-weight:800;color:#1f2937">${r.year}</td>
      <td style="padding:9px 14px;text-align:right;font-size:13px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(r.subtotal)}</td>
      <td style="padding:9px 14px;text-align:right;font-size:12px;color:#6b7280;font-family:monospace">${Math.round(r.quantity || 0).toLocaleString()}</td>
      <td style="padding:9px 14px;text-align:right;font-size:13px;font-weight:800;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'}">${chg || '基準年'}</td>
      <td style="padding:9px 14px;min-width:120px">${hBar(r.subtotal / maxVal * 100, '#7c3aed', 8)}</td>
    </tr>`
  }).join('')

  // 季度摘要（最近 8 季）
  const recentQ = byQuarter.slice(-8)
  const maxQ = Math.max(...recentQ.map(d => d.subtotal))
  const qRows = recentQ.map((r, i) => {
    const prev = recentQ[i - 1]
    const chg = prev ? fmtPct(r.subtotal, prev.subtotal) : ''
    const isPos = chg.startsWith('+')
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151">${r.label}</td>
      <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827">${fmtN(r.subtotal)}</td>
      <td style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'}">${chg || '—'}</td>
      <td style="padding:7px 10px;min-width:70px">${hBar(maxQ > 0 ? r.subtotal / maxQ * 100 : 0, '#6366f1', 6)}</td>
    </tr>`
  }).join('')

  return secCard(
    secHeader('年度 & 季度對比分析', '各年份 / 季度業績', '#7c3aed') +
    `<div style="display:grid;grid-template-columns:3fr 2fr">
      <div style="border-right:1px solid #f3f4f6">
        <div style="padding:8px 14px;font-size:11px;font-weight:700;color:#6b21a8;border-bottom:1px solid #f3f4f6;background:#faf5ff">年度對比</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#faf5ff;border-bottom:1px solid #e9d5ff">
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#6b21a8;font-weight:700">年份</th>
            <th style="padding:8px 14px;text-align:right;font-size:10px;color:#6b21a8;font-weight:700">銷售金額</th>
            <th style="padding:8px 14px;text-align:right;font-size:10px;color:#6b21a8;font-weight:700">數量</th>
            <th style="padding:8px 14px;text-align:right;font-size:10px;color:#6b21a8;font-weight:700">年增率</th>
            <th style="padding:8px 14px;font-size:10px;color:#6b21a8;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${yearRows}</tbody>
        </table>
      </div>
      <div>
        <div style="padding:8px 10px;font-size:11px;font-weight:700;color:#4338ca;border-bottom:1px solid #f3f4f6;background:#eef2ff">季度趨勢（近 8 季）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#eef2ff;border-bottom:1px solid #e0e7ff">
            <th style="padding:7px 10px;text-align:left;font-size:10px;color:#4338ca;font-weight:700">季度</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;color:#4338ca;font-weight:700">金額</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;color:#4338ca;font-weight:700">QoQ</th>
            <th style="padding:7px 10px;font-size:10px;color:#4338ca;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${qRows}</tbody>
        </table>
      </div>
    </div>`,
    '#7c3aed'
  )
}

/* ═══════════════════════════════════════════════════════════════
   績效矩陣（四象限）
═══════════════════════════════════════════════════════════════ */
function renderPerformanceHTML({ performanceData }) {
  if (!performanceData) return ''
  const { productPerf = [], channelPerf = [], brandPerf = [], productMedian, channelMedian, brandMedian } = performanceData

  const classify = (items, median) => {
    if (!median) return { stars: items, others: [] }
    const stars = items.filter(d => d.subtotal >= median.subtotal)
    const others = items.filter(d => d.subtotal < median.subtotal)
    return { stars, others }
  }

  const renderDimTable = (items, median, color, label) => {
    const maxV = items[0]?.subtotal || 1
    const med = median?.subtotal || 0
    return `
    <div style="border-radius:8px;overflow:hidden;border:1px solid ${color}20;margin-bottom:8px">
      <div style="background:${color}12;padding:7px 10px;font-size:10px;font-weight:700;color:${color};border-bottom:1px solid ${color}20">${label}（共 ${items.length} 項，中位數 ${fmtN(med)}）</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid #f3f4f6">
          <th style="padding:5px 8px;text-align:left;font-size:9px;color:#6b7280;font-weight:700">名稱</th>
          <th style="padding:5px 8px;text-align:right;font-size:9px;color:#6b7280;font-weight:700">銷售額</th>
          <th style="padding:5px 8px;text-align:center;font-size:9px;color:#6b7280;font-weight:700">表現</th>
          <th style="padding:5px 8px;font-size:9px;color:#6b7280;font-weight:700">相對規模</th>
        </tr></thead>
        <tbody>
          ${items.slice(0, 12).map((d, i) => {
            const isAbove = d.subtotal >= med
            const tag = isAbove ? `<span style="background:#dcfce7;color:#166534;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px">高績效</span>`
                                : `<span style="background:#fef9c3;color:#854d0e;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px">待提升</span>`
            return `<tr style="border-bottom:1px solid #f9fafb;${i % 2 === 0 ? 'background:#fafafa' : ''}">
              <td style="padding:5px 8px;font-size:10px;font-weight:600;color:#1f2937;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
              <td style="padding:5px 8px;text-align:right;font-size:10px;font-weight:700;font-family:monospace;color:#111827">${fmtN(d.subtotal)}</td>
              <td style="padding:5px 8px;text-align:center">${tag}</td>
              <td style="padding:5px 8px;min-width:60px">${hBar(d.subtotal / maxV * 100, color, 5)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
  }

  return secCard(
    secHeader('績效矩陣分析', '各維度高績效 / 待提升分類', '#2563eb') +
    `<div style="padding:14px 16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        <div>${renderDimTable(productPerf, productMedian, '#e11d48', '產品')}</div>
        <div>${renderDimTable(channelPerf, channelMedian, '#0891b2', '通路')}</div>
      </div>
      ${brandPerf.length ? renderDimTable(brandPerf, brandMedian, '#d97706', '品牌') : ''}
    </div>`,
    '#2563eb'
  )
}

/* ═══════════════════════════════════════════════════════════════
   熱力圖（通路類型 × 月份）
═══════════════════════════════════════════════════════════════ */
function renderHeatmapHTML({ heatmapData }) {
  if (!heatmapData?.months?.length || !heatmapData?.channelTypes?.length) return ''
  const { data, months, channelTypes } = heatmapData
  const recentMonths = months.slice(-18) // 最多顯示 18 個月

  // 找最大值做色階
  let maxVal = 0
  data.forEach(row => recentMonths.forEach(m => { if (row[m] > maxVal) maxVal = row[m] }))

  const colW = Math.max(44, Math.floor(500 / recentMonths.length))

  const thead = `<tr style="background:#f0f9ff;border-bottom:2px solid #bae6fd">
    <th style="padding:7px 10px;text-align:left;font-size:9px;color:#0c4a6e;font-weight:700;min-width:80px">通路類型</th>
    ${recentMonths.map(m => `<th style="padding:5px 4px;text-align:center;font-size:8px;color:#0c4a6e;font-weight:700;min-width:${colW}px;white-space:nowrap">${m.slice(5)}</th>`).join('')}
    <th style="padding:7px 8px;text-align:right;font-size:9px;color:#0c4a6e;font-weight:700">合計</th>
  </tr>`

  const tbody = data.map((row, ri) => {
    const rowTotal = recentMonths.reduce((s, m) => s + (row[m] || 0), 0)
    const cells = recentMonths.map(m => {
      const v = row[m] || 0
      const pct = maxVal > 0 ? v / maxVal : 0
      const bg = v > 0 ? heatColor(pct) : '#f9fafb'
      const fg = pct > 0.55 ? '#fff' : '#374151'
      return `<td style="padding:5px 3px;text-align:center;background:${bg};font-size:8px;font-weight:${pct > 0.3 ? '700' : '400'};color:${fg};white-space:nowrap">${v > 0 ? fmtN(v) : ''}</td>`
    }).join('')
    return `<tr style="border-bottom:1px solid #f0f9ff">
      <td style="padding:7px 10px;font-size:10px;font-weight:700;color:#1f2937;white-space:nowrap">${esc(row.channelType)}</td>
      ${cells}
      <td style="padding:7px 8px;text-align:right;font-size:10px;font-weight:700;color:#0c4a6e;font-family:monospace">${fmtN(rowTotal)}</td>
    </tr>`
  }).join('')

  // 欄合計
  const colTotals = recentMonths.map(m => data.reduce((s, r) => s + (r[m] || 0), 0))
  const grandTotal = colTotals.reduce((s, v) => s + v, 0)
  const tfoot = `<tr style="background:#e0f2fe;border-top:2px solid #7dd3fc">
    <td style="padding:7px 10px;font-size:10px;font-weight:800;color:#0c4a6e">月合計</td>
    ${colTotals.map(v => `<td style="padding:5px 3px;text-align:center;font-size:8px;font-weight:700;color:#0369a1;font-family:monospace">${fmtN(v)}</td>`).join('')}
    <td style="padding:7px 8px;text-align:right;font-size:10px;font-weight:800;color:#0c4a6e;font-family:monospace">${fmtN(grandTotal)}</td>
  </tr>`

  return secCard(
    secHeader('通路類型 × 月份 熱力圖', `近 ${recentMonths.length} 個月，顏色深淺代表銷售強度`, '#0891b2') +
    `<div style="overflow-x:auto;padding:4px">
      <table style="width:100%;border-collapse:collapse">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
        <tfoot>${tfoot}</tfoot>
      </table>
    </div>
    <div style="padding:8px 14px;font-size:9px;color:#94a3b8">
      深色 = 高銷售額 ｜ 淺色 = 低銷售額 ｜ 空白 = 無銷售記錄
    </div>`,
    '#0891b2'
  )
}

/* ═══════════════════════════════════════════════════════════════
   通路明細（通路 + 品牌 並排）
═══════════════════════════════════════════════════════════════ */
function renderBrandChannelHTML({ brandData = [], channelData = [], channelTypeData = [] }) {
  const renderMiniTable = (items, color, max = 12) => {
    const total = items.reduce((s, d) => s + (d.subtotal || 0), 0)
    const maxV  = items[0]?.subtotal || 1
    return items.slice(0, max).map((d, i) => {
      const pct = total > 0 ? d.subtotal / total * 100 : 0
      return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
        <td style="padding:6px 10px;text-align:center;width:24px">
          <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${i < 3 ? color : '#e5e7eb'};color:${i < 3 ? '#fff' : '#6b7280'};font-size:9px;font-weight:800;line-height:18px;text-align:center">${i + 1}</span>
        </td>
        <td style="padding:6px 8px;font-size:11px;font-weight:600;color:#1f2937;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
        <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827;white-space:nowrap">${fmtN(d.subtotal)}</td>
        <td style="padding:6px 8px;text-align:right;font-size:10px;color:#9ca3af;white-space:nowrap">${pct.toFixed(0)}%</td>
        <td style="padding:6px 8px;min-width:60px">${hBar(d.subtotal / maxV * 100, color, 5)}</td>
      </tr>`
    }).join('')
  }

  const ctTotal = channelTypeData.reduce((s, d) => s + (d.subtotal || 0), 0)

  return secCard(
    secHeader('品牌 & 通路分析', '品牌 TOP 12 / 通路 TOP 12 / 通路類型分布', '#d97706') +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
      <div style="border-right:1px solid #f3f4f6">
        <div style="padding:8px 12px;font-size:11px;font-weight:700;color:#92400e;border-bottom:1px solid #fef3c7;background:#fffbeb">✨ 品牌排行（前 12）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid #fef3c7;background:#fffbeb">
            <th style="padding:6px 10px;font-size:9px;color:#78350f;font-weight:700" colspan="2">品牌</th>
            <th style="padding:6px 8px;text-align:right;font-size:9px;color:#78350f;font-weight:700">金額</th>
            <th style="padding:6px 8px;text-align:right;font-size:9px;color:#78350f;font-weight:700">佔比</th>
            <th style="padding:6px 8px;font-size:9px;color:#78350f;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${renderMiniTable(brandData, '#d97706')}</tbody>
        </table>
      </div>
      <div>
        <div style="padding:8px 12px;font-size:11px;font-weight:700;color:#0e7490;border-bottom:1px solid #a5f3fc;background:#ecfeff">🏪 通路排行（前 12）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid #a5f3fc;background:#ecfeff">
            <th style="padding:6px 10px;font-size:9px;color:#0e7490;font-weight:700" colspan="2">通路</th>
            <th style="padding:6px 8px;text-align:right;font-size:9px;color:#0e7490;font-weight:700">金額</th>
            <th style="padding:6px 8px;text-align:right;font-size:9px;color:#0e7490;font-weight:700">佔比</th>
            <th style="padding:6px 8px;font-size:9px;color:#0e7490;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${renderMiniTable(channelData, '#0891b2')}</tbody>
        </table>
      </div>
    </div>
    ${channelTypeData.length ? `
    <div style="border-top:2px solid #fef3c7;padding:10px 14px;background:#fffbeb">
      <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:8px">通路類型分布（總計 ${fmtN(ctTotal)}）</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${channelTypeData.slice(0, 6).map(d => {
          const pct = ctTotal > 0 ? d.subtotal / ctTotal * 100 : 0
          return `<div style="background:white;border-radius:8px;padding:8px 10px;border:1px solid #fde68a;min-width:80px;flex:1">
            <div style="font-size:9px;color:#6b7280;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</div>
            <div style="font-size:13px;font-weight:800;color:#d97706;margin-top:2px">${fmtN(d.subtotal)}</div>
            <div style="font-size:9px;color:#9ca3af">${pct.toFixed(0)}%</div>
            <div style="margin-top:4px">${hBar(pct, '#d97706', 4)}</div>
          </div>`
        }).join('')}
      </div>
    </div>` : ''}`,
    '#d97706'
  )
}

/* ═══════════════════════════════════════════════════════════════
   產品 / 客戶 排行榜
═══════════════════════════════════════════════════════════════ */
function renderRankingHTML({ items = [], title, subtitle, color }) {
  if (!items.length) return ''
  const top = items.slice(0, 20)
  const total = items.reduce((s, d) => s + (d.subtotal || 0), 0)
  const maxVal = top[0]?.subtotal || 1

  const rows = top.map((d, i) => {
    const pct = total > 0 ? d.subtotal / total * 100 : 0
    const rankBg = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#e5e7eb'
    const rankFg = i < 3 ? '#fff' : '#6b7280'
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:7px 12px;text-align:center;width:32px">
        <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${rankBg};color:${rankFg};font-size:10px;font-weight:800;line-height:22px;text-align:center">${i + 1}</span>
      </td>
      <td style="padding:7px 10px;font-size:11px;font-weight:600;color:#1f2937;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
      <td style="padding:7px 10px;text-align:right;font-size:12px;font-weight:700;color:#111827;font-family:monospace;white-space:nowrap">NT$ ${fmtN(d.subtotal)}</td>
      <td style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;font-family:monospace">${Math.round(d.quantity || 0).toLocaleString()}</td>
      <td style="padding:7px 10px;text-align:right;font-size:10px;color:#9ca3af">${pct.toFixed(1)}%</td>
      <td style="padding:7px 10px;min-width:90px">${hBar(d.subtotal / maxVal * 100, color, 6)}</td>
    </tr>`
  }).join('')

  return secCard(
    secHeader(title, subtitle, color) +
    `<div style="padding:8px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280">
      共 ${items.length} 項 · 顯示前 ${top.length} 名 · 合計 NT$ ${fmtN(total)}
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:${color}08;border-bottom:2px solid ${color}30">
        <th style="padding:8px 12px;text-align:center;font-size:9px;color:#6b7280;font-weight:700;width:36px">排名</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#6b7280;font-weight:700">名稱</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#6b7280;font-weight:700">銷售金額</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#6b7280;font-weight:700">數量</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#6b7280;font-weight:700">佔比</th>
        <th style="padding:8px 10px;font-size:9px;color:#6b7280;font-weight:700">相對規模</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`,
    color
  )
}

/* ═══════════════════════════════════════════════════════════════
   HTML → Canvas
═══════════════════════════════════════════════════════════════ */
async function htmlToCanvas(html, width = 820) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;background:white;padding:20px 24px;z-index:-9999;box-sizing:border-box;font-family:system-ui,-apple-system,"Microsoft JhengHei","PingFang TC",sans-serif`
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const canvas = await html2canvas(wrapper, {
    scale: 1.8, backgroundColor: '#ffffff', useCORS: true,
    logging: false, scrollX: 0, scrollY: 0,
    width, height: wrapper.scrollHeight, windowWidth: width,
  })
  document.body.removeChild(wrapper)
  return canvas
}

function splitCanvasToPages(canvas) {
  const pageH = Math.round(canvas.width * 1.414)
  const pages = []
  let y = 0
  while (y < canvas.height) {
    const sliceH = Math.min(pageH, canvas.height - y)
    const pc = document.createElement('canvas')
    pc.width = canvas.width; pc.height = pageH
    const ctx = pc.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, pageH)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    pages.push(pc); y += pageH
  }
  return pages
}

/* ═══════════════════════════════════════════════════════════════
   PDF Builder
═══════════════════════════════════════════════════════════════ */
function buildPDF(canvases, footerText = '') {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8, availW = pageW - margin * 2, availH = pageH - margin * 2 - 6
  let first = true
  for (const canvas of canvases) {
    if (!first) pdf.addPage(); first = false
    const imgData = canvas.toDataURL('image/jpeg', 0.93)
    const ratio = canvas.width / canvas.height
    let w = availW, h = w / ratio
    if (h > availH) { h = availH; w = h * ratio }
    pdf.addImage(imgData, 'JPEG', margin + (availW - w) / 2, margin + (availH - h) / 2, w, h)
  }
  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i); pdf.setFontSize(7); pdf.setTextColor(170, 170, 170)
    pdf.text(`${i} / ${total}`, pageW - margin, pageH - 2.5, { align: 'right' })
    if (footerText) pdf.text(footerText, margin, pageH - 2.5)
  }
  return pdf
}

/* ═══════════════════════════════════════════════════════════════
   所有儀表板 section 清單（共用）
═══════════════════════════════════════════════════════════════ */
function buildDashboardSections(salesData) {
  const { summary, trendData, comparisonData, productData = [], customerData = [],
    brandData = [], channelData = [], channelTypeData = [], performanceData, heatmapData } = salesData
  return [
    { name: 'KPI 封面',   html: renderCoverHTML({ summary, trendData, comparisonData, productData, customerData, brandData, channelData, channelTypeData }) },
    { name: '月份趨勢',   html: renderTrendHTML({ trendData }) },
    { name: '年度季度對比', html: renderComparisonHTML({ comparisonData }) },
    { name: '績效矩陣',   html: renderPerformanceHTML({ performanceData }) },
    { name: '熱力圖',     html: renderHeatmapHTML({ heatmapData }) },
    { name: '產品排行',   html: renderRankingHTML({ items: productData, title: '產品銷售排行', subtitle: `TOP 20 · 共 ${productData.length} 項`, color: '#e11d48' }) },
    { name: '客戶排行',   html: renderRankingHTML({ items: customerData, title: '客戶銷售排行', subtitle: `TOP 20 · 共 ${customerData.length} 位`, color: '#0891b2' }) },
    { name: '品牌通路',   html: renderBrandChannelHTML({ brandData, channelData, channelTypeData }) },
  ]
}

/* ═══════════════════════════════════════════════════════════════
   主匯出：儀表板 PDF
═══════════════════════════════════════════════════════════════ */
export async function exportDashboardPDF({ salesData = {}, onProgress }) {
  const sections = buildDashboardSections(salesData)
  const allPages = []
  for (const sec of sections) {
    if (!sec.html) continue
    onProgress?.(`渲染 ${sec.name}...`)
    const canvas = await htmlToCanvas(sec.html)
    splitCanvasToPages(canvas).forEach(p => allPages.push(p))
  }
  onProgress?.('建立 PDF 檔案...')
  const pdf = buildPDF(allPages, `銷售數據分析報告 · ${new Date().toLocaleDateString('zh-TW')}`)
  const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* ═══════════════════════════════════════════════════════════════
   Markdown → styled HTML（AI 分析報告）
═══════════════════════════════════════════════════════════════ */
const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#4f46e5']
const TYPE_LABELS = { comprehensive: '完整分析', channel: '通路分析', product: '產品開發', growth: '成長策略' }

function inlineHTML(t) {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#eff6ff;color:#1d4ed8;padding:1px 5px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function renderSectionHTML(lines, color) {
  let html = '', listType = null, listItems = [], inCode = false, codeLines = []
  const flushList = () => {
    if (!listItems.length) return
    if (listType === 'ul') {
      html += '<ul style="margin:8px 0 12px;padding:0;list-style:none">'
      listItems.forEach(item => {
        html += `<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;margin-top:5px"></span>
          <span style="font-size:13px;color:#374151;line-height:1.5">${inlineHTML(item)}</span></li>`
      })
      html += '</ul>'
    } else {
      html += '<ol style="margin:8px 0 12px;padding:0;list-style:none">'
      listItems.forEach((item, idx) => {
        html += `<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px">
          <span style="width:20px;height:20px;border-radius:50%;background:${color};color:white;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${idx + 1}</span>
          <span style="font-size:13px;color:#374151;line-height:1.5">${inlineHTML(item)}</span></li>`
      })
      html += '</ol>'
    }
    listItems = []; listType = null
  }
  lines.forEach(line => {
    if (line.startsWith('```')) {
      if (inCode) {
        html += `<pre style="background:#111827;color:#6ee7b7;padding:12px;border-radius:8px;font-size:11px;margin:10px 0;font-family:monospace;line-height:1.5;white-space:pre-wrap">${codeLines.map(esc).join('\n')}</pre>`
        codeLines = []; inCode = false
      } else { flushList(); inCode = true }
      return
    }
    if (inCode) { codeLines.push(line); return }
    if (line.startsWith('### ')) {
      flushList()
      html += `<div style="font-size:13px;font-weight:700;color:${color};margin:14px 0 6px;display:flex;align-items:center;gap:6px">
        <span style="width:3px;height:14px;background:${color};display:inline-block;border-radius:2px;flex-shrink:0"></span>
        ${inlineHTML(line.slice(4))}</div>`
    } else if (/^[-*] /.test(line)) {
      if (listType !== 'ul') flushList(); listType = 'ul'; listItems.push(line.slice(2))
    } else if (/^\d+\. /.test(line)) {
      if (listType !== 'ol') flushList(); listType = 'ol'; listItems.push(line.replace(/^\d+\. /, ''))
    } else if (line.startsWith('---')) {
      flushList(); html += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0">'
    } else if (line.trim() === '') {
      flushList()
    } else if (!line.startsWith('#')) {
      flushList()
      html += `<p style="font-size:13px;color:#374151;margin:3px 0;line-height:1.6;word-wrap:break-word">${inlineHTML(line)}</p>`
    }
  })
  flushList()
  return html
}

function markdownToStyledHTML(text, analysisType) {
  const lines = text.split('\n')
  let docTitle = '', sections = [], preLines = [], curr = null
  for (const line of lines) {
    if (line.startsWith('# ') && !docTitle) docTitle = line.slice(2)
    else if (line.startsWith('## ')) {
      if (curr) sections.push(curr)
      else if (preLines.length) sections.push({ title: null, lines: preLines })
      curr = { title: line.slice(3), lines: [] }
    } else { if (curr) curr.lines.push(line); else preLines.push(line) }
  }
  if (curr) sections.push(curr)
  else if (preLines.length) sections.push({ title: null, lines: preLines })

  let sc = 0
  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
  let html = `<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white;box-sizing:border-box;word-wrap:break-word">`
  html += `<div style="background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;padding:30px;border-radius:14px;margin-bottom:18px">
    <div style="font-size:10px;opacity:.65;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">AI 智慧分析報告</div>
    <div style="font-size:21px;font-weight:900;margin-bottom:3px">${inlineHTML(docTitle || TYPE_LABELS[analysisType] || 'AI 分析')}</div>
    <div style="font-size:10px;opacity:.55">${dateStr}</div>
  </div>`
  sections.filter(s => s.title).forEach(section => {
    const color = COLORS[sc % COLORS.length]; sc++
    html += `<div style="border-radius:12px;overflow:hidden;margin-bottom:14px;border:1px solid ${color}25">
      <div style="background:${color};padding:11px 18px;display:flex;align-items:center;gap:10px">
        <span style="width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.25);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white;flex-shrink:0">${sc}</span>
        <span style="font-size:13px;font-weight:700;color:white">${inlineHTML(section.title)}</span>
      </div>
      <div style="background:${color}0d;padding:14px 18px">${renderSectionHTML(section.lines, color)}</div>
    </div>`
  })
  html += '</div>'
  return html
}

async function renderMarkdownToCanvases(text, analysisType) {
  const html = markdownToStyledHTML(text, analysisType)
  const canvas = await htmlToCanvas(html)
  return splitCanvasToPages(canvas)
}

export async function exportAIReportPDF({ content, analysisType }) {
  const pages = await renderMarkdownToCanvases(content, analysisType)
  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  const pdf = buildPDF(pages, `AI 智慧分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`)
  const filename = `AI分析_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* ═══════════════════════════════════════════════════════════════
   完整報告 PDF：AI 分析 + 全部儀表板資料（純 HTML 渲染）
═══════════════════════════════════════════════════════════════ */
export async function exportFullReportPDF({ salesData = {}, aiContent, analysisType, onProgress }) {
  const allPages = []

  // 1. AI 分析內容
  onProgress?.('渲染 AI 報告...')
  const aiPages = await renderMarkdownToCanvases(aiContent, analysisType)
  aiPages.forEach(p => allPages.push(p))

  // 2. 全部儀表板 section（和 exportDashboardPDF 完全相同）
  const sections = buildDashboardSections(salesData)
  for (const sec of sections) {
    if (!sec.html) continue
    onProgress?.(`渲染 ${sec.name}...`)
    const canvas = await htmlToCanvas(sec.html)
    splitCanvasToPages(canvas).forEach(p => allPages.push(p))
  }

  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  onProgress?.('建立 PDF...')
  const pdf = buildPDF(allPages, `完整銷售分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`)
  const filename = `完整報告_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

export async function captureElement() { return null }

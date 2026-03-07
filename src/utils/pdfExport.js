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

/* SVG 直條圖，嵌入 HTML 段落 */
function svgBarChart(items, { chartWidth = 740, chartHeight = 160, color = '#059669', labelKey = 'yearMonth', valueKey = 'subtotal' } = {}) {
  if (!items.length) return ''
  const padL = 52, padB = 28, padT = 12, padR = 8
  const W = chartWidth - padL - padR
  const H = chartHeight - padT - padB
  const maxV = Math.max(...items.map(d => d[valueKey] || 0), 1)
  const barW = Math.max(4, Math.floor(W / items.length) - 2)
  const step = W / items.length

  const bars = items.map((d, i) => {
    const v = d[valueKey] || 0
    const bh = Math.round(v / maxV * H)
    const x = padL + i * step + (step - barW) / 2
    const y = padT + H - bh
    const raw = String(d[labelKey] || '')
    // 年份: "2024" → "2024"; 年月: "2024-03" → "03"; 季度: "2024-Q1" → "Q1"
    const label = raw.length <= 4 ? raw : raw.slice(-3).replace(/^-/, '')
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh}" fill="${color}" rx="2" opacity="0.82"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(padT + H + 18).toFixed(1)}" text-anchor="middle" font-size="8" fill="#9ca3af" font-family="system-ui">${label}</text>`
  }).join('\n')

  // Y 軸 3 刻度線
  const ticks = [0, 0.5, 1].map(t => {
    const y = (padT + H - t * H).toFixed(1)
    return `<line x1="${padL - 4}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="#e5e7eb" stroke-width="0.8"/>
      <text x="${(padL - 6).toFixed(1)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="#9ca3af" font-family="system-ui">${fmtN(maxV * t)}</text>`
  }).join('\n')

  return `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    ${ticks}
    ${bars}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + H}" stroke="#d1d5db" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="#d1d5db" stroke-width="1"/>
  </svg>`
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

  const chartItems = recent.slice(-24)
  const chartSVG = svgBarChart(chartItems, { chartWidth: 740, chartHeight: 150, color: '#059669', labelKey: 'yearMonth', valueKey: 'subtotal' })

  return secCard(
    secHeader('月份趨勢分析', `最近 ${recent.length} 個月`, '#059669') +
    `<div style="padding:12px 16px 4px;border-bottom:1px solid #bbf7d0;background:#f0fdf4">
      <div style="font-size:10px;font-weight:700;color:#166534;margin-bottom:6px">月銷售金額趨勢圖</div>
      ${chartSVG}
    </div>
    <table style="width:100%;border-collapse:collapse">
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

  const yearChartSVG = svgBarChart(byYear, { chartWidth: 420, chartHeight: 120, color: '#7c3aed', labelKey: 'year', valueKey: 'subtotal' })
  const qChartSVG = svgBarChart(recentQ, { chartWidth: 270, chartHeight: 120, color: '#6366f1', labelKey: 'label', valueKey: 'subtotal' })

  return secCard(
    secHeader('年度 & 季度對比分析', '各年份 / 季度業績', '#7c3aed') +
    `<div style="display:grid;grid-template-columns:3fr 2fr;background:#faf5ff;border-bottom:1px solid #e9d5ff">
      <div style="padding:10px 14px;border-right:1px solid #e9d5ff">
        <div style="font-size:10px;font-weight:700;color:#6b21a8;margin-bottom:4px">年度銷售趨勢</div>
        ${yearChartSVG}
      </div>
      <div style="padding:10px 14px">
        <div style="font-size:10px;font-weight:700;color:#4338ca;margin-bottom:4px">季度銷售趨勢</div>
        ${qChartSVG}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 2fr">
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
   HTML → 智慧分頁 Canvases（表格列感知，自動重複表頭）
═══════════════════════════════════════════════════════════════ */
const _SCALE = 1.8
const _FONT = `system-ui,-apple-system,"Microsoft JhengHei","PingFang TC",sans-serif`

function _makeDiv(html, width, pad = '20px 24px') {
  const d = document.createElement('div')
  d.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;background:white;padding:${pad};z-index:-9999;box-sizing:border-box;font-family:${_FONT}`
  d.innerHTML = html
  return d
}

async function _renderToCanvas(div, width) {
  return html2canvas(div, {
    scale: _SCALE, backgroundColor: '#ffffff', useCORS: true,
    logging: false, scrollX: 0, scrollY: 0,
    width, height: div.scrollHeight, windowWidth: width,
  })
}

async function _waitLayout() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/* 主分頁函數：HTML → A4 頁面 canvas 陣列 */
async function htmlToPagedCanvases(html, width = 820) {
  const PAGE_PX = Math.round(width * 1.414)   // A4 直式比例

  /* ── 1. 量測元素位置 ── */
  const div = _makeDiv(html, width)
  document.body.appendChild(div)
  await _waitLayout()

  const divTop = div.getBoundingClientRect().top
  const totalH = div.scrollHeight

  // 收集所有 <tr> 的底部位置（safe break points）
  const rowBreaks = []  // { y, tid }
  const tableData = {} // tid -> { theadHTML, theadH, bottom }

  div.querySelectorAll('table').forEach((tbl, ti) => {
    const tid = `t${ti}`
    const thead = tbl.querySelector('thead')
    const tblR = tbl.getBoundingClientRect()

    tableData[tid] = {
      theadHTML: thead ? thead.outerHTML : null,
      theadH: thead ? Math.round(thead.getBoundingClientRect().height) : 0,
      bottom: Math.round(tblR.bottom - divTop),
    }

    tbl.querySelectorAll('tbody tr').forEach(row => {
      rowBreaks.push({ y: Math.round(row.getBoundingClientRect().bottom - divTop), tid })
    })
  })

  // 非表格區塊底部也作為 break point（避免段落被切斷）
  div.querySelectorAll('p, li, h3, h4').forEach(el => {
    rowBreaks.push({ y: Math.round(el.getBoundingClientRect().bottom - divTop), tid: null })
  })

  rowBreaks.sort((a, b) => a.y - b.y)

  /* ── 2. 渲染完整 canvas ── */
  const fullCanvas = await _renderToCanvas(div, width)
  document.body.removeChild(div)

  /* ── 3. 智慧分頁 ── */
  const pages = []
  let y = 0
  let continueTid = null   // 若不為 null，下一頁頂部需要重複表頭

  while (y < totalH) {
    const tInfo = continueTid ? tableData[continueTid] : null
    const theadReserve = tInfo ? tInfo.theadH + 4 : 0   // 為表頭預留空間
    const targetBottom = y + PAGE_PX - theadReserve

    // 找出 y ~ targetBottom 之間最後一個安全斷點
    const valid = rowBreaks.filter(rb => rb.y > y && rb.y <= targetBottom)
    let breakY, nextTid

    if (valid.length > 0) {
      const best = valid[valid.length - 1]
      breakY = best.y
      // 判斷下一頁是否還在同一個表格裡
      const td = best.tid ? tableData[best.tid] : null
      nextTid = (td && td.bottom > breakY) ? best.tid : null
    } else {
      // 沒有安全斷點，強制在頁面高度處截斷
      breakY = Math.min(targetBottom, totalH)
      nextTid = null
    }

    // 確保一定會前進，避免無限迴圈
    if (breakY <= y) breakY = Math.min(y + PAGE_PX, totalH)
    const sliceH = breakY - y

    /* ── 組合當頁 canvas（高度依實際內容裁切，避免大量空白） ── */
    // 先渲染表頭（需要知道實際高度）
    let theadCanvas = null
    if (tInfo?.theadHTML) {
      const theadHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">${tInfo.theadHTML}</table>`
      const theadDiv = _makeDiv(theadHTML, width, '0 24px')
      document.body.appendChild(theadDiv)
      await _waitLayout()
      theadCanvas = await _renderToCanvas(theadDiv, width)
      document.body.removeChild(theadDiv)
    }

    const theadPx = theadCanvas ? theadCanvas.height : 0
    const slicePx = Math.round(sliceH * _SCALE)
    const canvasH = Math.max(theadPx + slicePx, 1)

    const pc = document.createElement('canvas')
    pc.width = Math.round(width * _SCALE)
    pc.height = canvasH
    const ctx = pc.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pc.width, pc.height)

    let destY = 0

    // 如果是接續頁，先在頂部渲染「(續)」表頭
    if (theadCanvas) {
      ctx.drawImage(theadCanvas, 0, 0, theadCanvas.width, theadCanvas.height,
        0, 0, pc.width, theadCanvas.height)
      destY = theadCanvas.height
    }

    // 複製主內容切片
    const srcY = Math.round(y * _SCALE)
    const srcH = slicePx
    if (srcH > 0) {
      ctx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, srcH, 0, destY, pc.width, srcH)
    }

    pages.push(pc)
    y = breakY
    continueTid = nextTid
    if (y >= totalH) break
  }

  return pages
}

/* 向後相容：單一 canvas（部分內部流程仍使用） */
async function htmlToCanvas(html, width = 820) {
  const div = _makeDiv(html, width)
  document.body.appendChild(div)
  await _waitLayout()
  const canvas = await _renderToCanvas(div, width)
  document.body.removeChild(div)
  return canvas
}

/* ═══════════════════════════════════════════════════════════════
   PDF Builder（頂對齊 + 自動合併短內容到同頁）
═══════════════════════════════════════════════════════════════ */
function buildPDF(canvases, footerText = '') {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const availW = pageW - margin * 2
  const availH = pageH - margin * 2 - 6  // 留底部頁碼空間
  const gap = 4  // 同頁多段之間的間距（mm）

  let first = true
  let curY = margin  // 當前頁已用到的 Y 位置

  for (const canvas of canvases) {
    const imgData = canvas.toDataURL('image/jpeg', 0.93)
    const ratio = canvas.width / canvas.height
    let w = availW, h = w / ratio
    if (h > availH) { h = availH; w = h * ratio }

    // 若此段放不進剩餘空間，換頁
    if (!first && curY + h > pageH - margin - 6) {
      pdf.addPage()
      curY = margin
    }
    if (first) first = false

    // 頂對齊放置（不再垂直置中）
    pdf.addImage(imgData, 'JPEG', margin + (availW - w) / 2, curY, w, h)
    curY += h + gap
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

  // 合併趨勢 + YoYMoM，減少空白頁
  const trendAndYoY = [renderTrendHTML({ trendData }), renderYoYMoMHTML({ trendData })].filter(Boolean).join('\n')
  // 合併績效矩陣 + 熱力圖
  const perfAndHeat = [renderPerformanceHTML({ performanceData }), renderHeatmapHTML({ heatmapData })].filter(Boolean).join('\n')
  // 合併產品 + 客戶排行
  const productsAndCustomers = [
    renderRankingHTML({ items: productData, title: '產品銷售排行', subtitle: `TOP 20 · 共 ${productData.length} 項`, color: '#e11d48' }),
    renderRankingHTML({ items: customerData, title: '客戶銷售排行', subtitle: `TOP 20 · 共 ${customerData.length} 位`, color: '#0891b2' }),
  ].filter(Boolean).join('\n')

  return [
    { name: 'KPI 封面',       html: renderCoverHTML({ summary, trendData, comparisonData, productData, customerData, brandData, channelData, channelTypeData }) },
    { name: '年度季度對比',   html: renderComparisonHTML({ comparisonData }) },
    { name: '趨勢 & YoY/MoM', html: trendAndYoY },
    { name: '績效 & 熱力圖',  html: perfAndHeat },
    { name: '產品 & 客戶排行', html: productsAndCustomers },
    { name: '品牌通路',       html: renderBrandChannelHTML({ brandData, channelData, channelTypeData }) },
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
    const pages = await htmlToPagedCanvases(sec.html)
    pages.forEach(p => allPages.push(p))
  }
  onProgress?.('建立 PDF 檔案...')
  const pdf = buildPDF(allPages, `銷售數據分析報告 · ${new Date().toLocaleDateString('zh-TW')}`)
  const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* ═══════════════════════════════════════════════════════════════
   YoY & MoM 年月比對（矩陣 + 明細表）
═══════════════════════════════════════════════════════════════ */
function renderYoYMoMHTML({ trendData = [] }) {
  if (!trendData.length) return ''
  const sorted = [...trendData].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  const byYM = Object.fromEntries(sorted.map(d => [d.yearMonth, d.subtotal]))

  const years = [...new Set(sorted.map(d => d.yearMonth.slice(0, 4)))].sort()
  const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const maxVal = Math.max(...sorted.map(d => d.subtotal), 1)

  // Year × Month matrix
  const matrixRows = MONTHS.map((m, mi) => {
    const cells = years.map(y => {
      const key = `${y}-${m}`
      const val = byYM[key] || 0
      const prevKey = `${parseInt(y) - 1}-${m}`
      const prev = byYM[prevKey] || 0
      const yoy = prev > 0 ? (val - prev) / prev * 100 : null
      const pct = maxVal > 0 ? val / maxVal : 0
      const bg = val > 0 ? heatColor(pct) : '#f9fafb'
      const fg = pct > 0.55 ? '#fff' : '#1f2937'
      const yoyColor = yoy === null ? '' : yoy >= 0 ? (fg === '#fff' ? '#a7f3d0' : '#059669') : (fg === '#fff' ? '#fca5a5' : '#ef4444')
      const yoyText = yoy === null ? '' : (yoy >= 0 ? '+' : '') + yoy.toFixed(0) + '%'
      return `<td style="padding:5px 6px;text-align:center;background:${bg};border:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;color:${fg};font-family:monospace">${val > 0 ? fmtN(val) : '—'}</div>
        ${yoyText ? `<div style="font-size:8px;color:${yoyColor};font-weight:700">${yoyText}</div>` : ''}
      </td>`
    }).join('')
    return `<tr>
      <td style="padding:5px 10px;font-size:11px;font-weight:700;color:#374151;white-space:nowrap;background:#f9fafb;border:1px solid #e5e7eb">${MONTH_LABELS[mi]}</td>
      ${cells}
    </tr>`
  }).join('')

  // Last 18 months MoM/YoY detail
  const recent18 = sorted.slice(-18)
  const detailRows = recent18.map((d, i) => {
    const prev = recent18[i - 1]
    const prevYM = `${parseInt(d.yearMonth.slice(0, 4)) - 1}-${d.yearMonth.slice(5)}`
    const mom = prev?.subtotal > 0 ? (d.subtotal - prev.subtotal) / prev.subtotal * 100 : null
    const yoy = byYM[prevYM] > 0 ? (d.subtotal - byYM[prevYM]) / byYM[prevYM] * 100 : null
    const momColor = mom === null ? '#9ca3af' : mom >= 0 ? '#059669' : '#ef4444'
    const yoyColor = yoy === null ? '#9ca3af' : yoy >= 0 ? '#059669' : '#ef4444'
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:6px 10px;font-size:11px;font-weight:600;color:#374151">${d.yearMonth}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827">NT$ ${fmtN(d.subtotal)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:700;color:${momColor}">${mom !== null ? (mom >= 0 ? '+' : '') + mom.toFixed(0) + '%' : '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:700;color:${yoyColor}">${yoy !== null ? (yoy >= 0 ? '+' : '') + yoy.toFixed(0) + '%' : '—'}</td>
      <td style="padding:6px 10px;min-width:90px">${hBar(d.subtotal / maxVal * 100, '#2563eb', 6)}</td>
    </tr>`
  }).join('')

  return secCard(
    secHeader('YoY & MoM 年月比對分析', '年增率 / 月增率 完整追蹤', '#2563eb') +
    `<div style="padding:12px 16px">
      <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:8px">月份 × 年份 銷售矩陣（顏色深淺代表銷售規模，小字為 YoY 年增率）</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#eff6ff;border-bottom:2px solid #bfdbfe">
              <th style="padding:7px 10px;text-align:left;font-size:10px;color:#1d4ed8;font-weight:700">月份</th>
              ${years.map(y => `<th style="padding:7px 10px;text-align:center;font-size:10px;color:#1d4ed8;font-weight:700">${y}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${matrixRows}</tbody>
        </table>
      </div>
    </div>
    <div style="border-top:2px solid #bfdbfe">
      <div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:#1d4ed8">近 ${recent18.length} 個月 MoM / YoY 明細</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#eff6ff;border-bottom:2px solid #bfdbfe">
            <th style="padding:7px 14px;text-align:left;font-size:10px;color:#1d4ed8;font-weight:700">月份</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;color:#1d4ed8;font-weight:700">銷售金額</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;color:#1d4ed8;font-weight:700">MoM 月增率</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;color:#1d4ed8;font-weight:700">YoY 年增率</th>
            <th style="padding:7px 10px;font-size:10px;color:#1d4ed8;font-weight:700">相對規模</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>`,
    '#2563eb'
  )
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
  let html = '', listType = null, listItems = [], inCode = false, codeLines = [], tableBuffer = []
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
  const flushTable = () => {
    if (!tableBuffer.length) return
    const isSep = l => /^\|[\s|:-]+\|?\s*$/.test(l.trim())
    const parseRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const rows = tableBuffer.filter(l => !isSep(l))
    const [header, ...body] = rows
    const headers = parseRow(header || '')
    html += `<div style="overflow-x:auto;margin:10px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">`
    html += `<thead><tr style="background:${color}18;border-bottom:2px solid ${color}50">`
    headers.forEach(h => {
      html += `<th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:${color};white-space:nowrap">${inlineHTML(h)}</th>`
    })
    html += `</tr></thead><tbody>`
    body.forEach((row, ri) => {
      html += `<tr style="border-bottom:1px solid #f3f4f6;${ri % 2 === 0 ? 'background:#fafafa' : 'background:white'}">`
      parseRow(row).forEach(c => {
        html += `<td style="padding:6px 10px;font-size:12px;color:#374151;line-height:1.4">${inlineHTML(c)}</td>`
      })
      html += `</tr>`
    })
    html += `</tbody></table></div>`
    tableBuffer = []
  }
  lines.forEach(line => {
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|')
    if (isTableRow) {
      if (listType) flushList()
      tableBuffer.push(line)
      return
    }
    if (tableBuffer.length) flushTable()
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
  flushTable()
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
  return htmlToPagedCanvases(html, 820)
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
    const pages = await htmlToPagedCanvases(sec.html)
    pages.forEach(p => allPages.push(p))
  }

  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  onProgress?.('建立 PDF...')
  const pdf = buildPDF(allPages, `完整銷售分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`)
  const filename = `完整報告_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

export async function captureElement() { return null }

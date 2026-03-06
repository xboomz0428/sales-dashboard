import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/* ═══════════════════════════════════════════════════════════════
   工具函式
═══════════════════════════════════════════════════════════════ */
const fmtN = v => {
  if (!v && v !== 0) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + ' 億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}
const fmtPct = (cur, prev) => {
  if (!prev) return ''
  const p = ((cur - prev) / prev * 100)
  return (p >= 0 ? '+' : '') + p.toFixed(0) + '%'
}
function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/* 水平 bar（純 HTML div）*/
function hBar(pct, color = '#3B82F6', height = 8) {
  const w = Math.min(100, Math.max(0, pct))
  return `<div style="background:#e5e7eb;border-radius:${height}px;height:${height}px;overflow:hidden;width:100%">
    <div style="background:${color};height:${height}px;width:${w}%;border-radius:${height}px;transition:width .3s"></div>
  </div>`
}

/* 色帶 header */
function sectionHeader(title, subtitle, color = '#2563eb') {
  return `<div style="background:linear-gradient(135deg,${color},${color}cc);color:white;padding:18px 24px;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:16px;font-weight:900;letter-spacing:.02em">${esc(title)}</div>
      ${subtitle ? `<div style="font-size:11px;opacity:.75;margin-top:3px">${esc(subtitle)}</div>` : ''}
    </div>
    <div style="font-size:11px;opacity:.6">${new Date().toLocaleDateString('zh-TW')}</div>
  </div>`
}

/* 統一外框 */
function card(inner, color = '#2563eb') {
  return `<div style="border-radius:14px;overflow:hidden;border:1.5px solid ${color}22;margin-bottom:20px;background:white">${inner}</div>`
}

/* ═══════════════════════════════════════════════════════════════
   Section 1: KPI 封面
═══════════════════════════════════════════════════════════════ */
function renderCoverHTML({ summary = {}, trendData = [], comparisonData }) {
  const { totalSales = 0, totalQty = 0, orderCount = 0, customerCount = 0, productCount = 0 } = summary
  const months = trendData.map(d => d.yearMonth).sort()
  const avg = trendData.length > 0 ? Math.round(totalSales / trendData.length) : 0
  const peak = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal >= b.subtotal ? a : b) : null
  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })

  const kpis = [
    { label: '總銷售金額', value: `NT$ ${fmtN(totalSales)}`, sub: Math.round(totalSales).toLocaleString() + ' 元', color: '#2563eb' },
    { label: '銷售數量', value: Math.round(totalQty).toLocaleString(), sub: '件', color: '#059669' },
    { label: '訂單筆數', value: Math.round(orderCount).toLocaleString(), sub: '筆', color: '#7c3aed' },
    { label: '客戶數', value: customerCount ? Math.round(customerCount).toLocaleString() : '—', sub: '不重複客戶', color: '#d97706' },
    { label: '品項數', value: productCount ? Math.round(productCount).toLocaleString() : '—', sub: '不重複品項', color: '#e11d48' },
    { label: '月均銷售', value: `NT$ ${fmtN(avg)}`, sub: '元/月', color: '#0891b2' },
  ]

  // YoY summary
  const byYear = comparisonData?.byYear || []
  const yoyRows = byYear.slice(-4).map((r, i, arr) => {
    const prev = arr[i - 1]
    return { year: r.year, subtotal: r.subtotal, chg: prev ? fmtPct(r.subtotal, prev.subtotal) : '' }
  })

  return `
  <div style="background:linear-gradient(150deg,#0f172a,#1e3a8a,#2563eb);padding:36px 32px;border-radius:16px;margin-bottom:20px;color:white">
    <div style="font-size:10px;opacity:.55;font-weight:700;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px">銷售數據分析系統 — 完整報告</div>
    <div style="font-size:30px;font-weight:900;margin-bottom:6px">Sales Performance Report</div>
    <div style="font-size:13px;opacity:.65;margin-bottom:22px">產生日期：${dateStr}</div>
    <div style="display:inline-flex;align-items:center;gap:16px;background:rgba(255,255,255,.12);border-radius:12px;padding:12px 18px">
      <div>
        <div style="font-size:10px;opacity:.7;margin-bottom:3px">分析週期</div>
        <div style="font-size:15px;font-weight:700">${months[0] || '—'} ～ ${months[months.length - 1] || '—'}</div>
      </div>
      <div style="width:1px;height:28px;background:rgba(255,255,255,.25)"></div>
      <div>
        <div style="font-size:10px;opacity:.7;margin-bottom:3px">月份筆數</div>
        <div style="font-size:15px;font-weight:700">${months.length} 個月</div>
      </div>
      ${peak ? `<div style="width:1px;height:28px;background:rgba(255,255,255,.25)"></div>
      <div>
        <div style="font-size:10px;opacity:.7;margin-bottom:3px">最高月份</div>
        <div style="font-size:15px;font-weight:700">${peak.yearMonth}（${fmtN(peak.subtotal)}）</div>
      </div>` : ''}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px">
    ${kpis.map(k => `
    <div style="border-radius:12px;border:1.5px solid ${k.color}30;overflow:hidden">
      <div style="height:4px;background:${k.color}"></div>
      <div style="padding:14px 16px">
        <div style="font-size:11px;color:#6b7280;margin-bottom:5px;font-weight:600">${k.label}</div>
        <div style="font-size:21px;font-weight:900;color:#111827;line-height:1.1">${k.value}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:3px">${k.sub}</div>
      </div>
    </div>`).join('')}
  </div>

  ${yoyRows.length > 1 ? `
  <div style="border-radius:12px;border:1.5px solid #e5e7eb;overflow:hidden">
    <div style="background:#f9fafb;padding:10px 16px;font-size:11px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb">歷年銷售對比</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">年份</th>
          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">銷售金額</th>
          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">年增率</th>
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">趨勢</th>
        </tr>
      </thead>
      <tbody>
        ${yoyRows.map((r, i) => {
          const isPos = r.chg.startsWith('+')
          const max = Math.max(...yoyRows.map(x => x.subtotal))
          const barW = max > 0 ? r.subtotal / max * 100 : 0
          return `<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1f2937">${r.year}</td>
            <td style="padding:9px 16px;text-align:right;font-size:13px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(r.subtotal)}</td>
            <td style="padding:9px 16px;text-align:right;font-size:13px;font-weight:700;color:${isPos ? '#059669' : r.chg ? '#ef4444' : '#6b7280'}">${r.chg || '—'}</td>
            <td style="padding:9px 16px;min-width:100px">${hBar(barW, '#3B82F6', 7)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>` : ''}
  `
}

/* ═══════════════════════════════════════════════════════════════
   Section 2: 月份趨勢
═══════════════════════════════════════════════════════════════ */
function renderTrendHTML({ trendData = [] }) {
  if (!trendData.length) return ''
  const sorted = [...trendData].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  const recent = sorted.slice(-24)
  const maxVal = Math.max(...recent.map(d => d.subtotal))

  const header = sectionHeader('月份趨勢分析', `最近 ${recent.length} 個月`, '#059669')
  const rows = recent.map((d, i) => {
    const prev = recent[i - 1]
    const chg = prev ? fmtPct(d.subtotal, prev.subtotal) : ''
    const isPos = chg.startsWith('+')
    const barW = maxVal > 0 ? d.subtotal / maxVal * 100 : 0
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:8px 16px;font-size:13px;font-weight:600;color:#374151">${d.yearMonth}</td>
      <td style="padding:8px 16px;text-align:right;font-size:13px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(d.subtotal)}</td>
      <td style="padding:8px 16px;text-align:right;font-size:13px;color:#6b7280;font-family:monospace">${Math.round(d.quantity).toLocaleString()}</td>
      <td style="padding:8px 16px;text-align:right;font-size:13px;font-weight:700;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'}">${chg || '—'}</td>
      <td style="padding:8px 16px;min-width:120px">${hBar(barW, '#059669', 7)}</td>
    </tr>`
  }).join('')

  const body = `<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#f0fdf4;border-bottom:2px solid #bbf7d0">
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#166534;font-weight:700">月份</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#166534;font-weight:700">銷售金額</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#166534;font-weight:700">數量（件）</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#166534;font-weight:700">環比</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#166534;font-weight:700">趨勢</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`

  return card(header + body, '#059669')
}

/* ═══════════════════════════════════════════════════════════════
   Section 3: 年度對比
═══════════════════════════════════════════════════════════════ */
function renderComparisonHTML({ comparisonData }) {
  const byYear = comparisonData?.byYear || []
  if (!byYear.length) return ''

  const header = sectionHeader('年度業績對比', '各年度銷售摘要', '#7c3aed')
  const maxVal = Math.max(...byYear.map(d => d.subtotal))

  const rows = byYear.map((r, i) => {
    const prev = byYear[i - 1]
    const chg = prev ? fmtPct(r.subtotal, prev.subtotal) : ''
    const isPos = chg.startsWith('+')
    const barW = maxVal > 0 ? r.subtotal / maxVal * 100 : 0
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;font-size:14px;font-weight:800;color:#1f2937">${r.year}</td>
      <td style="padding:10px 16px;text-align:right;font-size:14px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(r.subtotal)}</td>
      <td style="padding:10px 16px;text-align:right;font-size:13px;color:#6b7280;font-family:monospace">${Math.round(r.quantity || 0).toLocaleString()}</td>
      <td style="padding:10px 16px;text-align:right;font-size:14px;font-weight:800;color:${isPos ? '#059669' : chg ? '#ef4444' : '#9ca3af'}">${chg || '基準年'}</td>
      <td style="padding:10px 16px;min-width:140px">${hBar(barW, '#7c3aed', 8)}</td>
    </tr>`
  }).join('')

  const body = `<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#faf5ff;border-bottom:2px solid #e9d5ff">
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6b21a8;font-weight:700">年份</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#6b21a8;font-weight:700">銷售金額</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#6b21a8;font-weight:700">銷售數量</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;color:#6b21a8;font-weight:700">年增率</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6b21a8;font-weight:700">相對規模</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`

  return card(header + body, '#7c3aed')
}

/* ═══════════════════════════════════════════════════════════════
   Section 4 & 5: 產品 / 客戶 TOP 排行
═══════════════════════════════════════════════════════════════ */
function renderRankingHTML({ items = [], title, subtitle, color, metricLabel = '銷售金額' }) {
  if (!items.length) return ''
  const top = items.slice(0, 20)
  const total = items.reduce((s, d) => s + (d.subtotal || 0), 0)
  const maxVal = top[0]?.subtotal || 1

  const header = sectionHeader(title, subtitle, color)
  const rows = top.map((d, i) => {
    const pct = total > 0 ? d.subtotal / total * 100 : 0
    const barW = d.subtotal / maxVal * 100
    const rankColor = i === 0 ? '#d97706' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#e5e7eb'
    const rankText = i === 0 ? '#92400e' : i < 3 ? '#374151' : '#6b7280'
    return `<tr style="border-bottom:1px solid #f3f4f6;${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:8px 14px;text-align:center">
        <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${rankColor};color:${rankText};font-size:11px;font-weight:800;line-height:22px;text-align:center">${i + 1}</span>
      </td>
      <td style="padding:8px 14px;font-size:12px;font-weight:600;color:#1f2937;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
      <td style="padding:8px 14px;text-align:right;font-size:12px;font-weight:700;color:#111827;font-family:monospace">NT$ ${fmtN(d.subtotal)}</td>
      <td style="padding:8px 14px;text-align:right;font-size:12px;color:#6b7280;font-family:monospace">${Math.round(d.quantity || 0).toLocaleString()}</td>
      <td style="padding:8px 14px;text-align:right;font-size:11px;color:#9ca3af">${pct.toFixed(1)}%</td>
      <td style="padding:8px 14px;min-width:100px">${hBar(barW, color, 7)}</td>
    </tr>`
  }).join('')

  const body = `
  <div style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">
    共 ${items.length} 項，顯示前 ${top.length} 名 · 總計 NT$ ${fmtN(total)}
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:2px solid ${color}33;background:${color}08">
        <th style="padding:9px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;width:36px">排名</th>
        <th style="padding:9px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700">名稱</th>
        <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">${metricLabel}</th>
        <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">數量</th>
        <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">佔比</th>
        <th style="padding:9px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700">相對規模</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`

  return card(header + body, color)
}

/* ═══════════════════════════════════════════════════════════════
   Section 6: 品牌 & 通路（並排）
═══════════════════════════════════════════════════════════════ */
function renderBrandChannelHTML({ brandData = [], channelData = [], channelTypeData = [] }) {
  const renderMiniTable = (items, color) => {
    const total = items.reduce((s, d) => s + (d.subtotal || 0), 0)
    const maxV = items[0]?.subtotal || 1
    return items.slice(0, 10).map((d, i) => {
      const pct = total > 0 ? d.subtotal / total * 100 : 0
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:7px 12px;font-size:11px;font-weight:700;color:#1f2937;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
        <td style="padding:7px 12px;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#111827">${fmtN(d.subtotal)}</td>
        <td style="padding:7px 12px;text-align:right;font-size:11px;color:#9ca3af">${pct.toFixed(0)}%</td>
        <td style="padding:7px 12px;min-width:70px">${hBar(d.subtotal / maxV * 100, color, 6)}</td>
      </tr>`
    }).join('')
  }

  const total = channelData.reduce((s, d) => s + (d.subtotal || 0), 0)

  return `
  <div style="border-radius:14px;overflow:hidden;border:1.5px solid #d97706aa;margin-bottom:20px">
    ${sectionHeader('品牌 & 通路分析', '各維度銷售貢獻', '#d97706')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;background:white">
      <div style="border-right:1px solid #f3f4f6">
        <div style="padding:10px 14px;font-size:12px;font-weight:700;color:#92400e;border-bottom:1px solid #fef3c7;background:#fffbeb">✨ 品牌排行（前 10）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid #f3f4f6;background:#fafafa">
            <th style="padding:7px 12px;text-align:left;font-size:10px;color:#6b7280;font-weight:700">品牌</th>
            <th style="padding:7px 12px;text-align:right;font-size:10px;color:#6b7280;font-weight:700">金額</th>
            <th style="padding:7px 12px;text-align:right;font-size:10px;color:#6b7280;font-weight:700">佔比</th>
            <th style="padding:7px 12px;font-size:10px;color:#6b7280;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${renderMiniTable(brandData, '#d97706')}</tbody>
        </table>
      </div>
      <div>
        <div style="padding:10px 14px;font-size:12px;font-weight:700;color:#92400e;border-bottom:1px solid #fef3c7;background:#fffbeb">🏪 通路排行（前 10）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid #f3f4f6;background:#fafafa">
            <th style="padding:7px 12px;text-align:left;font-size:10px;color:#6b7280;font-weight:700">通路</th>
            <th style="padding:7px 12px;text-align:right;font-size:10px;color:#6b7280;font-weight:700">金額</th>
            <th style="padding:7px 12px;text-align:right;font-size:10px;color:#6b7280;font-weight:700">佔比</th>
            <th style="padding:7px 12px;font-size:10px;color:#6b7280;font-weight:700">規模</th>
          </tr></thead>
          <tbody>${renderMiniTable(channelData, '#0891b2')}</tbody>
        </table>
      </div>
    </div>
    ${channelTypeData.length ? `
    <div style="border-top:2px solid #fef3c7;padding:10px 14px;background:#fffbeb">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px">通路類型分布</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${channelTypeData.slice(0, 6).map(d => {
          const pct = total > 0 ? d.subtotal / total * 100 : 0
          return `<div style="background:white;border-radius:8px;padding:8px 12px;border:1px solid #fde68a;flex:1;min-width:80px">
            <div style="font-size:10px;color:#6b7280;font-weight:600">${esc(d.name)}</div>
            <div style="font-size:14px;font-weight:800;color:#d97706;margin-top:2px">${fmtN(d.subtotal)}</div>
            <div style="font-size:10px;color:#9ca3af">${pct.toFixed(0)}%</div>
          </div>`
        }).join('')}
      </div>
    </div>` : ''}
  </div>`
}

/* ═══════════════════════════════════════════════════════════════
   HTML → Canvas
═══════════════════════════════════════════════════════════════ */
async function htmlToCanvas(html, width = 820) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;background:white;padding:24px 28px;z-index:-9999;box-sizing:border-box;font-family:system-ui,-apple-system,"Microsoft JhengHei","PingFang TC",sans-serif`
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const canvas = await html2canvas(wrapper, {
    scale: 1.8,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    width,
    height: wrapper.scrollHeight,
    windowWidth: width,
  })
  document.body.removeChild(wrapper)
  return canvas
}

/* 把一個 canvas 切成多個 A4 頁（portrait）*/
function splitCanvasToPages(canvas) {
  const pageH = Math.round(canvas.width * 1.414)
  const pages = []
  let offsetY = 0
  while (offsetY < canvas.height) {
    const sliceH = Math.min(pageH, canvas.height - offsetY)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = pageH
    const ctx = pageCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, pageH)
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    pages.push(pageCanvas)
    offsetY += pageH
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
  const margin = 8
  const availW = pageW - margin * 2
  const availH = pageH - margin * 2 - 6

  let isFirst = true
  for (const canvas of canvases) {
    if (!isFirst) pdf.addPage()
    isFirst = false
    const imgData = canvas.toDataURL('image/jpeg', 0.93)
    const ratio = canvas.width / canvas.height
    let w = availW, h = w / ratio
    if (h > availH) { h = availH; w = h * ratio }
    const x = margin + (availW - w) / 2
    const y = margin + (availH - h) / 2
    pdf.addImage(imgData, 'JPEG', x, y, w, h)
  }

  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(170, 170, 170)
    pdf.text(`${i} / ${total}`, pageW - margin, pageH - 2.5, { align: 'right' })
    if (footerText) pdf.text(footerText, margin, pageH - 2.5)
  }
  return pdf
}

/* ═══════════════════════════════════════════════════════════════
   主匯出：儀表板 PDF（純 HTML 渲染）
═══════════════════════════════════════════════════════════════ */
export async function exportDashboardPDF({ salesData = {}, onProgress }) {
  const { summary, trendData, comparisonData, productData, customerData, brandData, channelData, channelTypeData } = salesData
  const allPageCanvases = []

  const sections = [
    { name: 'KPI 封面', html: renderCoverHTML({ summary, trendData, comparisonData }) },
    { name: '月份趨勢', html: renderTrendHTML({ trendData }) },
    { name: '年度對比', html: renderComparisonHTML({ comparisonData }) },
    { name: '產品排行', html: renderRankingHTML({ items: productData || [], title: '產品銷售排行', subtitle: 'TOP 20 產品', color: '#e11d48' }) },
    { name: '客戶排行', html: renderRankingHTML({ items: customerData || [], title: '客戶銷售排行', subtitle: 'TOP 20 客戶', color: '#0891b2' }) },
    { name: '品牌通路', html: renderBrandChannelHTML({ brandData: brandData || [], channelData: channelData || [], channelTypeData: channelTypeData || [] }) },
  ]

  for (const sec of sections) {
    if (!sec.html) continue
    onProgress?.(`渲染 ${sec.name}...`)
    const canvas = await htmlToCanvas(sec.html)
    const pages = splitCanvasToPages(canvas)
    allPageCanvases.push(...pages)
  }

  onProgress?.('建立 PDF 檔案...')
  const footer = `銷售數據分析報告 · ${new Date().toLocaleDateString('zh-TW')}`
  const pdf = buildPDF(allPageCanvases, footer)
  const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* ═══════════════════════════════════════════════════════════════
   Markdown → styled HTML（AI 分析報告用）
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
    } else {
      if (curr) curr.lines.push(line)
      else preLines.push(line)
    }
  }
  if (curr) sections.push(curr)
  else if (preLines.length) sections.push({ title: null, lines: preLines })

  let sectionCount = 0
  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
  let html = `<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white;box-sizing:border-box;word-wrap:break-word">`
  html += `<div style="background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;padding:32px;border-radius:16px;margin-bottom:20px">
    <div style="font-size:11px;opacity:.7;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">AI 智慧分析報告</div>
    <div style="font-size:22px;font-weight:900;margin-bottom:4px">${inlineHTML(docTitle || TYPE_LABELS[analysisType] || 'AI 分析')}</div>
    <div style="font-size:11px;opacity:.6">${dateStr}</div>
  </div>`
  sections.filter(s => s.title).forEach(section => {
    const color = COLORS[sectionCount % COLORS.length]; sectionCount++
    html += `<div style="border-radius:14px;overflow:hidden;margin-bottom:16px;border:1px solid ${color}25">
      <div style="background:${color};padding:12px 20px;display:flex;align-items:center;gap:12px">
        <span style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.25);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:white;flex-shrink:0">${sectionCount}</span>
        <span style="font-size:14px;font-weight:700;color:white">${inlineHTML(section.title)}</span>
      </div>
      <div style="background:${color}0d;padding:16px 20px">${renderSectionHTML(section.lines, color)}</div>
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
  const footer = `AI 智慧分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`
  const pdf = buildPDF(pages, footer)
  const filename = `AI分析_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* ═══════════════════════════════════════════════════════════════
   完整報告 PDF：AI 分析 + 儀表板資料
═══════════════════════════════════════════════════════════════ */
export async function exportFullReportPDF({ salesData = {}, aiContent, analysisType, onProgress }) {
  const allPageCanvases = []
  const { summary, trendData, comparisonData, productData, customerData, brandData, channelData, channelTypeData } = salesData

  // 1. 封面頁
  onProgress?.('建立封面...')
  const coverCanvas = await htmlToCanvas(renderCoverHTML({ summary, trendData, comparisonData }))
  splitCanvasToPages(coverCanvas).forEach(c => allPageCanvases.push(c))

  // 2. AI 分析內容
  onProgress?.('渲染 AI 報告...')
  const aiPages = await renderMarkdownToCanvases(aiContent, analysisType)
  aiPages.forEach(c => allPageCanvases.push(c))

  // 3. 儀表板各節
  const sections = [
    { name: '月份趨勢', html: renderTrendHTML({ trendData }) },
    { name: '年度對比', html: renderComparisonHTML({ comparisonData }) },
    { name: '產品排行', html: renderRankingHTML({ items: productData || [], title: '產品銷售排行', subtitle: 'TOP 20', color: '#e11d48' }) },
    { name: '客戶排行', html: renderRankingHTML({ items: customerData || [], title: '客戶銷售排行', subtitle: 'TOP 20', color: '#0891b2' }) },
    { name: '品牌通路', html: renderBrandChannelHTML({ brandData: brandData || [], channelData: channelData || [], channelTypeData: channelTypeData || [] }) },
  ]
  for (const sec of sections) {
    if (!sec.html) continue
    onProgress?.(`渲染 ${sec.name}...`)
    const canvas = await htmlToCanvas(sec.html)
    splitCanvasToPages(canvas).forEach(c => allPageCanvases.push(c))
  }

  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  const footer = `完整銷售分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`
  onProgress?.('建立 PDF...')
  const pdf = buildPDF(allPageCanvases, footer)
  const filename = `完整報告_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/* 保留供外部調用 */
export async function captureElement(el) {
  return htmlToCanvas(el.outerHTML)
}

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── Shared PDF builder (portrait A4, auto page-split) ─────────────────────────
function buildPDF(canvases, footerText) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 210
  const pageH = pdf.internal.pageSize.getHeight()  // 297
  const margin = 10
  const availW = pageW - margin * 2
  const availH = pageH - margin * 2

  let isFirst = true
  for (const { canvas } of canvases) {
    // Split each canvas (may be very tall) into A4 portrait pages
    const pages = splitCanvasToPages(canvas)
    for (const pageCanvas of pages) {
      if (!isFirst) pdf.addPage()
      isFirst = false
      const imgData = pageCanvas.toDataURL('image/jpeg', 0.92)
      const ratio = pageCanvas.width / pageCanvas.height
      let w = availW, h = w / ratio
      if (h > availH) { h = availH; w = h * ratio }
      pdf.addImage(imgData, 'JPEG', margin + (availW - w) / 2, margin + (availH - h) / 2, w, h)
    }
  }

  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(150, 150, 150)
    pdf.text(`${i} / ${total}`, pageW - margin, pageH - 3, { align: 'right' })
    pdf.text(footerText, margin, pageH - 3)
  }
  return pdf
}

// ─── KPI Summary cover page ─────────────────────────────────────────────────
function fmtN(n) {
  if (!n) return '0'
  if (n >= 1e8) return (n / 1e8).toFixed(0) + ' 億'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 萬'
  return Math.round(n).toLocaleString()
}

function renderSummaryPageHTML({ summary = {}, trendData = [] }) {
  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
  const { totalSales = 0, totalQty = 0, orderCount = 0, customerCount = 0, productCount = 0 } = summary

  const months = trendData.map(d => d.yearMonth).sort()
  const periodStart = months[0] || '—'
  const periodEnd = months[months.length - 1] || '—'

  const peakMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal >= b.subtotal ? a : b) : null
  const lowMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal <= b.subtotal ? a : b) : null
  const avgMonthly = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.subtotal, 0) / trendData.length) : 0

  const kpis = [
    { label: '總銷售金額', value: `NT$ ${fmtN(totalSales)}`, sub: Math.round(totalSales).toLocaleString() + ' 元', color: '#2563eb' },
    { label: '銷售數量', value: Math.round(totalQty).toLocaleString(), sub: '件', color: '#059669' },
    { label: '訂單筆數', value: Math.round(orderCount).toLocaleString(), sub: '筆', color: '#7c3aed' },
    { label: '客戶數', value: customerCount > 0 ? Math.round(customerCount).toLocaleString() : '—', sub: '不重複客戶', color: '#d97706' },
    { label: '品項數', value: productCount > 0 ? Math.round(productCount).toLocaleString() : '—', sub: '不重複品項', color: '#e11d48' },
    { label: '月均銷售', value: fmtN(avgMonthly), sub: '元/月', color: '#0891b2' },
  ]

  return `<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb,#4f46e5);padding:40px;border-radius:20px;margin-bottom:24px;color:white">
    <div style="font-size:11px;opacity:0.7;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">銷售數據分析系統</div>
    <div style="font-size:28px;font-weight:900;margin-bottom:6px">完整銷售分析報告</div>
    <div style="font-size:13px;opacity:0.7;margin-bottom:20px">報告產生日期：${dateStr}</div>
    <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px 18px;display:inline-block">
      <div style="font-size:11px;opacity:0.8;margin-bottom:4px">分析週期</div>
      <div style="font-size:16px;font-weight:700">${periodStart} ～ ${periodEnd}</div>
      <div style="font-size:11px;opacity:0.7;margin-top:2px">${months.length} 個月份資料</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    ${kpis.map(k => `
    <div style="border-radius:14px;border:1.5px solid ${k.color}22;overflow:hidden">
      <div style="height:4px;background:${k.color}"></div>
      <div style="padding:16px 18px">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:600">${k.label}</div>
        <div style="font-size:22px;font-weight:900;color:#111827;line-height:1.1">${k.value}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${k.sub}</div>
      </div>
    </div>`).join('')}
  </div>

  ${trendData.length > 0 ? `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#065f46;margin-bottom:8px">📈 最高銷售月</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${peakMonth?.yearMonth || '—'}</div>
      <div style="font-size:12px;color:#059669;font-weight:600;margin-top:4px">${peakMonth ? Math.round(peakMonth.subtotal).toLocaleString() + ' 元' : '—'}</div>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#991b1b;margin-bottom:8px">📉 最低銷售月</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${lowMonth?.yearMonth || '—'}</div>
      <div style="font-size:12px;color:#ef4444;font-weight:600;margin-top:4px">${lowMonth ? Math.round(lowMonth.subtotal).toLocaleString() + ' 元' : '—'}</div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px 18px">
      <div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:8px">📊 月均銷售</div>
      <div style="font-size:16px;font-weight:800;color:#111827">${Math.round(avgMonthly).toLocaleString()} 元</div>
      <div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:4px">共 ${months.length} 個月</div>
    </div>
  </div>` : ''}
</div>`
}

async function renderSummaryToCanvas(summaryData) {
  const html = renderSummaryPageHTML(summaryData)
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:824px;background:white;padding:32px;z-index:-9999;box-sizing:border-box'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const canvas = await html2canvas(wrapper, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 })
  document.body.removeChild(wrapper)
  return splitCanvasToPages(canvas)
}

// ─── Dashboard-only PDF (original) ────────────────────────────────────────────
export async function exportDashboardPDF({ canvases, summaryData, onProgress }) {
  onProgress?.('建立 PDF...')
  const allCanvases = []
  if (summaryData) {
    onProgress?.('建立摘要頁...')
    const summaryPages = await renderSummaryToCanvas(summaryData)
    summaryPages.forEach((canvas, i) => allCanvases.push({ canvas, title: `摘要 ${i + 1}` }))
  }
  allCanvases.push(...canvases)
  const footer = `Sales Dashboard - ${new Date().toLocaleDateString('zh-TW')}`
  const pdf = buildPDF(allCanvases, footer)
  const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

export async function captureElement(el) {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f9fafb',
    logging: false,
    imageTimeout: 10000,
    scrollX: 0,
    scrollY: 0,
  })
}

// ─── Markdown → styled HTML (for PDF capture) ─────────────────────────────────
const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#4f46e5']
const TYPE_LABELS = { comprehensive: '完整分析', channel: '通路分析', product: '產品開發', growth: '成長策略' }

function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineHTML(t) {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#eff6ff;color:#1d4ed8;padding:1px 5px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function renderSectionHTML(lines, color) {
  let html = ''
  let listType = null, listItems = [], inCode = false, codeLines = []

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
      html += `<p style="font-size:13px;color:#374151;margin:3px 0;line-height:1.6;word-wrap:break-word;overflow-wrap:break-word">${inlineHTML(line)}</p>`
    }
  })
  flushList()
  return html
}

function markdownToStyledHTML(text, analysisType) {
  const lines = text.split('\n')
  let docTitle = ''
  const sections = []
  let preLines = [], curr = null

  for (const line of lines) {
    if (line.startsWith('# ') && !docTitle) { docTitle = line.slice(2) }
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

  let html = `<div style="font-family:system-ui,-apple-system,sans-serif;width:760px;background:white;box-sizing:border-box;word-wrap:break-word;overflow-wrap:break-word">`

  // Title block
  html += `<div style="background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;padding:32px;border-radius:16px;margin-bottom:20px">
    <div style="font-size:11px;opacity:0.7;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">AI 智慧分析報告</div>
    <div style="font-size:22px;font-weight:900;margin-bottom:4px">${inlineHTML(docTitle || TYPE_LABELS[analysisType] || 'AI 分析')}</div>
    <div style="font-size:11px;opacity:0.6;margin-bottom:16px">${dateStr}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${['🏢 企業管理專家', '📊 市場分析專家', '🎯 產品PM', '🔬 研發評估'].map(e =>
        `<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,0.2)">${e}</span>`
      ).join('')}
    </div>
  </div>`

  // Sections
  sections.filter(s => s.title).forEach(section => {
    const color = COLORS[sectionCount % COLORS.length]
    sectionCount++
    html += `<div style="border-radius:14px;overflow:hidden;margin-bottom:16px;border:1px solid ${color}25">
      <div style="background:${color};padding:12px 20px;display:flex;align-items:center;gap:12px">
        <span style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.25);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:white;flex-shrink:0">${sectionCount}</span>
        <span style="font-size:14px;font-weight:700;color:white">${inlineHTML(section.title)}</span>
      </div>
      <div style="background:${color}0d;padding:16px 20px">${renderSectionHTML(section.lines, color)}</div>
    </div>`
  })

  html += '</div>'
  return html
}

// ─── Split tall canvas into A4 portrait pages ──────────────────────────────────
function splitCanvasToPages(canvas) {
  // A4 portrait at 1.5x scale: width=780px content, height ~ 780 * √2 ≈ 1103px
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

async function renderMarkdownToCanvases(text, analysisType) {
  const html = markdownToStyledHTML(text, analysisType)
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:824px;background:white;padding:32px;z-index:-9999;box-sizing:border-box'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const canvas = await html2canvas(wrapper, {
    scale: 1.5,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
  })
  document.body.removeChild(wrapper)
  return splitCanvasToPages(canvas)
}

// ─── AI report PDF only ────────────────────────────────────────────────────────
export async function exportAIReportPDF({ content, analysisType }) {
  const pages = await renderMarkdownToCanvases(content, analysisType)
  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  const footer = `AI 智慧分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`
  const pdf = buildPDF(pages.map((canvas, i) => ({ canvas, title: `AI報告 ${i + 1}` })), footer)
  const filename = `AI分析_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

// ─── Full report PDF: summary page + AI pages + dashboard pages ────────────────
export async function exportFullReportPDF({ canvases, aiContent, analysisType, summaryData, onProgress }) {
  const allCanvases = []

  // 1. Summary / KPI cover page
  if (summaryData) {
    onProgress?.('建立摘要封面頁...')
    const summaryPages = await renderSummaryToCanvas(summaryData)
    summaryPages.forEach((canvas, i) => allCanvases.push({ canvas, title: `摘要 ${i + 1}` }))
  }

  // 2. AI analysis pages
  onProgress?.('準備 AI 報告內容...')
  const aiPages = await renderMarkdownToCanvases(aiContent, analysisType)
  aiPages.forEach((canvas, i) => allCanvases.push({ canvas, title: `AI 分析報告 第${i + 1}頁` }))

  // 3. Dashboard screenshots
  allCanvases.push(...canvases)

  const typeLabel = TYPE_LABELS[analysisType] || analysisType
  const footer = `完整銷售分析報告 · ${typeLabel} · ${new Date().toLocaleDateString('zh-TW')}`
  onProgress?.('建立 PDF 檔案...')
  const pdf = buildPDF(allCanvases, footer)
  const filename = `完整報告_${typeLabel}_${new Date().toISOString().slice(0, 10)}.pdf`
  pdf.save(filename)
  return filename
}

/**
 * pdfBoard.js — 董事長版 PDF（6 頁定稿）
 * 設計原則：每頁回答一個問題／每個數字帶對比／紅黃綠燈取代形容詞／
 * 圖表優先文字精簡／大字高對比（基準 16px、KPI 44px，適合年長閱讀）。
 * P1 一頁結論 → P2 領航員 → P3 營收曲線 → P4 結構排名 → P5 風險異常 → P6 提請決議
 */
import { forecastYearEnd } from './forecast'
import { festivalsByMonth } from './lunarFestivals'

const INK = '#111827', SUB = '#374151', MUT = '#6b7280'
const GREEN = '#059669', AMBER = '#d97706', RED = '#dc2626'
const PINE = '#0f766e'

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const W = v => {
  if (v == null || isNaN(v)) return '—'
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (Math.abs(v) >= 1e4) return Math.round(v / 1e4).toLocaleString() + ' 萬'
  return Math.round(v).toLocaleString()
}
const pctS = (cur, prev) => prev > 0 ? `${cur >= prev ? '+' : '−'}${Math.abs((cur - prev) / prev * 100).toFixed(0)}%` : '—'
const lightColor = r => r == null ? MUT : r >= 1 ? GREEN : r >= 0.9 ? AMBER : RED
const lightWord = r => r == null ? '—' : r >= 1 ? '達標' : r >= 0.9 ? '接近' : '落後'

/* ── SVG 圖表 ─────────────────────────────────────────────────── */

/** 半圓儀表：達成率 */
function svgGauge(ratio, size = 190) {
  const r = size / 2 - 16, cx = size / 2, cy = size / 2
  const pct = Math.max(0, Math.min(ratio ?? 0, 1.3))
  const color = lightColor(ratio)
  const arc = (from, to, stroke, w2) => {
    const a0 = Math.PI * (1 + from), a1 = Math.PI * (1 + to)
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${stroke}" stroke-width="${w2}" fill="none" stroke-linecap="round"/>`
  }
  return `<svg width="${size}" height="${size * 0.62}" viewBox="0 0 ${size} ${size * 0.62}">
    ${arc(0, 1, '#e5e7eb', 16)}
    ${pct > 0.02 ? arc(0, Math.min(pct, 1), color, 16) : ''}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="34" font-weight="900" fill="${color}">${ratio != null ? Math.round(ratio * 100) + '%' : '—'}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="14" fill="${MUT}">${lightWord(ratio)}</text>
  </svg>`
}

/** 月度折線：今年實線 / 去年虛線 / 預測空心點 */
function svgTrend(cur, prev, fc, w = 660, h = 240) {
  const P = { l: 56, r: 16, t: 18, b: 30 }
  const iw = w - P.l - P.r, ih = h - P.t - P.b
  const all = [...cur, ...prev, ...fc].filter(v => v != null)
  const maxV = Math.max(...all, 1) * 1.08
  const x = i => P.l + iw * i / 11
  const y = v => P.t + ih * (1 - v / maxV)
  const path = (arr, exclNull = true) => {
    let d = '', pen = false
    arr.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += (pen ? ' L ' : ' M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)
      pen = true
    })
    return d
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const v = maxV * t, yy = y(v)
    return `<line x1="${P.l}" y1="${yy}" x2="${w - P.r}" y2="${yy}" stroke="#f3f4f6"/>
      <text x="${P.l - 6}" y="${yy + 4}" text-anchor="end" font-size="12" fill="${MUT}">${W(v)}</text>`
  }).join('')
  const xlabels = Array.from({ length: 12 }, (_, i) =>
    `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="12" fill="${MUT}">${i + 1}月</text>`).join('')
  const dots = (arr, color, hollow) => arr.map((v, i) => v == null ? '' :
    `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${hollow ? '#fff' : color}" stroke="${color}" stroke-width="2"/>`).join('')
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${ticks}${xlabels}
    <path d="${path(prev)}" stroke="#9ca3af" stroke-width="2.5" stroke-dasharray="6 5" fill="none"/>
    <path d="${path(cur)}" stroke="#2563eb" stroke-width="3.5" fill="none"/>
    <path d="${path(fc)}" stroke="${AMBER}" stroke-width="2.5" stroke-dasharray="2 4" fill="none"/>
    ${dots(cur, '#2563eb', false)}${dots(fc, AMBER, true)}
  </svg>`
}

/** 甜甜圈：通路占比 */
function svgDonut(items, size = 230) {
  const total = items.reduce((s, d) => s + d.value, 0) || 1
  const cx = size / 2, cy = size / 2, r = size / 2 - 10, ir = r * 0.58
  const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#84cc16', '#94a3b8']
  let a = -Math.PI / 2, out = ''
  items.forEach((d, i) => {
    const frac = d.value / total
    const a1 = a + frac * Math.PI * 2
    const large = frac > 0.5 ? 1 : 0
    const p = (rr, ang) => `${(cx + rr * Math.cos(ang)).toFixed(1)} ${(cy + rr * Math.sin(ang)).toFixed(1)}`
    out += `<path d="M ${p(r, a)} A ${r} ${r} 0 ${large} 1 ${p(r, a1)} L ${p(ir, a1)} A ${ir} ${ir} 0 ${large} 0 ${p(ir, a)} Z" fill="${COLORS[i % COLORS.length]}"/>`
    if (frac > 0.06) {
      const mid = (a + a1) / 2, lr = (r + ir) / 2
      out += `<text x="${(cx + lr * Math.cos(mid)).toFixed(1)}" y="${(cy + lr * Math.sin(mid)).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${Math.round(frac * 100)}%</text>`
    }
    a = a1
  })
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${out}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15" fill="${MUT}">通路結構</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="16" font-weight="800" fill="${INK}">${W(total)}</text>
  </svg>`
}

/** 橫向長條 TOP5（含 ±% 徽章） */
function svgHBars(items, color, w = 320) {
  // 品名不截斷：超過一行自動折成第二行（最多兩行，涵蓋現有最長品名）
  const L1 = 21
  const rowH = 66, maxV = Math.max(...items.map(d => d.value), 1)
  const h = items.length * rowH + 4
  const rows = items.map((d, i) => {
    const yy = i * rowH
    const bw = Math.max(6, (w - 130) * d.value / maxV)
    const g = d.growth
    const gc = g == null ? MUT : g >= 0 ? GREEN : RED
    const gt = g == null ? 'new' : `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(0)}%`
    const l1 = d.name.slice(0, L1), l2 = d.name.slice(L1, L1 * 2)
    return `
      <text x="0" y="${yy + 15}" font-size="14" font-weight="700" fill="${SUB}">${esc(l1)}</text>
      ${l2 ? `<text x="0" y="${yy + 31}" font-size="14" font-weight="700" fill="${SUB}">${esc(l2)}</text>` : ''}
      <rect x="0" y="${yy + 38}" width="${bw}" height="14" rx="7" fill="${color}"/>
      <text x="${bw + 8}" y="${yy + 50}" font-size="14" font-weight="800" fill="${INK}">${W(d.value)}</text>
      <text x="${w - 4}" y="${yy + 50}" text-anchor="end" font-size="13" font-weight="800" fill="${gc}">${gt}</text>`
  }).join('')
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rows}</svg>`
}

/** 目標階梯：未來 6 年目標柱＋今年實際/預測疊加 */
function svgLadder(rows, currentYear, w = 660, h = 250) {
  const P = { l: 60, r: 14, t: 16, b: 30 }
  const iw = w - P.l - P.r, ih = h - P.t - P.b
  const shown = rows.filter(r => r.year >= parseInt(currentYear) && r.year <= parseInt(currentYear) + 5)
  const maxV = Math.max(...shown.map(r => r.tC), 1) * 1.06
  const bw2 = iw / shown.length
  const y = v => P.t + ih * (1 - v / maxV)
  const bars = shown.map((r, i) => {
    const xx = P.l + bw2 * i + bw2 * 0.16
    const wd = bw2 * 0.68
    const isCur = String(r.year) === String(currentYear)
    let s = `<rect x="${xx}" y="${y(r.tC)}" width="${wd}" height="${ih + P.t - y(r.tC)}" rx="6" fill="${isCur ? '#dbeafe' : '#f1f5f9'}" stroke="#cbd5e1" stroke-width="1.5"/>`
    s += `<rect x="${xx + wd * 0.14}" y="${y(r.tH)}" width="${wd * 0.72}" height="${ih + P.t - y(r.tH)}" rx="5" fill="#a7f3d0"/>`
    if (isCur && r.aC != null) {
      s += `<line x1="${xx - 4}" y1="${y(r.aC)}" x2="${xx + wd + 4}" y2="${y(r.aC)}" stroke="${lightColor(r.rC)}" stroke-width="4" stroke-linecap="round"/>`
      s += `<text x="${xx + wd / 2}" y="${y(r.aC) - 8}" text-anchor="middle" font-size="14" font-weight="900" fill="${lightColor(r.rC)}">預測 ${W(r.aC)}</text>`
    }
    s += `<text x="${xx + wd / 2}" y="${h - 10}" text-anchor="middle" font-size="14" font-weight="${isCur ? 900 : 600}" fill="${isCur ? '#1d4ed8' : MUT}">${r.year}${r.milestone ? '·' + r.milestone : ''}</text>`
    s += `<text x="${xx + wd / 2}" y="${y(r.tC) - 6}" text-anchor="middle" font-size="12" fill="${MUT}">${W(r.tC)}</text>`
    return s
  }).join('')
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`
}

/* ── 共用版面 ─────────────────────────────────────────────────── */
function page(title, question, bodyHTML, color = PINE) {
  return `<div style="font-size:16px;line-height:1.6;color:${INK}">
    <div style="background:linear-gradient(120deg,${color},${color}cc);color:#fff;padding:20px 26px;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:24px;font-weight:900;letter-spacing:1px">${title}</div>
        <div style="font-size:15px;opacity:.92;margin-top:2px">${question}</div>
      </div>
      <div style="font-size:15px;opacity:.9">${new Date().toLocaleDateString('zh-TW')}</div>
    </div>
    <div style="border:2px solid ${color}30;border-top:none;border-radius:0 0 14px 14px;background:#fff;padding:22px 26px">${bodyHTML}</div>
  </div>`
}

/* ── 資料模型（一次算齊 6 頁所需） ───────────────────────────── */
export function buildBoardModel({ allRows = [], navConfig = {}, agenda = [] }) {
  if (!allRows.length) return null
  const cfg = {
    vision: '成為台灣年輕漢方飲品與足浴、傳統文化的領頭羊',
    baseYear: 2025, baseCompany: 16364148, baseHero: 5595691,
    cagrCompany: 0.25, cagrHero: 0.35, ...navConfig,
  }
  const HERO = '好漢草'
  const fcC = forecastYearEnd(allRows)
  const fcH = forecastYearEnd(allRows.filter(r => r.brand === HERO))
  const cy = fcC?.year || String(new Date().getFullYear())
  const py = String(parseInt(cy) - 1)
  const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  // 月度序列（完整月）＋去年 12 月＋各維度彙總
  const curM = Array(12).fill(null), prevM = Array(12).fill(null)
  const doneMonths = new Set()
  const agg = { chType: {}, chTypePrev: {}, brand: {}, brandPrev: {}, prod: {}, cust: {} }
  let ytd = 0, prevSame = 0
  for (const r of allRows) {
    const v = r.subtotal || 0
    const mi = parseInt(r.month) - 1
    if (r.year === cy && r.yearMonth < nowYM) {
      curM[mi] = (curM[mi] || 0) + v; ytd += v; doneMonths.add(r.month)
      agg.chType[r.channelType || '其他'] = (agg.chType[r.channelType || '其他'] || 0) + v
      if (r.brand) agg.brand[r.brand] = (agg.brand[r.brand] || 0) + v
      if (r.product) agg.prod[r.product] = (agg.prod[r.product] || 0) + v
    } else if (r.year === py) {
      prevM[mi] = (prevM[mi] || 0) + v
      agg.chTypePrev[r.channelType || '其他'] = (agg.chTypePrev[r.channelType || '其他'] || 0) + v
      if (r.brand) agg.brandPrev[r.brand] = (agg.brandPrev[r.brand] || 0) + v
    }
  }
  // 去年同視窗（doneMonths 齊備後計算）
  for (const r of allRows) if (r.year === py && doneMonths.has(r.month)) prevSame += r.subtotal || 0

  // 預測月值（季節指數）
  const fcM = Array(12).fill(null)
  if (fcC?.projected && ytd > 0) {
    const remain = fcC.projected - ytd
    const idx = []
    for (let i = 0; i < 12; i++) {
      if (curM[i] != null) { idx.push(0); continue }
      const base = (getPM(prevM, i) ?? 0) + 1
      idx.push(base)
    }
    const idxSum = idx.reduce((s, v) => s + v, 0) || 1
    for (let i = 0; i < 12; i++) if (idx[i] > 0) fcM[i] = remain * idx[i] / idxSum
    // 接點：讓預測線從最後一個實際月延伸
    const lastDone = curM.reduce((m, v, i) => v != null ? i : m, -1)
    if (lastDone >= 0 && lastDone < 11) fcM[lastDone] = curM[lastDone]
  }
  function getPM(arr, i) { return arr[i] }

  // 目標階梯
  const n = parseInt(cy) - cfg.baseYear
  const ladder = []
  for (let k = Math.max(1, n); k <= Math.min(11, n + 5); k++) {
    const yy = cfg.baseYear + k
    ladder.push({
      year: yy,
      milestone: k === 4 ? '3年' : k === 6 ? '5年' : k === 11 ? '10年' : '',
      tC: cfg.baseCompany * Math.pow(1 + cfg.cagrCompany, k),
      tH: cfg.baseHero * Math.pow(1 + cfg.cagrHero, k),
      aC: yy === parseInt(cy) ? fcC?.projected : null,
      rC: yy === parseInt(cy) && fcC?.projected ? fcC.projected / (cfg.baseCompany * Math.pow(1 + cfg.cagrCompany, k)) : null,
    })
  }
  const curLadder = ladder.find(l => l.year === parseInt(cy))
  const targetC = curLadder?.tC, targetH = cfg.baseHero * Math.pow(1 + cfg.cagrHero, n)

  const top5 = (map, prevMap) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => {
      // 前一年同月份視窗
      let pv = 0
      for (const r of allRows) if (r.year === py && doneMonths.has(r.month) && ((map === agg.brand && r.brand === name) || (map === agg.chType && (r.channelType || '其他') === name) || (map === agg.prod && r.product === name))) pv += r.subtotal || 0
      return { name, value, growth: pv > 0 ? (value - pv) / pv * 100 : null }
    })

  // 衰退警示（去年同視窗 >10 萬且 −30% 以上）
  const declines = []
  const checkDecline = (curMap, kind) => {
    const pv = {}
    for (const r of allRows) {
      if (r.year !== py || !doneMonths.has(r.month)) continue
      const key = kind === 'brand' ? r.brand : (r.channelType || '其他')
      if (key) pv[key] = (pv[key] || 0) + (r.subtotal || 0)
    }
    for (const [k, p] of Object.entries(pv)) {
      if (p < 100000) continue
      const c = curMap[k] || 0
      const g = (c - p) / p * 100
      if (g <= -30) declines.push({ kind: kind === 'brand' ? '品牌' : '通路', name: k, cur: c, prev: p, g })
    }
  }
  checkDecline(agg.brand, 'brand'); checkDecline(agg.chType, 'ch')
  declines.sort((a, b) => (a.cur - a.prev) - (b.cur - b.prev))

  // 回購逾期大客戶
  const twoYago = `${parseInt(cy) - 2}-01-01`
  const byCust = {}
  for (const r of allRows) {
    if (!r.customer || r.date < twoYago) continue
    ;(byCust[r.customer] ||= { dates: new Set(), total: 0 }).dates.add(r.date)
    byCust[r.customer].total += r.subtotal || 0
  }
  const today = new Date()
  const overdue = []
  for (const [name, d] of Object.entries(byCust)) {
    const ds = [...d.dates].sort()
    if (ds.length < 3) continue
    const span = (new Date(ds[ds.length - 1]) - new Date(ds[0])) / 86400000
    const gap = span / (ds.length - 1)
    if (gap < 3) continue
    const since = (today - new Date(ds[ds.length - 1])) / 86400000
    if (since > gap * 1.5) overdue.push({ name, total: d.total, since: Math.round(since), gap: Math.round(gap) })
  }
  overdue.sort((a, b) => b.total - a.total)

  // 未來 2 個月民俗檔期
  const fests = []
  const fmNow = festivalsByMonth(today.getFullYear())
  const fmNext = festivalsByMonth(today.getFullYear() + (today.getMonth() >= 10 ? 1 : 0))
  for (let k = 0; k <= 2; k++) {
    const mo = today.getMonth() + 1 + k
    const yy2 = today.getFullYear() + (mo > 12 ? 1 : 0)
    const m2 = ((mo - 1) % 12) + 1
    const info = (yy2 === today.getFullYear() ? fmNow : fmNext)[m2]
    if (info?.fests?.length) fests.push({ label: `${m2}月`, items: info.fests })
  }

  // 亮點 / 警訊 / 行動（規則生成）
  const brandT = top5(agg.brand)
  const growers = brandT.filter(b => b.growth != null && b.growth > 20).sort((a, b) => b.growth - a.growth)
  const heroShare = fcC?.projected > 0 ? (fcH?.projected || 0) / fcC.projected : null
  const highlights = []
  if (ytd > prevSame && prevSame > 0) highlights.push(`累計營收 ${W(ytd)}，較去年同期成長 ${pctS(ytd, prevSame)}`)
  if (growers[0]) highlights.push(`${growers[0].name} 成長 ${growers[0].growth >= 0 ? '+' : ''}${growers[0].growth.toFixed(0)}%，為本期最大成長引擎`)
  if (heroShare != null) highlights.push(`好漢草占營收比重達 ${(heroShare * 100).toFixed(0)}%，品牌轉型持續推進`)
  const warnings = []
  const chTop = top5(agg.chType)[0]
  if (chTop && chTop.value / (ytd || 1) > 0.4) warnings.push(`最大通路「${chTop.name}」占比 ${(chTop.value / ytd * 100).toFixed(0)}%，集中度偏高`)
  if (declines[0]) warnings.push(`${declines[0].kind}「${declines[0].name}」較去年同期 ${declines[0].g.toFixed(0)}%（−${W(declines[0].prev - declines[0].cur)}）`)
  if (overdue[0]) warnings.push(`${overdue.length} 位常貿客戶回購逾期，最大貢獻者「${overdue[0].name}」已 ${overdue[0].since} 天未回購`)
  const actions = []
  if (fests[0]) actions.push(`${fests[0].label}逢 ${fests[0].items.join('、')}，請於 30 天前完成備貨與行銷投放`)
  if (targetC && fcC?.projected < targetC) actions.push(`年底預測距目標尚差 ${W(targetC - fcC.projected)}，需於剩餘月份補足`)
  if (targetC && fcC?.projected >= targetC) actions.push(`依目前節奏可達標，建議提前規劃明年 ${parseInt(cy) + 1} 目標展開`)

  return {
    cfg, cy, py, ytd, prevSame, fcC, fcH, targetC, targetH,
    ratioC: targetC ? (fcC?.projected || 0) / targetC : null,
    ratioH: targetH ? (fcH?.projected || 0) / targetH : null,
    heroShare, curM, prevM, fcM, ladder,
    chTypeTop: Object.entries(agg.chType).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
    brandTop5: top5(agg.brand), prodTop5: top5(agg.prod),
    declines: declines.slice(0, 5), overdue: overdue.slice(0, 5), fests,
    highlights: highlights.slice(0, 3), warnings: warnings.slice(0, 3), actions: actions.slice(0, 2),
    agenda,
  }
}

/* ── 6 頁 HTML ────────────────────────────────────────────────── */
export function buildBoardSections(model) {
  const m = model
  if (!m) return []
  const kpi = (label, value, sub, color = INK) => `
    <div style="flex:1;min-width:150px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:16px 18px;text-align:center">
      <div style="font-size:15px;color:${MUT};font-weight:700">${label}</div>
      <div style="font-size:40px;font-weight:900;color:${color};line-height:1.25;font-variant-numeric:tabular-nums">${value}</div>
      <div style="font-size:14px;color:${SUB}">${sub}</div>
    </div>`
  const bullets = (title, items, color, icon) => `
    <div style="flex:1;min-width:200px">
      <div style="font-size:17px;font-weight:900;color:${color};margin-bottom:6px">${icon} ${title}</div>
      ${items.length ? items.map(t => `<div style="font-size:15px;color:${SUB};margin:5px 0;padding-left:14px;position:relative"><span style="position:absolute;left:0;color:${color}">▪</span>${esc(t)}</div>`).join('') : `<div style="font-size:15px;color:${MUT}">—</div>`}
    </div>`

  /* P1 一頁結論 */
  const p1 = page('經營結論', '本期表現如何？——60 秒看懂全貌', `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
      ${kpi(`${m.cy} 累計營收`, W(m.ytd), `去年同期 ${W(m.prevSame)}（${pctS(m.ytd, m.prevSame)}）`, '#1d4ed8')}
      ${kpi('年底預測', W(m.fcC?.projected), `年度目標 ${W(m.targetC)}`, lightColor(m.ratioC))}
      ${kpi('好漢草', W(m.fcH?.projected), `占比 ${m.heroShare != null ? (m.heroShare * 100).toFixed(0) + '%' : '—'} · 目標 ${W(m.targetH)}`, lightColor(m.ratioH))}
    </div>
    <div style="display:flex;gap:20px;align-items:center;justify-content:center;margin-bottom:18px">
      <div style="text-align:center"><div style="font-size:15px;font-weight:800;color:${SUB};margin-bottom:2px">公司目標達成率（預測）</div>${svgGauge(m.ratioC)}</div>
      <div style="text-align:center"><div style="font-size:15px;font-weight:800;color:${SUB};margin-bottom:2px">好漢草目標達成率（預測）</div>${svgGauge(m.ratioH)}</div>
    </div>
    <div style="display:flex;gap:22px;flex-wrap:wrap;border-top:2px solid #f1f5f9;padding-top:16px">
      ${bullets('亮點', m.highlights, GREEN, '✅')}
      ${bullets('警訊', m.warnings, RED, '⚠️')}
      ${bullets('本月行動', m.actions, '#1d4ed8', '🎯')}
    </div>`)

  /* P2 領航員 */
  const p2 = page('營運領航員', '我們在十年航道上嗎？', `
    <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:14px;padding:14px 20px;margin-bottom:16px;text-align:center">
      <div style="font-size:14px;color:${PINE};font-weight:800;letter-spacing:3px">十 年 願 景</div>
      <div style="font-size:22px;font-weight:900;color:${INK};margin-top:2px">${esc(m.cfg.vision)}</div>
      <div style="font-size:15px;color:${SUB};margin-top:4px">雙軌成長：公司 ${Math.round(m.cfg.cagrCompany * 100)}%／年　·　好漢草 ${Math.round(m.cfg.cagrHero * 100)}%／年</div>
    </div>
    ${svgLadder(m.ladder, m.cy)}
    <div style="display:flex;gap:18px;justify-content:center;font-size:14px;color:${SUB};margin-top:6px">
      <span><span style="display:inline-block;width:14px;height:14px;background:#dbeafe;border:1.5px solid #cbd5e1;border-radius:4px;vertical-align:-2px"></span> 公司目標</span>
      <span><span style="display:inline-block;width:14px;height:14px;background:#a7f3d0;border-radius:4px;vertical-align:-2px"></span> 好漢草目標</span>
      <span><span style="display:inline-block;width:20px;height:4px;background:${lightColor(m.ratioC)};border-radius:2px;vertical-align:3px"></span> 今年預測落點</span>
    </div>`, '#166534')

  /* P3 營收曲線 */
  const lastYearTotal = m.prevM.reduce((s, v) => s + (v || 0), 0)
  const p3 = page('營收走勢', `${m.cy} 年每月表現 vs 去年 vs 預測`, `
    <div style="text-align:center">${svgTrend(m.curM, m.prevM, m.fcM)}</div>
    <div style="display:flex;gap:18px;justify-content:center;font-size:14px;color:${SUB};margin:4px 0 14px">
      <span><span style="display:inline-block;width:22px;height:4px;background:#2563eb;border-radius:2px;vertical-align:3px"></span> ${m.cy} 實際</span>
      <span><span style="display:inline-block;width:22px;height:0;border-top:3px dashed #9ca3af;vertical-align:3px"></span> ${m.py} 同期</span>
      <span><span style="display:inline-block;width:22px;height:0;border-top:3px dotted ${AMBER};vertical-align:3px"></span> 年底預測</span>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${kpi('去年全年', W(lastYearTotal), '基準', SUB)}
      ${kpi('預估全年', W(m.fcC?.projected), lastYearTotal > 0 ? `vs 去年 ${pctS(m.fcC?.projected || 0, lastYearTotal)}` : '', lightColor((m.fcC?.projected || 0) / (lastYearTotal || 1) >= 1 ? 1 : 0.8))}
      ${kpi('毛利率 / 費用率', '建置中', '接入平台費用後點亮', MUT)}
    </div>`, '#1d4ed8')

  /* P4 結構與排名 */
  const donutItems = m.chTypeTop.slice(0, 6)
  const chLegend = donutItems.map((d, i) => {
    const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2']
    return `<div style="font-size:14px;color:${SUB};margin:3px 0"><span style="display:inline-block;width:12px;height:12px;background:${COLORS[i]};border-radius:3px;margin-right:6px;vertical-align:-1px"></span>${esc(d.name)}　<b style="color:${INK}">${W(d.value)}</b></div>`
  }).join('')
  const topShare = m.chTypeTop[0] && m.ytd > 0 ? m.chTypeTop[0].value / m.ytd : 0
  const p4 = page('結構與排名', '錢從哪裡來？靠什麼產品？', `
    <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div>${svgDonut(donutItems)}</div>
      <div style="flex:1;min-width:200px">${chLegend}
        ${topShare > 0.4 ? `<div style="margin-top:8px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:8px 12px;font-size:14px;color:${RED};font-weight:800">⚠ 最大通路占比 ${(topShare * 100).toFixed(0)}%，集中度偏高</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:26px;flex-wrap:wrap;border-top:2px solid #f1f5f9;padding-top:14px">
      <div style="flex:1;min-width:300px"><div style="font-size:17px;font-weight:900;color:#7c3aed;margin-bottom:8px">✨ 品牌 TOP5（vs 去年同期）</div>${svgHBars(m.brandTop5, '#7c3aed')}</div>
      <div style="flex:1;min-width:300px"><div style="font-size:17px;font-weight:900;color:#e11d48;margin-bottom:8px">🏷️ 產品 TOP5（vs 去年同期）</div>${svgHBars(m.prodTop5, '#e11d48')}</div>
    </div>`, '#7c3aed')

  /* P5 風險與異常 */
  const declRows = m.declines.length ? m.declines.map(d => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:9px 10px;font-size:15px;color:${MUT};width:56px">${d.kind}</td>
      <td style="padding:9px 10px;font-size:15px;font-weight:700;color:${INK};word-break:break-word">${esc(d.name)}</td>
      <td style="padding:9px 10px;text-align:right;font-size:15px;font-weight:900;color:${RED};width:76px">${d.g.toFixed(0)}%</td>
      <td style="padding:9px 10px;text-align:right;font-size:15px;color:${SUB};width:110px">−${W(d.prev - d.cur)}</td>
    </tr>`).join('') : `<tr><td style="padding:12px;font-size:15px;color:${GREEN};font-weight:700">✅ 無重大衰退項目</td></tr>`
  const odRows = m.overdue.length ? m.overdue.map((o, i) => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:9px 10px;font-size:15px;color:${MUT};width:34px">${i + 1}</td>
      <td style="padding:9px 10px;font-size:15px;font-weight:700;color:${INK};word-break:break-word">${esc(o.name)}</td>
      <td style="padding:9px 10px;text-align:right;font-size:15px;font-weight:900;color:${AMBER};width:120px">${o.since} 天未回購</td>
      <td style="padding:9px 10px;text-align:right;font-size:15px;color:${SUB};width:120px">平常 ${o.gap} 天</td>
    </tr>`).join('') : `<tr><td style="padding:12px;font-size:15px;color:${GREEN};font-weight:700">✅ 無回購逾期客戶</td></tr>`
  const festHTML = m.fests.length ? m.fests.map(f => `<span style="display:inline-block;background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:6px 14px;font-size:15px;font-weight:800;color:#9a3412;margin:4px 6px 0 0">${f.label}：${f.items.join('、')}</span>`).join('') : `<span style="font-size:15px;color:${MUT}">近兩月無主要檔期</span>`
  const p5 = page('風險與異常', '有什麼需要注意或介入？', `
    <div style="font-size:17px;font-weight:900;color:${RED};margin-bottom:6px">📉 衰退警示（較去年同期 −30% 以上）</div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px"><tbody>${declRows}</tbody></table>
    <div style="font-size:17px;font-weight:900;color:${AMBER};margin-bottom:6px">⏰ 回購逾期大客戶 TOP5（建議業務本週聯繫）</div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px"><tbody>${odRows}</tbody></table>
    <div style="font-size:17px;font-weight:900;color:#9a3412;margin-bottom:4px">🏮 民俗檔期備貨提醒</div>
    ${festHTML}`, '#b91c1c')

  /* P6 提請決議 */
  const items = (m.agenda?.length ? m.agenda : [
    '好漢草「漢方飲品線」打樣預算核定（冷泡茶包先行）',
    '跨境電商試水（蝦皮星馬）啟動與商標註冊',
    '領航員編制人數確認（啟用人均營收指標）',
  ]).slice(0, 6)
  const p6 = page('提請決議', '需要董事長拍板的事項', `
    ${items.map((t, i) => `
      <div style="display:flex;align-items:center;gap:14px;border:2px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:12px">
        <span style="min-width:38px;height:38px;border-radius:50%;background:${PINE};color:#fff;font-size:19px;font-weight:900;display:inline-flex;align-items:center;justify-content:center">${i + 1}</span>
        <span style="font-size:18px;font-weight:700;color:${INK};line-height:1.5;word-break:break-word">${esc(t)}</span>
        <span style="margin-left:auto;font-size:14px;color:${MUT};white-space:nowrap">□ 同意　□ 修改　□ 保留</span>
      </div>`).join('')}
    <div style="font-size:14px;color:${MUT};margin-top:10px">議案內容可於系統「🧭 領航員 → 董事會議案」編輯；本頁由系統自動帶入。</div>`, '#334155')

  return [
    { name: 'P1 經營結論', html: p1 },
    { name: 'P2 領航員', html: p2 },
    { name: 'P3 營收走勢', html: p3 },
    { name: 'P4 結構排名', html: p4 },
    { name: 'P5 風險異常', html: p5 },
    { name: 'P6 提請決議', html: p6 },
  ]
}

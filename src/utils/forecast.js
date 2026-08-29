/**
 * forecast.js — 年底預測共用邏輯
 * 以「前 2 個完整年度」的月度平均建立季節指數，
 * 用今年已完成月份的實際節奏推算剩餘月份與全年。
 * rows 需含 { yearMonth, subtotal }；只計完整月份（進行中的當月排除）。
 */
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

export function forecastYearEnd(rows) {
  if (!rows?.length) return null
  const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const byYM = {}
  for (const r of rows) {
    if (r.yearMonth >= nowYM) continue
    byYM[r.yearMonth] = (byYM[r.yearMonth] || 0) + (r.subtotal || 0)
  }
  const yms = Object.keys(byYM).sort()
  if (!yms.length) return null
  const thisYear = yms[yms.length - 1].slice(0, 4)
  const y1 = String(parseInt(thisYear) - 1), y2 = String(parseInt(thisYear) - 2)

  const base = {}
  let baseTotal = 0, baseCount = 0
  MONTHS.forEach(m => {
    const vals = [y1, y2].map(y => byYM[`${y}-${m}`]).filter(v => v != null)
    if (vals.length) { base[m] = vals.reduce((s, v) => s + v, 0) / vals.length; baseTotal += base[m]; baseCount++ }
  })

  const actual = {}
  MONTHS.forEach(m => { const v = byYM[`${thisYear}-${m}`]; if (v != null) actual[m] = v })
  const doneMonths = Object.keys(actual)
  const ytd = doneMonths.reduce((s, m) => s + actual[m], 0)

  // 歷史不足 6 個月 → 用簡單線性外推（新品牌如早期好漢草）
  if (baseCount < 6) {
    const avg = doneMonths.length ? ytd / doneMonths.length : 0
    return { year: thisYear, ytd, monthsDone: doneMonths.length, projected: Math.round(avg * 12), method: 'linear' }
  }

  const avgMonth = baseTotal / baseCount
  const index = {}
  MONTHS.forEach(m => { if (base[m] != null) index[m] = base[m] / avgMonth })
  const idxDone = doneMonths.reduce((s, m) => s + (index[m] || 1), 0)
  const scale = idxDone > 0 ? ytd / idxDone : avgMonth
  let projected = ytd
  MONTHS.forEach(m => { if (actual[m] == null) projected += scale * (index[m] || 1) })
  return { year: thisYear, ytd, monthsDone: doneMonths.length, projected: Math.round(projected), method: 'seasonal' }
}

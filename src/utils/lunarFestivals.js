import solarlunar from 'solarlunar'

/**
 * lunarFestivals.js — 西曆年月 → 農曆月份與民俗檔期
 * festivalsByMonth(2026) → { 2: { fests:['🧧春節','🏮元宵'], lunar:'臘月~正月' }, ... }
 * 掃描該年每一天做農曆對應（每年 365 次轉換，結果快取）。
 */
const FESTS = [
  [1, 1,  '🧧春節'],
  [1, 15, '🏮元宵'],
  [3, 23, '⛩媽祖生'],
  [5, 5,  '🐉端午'],
  [7, 1,  '🕯鬼月始'],
  [7, 15, '🕯中元'],
  [8, 15, '🌕中秋'],
  [9, 9,  '🍊重陽'],
]
const TERM_FESTS = { 清明: '🌱清明', 冬至: '❄冬至' }

const cache = {}

export function festivalsByMonth(year) {
  if (cache[year]) return cache[year]
  const map = {}
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate()
    const info = { fests: [], lunar: '' }
    let firstCn = '', lastCn = ''
    for (let d = 1; d <= days; d++) {
      let lu
      try { lu = solarlunar.solar2lunar(year, m, d) } catch { continue }
      if (d === 1) firstCn = lu.monthCn || ''
      lastCn = lu.monthCn || ''
      if (!lu.isLeap) {
        for (const [lm, ld, label] of FESTS) {
          if (lu.lMonth === lm && lu.lDay === ld) info.fests.push(label)
        }
      }
      if (lu.term && TERM_FESTS[lu.term]) info.fests.push(TERM_FESTS[lu.term])
    }
    const clean = s => s.replace(/月$/, '') + '月'
    info.lunar = firstCn && lastCn && firstCn !== lastCn ? `${clean(firstCn)}~${clean(lastCn)}` : clean(firstCn || lastCn)
    map[m] = info
  }
  cache[year] = map
  return map
}

import dayjs from 'dayjs'

export function getThisMonthRange() {
  const now = dayjs()
  return { start: now.startOf('month').format('YYYY-MM-DD'), end: now.endOf('month').format('YYYY-MM-DD') }
}

export function getThisQuarterRange() {
  const now = dayjs()
  const q = Math.floor(now.month() / 3)
  const start = now.month(q * 3).startOf('month')
  const end = now.month(q * 3 + 2).endOf('month')
  return { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') }
}

export function getThisYearRange() {
  const now = dayjs()
  return { start: now.startOf('year').format('YYYY-MM-DD'), end: now.endOf('year').format('YYYY-MM-DD') }
}

export function getLastMonthRange() {
  const now = dayjs().subtract(1, 'month')
  return { start: now.startOf('month').format('YYYY-MM-DD'), end: now.endOf('month').format('YYYY-MM-DD') }
}

export function hasDateOverlap(rangeA, rangeB) {
  if (!rangeA || !rangeB) return false
  return rangeA.max >= rangeB.min && rangeA.min <= rangeB.max
}

export function getDateRange(rows) {
  if (!rows || rows.length === 0) return null
  let min = rows[0].date, max = rows[0].date
  for (const r of rows) {
    if (r.date < min) min = r.date
    if (r.date > max) max = r.date
  }
  return { min, max }
}

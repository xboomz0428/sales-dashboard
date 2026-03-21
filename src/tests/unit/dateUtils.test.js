import { describe, it, expect, vi } from 'vitest'
import {
  getThisMonthRange,
  getThisQuarterRange,
  getThisYearRange,
  getLastMonthRange,
  getDateRange,
  hasDateOverlap,
} from '../../utils/dateUtils'
import dayjs from 'dayjs'

// ── getThisMonthRange ─────────────────────────────────────────────────────────
describe('getThisMonthRange', () => {
  it('start is first day of current month', () => {
    const { start } = getThisMonthRange()
    expect(start).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
  })

  it('end is last day of current month', () => {
    const { end } = getThisMonthRange()
    expect(end).toBe(dayjs().endOf('month').format('YYYY-MM-DD'))
  })
})

// ── getThisQuarterRange ───────────────────────────────────────────────────────
describe('getThisQuarterRange', () => {
  it('Q1 (February) → Jan 01 ~ Mar 31', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-02-15'))
    const { start, end } = getThisQuarterRange()
    expect(start).toBe('2024-01-01')
    expect(end).toBe('2024-03-31')
    vi.useRealTimers()
  })

  it('Q2 (May) → Apr 01 ~ Jun 30', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-05-10'))
    const { start, end } = getThisQuarterRange()
    expect(start).toBe('2024-04-01')
    expect(end).toBe('2024-06-30')
    vi.useRealTimers()
  })

  it('Q3 (August) → Jul 01 ~ Sep 30', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-08-01'))
    const { start, end } = getThisQuarterRange()
    expect(start).toBe('2024-07-01')
    expect(end).toBe('2024-09-30')
    vi.useRealTimers()
  })

  it('Q4 (November) → Oct 01 ~ Dec 31', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-11-20'))
    const { start, end } = getThisQuarterRange()
    expect(start).toBe('2024-10-01')
    expect(end).toBe('2024-12-31')
    vi.useRealTimers()
  })
})

// ── getThisYearRange ──────────────────────────────────────────────────────────
describe('getThisYearRange', () => {
  it('start is Jan 01 and end is Dec 31 of current year', () => {
    const year = dayjs().year()
    const { start, end } = getThisYearRange()
    expect(start).toBe(`${year}-01-01`)
    expect(end).toBe(`${year}-12-31`)
  })
})

// ── getLastMonthRange ─────────────────────────────────────────────────────────
describe('getLastMonthRange', () => {
  it('returns the previous month range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-15'))
    const { start, end } = getLastMonthRange()
    expect(start).toBe('2024-02-01')
    expect(end).toBe('2024-02-29') // 2024 is a leap year
    vi.useRealTimers()
  })

  it('handles January → wraps to December of previous year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-10'))
    const { start, end } = getLastMonthRange()
    expect(start).toBe('2023-12-01')
    expect(end).toBe('2023-12-31')
    vi.useRealTimers()
  })
})

// ── getDateRange ──────────────────────────────────────────────────────────────
describe('getDateRange', () => {
  it('returns null for null input', () => {
    expect(getDateRange(null)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(getDateRange([])).toBeNull()
  })

  it('finds min and max from an unsorted array', () => {
    const rows = [
      { date: '2024-03-01' },
      { date: '2024-01-15' },
      { date: '2024-06-30' },
      { date: '2023-12-31' },
    ]
    const { min, max } = getDateRange(rows)
    expect(min).toBe('2023-12-31')
    expect(max).toBe('2024-06-30')
  })

  it('works with a single row', () => {
    const rows = [{ date: '2024-05-01' }]
    const { min, max } = getDateRange(rows)
    expect(min).toBe('2024-05-01')
    expect(max).toBe('2024-05-01')
  })
})

// ── hasDateOverlap ────────────────────────────────────────────────────────────
describe('hasDateOverlap', () => {
  it('returns false when rangeA is null', () => {
    expect(hasDateOverlap(null, { min: '2024-01-01', max: '2024-12-31' })).toBe(false)
  })

  it('returns false when rangeB is null', () => {
    expect(hasDateOverlap({ min: '2024-01-01', max: '2024-12-31' }, null)).toBe(false)
  })

  it('detects overlap (ranges share one day)', () => {
    const a = { min: '2024-01-01', max: '2024-06-30' }
    const b = { min: '2024-06-30', max: '2024-12-31' }
    expect(hasDateOverlap(a, b)).toBe(true)
  })

  it('detects overlap (one range inside another)', () => {
    const a = { min: '2024-01-01', max: '2024-12-31' }
    const b = { min: '2024-03-01', max: '2024-09-30' }
    expect(hasDateOverlap(a, b)).toBe(true)
  })

  it('returns false when ranges do not overlap', () => {
    const a = { min: '2024-01-01', max: '2024-03-31' }
    const b = { min: '2024-07-01', max: '2024-12-31' }
    expect(hasDateOverlap(a, b)).toBe(false)
  })
})

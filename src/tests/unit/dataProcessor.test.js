import { describe, it, expect } from 'vitest'
import { parseNumeric, parseDate } from '../../utils/dataProcessor'

// ── parseNumeric ──────────────────────────────────────────────────────────────
describe('parseNumeric', () => {
  // 空值保護
  it('returns 0 for null', () => expect(parseNumeric(null)).toBe(0))
  it('returns 0 for undefined', () => expect(parseNumeric(undefined)).toBe(0))
  it('returns 0 for empty string', () => expect(parseNumeric('')).toBe(0))

  // 一般數字
  it('passes through a number as-is', () => expect(parseNumeric(1000)).toBe(1000))
  it('parses a numeric string', () => expect(parseNumeric('1000')).toBe(1000))
  it('handles negative number', () => expect(parseNumeric(-500)).toBe(-500))
  it('handles negative string', () => expect(parseNumeric('-500')).toBe(-500))
  it('handles decimal', () => expect(parseNumeric('3.14')).toBe(3.14))

  // 千分位逗號（ERP 常見格式）
  it('strips comma thousands separator', () => expect(parseNumeric('1,234,567')).toBe(1234567))
  it('handles negative with commas', () => expect(parseNumeric('-1,000')).toBe(-1000))

  // 會計負數格式：(1000) → -1000
  it('converts accounting negative (1000) → -1000', () => expect(parseNumeric('(1000)')).toBe(-1000))
  it('converts accounting negative with commas (1,000) → -1000', () => expect(parseNumeric('(1,000)')).toBe(-1000))
  it('converts accounting decimal (500.50) → -500.5', () => expect(parseNumeric('(500.50)')).toBe(-500.5))

  // 非數字字串
  it('returns 0 for non-numeric string', () => expect(parseNumeric('abc')).toBe(0))
  it('returns 0 for N/A', () => expect(parseNumeric('N/A')).toBe(0))
  it('returns 0 for dash', () => expect(parseNumeric('-')).toBe(0))

  // 邊界值
  it('handles zero', () => expect(parseNumeric(0)).toBe(0))
  it('handles zero string', () => expect(parseNumeric('0')).toBe(0))
  it('handles very large number', () => expect(parseNumeric('99,999,999')).toBe(99999999))
})

// ── parseDate ─────────────────────────────────────────────────────────────────
describe('parseDate', () => {
  // 空值保護
  it('returns null for null', () => expect(parseDate(null)).toBeNull())
  it('returns null for undefined', () => expect(parseDate(undefined)).toBeNull())
  it('returns null for empty string', () => expect(parseDate('')).toBeNull())

  // 標準格式
  it('parses YYYY-MM-DD string', () => {
    const d = parseDate('2024-01-15')
    expect(d).not.toBeNull()
    expect(d.format('YYYY-MM-DD')).toBe('2024-01-15')
  })

  // 斜線格式（台灣 ERP 常見）
  it('parses YYYY/MM/DD string', () => {
    const d = parseDate('2024/01/15')
    expect(d).not.toBeNull()
    expect(d.format('YYYY-MM-DD')).toBe('2024-01-15')
  })

  it('parses MM/DD/YYYY string', () => {
    const d = parseDate('01/15/2024')
    expect(d).not.toBeNull()
    // dayjs 會正確解析並回傳有效日期物件
    expect(d.isValid()).toBe(true)
  })

  // 年月邊界
  it('handles end of year', () => {
    const d = parseDate('2023-12-31')
    expect(d.format('YYYY-MM-DD')).toBe('2023-12-31')
  })

  it('handles leap day', () => {
    const d = parseDate('2024-02-29')
    expect(d.format('YYYY-MM-DD')).toBe('2024-02-29')
  })

  // 無效輸入
  it('returns null for completely invalid string', () => {
    expect(parseDate('not-a-date')).toBeNull()
  })

  it('returns null for random text', () => {
    expect(parseDate('abc123')).toBeNull()
  })

  // 回傳值格式驗證（確保可呼叫 dayjs 方法）
  it('returned object supports .year() .month() .format()', () => {
    const d = parseDate('2024-06-15')
    expect(d.year()).toBe(2024)
    expect(d.month()).toBe(5) // dayjs month is 0-indexed
    expect(d.format('YYYY-MM')).toBe('2024-06')
  })
})

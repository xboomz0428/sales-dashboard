import { describe, it, expect } from 'vitest'
import {
  calcValueAxisWidth,
  calcNameAxisWidth,
  getXAxisTickProps,
  getMaxValue,
} from '../../utils/chartUtils'

// ── calcValueAxisWidth ────────────────────────────────────────────────────────
describe('calcValueAxisWidth', () => {
  it('returns 55 for null', () => expect(calcValueAxisWidth(null)).toBe(55))
  it('returns 55 for 0', () => expect(calcValueAxisWidth(0)).toBe(55))
  it('returns 55 for undefined', () => expect(calcValueAxisWidth(undefined)).toBe(55))

  it('returns at least 50 for a small number', () => {
    expect(calcValueAxisWidth(100)).toBeGreaterThanOrEqual(50)
  })

  it('returns wider width for a large number', () => {
    const small = calcValueAxisWidth(100)
    const large = calcValueAxisWidth(100000000)
    expect(large).toBeGreaterThan(small)
  })

  it('uses custom formatter when provided', () => {
    const w = calcValueAxisWidth(1000000, v => (v / 10000).toFixed(0) + '萬')
    // '100萬' = 3 chars → width = max(50, 3*11+10) = max(50, 43) = 50
    expect(w).toBeGreaterThanOrEqual(50)
  })

  it('returns a number (not NaN)', () => {
    expect(calcValueAxisWidth(999999)).not.toBeNaN()
  })
})

// ── calcNameAxisWidth ─────────────────────────────────────────────────────────
describe('calcNameAxisWidth', () => {
  it('returns 90 for null data', () => expect(calcNameAxisWidth(null)).toBe(90))
  it('returns 90 for empty array', () => expect(calcNameAxisWidth([])).toBe(90))

  it('returns at least 60 for short names', () => {
    const data = [{ name: 'A' }, { name: 'B' }]
    expect(calcNameAxisWidth(data)).toBeGreaterThanOrEqual(60)
  })

  it('returns wider width for longer names', () => {
    const short = calcNameAxisWidth([{ name: 'AB' }])
    const long  = calcNameAxisWidth([{ name: '一個很長的通路名稱範例' }])
    expect(long).toBeGreaterThan(short)
  })

  it('caps at 200', () => {
    const data = [{ name: 'A'.repeat(50) }]
    expect(calcNameAxisWidth(data)).toBeLessThanOrEqual(200)
  })

  it('uses custom nameKey', () => {
    const data = [{ label: '一個很長的名稱ABCDEFGH' }]
    const w = calcNameAxisWidth(data, 'label')
    expect(w).toBeGreaterThan(60)
  })
})

// ── getXAxisTickProps ─────────────────────────────────────────────────────────
describe('getXAxisTickProps', () => {
  it('no rotation for ≤12 items', () => {
    const props = getXAxisTickProps(6)
    expect(props.angle).toBe(0)
    expect(props.textAnchor).toBe('middle')
    expect(props.interval).toBe(0)
  })

  it('30° rotation for 13–24 items', () => {
    const props = getXAxisTickProps(18)
    expect(props.angle).toBe(-30)
    expect(props.textAnchor).toBe('end')
  })

  it('45° rotation for >24 items', () => {
    const props = getXAxisTickProps(30)
    expect(props.angle).toBe(-45)
    expect(props.textAnchor).toBe('end')
  })

  it('adds interval skip for very large counts to avoid overlap', () => {
    const props = getXAxisTickProps(60)
    expect(props.interval).toBeGreaterThan(0)
  })

  it('returns height property in all cases', () => {
    expect(getXAxisTickProps(6)).toHaveProperty('height')
    expect(getXAxisTickProps(18)).toHaveProperty('height')
    expect(getXAxisTickProps(30)).toHaveProperty('height')
  })
})

// ── getMaxValue ───────────────────────────────────────────────────────────────
describe('getMaxValue', () => {
  it('returns 0 for null data', () => expect(getMaxValue(null, 'v')).toBe(0))
  it('returns 0 for empty array', () => expect(getMaxValue([], 'v')).toBe(0))

  it('finds max with a single key', () => {
    const data = [{ sales: 100 }, { sales: 500 }, { sales: 200 }]
    expect(getMaxValue(data, 'sales')).toBe(500)
  })

  it('finds max across multiple keys', () => {
    const data = [{ a: 100, b: 800 }, { a: 500, b: 200 }]
    expect(getMaxValue(data, ['a', 'b'])).toBe(800)
  })

  it('ignores missing keys (treats as 0)', () => {
    const data = [{ x: 300 }, { y: 100 }]
    expect(getMaxValue(data, 'x')).toBe(300)
  })

  it('handles all-zero values', () => {
    const data = [{ v: 0 }, { v: 0 }]
    expect(getMaxValue(data, 'v')).toBe(0)
  })

  it('handles negative values correctly (returns 0 as floor)', () => {
    const data = [{ v: -100 }, { v: -200 }]
    expect(getMaxValue(data, 'v')).toBe(0)
  })

  it('handles single-item array', () => {
    expect(getMaxValue([{ v: 42 }], 'v')).toBe(42)
  })
})

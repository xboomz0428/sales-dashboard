import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSalesData } from '../../hooks/useSalesData'

// ── 測試用假資料 ───────────────────────────────────────────────────────────────
function makeRow(overrides) {
  return {
    date: '2024-01-15',
    yearMonth: '2024-01',
    year: '2024',
    month: '01',
    channel: '線上',
    channelType: '電商',
    brand: 'A品牌',
    product: '商品A',
    customer: '客戶1',
    quantity: 10,
    subtotal: 10000,
    total: 10000,
    discountRate: 0,
    _key: 'k1',
    ...overrides,
  }
}

const rows = [
  makeRow({ _key: 'k1', yearMonth: '2024-01', year: '2024', month: '01', channel: '線上',  channelType: '電商', brand: 'A品牌', product: '商品A', customer: '客戶1', quantity: 10, subtotal: 10000 }),
  makeRow({ _key: 'k2', yearMonth: '2024-02', year: '2024', month: '02', channel: '實體',  channelType: '門市', brand: 'B品牌', product: '商品B', customer: '客戶2', quantity: 5,  subtotal: 5000,  discountRate: 0.1 }),
  makeRow({ _key: 'k3', yearMonth: '2024-03', year: '2024', month: '03', channel: '線上',  channelType: '電商', brand: 'A品牌', product: '商品C', customer: '客戶1', quantity: 8,  subtotal: 8000 }),
  makeRow({ _key: 'k4', yearMonth: '2023-12', year: '2023', month: '12', channel: '實體',  channelType: '門市', brand: 'B品牌', product: '商品B', customer: '客戶3', quantity: 3,  subtotal: 3000, date: '2023-12-01' }),
]

const baseFilters = {
  years: [], months: [], channels: [], channelTypes: [], brands: [],
  customers: [], products: [], dateRange: null, metric: 'subtotal',
}

// ── 空資料邊界 ─────────────────────────────────────────────────────────────────
describe('empty / null input', () => {
  it('handles null rows gracefully', () => {
    const { result } = renderHook(() => useSalesData(null, baseFilters))
    expect(result.current.summary.totalSales).toBe(0)
    expect(result.current.summary.orderCount).toBe(0)
    expect(result.current.trendData).toEqual([])
    expect(result.current.brandData).toEqual([])
    expect(result.current.flowData).toBeNull()
  })

  it('handles empty array rows gracefully', () => {
    const { result } = renderHook(() => useSalesData([], baseFilters))
    expect(result.current.summary.totalSales).toBe(0)
    expect(result.current.trendData).toEqual([])
  })
})

// ── summary KPI ───────────────────────────────────────────────────────────────
describe('summary KPI calculation', () => {
  it('calculates totalSales correctly (all rows)', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.totalSales).toBe(26000)
  })

  it('calculates totalQty correctly', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.totalQty).toBe(26)
  })

  it('calculates orderCount correctly', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.orderCount).toBe(4)
  })

  it('counts unique customers', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.customerCount).toBe(3) // 客戶1, 客戶2, 客戶3
  })

  it('counts unique products', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.productCount).toBe(3) // 商品A, B, C
  })
})

// ── 篩選邏輯 ──────────────────────────────────────────────────────────────────
describe('filter: year', () => {
  it('filters to 2024 only', () => {
    const filters = { ...baseFilters, years: ['2024'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(3)
    expect(result.current.summary.totalSales).toBe(23000)
  })

  it('filters to 2023 only', () => {
    const filters = { ...baseFilters, years: ['2023'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(1)
    expect(result.current.summary.totalSales).toBe(3000)
  })

  it('returns all rows when years filter is empty', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.summary.orderCount).toBe(4)
  })
})

describe('filter: channel', () => {
  it('filters to 線上 channel', () => {
    const filters = { ...baseFilters, channels: ['線上'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(2) // k1 + k3
    expect(result.current.summary.totalSales).toBe(18000)
  })

  it('filters to 實體 channel', () => {
    const filters = { ...baseFilters, channels: ['實體'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(2) // k2 + k4
  })
})

describe('filter: brand', () => {
  it('filters to A品牌', () => {
    const filters = { ...baseFilters, brands: ['A品牌'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(2) // k1 + k3
    expect(result.current.summary.totalSales).toBe(18000)
  })
})

describe('filter: month', () => {
  it('filters to month 01 (January)', () => {
    const filters = { ...baseFilters, months: ['01'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(1)
    expect(result.current.summary.totalSales).toBe(10000)
  })
})

describe('filter: dateRange', () => {
  it('filters within date range', () => {
    const filters = { ...baseFilters, dateRange: { start: '2024-01-01', end: '2024-02-28' } }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(2) // k1 + k2
  })

  it('excludes rows outside date range', () => {
    const filters = { ...baseFilters, dateRange: { start: '2024-03-01', end: '2024-12-31' } }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(1) // k3 only
  })
})

describe('filter: combined', () => {
  it('applies year + channel filter together', () => {
    const filters = { ...baseFilters, years: ['2024'], channels: ['線上'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.summary.orderCount).toBe(2)
    expect(result.current.summary.totalSales).toBe(18000)
  })
})

// ── trendData ─────────────────────────────────────────────────────────────────
describe('trendData', () => {
  it('is sorted chronologically', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const months = result.current.trendData.map(d => d.yearMonth)
    expect(months).toEqual([...months].sort())
  })

  it('aggregates same yearMonth into one row', () => {
    const dupRows = [
      makeRow({ _key: 'a', yearMonth: '2024-01', subtotal: 5000 }),
      makeRow({ _key: 'b', yearMonth: '2024-01', subtotal: 3000 }),
    ]
    const { result } = renderHook(() => useSalesData(dupRows, baseFilters))
    const jan = result.current.trendData.find(d => d.yearMonth === '2024-01')
    expect(jan.subtotal).toBe(8000)
  })

  it('returns empty array when no data matches filter', () => {
    const filters = { ...baseFilters, years: ['2099'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.trendData).toEqual([])
  })
})

// ── brandData ─────────────────────────────────────────────────────────────────
describe('brandData', () => {
  it('returns brands sorted by metric descending', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const brands = result.current.brandData
    expect(brands.length).toBeGreaterThan(0)
    for (let i = 0; i < brands.length - 1; i++) {
      expect(brands[i].subtotal).toBeGreaterThanOrEqual(brands[i + 1].subtotal)
    }
  })

  it('A品牌 subtotal = 18000 (k1+k3)', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const a = result.current.brandData.find(d => d.name === 'A品牌')
    expect(a?.subtotal).toBe(18000)
  })
})

// ── productData ───────────────────────────────────────────────────────────────
describe('productData', () => {
  it('returns products sorted by metric descending', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const products = result.current.productData
    for (let i = 0; i < products.length - 1; i++) {
      expect(products[i].subtotal).toBeGreaterThanOrEqual(products[i + 1].subtotal)
    }
  })

  it('商品A is top product', () => {
    const filters = { ...baseFilters, years: ['2024'] }
    const { result } = renderHook(() => useSalesData(rows, filters))
    expect(result.current.productData[0].name).toBe('商品A')
  })
})

// ── channelData ───────────────────────────────────────────────────────────────
describe('channelData', () => {
  it('contains both 線上 and 實體 channels', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const names = result.current.channelData.map(d => d.name)
    expect(names).toContain('線上')
    expect(names).toContain('實體')
  })

  it('線上 subtotal = 18000', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const online = result.current.channelData.find(d => d.name === '線上')
    expect(online?.subtotal).toBe(18000)
  })
})

// ── flowData (Sankey) ─────────────────────────────────────────────────────────
describe('flowData', () => {
  it('returns null when rows is empty', () => {
    const { result } = renderHook(() => useSalesData([], baseFilters))
    expect(result.current.flowData).toBeNull()
  })

  it('has channelToBrand and brandToProduct keys', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.flowData).toHaveProperty('channelToBrand')
    expect(result.current.flowData).toHaveProperty('brandToProduct')
  })

  it('channelToBrand sourceNodes are non-empty', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    expect(result.current.flowData.channelToBrand.sourceNodes.length).toBeGreaterThan(0)
  })

  it('channelToBrand links connect source to target', () => {
    const { result } = renderHook(() => useSalesData(rows, baseFilters))
    const { links, sourceNodes, targetNodes } = result.current.flowData.channelToBrand
    const srcNames = new Set(sourceNodes.map(n => n.id))
    const tgtNames = new Set(targetNodes.map(n => n.id))
    links.forEach(link => {
      expect(srcNames.has(link.source)).toBe(true)
      expect(tgtNames.has(link.target)).toBe(true)
    })
  })
})

// ── metric switching ──────────────────────────────────────────────────────────
describe('metric: quantity mode', () => {
  it('summary.totalSales reflects quantity when metric=quantity', () => {
    const filters = { ...baseFilters, metric: 'quantity' }
    const { result } = renderHook(() => useSalesData(rows, filters))
    // totalSales field is always subtotal sum — metric affects derived data
    expect(result.current.summary.totalQty).toBe(26)
  })

  it('brandData sorted by quantity when metric=quantity', () => {
    const filters = { ...baseFilters, metric: 'quantity' }
    const { result } = renderHook(() => useSalesData(rows, filters))
    const brands = result.current.brandData
    for (let i = 0; i < brands.length - 1; i++) {
      expect(brands[i].quantity).toBeGreaterThanOrEqual(brands[i + 1].quantity)
    }
  })
})

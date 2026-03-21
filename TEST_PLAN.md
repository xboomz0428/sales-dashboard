# Sales Dashboard — 測試策略與測試計畫

> 自動生成日期：2026-03-21
> 專案技術棧：React 18 + Recharts + Vite + Tailwind CSS + html2canvas + xlsx

---

## 一、測試金字塔

```
          /   E2E (手動)   \      3~5 個核心使用者流程
         /  整合測試 (Vitest) \   資料處理 × API × Hook
        /    單元測試 (Vitest)  \  utils / dataProcessor / dateUtils
```

**目前狀態**：沒有任何自動化測試（零測試覆蓋率）

**建議目標**（第一階段）：
- 單元測試覆蓋率 > 80%（utils 層）
- 整合測試覆蓋核心 hook 與資料流
- E2E 手動測試清單（含截圖驗證）

---

## 二、測試框架建議（安裝指令）

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

`vite.config.js` 加入：
```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/tests/setup.js',
}
```

`src/tests/setup.js`：
```js
import '@testing-library/jest-dom'
```

執行測試：
```bash
npm run test         # watch mode
npm run test -- --run  # single run
npm run test -- --ui   # 視覺化 UI
```

---

## 三、各層測試計畫

### Layer 1：單元測試（utils）

---

#### ✅ `dataProcessor.js` — 最高優先級

業務核心，解析 Excel 資料的所有邏輯都在此。

**測試檔案**：`src/tests/unit/dataProcessor.test.js`

```js
import { describe, it, expect } from 'vitest'
// 待測函式需要 export（目前 parseNumeric、parseDate 為 module 內部函式，需改為 export）
import { parseNumeric, parseDate, processExcelFile } from '../../utils/dataProcessor'

describe('parseNumeric', () => {
  it('handles null/undefined', () => {
    expect(parseNumeric(null)).toBe(0)
    expect(parseNumeric(undefined)).toBe(0)
    expect(parseNumeric('')).toBe(0)
  })

  it('handles normal numbers', () => {
    expect(parseNumeric(1000)).toBe(1000)
    expect(parseNumeric('1000')).toBe(1000)
    expect(parseNumeric(-500)).toBe(-500)
  })

  it('handles accounting negative format', () => {
    expect(parseNumeric('(1,000)')).toBe(-1000)
    expect(parseNumeric('(500.50)')).toBe(-500.5)
  })

  it('handles comma-separated thousands', () => {
    expect(parseNumeric('1,234,567')).toBe(1234567)
    expect(parseNumeric('-1,000')).toBe(-1000)
  })

  it('returns 0 for non-numeric strings', () => {
    expect(parseNumeric('abc')).toBe(0)
    expect(parseNumeric('N/A')).toBe(0)
  })
})

describe('parseDate', () => {
  it('returns null for empty/null input', () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })

  it('parses YYYY-MM-DD string', () => {
    const d = parseDate('2024-01-15')
    expect(d.format('YYYY-MM-DD')).toBe('2024-01-15')
  })

  it('parses slash-separated date (台灣格式)', () => {
    const d = parseDate('2024/01/15')
    expect(d.format('YYYY-MM-DD')).toBe('2024-01-15')
  })

  it('returns null for invalid date', () => {
    expect(parseDate('not-a-date')).toBeNull()
  })
})
```

**重要發現 🔴**：`parseNumeric` 和 `parseDate` 目前是 module-internal（沒有 export），無法直接單元測試。建議加 export 或抽到獨立檔案。

---

#### ✅ `dateUtils.js`

**測試檔案**：`src/tests/unit/dateUtils.test.js`

```js
import { describe, it, expect, vi } from 'vitest'
import dayjs from 'dayjs'
import { getThisMonthRange, getThisQuarterRange, getThisYearRange, getLastMonthRange, getDateRange, hasDateOverlap } from '../../utils/dateUtils'

describe('getThisMonthRange', () => {
  it('returns correct start and end for current month', () => {
    const range = getThisMonthRange()
    const now = dayjs()
    expect(range.start).toBe(now.startOf('month').format('YYYY-MM-DD'))
    expect(range.end).toBe(now.endOf('month').format('YYYY-MM-DD'))
  })
})

describe('getThisQuarterRange', () => {
  it('Q1: Jan–Mar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-02-15'))
    const range = getThisQuarterRange()
    expect(range.start).toBe('2024-01-01')
    expect(range.end).toBe('2024-03-31')
    vi.useRealTimers()
  })

  it('Q4: Oct–Dec', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-11-01'))
    const range = getThisQuarterRange()
    expect(range.start).toBe('2024-10-01')
    expect(range.end).toBe('2024-12-31')
    vi.useRealTimers()
  })
})

describe('getDateRange', () => {
  it('returns null for empty array', () => {
    expect(getDateRange([])).toBeNull()
    expect(getDateRange(null)).toBeNull()
  })

  it('finds min and max dates', () => {
    const rows = [
      { date: '2024-03-01' },
      { date: '2024-01-15' },
      { date: '2024-06-30' },
    ]
    const range = getDateRange(rows)
    expect(range.min).toBe('2024-01-15')
    expect(range.max).toBe('2024-06-30')
  })
})

describe('hasDateOverlap', () => {
  it('returns false when either range is null', () => {
    expect(hasDateOverlap(null, { min: '2024-01-01', max: '2024-12-31' })).toBe(false)
    expect(hasDateOverlap({ min: '2024-01-01', max: '2024-12-31' }, null)).toBe(false)
  })

  it('detects overlap correctly', () => {
    const a = { min: '2024-01-01', max: '2024-06-30' }
    const b = { min: '2024-06-01', max: '2024-12-31' }
    expect(hasDateOverlap(a, b)).toBe(true)
  })

  it('detects no overlap', () => {
    const a = { min: '2024-01-01', max: '2024-03-31' }
    const b = { min: '2024-07-01', max: '2024-12-31' }
    expect(hasDateOverlap(a, b)).toBe(false)
  })
})
```

---

#### ✅ `chartUtils.js`

**測試檔案**：`src/tests/unit/chartUtils.test.js`

```js
import { calcValueAxisWidth, calcNameAxisWidth, getMaxValue } from '../../utils/chartUtils'

describe('calcValueAxisWidth', () => {
  it('returns 55 for null/0', () => {
    expect(calcValueAxisWidth(0)).toBe(55)
    expect(calcValueAxisWidth(null)).toBe(55)
  })

  it('returns larger width for large numbers', () => {
    const w = calcValueAxisWidth(1000000, v => v.toLocaleString())
    expect(w).toBeGreaterThan(55)
  })
})

describe('getMaxValue', () => {
  it('returns 0 for empty data', () => {
    expect(getMaxValue([], 'value')).toBe(0)
    expect(getMaxValue(null, 'value')).toBe(0)
  })

  it('finds max across single key', () => {
    const data = [{ sales: 100 }, { sales: 500 }, { sales: 200 }]
    expect(getMaxValue(data, 'sales')).toBe(500)
  })

  it('finds max across multiple keys', () => {
    const data = [{ a: 100, b: 800 }, { a: 500, b: 200 }]
    expect(getMaxValue(data, ['a', 'b'])).toBe(800)
  })
})
```

---

### Layer 2：整合測試（Hook + 資料流）

---

#### ✅ `useSalesData.js` — 最複雜的 Hook

**測試檔案**：`src/tests/integration/useSalesData.test.js`

```js
import { renderHook } from '@testing-library/react'
import { useSalesData } from '../../hooks/useSalesData'

// 測試用假資料
const mockRows = [
  { date:'2024-01-15', yearMonth:'2024-01', year:'2024', month:'01', channel:'線上', channelType:'電商', brand:'A品牌', product:'商品A', customer:'客戶1', quantity:10, subtotal:10000, total:10000, discountRate:0, _key:'k1' },
  { date:'2024-02-10', yearMonth:'2024-02', year:'2024', month:'02', channel:'實體', channelType:'門市', brand:'B品牌', product:'商品B', customer:'客戶2', quantity:5,  subtotal:5000,  total:5000,  discountRate:0.1, _key:'k2' },
  { date:'2023-01-20', yearMonth:'2023-01', year:'2023', month:'01', channel:'線上', channelType:'電商', brand:'A品牌', product:'商品A', customer:'客戶1', quantity:8,  subtotal:8000,  total:8000,  discountRate:0, _key:'k3' },
]

const baseFilters = {
  years: [], months: [], channels: [], channelTypes: [], brands: [],
  customers: [], products: [], dateRange: null, metric: 'subtotal',
}

describe('useSalesData', () => {
  it('returns empty arrays for null/empty rows', () => {
    const { result } = renderHook(() => useSalesData(null, baseFilters))
    expect(result.current.summary.totalSales).toBe(0)
    expect(result.current.trendData).toEqual([])
  })

  it('calculates summary correctly', () => {
    const { result } = renderHook(() => useSalesData(mockRows, baseFilters))
    expect(result.current.summary.totalSales).toBe(23000)
    expect(result.current.summary.totalQty).toBe(23)
    expect(result.current.summary.orderCount).toBe(3)
  })

  it('filters by year correctly', () => {
    const filters = { ...baseFilters, years: ['2024'] }
    const { result } = renderHook(() => useSalesData(mockRows, filters))
    expect(result.current.summary.totalSales).toBe(15000)
    expect(result.current.summary.orderCount).toBe(2)
  })

  it('filters by channel correctly', () => {
    const filters = { ...baseFilters, channels: ['線上'] }
    const { result } = renderHook(() => useSalesData(mockRows, filters))
    expect(result.current.summary.orderCount).toBe(2) // k1 + k3
  })

  it('trendData is sorted chronologically', () => {
    const { result } = renderHook(() => useSalesData(mockRows, baseFilters))
    const months = result.current.trendData.map(d => d.yearMonth)
    expect(months).toEqual([...months].sort())
  })

  it('returns flowData with channelToBrand when data exists', () => {
    const { result } = renderHook(() => useSalesData(mockRows, baseFilters))
    expect(result.current.flowData).not.toBeNull()
    expect(result.current.flowData.channelToBrand.sourceNodes.length).toBeGreaterThan(0)
  })
})
```

---

### Layer 3：UI 元件測試

---

#### ✅ `ExecutiveSummary.jsx` — 月份走勢邏輯

```js
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExecutiveSummary from '../../components/ExecutiveSummary'

const mockSummary = { totalSales: 100000, totalQty: 50, orderCount: 10, avgDiscount: 0.05, customerCount: 5, productCount: 3 }
const mockTrendData = [
  { yearMonth: '2024-01', subtotal: 10000 },
  { yearMonth: '2024-06', subtotal: 50000 }, // 應為最高月
  { yearMonth: '2024-03', subtotal: 2000 },  // 應為最低月
]

it('highlights best month in green and worst in red', () => {
  render(<ExecutiveSummary summary={mockSummary} trendData={mockTrendData} filtered={[]} metric="subtotal" />)
  // 最佳月份柱狀條應有 emerald 色
  const bars = document.querySelectorAll('[class*="emerald"]')
  expect(bars.length).toBeGreaterThan(0)
})

it('shows year tabs when multiple years exist', () => {
  const multiYearTrend = [
    { yearMonth: '2023-06', subtotal: 8000 },
    ...mockTrendData,
  ]
  render(<ExecutiveSummary summary={mockSummary} trendData={multiYearTrend} filtered={[]} metric="subtotal" />)
  expect(screen.getByText('2023')).toBeInTheDocument()
  expect(screen.getByText('2024')).toBeInTheDocument()
})
```

---

### Layer 4：E2E 手動測試清單

每次部署前人工驗收，截圖存證。

#### 🔴 P0 核心功能

| # | 測試步驟 | 預期結果 |
|---|---------|---------|
| 1 | 上傳 Excel 檔案 → 等待解析 | KPI 卡片出現數值，無 console error |
| 2 | 篩選品牌 A → 切換到趨勢圖 | 圖表只顯示品牌 A 的資料 |
| 3 | 切換到老闆視角 → 點 AI 生成摘要 | Loading 狀態顯示，摘要文字串流出現 |
| 4 | 切換深色模式 → 瀏覽所有頁籤 | 無白色閃爍，文字可讀 |
| 5 | 點任一 ChartCard 截圖按鈕 → 截圖編輯器開啟 | 底色純白，圖表完整不截斷 |

#### 🟡 P1 重要功能

| # | 測試步驟 | 預期結果 |
|---|---------|---------|
| 6 | 上傳兩個不同年份的檔案 | 兩年資料合併，年份篩選出現 |
| 7 | 老闆視角 → 月份走勢 → 點 2023 年份頁籤 | 圖表切換到 2023 年資料 |
| 8 | 流程架構 → 通路→品牌桑基圖 → hover 節點 | tooltip 顯示名稱與數值 |
| 9 | 品牌圖表 → 品牌×通路比較 → 切換 Bar/Line/Area | 三種圖表樣式正常切換 |
| 10 | 在手機解析度（375px）瀏覽 | 無橫向滾動條，按鈕可點擊 |

#### 🔵 P2 穩定性

| # | 測試步驟 | 預期結果 |
|---|---------|---------|
| 11 | 不上傳任何檔案 → 瀏覽所有頁籤 | 每個圖表顯示「暫無資料」，不崩潰 |
| 12 | 上傳空白 Excel（只有標頭，無資料列） | 顯示友善錯誤，不崩潰 |
| 13 | 連續快速點擊 AI 摘要按鈕 5 次 | 只發出一次 API 請求（button 應 disabled） |
| 14 | 截圖編輯 → 加文字 → 加箭頭 → 存檔 → 再次截圖 | 兩次截圖各自獨立，不互相影響 |

---

## 四、已發現問題清單

### 🟡 Warning

**W1：`parseNumeric` / `parseDate` 未 export**
- 位置：`src/utils/dataProcessor.js`
- 問題：無法直接單元測試，只能透過整合測試覆蓋
- 建議修復：將兩函式加上 `export`

```diff
- function parseNumeric(value) {
+ export function parseNumeric(value) {

- function parseDate(value) {
+ export function parseDate(value) {
```

**W2：AI API Key 存在 localStorage 中**
- 位置：`src/utils/ai.js`、`src/components/AIAnalysis.jsx`
- 問題：任何 JS 程式碼（包含 browser extension）都可讀取 `sdash_ai_key`
- 建議：加 `sessionStorage` 選項或提醒使用者此為本機設定

**W3：AI 請求中缺少 loading guard（AIAnalysis）**
- 位置：`src/components/AIAnalysis.jsx` line 571+
- 問題：若按鈕在請求進行中被快速點擊，可能發出多次請求
- 建議：加 `setLoading(true)` + disabled 狀態（ExecutiveSummary 已有，AIAnalysis 需確認）

**W4：11 處 `bg-white` 無 dark mode 對應（多為 `/20` opacity）**
- 位置：AIAnalysis.jsx、FilterPanel.jsx（見上方 grep 結果）
- 問題：這些多為半透明白（`bg-white/20`），在 dark mode 下實為設計選擇，非 bug
- 建議：人工確認視覺效果是否符合預期

### 🔵 Info

**I1：沒有測試框架**
- 建議安裝 Vitest + Testing Library（指令見上方第二節）
- 優先補齊 `dataProcessor.js` 的測試（業務最複雜）

**I2：`processExcelFile` 使用 FileReader（瀏覽器 API）**
- 問題：Node.js 環境下無法直接測試，需 mock FileReader
- 建議：測試時用 `vi.fn()` mock FileReader 或用 jsdom 環境

**I3：重複的 filter 邏輯（applyNonDateFilters vs 主 filter）**
- 位置：`useSalesData.js` line 12 vs line 27
- 建議：統一成一個 `applyFilters(rows, filters, { includeDates })` 函式

---

## 五、第一週行動計畫

1. **Day 1**：安裝 Vitest，補 `dateUtils.test.js`（最快，零依賴）
2. **Day 2**：Export `parseNumeric`/`parseDate`，補 `dataProcessor.test.js`
3. **Day 3**：補 `useSalesData.test.js`（整合測試）
4. **Day 4**：修復 W3 AI 請求 loading guard
5. **Day 5**：執行 E2E 手動測試清單 P0 全部驗收

```bash
# 快速起步指令
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
mkdir -p src/tests/unit src/tests/integration
npm run test
```

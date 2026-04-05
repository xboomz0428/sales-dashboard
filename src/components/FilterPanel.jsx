import { useState, useMemo } from 'react'
import { getThisMonthRange, getThisQuarterRange, getThisYearRange, getLastMonthRange } from '../utils/dateUtils'

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function MultiSelect({ label, options, selected, onChange, expanded = false }) {
  const allSelected = selected.length === 0
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-bold text-base text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</label>
        {!allSelected && (
          <button onClick={() => onChange([])} className="text-base text-blue-500 hover:text-blue-400">清除</button>
        )}
      </div>
      <div className={`flex flex-wrap ${expanded ? 'gap-2' : 'gap-1.5'}`}>
        {options.map(opt => {
          const val = typeof opt === 'object' ? opt.value : opt
          const lbl = typeof opt === 'object' ? opt.label : opt
          return (
            <button key={val} onClick={() => toggle(val)}
              className={`rounded-md border transition-all min-h-[40px] ${
                expanded ? 'px-4 py-2 text-base font-medium' : 'px-2.5 py-1.5 text-base'
              } ${
                selected.includes(val)
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400'
              }`}>{lbl}</button>
          )
        })}
      </div>
    </div>
  )
}

function SearchableCheckList({ label, options, selected, onChange, placeholder = '搜尋...', expanded = false }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const filtered = options.filter(o => !q || o.toLowerCase().includes(q.toLowerCase()))
    return filtered.slice(0, 60)
  }, [options, q])
  const selSet = new Set(selected)
  const toggle = (v) => onChange(selSet.has(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-bold text-base text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</label>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-base text-blue-500 hover:text-blue-400">
            清除 ({selected.length})
          </button>
        )}
      </div>
      <input
        type="text" value={q} onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg mb-1.5 focus:outline-none focus:border-blue-400 bg-gray-50 dark:bg-gray-700 text-base px-3 py-2.5 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition-all"
      />
      <div className={`overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 transition-all ${
        expanded ? 'max-h-64 space-y-1 p-2' : 'max-h-44 space-y-0.5 p-1.5'
      }`}>
        {shown.length === 0 ? (
          <p className="text-base text-gray-400 dark:text-gray-500 px-2 py-1">無結果</p>
        ) : shown.map(opt => (
          <label key={opt} className={`flex items-center rounded cursor-pointer transition-colors min-h-[44px] ${
            expanded ? 'gap-3 px-3 py-2.5' : 'gap-2 px-2 py-2'
          } ${selSet.has(opt) ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-white dark:hover:bg-gray-600'}`}>
            <input
              type="checkbox" checked={selSet.has(opt)} onChange={() => toggle(opt)}
              className="accent-blue-600 flex-shrink-0 w-5 h-5"
            />
            <span className={`truncate text-base ${
              selSet.has(opt) ? 'text-blue-700 dark:text-blue-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
            }`}>{opt}</span>
          </label>
        ))}
        {options.length > 60 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1 border-t border-gray-200 dark:border-gray-600">共 {options.length} 項，請搜尋縮小範圍</p>
        )}
      </div>
    </div>
  )
}

function detectQuickMode(dateRange) {
  if (!dateRange) return 'all'
  const m = getThisMonthRange()
  const q = getThisQuarterRange()
  const y = getThisYearRange()
  const lm = getLastMonthRange()
  const eq = (a, b) => a.start === b.start && a.end === b.end
  if (eq(dateRange, m)) return 'month'
  if (eq(dateRange, lm)) return 'lastMonth'
  if (eq(dateRange, q)) return 'quarter'
  if (eq(dateRange, y)) return 'year'
  return 'custom'
}

export default function FilterPanel({ meta, filters, onChange, allRows = [], open = true, onToggle }) {
  const { years, channels, channelTypes, brands: rawBrands, customers = [], products = [] } = meta

  // 品牌依銷售總額降冪排序
  const brands = useMemo(() => {
    if (!allRows.length) return rawBrands
    const totals = {}
    for (const r of allRows) {
      if (r.brand) totals[r.brand] = (totals[r.brand] || 0) + (r.subtotal || 0)
    }
    return [...rawBrands].sort((a, b) => (totals[b] || 0) - (totals[a] || 0))
  }, [rawBrands, allRows])
  const [showCustomDate, setShowCustomDate] = useState(false)
  const quickMode = detectQuickMode(filters.dateRange)

  const isExpanded = filters.brands.length > 0 || (filters.products?.length > 0)
  const activeFilterCount =
    filters.brands.length + (filters.products?.length || 0) +
    filters.channels.length + filters.channelTypes.length +
    filters.years.length + filters.months.length +
    (filters.customers?.length || 0)

  const availableProducts = useMemo(() => {
    if (!filters.brands.length || !allRows.length) return products
    const brandRows = allRows.filter(r => filters.brands.includes(r.brand))
    return [...new Set(brandRows.map(r => r.product).filter(Boolean))].sort()
  }, [filters.brands, allRows, products])

  const availableChannels = useMemo(() => {
    if (!filters.brands.length || !allRows.length) return channels
    const brandRows = allRows.filter(r => filters.brands.includes(r.brand))
    return [...new Set(brandRows.map(r => r.channel).filter(Boolean))].sort()
  }, [filters.brands, allRows, channels])

  const availableChannelTypes = useMemo(() => {
    if (!filters.brands.length || !allRows.length) return channelTypes
    const brandRows = allRows.filter(r => filters.brands.includes(r.brand))
    return [...new Set(brandRows.map(r => r.channelType).filter(Boolean))].sort()
  }, [filters.brands, allRows, channelTypes])

  const set = (key, clearDateRange = false) => (val) =>
    onChange({ ...filters, [key]: val, ...(clearDateRange ? { dateRange: null } : {}) })

  const setQuick = (mode) => {
    if (mode === 'all') {
      onChange({ ...filters, dateRange: null, years: [], months: [] })
      setShowCustomDate(false)
    } else if (mode === 'month') {
      onChange({ ...filters, dateRange: getThisMonthRange(), years: [], months: [] })
      setShowCustomDate(false)
    } else if (mode === 'lastMonth') {
      onChange({ ...filters, dateRange: getLastMonthRange(), years: [], months: [] })
      setShowCustomDate(false)
    } else if (mode === 'quarter') {
      onChange({ ...filters, dateRange: getThisQuarterRange(), years: [], months: [] })
      setShowCustomDate(false)
    } else if (mode === 'year') {
      onChange({ ...filters, dateRange: getThisYearRange(), years: [], months: [] })
      setShowCustomDate(false)
    } else if (mode === 'custom') {
      setShowCustomDate(true)
    }
  }

  const QUICK_BTNS = [
    { v: 'all', l: '全部' }, { v: 'month', l: '本月' }, { v: 'lastMonth', l: '上月' },
    { v: 'quarter', l: '本季' }, { v: 'year', l: '本年' }, { v: 'custom', l: '自訂' },
  ]

  const panelWidth = !open ? 40 : (isExpanded ? 380 : 288)

  return (
    <div
      className="flex-shrink-0 h-full bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden shadow-sm"
      style={{ width: panelWidth, maxWidth: 'calc(100vw - 16px)', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      {/* Collapsed state */}
      {!open && (
        <button
          onClick={onToggle}
          title="展開篩選"
          className="w-full flex flex-col items-center py-4 gap-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex-1"
        >
          <span className="text-lg">▶</span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              {activeFilterCount > 9 ? '9+' : activeFilterCount}
            </span>
          )}
          <span className="text-xs font-bold text-gray-300 dark:text-gray-600 [writing-mode:vertical-rl] rotate-180 mt-1">篩選條件</span>
        </button>
      )}

      {/* Expanded state */}
      {open && (
        <>
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">篩選條件</h2>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                    {activeFilterCount} 項
                  </span>
                )}
                <button
                  onClick={onToggle}
                  title="收折篩選面板"
                  className="w-6 h-6 rounded-md bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors text-sm font-bold"
                >◀</button>
              </div>
            </div>
            <p className="text-base text-blue-100 mt-0.5">
              {isExpanded ? '品牌/產品篩選中，面板已放大' : '點選條件以篩選資料'}
            </p>
          </div>

          {/* Mobile close button (sticky at top) */}
          <div className="md:hidden px-4 py-2 flex justify-end bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onToggle}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-base font-semibold rounded-xl shadow-sm active:bg-blue-700 transition-colors"
            >
              ✓ 套用篩選
            </button>
          </div>

          <div className="filter-scroll-area flex-1 overflow-y-auto p-3.5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
            {/* Metric */}
            <div className="mb-4">
              <label className="text-base font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1.5">分析指標</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                {[{ v: 'subtotal', l: '銷售金額' }, { v: 'quantity', l: '銷售數量' }].map(({ v, l }) => (
                  <button key={v} onClick={() => onChange({ ...filters, metric: v })}
                    className={`text-base py-2 rounded-md transition-all font-medium ${
                      filters.metric === v
                        ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}>{l}</button>
                ))}
              </div>
            </div>

            {/* Time quick select */}
            <div className="mb-4">
              <label className="text-base font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1.5">時間週期</label>
              <div className="grid grid-cols-3 gap-1">
                {QUICK_BTNS.map(({ v, l }) => (
                  <button key={v} onClick={() => setQuick(v)}
                    className={`text-base py-2 rounded-md border transition-all ${
                      quickMode === v
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}>{l}</button>
                ))}
              </div>
              {(showCustomDate || quickMode === 'custom') && (
                <div className="mt-2 space-y-1.5">
                  {['開始日期', '結束日期'].map((label, idx) => (
                    <div key={label}>
                      <label className="text-base text-gray-500 dark:text-gray-400 mb-0.5 block">{label}</label>
                      <input type="date"
                        value={idx === 0 ? (filters.dateRange?.start || '') : (filters.dateRange?.end || '')}
                        onChange={e => onChange({
                          ...filters,
                          dateRange: { ...filters.dateRange, [idx === 0 ? 'start' : 'end']: e.target.value },
                          years: [], months: []
                        })}
                        className="w-full text-base px-2.5 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                      />
                    </div>
                  ))}
                </div>
              )}
              {filters.dateRange && (
                <p className="text-base text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                  {filters.dateRange.start} ~ {filters.dateRange.end}
                </p>
              )}
            </div>

            <MultiSelect label="年份" options={years} selected={filters.years} onChange={set('years', true)} />
            <MultiSelect label="月份" options={MONTHS.map((m, i) => ({ value: m, label: MONTH_LABELS[i] }))} selected={filters.months} onChange={set('months', true)} />
            <MultiSelect label="網路/實體" options={availableChannels} selected={filters.channels} onChange={set('channels')} />
            {availableChannelTypes.length > 0 && <MultiSelect label="通路類型" options={availableChannelTypes} selected={filters.channelTypes} onChange={set('channelTypes')} />}
            <MultiSelect label="品牌" options={brands} selected={filters.brands} onChange={set('brands')} expanded={isExpanded} />

            {customers.length > 0 && (
              <SearchableCheckList label="客戶" options={customers} selected={filters.customers || []} onChange={set('customers')} placeholder="搜尋客戶名稱..." expanded={isExpanded} />
            )}
            {availableProducts.length > 0 && (
              <SearchableCheckList
                label={filters.brands.length > 0 ? `產品（${filters.brands.join('、')} 相關）` : '產品'}
                options={availableProducts} selected={filters.products || []} onChange={set('products')} placeholder="搜尋產品名稱..." expanded={isExpanded}
              />
            )}

            <button
              onClick={() => onChange({ years: [], months: [], channels: [], channelTypes: [], brands: [], customers: [], products: [], dateRange: null, metric: filters.metric })}
              className="w-full text-base py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 mt-2 transition-colors"
            >重置所有篩選</button>
          </div>
        </>
      )}
    </div>
  )
}

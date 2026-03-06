import { useState, useMemo } from 'react'
import { getThisMonthRange, getThisQuarterRange, getThisYearRange, getLastMonthRange } from '../utils/dateUtils'
import dayjs from 'dayjs'

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function MultiSelect({ label, options, selected, onChange, expanded = false }) {
  const allSelected = selected.length === 0
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className={`font-bold text-gray-400 uppercase tracking-wider ${expanded ? 'text-sm' : 'text-base'}`}>{label}</label>
        {!allSelected && (
          <button onClick={() => onChange([])} className={`text-blue-500 hover:text-blue-700 ${expanded ? 'text-sm' : 'text-base'}`}>清除</button>
        )}
      </div>
      <div className={`flex flex-wrap ${expanded ? 'gap-2' : 'gap-1.5'}`}>
        {options.map(opt => {
          const val = typeof opt === 'object' ? opt.value : opt
          const lbl = typeof opt === 'object' ? opt.label : opt
          return (
            <button key={val} onClick={() => toggle(val)}
              className={`rounded-md border transition-all ${
                expanded ? 'px-4 py-2 text-sm font-medium' : 'px-2.5 py-1 text-base'
              } ${
                selected.includes(val)
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'
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
        <label className={`font-bold text-gray-400 uppercase tracking-wider ${expanded ? 'text-sm' : 'text-base'}`}>{label}</label>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className={`text-blue-500 hover:text-blue-700 ${expanded ? 'text-sm' : 'text-base'}`}>
            清除 ({selected.length})
          </button>
        )}
      </div>
      <input
        type="text" value={q} onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg mb-1.5 focus:outline-none focus:border-blue-400 bg-gray-50 transition-all ${
          expanded ? 'text-sm px-3 py-2.5' : 'text-base px-2.5 py-2'
        }`}
      />
      <div className={`overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 transition-all ${
        expanded ? 'max-h-64 space-y-1 p-2' : 'max-h-40 space-y-0.5 p-1.5'
      }`}>
        {shown.length === 0 ? (
          <p className={`text-gray-400 px-2 py-1 ${expanded ? 'text-sm' : 'text-base'}`}>無結果</p>
        ) : shown.map(opt => (
          <label key={opt} className={`flex items-center rounded cursor-pointer transition-colors ${
            expanded ? 'gap-3 px-3 py-2.5' : 'gap-2 px-2 py-1.5'
          } ${selSet.has(opt) ? 'bg-blue-50' : 'hover:bg-white'}`}>
            <input
              type="checkbox" checked={selSet.has(opt)} onChange={() => toggle(opt)}
              className={`accent-blue-600 flex-shrink-0 ${expanded ? 'w-5 h-5' : 'w-3.5 h-3.5'}`}
            />
            <span className={`truncate ${expanded ? 'text-sm' : 'text-base'} ${
              selSet.has(opt) ? 'text-blue-700 font-semibold' : 'text-gray-700'
            }`}>{opt}</span>
          </label>
        ))}
        {options.length > 60 && (
          <p className="text-xs text-gray-400 px-2 py-1 border-t">共 {options.length} 項，請搜尋縮小範圍</p>
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

export default function FilterPanel({ meta, filters, onChange }) {
  const { years, channels, channelTypes, brands, customers = [], products = [] } = meta
  const [showCustomDate, setShowCustomDate] = useState(false)
  const quickMode = detectQuickMode(filters.dateRange)

  const isExpanded = filters.brands.length > 0 || (filters.products?.length > 0)
  const activeFilterCount = filters.brands.length + (filters.products?.length || 0)

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
    { v: 'all', l: '全部' },
    { v: 'month', l: '本月' },
    { v: 'lastMonth', l: '上月' },
    { v: 'quarter', l: '本季' },
    { v: 'year', l: '本年' },
    { v: 'custom', l: '自訂' },
  ]

  return (
    <div
      className="flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-hidden shadow-sm transition-all duration-300"
      style={{ width: isExpanded ? 380 : 288 }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">篩選條件</h2>
          {isExpanded && (
            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
              已篩選 {activeFilterCount} 項
            </span>
          )}
        </div>
        <p className="text-base text-blue-100 mt-0.5">
          {isExpanded ? '品牌/產品篩選中，面板已放大' : '點選條件以篩選資料'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5">
        {/* Metric */}
        <div className="mb-4">
          <label className="text-base font-bold text-gray-400 uppercase tracking-wider block mb-1.5">分析指標</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
            {[{ v: 'subtotal', l: '銷售金額' }, { v: 'quantity', l: '銷售數量' }].map(({ v, l }) => (
              <button key={v} onClick={() => onChange({ ...filters, metric: v })}
                className={`text-base py-2 rounded-md transition-all font-medium ${
                  filters.metric === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Time quick select */}
        <div className="mb-4">
          <label className="text-base font-bold text-gray-400 uppercase tracking-wider block mb-1.5">時間週期</label>
          <div className="grid grid-cols-3 gap-1">
            {QUICK_BTNS.map(({ v, l }) => (
              <button key={v} onClick={() => setQuick(v)}
                className={`text-base py-2 rounded-md border transition-all ${
                  quickMode === v ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                }`}>{l}</button>
            ))}
          </div>
          {(showCustomDate || quickMode === 'custom') && (
            <div className="mt-2 space-y-1.5">
              <div>
                <label className="text-base text-gray-500 mb-0.5 block">開始日期</label>
                <input type="date" value={filters.dateRange?.start || ''}
                  onChange={e => onChange({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value }, years: [], months: [] })}
                  className="w-full text-base px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-base text-gray-500 mb-0.5 block">結束日期</label>
                <input type="date" value={filters.dateRange?.end || ''}
                  onChange={e => onChange({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value }, years: [], months: [] })}
                  className="w-full text-base px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          )}
          {filters.dateRange && (
            <p className="text-base text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded">
              {filters.dateRange.start} ~ {filters.dateRange.end}
            </p>
          )}
        </div>

        <MultiSelect label="年份" options={years} selected={filters.years} onChange={set('years', true)} />
        <MultiSelect label="月份" options={MONTHS.map((m, i) => ({ value: m, label: MONTH_LABELS[i] }))} selected={filters.months} onChange={set('months', true)} />
        <MultiSelect label="網路/實體" options={channels} selected={filters.channels} onChange={set('channels')} />
        {channelTypes.length > 0 && <MultiSelect label="通路類型" options={channelTypes} selected={filters.channelTypes} onChange={set('channelTypes')} />}
        <MultiSelect label="品牌" options={brands} selected={filters.brands} onChange={set('brands')} expanded={isExpanded} />

        {customers.length > 0 && (
          <SearchableCheckList label="客戶" options={customers} selected={filters.customers || []} onChange={set('customers')} placeholder="搜尋客戶名稱..." expanded={isExpanded} />
        )}
        {products.length > 0 && (
          <SearchableCheckList label="產品" options={products} selected={filters.products || []} onChange={set('products')} placeholder="搜尋產品名稱..." expanded={isExpanded} />
        )}

        <button
          onClick={() => onChange({ years: [], months: [], channels: [], channelTypes: [], brands: [], customers: [], products: [], dateRange: null, metric: filters.metric })}
          className="w-full text-base py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 mt-2 transition-colors"
        >重置所有篩選</button>
      </div>
    </div>
  )
}

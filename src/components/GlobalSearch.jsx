import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'

function fmtY(v) {
  if (!v) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + ' 億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}

const TYPE_META = {
  product:  { icon: '🏷️', label: '產品', tab: 'product',  color: 'text-violet-600 bg-violet-50' },
  customer: { icon: '👥', label: '客戶', tab: 'customer', color: 'text-amber-600 bg-amber-50' },
  brand:    { icon: '✨', label: '品牌', tab: 'brand',    color: 'text-blue-600 bg-blue-50' },
}

export default function GlobalSearch({ open, onClose, onNavigate, productData, customerData, brandData }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Build fuse index across all three datasets
  const { fuse, items } = useMemo(() => {
    const items = [
      ...productData.map(d => ({ name: d.name, subtotal: d.subtotal, quantity: d.quantity, _type: 'product' })),
      ...customerData.map(d => ({ name: d.name, subtotal: d.subtotal, quantity: d.quantity, _type: 'customer' })),
      ...brandData.map(d => ({ name: d.name, subtotal: d.subtotal, quantity: d.quantity, _type: 'brand' })),
    ]
    const fuse = new Fuse(items, { keys: ['name'], threshold: 0.4, includeScore: true })
    return { fuse, items }
  }, [productData, customerData, brandData])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query).slice(0, 12).map(r => r.item)
  }, [query, fuse])

  // Auto focus when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [results])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('[data-active="true"]')
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) {
      const meta = TYPE_META[results[activeIdx]._type]
      onNavigate(meta.tab)
      onClose()
    }
  }

  const handleSelect = (item) => {
    const meta = TYPE_META[item._type]
    onNavigate(meta.tab)
    onClose()
  }

  if (!open) return null

  // Group results by type for display
  const grouped = ['product', 'customer', 'brand'].map(type => ({
    type,
    meta: TYPE_META[type],
    items: results.filter(r => r._type === type),
  })).filter(g => g.items.length > 0)

  // Flat list for keyboard nav index mapping
  const flatResults = results

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <span className="text-xl flex-shrink-0">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜尋產品、客戶、品牌..."
            className="flex-1 text-base text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500 text-lg">✕</button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 360 }}>
          {query.trim() === '' && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              <div className="text-3xl mb-2">🔍</div>
              輸入關鍵字搜尋產品、客戶或品牌
            </div>
          )}

          {query.trim() !== '' && results.length === 0 && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              <div className="text-3xl mb-2">😕</div>
              找不到「{query}」相關資料
            </div>
          )}

          {grouped.map(({ type, meta, items: groupItems }) => (
            <div key={type}>
              <div className="px-4 py-1.5 text-sm font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                {meta.icon} {meta.label}
              </div>
              {groupItems.map((item) => {
                const globalIdx = flatResults.indexOf(item)
                const isActive = globalIdx === activeIdx
                return (
                  <button
                    key={item.name + item._type}
                    data-active={isActive}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-sm font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="text-sm font-mono text-gray-500">
                        NT$ {fmtY(item.subtotal)}
                      </span>
                      {isActive && (
                        <span className="text-sm text-blue-400 font-medium">Enter ↵</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-sm text-gray-400">
            <span><kbd className="bg-white border border-gray-200 rounded px-1">↑</kbd> <kbd className="bg-white border border-gray-200 rounded px-1">↓</kbd> 移動</span>
            <span><kbd className="bg-white border border-gray-200 rounded px-1">Enter</kbd> 跳轉</span>
            <span><kbd className="bg-white border border-gray-200 rounded px-1">Esc</kbd> 關閉</span>
            <span className="ml-auto">{results.length} 筆結果</span>
          </div>
        )}
      </div>
    </div>
  )
}

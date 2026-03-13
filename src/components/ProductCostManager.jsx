import { useState, useMemo, useRef } from 'react'

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export default function ProductCostManager({ products = [], costs = {}, onUpdateCost, onUpdateMany }) {
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [sortBy, setSortBy] = useState('name') // 'name' | 'cost' | 'nocost'
  const fileInputRef = useRef(null)

  const coveredCount = useMemo(() =>
    products.filter(p => costs[p] != null && !isNaN(costs[p])).length,
    [products, costs])

  const filtered = useMemo(() => {
    let list = [...products]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.toLowerCase().includes(q))
    }
    if (sortBy === 'name') list.sort((a, b) => a.localeCompare(b, 'zh-TW'))
    else if (sortBy === 'cost') list.sort((a, b) => (costs[b] ?? -1) - (costs[a] ?? -1))
    else if (sortBy === 'nocost') list.sort((a, b) => {
      const aHas = costs[a] != null ? 1 : 0
      const bHas = costs[b] != null ? 1 : 0
      return aHas - bHas
    })
    return list
  }, [products, search, sortBy, costs])

  const startEdit = (product) => {
    setEditingProduct(product)
    setEditValue(costs[product] != null ? String(costs[product]) : '')
  }

  const commitEdit = (product) => {
    const val = parseFloat(editValue)
    onUpdateCost(product, isNaN(val) || editValue.trim() === '' ? null : val)
    setEditingProduct(null)
    setEditValue('')
  }

  const cancelEdit = () => { setEditingProduct(null); setEditValue('') }

  const exportCSV = () => {
    const header = '品名,成本'
    const rows = products.map(p => {
      const name = `"${p.replace(/"/g, '""')}"`
      const cost = costs[p] != null ? costs[p] : ''
      return `${name},${cost}`
    })
    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `商品成本_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importCSV = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result.replace(/^\uFEFF/, '')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      let updated = 0, skipped = 0
      const updates = {}
      lines.slice(1).forEach(line => {
        const cols = parseCSVLine(line)
        if (cols.length >= 2) {
          const name = cols[0].trim()
          const costStr = cols[1].trim()
          const cost = parseFloat(costStr)
          if (name && costStr !== '' && !isNaN(cost)) {
            updates[name] = cost
            updated++
          } else if (name && costStr !== '') {
            skipped++
          }
        }
      })
      onUpdateMany(updates)
      setImportResult({ updated, skipped })
      setTimeout(() => setImportResult(null), 6000)
    }
    reader.readAsText(file, 'UTF-8')
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <div className="text-5xl mb-4">📦</div>
        <p className="text-lg font-medium">尚未匯入商品資料</p>
        <p className="text-sm mt-1">請先上傳銷售資料，系統將自動列出所有商品</p>
      </div>
    )
  }

  const coverPct = products.length > 0 ? (coveredCount / products.length) * 100 : 0

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">商品成本管理</h2>
          <p className="text-sm text-gray-400 mt-1">
            共 <span className="font-semibold text-gray-600">{products.length}</span> 項商品 ·
            已設定 <span className="font-semibold text-emerald-600">{coveredCount}</span> 項 ·
            未設定 <span className="font-semibold text-orange-500">{products.length - coveredCount}</span> 項
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 bg-gray-100 rounded-full w-48">
              <div
                className="h-2 bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${coverPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{Math.round(coverPct)}% 已設定</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 text-sm font-medium transition-colors"
          >
            📥 匯入 CSV
          </button>
          <input
            ref={fileInputRef} type="file" accept=".csv" className="hidden"
            onChange={e => { if (e.target.files[0]) { importCSV(e.target.files[0]); e.target.value = '' } }}
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            📤 匯出 CSV
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex items-center gap-2">
          <span>✓</span>
          <span>
            已更新 <strong>{importResult.updated}</strong> 項成本
            {importResult.skipped > 0 ? `，略過 ${importResult.skipped} 項無效資料` : ''}
          </span>
        </div>
      )}

      {/* CSV format hint */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <span className="font-semibold">💡 CSV 格式說明：</span>
        第一列為標題（品名, 成本），第二列起輸入資料。
        建議先「匯出 CSV」下載模板，填寫成本後再「匯入 CSV」批次更新。
        匯入時只更新有對應品名的項目，其餘不變。
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2 mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋商品名稱..."
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white"
        />
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {[
            { v: 'name', l: '名稱' },
            { v: 'cost', l: '成本高→低' },
            { v: 'nocost', l: '未設定優先' },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setSortBy(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">品名</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">成本（元）</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-gray-400">
                  {search ? `找不到「${search}」相關商品` : '無商品資料'}
                </td>
              </tr>
            ) : filtered.map(product => {
              const cost = costs[product]
              const isEditing = editingProduct === product
              return (
                <tr key={product} className={`hover:bg-gray-50 transition-colors ${isEditing ? 'bg-blue-50/60' : ''}`}>
                  <td className="px-5 py-3.5 text-gray-700 font-medium">{product}</td>
                  <td className="px-5 py-3.5 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-gray-400 text-xs">NT$</span>
                        <input
                          type="number"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(product)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(product)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="w-36 px-3 py-1.5 border-2 border-blue-400 rounded-lg text-right text-sm focus:outline-none bg-white"
                          min="0" step="0.01" placeholder="輸入成本"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(product)}
                        className={`text-right w-full transition-colors ${
                          cost != null
                            ? 'font-mono font-semibold text-gray-800 hover:text-blue-600'
                            : 'text-gray-300 text-xs italic hover:text-blue-400'
                        }`}
                      >
                        {cost != null ? `NT$ ${Number(cost).toLocaleString()}` : '點擊設定成本'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {isEditing ? (
                      <button onClick={cancelEdit}
                        className="px-2.5 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        取消
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => startEdit(product)}
                          className="px-2.5 py-1 rounded-md text-xs text-blue-600 hover:bg-blue-50 transition-colors font-medium">
                          編輯
                        </button>
                        {cost != null && (
                          <button onClick={() => onUpdateCost(product, null)}
                            className="px-2.5 py-1 rounded-md text-xs text-red-400 hover:bg-red-50 transition-colors">
                            清除
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          顯示 {filtered.length} / {products.length} 項商品
        </div>
      </div>
    </div>
  )
}

import { useState, useMemo } from 'react'

function fmtNum(v) {
  if (v == null || v === '') return '—'
  if (typeof v !== 'number') return v
  return Math.round(v).toLocaleString()
}

function pct(v, total) {
  if (!total) return '—'
  return Math.round(v / total * 100) + '%'
}

export { pct }

export default function ChartDataTable({ title = '數據明細', columns, data, defaultOpen = true, maxRows }) {
  const [open, setOpen] = useState(defaultOpen)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va ?? ''), sb = String(vb ?? '')
      return sortDir === 'asc'
        ? sa.localeCompare(sb, 'zh-TW')
        : sb.localeCompare(sa, 'zh-TW')
    })
  }, [data, sortKey, sortDir])

  const rows = maxRows ? sortedData.slice(0, maxRows) : sortedData

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-base font-bold text-gray-600 hover:text-blue-600 mb-3 transition-colors"
      >
        <span className={`transition-transform duration-200 text-sm ${open ? 'rotate-90' : ''}`}>▶</span>
        {title}
        <span className="text-sm text-gray-400 font-normal bg-gray-100 px-2 py-0.5 rounded-full">{data.length} 筆</span>
        {sortKey && (
          <span className="text-sm text-blue-500 font-normal">
            依「{columns.find(c => c.key === sortKey)?.label ?? sortKey}」{sortDir === 'asc' ? '升冪' : '降冪'}
          </span>
        )}
      </button>
      {open && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {columns.map(col => (
                  <th key={col.key}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    className={`px-3 py-3.5 font-semibold text-gray-500 whitespace-nowrap select-none
                      ${col.align === 'right' ? 'text-right' : 'text-left'}
                      ${col.sortable ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50/40 transition-colors' : ''}`}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        sortKey === col.key
                          ? <span className="text-blue-500 text-sm">{sortDir === 'asc' ? '↑' : '↓'}</span>
                          : <span className="text-gray-300 text-sm">↕</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-t border-gray-50 hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  {columns.map(col => (
                    <td key={col.key}
                      className={`px-3 py-3 text-base whitespace-nowrap ${col.align === 'right' ? 'text-right font-mono' : 'text-left'} ${col.cls?.(row[col.key], row) || 'text-gray-700'}`}>
                      {col.fmt ? col.fmt(row[col.key], row) : fmtNum(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {maxRows && data.length > maxRows && (
            <div className="px-3 py-2 bg-gray-50 text-sm text-gray-400 border-t border-gray-100">
              顯示前 {maxRows} 筆，共 {data.length} 筆
            </div>
          )}
        </div>
      )}
    </div>
  )
}

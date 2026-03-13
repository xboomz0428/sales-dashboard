import { useState, useMemo } from 'react'

const PAGE_SIZE = 50

const COLS = [
  { key: 'date', label: '日期', align: 'left' },
  { key: 'channel', label: '通路', align: 'left' },
  { key: 'channelType', label: '通路類型', align: 'left' },
  { key: 'customer', label: '客戶', align: 'left' },
  { key: 'brand', label: '品牌', align: 'left' },
  { key: 'product', label: '產品', align: 'left' },
  { key: 'agentType', label: '代理類型', align: 'left' },
  { key: 'quantity', label: '數量', align: 'right', fmt: v => v.toLocaleString() },
  { key: 'subtotal', label: '小計', align: 'right', fmt: v => v.toLocaleString() },
  { key: 'total', label: '合計', align: 'right', fmt: v => v.toLocaleString() },
  { key: 'discountRate', label: '折扣率', align: 'right', fmt: v => v > 0 ? Math.round(v * 100) + '%' : '-' },
  { key: 'orderId', label: '訂單編號', align: 'left' },
]

export default function DataTable({ rows }) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    const col = COLS.find(c => c.key === sortKey)
    return [...rows].sort((a, b) => {
      let va = a[sortKey] ?? ''
      let vb = b[sortKey] ?? ''
      if (col?.align === 'right') {
        va = Number(va) || 0
        vb = Number(vb) || 0
        return sortDir === 'asc' ? va - vb : vb - va
      }
      return sortDir === 'asc'
        ? va.toString().localeCompare(vb.toString())
        : vb.toString().localeCompare(va.toString())
    })
  }, [rows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span className="text-gray-300 dark:text-gray-600 ml-1">↕</span>
    return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const btnCls = "px-2 py-1 rounded border border-gray-200 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          資料明細
          <span className="ml-2 text-base font-normal text-gray-400 dark:text-gray-500">
            共 {rows.length.toLocaleString()} 筆，每頁 {PAGE_SIZE} 筆
          </span>
        </span>
        <div className="flex items-center gap-2 text-base text-gray-500 dark:text-gray-400">
          <button disabled={currentPage === 1} onClick={() => setPage(1)} className={btnCls}>«</button>
          <button disabled={currentPage === 1} onClick={() => setPage(p => p - 1)} className={btnCls}>‹</button>
          <span className="text-gray-600 dark:text-gray-300">{currentPage} / {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)} className={btnCls}>›</button>
          <button disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} className={btnCls}>»</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">無資料</div>
        ) : (
          <table className="w-full text-base">
            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
              <tr>
                <th className="text-right px-3 py-2 font-medium text-gray-400 dark:text-gray-600 w-10">#</th>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2 font-medium cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {pageRows.map((row, i) => (
                <tr key={row._key} className="hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <td className="px-3 py-2 text-right text-gray-300 dark:text-gray-600">
                    {(currentPage - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {COLS.map(col => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 ${col.align === 'right' ? 'text-right font-mono' : 'text-left'} text-gray-700 dark:text-gray-200 whitespace-nowrap`}
                    >
                      {col.fmt ? col.fmt(row[col.key] ?? 0) : (row[col.key] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

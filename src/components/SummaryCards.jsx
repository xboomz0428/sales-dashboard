import { useState, useMemo } from 'react'

const VISIBILITY_KEY = 'dashboard_card_visibility'

const CARD_LABELS = {
  totalSales: '總銷售金額',
  totalQty: '銷售數量',
  orderCount: '訂單筆數',
  customerCount: '客戶數',
  productCount: '品項數',
  avgDiscount: '平均折扣率',
  avgOrderValue: '平均客單價',
  avgRevenuePerCustomer: '每客銷售額',
  topProduct: '最暢銷商品',
  topCustomer: '最大客戶',
  grossProfit: '總毛利',
  grossMargin: '毛利率',
  peakMonth: '最高銷售月',
  lowMonth: '最低銷售月',
  avgMonthly: '月均銷售金額',
  top5Products: '數量最佳產品 Top 5',
  top5Customers: '數量最佳客戶 Top 5',
  top5Physical: '實體客戶 Top 5',
  top5Online: '網路客戶 Top 5',
}

const CARD_GROUPS = [
  { title: '基本指標', ids: ['totalSales', 'totalQty', 'orderCount', 'customerCount', 'productCount', 'avgDiscount'] },
  { title: '進階指標', ids: ['avgOrderValue', 'avgRevenuePerCustomer', 'topProduct', 'topCustomer'] },
  { title: '成本分析', ids: ['grossProfit', 'grossMargin'], requiresCost: true },
  { title: '趨勢洞察', ids: ['peakMonth', 'lowMonth', 'avgMonthly', 'top5Products', 'top5Customers', 'top5Physical', 'top5Online'] },
]

function loadVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIBILITY_KEY)) || {}
    const result = {}
    Object.keys(CARD_LABELS).forEach(id => {
      result[id] = saved[id] !== undefined ? saved[id] : true
    })
    return result
  } catch {
    const result = {}
    Object.keys(CARD_LABELS).forEach(id => { result[id] = true })
    return result
  }
}

function fmt(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 億'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 萬'
  return Math.round(n).toLocaleString()
}

function fmtInt(n) {
  return n != null ? Math.round(n).toLocaleString() : '—'
}

export default function SummaryCards({
  summary, metric, trendData = [], productData = [], customerData = [], customerByChannelTop = {}, costs = {}
}) {
  const [visibility, setVisibility] = useState(loadVisibility)
  const [showSettings, setShowSettings] = useState(false)

  const vis = (id) => visibility[id] !== false

  const toggleCard = (id) => {
    setVisibility(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))
      return next
    })
  }

  const { totalSales, totalQty, orderCount, avgDiscount, customerCount, productCount } = summary

  // Advanced metrics
  const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0
  const avgRevenuePerCustomer = customerCount > 0 ? totalSales / customerCount : 0
  const topProductByRevenue = productData.length > 0
    ? [...productData].sort((a, b) => b.subtotal - a.subtotal)[0] : null
  const topCustomerByRevenue = customerData.length > 0
    ? [...customerData].sort((a, b) => b.subtotal - a.subtotal)[0] : null

  // Cost metrics
  const hasCostData = Object.keys(costs).length > 0 && productData.length > 0
  const { grossProfit, grossMargin } = useMemo(() => {
    if (!hasCostData) return { grossProfit: 0, grossMargin: 0 }
    let totalCost = 0, covSales = 0
    productData.forEach(p => {
      const c = costs[p.name]
      if (c != null && !isNaN(c)) {
        totalCost += p.quantity * c
        covSales += p.subtotal
      }
    })
    const profit = covSales - totalCost
    return { grossProfit: profit, grossMargin: covSales > 0 ? profit / covSales : 0 }
  }, [productData, costs, hasCostData])

  // Build KPI cards array
  const kpiCards = [
    vis('totalSales') && {
      id: 'totalSales', label: '總銷售金額', value: `NT$ ${fmt(totalSales)}`,
      sub: fmtInt(totalSales) + ' 元',
      from: 'from-blue-500', to: 'to-blue-600', icon: '💰', light: 'bg-blue-50 text-blue-700',
    },
    vis('totalQty') && {
      id: 'totalQty', label: '銷售數量', value: fmtInt(totalQty),
      sub: '件', from: 'from-emerald-500', to: 'to-teal-600', icon: '📦', light: 'bg-emerald-50 text-emerald-700',
    },
    vis('orderCount') && {
      id: 'orderCount', label: '訂單筆數', value: fmtInt(orderCount),
      sub: '筆', from: 'from-violet-500', to: 'to-purple-600', icon: '🧾', light: 'bg-violet-50 text-violet-700',
    },
    vis('customerCount') && {
      id: 'customerCount', label: '客戶數', value: customerCount > 0 ? fmtInt(customerCount) : '—',
      sub: customerCount > 0 ? '不重複客戶' : '無客戶欄位',
      from: 'from-orange-500', to: 'to-amber-500', icon: '👥', light: 'bg-orange-50 text-orange-700',
    },
    vis('productCount') && {
      id: 'productCount', label: '品項數', value: productCount > 0 ? fmtInt(productCount) : '—',
      sub: productCount > 0 ? '不重複品項' : '無產品欄位',
      from: 'from-pink-500', to: 'to-rose-600', icon: '🏷️', light: 'bg-pink-50 text-pink-700',
    },
    vis('avgDiscount') && {
      id: 'avgDiscount', label: '平均折扣率', value: avgDiscount > 0 ? Math.round(avgDiscount * 100) + '%' : '無折扣',
      sub: avgDiscount > 0 ? '平均折扣幅度' : '—',
      from: 'from-cyan-500', to: 'to-sky-600', icon: '🎯', light: 'bg-cyan-50 text-cyan-700',
    },
    vis('avgOrderValue') && {
      id: 'avgOrderValue', label: '平均客單價', value: orderCount > 0 ? `NT$ ${fmt(avgOrderValue)}` : '—',
      sub: orderCount > 0 ? fmtInt(avgOrderValue) + ' 元 / 筆' : '—',
      from: 'from-indigo-500', to: 'to-blue-600', icon: '🛒', light: 'bg-indigo-50 text-indigo-700',
    },
    vis('avgRevenuePerCustomer') && {
      id: 'avgRevenuePerCustomer', label: '每客銷售額', value: customerCount > 0 ? `NT$ ${fmt(avgRevenuePerCustomer)}` : '—',
      sub: customerCount > 0 ? fmtInt(avgRevenuePerCustomer) + ' 元 / 客' : '需客戶欄位',
      from: 'from-teal-500', to: 'to-emerald-600', icon: '👤', light: 'bg-teal-50 text-teal-700',
    },
    vis('topProduct') && {
      id: 'topProduct', label: '最暢銷商品', value: topProductByRevenue?.name || '—',
      sub: topProductByRevenue ? `銷售 NT$ ${fmt(topProductByRevenue.subtotal)}` : '無產品資料',
      from: 'from-purple-500', to: 'to-violet-600', icon: '⭐', light: 'bg-purple-50 text-purple-700',
      truncateValue: true,
    },
    vis('topCustomer') && {
      id: 'topCustomer', label: '最大客戶', value: topCustomerByRevenue?.name || '—',
      sub: topCustomerByRevenue ? `購買 NT$ ${fmt(topCustomerByRevenue.subtotal)}` : '無客戶資料',
      from: 'from-amber-500', to: 'to-orange-500', icon: '🏆', light: 'bg-amber-50 text-amber-700',
      truncateValue: true,
    },
    (hasCostData && vis('grossProfit')) && {
      id: 'grossProfit', label: '總毛利', value: `NT$ ${fmt(Math.abs(grossProfit))}`,
      sub: (grossProfit < 0 ? '虧損 ' : '') + fmtInt(grossProfit) + ' 元',
      from: grossProfit >= 0 ? 'from-emerald-500' : 'from-red-500',
      to: grossProfit >= 0 ? 'to-green-600' : 'to-red-600',
      icon: '💹', light: grossProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
    },
    (hasCostData && vis('grossMargin')) && {
      id: 'grossMargin', label: '毛利率', value: `${Math.round(grossMargin * 100)}%`,
      sub: '已設定成本之商品',
      from: grossMargin >= 0.2 ? 'from-emerald-500' : 'from-yellow-400',
      to: grossMargin >= 0.2 ? 'to-green-600' : 'to-amber-500',
      icon: '📊', light: grossMargin >= 0.2 ? 'bg-emerald-50 text-emerald-700' : 'bg-yellow-50 text-yellow-700',
    },
  ].filter(Boolean)

  // Trend insights
  const peakMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal >= b.subtotal ? a : b) : null
  const lowMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal <= b.subtotal ? a : b) : null
  const avgMonthly = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.subtotal, 0) / trendData.length) : 0

  const top5Products = [...productData].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
  const top5Customers = [...customerData].sort((a, b) => b.quantity - a.quantity).slice(0, 5)

  const channelKeys = Object.keys(customerByChannelTop)
  const physicalKey = channelKeys.find(k => k.includes('實體')) || null
  const onlineKey = channelKeys.find(k => k.includes('網路')) || null
  const top5Physical = physicalKey ? customerByChannelTop[physicalKey] : []
  const top5Online = onlineKey ? customerByChannelTop[onlineKey] : []

  const showRow2 = trendData.length > 0 && (
    vis('peakMonth') || vis('lowMonth') || vis('avgMonthly') ||
    vis('top5Products') || vis('top5Customers') ||
    (vis('top5Physical') && (top5Physical.length > 0 || physicalKey)) ||
    (vis('top5Online') && (top5Online.length > 0 || onlineKey))
  )

  return (
    <div className="px-4 py-3 flex-shrink-0 space-y-2">
      {/* Settings button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          ⚙️ 自訂卡片
        </button>
      </div>

      {/* Row 1: KPI cards */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(card => (
            <div key={card.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className={`h-1 bg-gradient-to-r ${card.from} ${card.to}`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-semibold text-gray-500 leading-tight">{card.label}</span>
                  <span className={`text-lg rounded-lg px-1.5 py-0.5 ${card.light}`}>{card.icon}</span>
                </div>
                {card.truncateValue ? (
                  <div className="text-base font-bold text-gray-800 leading-tight truncate mt-1" title={card.value}>
                    {card.value}
                  </div>
                ) : (
                  <div className="text-2xl font-black text-gray-800 leading-tight">{card.value}</div>
                )}
                <div className="text-base text-gray-400 mt-0.5 truncate">{card.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Row 2: Trend insights + Top5 */}
      {showRow2 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {vis('peakMonth') && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">📈</span>
                <span className="text-base font-bold text-emerald-700">最高銷售月</span>
              </div>
              <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">{peakMonth?.yearMonth || '—'}</div>
              <div className="text-2xl font-black text-emerald-700 leading-tight tabular-nums">{peakMonth ? fmtInt(peakMonth.subtotal) : '—'}</div>
              <div className="text-base text-emerald-500 mt-0.5">元</div>
            </div>
          )}

          {vis('lowMonth') && (
            <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">📉</span>
                <span className="text-base font-bold text-red-700">最低銷售月</span>
              </div>
              <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">{lowMonth?.yearMonth || '—'}</div>
              <div className="text-2xl font-black text-red-500 leading-tight tabular-nums">{lowMonth ? fmtInt(lowMonth.subtotal) : '—'}</div>
              <div className="text-base text-red-400 mt-0.5">元</div>
            </div>
          )}

          {vis('avgMonthly') && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">📊</span>
                <span className="text-base font-bold text-blue-700">月均銷售金額</span>
              </div>
              <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">共 {trendData.length} 個月</div>
              <div className="text-2xl font-black text-blue-700 leading-tight tabular-nums">{fmtInt(avgMonthly)}</div>
              <div className="text-base text-blue-500 mt-0.5">元 / 月</div>
            </div>
          )}

          {vis('top5Products') && (
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">🏷️</span>
                <span className="text-base font-bold text-violet-700">數量最佳產品 Top 5</span>
              </div>
              <div className="space-y-2">
                {top5Products.length > 0 ? top5Products.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-1.5">
                    <span className="text-xs w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center font-black flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-gray-600 truncate leading-tight">{p.name}</div>
                      <div className="text-xl font-black font-mono text-violet-700 leading-tight tabular-nums">{fmtInt(p.quantity)} <span className="text-sm font-semibold">件</span></div>
                    </div>
                  </div>
                )) : <span className="text-base text-gray-400">無產品資料</span>}
              </div>
            </div>
          )}

          {vis('top5Customers') && (
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">👥</span>
                <span className="text-base font-bold text-amber-700">數量最佳客戶 Top 5</span>
              </div>
              <div className="space-y-2">
                {top5Customers.length > 0 ? top5Customers.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-1.5">
                    <span className="text-xs w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center font-black flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-gray-600 truncate leading-tight">{c.name}</div>
                      <div className="text-xl font-black font-mono text-amber-700 leading-tight tabular-nums">{fmtInt(c.quantity)} <span className="text-sm font-semibold">件</span></div>
                    </div>
                  </div>
                )) : <span className="text-base text-gray-400">無客戶資料</span>}
              </div>
            </div>
          )}

          {vis('top5Physical') && (top5Physical.length > 0 || physicalKey) && (
            <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">🏪</span>
                <span className="text-base font-bold text-rose-700">實體客戶 Top 5</span>
              </div>
              <div className="space-y-2">
                {top5Physical.length > 0 ? top5Physical.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-1.5">
                    <span className="text-xs w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center font-black flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-gray-600 truncate leading-tight">{c.name}</div>
                      <div className="text-xl font-black font-mono text-rose-700 leading-tight tabular-nums">{fmtInt(c[metric])} <span className="text-sm font-semibold">{metric === 'subtotal' ? '元' : '件'}</span></div>
                    </div>
                  </div>
                )) : <span className="text-base text-gray-400">無實體通路資料</span>}
              </div>
            </div>
          )}

          {vis('top5Online') && (top5Online.length > 0 || onlineKey) && (
            <div className="bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg">🌐</span>
                <span className="text-base font-bold text-sky-700">網路客戶 Top 5</span>
              </div>
              <div className="space-y-2">
                {top5Online.length > 0 ? top5Online.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-1.5">
                    <span className="text-xs w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center font-black flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-gray-600 truncate leading-tight">{c.name}</div>
                      <div className="text-xl font-black font-mono text-sky-700 leading-tight tabular-nums">{fmtInt(c[metric])} <span className="text-sm font-semibold">{metric === 'subtotal' ? '元' : '件'}</span></div>
                    </div>
                  </div>
                )) : <span className="text-base text-gray-400">無網路通路資料</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-800">⚙️ 自訂儀表板卡片</h3>
                <p className="text-xs text-gray-400 mt-0.5">選擇要在儀表板顯示的數據卡片</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {CARD_GROUPS.filter(g => !g.requiresCost || hasCostData).map(group => (
              <div key={group.title} className="mb-5">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-gray-100">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.ids.map(id => (
                    <label key={id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox" checked={visibility[id] !== false}
                        onChange={() => toggleCard(id)}
                        className="accent-blue-600 w-4 h-4 flex-shrink-0"
                      />
                      <span className="text-sm text-gray-600">{CARD_LABELS[id]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {!hasCostData && (
              <div className="mb-5 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                💡 前往「商品成本」標籤設定商品成本後，即可啟用成本分析卡片（總毛利、毛利率）
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const all = {}
                    Object.keys(CARD_LABELS).forEach(id => { all[id] = true })
                    setVisibility(all)
                    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(all))
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  全部顯示
                </button>
                <button
                  onClick={() => {
                    const none = {}
                    Object.keys(CARD_LABELS).forEach(id => { none[id] = false })
                    none['totalSales'] = true // keep at least one
                    setVisibility(none)
                    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(none))
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  全部隱藏
                </button>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

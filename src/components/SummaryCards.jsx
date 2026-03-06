function fmt(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(0) + ' 億'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 萬'
  return Math.round(n).toLocaleString()
}

function fmtInt(n) {
  return n != null ? Math.round(n).toLocaleString() : '—'
}

export default function SummaryCards({ summary, metric, trendData = [], productData = [], customerData = [], customerByChannelTop = {} }) {
  const { totalSales, totalQty, orderCount, avgDiscount, customerCount, productCount } = summary

  const cards = [
    {
      label: '總銷售金額', value: `NT$ ${fmt(totalSales)}`,
      sub: fmtInt(totalSales) + ' 元',
      from: 'from-blue-500', to: 'to-blue-600', icon: '💰', light: 'bg-blue-50 text-blue-700',
    },
    {
      label: '銷售數量', value: fmtInt(totalQty),
      sub: '件', from: 'from-emerald-500', to: 'to-teal-600', icon: '📦', light: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: '訂單筆數', value: fmtInt(orderCount),
      sub: '筆', from: 'from-violet-500', to: 'to-purple-600', icon: '🧾', light: 'bg-violet-50 text-violet-700',
    },
    {
      label: '客戶數', value: customerCount > 0 ? fmtInt(customerCount) : '—',
      sub: customerCount > 0 ? '不重複客戶' : '無客戶欄位', from: 'from-orange-500', to: 'to-amber-500', icon: '👥', light: 'bg-orange-50 text-orange-700',
    },
    {
      label: '品項數', value: productCount > 0 ? fmtInt(productCount) : '—',
      sub: productCount > 0 ? '不重複品項' : '無產品欄位', from: 'from-pink-500', to: 'to-rose-600', icon: '🏷️', light: 'bg-pink-50 text-pink-700',
    },
    {
      label: '平均折扣率', value: avgDiscount > 0 ? Math.round(avgDiscount * 100) + '%' : '無折扣',
      sub: avgDiscount > 0 ? '平均折扣幅度' : '—', from: 'from-cyan-500', to: 'to-sky-600', icon: '🎯', light: 'bg-cyan-50 text-cyan-700',
    },
  ]

  // Compute trend insights
  const peakMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal >= b.subtotal ? a : b) : null
  const lowMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.subtotal <= b.subtotal ? a : b) : null
  const avgMonthly = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.subtotal, 0) / trendData.length) : 0

  // Top 5 by quantity
  const top5Products = [...productData].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
  const top5Customers = [...customerData].sort((a, b) => b.quantity - a.quantity).slice(0, 5)

  // Channel customer top 5 (實體 / 網路)
  const channelKeys = Object.keys(customerByChannelTop)
  const physicalKey = channelKeys.find(k => k.includes('實體')) || null
  const onlineKey = channelKeys.find(k => k.includes('網路')) || null
  const top5Physical = physicalKey ? customerByChannelTop[physicalKey] : []
  const top5Online = onlineKey ? customerByChannelTop[onlineKey] : []

  return (
    <div className="px-4 py-3 flex-shrink-0 space-y-2">
      {/* Row 1: KPI cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-1 bg-gradient-to-r ${card.from} ${card.to}`} />
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-semibold text-gray-500">{card.label}</span>
                <span className={`text-lg rounded-lg px-1.5 py-0.5 ${card.light}`}>{card.icon}</span>
              </div>
              <div className="text-2xl font-black text-gray-800 leading-tight">{card.value}</div>
              <div className="text-base text-gray-400 mt-0.5">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Trend insights + Top5 + Channel Top5 */}
      {trendData.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {/* Peak month */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg">📈</span>
              <span className="text-base font-bold text-emerald-700">最高銷售月</span>
            </div>
            <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">{peakMonth?.yearMonth || '—'}</div>
            <div className="text-2xl font-black text-emerald-700 leading-tight tabular-nums">{peakMonth ? fmtInt(peakMonth.subtotal) : '—'}</div>
            <div className="text-base text-emerald-500 mt-0.5">元</div>
          </div>

          {/* Low month */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg">📉</span>
              <span className="text-base font-bold text-red-700">最低銷售月</span>
            </div>
            <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">{lowMonth?.yearMonth || '—'}</div>
            <div className="text-2xl font-black text-red-500 leading-tight tabular-nums">{lowMonth ? fmtInt(lowMonth.subtotal) : '—'}</div>
            <div className="text-base text-red-400 mt-0.5">元</div>
          </div>

          {/* Avg monthly */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg">📊</span>
              <span className="text-base font-bold text-blue-700">月均銷售金額</span>
            </div>
            <div className="text-base font-bold text-gray-500 leading-tight mb-0.5">共 {trendData.length} 個月</div>
            <div className="text-2xl font-black text-blue-700 leading-tight tabular-nums">{fmtInt(avgMonthly)}</div>
            <div className="text-base text-blue-500 mt-0.5">元 / 月</div>
          </div>

          {/* Top 5 products by quantity */}
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

          {/* Top 5 customers by quantity */}
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

          {/* Top 5 physical channel customers */}
          {(top5Physical.length > 0 || physicalKey) && (
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

          {/* Top 5 online channel customers */}
          {(top5Online.length > 0 || onlineKey) && (
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
    </div>
  )
}

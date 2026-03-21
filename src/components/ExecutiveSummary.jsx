import { useMemo, useState } from 'react'
import { callClaude } from '../utils/ai'

const fmtM = v => {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

const fmtPct = v => (v >= 0 ? '+' : '') + Math.round(v) + '%'

const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function KPICard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-700/50 text-blue-700 dark:text-blue-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-700/50 text-amber-700 dark:text-amber-400',
    red:    'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-700/50 text-red-700 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-700/50 text-purple-700 dark:text-purple-400',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-black">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <span className="text-base font-bold text-gray-700 dark:text-gray-200">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function ExecutiveSummary({ summary, trendData, productData, customerData, brandData, channelData, metric, allRows, filters }) {
  const [aiText, setAiText]     = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState('')
  const [selectedYear, setSelectedYear] = useState(null)

  const metricLabel = metric === 'subtotal' ? '銷售額' : '數量'

  // Available years in trend data
  const availableYears = useMemo(() => {
    const ys = [...new Set(trendData.map(d => d.yearMonth?.slice(0, 4)).filter(Boolean))].sort()
    return ys
  }, [trendData])

  const activeYear = selectedYear || availableYears[availableYears.length - 1] || ''

  // Monthly trend for selected year — all 12 months (fill missing with 0)
  const yearlyTrend = useMemo(() => {
    if (!activeYear) return []
    const map = {}
    trendData.forEach(d => {
      if (d.yearMonth?.startsWith(activeYear)) map[d.yearMonth] = d
    })
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      const ym = `${activeYear}-${mm}`
      return map[ym] || { yearMonth: ym, subtotal: 0, quantity: 0, _empty: true }
    })
  }, [trendData, activeYear])

  const maxYearly    = useMemo(() => Math.max(...yearlyTrend.map(d => d[metric] || 0), 1), [yearlyTrend, metric])
  const avgMonthly   = useMemo(() => {
    const filled = yearlyTrend.filter(d => (d[metric] || 0) > 0)
    if (!filled.length) return 0
    return filled.reduce((s, d) => s + (d[metric] || 0), 0) / filled.length
  }, [yearlyTrend, metric])

  const bestYM  = useMemo(() => yearlyTrend.reduce((b, d) => (d[metric]||0) > (b[metric]||0) ? d : b, yearlyTrend[0] || {}), [yearlyTrend, metric])
  const worstYM = useMemo(() => {
    const nonEmpty = yearlyTrend.filter(d => (d[metric]||0) > 0)
    if (!nonEmpty.length) return yearlyTrend[0] || {}
    return nonEmpty.reduce((w, d) => (d[metric]||0) < (w[metric]||0) ? d : w, nonEmpty[0])
  }, [yearlyTrend, metric])

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (filters?.dateRange?.start && filters?.dateRange?.end) {
      return `${filters.dateRange.start} ～ ${filters.dateRange.end}`
    }
    if (filters?.years?.length || filters?.months?.length) {
      const y = filters.years?.length ? filters.years.join('、') + ' 年' : ''
      const m = filters.months?.length ? filters.months.map(m => parseInt(m) + '月').join('、') : ''
      return [y, m].filter(Boolean).join(' ')
    }
    if (trendData.length) {
      const first = trendData[0].yearMonth
      const last  = trendData[trendData.length - 1].yearMonth
      return first === last ? first : `${first} ～ ${last}`
    }
    return '全部期間'
  }, [filters, trendData])

  // YoY & MoM stats
  const yoyStats = useMemo(() => {
    if (!trendData.length) return null
    const latest = trendData[trendData.length - 1]
    const [ly, lm] = latest.yearMonth.split('-')
    const prevYM   = `${parseInt(ly) - 1}-${lm}`
    const prev = trendData.find(d => d.yearMonth === prevYM)
    if (!prev) return null
    const chg = prev[metric] > 0 ? (latest[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { latest: latest[metric], prev: prev[metric], chg, yearMonth: latest.yearMonth }
  }, [trendData, metric])

  const momStats = useMemo(() => {
    if (trendData.length < 2) return null
    const cur  = trendData[trendData.length - 1]
    const prev = trendData[trendData.length - 2]
    const chg  = prev[metric] > 0 ? (cur[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { cur: cur[metric], prev: prev[metric], chg }
  }, [trendData, metric])

  const topProduct  = productData?.[0]
  const topCustomer = customerData?.[0]
  const topBrand    = brandData?.[0]

  const bestMonth  = useMemo(() => trendData.length ? trendData.reduce((b, d) => d[metric] > b[metric] ? d : b, trendData[0]) : null, [trendData, metric])
  const worstMonth = useMemo(() => trendData.length ? trendData.reduce((w, d) => d[metric] < w[metric] ? d : w, trendData[0]) : null, [trendData, metric])

  const channelConc = useMemo(() => {
    if (!channelData?.length) return null
    const total = channelData.reduce((s, d) => s + (d[metric] || 0), 0)
    const top   = channelData[0]
    if (!total || !top) return null
    return { name: top.name, pct: (top[metric] / total * 100) }
  }, [channelData, metric])

  // AI prompt — enhanced with recommendations + revenue formula angle
  const handleAI = async () => {
    setAiLoading(true); setAiError('')
    try {
      const prompt = `你是一位頂尖的商業分析顧問，請根據以下銷售數據撰寫一份給老闆看的決策摘要，使用繁體中文，語言精煉有力，每段 2-3 句，共 5-6 段。

【分析時間區間】
- 期間：${dateRangeLabel}
- 涵蓋 ${trendData.length} 個月（${trendData[0]?.yearMonth || '—'} ～ ${trendData[trendData.length - 1]?.yearMonth || '—'}）
- 分析指標：${metricLabel}

【整體績效】
- 總${metricLabel}：${fmtM(summary?.totalSales)}
- 客戶數：${summary?.customerCount}，訂單數：${summary?.orderCount}
- 月增率（最新 vs 上月）：${momStats ? fmtPct(momStats.chg) : '無'}
- 年增率（最新 vs 去年同月）：${yoyStats ? fmtPct(yoyStats.chg) : '無'}（${yoyStats?.yearMonth || ''}）

【最佳表現】
- 最佳月份：${bestMonth?.yearMonth}（${fmtM(bestMonth?.[metric])}）
- 最低月份：${worstMonth?.yearMonth}（${fmtM(worstMonth?.[metric])}）
- 頂尖產品：${topProduct?.name || '未知'}（${fmtM(topProduct?.[metric])}）
- 頂尖客戶：${topCustomer?.name || '未知'}（${fmtM(topCustomer?.[metric])}）
- 頂尖品牌：${topBrand?.name || '未知'}（${fmtM(topBrand?.[metric])}）

【通路集中度】
- 主要通路「${channelConc?.name || '未知'}」佔比 ${channelConc ? channelConc.pct.toFixed(0) : '—'}%

請根據以上資料，從「業績 = 銷售數量 × 銷售金額 − 退貨 − 客訴」的角度出發，提供以下五部分：

1. **整體現況**（點明期間與核心數字）
2. **亮點表現**（最值得稱讚的成果）
3. **風險警示**（值得老闆關注的問題）
4. **提升銷售數量的具體建議**（如拓展客群、增加回購、提升轉單率）
5. **提升銷售金額的具體建議**（如提高單價、改善產品組合、減少過度折扣）
6. **降低退貨與客訴的具體建議**（品質控管、售後服務優化、客訴快速處理機制）

建議請具體可執行，不要泛泛而談。`

      const text = await callClaude(prompt, 1200)
      setAiText(text)
    } catch (e) {
      setAiError(e.message)
    }
    setAiLoading(false)
  }

  if (!summary) return (
    <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-base bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
      無資料，請先上傳銷售資料
    </div>
  )

  const avgPct = maxYearly > 0 ? avgMonthly / maxYearly * 100 : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">👔 老闆視角</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-base text-gray-400 dark:text-gray-500">一頁式關鍵指標決策總覽</p>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-700/50 text-sm font-medium text-blue-600 dark:text-blue-400">
              🗓️ {dateRangeLabel}
            </span>
          </div>
        </div>
        <button onClick={handleAI} disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-60">
          {aiLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🤖'}
          {aiLoading ? 'AI 撰寫中...' : 'AI 生成摘要＋建議'}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon="💰" label={`總${metricLabel}`} value={fmtM(summary.totalSales)} color="blue" />
        <KPICard icon="👥" label="客戶數" value={summary.customerCount?.toLocaleString()} color="purple" />
        <KPICard icon="📦" label="訂單數" value={summary.orderCount?.toLocaleString()} color="green" />
        <KPICard icon="📈" label="月增率" value={momStats ? fmtPct(momStats.chg) : '—'}
          color={momStats?.chg >= 0 ? 'green' : 'red'} sub={`上月 ${fmtM(momStats?.prev)}`} />
        <KPICard icon="📅" label="年增率" value={yoyStats ? fmtPct(yoyStats.chg) : '—'}
          color={yoyStats?.chg >= 0 ? 'green' : 'red'} sub={yoyStats?.yearMonth} />
        <KPICard icon="🏷️" label="產品數" value={summary.productCount?.toLocaleString()} color="amber" />
      </div>

      {/* AI narrative */}
      {(aiText || aiError) && (
        <Section title="🤖 AI 決策摘要 ＋ 行動建議">
          {aiError ? (
            <p className="text-red-500 text-base">{aiError}</p>
          ) : (
            <div className="prose prose-base max-w-none space-y-3">
              {aiText.split('\n').filter(l => l.trim()).map((line, i) => {
                const isBold = /^\*\*/.test(line.trim()) || /^\d+\./.test(line.trim())
                return (
                  <p key={i} className={`text-base leading-relaxed ${isBold ? 'font-bold text-gray-800 dark:text-gray-100 mt-4 mb-1' : 'text-gray-700 dark:text-gray-200'}`}>
                    {line.replace(/\*\*/g, '')}
                  </p>
                )
              })}
            </div>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Monthly Trend — full year with best/worst highlighting ── */}
        <Section title="📈 月份走勢">
          <div>
            {/* Year tabs */}
            {availableYears.length > 1 && (
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {availableYears.map(y => (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                      y === activeYear
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {y} 年
                  </button>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-3 mb-3 text-xs text-gray-400 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" /> 最高月</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400 inline-block" /> 最低月</span>
              <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-amber-400 inline-block" /> 月均</span>
            </div>

            {/* Month bars */}
            <div className="space-y-1.5">
              {yearlyTrend.map((d, i) => {
                const isBest  = d.yearMonth === bestYM?.yearMonth && (d[metric] || 0) > 0
                const isWorst = d.yearMonth === worstYM?.yearMonth && (d[metric] || 0) > 0
                const pct     = maxYearly > 0 ? (d[metric] || 0) / maxYearly * 100 : 0
                const isEmpty = !d[metric] || d[metric] === 0

                const barColor = isBest
                  ? 'bg-emerald-400'
                  : isWorst
                    ? 'bg-red-400'
                    : 'bg-indigo-400'

                const textColor = isBest
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : isWorst
                    ? 'text-red-500 dark:text-red-400 font-bold'
                    : 'text-gray-700 dark:text-gray-200'

                const monthLabel = MONTH_ZH[i]

                return (
                  <div key={d.yearMonth} className="flex items-center gap-2">
                    <span className={`text-sm w-8 flex-shrink-0 ${isBest || isWorst ? textColor : 'text-gray-500 dark:text-gray-400'}`}>
                      {monthLabel}
                    </span>
                    <div className="relative flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-visible">
                      {/* Average line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-amber-400 z-10"
                        style={{ left: `${avgPct}%` }}
                      />
                      {/* Value bar */}
                      {!isEmpty && (
                        <div
                          className={`h-full rounded-full transition-all ${barColor} ${isBest ? 'ring-2 ring-emerald-300' : isWorst ? 'ring-2 ring-red-300' : ''}`}
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                        />
                      )}
                    </div>
                    <span className={`text-sm font-mono w-16 text-right flex-shrink-0 ${isEmpty ? 'text-gray-300 dark:text-gray-600' : textColor}`}>
                      {isEmpty ? '—' : fmtM(d[metric])}
                    </span>
                    <span className="text-xs w-6 flex-shrink-0">
                      {isBest ? '🏆' : isWorst ? '⚠️' : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Average annotation */}
            {avgMonthly > 0 && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                月均 {fmtM(avgMonthly)}（虛線位置）
              </div>
            )}
          </div>
        </Section>

        {/* Top performers */}
        <Section title="🏆 各維度排名第一">
          <div className="space-y-3">
            {[
              { label: '最佳產品', value: topProduct?.name,   sub: fmtM(topProduct?.[metric]) },
              { label: '最佳客戶', value: topCustomer?.name,  sub: fmtM(topCustomer?.[metric]) },
              { label: '最佳品牌', value: topBrand?.name,     sub: fmtM(topBrand?.[metric]) },
              { label: '最佳月份', value: bestMonth?.yearMonth, sub: fmtM(bestMonth?.[metric]) },
            ].map(({ label, value, sub }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                <span className="text-base text-gray-500 dark:text-gray-400">{label}</span>
                <div className="text-right">
                  <span className="text-base font-bold text-gray-800 dark:text-gray-100">{value || '—'}</span>
                  {sub && <span className="ml-2 text-base text-emerald-600 font-mono font-semibold">{sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Channel concentration */}
        <Section title="🏪 通路集中度分析">
          {channelData?.length ? (
            <div className="space-y-3">
              {(() => {
                const total = channelData.reduce((s, d) => s + (d[metric] || 0), 0)
                return channelData.slice(0, 5).map((ch) => {
                  const pct = total > 0 ? (ch[metric] / total * 100) : 0
                  return (
                    <div key={ch.name}>
                      <div className="flex justify-between text-base mb-1">
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">{ch.name}</span>
                        <span className="font-mono text-gray-600 dark:text-gray-300">
                          {fmtM(ch[metric])} <span className="text-gray-400 dark:text-gray-500">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : <p className="text-gray-400 dark:text-gray-500 text-base">無通路資料</p>}
        </Section>

        {/* Risk signals */}
        <Section title="⚠️ 風險訊號">
          <div className="space-y-3">
            {(() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3  = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
              const pct   = total > 0 ? top3 / total * 100 : 0
              const level = pct > 70 ? 'high' : pct > 50 ? 'medium' : 'low'
              const colors = {
                high:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400',
                medium: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400',
                low:    'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
              }
              return (
                <div className={`rounded-xl border p-3 ${colors[level]}`}>
                  <p className="text-base font-bold">客戶集中度</p>
                  <p className="text-sm opacity-80">
                    前 3 大客戶佔總{metricLabel} {pct.toFixed(0)}%
                    {pct > 70 ? ' — 高度集中，單一客戶流失風險大' : pct > 50 ? ' — 中度集中，建議分散客源' : ' — 客源分散，健康'}
                  </p>
                </div>
              )
            })()}

            {momStats && momStats.chg < -10 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">月度下滑警告</p>
                <p className="text-sm opacity-80">最新月份較上月下降 {Math.abs(momStats.chg).toFixed(0)}%，需關注原因</p>
              </div>
            )}

            {yoyStats && yoyStats.chg < -15 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">年度同期下滑</p>
                <p className="text-sm opacity-80">{yoyStats.yearMonth} 年增率 {fmtPct(yoyStats.chg)}，低於去年同期</p>
              </div>
            )}

            {(!momStats || momStats.chg >= -10) && (!yoyStats || yoyStats.chg >= -15) && (() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3  = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
              return total > 0 && top3 / total <= 0.7
            })() && (
              <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400 p-3">
                <p className="text-base font-bold">✅ 整體運營健康</p>
                <p className="text-sm opacity-80">各項指標正常，無明顯風險訊號</p>
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-center">
        本摘要依篩選期間「{dateRangeLabel}」自動生成 · 業績公式：銷售數量 × 銷售金額 − 退貨 − 客訴
      </div>
    </div>
  )
}

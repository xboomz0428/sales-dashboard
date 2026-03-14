import { useMemo, useState } from 'react'
import { callClaude } from '../utils/ai'

const fmtM = v => {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

const fmtPct = v => (v >= 0 ? '+' : '') + Math.round(v) + '%'

function KPICard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-700/50 text-blue-700 dark:text-blue-400',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-700/50 text-amber-700 dark:text-amber-400',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-700/50 text-red-700 dark:text-red-400',
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
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const metricLabel = metric === 'subtotal' ? '銷售額' : '數量'

  // 計算篩選時間區間描述
  const dateRangeLabel = useMemo(() => {
    // 優先用明確的日期區間
    if (filters?.dateRange?.start && filters?.dateRange?.end) {
      return `${filters.dateRange.start} ～ ${filters.dateRange.end}`
    }
    // 再用年/月篩選
    if (filters?.years?.length || filters?.months?.length) {
      const y = filters.years?.length ? filters.years.join('、') + ' 年' : ''
      const m = filters.months?.length ? filters.months.map(m => parseInt(m) + '月').join('、') : ''
      return [y, m].filter(Boolean).join(' ')
    }
    // Fallback：從 trendData 推算
    if (trendData.length) {
      const first = trendData[0].yearMonth
      const last = trendData[trendData.length - 1].yearMonth
      return first === last ? first : `${first} ～ ${last}`
    }
    return '全部期間'
  }, [filters, trendData])

  // Compute YoY for latest complete month
  const yoyStats = useMemo(() => {
    if (!trendData.length) return null
    const latest = trendData[trendData.length - 1]
    const [ly, lm] = latest.yearMonth.split('-')
    const prevYM = `${parseInt(ly) - 1}-${lm}`
    const prev = trendData.find(d => d.yearMonth === prevYM)
    if (!prev) return null
    const chg = prev[metric] > 0 ? (latest[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { latest: latest[metric], prev: prev[metric], chg, yearMonth: latest.yearMonth }
  }, [trendData, metric])

  // MoM stats
  const momStats = useMemo(() => {
    if (trendData.length < 2) return null
    const cur = trendData[trendData.length - 1]
    const prev = trendData[trendData.length - 2]
    const chg = prev[metric] > 0 ? (cur[metric] - prev[metric]) / prev[metric] * 100 : 0
    return { cur: cur[metric], prev: prev[metric], chg }
  }, [trendData, metric])

  // Top performers
  const topProduct = productData?.[0]
  const topCustomer = customerData?.[0]
  const topBrand = brandData?.[0]

  // Best/worst month
  const bestMonth = useMemo(() => {
    if (!trendData.length) return null
    return trendData.reduce((best, d) => d[metric] > best[metric] ? d : best, trendData[0])
  }, [trendData, metric])

  const worstMonth = useMemo(() => {
    if (!trendData.length) return null
    return trendData.reduce((worst, d) => d[metric] < worst[metric] ? d : worst, trendData[0])
  }, [trendData, metric])

  // Channel concentration (top channel % of total)
  const channelConc = useMemo(() => {
    if (!channelData?.length) return null
    const total = channelData.reduce((s, d) => s + (d[metric] || 0), 0)
    const top = channelData[0]
    if (!total || !top) return null
    return { name: top.name, pct: (top[metric] / total * 100) }
  }, [channelData, metric])

  const handleAI = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const prompt = `你是一位專業的銷售數據分析師，請根據以下數據撰寫一份給老闆看的執行摘要，語言使用繁體中文，重點突出，分段清晰，每段 2-3 句，共 4-5 段。

【分析時間區間】
- 篩選期間：${dateRangeLabel}
- 涵蓋月份數：${trendData.length} 個月（${trendData[0]?.yearMonth || '—'} ～ ${trendData[trendData.length - 1]?.yearMonth || '—'}）
- 分析指標：${metricLabel}
請在摘要中明確點明此時間區間，使老闆能清楚知道這份報告的時間範圍。

【整體績效】
- 總${metricLabel}：${fmtM(summary?.totalSales)}
- 客戶數：${summary?.customerCount}，訂單數：${summary?.orderCount}
- 月增率（最新月 vs 上月）：${momStats ? fmtPct(momStats.chg) : '無資料'}
- 年增率（最新月 vs 去年同月）：${yoyStats ? fmtPct(yoyStats.chg) : '無資料'}（${yoyStats?.yearMonth || ''}）

【最佳表現】
- 最佳月份：${bestMonth?.yearMonth}（${fmtM(bestMonth?.[metric])}）
- 最低月份：${worstMonth?.yearMonth}（${fmtM(worstMonth?.[metric])}）
- 頂尖產品：${topProduct?.name || '未知'}（${fmtM(topProduct?.[metric])}）
- 頂尖客戶：${topCustomer?.name || '未知'}（${fmtM(topCustomer?.[metric])}）
- 頂尖品牌：${topBrand?.name || '未知'}（${fmtM(topBrand?.[metric])}）

【通路集中度】
- 主要通路「${channelConc?.name || '未知'}」佔比 ${channelConc ? channelConc.pct.toFixed(0) : '—'}%

請給出：1. 整體現況總結（點明時間區間），2. 亮點表現，3. 潛在風險，4. 行動建議。`
      const text = await callClaude(prompt, 800)
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">📊 執行摘要</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-base text-gray-400 dark:text-gray-500">一頁式老闆視角關鍵指標總覽</p>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-700/50 text-sm font-medium text-blue-600 dark:text-blue-400">
              🗓️ {dateRangeLabel}
            </span>
          </div>
        </div>
        <button onClick={handleAI} disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-60">
          {aiLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🤖'}
          {aiLoading ? 'AI 撰寫中...' : 'AI 生成摘要'}
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
        <Section title="🤖 AI 執行摘要">
          {aiError ? (
            <p className="text-red-500 text-base">{aiError}</p>
          ) : (
            <div className="prose prose-base max-w-none">
              {aiText.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i} className="text-base text-gray-700 dark:text-gray-200 leading-relaxed mb-3 last:mb-0">{line}</p>
              ))}
            </div>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top performers */}
        <Section title="🏆 各維度排名第一">
          <div className="space-y-3">
            {[
              { label: '最佳產品', value: topProduct?.name, sub: fmtM(topProduct?.[metric]) },
              { label: '最佳客戶', value: topCustomer?.name, sub: fmtM(topCustomer?.[metric]) },
              { label: '最佳品牌', value: topBrand?.name, sub: fmtM(topBrand?.[metric]) },
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
                return channelData.slice(0, 5).map((ch, i) => {
                  const pct = total > 0 ? (ch[metric] / total * 100) : 0
                  return (
                    <div key={ch.name}>
                      <div className="flex justify-between text-base mb-1">
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">{ch.name}</span>
                        <span className="font-mono text-gray-600 dark:text-gray-300">{fmtM(ch[metric])} <span className="text-gray-400 dark:text-gray-500">({pct.toFixed(0)}%)</span></span>
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

        {/* Recent trend snapshot */}
        <Section title="📈 近期月份走勢（最新 6 個月）">
          {trendData.length ? (
            <div className="space-y-2">
              {trendData.slice(-6).reverse().map((d, i) => {
                const prev = trendData[trendData.length - 7 + (5 - i) - 1]
                const chg = prev?.[metric] > 0 ? (d[metric] - prev[metric]) / prev[metric] * 100 : null
                const max = Math.max(...trendData.slice(-6).map(x => x[metric] || 0))
                const pct = max > 0 ? (d[metric] / max * 100) : 0
                return (
                  <div key={d.yearMonth} className="flex items-center gap-3">
                    <span className="text-base text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{d.yearMonth}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                      <div className="h-2 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-base font-mono font-semibold text-gray-700 dark:text-gray-200 w-16 text-right">{fmtM(d[metric])}</span>
                    {chg != null && (
                      <span className={`text-sm font-semibold w-14 text-right ${chg >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {fmtPct(chg)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : <p className="text-gray-400 dark:text-gray-500 text-base">無趨勢資料</p>}
        </Section>

        {/* Risk signals */}
        <Section title="⚠️ 風險訊號">
          <div className="space-y-3">
            {/* Customer concentration */}
            {(() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3 = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
              const pct = total > 0 ? top3 / total * 100 : 0
              const level = pct > 70 ? 'high' : pct > 50 ? 'medium' : 'low'
              const colors = { high: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400', medium: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400', low: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400' }
              return (
                <div className={`rounded-xl border p-3 ${colors[level]}`}>
                  <p className="text-base font-bold">客戶集中度</p>
                  <p className="text-sm opacity-80">前 3 大客戶佔總{metricLabel} {pct.toFixed(0)}%
                    {pct > 70 ? ' — 高度集中，單一客戶流失風險大' : pct > 50 ? ' — 中度集中，建議分散客源' : ' — 客源分散，健康'}
                  </p>
                </div>
              )
            })()}

            {/* MoM trend */}
            {momStats && momStats.chg < -10 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">月度下滑警告</p>
                <p className="text-sm opacity-80">最新月份較上月下降 {Math.abs(momStats.chg).toFixed(0)}%，需關注原因</p>
              </div>
            )}

            {/* YoY trend */}
            {yoyStats && yoyStats.chg < -15 && (
              <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400 p-3">
                <p className="text-base font-bold">年度同期下滑</p>
                <p className="text-sm opacity-80">{yoyStats.yearMonth} 年增率 {fmtPct(yoyStats.chg)}，低於去年同期</p>
              </div>
            )}

            {/* All green */}
            {(!momStats || momStats.chg >= -10) && (!yoyStats || yoyStats.chg >= -15) && (() => {
              if (!customerData?.length) return null
              const total = customerData.reduce((s, d) => s + (d[metric] || 0), 0)
              const top3 = customerData.slice(0, 3).reduce((s, d) => s + (d[metric] || 0), 0)
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
        本摘要依篩選期間「{dateRangeLabel}」自動生成 · 如需詳細分析請使用各專項分析頁籤
      </div>
    </div>
  )
}

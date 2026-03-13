import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { getStoredApiKey, setStoredApiKey } from './utils/ai'
import { processExcelFile } from './utils/dataProcessor'
import { useSalesData } from './hooks/useSalesData'
import { getDateRange, hasDateOverlap } from './utils/dateUtils'
import FileUpload from './components/FileUpload'
import FilterPanel from './components/FilterPanel'
import SummaryCards from './components/SummaryCards'
import TrendChart from './components/charts/TrendChart'
import ChannelBarChart from './components/charts/ChannelBarChart'
import BrandChart from './components/charts/BrandChart'
import HeatmapChart from './components/charts/HeatmapChart'
import ProductChart from './components/charts/ProductChart'
import CustomerChart from './components/charts/CustomerChart'
import PerformanceMatrix from './components/charts/PerformanceMatrix'
import ComparisonChart from './components/charts/ComparisonChart'
import DataTable from './components/DataTable'
import AIAnalysis from './components/AIAnalysis'
import GlobalSearch from './components/GlobalSearch'
import GoalDashboard from './components/GoalDashboard'
import AnomalyPanel, { AnomalyBadge } from './components/AnomalyPanel'
import CustomerHealthPanel from './components/CustomerHealthPanel'
import SalesForecast from './components/SalesForecast'
import ExecutiveSummary from './components/ExecutiveSummary'
import ProductCostManager from './components/ProductCostManager'

const TABS = [
  { id: 'summary',     label: '執行摘要', icon: '📊' },
  { id: 'performance', label: '績效矩陣', icon: '🎯' },
  { id: 'comparison',  label: '對比分析', icon: '⚖️' },
  { id: 'trend',       label: '趨勢分析', icon: '📈' },
  { id: 'product',     label: '產品分析', icon: '🏷️' },
  { id: 'customer',    label: '客戶分析', icon: '👥' },
  { id: 'channel',     label: '通路分析', icon: '🏪' },
  { id: 'brand',       label: '品牌分析', icon: '✨' },
  { id: 'heatmap',     label: '熱力圖',   icon: '🗓️' },
  { id: 'table',       label: '資料表格', icon: '📋' },
  { id: 'costs',       label: '商品成本', icon: '💲' },
  { id: 'goals',       label: '目標管理', icon: '🏆' },
  { id: 'alerts',      label: '預警中心', icon: '🔔' },
  { id: 'health',      label: '客戶健康', icon: '💊' },
  { id: 'forecast',    label: '預測分析', icon: '🔮' },
]

const DEFAULT_FILTERS = {
  years: [], months: [], channels: [], channelTypes: [],
  brands: [], customers: [], products: [], dateRange: null,
  metric: 'subtotal',
}

function buildMeta(rows) {
  const unique = arr => [...new Set(arr.filter(Boolean))].sort()
  return {
    years: unique(rows.map(r => r.year)),
    channels: unique(rows.map(r => r.channel)),
    channelTypes: unique(rows.map(r => r.channelType)),
    brands: unique(rows.map(r => r.brand)),
    agentTypes: unique(rows.map(r => r.agentType)),
    customers: unique(rows.map(r => r.customer)),
    products: unique(rows.map(r => r.product)),
    totalRows: rows.length,
  }
}

export default function App() {
  const [allRows, setAllRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [uploadHistory, setUploadHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState('performance')
  const [panelOpen, setPanelOpen] = useState(true)
  const [productCosts, setProductCosts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('product_costs')) || {} } catch { return {} }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyHasValue, setKeyHasValue] = useState(() => !!getStoredApiKey())
  const chartAreaRef = useRef(null)
  const fileInputRef = useRef(null)

  // Open search on "/" key (when not typing in an input)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleFileLoaded = useCallback(async (file) => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const fileId = `${file.name}__${file.size}__${file.lastModified}`
      if (uploadHistory.some(f => f.id === fileId)) {
        setError(`「${file.name}」已上傳過，跳過重複`)
        setLoading(false)
        return
      }

      const data = await processExcelFile(file)
      if (!data.rows.length) {
        setError(`「${file.name}」沒有可解析的資料`)
        setLoading(false)
        return
      }

      const existingRange = getDateRange(allRows)
      const newRange = getDateRange(data.rows)
      let finalNewRows
      let duplicateCount = 0

      if (!existingRange || !hasDateOverlap(existingRange, newRange)) {
        // No date overlap → import all directly
        finalNewRows = data.rows
      } else {
        // Date overlap → only dedup rows within overlapping date range
        const overlapMin = Math.max(existingRange.min, newRange.min) <= existingRange.max ? newRange.min : existingRange.min
        const overlapMax = existingRange.max

        const existingKeysInOverlap = new Set(
          allRows.filter(r => r.date >= newRange.min && r.date <= newRange.max).map(r => r._key)
        )
        const overlapRows = data.rows.filter(r => r.date >= existingRange.min && r.date <= existingRange.max)
        const nonOverlapRows = data.rows.filter(r => r.date < existingRange.min || r.date > existingRange.max)
        const dedupedOverlap = overlapRows.filter(r => !existingKeysInOverlap.has(r._key))
        duplicateCount = overlapRows.length - dedupedOverlap.length
        finalNewRows = [...nonOverlapRows, ...dedupedOverlap]
      }

      if (finalNewRows.length === 0) {
        setError(`「${file.name}」的資料與現有完全重複，無新增`)
        setLoading(false)
        return
      }

      const merged = [...allRows, ...finalNewRows]
      setAllRows(merged)
      setMeta(buildMeta(merged))
      setUploadHistory(prev => [...prev, {
        id: fileId, name: file.name,
        addedCount: finalNewRows.length, duplicateCount,
        time: new Date().toLocaleTimeString('zh-TW'),
        dateRange: newRange,
      }])

      const msg = duplicateCount > 0
        ? `「${file.name}」新增 ${finalNewRows.length.toLocaleString()} 筆，略過重複 ${duplicateCount.toLocaleString()} 筆`
        : `「${file.name}」成功匯入 ${finalNewRows.length.toLocaleString()} 筆`
      setNotice(msg)
      setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setError(err.message || '解析失敗，請確認檔案格式')
    } finally {
      setLoading(false)
    }
  }, [allRows, uploadHistory])

  const handleReset = useCallback(() => {
    setAllRows([]); setMeta(null); setUploadHistory([])
    setError(null); setNotice(null)
    setFilters(DEFAULT_FILTERS); setActiveTab('performance')
  }, [])

  const updateProductCost = useCallback((product, cost) => {
    setProductCosts(prev => {
      const next = { ...prev }
      if (cost == null) delete next[product]
      else next[product] = cost
      localStorage.setItem('product_costs', JSON.stringify(next))
      return next
    })
  }, [])

  const updateManyProductCosts = useCallback((updates) => {
    setProductCosts(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem('product_costs', JSON.stringify(next))
      return next
    })
  }, [])

  const salesData = useSalesData(allRows, filters)
  const {
    summary, filtered,
    trendData, trendDataYoY, trendDataMoM, trendByChannel, trendByBrand, trendByProduct,
    channelData, channelTypeData, channelCustomerData,
    brandData, heatmapData,
    productData, productByChannel, productCustomerData,
    customerData, customerByChannelTop, performanceData,
    comparisonData,
  } = salesData

  const pdfSalesData = useMemo(() => ({
    summary, trendData, comparisonData,
    productData, customerData, brandData, channelData, channelTypeData,
    performanceData, heatmapData,
    trendByChannel, trendByBrand,
  }), [summary, trendData, comparisonData, productData, customerData, brandData, channelData, channelTypeData, performanceData, heatmapData, trendByChannel, trendByBrand])

  const handleExportPDF = useCallback(async () => {
    setPdfLoading(true)
    try {
      const { exportDashboardPDF } = await import('./utils/pdfExport')
      const filename = await exportDashboardPDF({ salesData: pdfSalesData, onProgress: setPdfProgress })
      setNotice(`✓ PDF 匯出完成：${filename}`)
      setTimeout(() => setNotice(null), 5000)
    } catch (e) {
      setError('PDF 匯出失敗：' + e.message)
    } finally {
      setPdfLoading(false)
      setPdfProgress('')
    }
  }, [pdfSalesData])

  // Full report PDF: AI content + all dashboard data
  const handleAIExportFullPDF = useCallback(async (aiContent, analysisType) => {
    setAiOpen(false)
    setPdfLoading(true)
    try {
      const { exportFullReportPDF } = await import('./utils/pdfExport')
      setPdfProgress('建立完整報告 PDF...')
      const filename = await exportFullReportPDF({
        salesData: pdfSalesData, aiContent, analysisType, onProgress: setPdfProgress,
      })
      setNotice(`✓ 完整報告 PDF 匯出完成：${filename}`)
      setTimeout(() => setNotice(null), 5000)
    } catch (e) {
      setError('PDF 匯出失敗：' + e.message)
    } finally {
      setPdfLoading(false)
      setPdfProgress('')
      setAiOpen(true)
    }
  }, [pdfSalesData])

  if (!meta && !loading) {
    return (
      <div>
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg shadow text-sm">
            ⚠️ {error}
          </div>
        )}
        <FileUpload onFileLoaded={handleFileLoaded} onError={setError} loading={loading} />
      </div>
    )
  }

  if (loading && allRows.length === 0) {
    return <FileUpload onFileLoaded={handleFileLoaded} onError={setError} loading={true} />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <FilterPanel meta={meta} filters={filters} onChange={setFilters} allRows={allRows} open={panelOpen} onToggle={() => setPanelOpen(v => !v)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">S</div>
            <div>
              <h1 className="text-sm font-bold text-gray-800">銷售數據分析系統</h1>
              <p className="text-sm text-gray-400">
                {uploadHistory.length} 個檔案 · {meta?.totalRows?.toLocaleString()} 筆 · 顯示 {filtered.length.toLocaleString()} 筆
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}

            {/* Upload history button */}
            <button onClick={() => setShowHistory(v => !v)}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1">
              📁 <span>記錄</span>
              <span className="bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 text-xs font-medium">{uploadHistory.length}</span>
            </button>

            {/* Add file button */}
            <button onClick={() => fileInputRef.current?.click()}
              className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm">
              ＋ 新增檔案
            </button>
            <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.csv" className="hidden"
              onChange={e => { if (e.target.files[0]) handleFileLoaded(e.target.files[0]); e.target.value = '' }} />

            {/* Global search */}
            {meta && (
              <button onClick={() => setSearchOpen(true)}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                🔍 <span className="hidden sm:inline">搜尋</span>
                <kbd className="hidden md:inline text-sm bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-mono">/</kbd>
              </button>
            )}

            {/* API Key */}
            <button onClick={() => { setKeyInput(getStoredApiKey()); setKeyModalOpen(true) }}
              title={keyHasValue ? 'API Key 已設定' : '尚未設定 API Key'}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${keyHasValue ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100'}`}>
              🔑 <span className="hidden sm:inline">{keyHasValue ? 'Key 已設定' : '設定 Key'}</span>
            </button>

            {/* AI Analysis */}
            <button onClick={() => setAiOpen(true)}
              className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 transition-colors flex items-center gap-1 shadow-sm">
              🤖 AI 分析
            </button>

            {/* PDF export */}
            <button onClick={handleExportPDF} disabled={pdfLoading}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1 disabled:opacity-60">
              {pdfLoading ? '⏳' : '📄'} <span>{pdfLoading ? pdfProgress || 'PDF...' : 'PDF 匯出'}</span>
            </button>

            <button onClick={handleReset}
              className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
              重置
            </button>
          </div>
        </header>

        {/* Notifications */}
        {(notice || error) && (
          <div className={`mx-4 mt-2 px-4 py-2 rounded-lg text-sm flex items-center justify-between flex-shrink-0 ${notice ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{notice ? `✓ ${notice}` : `⚠️ ${error}`}</span>
            <button onClick={() => { setNotice(null); setError(null) }} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Upload history panel */}
        {showHistory && (
          <div className="mx-4 mt-2 bg-white border border-gray-100 rounded-xl p-3 flex-shrink-0 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-600">上傳記錄</span>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 pr-3">檔案</th>
                  <th className="text-center py-1 pr-3">日期範圍</th>
                  <th className="text-right py-1 pr-3">新增</th>
                  <th className="text-right py-1 pr-3">略過</th>
                  <th className="text-right py-1">時間</th>
                </tr>
              </thead>
              <tbody>
                {uploadHistory.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-3 text-gray-700 font-medium max-w-[200px] truncate">{f.name}</td>
                    <td className="py-1 pr-3 text-center text-gray-400 text-xs">
                      {f.dateRange ? `${f.dateRange.min} ~ ${f.dateRange.max}` : '—'}
                    </td>
                    <td className="py-1 pr-3 text-right text-emerald-600 font-mono">+{f.addedCount.toLocaleString()}</td>
                    <td className="py-1 pr-3 text-right text-gray-400 font-mono">{f.duplicateCount.toLocaleString()}</td>
                    <td className="py-1 text-right text-gray-400">{f.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* KPI Cards toggle bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            onClick={() => setDashboardOpen(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors"
          >
            <span className={`transition-transform duration-200 text-xs ${dashboardOpen ? 'rotate-90' : ''}`}>▶</span>
            {dashboardOpen ? '收折儀表板' : '展開儀表板'}
          </button>
          {!dashboardOpen && (
            <span className="text-sm text-gray-400 ml-1">（KPI 數據已收折）</span>
          )}
        </div>
        {/* KPI Cards */}
        {dashboardOpen && (
          <SummaryCards summary={summary} metric={filters.metric} trendData={trendData} productData={productData} customerData={customerData} customerByChannelTop={customerByChannelTop} costs={productCosts} />
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-white px-3 flex-shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <span className="text-base">{tab.icon}</span>{tab.label}
              {tab.id === 'alerts' && <AnomalyBadge allRows={allRows} metric={filters.metric} />}
            </button>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-y-auto p-4" ref={chartAreaRef}>
          {activeTab === 'summary' && (
            <div data-pdf-section data-pdf-title="執行摘要">
              <ExecutiveSummary
                summary={summary} trendData={trendData} metric={filters.metric}
                productData={productData} customerData={customerData}
                brandData={brandData} channelData={channelData} allRows={allRows}
              />
            </div>
          )}
          {activeTab === 'comparison' && (
            <div data-pdf-section data-pdf-title="對比分析">
              <ComparisonChart comparisonData={comparisonData} trendData={trendData} filtered={filtered} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'trend' && (
            <div data-pdf-section data-pdf-title="趨勢分析">
              <TrendChart trendData={trendData} trendDataYoY={trendDataYoY} trendDataMoM={trendDataMoM} trendByChannel={trendByChannel} trendByBrand={trendByBrand} trendByProduct={trendByProduct} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'channel' && (
            <div data-pdf-section data-pdf-title="通路分析">
              <ChannelBarChart channelData={channelData} channelTypeData={channelTypeData} channelCustomerData={channelCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'brand' && (
            <div data-pdf-section data-pdf-title="品牌分析">
              <BrandChart brandData={brandData} trendByBrand={trendByBrand} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'product' && (
            <div data-pdf-section data-pdf-title="產品分析">
              <ProductChart productData={productData} productByChannel={productByChannel} productCustomerData={productCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'customer' && (
            <div data-pdf-section data-pdf-title="客戶分析">
              <CustomerChart customerData={customerData} channelCustomerData={channelCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'performance' && (
            <div data-pdf-section data-pdf-title="績效矩陣">
              <PerformanceMatrix performanceData={performanceData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'heatmap' && (
            <div data-pdf-section data-pdf-title="熱力圖">
              <HeatmapChart heatmapData={heatmapData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'table' && (
            <DataTable rows={filtered} />
          )}
          {activeTab === 'costs' && (
            <ProductCostManager
              products={meta?.products || []}
              costs={productCosts}
              onUpdateCost={updateProductCost}
              onUpdateMany={updateManyProductCosts}
            />
          )}
          {activeTab === 'goals' && (
            <div data-pdf-section data-pdf-title="目標管理">
              <GoalDashboard
                trendData={trendData}
                comparisonData={comparisonData}
                summary={summary}
                brandData={brandData}
                channelData={channelData}
                metric={filters.metric}
              />
            </div>
          )}
          {activeTab === 'alerts' && (
            <div data-pdf-section data-pdf-title="預警中心">
              <AnomalyPanel allRows={allRows} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'health' && (
            <div data-pdf-section data-pdf-title="客戶健康">
              <CustomerHealthPanel allRows={allRows} />
            </div>
          )}
          {activeTab === 'forecast' && (
            <div data-pdf-section data-pdf-title="預測分析">
              <SalesForecast trendData={trendData} metric={filters.metric} />
            </div>
          )}
        </div>
      </div>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => { setActiveTab(tab); setSearchOpen(false) }}
        productData={productData}
        customerData={customerData}
        brandData={brandData}
      />

      {/* API Key Modal */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setKeyModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-1">🔑 設定 Google AI Studio API Key</h3>
            <p className="text-sm text-gray-400 mb-4">
              用於 AI 分析、目標建議、執行摘要等功能。Key 只存在你的瀏覽器，不會上傳。<br />
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">→ 前往 Google AI Studio 取得 Key</a>
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="AIza..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-base font-mono focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {keyHasValue && (
                <button onClick={() => { setStoredApiKey(''); setKeyHasValue(false); setKeyModalOpen(false) }}
                  className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm hover:bg-red-50 transition-colors">
                  清除 Key
                </button>
              )}
              <button onClick={() => setKeyModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={() => {
                const k = keyInput.trim()
                setStoredApiKey(k)
                setKeyHasValue(!!k)
                setKeyModalOpen(false)
              }}
                disabled={!keyInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      <AIAnalysis
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onExportFullPDF={handleAIExportFullPDF}
        salesData={{
          summary, filters,
          productData, brandData, channelData, channelTypeData,
          channelCustomerData, customerData, trendData, performanceData,
        }}
      />
    </div>
  )
}

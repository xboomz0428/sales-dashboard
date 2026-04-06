import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { getStoredApiKey, setStoredApiKey } from './utils/ai'
import { processExcelFile } from './utils/dataProcessor'
import { useSalesData } from './hooks/useSalesData'
import { useDarkMode } from './hooks/useDarkMode'
import { getDateRange } from './utils/dateUtils'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useCloudData } from './hooks/useCloudData'
import LoginPage from './components/auth/LoginPage'
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
import MonthlyExpenseManager from './components/MonthlyExpenseManager'
import InvoiceReconciliation from './components/InvoiceReconciliation'
import DashboardReminders from './components/DashboardReminders'
import LineNotifyPanel from './components/LineNotifyPanel'
import FlowDiagram from './components/charts/FlowDiagram'
import UserManagement from './components/auth/UserManagement'
import DataBackupPanel from './components/DataBackupPanel'
import DatabaseStatusPanel from './components/DatabaseStatusPanel'

const TABS = [
  { id: 'summary',     label: '老闆視角', icon: '👔' },
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
  { id: 'expenses',    label: '月費用',   icon: '💰' },
  { id: 'invoice',     label: '發票對帳', icon: '🧾' },
  { id: 'goals',       label: '目標管理', icon: '🏆' },
  { id: 'alerts',      label: '預警中心', icon: '🔔' },
  { id: 'health',      label: '客戶健康', icon: '💊' },
  { id: 'forecast',    label: '預測分析', icon: '🔮' },
  { id: 'flow',        label: '流程架構', icon: '🗺️' },
  { id: 'line-notify', label: 'LINE 通知', icon: '💬' },
  { id: 'backup',      label: '資料備份',   icon: '💾' },
  { id: 'users',       label: '使用者管理', icon: '👤' },
  { id: 'database',    label: '資料庫狀態', icon: '🗄️' },
]

const TAB_GROUPS = [
  { id: 'analysis', label: '分析', icon: '📊', tabs: ['summary','performance','comparison','trend','product','customer','channel','brand','heatmap','table'] },
  { id: 'manage',   label: '管理', icon: '⚙️',  tabs: ['costs','expenses','invoice','goals','alerts','health','forecast'] },
  { id: 'tools',    label: '工具', icon: '🔧', tabs: ['flow','line-notify','backup','users','database'] },
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

function AppDashboard() {
  const { user, role, logout, perms, allowedTabs, dataYearsLimit, roleInfo, isLoggedIn } = useAuth()
  const [dark, setDark] = useDarkMode()
  const [allRows, setAllRows] = useState([])
  const allRowsRef = useRef([])   // 給 handleCloudDataLoaded 讀取，避免 stale closure
  useEffect(() => { allRowsRef.current = allRows }, [allRows])

  // 依角色資料年限過濾（NULL = 不限制；正整數 = 從今天往前 N 年）
  const visibleRows = useMemo(() => {
    if (!dataYearsLimit) return allRows
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - dataYearsLimit)
    const cutoffStr = cutoff.toISOString().slice(0, 10)  // 'YYYY-MM-DD'
    return allRows.filter(r => r.date >= cutoffStr)
  }, [allRows, dataYearsLimit])

  const [meta, setMeta] = useState(null)
  // 依年限過濾後的 meta，供篩選器顯示可選年份
  const visibleMeta = useMemo(
    () => visibleRows.length ? buildMeta(visibleRows) : meta ? buildMeta([]) : null,
    [visibleRows, meta]
  )
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
  const [monthlyExpenses, setMonthlyExpenses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('monthly_expenses')) || {} } catch { return {} }
  })
  const [invoiceRecords, setInvoiceRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('invoice_records')) || {} } catch { return {} }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── 雲端資料同步 ──────────────────────────────────────────────────────────
  // 雲端資料載入完成 callback
  // 注意：不可在 setAllRows updater 內呼叫其他 setState（React 反模式）
  // 改用 allRowsRef 讀取當前值，並在 updater 外直接設定 meta / uploadHistory
  const handleCloudDataLoaded = useCallback((rows, fileNames) => {
    const prev = allRowsRef.current

    let finalRows
    if (!prev.length) {
      finalRows = rows
      setUploadHistory(fileNames.map(name => ({
        id: name, name, addedCount: 0, duplicateCount: 0,
        time: '雲端載入', dateRange: null,
      })))
    } else {
      const existingKeys = new Set(prev.map(r => r._key))
      const newRows = rows.filter(r => !existingKeys.has(r._key))
      if (!newRows.length) return   // 完全重複，不更新
      finalRows = [...prev, ...newRows]
    }

    // React 18 會自動批次這三個 setState，只觸發一次 re-render
    setAllRows(finalRows)
    setMeta(buildMeta(finalRows))
  }, [])

  const handleCloudCostsLoaded = useCallback((costs) => {
    setProductCosts(costs)
  }, [])

  const { syncing, syncStatus, uploadErrors, cloudFiles, uploadSalesFile, deleteCloudFile, saveCosts, loadSpecificFiles } =
    useCloudData(isLoggedIn ? user : null, handleCloudDataLoaded, handleCloudCostsLoaded)
  const [pdfProgress, setPdfProgress] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyHasValue, setKeyHasValue] = useState(() => !!getStoredApiKey())
  const chartAreaRef = useRef(null)
  const fileInputRef = useRef(null)
  const tabBarRef = useRef(null)

  const saveMonthlyExpenses = useCallback((month, items) => {
    setMonthlyExpenses(prev => {
      const next = { ...prev, [month]: items }
      localStorage.setItem('monthly_expenses', JSON.stringify(next))
      return next
    })
  }, [])

  const saveInvoiceRecords = useCallback((month, items) => {
    setInvoiceRecords(prev => {
      const next = { ...prev, [month]: items }
      localStorage.setItem('invoice_records', JSON.stringify(next))
      return next
    })
  }, [])

  // ── 角色控制可見 Tab ──────────────────────────────────────────────────────
  const visibleTabs = allowedTabs ? TABS.filter(t => allowedTabs.includes(t.id)) : TABS

  // ── Tab 分組導覽 ──────────────────────────────────────────────────────────
  const activeGroup = useMemo(() => {
    for (const g of TAB_GROUPS) {
      if (g.tabs.includes(activeTab)) return g.id
    }
    return TAB_GROUPS[0].id
  }, [activeTab])

  const handleGroupChange = useCallback((groupId) => {
    const group = TAB_GROUPS.find(g => g.id === groupId)
    if (!group) return
    // 切換到該群組時，選第一個此角色可見的 tab
    const visibleIds = new Set(visibleTabs.map(t => t.id))
    const first = group.tabs.find(id => visibleIds.has(id))
    if (first) handleTabChange(first)
  }, [visibleTabs, handleTabChange])

  const groupTabs = useMemo(() => {
    const group = TAB_GROUPS.find(g => g.id === activeGroup)
    if (!group) return visibleTabs
    const groupIds = new Set(group.tabs)
    return visibleTabs.filter(t => groupIds.has(t.id))
  }, [activeGroup, visibleTabs])

  // Scroll active tab into view on mobile
  useEffect(() => {
    if (!tabBarRef.current) return
    const activeEl = tabBarRef.current.querySelector('[data-tab-active="true"]')
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeTab])

  // Open search on "/" key
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

  // Close mobile panel on tab change
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId)
    if (window.innerWidth < 768) setPanelOpen(false)
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

      const newRange = getDateRange(data.rows)
      let finalNewRows
      let duplicateCount = 0

      // Full key-based dedup: remove any new rows whose _key already exists in allRows.
      // This is simpler and more reliable than date-range overlap detection,
      // and correctly handles overlapping date ranges between files regardless of upload order.
      if (allRows.length === 0) {
        finalNewRows = data.rows
      } else {
        const existingKeys = new Set(allRows.map(r => r._key))
        const nonDuplicateRows = data.rows.filter(r => !existingKeys.has(r._key))
        duplicateCount = data.rows.length - nonDuplicateRows.length
        finalNewRows = nonDuplicateRows
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

      // 同步至雲端（非同步，不阻塞 UI）
      uploadSalesFile(file, finalNewRows)
    } catch (err) {
      setError(err.message || '解析失敗，請確認檔案格式')
    } finally {
      setLoading(false)
    }
  }, [allRows, uploadHistory, uploadSalesFile])

  const handleDeleteFile = useCallback(async (fileEntry) => {
    if (!window.confirm(`確定要從雲端永久刪除「${fileEntry.name}」？此操作無法復原。`)) return
    try {
      await deleteCloudFile(fileEntry.name)
      setUploadHistory(prev => prev.filter(f => f.id !== fileEntry.id))
      setNotice(`「${fileEntry.name}」已從雲端刪除，請重新整理頁面以更新資料`)
      setTimeout(() => setNotice(null), 8000)
    } catch (e) {
      setError(`刪除失敗：${e?.message || '未知錯誤'}`)
    }
  }, [deleteCloudFile])

  const handleReset = useCallback(() => {
    setAllRows([]); setMeta(null); setUploadHistory([])
    setError(null); setNotice(null)
    setFilters(DEFAULT_FILTERS); setActiveTab('performance')
  }, [])

  const handleRestoreBackup = useCallback(async (backup) => {
    // 重置目前資料
    setAllRows([]); setMeta(null); setUploadHistory([])
    setError(null); setNotice(null); setFilters(DEFAULT_FILTERS)

    // 還原成本設定
    const costs = backup.costs || {}
    setProductCosts(costs)
    saveCosts(costs)

    // 重新下載並解析備份時的檔案
    const filePaths = backup.file_paths || []
    if (filePaths.length) {
      const { rows, fileNames } = await loadSpecificFiles(filePaths)
      if (rows.length) {
        setAllRows(rows)
        setMeta(buildMeta(rows))
        setUploadHistory(fileNames.map(name => ({
          id: name, name, addedCount: 0, duplicateCount: 0,
          time: `備份還原：${backup.name}`, dateRange: null,
        })))
        setActiveTab('summary')
      }
    }
  }, [saveCosts, loadSpecificFiles])

  const updateProductCost = useCallback((product, cost) => {
    setProductCosts(prev => {
      const next = { ...prev }
      if (cost == null) delete next[product]
      else next[product] = cost
      saveCosts(next)
      return next
    })
  }, [saveCosts])

  const updateManyProductCosts = useCallback((updates) => {
    setProductCosts(prev => {
      const next = { ...prev, ...updates }
      saveCosts(next)
      return next
    })
  }, [saveCosts])

  const salesData = useSalesData(visibleRows, filters)
  const {
    summary, filtered,
    trendData, trendDataYoY, trendDataMoM, trendByChannel, trendByBrand, trendByProduct,
    channelData, channelTypeData, channelCustomerData,
    brandData, brandChannelData, heatmapData,
    productData, productByChannel, productCustomerData,
    customerData, customerByChannelTop, performanceData,
    comparisonData,
    flowData, structureData,
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

  // 資料尚未載入且非特殊 tab 時的空狀態 flag
  const noDataTabs = ['users', 'backup', 'database', 'expenses', 'invoice', 'line-notify']
  const showEmptyState = !meta && !noDataTabs.includes(activeTab)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Mobile backdrop overlay — 只在有資料且側欄打開時顯示 */}
      {panelOpen && meta && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/60 backdrop-blur-sm"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Filter sidebar — 只在有資料時顯示 */}
      {meta && (
        <div className={`
          fixed inset-y-0 left-0 z-30 h-full
          md:relative md:inset-auto md:z-auto md:h-auto md:flex md:flex-shrink-0
          transition-transform duration-300 ease-in-out
          ${panelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <FilterPanel
            meta={visibleMeta} filters={filters} onChange={setFilters}
            allRows={visibleRows} open={panelOpen} onToggle={() => setPanelOpen(v => !v)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 sm:px-4 py-2 flex items-center justify-between flex-shrink-0 shadow-sm gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setPanelOpen(v => !v)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              title="篩選條件"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4h12M4 8h8M6 12h4" />
              </svg>
            </button>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0">S</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">銷售數據分析系統</h1>
                {roleInfo && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full sm:hidden ${roleInfo.badge}`}>{roleInfo.label}</span>}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block leading-tight">
                {uploadHistory.length} 個檔案 · {meta?.totalRows?.toLocaleString()} 筆 · 顯示 {filtered.length.toLocaleString()} 筆
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}

            {/* Upload history — hidden on mobile (except admin) */}
            <button onClick={() => setShowHistory(v => !v)}
              className={`${role === 'admin' ? 'flex' : 'hidden sm:flex'} text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors items-center gap-1`}>
              📁 <span className="hidden md:inline">記錄</span>
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5 text-xs font-medium">{uploadHistory.length}</span>
            </button>

            {/* Add file — 僅限有上傳權限的角色 */}
            {perms.uploadData && (
              <>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-sm px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm">
                  <span className="text-base leading-none">＋</span>
                  <span className="hidden sm:inline">新增檔案</span>
                </button>
                <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.csv" className="hidden"
                  onChange={e => { if (e.target.files[0]) handleFileLoaded(e.target.files[0]); e.target.value = '' }} />
              </>
            )}

            {/* Global search — hidden on mobile */}
            {meta && (
              <button onClick={() => setSearchOpen(true)}
                className="hidden sm:flex text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors items-center gap-1.5">
                🔍
                <kbd className="hidden md:inline text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 font-mono text-gray-400">/</kbd>
              </button>
            )}

            {/* API Key — 僅限非檢視者；hidden on mobile */}
            {role !== 'viewer' && (
              <button onClick={() => { setKeyInput(getStoredApiKey()); setKeyModalOpen(true) }}
                title={keyHasValue ? 'API Key 已設定' : '尚未設定 API Key'}
                className={`hidden sm:flex text-sm px-2.5 py-1.5 rounded-lg border transition-colors items-center gap-1 ${keyHasValue ? 'border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' : 'border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}>
                🔑 <span className="hidden md:inline">{keyHasValue ? 'Key 已設定' : '設定 Key'}</span>
              </button>
            )}

            {/* AI Analysis — 僅限非檢視者 */}
            {role !== 'viewer' && (
              <button onClick={() => setAiOpen(true)}
                className="text-sm px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 transition-colors flex items-center gap-1 shadow-sm">
                🤖 <span className="hidden sm:inline">AI 分析</span>
              </button>
            )}

            {/* PDF export — 僅限非檢視者；hidden on mobile */}
            {role !== 'viewer' && (
              <button onClick={handleExportPDF} disabled={pdfLoading}
                className="hidden sm:flex text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors items-center gap-1 disabled:opacity-60">
                {pdfLoading ? '⏳' : '📄'} <span className="hidden md:inline">{pdfLoading ? pdfProgress || 'PDF...' : 'PDF'}</span>
              </button>
            )}

            {/* Cloud sync status */}
            {syncStatus && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 px-2 py-1 rounded-lg">
                {syncing && <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                {syncStatus}
              </span>
            )}

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(d => !d)}
              title={dark ? '切換淺色模式' : '切換深色模式'}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-base"
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* Mobile logout */}
            <button
              onClick={logout}
              title="登出"
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700/50 transition-colors text-sm"
            >
              ⏏
            </button>

            {/* Reset — hidden on mobile */}
            <button onClick={handleReset}
              className="hidden sm:flex text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              重置
            </button>

            {/* User info + logout */}
            {roleInfo && (
              <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-gray-200 dark:border-gray-600">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleInfo.badge}`}>{roleInfo.label}</span>
                <button
                  onClick={logout}
                  title="登出"
                  className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700/50 transition-colors"
                >
                  登出
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Admin Bar — 管理員快速導航 */}
        {role === 'admin' && (
          <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/50 px-3 sm:px-4 py-1.5 flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-bold text-red-400 dark:text-red-500 mr-1 hidden sm:inline">🔐 管理員</span>
            {[
              { id: 'users',    label: '人員設定', icon: '👥' },
              { id: 'database', label: '資料庫',   icon: '🗄️' },
              { id: 'backup',   label: '備份還原', icon: '💾' },
            ].map(item => (
              <button key={item.id} onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === item.id
                    ? 'bg-red-500 text-white'
                    : 'text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                }`}>
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Notifications */}
        {(notice || error) && (
          <div className={`mx-3 sm:mx-4 mt-2 px-4 py-2 rounded-lg text-sm flex items-center justify-between flex-shrink-0 ${
            notice
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}>
            <span>{notice ? `✓ ${notice}` : `⚠️ ${error}`}</span>
            <button onClick={() => { setNotice(null); setError(null) }} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* 上傳錯誤（每個檔案獨立顯示，不互相覆蓋） */}
        {uploadErrors.some(e => e.reason === 'BUCKET_NOT_FOUND') && (
          <div className="mx-3 sm:mx-4 mt-1 px-4 py-3 rounded-lg text-sm flex-shrink-0 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 space-y-1">
            <p className="font-bold">⚠️ 雲端儲存空間（Bucket）尚未建立，資料無法同步至雲端</p>
            <p className="text-xs">請前往 <strong>Supabase Dashboard → Storage → New bucket</strong>，名稱填 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">sales-files</code>，建立後重新上傳檔案即可。</p>
          </div>
        )}
        {uploadErrors.filter(e => e.reason !== 'BUCKET_NOT_FOUND').map(e => (
          <div key={e.name} className="mx-3 sm:mx-4 mt-1 px-4 py-2 rounded-lg text-sm flex items-center justify-between flex-shrink-0 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <span>⚠️ 「{e.name}」上傳失敗：{e.reason}（重新登入後資料不會顯示）</span>
          </div>
        ))}

        {/* Upload history panel */}
        {showHistory && (
          <div className="mx-3 sm:mx-4 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 flex-shrink-0 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300">上傳記錄</span>
                {role === 'admin' && (
                  <span className="text-xs text-red-400 dark:text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded font-medium">管理員：可刪除雲端檔案</span>
                )}
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">✕</button>
            </div>
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 border-b dark:border-gray-700">
                  <th className="text-left py-1 pr-3">檔案</th>
                  <th className="text-center py-1 pr-3">日期範圍</th>
                  <th className="text-right py-1 pr-3">新增</th>
                  <th className="text-right py-1 pr-3">略過</th>
                  <th className="text-right py-1">時間</th>
                  {role === 'admin' && <th className="text-right py-1 pl-3">刪除</th>}
                </tr>
              </thead>
              <tbody>
                {uploadHistory.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-1 pr-3 text-gray-700 dark:text-gray-200 font-medium max-w-[200px] truncate">{f.name}</td>
                    <td className="py-1 pr-3 text-center text-gray-400 dark:text-gray-500 text-xs">
                      {f.dateRange ? `${f.dateRange.min} ~ ${f.dateRange.max}` : '—'}
                    </td>
                    <td className="py-1 pr-3 text-right text-emerald-600 dark:text-emerald-400 font-mono">+{f.addedCount.toLocaleString()}</td>
                    <td className="py-1 pr-3 text-right text-gray-400 dark:text-gray-500 font-mono">{f.duplicateCount.toLocaleString()}</td>
                    <td className="py-1 text-right text-gray-400 dark:text-gray-500">{f.time}</td>
                    {role === 'admin' && (
                      <td className="py-1 pl-3 text-right">
                        <button
                          onClick={() => handleDeleteFile(f)}
                          className="text-xs px-2 py-0.5 rounded border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          title={`從雲端刪除 ${f.name}`}
                        >🗑 刪除</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* KPI Cards toggle bar — 只在有資料時顯示 */}
        {meta && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
            <button
              onClick={() => setDashboardOpen(v => !v)}
              className="flex items-center gap-2 text-base sm:text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors min-h-[40px]"
            >
              <span className={`transition-transform duration-200 text-2xl sm:text-sm leading-none ${dashboardOpen ? 'rotate-90' : ''}`}>▶</span>
              {dashboardOpen ? '收折儀表板' : '展開儀表板'}
            </button>
            {!dashboardOpen && (
              <span className="text-sm text-gray-400 dark:text-gray-500 ml-1 hidden sm:inline">（KPI 數據已收折）</span>
            )}
          </div>
        )}

        {/* KPI Cards */}
        {meta && dashboardOpen && (
          <SummaryCards
            summary={summary} metric={filters.metric} trendData={trendData}
            productData={productData} customerData={customerData}
            customerByChannelTop={customerByChannelTop} costs={perms.viewCosts ? productCosts : {}}
          />
        )}

        {/* 待辦提醒列 */}
        <DashboardReminders
          invoiceRecords={invoiceRecords}
          monthlyExpenses={monthlyExpenses}
          allRows={visibleRows}
          onNavigate={(tab) => { handleTabChange(tab) }}
        />

        {/* Tab 群組選擇列 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 sm:px-4 flex-shrink-0 gap-1">
          {TAB_GROUPS.map(group => {
            const visibleIds = new Set(visibleTabs.map(t => t.id))
            const hasAny = group.tabs.some(id => visibleIds.has(id))
            if (!hasAny) return null
            const isActive = activeGroup === group.id
            return (
              <button key={group.id}
                onClick={() => handleGroupChange(group.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-800/60'
                }`}
              >
                <span className="text-base sm:text-sm">{group.icon}</span>
                <span>{group.label}</span>
              </button>
            )
          })}
        </div>

        {/* Sub-tabs（只顯示當前群組的 tab）*/}
        <div ref={tabBarRef} className="flex border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 px-1 sm:px-3 flex-shrink-0 overflow-x-auto scroll-smooth">
          {groupTabs.map(tab => (
            <button key={tab.id}
              data-tab-active={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-shrink-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5
                px-2.5 sm:px-4 py-2 sm:py-3 min-h-[60px] sm:min-h-0 min-w-[54px] sm:min-w-0
                text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              <span className="text-2xl sm:text-base leading-none">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden text-xs leading-tight max-w-[54px] text-center break-keep">{tab.label}</span>
              {tab.id === 'alerts' && <AnomalyBadge allRows={visibleRows} metric={filters.metric} />}
            </button>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-safe" ref={chartAreaRef}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>

          {/* 尚無資料空狀態 */}
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
              <div className="text-5xl mb-4">📤</div>
              <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">尚未載入資料</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs">
                上傳 Excel 銷售資料，即可使用所有分析功能
              </p>
              {perms.uploadData && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-2">
                  📤 上傳資料檔案
                </button>
              )}
              {syncing && (
                <div className="mt-4 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  {syncStatus}
                </div>
              )}
            </div>
          )}

          {activeTab === 'summary' && meta && (
            <div data-pdf-section data-pdf-title="執行摘要">
              <ExecutiveSummary summary={summary} trendData={trendData} metric={filters.metric} productData={productData} customerData={customerData} brandData={brandData} channelData={channelData} allRows={visibleRows} filters={filters} />
            </div>
          )}
          {activeTab === 'comparison' && meta && (
            <div data-pdf-section data-pdf-title="對比分析">
              <ComparisonChart comparisonData={comparisonData} trendData={trendData} filtered={filtered} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'trend' && meta && (
            <div data-pdf-section data-pdf-title="趨勢分析">
              <TrendChart trendData={trendData} trendDataYoY={trendDataYoY} trendDataMoM={trendDataMoM} trendByChannel={trendByChannel} trendByBrand={trendByBrand} trendByProduct={trendByProduct} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'channel' && meta && (
            <div data-pdf-section data-pdf-title="通路分析">
              <ChannelBarChart channelData={channelData} channelTypeData={channelTypeData} channelCustomerData={channelCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'brand' && meta && (
            <div data-pdf-section data-pdf-title="品牌分析">
              <BrandChart brandData={brandData} trendByBrand={trendByBrand} brandChannelData={brandChannelData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'product' && meta && (
            <div data-pdf-section data-pdf-title="產品分析">
              <ProductChart productData={productData} productByChannel={productByChannel} productCustomerData={productCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'customer' && meta && (
            <div data-pdf-section data-pdf-title="客戶分析">
              <CustomerChart customerData={customerData} channelCustomerData={channelCustomerData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'performance' && meta && (
            <div data-pdf-section data-pdf-title="績效矩陣">
              <PerformanceMatrix performanceData={performanceData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'heatmap' && meta && (
            <div data-pdf-section data-pdf-title="熱力圖">
              <HeatmapChart heatmapData={heatmapData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'table' && meta && (
            <DataTable rows={filtered} />
          )}
          {activeTab === 'costs' && perms.viewCosts && (
            <ProductCostManager
              products={meta?.products || []}
              costs={productCosts}
              onUpdateCost={updateProductCost}
              onUpdateMany={updateManyProductCosts}
            />
          )}
          {activeTab === 'expenses' && (
            <MonthlyExpenseManager
              expenses={monthlyExpenses}
              onSave={saveMonthlyExpenses}
            />
          )}
          {activeTab === 'invoice' && (
            <InvoiceReconciliation
              invoices={invoiceRecords}
              onSave={saveInvoiceRecords}
              allRows={visibleRows}
            />
          )}
          {activeTab === 'goals' && meta && (
            <div data-pdf-section data-pdf-title="目標管理">
              <GoalDashboard trendData={trendData} comparisonData={comparisonData} summary={summary} brandData={brandData} channelData={channelData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'alerts' && meta && (
            <div data-pdf-section data-pdf-title="預警中心">
              <AnomalyPanel allRows={visibleRows} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'health' && meta && (
            <div data-pdf-section data-pdf-title="客戶健康">
              <CustomerHealthPanel allRows={visibleRows} />
            </div>
          )}
          {activeTab === 'forecast' && meta && (
            <div data-pdf-section data-pdf-title="預測分析">
              <SalesForecast trendData={trendData} metric={filters.metric} />
            </div>
          )}
          {activeTab === 'flow' && meta && (
            <div data-pdf-section data-pdf-title="流程架構">
              <FlowDiagram flowData={flowData} structureData={structureData} />
            </div>
          )}
          {activeTab === 'line-notify' && (
            <LineNotifyPanel
              salesData={{
                summary, trendData, productData, customerData, brandData,
                channelData, channelTypeData, filters,
              }}
              invoiceRecords={invoiceRecords}
              allRows={visibleRows}
            />
          )}
          {activeTab === 'backup' && (
            <DataBackupPanel
              productCosts={productCosts}
              cloudFiles={cloudFiles}
              allRows={visibleRows}
              onRestore={handleRestoreBackup}
            />
          )}
          {activeTab === 'users' && (
            <UserManagement currentUserId={user?.id} />
          )}
          {activeTab === 'database' && (
            <DatabaseStatusPanel cloudFiles={cloudFiles} allRows={visibleRows} />
          )}
        </div>
      </div>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => { handleTabChange(tab); setSearchOpen(false) }}
        productData={productData}
        customerData={customerData}
        brandData={brandData}
      />

      {/* API Key Modal */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setKeyModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">🔑 設定 Google AI Studio API Key</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              用於 AI 分析、目標建議、執行摘要等功能。Key 只存在你的瀏覽器，不會上傳。<br />
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">→ 前往 Google AI Studio 取得 Key</a>
            </p>
            <input
              type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
              placeholder="AIza..."
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-base font-mono focus:outline-none focus:border-blue-400 mb-4 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {keyHasValue && (
                <button onClick={() => { setStoredApiKey(''); setKeyHasValue(false); setKeyModalOpen(false) }}
                  className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  清除 Key
                </button>
              )}
              <button onClick={() => setKeyModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                取消
              </button>
              <button onClick={() => {
                const k = keyInput.trim()
                setStoredApiKey(k); setKeyHasValue(!!k); setKeyModalOpen(false)
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
        user={user}
        salesData={{
          summary, filters,
          productData, brandData, channelData, channelTypeData,
          channelCustomerData, customerData, trendData, performanceData,
        }}
      />
    </div>
  )
}

function AppInner() {
  const { isLoggedIn, loading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-blue-300 text-sm">載入中…</p>
        </div>
      </div>
    )
  }
  if (!isLoggedIn) return <LoginPage />
  return <AppDashboard />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

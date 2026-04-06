import { useState, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

// ─── 常數 ───────────────────────────────────────────────────────────────────
const STATUSES = {
  pending:   { label: '待入帳',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   dot: 'bg-amber-400' },
  confirmed: { label: '已入帳',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  partial:   { label: '部分入帳', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       dot: 'bg-blue-400' },
  overdue:   { label: '逾期未入帳', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         dot: 'bg-red-500' },
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function fmtN(v) {
  if (v == null || isNaN(v)) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '萬'
  return Number(v).toLocaleString()
}
function todayStr() { return new Date().toISOString().slice(0, 10) }
function thisMonth() { return new Date().toISOString().slice(0, 7) }
function monthLabel(m) {
  const [y, mo] = m.split('-')
  return `${y} 年 ${parseInt(mo)} 月`
}
function addMonths(m, n) {
  const d = new Date(m + '-01')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 7)
}

const INVOICE_TYPES = [
  { value: 'electronic', label: '電子發票', icon: '📱' },
  { value: 'paper',      label: '紙本發票', icon: '📄' },
]

const PAYMENT_METHODS = [
  { value: 'transfer', label: '匯款',   icon: '🏦' },
  { value: 'check',    label: '支票',   icon: '📝' },
  { value: 'cash',     label: '現金',   icon: '💵' },
  { value: 'other',    label: '其他',   icon: '•'  },
]

const PAYMENT_TERMS = [15, 30, 45, 60]

// 計算到期日：issueDate + paymentTerm 天
export function calcDueDate(issueDate, paymentTerm) {
  if (!issueDate || !paymentTerm) return null
  const d = new Date(issueDate)
  d.setDate(d.getDate() + paymentTerm)
  return d.toISOString().slice(0, 10)
}

// 距今剩幾天（負數 = 已逾期）
export function daysFromToday(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date(todayStr())
  return Math.round(diff / 86400000)
}

const EMPTY_FORM = {
  store: '', invoiceNo: '', amount: '', issueDate: todayStr(),
  invoiceType: 'electronic', paymentMethod: 'transfer',
  paymentTerm: 30,
  status: 'pending', confirmedAt: '', confirmedAmount: '', note: '',
}

// ─── 狀態徽章 ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUSES[status] || STATUSES.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

// ─── KPI 卡片 ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, gradient, icon }) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-md ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold opacity-80 mb-1">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl opacity-80">{icon}</span>
      </div>
    </div>
  )
}

// ─── 表單 ──────────────────────────────────────────────────────────────────
function InvoiceForm({ initial, onSubmit, onCancel, stores, salesByCustomer = {} }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 依目前輸入的店家名稱查找銷售金額參考
  const salesRef = form.store.trim() ? (salesByCustomer[form.store.trim()] ?? null) : null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.store.trim()) { alert('請填寫店家名稱'); return }
    if (!form.invoiceNo.trim()) { alert('請填寫發票號碼'); return }
    if (!form.amount || isNaN(parseFloat(form.amount))) { alert('請填寫有效的發票金額'); return }
    if (!form.issueDate) { alert('請填寫發票開立日期'); return }
    onSubmit({
      ...form,
      amount: parseFloat(form.amount),
      confirmedAmount: form.confirmedAmount ? parseFloat(form.confirmedAmount) : null,
    })
  }

  // 狀態選 confirmed/partial 時自動填入今天
  const handleStatusChange = (v) => {
    set('status', v)
    if ((v === 'confirmed' || v === 'partial') && !form.confirmedAt) {
      set('confirmedAt', todayStr())
    }
  }

  const needConfirm = form.status === 'confirmed' || form.status === 'partial'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 第一列：店家 + 發票號碼 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">店家名稱 *</label>
          <input
            list="store-list"
            value={form.store}
            onChange={e => set('store', e.target.value)}
            placeholder="例：全聯 中壢店"
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
          />
          <datalist id="store-list">
            {stores.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">發票號碼 *</label>
          <input
            value={form.invoiceNo}
            onChange={e => set('invoiceNo', e.target.value.toUpperCase())}
            placeholder="例：AA-12345678"
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400 font-mono"
          />
        </div>
      </div>

      {/* 第二列：發票金額 + 開立日期 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">發票金額（元）*</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">NT$</span>
            <input
              type="number" min="0" step="1"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0"
              className="border border-gray-200 dark:border-gray-600 rounded-lg pl-10 pr-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400 w-full"
            />
          </div>
          {/* 銷售系統參考金額 */}
          {salesRef != null ? (
            <div className="flex items-center justify-between gap-2 mt-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700/50">
              <div>
                <p className="text-xs text-blue-500 dark:text-blue-400 font-semibold">📊 銷售系統本月金額</p>
                <p className="font-mono font-bold text-blue-700 dark:text-blue-300 text-sm">
                  NT$ {Math.round(salesRef).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => set('amount', Math.round(salesRef))}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-sm"
              >
                套用
              </button>
            </div>
          ) : form.store.trim() && Object.keys(salesByCustomer).length > 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 px-1">
              ℹ️ 銷售系統中本月查無「{form.store.trim()}」的銷售記錄
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">發票開立日期 *</label>
          <input
            type="date"
            value={form.issueDate}
            onChange={e => set('issueDate', e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* 第三列：發票類型 + 付款方式 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">發票類型</label>
          <div className="flex gap-2">
            {INVOICE_TYPES.map(({ value, label, icon }) => (
              <button
                key={value} type="button"
                onClick={() => set('invoiceType', value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors flex-1 justify-center ${
                  form.invoiceType === value
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                }`}
              >
                <span>{icon}</span>{label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">付款方式</label>
          <div className="flex gap-1.5 flex-wrap">
            {PAYMENT_METHODS.map(({ value, label, icon }) => (
              <button
                key={value} type="button"
                onClick={() => set('paymentMethod', value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  form.paymentMethod === value
                    ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-400 text-violet-700 dark:text-violet-300'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                }`}
              >
                <span>{icon}</span>{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 第四列：付款天數（月結） */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">月結天數</label>
        <div className="flex gap-2 flex-wrap">
          {PAYMENT_TERMS.map(days => (
            <button key={days} type="button"
              onClick={() => set('paymentTerm', days)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                form.paymentTerm === days
                  ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-400 text-teal-700 dark:text-teal-300'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 hover:border-gray-300'
              }`}>
              月結 {days} 天
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">自訂：</span>
            <input
              type="number" min="1" max="365"
              value={PAYMENT_TERMS.includes(form.paymentTerm) ? '' : form.paymentTerm}
              onChange={e => { const v = parseInt(e.target.value); if (v > 0) set('paymentTerm', v) }}
              placeholder="天"
              className="w-16 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-teal-400"
            />
          </div>
        </div>
        {form.issueDate && form.paymentTerm && (
          <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
            到期日：{calcDueDate(form.issueDate, form.paymentTerm)}
          </p>
        )}
      </div>

      {/* 第五列：對帳狀態 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">對帳狀態</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUSES).map(([k, s]) => (
            <button
              key={k} type="button"
              onClick={() => handleStatusChange(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
                form.status === k
                  ? `${s.color} border-current`
                  : 'bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 第四列：確認資訊（status = confirmed / partial 時顯示）*/}
      {needConfirm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700/50">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">入帳確認日期</label>
            <input
              type="date"
              value={form.confirmedAt}
              onChange={e => set('confirmedAt', e.target.value)}
              className="border border-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
              {form.status === 'partial' ? '實際入帳金額（部分）' : '實際入帳金額'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">NT$</span>
              <input
                type="number" min="0" step="1"
                value={form.confirmedAmount}
                onChange={e => set('confirmedAmount', e.target.value)}
                placeholder={form.amount || '0'}
                className="border border-emerald-200 dark:border-emerald-700 rounded-lg pl-10 pr-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-emerald-400 w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* 備註 */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">備註</label>
        <input
          value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="例：已與店長確認、需追蹤…"
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          取消
        </button>
        <button type="submit"
          className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          {initial?.id ? '更新發票' : '新增發票'}
        </button>
      </div>
    </form>
  )
}

// ─── 主元件 ─────────────────────────────────────────────────────────────────
export default function InvoiceReconciliation({ invoices = {}, onSave, allRows = [] }) {
  const [currentMonth, setCurrentMonth] = useState(thisMonth)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterInvoiceType, setFilterInvoiceType] = useState('all')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('issueDate')
  const [sortDir, setSortDir] = useState('asc')

  // 當月發票列表（從 invoices[YYYY-MM] 取得）
  const monthItems = useMemo(() => invoices[currentMonth] || [], [invoices, currentMonth])

  // 所有出現過的店家（發票記錄 + 銷售資料客戶名稱合併）
  const allStores = useMemo(() => {
    const s = new Set()
    Object.values(invoices).flat().forEach(r => { if (r.store) s.add(r.store) })
    allRows.forEach(r => { if (r.customer) s.add(r.customer) })
    return [...s].sort()
  }, [invoices, allRows])

  // ── 當月各客戶銷售金額（從銷售系統計算）────────────────────────────────
  const salesByCustomer = useMemo(() => {
    const map = {}
    for (const r of allRows) {
      if (!r.date || r.date.slice(0, 7) !== currentMonth) continue
      if (!r.customer) continue
      map[r.customer] = (map[r.customer] || 0) + (r.subtotal || 0)
    }
    return map
  }, [allRows, currentMonth])

  // ── 當月有銷售但尚未建立發票的客戶清單 ───────────────────────────────────
  const uninvoicedCustomers = useMemo(() => {
    const invoicedStores = new Set(monthItems.map(r => r.store))
    return Object.entries(salesByCustomer)
      .filter(([customer]) => !invoicedStores.has(customer))
      .sort((a, b) => b[1] - a[1])  // 依銷售金額降序
  }, [salesByCustomer, monthItems])

  // 篩選 + 排序
  const displayed = useMemo(() => {
    let list = [...monthItems]
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus)
    if (filterInvoiceType !== 'all') list = list.filter(r => r.invoiceType === filterInvoiceType)
    if (filterPaymentMethod !== 'all') list = list.filter(r => r.paymentMethod === filterPaymentMethod)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.store?.toLowerCase().includes(q) ||
        r.invoiceNo?.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'issueDate') list.sort((a, b) => dir * a.issueDate.localeCompare(b.issueDate))
    else if (sortBy === 'amount') list.sort((a, b) => dir * (a.amount - b.amount))
    else if (sortBy === 'store') list.sort((a, b) => dir * a.store.localeCompare(b.store, 'zh-TW'))
    else if (sortBy === 'dueDate') {
      list.sort((a, b) => {
        const da = calcDueDate(a.issueDate, a.paymentTerm) || ''
        const db = calcDueDate(b.issueDate, b.paymentTerm) || ''
        return dir * da.localeCompare(db)
      })
    }
    return list
  }, [monthItems, filterStatus, filterInvoiceType, filterPaymentMethod, search, sortBy, sortDir])

  // ── KPI 統計 ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const paidItems      = monthItems.filter(r => r.status === 'confirmed')
    const partialItems   = monthItems.filter(r => r.status === 'partial')
    const reconciledItems = [...paidItems, ...partialItems]
    const pendingItems   = monthItems.filter(r => r.status === 'pending')
    const overdueItems   = monthItems.filter(r => r.status === 'overdue')
    const unreconciledItems = [...pendingItems, ...overdueItems]

    const sum = (arr, fn) => arr.reduce((s, r) => s + (fn(r) || 0), 0)

    const totalAmt      = sum(monthItems, r => r.amount)
    const paidAmt       = sum(paidItems,  r => r.confirmedAmount ?? r.amount)
    const partialAmt    = sum(partialItems, r => r.confirmedAmount ?? r.amount)
    const reconciledAmt = paidAmt + partialAmt
    const unreconciledAmt = sum(unreconciledItems, r => r.amount)
    const overdueAmt    = sum(overdueItems, r => r.amount)

    const rate = totalAmt > 0 ? Math.round((reconciledAmt / totalAmt) * 100) : 0

    return {
      total: totalAmt,       count: monthItems.length,
      paid: paidAmt,         paidCount: paidItems.length,
      partial: partialAmt,   partialCount: partialItems.length,
      reconciled: reconciledAmt, reconciledCount: reconciledItems.length,
      unreconciled: unreconciledAmt, unreconciledCount: unreconciledItems.length,
      pending: sum(pendingItems, r => r.amount), pendingCount: pendingItems.length,
      overdue: overdueAmt,   overdueCount: overdueItems.length,
      rate,
    }
  }, [monthItems])

  // ── 圓餅圖資料（數量分佈）──────────────────────────────────────────────────
  const pieData = useMemo(() => [
    { name: '已付款',   value: stats.paidCount,    color: '#10B981' },
    { name: '部分入帳', value: stats.partialCount,  color: '#3B82F6' },
    { name: '待入帳',   value: stats.pendingCount,  color: '#F59E0B' },
    { name: '逾期',     value: stats.overdueCount,  color: '#EF4444' },
  ].filter(d => d.value > 0), [stats])

  // ── 金額橫條圖（3 類別對比）────────────────────────────────────────────────
  const amountBarData = useMemo(() => [
    { name: '已付款（全額）', amt: stats.paid,         count: stats.paidCount,         color: '#10B981' },
    { name: '已對帳（含部分）', amt: stats.reconciled, count: stats.reconciledCount,   color: '#3B82F6' },
    { name: '未對帳',         amt: stats.unreconciled, count: stats.unreconciledCount, color: '#F59E0B' },
    { name: '逾期未入帳',     amt: stats.overdue,      count: stats.overdueCount,      color: '#EF4444' },
  ].filter(d => d.amt > 0 || d.count > 0), [stats])

  // ── 各店家橫條圖資料 ──────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const map = {}
    monthItems.forEach(r => {
      if (!map[r.store]) map[r.store] = { store: r.store, 已入帳: 0, 待入帳: 0 }
      const isIn = r.status === 'confirmed' || r.status === 'partial'
      if (isIn) map[r.store].已入帳 += r.confirmedAmount ?? r.amount ?? 0
      else map[r.store].待入帳 += r.amount || 0
    })
    return Object.values(map).sort((a, b) => (b.已入帳 + b.待入帳) - (a.已入帳 + a.待入帳))
  }, [monthItems])

  // ── CRUD ────────────────────────────────────────────────────────────────
  const handleSave = useCallback((data) => {
    const issuedMonth = data.issueDate.slice(0, 7)
    const existing = invoices[issuedMonth] || []
    let next
    if (data.id) {
      next = existing.map(r => r.id === data.id ? data : r)
    } else {
      next = [...existing, { ...data, id: genId() }]
    }
    onSave(issuedMonth, next)
    // 若新增到其他月份，切換過去
    if (issuedMonth !== currentMonth) setCurrentMonth(issuedMonth)
    setShowForm(false)
    setEditItem(null)
  }, [invoices, onSave, currentMonth])

  const handleEdit = useCallback((item) => {
    setEditItem(item)
    setShowForm(true)
  }, [])

  const handleDelete = useCallback((item) => {
    if (!window.confirm(`確定要刪除「${item.store}」的發票 ${item.invoiceNo}？`)) return
    const issuedMonth = item.issueDate.slice(0, 7)
    const existing = invoices[issuedMonth] || []
    onSave(issuedMonth, existing.filter(r => r.id !== item.id))
  }, [invoices, onSave])

  const handleStatusQuickChange = useCallback((item, newStatus) => {
    const issuedMonth = item.issueDate.slice(0, 7)
    const existing = invoices[issuedMonth] || []
    const updated = {
      ...item,
      status: newStatus,
      confirmedAt: (newStatus === 'confirmed' || newStatus === 'partial') && !item.confirmedAt
        ? todayStr() : item.confirmedAt,
      confirmedAmount: newStatus === 'confirmed' && !item.confirmedAmount
        ? item.amount : item.confirmedAmount,
    }
    onSave(issuedMonth, existing.map(r => r.id === item.id ? updated : r))
  }, [invoices, onSave])

  const cancelForm = () => { setShowForm(false); setEditItem(null) }

  // ── XLSX 匯出 ──────────────────────────────────────────────────────────────
  const handleExportXLSX = useCallback(() => {
    const statusLabel = s => STATUSES[s]?.label || s
    const invoiceTypeLabel = v => INVOICE_TYPES.find(x => x.value === v)?.label || v
    const paymentMethodLabel = v => PAYMENT_METHODS.find(x => x.value === v)?.label || v

    // 匯出全部月份
    const allItems = Object.entries(invoices)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([month, items]) => items.map(r => {
        const due = calcDueDate(r.issueDate, r.paymentTerm)
        const days = r.status !== 'confirmed' ? daysFromToday(due) : null
        return {
          '月份': month,
          '店家名稱': r.store,
          '發票號碼': r.invoiceNo,
          '發票類型': invoiceTypeLabel(r.invoiceType),
          '付款方式': paymentMethodLabel(r.paymentMethod),
          '月結天數': r.paymentTerm || '',
          '發票開立日期': r.issueDate,
          '到期日': due || '',
          '剩餘天數': days != null ? days : '',
          '發票金額': r.amount,
          '對帳狀態': statusLabel(r.status),
          '入帳日期': r.confirmedAt || '',
          '入帳金額': r.confirmedAmount ?? '',
          '金額差異': r.confirmedAmount != null ? r.confirmedAmount - r.amount : '',
          '備註': r.note || '',
        }
      }))

    if (!allItems.length) { alert('目前沒有發票資料可匯出'); return }

    const ws = XLSX.utils.json_to_sheet(allItems)
    // 設定欄位寬度
    ws['!cols'] = [
      {wch:10},{wch:18},{wch:16},{wch:10},{wch:8},{wch:8},
      {wch:13},{wch:13},{wch:10},{wch:12},{wch:10},{wch:13},{wch:12},{wch:10},{wch:24},
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '發票對帳記錄')
    XLSX.writeFile(wb, `發票對帳_${new Date().toISOString().slice(0,10)}.xlsx`)
  }, [invoices])

  const diffAmount = (item) => {
    if (item.confirmedAmount == null) return null
    return item.confirmedAmount - item.amount
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-5">

      {/* Header + 月份導航 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">發票對帳管理</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            追蹤發票開立、入帳狀態與金額差異
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(m => addMonths(m, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg">
            ‹
          </button>
          <span className="text-base font-bold text-gray-700 dark:text-gray-200 min-w-[110px] text-center">
            {monthLabel(currentMonth)}
          </span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg">
            ›
          </button>
          <button
            onClick={handleExportXLSX}
            className="ml-1 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="匯出全部月份 XLSX"
          >
            📥 匯出
          </button>
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            ＋ 新增發票
          </button>
        </div>
      </div>

      {/* 表單 */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-4">
            {editItem ? '✏️ 編輯發票' : '➕ 新增發票'}
          </h3>
          <InvoiceForm
            initial={editItem}
            onSubmit={handleSave}
            onCancel={cancelForm}
            stores={allStores}
            salesByCustomer={salesByCustomer}
          />
        </div>
      )}

      {/* 尚未開立發票的客戶（本月有銷售但未記錄發票）*/}
      {uninvoicedCustomers.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <span className="text-sm font-bold text-amber-800 dark:text-amber-200">
                本月有銷售記錄、尚未開立發票的客戶
              </span>
              <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold">
                {uninvoicedCustomers.length} 家
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {uninvoicedCustomers.map(([customer, amt]) => (
              <button
                key={customer}
                type="button"
                onClick={() => {
                  setEditItem({ store: customer, amount: Math.round(amt) })
                  setShowForm(true)
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 rounded-xl text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors shadow-sm group"
              >
                <span className="font-semibold text-gray-700 dark:text-gray-200">{customer}</span>
                <span className="text-xs text-amber-700 dark:text-amber-400 font-mono">NT$ {Math.round(amt).toLocaleString()}</span>
                <span className="text-xs text-blue-500 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">＋開立</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 opacity-70">
            點擊客戶名稱可快速帶入銷售金額並開啟新增表單
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="發票總金額" value={`NT$ ${fmtN(stats.total)}`}
          sub={`共 ${stats.count} 張`} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" icon="🧾" />
        <KpiCard label="已付款金額" value={`NT$ ${fmtN(stats.paid)}`}
          sub={`${stats.paidCount} 張全額入帳`} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" icon="✅" />
        <KpiCard label="未對帳金額" value={`NT$ ${fmtN(stats.unreconciled)}`}
          sub={`${stats.unreconciledCount} 張待處理`}
          gradient="bg-gradient-to-br from-amber-400 to-orange-500" icon="⏳" />
        <KpiCard label="逾期未入帳" value={`${stats.overdueCount} 張`}
          sub={stats.overdueCount > 0 ? `NT$ ${fmtN(stats.overdue)}` : '目前無逾期'}
          gradient={stats.overdueCount > 0 ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}
          icon="⚠️" />
      </div>

      {/* 對帳狀態摘要卡（金額 + 數量）*/}
      {monthItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 已對帳 */}
          <div className="bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">已對帳</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                {stats.reconciledCount} 張
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">NT$ {fmtN(stats.reconciled)}</p>
            <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex justify-between">
                <span>全額入帳</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.paidCount} 張・NT$ {fmtN(stats.paid)}</span>
              </div>
              <div className="flex justify-between">
                <span>部分入帳</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.partialCount} 張・NT$ {fmtN(stats.partial)}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${stats.total > 0 ? (stats.reconciled / stats.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">佔總金額 {stats.total > 0 ? Math.round((stats.reconciled / stats.total) * 100) : 0}%</p>
          </div>

          {/* 已付款（全額） */}
          <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">已付款</span>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                {stats.paidCount} 張
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">NT$ {fmtN(stats.paid)}</p>
            <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex justify-between">
                <span>平均每張</span>
                <span className="font-semibold">{stats.paidCount > 0 ? `NT$ ${fmtN(Math.round(stats.paid / stats.paidCount))}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>入帳率</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.rate}%</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${stats.rate}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">佔總金額 {stats.rate}%</p>
          </div>

          {/* 未對帳 */}
          <div className={`bg-white dark:bg-gray-800 border rounded-2xl p-4 shadow-sm ${
            stats.overdueCount > 0 ? 'border-red-200 dark:border-red-700/50' : 'border-amber-200 dark:border-amber-700/50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wide ${stats.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                未對帳
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                stats.overdueCount > 0
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
              }`}>
                {stats.unreconciledCount} 張
              </span>
            </div>
            <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
              NT$ {fmtN(stats.unreconciled)}
            </p>
            <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex justify-between">
                <span>待入帳</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.pendingCount} 張・NT$ {fmtN(stats.pending)}</span>
              </div>
              <div className="flex justify-between">
                <span>逾期</span>
                <span className={`font-semibold ${stats.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                  {stats.overdueCount} 張・NT$ {fmtN(stats.overdue)}
                </span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${stats.total > 0 ? (stats.unreconciled / stats.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">佔總金額 {stats.total > 0 ? Math.round((stats.unreconciled / stats.total) * 100) : 0}%</p>
          </div>
        </div>
      )}

      {/* 圖表區：圓餅（數量）+ 橫條（金額）*/}
      {monthItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* 圓餅圖：數量分佈 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">發票數量分佈</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">共 {stats.count} 張</p>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-2">
                <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={70}
                      paddingAngle={2} startAngle={90} endAngle={-270}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v} 張`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-gray-600 dark:text-gray-300">{d.name}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{d.value} 張</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">尚無資料</p>
            )}
          </div>

          {/* 橫條圖：金額對比 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">金額 vs 數量對比</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">各狀態金額與筆數</p>
            <div className="space-y-3">
              {amountBarData.map(d => (
                <div key={d.name}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{d.name}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-gray-400">{d.count} 張</span>
                      <span className="text-sm font-bold" style={{ color: d.color }}>NT$ {fmtN(d.amt)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stats.total > 0 ? Math.max((d.amt / stats.total) * 100, d.amt > 0 ? 2 : 0) : 0}%`,
                        background: d.color,
                      }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 各店家入帳狀況（原有圖表） */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">各店家入帳狀況</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="store" tick={{ fontSize: 14 }} />
              <YAxis tick={{ fontSize: 14 }} tickFormatter={v => v >= 1e4 ? (v/1e4).toFixed(0)+'萬' : v} />
              <Tooltip formatter={(v, name) => [`NT$ ${Number(v).toLocaleString()}`, name]} />
              <Legend />
              <Bar dataKey="已入帳" stackId="a" fill="#10B981" radius={[0,0,0,0]} />
              <Bar dataKey="待入帳" stackId="a" fill="#F59E0B" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 篩選列 */}
      <div className="flex flex-col gap-2">
        {/* 第一行：搜尋 + 排序 */}
        <div className="flex gap-2 flex-wrap">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜尋店家、發票號碼、備註…"
            className="flex-1 min-w-[180px] px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-base focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-700 dark:text-gray-200"
          />
          {/* 排序欄位 */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="issueDate">開立日期</option>
            <option value="dueDate">到期日</option>
            <option value="amount">金額</option>
            <option value="store">店家</option>
          </select>
          {/* 排序方向 */}
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-semibold min-w-[60px] text-center"
            title={sortDir === 'asc' ? '目前升冪，點擊改降冪' : '目前降冪，點擊改升冪'}
          >
            {sortDir === 'asc' ? '↑ 升冪' : '↓ 降冪'}
          </button>
        </div>
        {/* 第二行：狀態 + 類型 + 付款方式 */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* 狀態篩選 */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl flex-shrink-0 flex-wrap">
            <button onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all ${filterStatus === 'all' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              全部
            </button>
            {Object.entries(STATUSES).map(([k, s]) => (
              <button key={k} onClick={() => setFilterStatus(k)}
                className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${filterStatus === k ? 'bg-white dark:bg-gray-600 shadow-sm ' + s.color.split(' ').slice(2).join(' ') : 'text-gray-500 dark:text-gray-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {/* 發票類型篩選 */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl flex-shrink-0">
            <button onClick={() => setFilterInvoiceType('all')}
              className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all ${filterInvoiceType === 'all' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              所有類型
            </button>
            {INVOICE_TYPES.map(({ value, label, icon }) => (
              <button key={value} onClick={() => setFilterInvoiceType(value)}
                className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${filterInvoiceType === value ? 'bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {icon} {label}
              </button>
            ))}
          </div>
          {/* 付款方式篩選 */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl flex-shrink-0 flex-wrap">
            <button onClick={() => setFilterPaymentMethod('all')}
              className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all ${filterPaymentMethod === 'all' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              所有付款
            </button>
            {PAYMENT_METHODS.map(({ value, label, icon }) => (
              <button key={value} onClick={() => setFilterPaymentMethod(value)}
                className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${filterPaymentMethod === value ? 'bg-white dark:bg-gray-600 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 發票列表 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <span className="text-4xl mb-3">🧾</span>
            <p className="font-medium">{monthItems.length === 0 ? '本月尚無發票記錄' : '沒有符合條件的發票'}</p>
            {monthItems.length === 0 && (
              <button onClick={() => { setEditItem(null); setShowForm(true) }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                ＋ 新增第一張發票
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 桌面版表格 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">店家</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">發票號碼</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">類型</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">付款方式</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">開立日期</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">發票金額</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">狀態</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">入帳金額</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">到期日</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">確認日期</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {displayed.map(item => {
                    const diff = diffAmount(item)
                    const dueDate = calcDueDate(item.issueDate, item.paymentTerm)
                    const daysLeft = item.status !== 'confirmed' ? daysFromToday(dueDate) : null
                    const isOverdue = daysLeft !== null && daysLeft < 0
                    const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${isOverdue ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">{item.store}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-400">{item.invoiceNo}</td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const t = INVOICE_TYPES.find(x => x.value === item.invoiceType)
                            return t ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.invoiceType === 'electronic'
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {t.icon} {t.label}
                              </span>
                            ) : '—'
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const m = PAYMENT_METHODS.find(x => x.value === item.paymentMethod)
                            return m ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.paymentMethod === 'transfer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                item.paymentMethod === 'check'    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' :
                                item.paymentMethod === 'cash'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {m.icon} {m.label}
                              </span>
                            ) : '—'
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">{item.issueDate}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-700 dark:text-gray-200">
                          NT$ {Number(item.amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="relative group inline-block">
                            <StatusBadge status={item.status} />
                            {/* 快速切換下拉 */}
                            <div className="absolute z-10 top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:flex flex-col gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl p-1 min-w-[110px]">
                              {Object.entries(STATUSES).map(([k, s]) => (
                                <button key={k} onClick={() => handleStatusQuickChange(item, k)}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${item.status === k ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.confirmedAmount != null ? (
                            <div>
                              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                NT$ {Number(item.confirmedAmount).toLocaleString()}
                              </span>
                              {diff !== null && diff !== 0 && (
                                <span className={`ml-1.5 text-xs font-semibold ${diff < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                  {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {dueDate ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-xs font-semibold ${isOverdue ? 'text-red-600 dark:text-red-400' : isDueSoon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                {dueDate}
                              </span>
                              {daysLeft !== null && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                  isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                                  isDueSoon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                  'text-gray-400'
                                }`}>
                                  {isOverdue ? `逾期 ${Math.abs(daysLeft)} 天` : `剩 ${daysLeft} 天`}
                                </span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">
                          {item.confirmedAt || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleEdit(item)}
                              className="px-2 py-1 rounded-md text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-semibold">
                              編輯
                            </button>
                            <button onClick={() => handleDelete(item)}
                              className="px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 手機版卡片列表 */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
              {displayed.map(item => {
                const diff = diffAmount(item)
                return (
                  <div key={item.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-gray-700 dark:text-gray-200">{item.store}</p>
                        <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{item.invoiceNo}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {(() => {
                            const t = INVOICE_TYPES.find(x => x.value === item.invoiceType)
                            return t ? (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                item.invoiceType === 'electronic'
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>{t.icon} {t.label}</span>
                            ) : null
                          })()}
                          {(() => {
                            const m = PAYMENT_METHODS.find(x => x.value === item.paymentMethod)
                            return m ? (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                item.paymentMethod === 'transfer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                item.paymentMethod === 'check'    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' :
                                item.paymentMethod === 'cash'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>{m.icon} {m.label}</span>
                            ) : null
                          })()}
                        </div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-400 text-xs">發票金額</span>
                        <p className="font-mono font-semibold text-gray-700 dark:text-gray-200">
                          NT$ {Number(item.amount).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-xs">開立日期</span>
                        <p className="text-gray-600 dark:text-gray-300">{item.issueDate}</p>
                      </div>
                      {item.confirmedAmount != null && (
                        <div>
                          <span className="text-gray-400 text-xs">入帳金額</span>
                          <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            NT$ {Number(item.confirmedAmount).toLocaleString()}
                            {diff !== null && diff !== 0 && (
                              <span className={`ml-1 text-xs ${diff < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                ({diff > 0 ? '+' : ''}{diff.toLocaleString()})
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      {item.confirmedAt && (
                        <div>
                          <span className="text-gray-400 text-xs">確認日期</span>
                          <p className="text-gray-600 dark:text-gray-300">{item.confirmedAt}</p>
                        </div>
                      )}
                    </div>
                    {item.note && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{item.note}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      {/* 手機快速狀態切換 */}
                      {item.status === 'pending' && (
                        <button onClick={() => handleStatusQuickChange(item, 'confirmed')}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 transition-colors">
                          ✓ 標記已入帳
                        </button>
                      )}
                      {item.status === 'pending' && (
                        <button onClick={() => handleStatusQuickChange(item, 'overdue')}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors">
                          ⚠ 標記逾期
                        </button>
                      )}
                      <button onClick={() => handleEdit(item)}
                        className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        編輯
                      </button>
                      <button onClick={() => handleDelete(item)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 transition-colors">
                        刪除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 底部統計 */}
        {displayed.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 dark:text-gray-500">
            <span>顯示 {displayed.length} / {monthItems.length} 筆</span>
            <span>發票合計 NT$ {displayed.reduce((s,r)=>s+r.amount,0).toLocaleString()}</span>
            {displayed.some(r => r.confirmedAmount != null) && (
              <span>入帳合計 NT$ {displayed.reduce((s,r)=>s+(r.confirmedAmount??0),0).toLocaleString()}</span>
            )}
          </div>
        )}
      </div>

      {/* 備註說明 */}
      {displayed.some(r => r.note) && (
        <div className="space-y-1">
          {displayed.filter(r => r.note).map(r => (
            <div key={r.id} className="flex gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold">{r.store}</span>
              <span>·</span>
              <span>{r.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

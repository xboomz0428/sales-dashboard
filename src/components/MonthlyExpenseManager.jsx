import { useState, useMemo } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── 預設費用類別 ───────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ['人事', '房租', '運費', '行銷', '印刷品', '其他']
const CAT_COLORS = {
  人事: '#3B82F6', 房租: '#10B981', 運費: '#F59E0B',
  行銷: '#EF4444', 印刷品: '#8B5CF6', 其他: '#6B7280',
}
const EXTRA_COLORS = ['#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#14B8A6']
const LS_CAT_KEY = 'expense_custom_categories'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function fmtN(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '萬'
  return v.toLocaleString()
}
function getColor(cat, allCats) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat]
  const idx = allCats.indexOf(cat) - DEFAULT_CATEGORIES.length
  return EXTRA_COLORS[idx % EXTRA_COLORS.length] || '#9CA3AF'
}

// ─── 空白表單 ──────────────────────────────────────────────────────────────
const EMPTY_FORM = { category: '人事', label: '', count: '', unitCost: '', amount: '', note: '' }

function itemAmount(item) {
  if (item.count > 0 && item.unitCost > 0) return item.count * item.unitCost
  return item.amount || 0
}

// ─── 數字輸入 ──────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{label}</label>
      <input
        type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 w-full focus:outline-none focus:border-blue-400"
      />
    </div>
  )
}

// ─── 費用輸入列 (新增/編輯) ────────────────────────────────────────────────
function ExpenseForm({ form, setForm, categories, onSubmit, onCancel, submitLabel }) {
  const calcAmt = form.count > 0 && form.unitCost > 0
    ? Number(form.count) * Number(form.unitCost) : null
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 類別 */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">類別</label>
          <select
            value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* 項目名稱 */}
        <div className="flex flex-col gap-0.5 sm:col-span-1">
          <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">項目名稱</label>
          <input
            type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="例：員工薪資"
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
          />
        </div>
        {/* 數量 */}
        <NumInput label="數量（選填）" value={form.count}
          onChange={v => setForm(f => ({ ...f, count: v }))} placeholder="如：5 人" />
        {/* 單價 */}
        <NumInput label="單價（選填）" value={form.unitCost}
          onChange={v => setForm(f => ({ ...f, unitCost: v }))} placeholder="每人費用" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        {/* 總金額 */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">
            總金額 {calcAmt != null ? <span className="text-blue-500">（自動計算）</span> : ''}
          </label>
          <input
            type="number" min="0"
            value={calcAmt != null ? calcAmt : form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            disabled={calcAmt != null}
            placeholder="直接輸入總額"
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        {/* 備註 */}
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">備註（選填）</label>
          <input
            type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="備註說明"
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
          />
        </div>
        {/* 按鈕 */}
        <div className="flex gap-2">
          <button onClick={onSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base py-2 rounded-xl transition-colors">
            {submitLabel}
          </button>
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-base py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 主元件 ────────────────────────────────────────────────────────────────
export default function MonthlyExpenseManager({ expenses = {}, onSave }) {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [customCats, setCustomCats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_CAT_KEY)) || [] } catch { return [] }
  })

  const categories = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats])
  const items = expenses[currentMonth] || []

  // ── 月份導航 ───────────────────────────────────────────────────────────
  const changeMonth = (delta) => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-')
    return `${y} 年 ${Number(m)} 月`
  })()

  // ── 統計 ───────────────────────────────────────────────────────────────
  const total = useMemo(() => items.reduce((s, i) => s + itemAmount(i), 0), [items])
  const byCategory = useMemo(() => {
    const map = {}
    items.forEach(i => {
      const c = i.category || '其他'
      map[c] = (map[c] || 0) + itemAmount(i)
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [items])

  const biggestCat = byCategory[0]

  // ── 月趨勢（最近 12 個月有資料的月份）──────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const allCats = new Set()
    const rows = Object.entries(expenses)
      .filter(([, v]) => v?.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, monthItems]) => {
        const [y, m] = month.split('-')
        const row = { label: `${Number(m)}月` }
        monthItems.forEach(i => {
          const c = i.category || '其他'
          row[c] = (row[c] || 0) + itemAmount(i)
          allCats.add(c)
        })
        return row
      })
    return { rows, cats: [...allCats] }
  }, [expenses])

  // ── 自訂類別管理 ───────────────────────────────────────────────────────
  const addCategory = () => {
    const t = newCat.trim()
    if (!t || categories.includes(t)) return
    const next = [...customCats, t]
    setCustomCats(next)
    localStorage.setItem(LS_CAT_KEY, JSON.stringify(next))
    setNewCat('')
  }
  const removeCategory = (cat) => {
    const next = customCats.filter(c => c !== cat)
    setCustomCats(next)
    localStorage.setItem(LS_CAT_KEY, JSON.stringify(next))
  }

  // ── 資料操作 ───────────────────────────────────────────────────────────
  const saveItems = (newItems) => onSave(currentMonth, newItems)

  const handleAdd = () => {
    const amt = addForm.count > 0 && addForm.unitCost > 0
      ? Number(addForm.count) * Number(addForm.unitCost)
      : Number(addForm.amount) || 0
    if (!addForm.label.trim() || amt <= 0) return
    saveItems([...items, {
      id: genId(),
      category: addForm.category, label: addForm.label.trim(),
      count: addForm.count ? Number(addForm.count) : null,
      unitCost: addForm.unitCost ? Number(addForm.unitCost) : null,
      amount: amt, note: addForm.note,
    }])
    setAddForm(EMPTY_FORM)
    setShowAddForm(false)
  }

  const handleDelete = (id) => saveItems(items.filter(i => i.id !== id))

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditForm({
      category: item.category, label: item.label,
      count: item.count ?? '', unitCost: item.unitCost ?? '',
      amount: item.amount ?? '', note: item.note ?? '',
    })
  }

  const handleSaveEdit = () => {
    const amt = editForm.count > 0 && editForm.unitCost > 0
      ? Number(editForm.count) * Number(editForm.unitCost)
      : Number(editForm.amount) || 0
    saveItems(items.map(i => i.id !== editingId ? i : {
      ...i, category: editForm.category, label: editForm.label,
      count: editForm.count ? Number(editForm.count) : null,
      unitCost: editForm.unitCost ? Number(editForm.unitCost) : null,
      amount: amt, note: editForm.note,
    }))
    setEditingId(null)
  }

  // ── 前一個月資料用於比較 ────────────────────────────────────────────────
  const prevMonth = (() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const prevTotal = useMemo(
    () => (expenses[prevMonth] || []).reduce((s, i) => s + itemAmount(i), 0),
    [expenses, prevMonth]
  )
  const momChange = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">

      {/* ── 標題列 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">每月費用管理</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">記錄公司每月整體營運費用</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCatMgr(v => !v)}
            className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            ⚙ 管理類別
          </button>
          <button
            onClick={() => { setShowAddForm(v => !v); setEditingId(null) }}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            ＋ 新增費用
          </button>
        </div>
      </div>

      {/* ── 類別管理面板 ── */}
      {showCatMgr && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">費用類別管理</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {DEFAULT_CATEGORIES.map(c => (
              <span key={c} className="px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
                {c} <span className="text-xs ml-1 opacity-50">預設</span>
              </span>
            ))}
            {customCats.map(c => (
              <span key={c} className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-sm text-blue-700 dark:text-blue-300">
                {c}
                <button onClick={() => removeCategory(c)} className="ml-1 opacity-60 hover:opacity-100 text-xs">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text" value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="新增自訂類別..."
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-base bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
            />
            <button onClick={addCategory}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              新增
            </button>
          </div>
        </div>
      )}

      {/* ── 月份選擇 ── */}
      <div className="flex items-center gap-4">
        <button onClick={() => changeMonth(-1)}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-lg font-bold">
          ‹
        </button>
        <div className="flex-1 text-center">
          <span className="text-xl font-black text-gray-800 dark:text-gray-100">{monthLabel}</span>
        </div>
        <button onClick={() => changeMonth(1)}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-lg font-bold">
          ›
        </button>
      </div>

      {/* ── 新增表單 ── */}
      {showAddForm && (
        <ExpenseForm
          form={addForm} setForm={setAddForm} categories={categories}
          onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} submitLabel="新增"
        />
      )}

      {/* ── KPI 卡片 ── */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 本月總費用 */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-4 text-white">
            <p className="text-sm text-white/70 font-medium">本月總費用</p>
            <p className="text-2xl font-black mt-1">{fmtN(total)}</p>
            {momChange != null && (
              <p className={`text-xs mt-1 ${momChange > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                {momChange > 0 ? '▲' : '▼'} {Math.abs(momChange).toFixed(1)}% 較上月
              </p>
            )}
          </div>
          {/* 最大支出 */}
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
            <p className="text-sm text-white/70 font-medium">最大支出</p>
            <p className="text-xl font-black mt-1 truncate">{biggestCat?.name || '—'}</p>
            <p className="text-sm text-white/60 mt-0.5">{fmtN(biggestCat?.value)}</p>
          </div>
          {/* 費用項目數 */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white">
            <p className="text-sm text-white/70 font-medium">費用項目</p>
            <p className="text-2xl font-black mt-1">{items.length} 筆</p>
            <p className="text-sm text-white/60 mt-0.5">{byCategory.length} 個類別</p>
          </div>
          {/* 上月費用 */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-4 text-white">
            <p className="text-sm text-white/70 font-medium">上月費用</p>
            <p className="text-2xl font-black mt-1">{prevTotal > 0 ? fmtN(prevTotal) : '—'}</p>
            <p className="text-sm text-white/60 mt-0.5">{prevMonth.replace('-', ' / ')}</p>
          </div>
        </div>
      )}

      {/* ── 圖表區 ── */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 本月費用圓餅 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">本月費用結構</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius="70%"
                  label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  labelLine={false}>
                  {byCategory.map((e, i) => (
                    <Cell key={i} fill={getColor(e.name, categories)} />
                  ))}
                </Pie>
                <Tooltip formatter={v => ['$' + v.toLocaleString(), '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 月趨勢堆疊長條 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 mb-3">月費用趨勢</h3>
            {monthlyTrend.rows.length < 2 ? (
              <div className="flex items-center justify-center h-48 text-sm text-gray-400 dark:text-gray-500">
                輸入兩個月以上資料後顯示趨勢圖
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyTrend.rows} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: '#9ca3af' }} axisLine={false} />
                  <YAxis tickFormatter={v => fmtN(v)} tick={{ fontSize: 14, fill: '#9ca3af' }} width={45} axisLine={false} />
                  <Tooltip formatter={(v, n) => [`$${v.toLocaleString()}`, n]} />
                  <Legend wrapperStyle={{ fontSize: 14 }} />
                  {monthlyTrend.cats.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={getColor(cat, categories)} radius={i === monthlyTrend.cats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── 費用明細表 ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <span className="font-bold text-gray-700 dark:text-gray-200 text-base">{monthLabel} 費用明細</span>
          <span className="text-sm text-gray-400 dark:text-gray-500">{items.length} 筆 · 合計 <span className="font-bold text-gray-700 dark:text-gray-200">${total.toLocaleString()}</span></span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 gap-3">
            <span className="text-5xl">💰</span>
            <p className="text-base font-medium">尚無費用記錄</p>
            <p className="text-sm">點選「新增費用」開始記錄本月費用</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-5 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-900/40">
              <span className="w-24">類別</span>
              <span>項目</span>
              <span className="w-28 text-right">數量 × 單價</span>
              <span className="w-28 text-right">金額</span>
              <span className="w-32">備註</span>
              <span className="w-16 text-center">操作</span>
            </div>

            {items.map(item => (
              editingId === item.id ? (
                <div key={item.id} className="p-4">
                  <ExpenseForm
                    form={editForm} setForm={setEditForm} categories={categories}
                    onSubmit={handleSaveEdit} onCancel={() => setEditingId(null)} submitLabel="儲存"
                  />
                </div>
              ) : (
                <div key={item.id}
                  className="grid sm:grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 sm:gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors items-center">
                  {/* 類別 badge */}
                  <div className="w-24">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                      style={{ background: getColor(item.category || '其他', categories) }}>
                      {item.category || '其他'}
                    </span>
                  </div>
                  {/* 名稱 */}
                  <div className="min-w-0">
                    <p className="font-semibold text-base text-gray-800 dark:text-gray-100 truncate">{item.label}</p>
                  </div>
                  {/* 數量 × 單價 */}
                  <div className="w-28 text-right text-sm text-gray-400 dark:text-gray-500">
                    {item.count && item.unitCost
                      ? `${item.count} × ${item.unitCost?.toLocaleString()}`
                      : <span className="opacity-0">—</span>}
                  </div>
                  {/* 金額 */}
                  <div className="w-28 text-right font-mono font-bold text-gray-800 dark:text-gray-100">
                    ${itemAmount(item).toLocaleString()}
                  </div>
                  {/* 備註 */}
                  <div className="w-32 text-sm text-gray-400 dark:text-gray-500 truncate">
                    {item.note || ''}
                  </div>
                  {/* 操作 */}
                  <div className="w-16 flex items-center justify-center gap-1">
                    <button onClick={() => startEdit(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="編輯">
                      ✏
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="刪除">
                      🗑
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

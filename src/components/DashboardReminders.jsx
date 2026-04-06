import { useMemo, useState } from 'react'
import { calcDueDate, daysFromToday } from './InvoiceReconciliation'

// ─── 提醒引擎 ────────────────────────────────────────────────────────────────
function buildReminders({ invoiceRecords, monthlyExpenses, allRows }) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const day  = today.getDate()
  const year = today.getFullYear()
  const mon  = today.getMonth() + 1   // 1-12
  const pad  = n => String(n).padStart(2, '0')
  const thisMonthKey = `${year}-${pad(mon)}`

  // 上個月 key
  const prevMon  = mon === 1 ? 12 : mon - 1
  const prevYear = mon === 1 ? year - 1 : year
  const prevKey  = `${prevYear}-${pad(prevMon)}`

  const reminders = []

  // ── 1. 薪資匯款提醒（每月 1～5 日）─────────────────────────────────────
  if (day >= 1 && day <= 5) {
    const urgent = day >= 4
    reminders.push({
      id: `salary_${thisMonthKey}`,
      level: urgent ? 'urgent' : 'warning',
      icon: '💰',
      title: '薪資匯款提醒',
      message: `${year} 年 ${mon} 月薪資請於本月 5 日前完成匯款`,
      detail: urgent ? '距截止日僅剩不到 2 天，請儘速處理！' : `今天是 ${mon} 月 ${day} 日，截止日為本月 5 日`,
      action: null,
    })
  }

  // ── 2. 發票開立提醒（每月 1～5 日：上月發票）────────────────────────────
  if (day >= 1 && day <= 5) {
    const urgent = day >= 4
    const invoicesThisPeriod = invoiceRecords[prevKey] || []
    const uninvoicedCount = invoicesThisPeriod.filter(r => !r.invoiceNo).length
    reminders.push({
      id: `invoice_issue_${prevKey}`,
      level: urgent ? 'urgent' : 'warning',
      icon: '🧾',
      title: '發票開立截止提醒',
      message: `${prevYear} 年 ${prevMon} 月發票請於本月 5 日前完成開立`,
      detail: urgent ? '僅剩不到 2 天，請確認所有發票均已開立！' : `目前已記錄 ${invoicesThisPeriod.length} 張，請於 ${year}/${pad(mon)}/05 前完成`,
      action: { label: '前往對帳', tab: 'invoice' },
    })
  }

  // ── 3. 有銷售但該月尚未建立任何發票記錄──────────────────────────────────
  const salesMonths = new Set()
  for (const r of allRows) {
    if (r.date) salesMonths.add(r.date.slice(0, 7))
  }
  const invoiceMonths = new Set(
    Object.entries(invoiceRecords)
      .filter(([, items]) => items?.length > 0)
      .map(([k]) => k)
  )
  const missingMonths = [...salesMonths]
    .filter(m => m < thisMonthKey && !invoiceMonths.has(m))
    .sort()
    .slice(-3)   // 最多顯示最近 3 個月

  for (const m of missingMonths) {
    const [y, mo] = m.split('-')
    reminders.push({
      id: `missing_invoice_${m}`,
      level: 'info',
      icon: '📋',
      title: '尚未建立發票記錄',
      message: `${y} 年 ${parseInt(mo)} 月有銷售資料，但尚未在對帳系統建立任何發票`,
      detail: '建議確認該月所有發票已開立並記錄，以便對帳追蹤',
      action: { label: '前往對帳', tab: 'invoice' },
    })
  }

  // ── 4. 逾期未入帳發票 ────────────────────────────────────────────────────
  const allInvoices = Object.values(invoiceRecords).flat()
  const overdueList = []
  const warningSoonList = []

  for (const inv of allInvoices) {
    if (inv.status === 'confirmed') continue   // 已入帳不需提醒
    const dueDate = calcDueDate(inv.issueDate, inv.paymentTerm)
    if (!dueDate) continue
    const days = daysFromToday(dueDate)
    if (days < 0) {
      overdueList.push({ ...inv, daysOverdue: Math.abs(days), dueDate })
    } else if (days <= 7) {
      warningSoonList.push({ ...inv, daysLeft: days, dueDate })
    }
  }

  if (overdueList.length > 0) {
    const totalAmt = overdueList.reduce((s, r) => s + (r.amount || 0), 0)
    const worst = [...overdueList].sort((a, b) => b.daysOverdue - a.daysOverdue)[0]
    reminders.push({
      id: 'overdue_invoices',
      level: 'urgent',
      icon: '⚠️',
      title: `${overdueList.length} 張發票逾期未入帳`,
      message: `合計 NT$ ${totalAmt.toLocaleString()} 已超過付款期限`,
      detail: `最長逾期 ${worst.daysOverdue} 天（${worst.store} ${worst.invoiceNo}）`,
      action: { label: '前往查看', tab: 'invoice' },
      items: overdueList.slice(0, 5),
    })
  }

  if (warningSoonList.length > 0) {
    const totalAmt = warningSoonList.reduce((s, r) => s + (r.amount || 0), 0)
    reminders.push({
      id: 'due_soon_invoices',
      level: 'warning',
      icon: '⏰',
      title: `${warningSoonList.length} 張發票即將到期`,
      message: `合計 NT$ ${totalAmt.toLocaleString()} 將在 7 天內到期`,
      detail: warningSoonList.map(r => `${r.store}（${r.daysLeft === 0 ? '今日到期' : `還剩 ${r.daysLeft} 天`}）`).join('、'),
      action: { label: '前往查看', tab: 'invoice' },
    })
  }

  // 按嚴重度排序：urgent → warning → info
  const order = { urgent: 0, warning: 1, info: 2 }
  return reminders.sort((a, b) => order[a.level] - order[b.level])
}

// ─── 單筆提醒卡 ─────────────────────────────────────────────────────────────
const LEVEL_STYLES = {
  urgent:  {
    bg:     'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-300 dark:border-red-700/60',
    icon:   'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400',
    title:  'text-red-800 dark:text-red-200',
    text:   'text-red-700 dark:text-red-300',
    badge:  'bg-red-500 text-white',
    label:  '緊急',
  },
  warning: {
    bg:     'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-700/60',
    icon:   'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400',
    title:  'text-amber-800 dark:text-amber-200',
    text:   'text-amber-700 dark:text-amber-300',
    badge:  'bg-amber-400 text-white',
    label:  '提醒',
  },
  info: {
    bg:     'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-700/60',
    icon:   'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400',
    title:  'text-blue-800 dark:text-blue-200',
    text:   'text-blue-700 dark:text-blue-300',
    badge:  'bg-blue-400 text-white',
    label:  '注意',
  },
}

function ReminderCard({ reminder, onDismiss, onNavigate }) {
  const s = LEVEL_STYLES[reminder.level]
  return (
    <div className={`flex gap-3 p-3 rounded-xl border ${s.bg} ${s.border}`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg ${s.icon}`}>
        {reminder.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badge}`}>
              {LEVEL_STYLES[reminder.level].label}
            </span>
            <span className={`text-sm font-bold ${s.title}`}>{reminder.title}</span>
          </div>
          <button onClick={() => onDismiss(reminder.id)}
            className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-lg leading-none mt-0.5">
            ×
          </button>
        </div>
        <p className={`text-sm mt-0.5 ${s.text}`}>{reminder.message}</p>
        {reminder.detail && (
          <p className={`text-xs mt-0.5 opacity-80 ${s.text}`}>{reminder.detail}</p>
        )}
        {reminder.items && reminder.items.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reminder.items.map(inv => (
              <span key={inv.id}
                className={`text-xs px-2 py-0.5 rounded-full border ${s.border} ${s.text} font-mono`}>
                {inv.store} · {inv.invoiceNo} · {inv.daysOverdue}天
              </span>
            ))}
          </div>
        )}
        {reminder.action && (
          <button onClick={() => onNavigate(reminder.action.tab)}
            className={`mt-2 text-xs font-semibold underline underline-offset-2 ${s.text}`}>
            {reminder.action.label} →
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 主元件 ─────────────────────────────────────────────────────────────────
export default function DashboardReminders({ invoiceRecords = {}, monthlyExpenses = {}, allRows = [], onNavigate }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('dismissed_reminders') || '[]')) }
    catch { return new Set() }
  })
  const [collapsed, setCollapsed] = useState(false)

  const reminders = useMemo(
    () => buildReminders({ invoiceRecords, monthlyExpenses, allRows }),
    [invoiceRecords, monthlyExpenses, allRows]
  )

  const visible = reminders.filter(r => !dismissed.has(r.id))

  const handleDismiss = (id) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      sessionStorage.setItem('dismissed_reminders', JSON.stringify([...next]))
      return next
    })
  }

  const handleDismissAll = () => {
    const ids = visible.map(r => r.id)
    setDismissed(prev => {
      const next = new Set([...prev, ...ids])
      sessionStorage.setItem('dismissed_reminders', JSON.stringify([...next]))
      return next
    })
  }

  if (visible.length === 0) return null

  const urgentCount  = visible.filter(r => r.level === 'urgent').length
  const warningCount = visible.filter(r => r.level === 'warning').length

  return (
    <div className="mx-3 sm:mx-4 mt-2 flex-shrink-0">
      {/* 標題列 */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-xl bg-gray-100 dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 cursor-pointer select-none"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">🔔 待辦提醒</span>
          {urgentCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
              緊急 {urgentCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-white">
              提醒 {warningCount}
            </span>
          )}
          {visible.length > urgentCount + warningCount && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-400 text-white">
              注意 {visible.length - urgentCount - warningCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <button
              onClick={e => { e.stopPropagation(); handleDismissAll() }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              全部關閉
            </button>
          )}
          <span className={`text-gray-400 transition-transform duration-200 text-sm ${collapsed ? '' : 'rotate-180'}`}>▼</span>
        </div>
      </div>

      {/* 提醒卡片列表 */}
      {!collapsed && (
        <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-xl overflow-hidden bg-white dark:bg-gray-900 p-2 space-y-2">
          {visible.map(r => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onDismiss={handleDismiss}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

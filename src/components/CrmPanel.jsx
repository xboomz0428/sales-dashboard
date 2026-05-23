import { useState, useMemo, useCallback } from 'react'
import { useCrm, genCrmId } from '../hooks/useCrm'

// ─── 常數 ─────────────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'contact',     label: '初接觸',  color: 'bg-gray-400'   },
  { id: 'quote',       label: '報價中',  color: 'bg-blue-400'   },
  { id: 'negotiation', label: '洽談中',  color: 'bg-amber-400'  },
  { id: 'won',         label: '已成交',  color: 'bg-emerald-500' },
  { id: 'maintain',    label: '維護期',  color: 'bg-teal-500'   },
  { id: 'lost',        label: '已流失',  color: 'bg-red-400'    },
]

const CLIENT_CATEGORIES = [
  { id: 'chain',  label: '連鎖店', icon: '🏬' },
  { id: 'brand',  label: '品牌店', icon: '🏷️' },
  { id: 'studio', label: '工作室', icon: '✂️' },
]

const LOG_METHODS = [
  { id: 'call',  label: '電話', icon: '📞' },
  { id: 'visit', label: '拜訪', icon: '🤝' },
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'line',  label: 'LINE', icon: '💬' },
  { id: 'other', label: '其他', icon: '•'  },
]

function todayStr() { return new Date().toISOString().slice(0, 10) }
function fmtMoney(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}
function stageInfo(id) { return STAGES.find(s => s.id === id) || STAGES[0] }
function catInfo(id)   { return CLIENT_CATEGORIES.find(c => c.id === id) || CLIENT_CATEGORIES[2] }

// ─── 獎金計算邏輯 ─────────────────────────────────────────────────────────────
function applyTiers(amount, tiers) {
  if (!tiers?.length || amount <= 0) return 0
  const sorted = [...tiers].sort((a, b) => b.min - a.min)
  const tier = sorted.find(t => amount >= t.min)
  return tier ? Math.round(amount * tier.rate) : 0
}

function calcBonus(assigneeUid, contacts, invoices, bonusPlans, year, month) {
  const plan = bonusPlans.find(p => p.uid === assigneeUid)
  if (!plan) return null

  // 取得該業務員負責的客戶名稱集合
  const myClients = contacts.filter(c => c.assigneeUid === assigneeUid && c.type === 'client')
  const nameSet = new Set(myClients.flatMap(c => [c.name].filter(Boolean)))

  // 月合計 confirmedAmount
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const monthItems = invoices[monthKey] || []
  const monthTotal = monthItems
    .filter(r => nameSet.has(r.store) || nameSet.has(r.billingName))
    .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)

  // 年合計
  const yearTotal = Object.entries(invoices)
    .filter(([k]) => k.startsWith(year + '-'))
    .flatMap(([, items]) => items)
    .filter(r => nameSet.has(r.store) || nameSet.has(r.billingName))
    .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)

  // 月獎金
  const monthBonus = plan.monthlyEnabled ? applyTiers(monthTotal, plan.monthlyTiers) : 0

  // 年獎金
  const annualBonus = plan.annualEnabled ? applyTiers(yearTotal, plan.annualTiers) : 0

  // 開發獎金：已成交的潛在客戶，累積 confirmedAmount >= devThreshold
  const wonProspects = contacts.filter(c =>
    c.assigneeUid === assigneeUid && c.type === 'prospect' && c.stage === 'won' && c.wonAt
  )
  const devBonusItems = wonProspects.map(c => {
    const nameMatch = new Set([c.name].filter(Boolean))
    const cumulative = Object.entries(invoices)
      .filter(([k]) => k >= c.wonAt.slice(0, 7))
      .flatMap(([, items]) => items)
      .filter(r => nameMatch.has(r.store) || nameMatch.has(r.billingName))
      .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)
    const cat = c.clientCategory || 'studio'
    const reward = cat === 'chain' ? plan.devChain : cat === 'brand' ? plan.devBrand : plan.devStudio
    const triggered = plan.devEnabled && cumulative >= plan.devThreshold
    return { contact: c, cumulative, reward, triggered, cat }
  })

  return { monthTotal, yearTotal, monthBonus, annualBonus, devBonusItems, plan }
}

// ─── 聯絡 Log 表單 ────────────────────────────────────────────────────────────
function LogForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ date: todayStr(), method: 'call', summary: '', nextAction: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2 border border-blue-100 dark:border-blue-800">
      <div className="flex gap-2">
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200" />
        <select value={form.method} onChange={e => set('method', e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
          {LOG_METHODS.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
        </select>
      </div>
      <textarea value={form.summary} onChange={e => set('summary', e.target.value)}
        placeholder="聯絡摘要" rows={2}
        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200 resize-none" />
      <input value={form.nextAction} onChange={e => set('nextAction', e.target.value)}
        placeholder="下次行動（選填）"
        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200" />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">取消</button>
        <button onClick={() => { if (form.summary.trim()) onAdd({ ...form, id: genCrmId() }) }}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">新增記錄</button>
      </div>
    </div>
  )
}

// ─── 聯絡人詳情 Drawer ────────────────────────────────────────────────────────
function ContactDrawer({ contact, onClose, onSave, onDelete, userName, isAdmin }) {
  const [form, setForm]       = useState({ ...contact })
  const [addingLog, setAddingLog] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleWon = () => {
    set('stage', 'won')
    set('type', 'client')
    if (!form.wonAt) set('wonAt', todayStr())
  }

  const handleAddLog = (log) => {
    const newLogs = [{ ...log, byName: userName }, ...(form.logs || [])]
    setForm(p => ({ ...p, logs: newLogs }))
    setAddingLog(false)
  }

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  const si = stageInfo(form.stage)
  const ci = catInfo(form.clientCategory)

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{form.name || '新聯絡人'}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${si.color}`}>{si.label}</span>
              <span className="text-xs text-gray-400">{ci.icon} {ci.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 基本資料 */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">基本資料</p>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="客戶 / 公司名稱"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.clientCategory} onChange={e => set('clientCategory', e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {CLIENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="電話"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">下次 Follow-up</label>
                <input type="date" value={form.nextFollowup} onChange={e => set('nextFollowup', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
              </div>
              {(form.type === 'prospect' && form.stage === 'won') || form.wonAt ? (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">成交日期</label>
                  <input type="date" value={form.wonAt} onChange={e => set('wonAt', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
                </div>
              ) : null}
            </div>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} placeholder="備註" rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 resize-none" />
          </section>

          {/* 快速動作 */}
          {form.type === 'prospect' && form.stage !== 'won' && form.stage !== 'lost' && (
            <button onClick={handleWon}
              className="w-full py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
              🎉 標記成交 → 轉為現有客戶
            </button>
          )}

          {/* 聯絡紀錄 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">聯絡紀錄</p>
              <button onClick={() => setAddingLog(v => !v)}
                className="text-xs px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-semibold transition-colors">
                ＋ 新增記錄
              </button>
            </div>
            {addingLog && <LogForm onAdd={handleAddLog} onCancel={() => setAddingLog(false)} />}
            <div className="space-y-2">
              {(form.logs || []).length === 0 && !addingLog && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">尚無聯絡紀錄</p>
              )}
              {(form.logs || []).map(log => {
                const m = LOG_METHODS.find(x => x.id === log.method) || LOG_METHODS[4]
                return (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm">{m.icon}</div>
                      <div className="w-px flex-1 bg-gray-100 dark:bg-gray-700 mt-1" />
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{log.date}</span>
                        <span className="text-xs text-gray-400">{m.label}</span>
                        {log.byName && <span className="text-xs text-gray-300 dark:text-gray-600">· {log.byName}</span>}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{log.summary}</p>
                      {log.nextAction && (
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">→ {log.nextAction}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button onClick={() => setConfirmDel(v => !v)}
            className="px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm transition-colors">
            {confirmDel ? '確認刪除？' : '刪除'}
          </button>
          {confirmDel && (
            <button onClick={() => { onDelete(contact.id); onClose() }}
              className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">確定刪除</button>
          )}
          <button onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 新增聯絡人表單（Modal）────────────────────────────────────────────────────
function NewContactModal({ type, onClose, onSave, user }) {
  const [form, setForm] = useState({
    name: '', clientCategory: 'studio', stage: 'contact',
    phone: '', email: '', note: '', nextFollowup: '', wonAt: '',
    type, assigneeUid: user?.id || '', assigneeName: user?.user_metadata?.name || user?.email || '',
    logs: [],
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          新增{type === 'prospect' ? '潛在客戶' : '現有客戶'}
        </h3>
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="客戶 / 公司名稱 *"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.clientCategory} onChange={e => set('clientCategory', e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
            {CLIENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          {type === 'prospect' && (
            <select value={form.stage} onChange={e => set('stage', e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
              {STAGES.filter(s => !['maintain'].includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
        </div>
        <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="電話"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">取消</button>
          <button onClick={() => { if (form.name.trim()) { onSave(form); onClose() } }}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">新增</button>
        </div>
      </div>
    </div>
  )
}

// ─── 獎金方案編輯器（老闆用）──────────────────────────────────────────────────
function PlanEditor({ plan, onSave, onClose }) {
  const [form, setForm] = useState({ ...plan })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setTier = (type, idx, field, val) => {
    setForm(p => {
      const tiers = [...(p[type] || [])]
      tiers[idx] = { ...tiers[idx], [field]: Number(val) || 0 }
      return { ...p, [type]: tiers }
    })
  }
  const fmtRate = (r) => `${(r * 100).toFixed(1)}%`

  const inputCls = "w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">獎金方案 — {plan.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* 開發獎金 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">開發獎金</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative w-8 h-4">
                <input type="checkbox" className="sr-only peer" checked={form.devEnabled} onChange={e => set('devEnabled', e.target.checked)} />
                <div className="w-8 h-4 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs text-gray-400">啟用</span>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['devChain','連鎖店'],['devBrand','品牌店'],['devStudio','工作室']].map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}（元）</label>
                <input type="number" value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">觸發門檻 — 成交客戶累積入帳 ≥（元）</label>
            <input type="number" value={form.devThreshold} onChange={e => set('devThreshold', e.target.value)} className={inputCls} />
          </div>
        </section>

        <hr className="border-gray-100 dark:border-gray-800" />

        {/* 月獎金 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">月採購獎金（3 層）</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative w-8 h-4">
                <input type="checkbox" className="sr-only peer" checked={form.monthlyEnabled} onChange={e => set('monthlyEnabled', e.target.checked)} />
                <div className="w-8 h-4 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs text-gray-400">啟用</span>
            </label>
          </div>
          <div className="space-y-2">
            {(form.monthlyTiers || []).map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-400">月入帳 ≥（元）</label>
                  <input type="number" value={tier.min} onChange={e => setTier('monthlyTiers', i, 'min', e.target.value)} className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400">獎金率 → {fmtRate(tier.rate)}</label>
                  <input type="number" step="0.001" min="0" max="1" value={tier.rate} onChange={e => setTier('monthlyTiers', i, 'rate', e.target.value)} className={inputCls} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100 dark:border-gray-800" />

        {/* 年獎金 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">年度獎金（2 層）</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative w-8 h-4">
                <input type="checkbox" className="sr-only peer" checked={form.annualEnabled} onChange={e => set('annualEnabled', e.target.checked)} />
                <div className="w-8 h-4 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs text-gray-400">啟用</span>
            </label>
          </div>
          <div className="space-y-2">
            {(form.annualTiers || []).map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-400">年入帳 ≥（元）</label>
                  <input type="number" value={tier.min} onChange={e => setTier('annualTiers', i, 'min', e.target.value)} className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400">獎金率 → {fmtRate(tier.rate)}</label>
                  <input type="number" step="0.001" min="0" max="1" value={tier.rate} onChange={e => setTier('annualTiers', i, 'rate', e.target.value)} className={inputCls} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
          <button onClick={() => { onSave(form); onClose() }}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">儲存方案</button>
        </div>
      </div>
    </div>
  )
}

// ─── 聯絡人卡片清單 ───────────────────────────────────────────────────────────
function ContactCard({ contact, onClick, daysUntilFollowup }) {
  const si = stageInfo(contact.stage)
  const ci = catInfo(contact.clientCategory)
  const today = todayStr()
  const overdue = contact.nextFollowup && contact.nextFollowup < today
  const dueSoon = contact.nextFollowup && !overdue && daysUntilFollowup <= 3

  return (
    <div onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${si.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{contact.name}</span>
          <span className="text-xs text-gray-400">{ci.icon}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{si.label}</span>
          {contact.assigneeName && (
            <span className="text-xs text-gray-300 dark:text-gray-600">· {contact.assigneeName}</span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {contact.nextFollowup ? (
          <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            overdue ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
            dueSoon ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' :
            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {overdue ? '已逾期' : `${daysUntilFollowup}天後`}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── 主元件 ───────────────────────────────────────────────────────────────────
export default function CrmPanel({ user, role, invoices = {} }) {
  const isAdmin = role === 'admin' || role === 'manager'
  const userName = user?.user_metadata?.name || user?.email || '我'

  const { contacts, bonusPlans, saveContact, deleteContact, saveBonusPlan } = useCrm(user)

  const [subTab, setSubTab]   = useState('prospects')
  const [search, setSearch]   = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [selectedContact, setSelectedContact] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [editPlan, setEditPlan] = useState(null)

  // 獎金計算用
  const now = new Date()
  const [bonusYear,  setBonusYear]  = useState(now.getFullYear())
  const [bonusMonth, setBonusMonth] = useState(now.getMonth() + 1)
  const [viewUid,    setViewUid]    = useState(user?.id || '')

  // 過濾顯示的聯絡人（非 admin 只看自己的）
  const myContacts = useMemo(() => {
    return isAdmin ? contacts : contacts.filter(c => c.assigneeUid === user?.id)
  }, [contacts, isAdmin, user?.id])

  const today = todayStr()
  const getDays = (dateStr) => {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr) - new Date(today)) / 86400000)
  }

  const filtered = useMemo(() => {
    const list = myContacts.filter(c => {
      const matchType = subTab === 'prospects' ? c.type === 'prospect' : c.type === 'client'
      const matchStage = stageFilter === 'all' || c.stage === stageFilter
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search) || (c.assigneeName || '').includes(search)
      return matchType && matchStage && matchSearch
    })
    return list.sort((a, b) => {
      if (a.nextFollowup && b.nextFollowup) return a.nextFollowup.localeCompare(b.nextFollowup)
      if (a.nextFollowup) return -1
      if (b.nextFollowup) return 1
      return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    })
  }, [myContacts, subTab, stageFilter, search])

  // 待辦 follow-up 統計
  const overdueCount = useMemo(() =>
    myContacts.filter(c => c.nextFollowup && c.nextFollowup < today).length
  , [myContacts, today])

  // 獎金計算
  const bonusResult = useMemo(() => {
    const uid = isAdmin ? viewUid : (user?.id || '')
    if (!uid) return null
    return calcBonus(uid, contacts, invoices, bonusPlans, String(bonusYear), bonusMonth)
  }, [viewUid, user?.id, contacts, invoices, bonusPlans, bonusYear, bonusMonth, isAdmin])

  // 老闆模式：所有業務員清單（從 contacts 取得唯一 assignee）
  const allAssignees = useMemo(() => {
    const map = new Map()
    contacts.forEach(c => {
      if (c.assigneeUid && !map.has(c.assigneeUid)) {
        map.set(c.assigneeUid, c.assigneeName || c.assigneeUid)
      }
    })
    bonusPlans.forEach(p => {
      if (p.uid && !map.has(p.uid)) {
        map.set(p.uid, p.name || p.uid)
      }
    })
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }))
  }, [contacts, bonusPlans])

  const handleSaveContact = useCallback((c) => {
    const saved = saveContact(c)
    if (selectedContact && saved) {
      setSelectedContact(null)
    }
  }, [saveContact, selectedContact])

  const getOrCreatePlan = (uid, name) => {
    return bonusPlans.find(p => p.uid === uid) || {
      uid, name,
      devChain: 5000, devBrand: 3000, devStudio: 1000,
      devThreshold: 500000, devEnabled: true,
      monthlyTiers: [{ min: 0, rate: 0.01 }, { min: 500000, rate: 0.015 }, { min: 1000000, rate: 0.02 }],
      monthlyEnabled: true,
      annualTiers: [{ min: 0, rate: 0.005 }, { min: 5000000, rate: 0.01 }],
      annualEnabled: true,
    }
  }

  const subTabCls = (id) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${subTab === id
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">業務管理中心</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            客戶開發 · 聯絡紀錄 · 獎金計算
            {overdueCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-xs font-semibold">
                {overdueCount} 筆逾期
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <button onClick={() => setSubTab('prospects')} className={subTabCls('prospects')}>🌱 開發中</button>
          <button onClick={() => setSubTab('clients')} className={subTabCls('clients')}>🏪 現有客戶</button>
          <button onClick={() => setSubTab('bonus')} className={subTabCls('bonus')}>💰 獎金</button>
        </div>
      </div>

      {/* ── 潛在客戶 / 現有客戶 ── */}
      {(subTab === 'prospects' || subTab === 'clients') && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* 工具列 */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋客戶名稱..."
              className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200" />
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
              <option value="all">全部階段</option>
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              ＋ 新增
            </button>
          </div>

          {/* 漏斗摘要（潛在客戶）*/}
          {subTab === 'prospects' && (
            <div className="flex border-b border-gray-50 dark:border-gray-800 overflow-x-auto">
              {STAGES.filter(s => !['maintain'].includes(s.id)).map(s => {
                const cnt = myContacts.filter(c => c.type === 'prospect' && c.stage === s.id).length
                return (
                  <button key={s.id} onClick={() => setStageFilter(stageFilter === s.id ? 'all' : s.id)}
                    className={`flex-1 min-w-[80px] py-2 text-center transition-colors ${stageFilter === s.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                    <div className={`text-lg font-bold ${cnt > 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>{cnt}</div>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                      <span className="text-xs text-gray-400">{s.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 清單 */}
          <div className="divide-y divide-transparent">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-gray-500">
                {search || stageFilter !== 'all' ? '找不到符合條件的記錄' : '尚無資料，點擊「＋ 新增」開始'}
              </div>
            ) : filtered.map(c => (
              <ContactCard key={c.id} contact={c} daysUntilFollowup={getDays(c.nextFollowup)}
                onClick={() => setSelectedContact(c)} />
            ))}
          </div>

          <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-800">
            <span className="text-xs text-gray-400">共 {filtered.length} 筆</span>
          </div>
        </div>
      )}

      {/* ── 獎金計算 ── */}
      {subTab === 'bonus' && (
        <div className="space-y-4">
          {/* 選擇業務員（老闆模式）*/}
          {isAdmin && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">👔 老闆模式</span>
              <select value={viewUid} onChange={e => setViewUid(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                <option value="">— 選擇業務員 —</option>
                {allAssignees.map(a => <option key={a.uid} value={a.uid}>{a.name}</option>)}
              </select>
              {viewUid && (
                <button onClick={() => setEditPlan(getOrCreatePlan(viewUid, allAssignees.find(a => a.uid === viewUid)?.name || ''))}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                  ⚙️ 設定獎金方案
                </button>
              )}
            </div>
          )}

          {/* 月份 / 年份選擇 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">年度</label>
              <select value={bonusYear} onChange={e => setBonusYear(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
                  <option key={y} value={y}>{y} 年</option>
                )}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">月份</label>
              <select value={bonusMonth} onChange={e => setBonusMonth(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {Array.from({length: 12}, (_, i) => i + 1).map(m =>
                  <option key={m} value={m}>{m} 月</option>
                )}
              </select>
            </div>
          </div>

          {!bonusResult ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                {isAdmin && !viewUid ? '請先選擇業務員' : '尚未設定獎金方案，請老闆至上方設定'}
              </p>
            </div>
          ) : (
            <>
              {/* 獎金摘要卡片 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '月入帳合計', value: bonusResult.monthTotal, color: 'text-gray-700 dark:text-gray-200', sub: `${bonusYear} 年 ${bonusMonth} 月` },
                  { label: '月採購獎金', value: bonusResult.monthBonus, color: 'text-blue-600 dark:text-blue-400', sub: bonusResult.plan.monthlyEnabled ? `費率 ${bonusResult.monthlyRate ?? '—'}` : '未啟用' },
                  { label: '年度入帳合計', value: bonusResult.yearTotal, color: 'text-gray-700 dark:text-gray-200', sub: `${bonusYear} 年累積` },
                  { label: '年度獎金（試算）', value: bonusResult.annualBonus, color: 'text-emerald-600 dark:text-emerald-400', sub: bonusResult.plan.annualEnabled ? '全年入帳計算' : '未啟用' },
                ].map(card => (
                  <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{card.label}</p>
                    <p className={`text-xl font-bold font-mono ${card.color}`}>{fmtMoney(card.value)}</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* 月獎金階梯說明 */}
              {bonusResult.plan.monthlyEnabled && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">月採購獎金階梯</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {[...bonusResult.plan.monthlyTiers].sort((a, b) => a.min - b.min).map((tier, i, arr) => {
                      const isActive = bonusResult.monthTotal >= tier.min &&
                        (i === arr.length - 1 || bonusResult.monthTotal < arr[i + 1].min)
                      return (
                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                          <div className="flex items-center gap-2">
                            {isActive && <span className="text-blue-500 text-xs font-bold">▶</span>}
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {fmtMoney(tier.min)} 以上
                            </span>
                          </div>
                          <span className={`text-sm font-semibold ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                            {(tier.rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 開發獎金 */}
              {bonusResult.plan.devEnabled && bonusResult.devBonusItems.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">開發獎金（成交客戶追蹤）</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {bonusResult.devBonusItems.map(item => {
                      const ci = catInfo(item.cat)
                      const reward = item.cat === 'chain' ? bonusResult.plan.devChain :
                        item.cat === 'brand' ? bonusResult.plan.devBrand : bonusResult.plan.devStudio
                      return (
                        <div key={item.contact.id} className={`flex items-center justify-between px-4 py-3 ${item.triggered ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.contact.name}</span>
                              <span className="text-xs text-gray-400">{ci.icon} {ci.label}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              累積入帳 {fmtMoney(item.cumulative)} / 門檻 {fmtMoney(bonusResult.plan.devThreshold)}
                            </div>
                          </div>
                          <div className="text-right">
                            {item.triggered ? (
                              <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-bold">
                                🎉 +{reward.toLocaleString()} 元
                              </span>
                            ) : (
                              <div className="text-xs text-gray-400">
                                還差 {fmtMoney(bonusResult.plan.devThreshold - item.cumulative)}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 老闆：所有業務員月獎金總覽 */}
              {isAdmin && allAssignees.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      所有業務員 — {bonusYear} 年 {bonusMonth} 月 獎金總覽
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">業務員</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">月入帳</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">月獎金</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">年獎金</th>
                        <th className="text-center px-4 py-2 text-xs font-medium text-gray-400">方案</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {allAssignees.map(a => {
                        const r = calcBonus(a.uid, contacts, invoices, bonusPlans, String(bonusYear), bonusMonth)
                        return (
                          <tr key={a.uid} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${viewUid === a.uid ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                            <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200">{a.name}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">{r ? fmtMoney(r.monthTotal) : '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">{r ? fmtMoney(r.monthBonus) : '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{r ? fmtMoney(r.annualBonus) : '—'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => setEditPlan(getOrCreatePlan(a.uid, a.name))}
                                className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                設定
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Drawers / Modals ── */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onSave={handleSaveContact}
          onDelete={deleteContact}
          userName={userName}
          isAdmin={isAdmin}
        />
      )}
      {showNew && (
        <NewContactModal
          type={subTab === 'clients' ? 'client' : 'prospect'}
          onClose={() => setShowNew(false)}
          onSave={saveContact}
          user={user}
        />
      )}
      {editPlan && (
        <PlanEditor
          plan={editPlan}
          onSave={saveBonusPlan}
          onClose={() => setEditPlan(null)}
        />
      )}
    </div>
  )
}

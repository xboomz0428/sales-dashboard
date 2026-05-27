import { useState, useMemo, useCallback } from 'react'
import { useCrm, genCrmId } from '../hooks/useCrm'

// ─── 常數 ─────────────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'contact',     label: '初接觸',  color: 'bg-gray-400'    },
  { id: 'quote',       label: '報價中',  color: 'bg-blue-400'    },
  { id: 'negotiation', label: '洽談中',  color: 'bg-amber-400'   },
  { id: 'won',         label: '已成交',  color: 'bg-emerald-500' },
  { id: 'maintain',    label: '維護期',  color: 'bg-teal-500'    },
  { id: 'lost',        label: '已流失',  color: 'bg-red-400'     },
]

const CLIENT_CATEGORIES = [
  { id: 'chain',  label: '連鎖店', icon: '🏬' },
  { id: 'brand',  label: '品牌店', icon: '🏷️' },
  { id: 'studio', label: '工作室', icon: '✂️' },
]

const SCALES = ['個人工作室', '微型（1-5人）', '小型（6-20人）', '中型（21-100人）', '大型連鎖（100人以上）']

const LOG_METHODS = [
  { id: 'call',  label: '電話',  icon: '📞' },
  { id: 'visit', label: '拜訪',  icon: '🤝' },
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'line',  label: 'LINE',  icon: '💬' },
  { id: 'other', label: '其他',  icon: '•'  },
]

// ─── 工具函數 ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10) }
function fmtMoney(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}
function fmtFull(v) {
  if (!v && v !== 0) return '—'
  return Math.round(v).toLocaleString() + ' 元'
}
function stageInfo(id) { return STAGES.find(s => s.id === id) || STAGES[0] }
function catInfo(id)   { return CLIENT_CATEGORIES.find(c => c.id === id) || CLIENT_CATEGORIES[2] }

// ─── 獎金計算 ─────────────────────────────────────────────────────────────────
function applyTiers(amount, tiers) {
  if (!tiers?.length || amount <= 0) return 0
  const sorted = [...tiers].sort((a, b) => b.min - a.min)
  const tier = sorted.find(t => amount >= t.min)
  return tier ? Math.round(amount * tier.rate) : 0
}

// 反推：要獲得 targetBonus，至少需要多少業績
function reverseCalcSales(targetBonus, tiers) {
  if (!tiers?.length || targetBonus <= 0) return null
  const sorted = [...tiers].sort((a, b) => a.min - b.min)
  // 產生候選業績（各層 min + 各層反推值）
  const candidates = []
  sorted.forEach(t => {
    if (t.rate > 0) candidates.push(Math.ceil(targetBonus / t.rate))
    if (t.min > 0) candidates.push(t.min)
  })
  candidates.sort((a, b) => a - b)
  for (const c of candidates) {
    if (c > 0 && applyTiers(c, tiers) >= targetBonus) return c
  }
  // 超出最高層時，以最高費率反推
  const best = sorted[sorted.length - 1]
  return best.rate > 0 ? Math.ceil(targetBonus / best.rate) : null
}

function getQuarter(month) { return Math.floor((month - 1) / 3) + 1 }
function quarterMonthKeys(year, month) {
  const q = getQuarter(month)
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => `${year}-${String(start + i).padStart(2, '0')}`)
}

function calcBonus(assigneeUid, contacts, invoices, bonusPlans, year, month) {
  const plan = bonusPlans.find(p => p.uid === assigneeUid)
  if (!plan) return null

  const myClients = contacts.filter(c => c.assigneeUid === assigneeUid && c.type === 'client')
  const nameSet = new Set(myClients.flatMap(c => [c.name].filter(Boolean)))

  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const monthTotal = (invoices[monthKey] || [])
    .filter(r => nameSet.has(r.store) || nameSet.has(r.billingName))
    .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)

  // 季度合計
  const qKeys = quarterMonthKeys(year, month)
  const quarterTotal = qKeys
    .flatMap(k => invoices[k] || [])
    .filter(r => nameSet.has(r.store) || nameSet.has(r.billingName))
    .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)

  const yearTotal = Object.entries(invoices)
    .filter(([k]) => k.startsWith(year + '-'))
    .flatMap(([, items]) => items)
    .filter(r => nameSet.has(r.store) || nameSet.has(r.billingName))
    .reduce((s, r) => s + (r.confirmedAmount ?? 0), 0)

  const monthBonus    = plan.monthlyEnabled   ? applyTiers(monthTotal,   plan.monthlyTiers)   : 0
  const quarterBonus  = plan.quarterlyEnabled ? applyTiers(quarterTotal, plan.quarterlyTiers) : 0
  const annualBonus   = plan.annualEnabled    ? applyTiers(yearTotal,    plan.annualTiers)    : 0

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
    const cat    = c.clientCategory || 'studio'
    const reward = cat === 'chain' ? plan.devChain : cat === 'brand' ? plan.devBrand : plan.devStudio
    return { contact: c, cumulative, reward, triggered: plan.devEnabled && cumulative >= plan.devThreshold, cat }
  })

  return { monthTotal, quarterTotal, yearTotal, monthBonus, quarterBonus, annualBonus, devBonusItems, plan, quarter: getQuarter(month) }
}

// ─── Input 共用樣式 ───────────────────────────────────────────────────────────
const inp = 'w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 min-h-[44px]'
const inpSm = 'w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200'

// ─── 聯絡 Log 表單 ────────────────────────────────────────────────────────────
function LogForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ date: todayStr(), method: 'call', summary: '', nextAction: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2 border border-blue-100 dark:border-blue-800">
      <div className="flex gap-2">
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={`flex-1 ${inpSm}`} />
        <select value={form.method} onChange={e => set('method', e.target.value)} className={inpSm} style={{width:'auto'}}>
          {LOG_METHODS.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
        </select>
      </div>
      <textarea value={form.summary} onChange={e => set('summary', e.target.value)}
        placeholder="聯絡摘要" rows={2} className={`${inpSm} resize-none`} />
      <input value={form.nextAction} onChange={e => set('nextAction', e.target.value)}
        placeholder="下次行動（選填）" className={inpSm} />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">取消</button>
        <button onClick={() => { if (form.summary.trim()) onAdd({ ...form, id: genCrmId() }) }}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">新增記錄</button>
      </div>
    </div>
  )
}

// ─── 薪資模擬器 ───────────────────────────────────────────────────────────────
function SalarySim({ plan }) {
  const [base,      setBase]      = useState('')
  const [simM,      setSimM]      = useState('')
  const [simY,      setSimY]      = useState('')
  const [simDevCat, setSimDevCat] = useState('studio')
  const [simDevCum, setSimDevCum] = useState('')
  const [targetY,   setTargetY]   = useState('')
  const [showRev,   setShowRev]   = useState(false)

  const baseN  = Number(base)      || 0
  const simMN  = Number(simM)      || 0
  const simYN  = Number(simY)      || 0
  const simDCN = Number(simDevCum) || 0
  const targetN = Number(targetY)  || 0

  const mBonus  = plan?.monthlyEnabled  ? applyTiers(simMN, plan?.monthlyTiers  || []) : 0
  const yBonus  = plan?.annualEnabled   ? applyTiers(simYN, plan?.annualTiers   || []) : 0

  // 開發獎金模擬
  const devReward = simDevCat === 'chain' ? (plan?.devChain || 0)
    : simDevCat === 'brand' ? (plan?.devBrand || 0) : (plan?.devStudio || 0)
  const devTriggered = plan?.devEnabled && simDCN >= (plan?.devThreshold || 0)
  const devThreshold = plan?.devThreshold || 0

  const mTotal = baseN + mBonus
  const yTotal = baseN * 12 + yBonus

  // 反推計算
  const neededBonus   = Math.max(0, targetN - baseN * 12)
  const reqAnnualSales = reverseCalcSales(neededBonus, plan?.annualTiers || [])
  const reqMonthBonus  = neededBonus / 12
  const reqMonthlySales = reverseCalcSales(reqMonthBonus, plan?.monthlyTiers || [])

  const row = (label, val, highlight, color) => (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${highlight ? (color || 'bg-blue-50 dark:bg-blue-900/20') : ''}`}>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-bold font-mono ${highlight ? (color ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400') : 'text-gray-700 dark:text-gray-200'}`}>{fmtFull(val)}</span>
    </div>
  )

  const tierTable = (tiers, simVal, color) => {
    if (!tiers?.length || !simVal) return null
    const sorted = [...tiers].sort((a,b)=>a.min-b.min)
    return (
      <div className="text-xs text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-0.5">
        {sorted.map((t, i) => {
          const nextMin = sorted[i+1]?.min
          const active  = simVal >= t.min && (nextMin === undefined || simVal < nextMin)
          return (
            <div key={i} className={`flex justify-between ${active ? color + ' font-semibold' : ''}`}>
              <span>{fmtMoney(t.min)} 以上</span>
              <span>{(t.rate*100).toFixed(1)}%{active?' ◀ 適用':''}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 底薪 */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">底薪（元 / 月）</label>
        <input type="number" value={base} onChange={e => setBase(e.target.value)}
          placeholder="例：35000" className={inp} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 月模擬 */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">月度模擬</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">模擬月銷售（元）</label>
            <input type="number" value={simM} onChange={e => setSimM(e.target.value)}
              placeholder="例：800000" className={inpSm} />
          </div>
          <div className="space-y-1">
            {row('底薪', baseN)}
            {row('月採購獎金', mBonus)}
            {row('月收入合計', mTotal, true)}
          </div>
          {tierTable(plan?.monthlyTiers, simMN, 'text-blue-500')}
        </div>

        {/* 年模擬 */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">年度模擬</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">模擬年銷售（元）</label>
            <input type="number" value={simY} onChange={e => setSimY(e.target.value)}
              placeholder="例：10000000" className={inpSm} />
          </div>
          <div className="space-y-1">
            {row('底薪 × 12', baseN * 12)}
            {row('年度獎金', yBonus)}
            {row('年收入合計', yTotal, true, 'bg-emerald-50 dark:bg-emerald-900/20')}
          </div>
          {tierTable(plan?.annualTiers, simYN, 'text-emerald-500')}
        </div>
      </div>

      {/* 開發獎金模擬 */}
      {plan?.devEnabled && (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">開發獎金模擬</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">客戶類別</label>
              <select value={simDevCat} onChange={e => setSimDevCat(e.target.value)} className={inpSm}>
                {CLIENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">目前累積入帳（元）</label>
              <input type="number" value={simDevCum} onChange={e => setSimDevCum(e.target.value)}
                placeholder="例：300000" className={inpSm} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">觸發門檻</span>
              <span className="font-mono text-gray-700 dark:text-gray-200">{fmtFull(devThreshold)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">本類別獎金</span>
              <span className="font-mono text-gray-700 dark:text-gray-200">{fmtFull(devReward)}</span>
            </div>
            {simDevCum && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg mt-1 ${devTriggered ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                <span className="text-sm font-semibold">{devTriggered ? '🎉 已達觸發條件' : `還差 ${fmtFull(devThreshold - simDCN)}`}</span>
                <span className={`text-sm font-bold font-mono ${devTriggered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {devTriggered ? `+${fmtFull(devReward)}` : '—'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 反推計算 */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
        <button onClick={() => setShowRev(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
          🎯 反推業績目標 {showRev ? '▲' : '▼'}
        </button>
        {showRev && (
          <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-4">
            <p className="text-xs text-amber-700 dark:text-amber-300">輸入目標年薪，自動計算每月需要達成的業績</p>
            <div>
              <label className="text-xs text-amber-600 dark:text-amber-400 mb-1 block">目標年薪（元）</label>
              <input type="number" value={targetY} onChange={e => setTargetY(e.target.value)}
                placeholder="例：1200000（年薪120萬）" className={inp} />
            </div>
            {targetN > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">底薪收入（年）</span>
                  <span className="font-mono text-gray-700 dark:text-gray-200">{fmtFull(baseN * 12)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">需要獎金收入（年）</span>
                  <span className="font-mono text-gray-700 dark:text-gray-200">{fmtFull(neededBonus)}</span>
                </div>
                <hr className="border-amber-200 dark:border-amber-800" />
                {/* 年獎金反推 */}
                {plan?.annualEnabled && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${reqAnnualSales ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-700'}`}>
                    <div>
                      <p className="text-xs text-gray-400">方案一：以年度獎金達成</p>
                      <p className="text-xs text-gray-400">（年業績一次計算）</p>
                    </div>
                    <div className="text-right">
                      {reqAnnualSales ? (
                        <>
                          <p className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">年業績 ≥ {fmtMoney(reqAnnualSales)}</p>
                          <p className="text-xs text-gray-400">月均 {fmtMoney(Math.ceil(reqAnnualSales / 12))}</p>
                        </>
                      ) : <p className="text-xs text-gray-400">無法以此方案達成</p>}
                    </div>
                  </div>
                )}
                {/* 月獎金反推 */}
                {plan?.monthlyEnabled && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${reqMonthlySales ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-700'}`}>
                    <div>
                      <p className="text-xs text-gray-400">方案二：以月採購獎金達成</p>
                      <p className="text-xs text-gray-400">（每月穩定達標）</p>
                    </div>
                    <div className="text-right">
                      {reqMonthlySales ? (
                        <>
                          <p className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">月業績 ≥ {fmtMoney(reqMonthlySales)}</p>
                          <p className="text-xs text-gray-400">年合計 {fmtMoney(reqMonthlySales * 12)}</p>
                        </>
                      ) : <p className="text-xs text-gray-400">無法以此方案達成</p>}
                    </div>
                  </div>
                )}
                <p className="text-xs text-amber-600 dark:text-amber-400">※ 開發獎金可額外加成，不含於上述計算</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 聯絡窗口管理 ─────────────────────────────────────────────────────────────
function ContactPersons({ value, onChange }) {
  const persons = value || []
  const add = () => onChange([...persons, { id: genCrmId(), name: '', title: '', phone: '', line: '', email: '' }])
  const remove = (id) => onChange(persons.filter(p => p.id !== id))
  const update = (id, field, val) => onChange(persons.map(p => p.id === id ? { ...p, [field]: val } : p))

  return (
    <div className="space-y-3">
      {persons.map((p) => (
        <div key={p.id} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500">窗口</span>
            <button onClick={() => remove(p.id)} className="text-xs text-red-400 hover:text-red-600">移除</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={p.name} onChange={e => update(p.id, 'name', e.target.value)}
              placeholder="姓名" className={inpSm} />
            <input value={p.title} onChange={e => update(p.id, 'title', e.target.value)}
              placeholder="職務名稱" className={inpSm} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={p.phone} onChange={e => update(p.id, 'phone', e.target.value)}
              placeholder="電話" className={inpSm} />
            <input value={p.line} onChange={e => update(p.id, 'line', e.target.value)}
              placeholder="LINE ID" className={inpSm} />
          </div>
          <input value={p.email} onChange={e => update(p.id, 'email', e.target.value)}
            placeholder="Email" className={inpSm} />
        </div>
      ))}
      <button onClick={add}
        className="w-full py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
        ＋ 新增聯絡窗口
      </button>
    </div>
  )
}

// ─── 聯絡人詳情 Drawer ────────────────────────────────────────────────────────
function ContactDrawer({ contact, onClose, onSave, onDelete, userName }) {
  const [form, setForm]       = useState({ ...contact })
  const [section, setSection] = useState('basic')
  const [addingLog, setAddingLog] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setSocial = (k, v) => setForm(p => ({ ...p, socialMedia: { ...(p.socialMedia || {}), [k]: v } }))

  const handleWon = () => { set('stage', 'won'); set('type', 'client'); if (!form.wonAt) set('wonAt', todayStr()) }

  const handleAddLog = (log) => {
    setForm(p => ({ ...p, logs: [{ ...log, byName: userName }, ...(p.logs || [])] }))
    setAddingLog(false)
  }

  const si = stageInfo(form.stage)
  const ci = catInfo(form.clientCategory)

  const tabCls = (id) => `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${section === id
    ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/20" />
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 truncate max-w-[300px]">{form.name || '新聯絡人'}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${si.color}`}>{si.label}</span>
              <span className="text-xs text-gray-400">{ci.icon} {ci.label}</span>
              {form.scale && <span className="text-xs text-gray-400">· {form.scale}</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-xl">×</button>
        </div>

        {/* Section tabs */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 overflow-x-auto">
          {[['basic','基本'], ['persons','窗口'], ['social','社群'], ['intel','情資'], ['logs','聯絡記錄']].map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} className={tabCls(id)}>{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── 基本資料 ── */}
          {section === 'basic' && (
            <>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="客戶 / 公司名稱 *" className={inp} />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.clientCategory} onChange={e => set('clientCategory', e.target.value)} className={inp}>
                  {CLIENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
                <select value={form.stage} onChange={e => set('stage', e.target.value)} className={inp}>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <select value={form.scale} onChange={e => set('scale', e.target.value)} className={inp}>
                <option value="">規模（選填）</option>
                {SCALES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="主要電話" className={inp} />
              <input value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="主要 Email" className={inp} />
              <input value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="地址" className={inp} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">下次 Follow-up</label>
                  <input type="date" value={form.nextFollowup} onChange={e => set('nextFollowup', e.target.value)} className={inp} />
                </div>
                {(form.stage === 'won' || form.wonAt) && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">成交日期</label>
                    <input type="date" value={form.wonAt} onChange={e => set('wonAt', e.target.value)} className={inp} />
                  </div>
                )}
              </div>
              <textarea value={form.note} onChange={e => set('note', e.target.value)}
                placeholder="備註" rows={2} className={`${inp} resize-none`} />
              {form.type === 'prospect' && form.stage !== 'won' && form.stage !== 'lost' && (
                <button onClick={handleWon}
                  className="w-full py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                  🎉 標記成交 → 轉為現有客戶
                </button>
              )}
            </>
          )}

          {/* ── 聯絡窗口 ── */}
          {section === 'persons' && (
            <ContactPersons value={form.contacts} onChange={v => set('contacts', v)} />
          )}

          {/* ── 社群資訊 ── */}
          {section === 'social' && (
            <div className="space-y-3">
              {[
                ['website',   '🌐', '官方網站 URL'],
                ['instagram', '📸', 'Instagram 帳號'],
                ['facebook',  '👍', 'Facebook 頁面'],
                ['line',      '💬', 'LINE 官方帳號'],
              ].map(([key, icon, placeholder]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-lg w-7 text-center flex-shrink-0">{icon}</span>
                  <input value={(form.socialMedia || {})[key] || ''}
                    onChange={e => setSocial(key, e.target.value)}
                    placeholder={placeholder} className={`flex-1 ${inpSm}`} />
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs text-gray-400 mb-1 block">其他社群 / 連結</label>
                <input value={(form.socialMedia || {}).other || ''}
                  onChange={e => setSocial('other', e.target.value)}
                  placeholder="其他連結（任意填寫）" className={inpSm} />
              </div>
            </div>
          )}

          {/* ── 情資備註 ── */}
          {section === 'intel' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">記錄客戶背景、競品使用、決策流程、預算週期等情報</p>
              <textarea value={form.intel || ''} onChange={e => set('intel', e.target.value)}
                placeholder="例：每季初有採購預算、目前使用 A 品牌產品、決策者為總監..." rows={10}
                className={`${inp} resize-none`} />
            </div>
          )}

          {/* ── 聯絡記錄 ── */}
          {section === 'logs' && (
            <div className="space-y-3">
              <button onClick={() => setAddingLog(v => !v)}
                className="w-full py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                ＋ 新增聯絡記錄
              </button>
              {addingLog && <LogForm onAdd={handleAddLog} onCancel={() => setAddingLog(false)} />}
              {(form.logs || []).length === 0 && !addingLog && (
                <p className="text-sm text-gray-400 text-center py-8">尚無聯絡記錄</p>
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
                        <span className="text-xs font-semibold text-gray-500">{log.date}</span>
                        <span className="text-xs text-gray-400">{m.label}</span>
                        {log.byName && <span className="text-xs text-gray-300 dark:text-gray-600">· {log.byName}</span>}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{log.summary}</p>
                      {log.nextAction && <p className="text-xs text-blue-500 mt-0.5">→ {log.nextAction}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmDel(v => !v)}
              className="px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm">
              {confirmDel ? '確認刪除？' : '刪除'}
            </button>
            {confirmDel && (
              <button onClick={() => { onDelete(contact.id); onClose() }}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">確定</button>
            )}
          </div>
          <button onClick={() => { onSave(form); onClose() }}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 新增聯絡人 Modal ─────────────────────────────────────────────────────────
function NewContactModal({ type, onClose, onSave, user }) {
  const [form, setForm] = useState({
    name: '', clientCategory: 'studio', stage: type === 'client' ? 'maintain' : 'contact',
    phone: '', email: '', address: '', scale: '', intel: '', note: '',
    contacts: [], socialMedia: {}, nextFollowup: '', wonAt: '',
    type, assigneeUid: user?.id || '', assigneeName: user?.user_metadata?.name || user?.email || '',
    logs: [],
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">
          新增{type === 'prospect' ? '潛在客戶' : '現有客戶'}
        </h3>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="客戶 / 公司名稱 *" className={inp} />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.clientCategory} onChange={e => set('clientCategory', e.target.value)} className={inp}>
            {CLIENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <select value={form.scale} onChange={e => set('scale', e.target.value)} className={inp}>
            <option value="">規模（選填）</option>
            {SCALES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="電話" className={inp} />
        <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="地址（選填）" className={inp} />
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
          <button onClick={() => { if (form.name.trim()) { onSave(form); onClose() } }}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">新增</button>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_PLAN_TIERS = {
  monthlyTiers:   [{ min: 0, rate: 0.01 }, { min: 500000, rate: 0.015 }, { min: 1000000, rate: 0.02 }],
  monthlyEnabled: true,
  quarterlyTiers: [{ min: 0, rate: 0.008 }, { min: 1500000, rate: 0.012 }, { min: 3000000, rate: 0.018 }],
  quarterlyEnabled: true,
  annualTiers:    [{ min: 0, rate: 0.005 }, { min: 5000000, rate: 0.01 }],
  annualEnabled:  true,
}

// ─── 獎金方案編輯器（全頁換頁，手機優先）──────────────────────────────────────
function PlanEditor({ plan, onSave, onClose }) {
  const [form, setForm] = useState({ ...DEFAULT_PLAN_TIERS, ...plan })
  const [showSim, setShowSim] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setTier = (type, idx, field, val) => {
    setForm(p => {
      const tiers = [...(p[type] || [])]
      tiers[idx] = { ...tiers[idx], [field]: Number(val) || 0 }
      return { ...p, [type]: tiers }
    })
  }
  const fmtRate = r => `${(r * 100).toFixed(1)}%`

  const renderSwitch = (k) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className="relative w-10 h-6 flex-shrink-0">
        <input type="checkbox" className="sr-only peer" checked={!!form[k]} onChange={e => set(k, e.target.checked)} />
        <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-500 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">啟用</span>
    </label>
  )

  const renderTierRows = (type, unit) => (form[type] || []).map((tier, i) => (
    <div key={i} className="p-4 space-y-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">第 {i + 1} 層</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">{unit} ≥（元）</label>
          <input type="number" inputMode="numeric" value={tier.min}
            onChange={e => setTier(type, i, 'min', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">獎金率（{fmtRate(tier.rate)}）</label>
          <input type="number" inputMode="decimal" step="0.001" min="0" max="1" value={tier.rate}
            onChange={e => setTier(type, i, 'rate', e.target.value)} className={inp} />
        </div>
      </div>
    </div>
  ))

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* ── 頂部導航 ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition-colors flex-shrink-0 text-xl">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 leading-tight">業務管理 › 獎金設定</p>
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate leading-snug">{plan.name}</h2>
        </div>
        <button onClick={() => { onSave(form); onClose() }}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors flex-shrink-0 min-h-[44px]">
          儲存
        </button>
      </div>

      {/* ── 可捲動主體 ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-xl mx-auto pb-8">

          {/* 開發獎金 */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">開發獎金</p>
              {renderSwitch('devEnabled')}
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">觸發門檻 — 成交後累積入帳達（元）</label>
                <input type="number" inputMode="numeric" value={form.devThreshold}
                  onChange={e => set('devThreshold', e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[['devChain','🏬 連鎖'],['devBrand','🏷️ 品牌'],['devStudio','✂️ 工作室']].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
                    <input type="number" inputMode="numeric" value={form[key]}
                      onChange={e => set(key, e.target.value)} className={inp} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 月採購獎金 */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">月採購獎金</p>
              {renderSwitch('monthlyEnabled')}
            </div>
            {renderTierRows('monthlyTiers', '月入帳')}
          </section>

          {/* 季採購獎金 */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">季採購獎金</p>
              {renderSwitch('quarterlyEnabled')}
            </div>
            {renderTierRows('quarterlyTiers', '季入帳')}
          </section>

          {/* 年度獎金 */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">年度獎金</p>
              {renderSwitch('annualEnabled')}
            </div>
            {renderTierRows('annualTiers', '年入帳')}
          </section>

          {/* 薪資模擬器 */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setShowSim(v => !v)}
              className="w-full flex items-center justify-between px-4 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 transition-colors min-h-[52px]">
              <span>📊 薪資收入模擬器</span>
              <span className="text-gray-400 font-normal text-xs">{showSim ? '▲ 收起' : '▼ 展開'}</span>
            </button>
            {showSim && (
              <div className="border-t border-gray-100 dark:border-gray-800 p-4">
                <SalarySim plan={form} />
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}

// ─── 聯絡人卡片 ───────────────────────────────────────────────────────────────
function ContactCard({ contact, onClick }) {
  const si = stageInfo(contact.stage)
  const ci = catInfo(contact.clientCategory)
  const today = todayStr()
  const days = contact.nextFollowup
    ? Math.ceil((new Date(contact.nextFollowup) - new Date(today)) / 86400000) : null
  const overdue  = days !== null && days < 0
  const dueSoon  = days !== null && !overdue && days <= 3
  const personCount = (contact.contacts || []).length

  return (
    <div onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${si.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{contact.name}</span>
          <span className="text-xs text-gray-400">{ci.icon}</span>
          {contact.scale && <span className="text-xs text-gray-300 dark:text-gray-600 hidden sm:inline">· {contact.scale}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{si.label}</span>
          {contact.assigneeName && <span className="text-xs text-gray-300 dark:text-gray-600">· {contact.assigneeName}</span>}
          {personCount > 0 && <span className="text-xs text-gray-300 dark:text-gray-600">· {personCount} 位窗口</span>}
        </div>
      </div>
      <div className="flex-shrink-0 text-right space-y-1">
        {days !== null && (
          <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            overdue ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
            dueSoon ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' :
            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {overdue ? `逾期 ${Math.abs(days)}天` : days === 0 ? '今天' : `${days}天後`}
          </div>
        )}
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

  const now = new Date()
  const [bonusYear,  setBonusYear]  = useState(now.getFullYear())
  const [bonusMonth, setBonusMonth] = useState(now.getMonth() + 1)
  const [viewUid,    setViewUid]    = useState(isAdmin ? '' : (user?.id || ''))

  const myContacts = useMemo(() =>
    isAdmin ? contacts : contacts.filter(c => c.assigneeUid === user?.id)
  , [contacts, isAdmin, user?.id])

  const today = todayStr()

  const filtered = useMemo(() => {
    const list = myContacts.filter(c => {
      const matchType  = subTab === 'prospects' ? c.type === 'prospect' : c.type === 'client'
      const matchStage = stageFilter === 'all' || c.stage === stageFilter
      const q = search.toLowerCase()
      const matchSearch = !q || c.name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) || (c.address || '').includes(q) ||
        (c.assigneeName || '').toLowerCase().includes(q) ||
        (c.contacts || []).some(p => p.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
      return matchType && matchStage && matchSearch
    })
    return list.sort((a, b) => {
      if (a.nextFollowup && b.nextFollowup) return a.nextFollowup.localeCompare(b.nextFollowup)
      if (a.nextFollowup) return -1
      if (b.nextFollowup) return 1
      return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    })
  }, [myContacts, subTab, stageFilter, search])

  const overdueCount = useMemo(() =>
    myContacts.filter(c => c.nextFollowup && c.nextFollowup < today).length
  , [myContacts, today])

  const bonusResult = useMemo(() => {
    const uid = viewUid || (isAdmin ? '' : user?.id || '')
    if (!uid) return null
    return calcBonus(uid, contacts, invoices, bonusPlans, String(bonusYear), bonusMonth)
  }, [viewUid, user?.id, contacts, invoices, bonusPlans, bonusYear, bonusMonth, isAdmin])

  const allAssignees = useMemo(() => {
    const map = new Map()
    contacts.forEach(c => { if (c.assigneeUid && !map.has(c.assigneeUid)) map.set(c.assigneeUid, c.assigneeName || c.assigneeUid) })
    bonusPlans.forEach(p => { if (p.uid && !map.has(p.uid)) map.set(p.uid, p.name || p.uid) })
    if (user?.id && !map.has(user.id)) map.set(user.id, userName)
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }))
  }, [contacts, bonusPlans, user?.id, userName])

  const getOrCreatePlan = useCallback((uid, name) =>
    bonusPlans.find(p => p.uid === uid) || {
      uid, name,
      devChain: 5000, devBrand: 3000, devStudio: 1000,
      devThreshold: 500000, devEnabled: true,
      monthlyTiers: [{ min: 0, rate: 0.01 }, { min: 500000, rate: 0.015 }, { min: 1000000, rate: 0.02 }],
      monthlyEnabled: true,
      quarterlyTiers: [{ min: 0, rate: 0.008 }, { min: 1500000, rate: 0.012 }, { min: 3000000, rate: 0.018 }],
      quarterlyEnabled: true,
      annualTiers: [{ min: 0, rate: 0.005 }, { min: 5000000, rate: 0.01 }],
      annualEnabled: true,
    }
  , [bonusPlans])

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
          <button onClick={() => setSubTab('clients')}   className={subTabCls('clients')}>🏪 現有客戶</button>
          <button onClick={() => setSubTab('bonus')}     className={subTabCls('bonus')}>💰 獎金</button>
        </div>
      </div>

      {/* ── 潛在客戶 / 現有客戶 ── */}
      {(subTab === 'prospects' || subTab === 'clients') && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋名稱、電話、地址、窗口..."
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

          {subTab === 'prospects' && (
            <div className="flex border-b border-gray-50 dark:border-gray-800 overflow-x-auto">
              {STAGES.filter(s => s.id !== 'maintain').map(s => {
                const cnt = myContacts.filter(c => c.type === 'prospect' && c.stage === s.id).length
                return (
                  <button key={s.id} onClick={() => setStageFilter(stageFilter === s.id ? 'all' : s.id)}
                    className={`flex-1 min-w-[70px] py-2 text-center transition-colors ${stageFilter === s.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                    <div className={`text-base font-bold ${cnt > 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>{cnt}</div>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                      <span className="text-xs text-gray-400">{s.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div>
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-gray-500">
                {search || stageFilter !== 'all' ? '找不到符合條件的記錄' : '尚無資料，點擊「＋ 新增」開始'}
              </div>
            ) : filtered.map(c => (
              <ContactCard key={c.id} contact={c} onClick={() => setSelectedContact(c)} />
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-800">
            <span className="text-xs text-gray-400">共 {filtered.length} 筆</span>
          </div>
        </div>
      )}

      {/* ── 獎金計算 ── */}
      {subTab === 'bonus' && editPlan && (
        <PlanEditor plan={editPlan} onSave={saveBonusPlan} onClose={() => setEditPlan(null)} />
      )}
      {subTab === 'bonus' && !editPlan && (
        <div className="space-y-4">
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

          {/* 年 / 月選擇 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">年度</label>
              <select value={bonusYear} onChange={e => setBonusYear(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
                  <option key={y} value={y}>{y} 年</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">月份</label>
              <select value={bonusMonth} onChange={e => setBonusMonth(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                {Array.from({length:12},(_,i)=>i+1).map(m =>
                  <option key={m} value={m}>{m} 月</option>)}
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
              {/* 摘要卡片 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: `${bonusYear}/${bonusMonth} 月入帳`, value: bonusResult.monthTotal, color: 'text-gray-700 dark:text-gray-200', sub: `月獎金 ${fmtMoney(bonusResult.monthBonus)}` },
                  { label: `Q${bonusResult.quarter} 季度入帳`, value: bonusResult.quarterTotal, color: 'text-gray-700 dark:text-gray-200', sub: `季獎金 ${fmtMoney(bonusResult.quarterBonus)}` },
                  { label: `${bonusYear} 年入帳累積`, value: bonusResult.yearTotal, color: 'text-gray-700 dark:text-gray-200', sub: `年獎金 ${fmtMoney(bonusResult.annualBonus)}` },
                ].map(c => (
                  <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                    <p className={`text-xl font-bold font-mono ${c.color}`}>{fmtMoney(c.value)}</p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* 獎金階梯 — 月、季、年 */}
              {[
                { label: '月採購獎金階梯', enabled: bonusResult.plan.monthlyEnabled,   tiers: bonusResult.plan.monthlyTiers,   total: bonusResult.monthTotal,   bonus: bonusResult.monthBonus,   color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
                { label: `Q${bonusResult.quarter} 季採購獎金階梯`, enabled: bonusResult.plan.quarterlyEnabled, tiers: bonusResult.plan.quarterlyTiers, total: bonusResult.quarterTotal, bonus: bonusResult.quarterBonus, color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' },
                { label: '年度獎金階梯',   enabled: bonusResult.plan.annualEnabled,    tiers: bonusResult.plan.annualTiers,    total: bonusResult.yearTotal,    bonus: bonusResult.annualBonus,  color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
              ].map(({ label, enabled, tiers, total, bonus, color }) => enabled && tiers?.length ? (
                <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {[...tiers].sort((a,b)=>a.min-b.min).map((tier, i, arr) => {
                      const isActive = total >= tier.min && (i === arr.length - 1 || total < arr[i+1].min)
                      return (
                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${isActive ? color.split(' ').slice(0,2).join(' ') : ''}`}>
                          <div className="flex items-center gap-2">
                            {isActive && <span className="text-xs">▶</span>}
                            <span className="text-sm text-gray-600 dark:text-gray-300">{fmtMoney(tier.min)} 以上</span>
                          </div>
                          <span className={`text-sm font-semibold ${isActive ? color.split(' ').slice(2).join(' ') : 'text-gray-400'}`}>
                            {(tier.rate * 100).toFixed(1)}%
                            {isActive && ` → ${fmtFull(bonus)}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null)}

              {/* 開發獎金 */}
              {bonusResult.plan.devEnabled && bonusResult.devBonusItems.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">開發獎金追蹤</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {bonusResult.devBonusItems.map(item => {
                      const ci = catInfo(item.cat)
                      const reward = item.cat === 'chain' ? bonusResult.plan.devChain :
                        item.cat === 'brand' ? bonusResult.plan.devBrand : bonusResult.plan.devStudio
                      const pct = Math.min(100, Math.round(item.cumulative / bonusResult.plan.devThreshold * 100))
                      return (
                        <div key={item.contact.id} className={`px-4 py-3 ${item.triggered ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.contact.name}</span>
                              <span className="text-xs text-gray-400">{ci.icon} {ci.label}</span>
                            </div>
                            {item.triggered ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-bold">
                                🎉 +{reward.toLocaleString()} 元
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">還差 {fmtMoney(bonusResult.plan.devThreshold - item.cumulative)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full transition-all ${item.triggered ? 'bg-emerald-500' : 'bg-blue-400'}`}
                                style={{width: `${pct}%`}} />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 老闆：所有業務員總覽 */}
              {isAdmin && allAssignees.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      所有業務員 — {bonusYear} 年 {bonusMonth} 月
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">業務員</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">月入帳</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">月獎金</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">季獎金</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">年獎金</th>
                          <th className="text-center px-4 py-2 text-xs font-medium text-gray-400">方案</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {allAssignees.map(a => {
                          const r = calcBonus(a.uid, contacts, invoices, bonusPlans, String(bonusYear), bonusMonth)
                          return (
                            <tr key={a.uid} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${viewUid===a.uid?'bg-blue-50/50 dark:bg-blue-900/10':''}`}>
                              <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200">{a.name}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">{r ? fmtMoney(r.monthTotal) : '—'}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">{r ? fmtMoney(r.monthBonus) : '—'}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-purple-600 dark:text-purple-400 font-semibold">{r ? fmtMoney(r.quarterBonus) : '—'}</td>
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Drawers / Modals */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onSave={(c) => { saveContact(c); setSelectedContact(null) }}
          onDelete={deleteContact}
          userName={userName}
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
    </div>
  )
}

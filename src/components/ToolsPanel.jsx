import { useState, useCallback, useMemo } from 'react'
import { geminiGenerate } from '../utils/googleAI'

// ─── 共用樣式 ─────────────────────────────────────────────────────────────────
const card  = 'bg-white dark:bg-gray-800 rounded-2xl shadow p-5'
const label = 'block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1'
const input = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn   = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`
const btnGray    = `${btn} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600`

function Row({ label: l, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={label}>{l}</label>
      {children}
    </div>
  )
}

function ResultBox({ title, children, color = 'blue' }) {
  const colors = {
    blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200',
    red:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      {title && <p className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">{title}</p>}
      {children}
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtN(v, dec = 0) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function addMonthsFn(dateStr, months) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
function daysUntil(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0,0,0,0)
  return Math.round((d - now) / 86400000)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 有效日期計算器
// ═══════════════════════════════════════════════════════════════════════════════
function ExpiryCalculator() {
  const [rows, setRows] = useState([{ id: 1, mfgDate: '', unit: 'month', duration: '' }])
  const [results, setResults] = useState([])

  const addRow = () => setRows(r => [...r, { id: Date.now(), mfgDate: '', unit: 'month', duration: '' }])
  const removeRow = id => setRows(r => r.filter(x => x.id !== id))
  const update = (id, field, val) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x))

  const calc = () => {
    const res = rows.map(r => {
      if (!r.mfgDate || !r.duration) return { ...r, expiry: null }
      const exp = r.unit === 'month'
        ? addMonthsFn(r.mfgDate, parseInt(r.duration))
        : addDays(r.mfgDate, parseInt(r.duration))
      return { ...r, expiry: exp, daysLeft: daysUntil(exp) }
    })
    setResults(res)
  }

  const statusColor = (days) => {
    if (days == null) return ''
    if (days < 0)   return 'text-red-600 dark:text-red-400'
    if (days <= 30)  return 'text-red-500 dark:text-red-400'
    if (days <= 60)  return 'text-amber-500 dark:text-amber-400'
    return 'text-emerald-600 dark:text-emerald-400'
  }
  const statusLabel = (days) => {
    if (days == null) return ''
    if (days < 0)   return `已過期 ${Math.abs(days)} 天`
    if (days === 0)  return '今天到期'
    return `還有 ${days} 天`
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 pr-3">製造日期</th>
              <th className="pb-2 pr-3">保存期限</th>
              <th className="pb-2 pr-3">單位</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="space-y-2">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="pr-3 py-1"><input type="date" className={input} value={r.mfgDate} onChange={e => update(r.id, 'mfgDate', e.target.value)} /></td>
                <td className="pr-3 py-1"><input type="number" min="1" className={input} placeholder="例：12" value={r.duration} onChange={e => update(r.id, 'duration', e.target.value)} /></td>
                <td className="pr-3 py-1">
                  <select className={input} value={r.unit} onChange={e => update(r.id, 'unit', e.target.value)}>
                    <option value="month">月</option>
                    <option value="day">天</option>
                  </select>
                </td>
                <td className="py-1">
                  {rows.length > 1 && <button onClick={() => removeRow(r.id)} className="text-gray-400 hover:text-red-500 px-2">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button onClick={addRow} className={btnGray}>＋ 新增批次</button>
        <button onClick={calc} className={btnPrimary}>計算到期日</button>
      </div>
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-4">製造日期</th>
                <th className="pb-2 pr-4">保存期限</th>
                <th className="pb-2 pr-4">到期日</th>
                <th className="pb-2">狀態</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-4">{r.mfgDate || '—'}</td>
                  <td className="py-2 pr-4">{r.duration ? `${r.duration} ${r.unit === 'month' ? '個月' : '天'}` : '—'}</td>
                  <td className="py-2 pr-4 font-medium">{r.expiry ? fmtDate(r.expiry) : '—'}</td>
                  <td className={`py-2 font-semibold ${statusColor(r.daysLeft)}`}>{statusLabel(r.daysLeft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 保存批次警示看板
// ═══════════════════════════════════════════════════════════════════════════════
function BatchAlertBoard() {
  const [batches, setBatches] = useState([
    { id: 1, name: '', lot: '', mfgDate: '', expiryDate: '', qty: '', unit: '箱' },
  ])
  const [threshold, setThreshold] = useState(60)

  const addBatch = () => setBatches(b => [...b, { id: Date.now(), name: '', lot: '', mfgDate: '', expiryDate: '', qty: '', unit: '箱' }])
  const removeBatch = id => setBatches(b => b.filter(x => x.id !== id))
  const update = (id, field, val) => setBatches(b => b.map(x => x.id === id ? { ...x, [field]: val } : x))

  const sorted = useMemo(() => {
    return [...batches]
      .filter(b => b.expiryDate)
      .map(b => ({ ...b, daysLeft: daysUntil(b.expiryDate) }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [batches])

  const getStatus = (days) => {
    if (days < 0)              return { label: '已過期',        color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-500' }
    if (days <= 30)            return { label: '緊急（30天）',   color: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-400' }
    if (days <= threshold)     return { label: `即將到期`,       color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-400' }
    return { label: '正常',                                       color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-400">警示天數閾值</label>
        <input type="number" min="1" className={`${input} w-24`} value={threshold} onChange={e => setThreshold(parseInt(e.target.value) || 60)} />
        <span className="text-sm text-gray-500">天內標示警示</span>
        <button onClick={addBatch} className={btnPrimary}>＋ 新增批次</button>
      </div>

      <div className="space-y-2">
        {batches.map(b => (
          <div key={b.id} className="grid grid-cols-6 gap-2 items-end text-sm">
            <div><label className={label}>產品名稱</label><input className={input} placeholder="產品名" value={b.name} onChange={e => update(b.id, 'name', e.target.value)} /></div>
            <div><label className={label}>批號</label><input className={input} placeholder="LOT-001" value={b.lot} onChange={e => update(b.id, 'lot', e.target.value)} /></div>
            <div><label className={label}>製造日</label><input type="date" className={input} value={b.mfgDate} onChange={e => update(b.id, 'mfgDate', e.target.value)} /></div>
            <div><label className={label}>到期日</label><input type="date" className={input} value={b.expiryDate} onChange={e => update(b.id, 'expiryDate', e.target.value)} /></div>
            <div className="flex gap-1">
              <div className="flex-1"><label className={label}>數量</label><input type="number" className={input} placeholder="0" value={b.qty} onChange={e => update(b.id, 'qty', e.target.value)} /></div>
              <div className="w-16"><label className={label}>單位</label><select className={input} value={b.unit} onChange={e => update(b.id, 'unit', e.target.value)}><option>箱</option><option>包</option><option>瓶</option><option>kg</option></select></div>
            </div>
            <div className="flex items-end pb-0.5">
              <button onClick={() => removeBatch(b.id)} className="text-gray-400 hover:text-red-500 px-2">✕</button>
            </div>
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📊 批次狀態看板（依到期日排序）</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-4">產品 / 批號</th>
                  <th className="pb-2 pr-4">到期日</th>
                  <th className="pb-2 pr-4">數量</th>
                  <th className="pb-2">狀態</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(b => {
                  const s = getStatus(b.daysLeft)
                  return (
                    <tr key={b.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{b.name || '—'}</p>
                        <p className="text-xs text-gray-400">{b.lot}</p>
                      </td>
                      <td className="py-2 pr-4">{fmtDate(b.expiryDate)}</td>
                      <td className="py-2 pr-4">{b.qty} {b.unit}</td>
                      <td className="py-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                          {b.daysLeft >= 0 ? ` (${b.daysLeft}天)` : ''}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 生產損耗率計算器
// ═══════════════════════════════════════════════════════════════════════════════
function LossRateCalculator() {
  const [rawMaterial, setRawMaterial] = useState('')
  const [rawCost, setRawCost] = useState('')
  const [stages, setStages] = useState([{ id: 1, name: '加工', lossRate: '' }])
  const [result, setResult] = useState(null)

  const addStage = () => setStages(s => [...s, { id: Date.now(), name: '', lossRate: '' }])
  const removeStage = id => setStages(s => s.filter(x => x.id !== id))
  const update = (id, field, val) => setStages(s => s.map(x => x.id === id ? { ...x, [field]: val } : x))

  const calc = () => {
    const raw = parseFloat(rawMaterial)
    const cost = parseFloat(rawCost)
    if (!raw || isNaN(raw)) return
    let current = raw
    const stageResults = stages.map(s => {
      const rate = parseFloat(s.lossRate) || 0
      const loss = current * (rate / 100)
      const after = current - loss
      const res = { ...s, inputQty: current, lossQty: loss, outputQty: after, lossRate: rate }
      current = after
      return res
    })
    const finalOutput = current
    const overallYield = (finalOutput / raw) * 100
    const unitCost = cost && raw ? (cost / finalOutput) : null
    setResult({ stageResults, finalOutput, overallYield, unitCost, rawInput: raw, rawCost: cost })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="原料投入量（kg/g/個）">
          <input type="number" className={input} placeholder="1000" value={rawMaterial} onChange={e => setRawMaterial(e.target.value)} />
        </Row>
        <Row label="原料總成本（元，選填）">
          <input type="number" className={input} placeholder="10000" value={rawCost} onChange={e => setRawCost(e.target.value)} />
        </Row>
      </div>

      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">加工工序（依序）</p>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.id} className="flex gap-2 items-end">
            <div className="flex-1">
              {i === 0 && <label className={label}>工序名稱</label>}
              <input className={input} placeholder="例：清洗、去皮、乾燥" value={s.name} onChange={e => update(s.id, 'name', e.target.value)} />
            </div>
            <div className="w-36">
              {i === 0 && <label className={label}>損耗率 (%)</label>}
              <input type="number" min="0" max="100" className={input} placeholder="5" value={s.lossRate} onChange={e => update(s.id, 'lossRate', e.target.value)} />
            </div>
            <button onClick={() => removeStage(s.id)} className="text-gray-400 hover:text-red-500 px-2 pb-2">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addStage} className={btnGray}>＋ 新增工序</button>
        <button onClick={calc} className={btnPrimary}>計算</button>
      </div>

      {result && (
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-3 gap-3">
            <ResultBox title="最終產出" color="green">
              <p className="text-2xl font-bold">{fmtN(result.finalOutput, 2)}</p>
              <p className="text-xs opacity-70 mt-1">整體良率 {fmtN(result.overallYield, 1)}%</p>
            </ResultBox>
            <ResultBox title="總損耗量" color="amber">
              <p className="text-2xl font-bold">{fmtN(result.rawInput - result.finalOutput, 2)}</p>
              <p className="text-xs opacity-70 mt-1">損耗率 {fmtN(100 - result.overallYield, 1)}%</p>
            </ResultBox>
            <ResultBox title="單位成本" color="blue">
              <p className="text-2xl font-bold">{result.unitCost ? `$${fmtN(result.unitCost, 2)}` : '—'}</p>
              <p className="text-xs opacity-70 mt-1">每單位原料成本</p>
            </ResultBox>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-4">工序</th>
                  <th className="pb-2 pr-4">投入量</th>
                  <th className="pb-2 pr-4">損耗率</th>
                  <th className="pb-2 pr-4">損耗量</th>
                  <th className="pb-2">產出量</th>
                </tr>
              </thead>
              <tbody>
                {result.stageResults.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-4 font-medium">{s.name || `工序`}</td>
                    <td className="py-2 pr-4">{fmtN(s.inputQty, 2)}</td>
                    <td className="py-2 pr-4 text-amber-600 dark:text-amber-400">{s.lossRate}%</td>
                    <td className="py-2 pr-4 text-red-500">－{fmtN(s.lossQty, 2)}</td>
                    <td className="py-2 font-semibold text-emerald-600 dark:text-emerald-400">{fmtN(s.outputQty, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BOM 原料用量展開
// ═══════════════════════════════════════════════════════════════════════════════
function BomCalculator() {
  const [productName, setProductName] = useState('')
  const [batchQty, setBatchQty] = useState('')
  const [materials, setMaterials] = useState([
    { id: 1, name: '', ratio: '', unit: 'g', stock: '' },
  ])
  const [result, setResult] = useState(null)

  const addMat = () => setMaterials(m => [...m, { id: Date.now(), name: '', ratio: '', unit: 'g', stock: '' }])
  const removeMat = id => setMaterials(m => m.filter(x => x.id !== id))
  const update = (id, field, val) => setMaterials(m => m.map(x => x.id === id ? { ...x, [field]: val } : x))

  const calc = () => {
    const qty = parseFloat(batchQty) || 1
    const res = materials.map(m => {
      const need = (parseFloat(m.ratio) || 0) * qty
      const stock = parseFloat(m.stock)
      return { ...m, need, stock, sufficient: isNaN(stock) ? null : stock >= need, shortage: isNaN(stock) ? null : Math.max(0, need - stock) }
    })
    setResult({ materials: res, qty })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="產品名稱">
          <input className={input} placeholder="例：果凍 100g" value={productName} onChange={e => setProductName(e.target.value)} />
        </Row>
        <Row label="生產批次數量（批/箱/包）">
          <input type="number" min="1" className={input} placeholder="100" value={batchQty} onChange={e => setBatchQty(e.target.value)} />
        </Row>
      </div>

      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">原料配方（每批次用量）</p>
      <div className="space-y-2">
        {materials.map((m, i) => (
          <div key={m.id} className="grid grid-cols-5 gap-2 items-end">
            <div className="col-span-2">
              {i === 0 && <label className={label}>原料名稱</label>}
              <input className={input} placeholder="例：砂糖" value={m.name} onChange={e => update(m.id, 'name', e.target.value)} />
            </div>
            <div>
              {i === 0 && <label className={label}>每批用量</label>}
              <input type="number" className={input} placeholder="50" value={m.ratio} onChange={e => update(m.id, 'ratio', e.target.value)} />
            </div>
            <div>
              {i === 0 && <label className={label}>單位</label>}
              <select className={input} value={m.unit} onChange={e => update(m.id, 'unit', e.target.value)}>
                {['g','kg','ml','L','個','片','包','罐'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex gap-1 items-end">
              <div className="flex-1">
                {i === 0 && <label className={label}>現有庫存</label>}
                <input type="number" className={input} placeholder="（選填）" value={m.stock} onChange={e => update(m.id, 'stock', e.target.value)} />
              </div>
              <button onClick={() => removeMat(m.id)} className="text-gray-400 hover:text-red-500 px-2 pb-2">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addMat} className={btnGray}>＋ 新增原料</button>
        <button onClick={calc} className={btnPrimary}>計算用量</button>
      </div>

      {result && (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {productName || '產品'} × {result.qty} 批次 所需原料
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-4">原料</th>
                  <th className="pb-2 pr-4">需求量</th>
                  <th className="pb-2 pr-4">現有庫存</th>
                  <th className="pb-2">庫存狀態</th>
                </tr>
              </thead>
              <tbody>
                {result.materials.map(m => (
                  <tr key={m.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-4 font-medium">{m.name || '—'}</td>
                    <td className="py-2 pr-4">{fmtN(m.need, 2)} {m.unit}</td>
                    <td className="py-2 pr-4">{m.stock !== '' ? `${fmtN(parseFloat(m.stock), 2)} ${m.unit}` : '—'}</td>
                    <td className="py-2">
                      {m.sufficient === null ? <span className="text-gray-400">未填庫存</span>
                        : m.sufficient
                          ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ 充足</span>
                          : <span className="text-red-500 font-medium">✗ 缺 {fmtN(m.shortage, 2)} {m.unit}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 多層次毛利率定價工具
// ═══════════════════════════════════════════════════════════════════════════════
function MarginPricingTool() {
  const [cost, setCost] = useState('')
  const [channels, setChannels] = useState([
    { id: 1, name: '官網直營', margin: '50' },
    { id: 2, name: '批發通路', margin: '35' },
    { id: 3, name: '零售通路', margin: '40' },
    { id: 4, name: '電商平台', margin: '45' },
  ])
  const [results, setResults] = useState([])

  const addChannel = () => setChannels(c => [...c, { id: Date.now(), name: '', margin: '' }])
  const removeChannel = id => setChannels(c => c.filter(x => x.id !== id))
  const update = (id, field, val) => setChannels(c => c.map(x => x.id === id ? { ...x, [field]: val } : x))

  const calc = () => {
    const c = parseFloat(cost)
    if (!c || isNaN(c)) return
    setResults(channels.map(ch => {
      const m = parseFloat(ch.margin) / 100
      if (!m || isNaN(m) || m >= 1) return { ...ch, price: null, grossProfit: null }
      const price = c / (1 - m)
      const grossProfit = price - c
      return { ...ch, price, grossProfit, margin: parseFloat(ch.margin) }
    }))
  }

  return (
    <div className="space-y-4">
      <Row label="產品成本（元）">
        <input type="number" className={`${input} max-w-xs`} placeholder="例：100" value={cost} onChange={e => setCost(e.target.value)} />
      </Row>

      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">通路 / 毛利率設定</p>
      <div className="space-y-2">
        {channels.map((ch, i) => (
          <div key={ch.id} className="flex gap-2 items-end">
            <div className="flex-1">
              {i === 0 && <label className={label}>通路名稱</label>}
              <input className={input} placeholder="通路名稱" value={ch.name} onChange={e => update(ch.id, 'name', e.target.value)} />
            </div>
            <div className="w-32">
              {i === 0 && <label className={label}>目標毛利率 (%)</label>}
              <input type="number" min="0" max="99" className={input} placeholder="40" value={ch.margin} onChange={e => update(ch.id, 'margin', e.target.value)} />
            </div>
            <button onClick={() => removeChannel(ch.id)} className="text-gray-400 hover:text-red-500 px-2 pb-2">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addChannel} className={btnGray}>＋ 新增通路</button>
        <button onClick={calc} className={btnPrimary}>計算售價</button>
      </div>

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-4">通路</th>
                <th className="pb-2 pr-4">毛利率</th>
                <th className="pb-2 pr-4">建議售價</th>
                <th className="pb-2 pr-4">毛利金額</th>
                <th className="pb-2">售價/成本倍數</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-4 font-medium">{r.name || '—'}</td>
                  <td className="py-2 pr-4">{r.margin}%</td>
                  <td className="py-2 pr-4 font-bold text-blue-600 dark:text-blue-400">
                    {r.price ? `$${fmtN(r.price, 0)}` : '—'}
                  </td>
                  <td className="py-2 pr-4 text-emerald-600 dark:text-emerald-400">
                    {r.grossProfit ? `$${fmtN(r.grossProfit, 0)}` : '—'}
                  </td>
                  <td className="py-2 text-gray-500">
                    {r.price ? `${(r.price / parseFloat(cost)).toFixed(2)}x` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 含稅金額互換器
// ═══════════════════════════════════════════════════════════════════════════════
function TaxConverter() {
  const [mode, setMode] = useState('ex2in') // ex2in | in2ex
  const [taxRate, setTaxRate] = useState('5')
  const [amounts, setAmounts] = useState('')
  const [results, setResults] = useState([])

  const calc = () => {
    const rate = parseFloat(taxRate) / 100
    const lines = amounts.split('\n').filter(l => l.trim())
    const res = lines.map(line => {
      const v = parseFloat(line.replace(/,/g, ''))
      if (isNaN(v)) return { input: line, error: true }
      if (mode === 'ex2in') {
        const tax = Math.round(v * rate)
        return { input: fmtN(v), exTax: v, tax, inTax: v + tax }
      } else {
        const exTax = Math.round(v / (1 + rate))
        const tax = v - exTax
        return { input: fmtN(v), exTax, tax, inTax: v }
      }
    })
    setResults(res)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className={label}>轉換方向</label>
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              className={`px-4 py-2 text-sm ${mode === 'ex2in' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              onClick={() => setMode('ex2in')}>
              未稅 → 含稅
            </button>
            <button
              className={`px-4 py-2 text-sm ${mode === 'in2ex' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
              onClick={() => setMode('in2ex')}>
              含稅 → 未稅
            </button>
          </div>
        </div>
        <div>
          <label className={label}>稅率 (%)</label>
          <div className="flex gap-2">
            {['5', '0'].map(r => (
              <button key={r} onClick={() => setTaxRate(r)}
                className={`px-3 py-2 rounded-lg text-sm border ${taxRate === r ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                {r}%
              </button>
            ))}
            <input type="number" className={`${input} w-20`} value={taxRate} onChange={e => setTaxRate(e.target.value)} />
          </div>
        </div>
      </div>

      <Row label={`輸入${mode === 'ex2in' ? '未稅' : '含稅'}金額（每行一筆，支援多筆）`}>
        <textarea className={`${input} h-28 resize-none`} placeholder={`例：\n10000\n25000\n138500`} value={amounts} onChange={e => setAmounts(e.target.value)} />
      </Row>
      <button onClick={calc} className={btnPrimary}>計算</button>

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-4">輸入金額</th>
                <th className="pb-2 pr-4">未稅金額</th>
                <th className="pb-2 pr-4">稅額 ({taxRate}%)</th>
                <th className="pb-2">含稅金額</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                  {r.error
                    ? <td colSpan={4} className="py-2 text-red-500">「{r.input}」無法解析</td>
                    : <>
                      <td className="py-2 pr-4 text-gray-500">{r.input}</td>
                      <td className="py-2 pr-4">${fmtN(r.exTax)}</td>
                      <td className="py-2 pr-4 text-amber-600 dark:text-amber-400">+${fmtN(r.tax)}</td>
                      <td className="py-2 font-bold text-blue-600 dark:text-blue-400">${fmtN(r.inTax)}</td>
                    </>
                  }
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 進口成本試算器
// ═══════════════════════════════════════════════════════════════════════════════
function ImportCostCalculator() {
  const [form, setForm] = useState({
    fob: '', currency: 'USD', exchangeRate: '32',
    freight: '', insurance: '0.3',
    tariff: '10', handling: '500',
    targetMargin: '40',
  })
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calc = () => {
    const fobTWD = parseFloat(form.fob) * parseFloat(form.exchangeRate)
    const freight = parseFloat(form.freight) || 0
    const insurance = fobTWD * (parseFloat(form.insurance) / 100)
    const cif = fobTWD + freight + insurance
    const tariff = cif * (parseFloat(form.tariff) / 100)
    const handling = parseFloat(form.handling) || 0
    const landedCost = cif + tariff + handling
    const margin = parseFloat(form.targetMargin) / 100
    const suggestedPrice = margin < 1 ? landedCost / (1 - margin) : null
    setResult({ fobTWD, freight, insurance, cif, tariff, handling, landedCost, suggestedPrice })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="FOB 報價">
          <div className="flex gap-2">
            <select className={`${input} w-24`} value={form.currency} onChange={e => set('currency', e.target.value)}>
              {['USD','EUR','JPY','CNY','THB'].map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="number" className={input} placeholder="5000" value={form.fob} onChange={e => set('fob', e.target.value)} />
          </div>
        </Row>
        <Row label={`匯率（1 ${form.currency} = ? TWD）`}>
          <input type="number" className={input} value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} />
        </Row>
        <Row label="運費（TWD）">
          <input type="number" className={input} placeholder="8000" value={form.freight} onChange={e => set('freight', e.target.value)} />
        </Row>
        <Row label="保險費率 (%)">
          <input type="number" className={input} value={form.insurance} onChange={e => set('insurance', e.target.value)} />
        </Row>
        <Row label="關稅率 (%)">
          <input type="number" className={input} value={form.tariff} onChange={e => set('tariff', e.target.value)} />
        </Row>
        <Row label="報關/雜費（TWD）">
          <input type="number" className={input} value={form.handling} onChange={e => set('handling', e.target.value)} />
        </Row>
        <Row label="目標毛利率 (%)">
          <input type="number" className={input} value={form.targetMargin} onChange={e => set('targetMargin', e.target.value)} />
        </Row>
      </div>
      <button onClick={calc} className={btnPrimary}>試算落地成本</button>

      {result && (
        <div className="space-y-3">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-sm space-y-2">
            {[
              ['FOB（台幣）',    result.fobTWD],
              ['運費',          result.freight],
              ['保險費',        result.insurance],
              ['CIF 小計',      result.cif, 'font-semibold'],
              ['關稅',          result.tariff],
              ['報關/雜費',     result.handling],
            ].map(([name, val, cls = '']) => (
              <div key={name} className={`flex justify-between ${cls}`}>
                <span className="text-gray-600 dark:text-gray-400">{name}</span>
                <span>${fmtN(val, 0)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-base">
              <span>落地成本</span>
              <span className="text-blue-600 dark:text-blue-400">${fmtN(result.landedCost, 0)}</span>
            </div>
          </div>
          {result.suggestedPrice && (
            <ResultBox title={`建議售價（毛利率 ${form.targetMargin}%）`} color="green">
              <p className="text-2xl font-bold">${fmtN(result.suggestedPrice, 0)}</p>
              <p className="text-xs opacity-70 mt-1">毛利 ${fmtN(result.suggestedPrice - result.landedCost, 0)}</p>
            </ResultBox>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. 出貨裝箱計算器
// ═══════════════════════════════════════════════════════════════════════════════
function PackagingCalculator() {
  const [form, setForm] = useState({
    orderQty: '', pcsPerBox: '', boxWeight: '', boxL: '', boxW: '', boxH: '',
    palletBoxes: '40', freightPerKg: '30', freightPerCbm: '2000',
  })
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calc = () => {
    const orderQty = parseInt(form.orderQty) || 0
    const pcsPerBox = parseInt(form.pcsPerBox) || 1
    const boxes = Math.ceil(orderQty / pcsPerBox)
    const boxWeight = parseFloat(form.boxWeight) || 0
    const totalWeight = boxes * boxWeight
    const L = parseFloat(form.boxL) / 100 || 0
    const W = parseFloat(form.boxW) / 100 || 0
    const H = parseFloat(form.boxH) / 100 || 0
    const cbmPerBox = L * W * H
    const totalCbm = cbmPerBox * boxes
    const pallets = form.palletBoxes ? Math.ceil(boxes / parseInt(form.palletBoxes)) : null
    const freightByWeight = totalWeight * (parseFloat(form.freightPerKg) || 0)
    const freightByCbm = totalCbm * (parseFloat(form.freightPerCbm) || 0)
    setResult({ orderQty, boxes, pcsPerBox, totalWeight, cbmPerBox, totalCbm, pallets, freightByWeight, freightByCbm })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="訂單數量（個/包/瓶）">
          <input type="number" className={input} placeholder="1200" value={form.orderQty} onChange={e => set('orderQty', e.target.value)} />
        </Row>
        <Row label="每箱數量">
          <input type="number" className={input} placeholder="24" value={form.pcsPerBox} onChange={e => set('pcsPerBox', e.target.value)} />
        </Row>
        <Row label="每箱重量（kg）">
          <input type="number" className={input} placeholder="12" value={form.boxWeight} onChange={e => set('boxWeight', e.target.value)} />
        </Row>
        <Row label="每棧板箱數（選填）">
          <input type="number" className={input} placeholder="40" value={form.palletBoxes} onChange={e => set('palletBoxes', e.target.value)} />
        </Row>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">箱子尺寸（cm）</p>
      <div className="grid grid-cols-3 gap-3">
        <Row label="長 (L)"><input type="number" className={input} placeholder="60" value={form.boxL} onChange={e => set('boxL', e.target.value)} /></Row>
        <Row label="寬 (W)"><input type="number" className={input} placeholder="40" value={form.boxW} onChange={e => set('boxW', e.target.value)} /></Row>
        <Row label="高 (H)"><input type="number" className={input} placeholder="30" value={form.boxH} onChange={e => set('boxH', e.target.value)} /></Row>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Row label="運費（元/kg，選填）">
          <input type="number" className={input} value={form.freightPerKg} onChange={e => set('freightPerKg', e.target.value)} />
        </Row>
        <Row label="運費（元/CBM，選填）">
          <input type="number" className={input} value={form.freightPerCbm} onChange={e => set('freightPerCbm', e.target.value)} />
        </Row>
      </div>
      <button onClick={calc} className={btnPrimary}>計算</button>

      {result && (
        <div className="grid grid-cols-2 gap-3">
          <ResultBox title="箱數" color="blue">
            <p className="text-2xl font-bold">{fmtN(result.boxes)} 箱</p>
            <p className="text-xs opacity-70 mt-1">每箱 {result.pcsPerBox} 個，共 {fmtN(result.orderQty)} 個</p>
          </ResultBox>
          <ResultBox title="總重量" color="green">
            <p className="text-2xl font-bold">{fmtN(result.totalWeight, 1)} kg</p>
            <p className="text-xs opacity-70 mt-1">棧板數 {result.pallets ?? '—'} 板</p>
          </ResultBox>
          <ResultBox title="總材積" color="amber">
            <p className="text-2xl font-bold">{result.totalCbm.toFixed(3)} CBM</p>
            <p className="text-xs opacity-70 mt-1">每箱 {result.cbmPerBox.toFixed(4)} CBM</p>
          </ResultBox>
          <ResultBox title="估算運費" color="blue">
            <p className="text-sm font-semibold">重量計：${fmtN(result.freightByWeight, 0)}</p>
            <p className="text-sm font-semibold mt-1">材積計：${fmtN(result.freightByCbm, 0)}</p>
            <p className="text-xs opacity-70 mt-1">實際以較高者計費</p>
          </ResultBox>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. EOQ 最佳訂購量
// ═══════════════════════════════════════════════════════════════════════════════
function EoqCalculator() {
  const [form, setForm] = useState({ demand: '', orderCost: '', holdingRate: '', unitCost: '' })
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calc = () => {
    const D = parseFloat(form.demand)        // 年需求量
    const S = parseFloat(form.orderCost)     // 每次訂購成本
    const h = parseFloat(form.holdingRate) / 100  // 持有成本率
    const c = parseFloat(form.unitCost)      // 單位成本
    if (!D || !S || !h || !c) return
    const H = h * c                          // 單位年持有成本
    const eoq = Math.sqrt((2 * D * S) / H)
    const ordersPerYear = D / eoq
    const cycleTimeDays = 365 / ordersPerYear
    const totalOrderCost = ordersPerYear * S
    const avgInventory = eoq / 2
    const totalHoldingCost = avgInventory * H
    const totalCost = totalOrderCost + totalHoldingCost
    setResult({ eoq, ordersPerYear, cycleTimeDays, totalOrderCost, totalHoldingCost, totalCost, avgInventory })
  }

  // 建立成本曲線資料
  const chartData = useMemo(() => {
    if (!result) return []
    const { eoq } = result
    const D = parseFloat(form.demand)
    const S = parseFloat(form.orderCost)
    const H = (parseFloat(form.holdingRate) / 100) * parseFloat(form.unitCost)
    const points = []
    for (let q = Math.max(1, Math.round(eoq * 0.3)); q <= Math.round(eoq * 2); q += Math.max(1, Math.round(eoq * 0.1))) {
      const oc = (D / q) * S
      const hc = (q / 2) * H
      points.push({ q: Math.round(q), order: Math.round(oc), holding: Math.round(hc), total: Math.round(oc + hc) })
    }
    return points
  }, [result, form])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="年需求量（個）">
          <input type="number" className={input} placeholder="12000" value={form.demand} onChange={e => set('demand', e.target.value)} />
        </Row>
        <Row label="每次訂購成本（元）">
          <input type="number" className={input} placeholder="500" value={form.orderCost} onChange={e => set('orderCost', e.target.value)} />
        </Row>
        <Row label="單位成本（元）">
          <input type="number" className={input} placeholder="100" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} />
        </Row>
        <Row label="年持有成本率 (% of 單位成本)">
          <input type="number" className={input} placeholder="20" value={form.holdingRate} onChange={e => set('holdingRate', e.target.value)} />
        </Row>
      </div>
      <button onClick={calc} className={btnPrimary}>計算最佳訂購量</button>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <ResultBox title="最佳訂購量（EOQ）" color="blue">
              <p className="text-2xl font-bold">{fmtN(result.eoq, 0)} 個</p>
            </ResultBox>
            <ResultBox title="每年訂購次數" color="green">
              <p className="text-2xl font-bold">{result.ordersPerYear.toFixed(1)} 次</p>
              <p className="text-xs opacity-70 mt-1">每 {result.cycleTimeDays.toFixed(0)} 天訂一次</p>
            </ResultBox>
            <ResultBox title="年總成本最低" color="amber">
              <p className="text-2xl font-bold">${fmtN(result.totalCost, 0)}</p>
              <p className="text-xs opacity-70 mt-1">訂購 ${fmtN(result.totalOrderCost, 0)} + 持有 ${fmtN(result.totalHoldingCost, 0)}</p>
            </ResultBox>
          </div>

          {chartData.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">成本曲線（不同訂購量比較）</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-1 pr-3">訂購量</th>
                      <th className="pb-1 pr-3">訂購成本</th>
                      <th className="pb-1 pr-3">持有成本</th>
                      <th className="pb-1">總成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map(d => {
                      const isOpt = Math.abs(d.q - Math.round(result.eoq)) <= Math.round(result.eoq * 0.05)
                      return (
                        <tr key={d.q} className={`border-b border-gray-100 dark:border-gray-700 ${isOpt ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : ''}`}>
                          <td className="py-1 pr-3">{fmtN(d.q)} {isOpt ? '← 最佳' : ''}</td>
                          <td className="py-1 pr-3">${fmtN(d.order)}</td>
                          <td className="py-1 pr-3">${fmtN(d.holding)}</td>
                          <td className="py-1">${fmtN(d.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. AI 產品文案產生器（Google Gemini）
// ═══════════════════════════════════════════════════════════════════════════════
function AICopywriter() {
  const [form, setForm] = useState({
    productName: '', features: '', target: '', channel: 'ec', tone: 'professional',
  })
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const channels = [
    { value: 'ec',      label: '電商商品頁（蝦皮/Momo）' },
    { value: 'ig',      label: 'Instagram 貼文' },
    { value: 'fb',      label: 'Facebook 貼文' },
    { value: 'package', label: '包裝背面文案' },
    { value: 'line',    label: 'LINE 訊息推播' },
    { value: 'all',     label: '全部通路' },
  ]
  const tones = [
    { value: 'professional', label: '專業信賴' },
    { value: 'warm',         label: '溫馨親切' },
    { value: 'lively',       label: '活潑有趣' },
    { value: 'luxury',       label: '精品高端' },
  ]

  const generate = async () => {
    if (!form.productName.trim()) { setError('請輸入產品名稱'); return }
    setError(''); setLoading(true); setResults(null)
    const channelLabel = channels.find(c => c.value === form.channel)?.label || form.channel
    const toneLabel    = tones.find(t => t.value === form.tone)?.label || form.tone
    const needChannels = form.channel === 'all'
      ? ['電商商品頁（蝦皮/Momo）', 'Instagram 貼文', 'Facebook 貼文', '包裝背面文案', 'LINE 訊息推播']
      : [channelLabel]

    const prompt = `你是一位台灣頂尖的食品/消費品行銷文案專家，請為以下產品撰寫行銷文案。

產品名稱：${form.productName}
核心特色：${form.features || '（未填，請依產品名稱發揮）'}
目標客群：${form.target || '一般消費者'}
文案風格：${toneLabel}
需要的通路文案：${needChannels.join('、')}

請依序輸出每個通路的文案，格式如下（嚴格按照此格式）：

${needChannels.map(ch => `【${ch}】\n[文案內容]`).join('\n\n')}

注意：
- 繁體中文
- 電商頁需包含標題、賣點條列、描述段落
- 社群貼文需含 emoji 和 hashtag
- 包裝文案需簡潔有力、字數精省
- LINE 訊息需口語化、有行動呼籲`

    try {
      const text = await geminiGenerate(prompt)
      // 解析各通路文案
      const parsed = {}
      needChannels.forEach(ch => {
        const regex = new RegExp(`【${ch}】([\\s\\S]*?)(?=【|$)`)
        const match = text.match(regex)
        parsed[ch] = match ? match[1].trim() : ''
      })
      setResults({ raw: text, parsed, channels: needChannels })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copyText = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="產品名稱 *">
          <input className={input} placeholder="例：台灣野生蜂蜜 500g" value={form.productName} onChange={e => set('productName', e.target.value)} />
        </Row>
        <Row label="目標客群">
          <input className={input} placeholder="例：30-45歲注重健康的媽媽" value={form.target} onChange={e => set('target', e.target.value)} />
        </Row>
        <Row label="核心特色（逗號分隔）">
          <input className={input} placeholder="例：無添加、台灣產地、限量採集" value={form.features} onChange={e => set('features', e.target.value)} />
        </Row>
        <Row label="通路">
          <select className={input} value={form.channel} onChange={e => set('channel', e.target.value)}>
            {channels.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Row>
        <Row label="文案風格">
          <div className="flex gap-2 flex-wrap">
            {tones.map(t => (
              <button key={t.value}
                onClick={() => set('tone', t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.tone === t.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </Row>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button onClick={generate} disabled={loading} className={`${btnPrimary} flex items-center gap-2 disabled:opacity-60`}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />產生中…</>
        ) : '✨ AI 產生文案'}
      </button>

      {results && (
        <div className="space-y-4">
          {results.channels.map(ch => (
            <div key={ch} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 px-4 py-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{ch}</p>
                <button onClick={() => copyText(results.parsed[ch])}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  複製
                </button>
              </div>
              <div className="p-4">
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {results.parsed[ch] || '（未解析到此通路文案）'}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 主元件
// ═══════════════════════════════════════════════════════════════════════════════
const TOOLS = [
  { id: 'expiry',    icon: '📅', label: '有效日期計算',    component: ExpiryCalculator },
  { id: 'batch',     icon: '🏷️', label: '批次警示看板',    component: BatchAlertBoard },
  { id: 'loss',      icon: '⚖️', label: '生產損耗計算',    component: LossRateCalculator },
  { id: 'bom',       icon: '🧪', label: 'BOM 原料展開',    component: BomCalculator },
  { id: 'margin',    icon: '💰', label: '多層毛利定價',     component: MarginPricingTool },
  { id: 'tax',       icon: '🧾', label: '含稅金額互換',     component: TaxConverter },
  { id: 'import',    icon: '🚢', label: '進口成本試算',     component: ImportCostCalculator },
  { id: 'pack',      icon: '📦', label: '出貨裝箱計算',     component: PackagingCalculator },
  { id: 'eoq',       icon: '📊', label: '最佳訂購量 EOQ',   component: EoqCalculator },
  { id: 'copy',      icon: '✍️', label: 'AI 文案產生器',   component: AICopywriter },
]

export default function ToolsPanel() {
  const [activeTool, setActiveTool] = useState('expiry')
  const active = TOOLS.find(t => t.id === activeTool)
  const Component = active?.component

  return (
    <div className="flex gap-4 h-full">
      {/* 側邊工具選單 */}
      <div className="w-44 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-2">工具列表</p>
        <nav className="space-y-1">
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                activeTool === t.id
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              <span>{t.icon}</span>
              <span className="leading-snug">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 工具內容 */}
      <div className="flex-1 min-w-0">
        <div className={card}>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span>{active?.icon}</span>
            <span>{active?.label}</span>
          </h2>
          {Component && <Component />}
        </div>
      </div>
    </div>
  )
}

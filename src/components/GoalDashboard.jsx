import { useState, useMemo } from 'react'
import { useGoals } from '../hooks/useGoals'
import { callClaude, extractJSON } from '../utils/ai'

const fmtM = (v) => {
  if (!v) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

function ProgressBar({ value, target, color = '#3B82F6' }) {
  const pct = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-base mb-1">
        <span className="text-gray-500">實際 {fmtM(value)}</span>
        <span className="font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct >= 100 ? '#10B981' : pct >= 80 ? color : '#F59E0B' }} />
      </div>
      <div className="text-sm text-gray-400 mt-0.5">目標 {fmtM(target)}</div>
    </div>
  )
}

function StatusDot({ pct }) {
  const cls = pct === null ? 'bg-gray-300' : pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-blue-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />
}

// 可編輯目標的 Modal
function GoalEditorModal({ byYear, goals, onSave, onClose }) {
  const currentYear = new Date().getFullYear()
  const nextYears = [0, 1, 2].map(i => String(currentYear + i))
  const [draft, setDraft] = useState(() => {
    const annual = {}
    nextYears.forEach(y => {
      annual[y] = { subtotal: goals.annual[y]?.subtotal || 0, quantity: goals.annual[y]?.quantity || 0 }
    })
    return {
      annual,
      longTerm: {
        '3year': { label: '3 年', targetYear: currentYear + 3, subtotal: goals.longTerm?.['3year']?.subtotal || 0, quantity: goals.longTerm?.['3year']?.quantity || 0 },
        '5year': { label: '5 年', targetYear: currentYear + 5, subtotal: goals.longTerm?.['5year']?.subtotal || 0, quantity: goals.longTerm?.['5year']?.quantity || 0 },
        '10year': { label: '10 年', targetYear: currentYear + 10, subtotal: goals.longTerm?.['10year']?.subtotal || 0, quantity: goals.longTerm?.['10year']?.quantity || 0 },
      }
    }
  })
  const [loading, setLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')

  const setA = (year, field, v) => setDraft(d => ({
    ...d, annual: { ...d.annual, [year]: { ...d.annual[year], [field]: Number(v) || 0 } }
  }))
  const setL = (key, field, v) => setDraft(d => ({
    ...d, longTerm: { ...d.longTerm, [key]: { ...d.longTerm[key], [field]: Number(v) || 0 } }
  }))

  const generateWithAI = async () => {
    setLoading(true)
    setAiAnalysis('')
    try {
      const historySummary = byYear.map(r => `  ${r.year}年：銷售金額 NT$${Math.round(r.subtotal).toLocaleString()}，銷售數量 ${Math.round(r.quantity).toLocaleString()} 件`).join('\n')
      const growthRates = byYear.map((r, i) => {
        if (i === 0) return null
        const prev = byYear[i - 1]
        return `  ${r.year}vs${prev.year}：${prev.subtotal > 0 ? ((r.subtotal - prev.subtotal) / prev.subtotal * 100).toFixed(1) : '—'}%`
      }).filter(Boolean).join('\n')

      const prompt = `你是一位專業的銷售顧問。以下是這家公司的歷史銷售數據：

歷年銷售：
${historySummary}

歷年成長率：
${growthRates}

請根據這些數據，提供合理的銷售目標建議。考量實際可達成性、市場成熟度，不要過於樂觀，也不要保守。

請回覆以下 JSON 格式（所有金額為新台幣整數，無逗號）：
{
  "cagr": 12,
  "analysis": "一段50字以內的分析說明",
  "annual": {
    "${nextYears[0]}": {"subtotal": 0, "quantity": 0},
    "${nextYears[1]}": {"subtotal": 0, "quantity": 0},
    "${nextYears[2]}": {"subtotal": 0, "quantity": 0}
  },
  "longTerm": {
    "3year": {"subtotal": 0, "quantity": 0},
    "5year": {"subtotal": 0, "quantity": 0},
    "10year": {"subtotal": 0, "quantity": 0}
  }
}`

      const text = await callClaude(prompt, 1200)
      const json = extractJSON(text)

      setAiAnalysis(`📊 AI 分析：${json.analysis || ''}（建議 CAGR：${json.cagr || '—'}%）`)

      setDraft(d => {
        const annual = { ...d.annual }
        nextYears.forEach(y => {
          if (json.annual?.[y]) {
            annual[y] = { subtotal: json.annual[y].subtotal || 0, quantity: json.annual[y].quantity || 0 }
          }
        })
        const longTerm = { ...d.longTerm }
        Object.entries(json.longTerm || {}).forEach(([k, v]) => {
          if (longTerm[k]) longTerm[k] = { ...longTerm[k], subtotal: v.subtotal || 0, quantity: v.quantity || 0 }
        })
        return { annual, longTerm }
      })
    } catch (e) {
      setAiAnalysis(`⚠️ AI 生成失敗：${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-800">🏆 編輯銷售目標</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* AI 生成 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-base font-bold text-blue-800">🤖 AI 智能建議目標</p>
                <p className="text-sm text-blue-500">根據歷史數據自動計算合理的成長目標</p>
              </div>
              <button onClick={generateWithAI} disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 disabled:opacity-60 transition-all flex items-center gap-2">
                {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> 分析中...</> : '✨ AI 建議'}
              </button>
            </div>
            {aiAnalysis && <p className="text-base text-blue-700 mt-2 bg-white/60 px-3 py-2 rounded-xl">{aiAnalysis}</p>}
          </div>

          {/* 年度目標 */}
          <div>
            <h3 className="text-base font-bold text-gray-700 mb-3">📅 年度目標</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-4">年份</th>
                    <th className="text-right py-2 pr-4">銷售金額目標（元）</th>
                    <th className="text-right py-2">銷售數量目標（件）</th>
                  </tr>
                </thead>
                <tbody>
                  {nextYears.map(y => (
                    <tr key={y} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 font-bold text-gray-700">{y}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <input type="number" value={draft.annual[y]?.subtotal || ''}
                          onChange={e => setA(y, 'subtotal', e.target.value)}
                          className="w-40 text-right px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base"
                          placeholder="0" />
                      </td>
                      <td className="py-2.5 text-right">
                        <input type="number" value={draft.annual[y]?.quantity || ''}
                          onChange={e => setA(y, 'quantity', e.target.value)}
                          className="w-32 text-right px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base"
                          placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 長期目標 */}
          <div>
            <h3 className="text-base font-bold text-gray-700 mb-3">🚀 長期里程碑</h3>
            <div className="space-y-3">
              {Object.entries(draft.longTerm).map(([key, lt]) => (
                <div key={key} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-24 text-base font-bold text-gray-700">{lt.label}（{lt.targetYear}年）</div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-400">金額</span>
                    <input type="number" value={lt.subtotal || ''}
                      onChange={e => setL(key, 'subtotal', e.target.value)}
                      className="flex-1 text-right px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base"
                      placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-400">數量</span>
                    <input type="number" value={lt.quantity || ''}
                      onChange={e => setL(key, 'quantity', e.target.value)}
                      className="flex-1 text-right px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-base"
                      placeholder="0" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-2 rounded-xl border border-gray-200 text-gray-600 text-base hover:bg-gray-50">取消</button>
            <button onClick={() => { onSave(draft); onClose() }}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-base font-bold hover:bg-blue-700">儲存目標</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GoalDashboard({ comparisonData, summary }) {
  const { goals, save } = useGoals()
  const [editing, setEditing] = useState(false)
  const currentYear = String(new Date().getFullYear())
  const { byYear } = comparisonData

  const currentTarget = goals.annual[currentYear] || {}
  const salesPct = currentTarget.subtotal > 0 ? Math.round(summary.totalSales / currentTarget.subtotal * 100) : null
  const qtyPct = currentTarget.quantity > 0 ? Math.round(summary.totalQty / currentTarget.quantity * 100) : null

  const longTermKeys = [
    { key: '3year', label: '3 年里程碑', icon: '📍' },
    { key: '5year', label: '5 年里程碑', icon: '🏁' },
    { key: '10year', label: '10 年里程碑', icon: '🌟' },
  ]

  const annualYears = byYear.map(r => r.year).concat(
    [0, 1, 2].map(i => String(new Date().getFullYear() + i)).filter(y => !byYear.find(r => r.year === y))
  ).sort()

  const handleSave = (draft) => {
    save({ ...goals, annual: { ...goals.annual, ...draft.annual }, longTerm: draft.longTerm })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🏆 目標管理</h2>
          <p className="text-base text-gray-400 mt-0.5">設定年度與長期里程碑，追蹤達成進度</p>
        </div>
        <button onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all">
          ✏️ 編輯目標
        </button>
      </div>

      {!currentTarget.subtotal && !currentTarget.quantity ? (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-lg font-bold text-blue-700 mb-1">尚未設定目標</p>
          <p className="text-base text-blue-400 mb-4">點擊「編輯目標」設定年度目標，或讓 AI 幫你建議</p>
          <button onClick={() => setEditing(true)}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700">
            ✨ 開始設定目標
          </button>
        </div>
      ) : (
        <>
          {/* 當年進度 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-base font-bold text-gray-700 mb-4">{currentYear} 年目標達成進度</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-base font-semibold text-gray-600 mb-2">💰 銷售金額</p>
                <ProgressBar value={summary.totalSales} target={currentTarget.subtotal} color="#3B82F6" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-600 mb-2">📦 銷售數量</p>
                <ProgressBar value={summary.totalQty} target={currentTarget.quantity} color="#10B981" />
              </div>
            </div>
          </div>

          {/* 年度目標總覽 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-base font-bold text-gray-700 mb-4">📅 各年度目標</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-4">年份</th>
                    <th className="text-right py-2 pr-4">金額目標</th>
                    <th className="text-right py-2 pr-4">數量目標</th>
                    <th className="text-right py-2 pr-4">實際金額</th>
                    <th className="text-right py-2">達成率</th>
                  </tr>
                </thead>
                <tbody>
                  {annualYears.map(year => {
                    const target = goals.annual[year] || {}
                    const actual = byYear.find(r => r.year === year)
                    const isCurrentYear = year === currentYear
                    const actualVal = isCurrentYear ? summary.totalSales : (actual?.subtotal || null)
                    const pct = target.subtotal > 0 && actualVal != null ? Math.round(actualVal / target.subtotal * 100) : null
                    return (
                      <tr key={year} className={`border-b border-gray-50 hover:bg-gray-50 ${isCurrentYear ? 'bg-blue-50/40' : ''}`}>
                        <td className="py-3 pr-4 font-bold text-gray-800">
                          {year} {isCurrentYear && <span className="text-xs text-blue-500 font-normal ml-1">本年</span>}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono">{target.subtotal ? fmtM(target.subtotal) : <span className="text-gray-300">未設定</span>}</td>
                        <td className="py-3 pr-4 text-right font-mono">{target.quantity ? target.quantity.toLocaleString() : <span className="text-gray-300">未設定</span>}</td>
                        <td className="py-3 pr-4 text-right font-mono text-gray-600">{actualVal != null ? fmtM(actualVal) : '—'}</td>
                        <td className="py-3 text-right">
                          {pct != null ? (
                            <span className={`inline-flex items-center gap-1.5 font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>
                              <StatusDot pct={pct} /> {pct}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 長期里程碑 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {longTermKeys.map(({ key, label, icon }) => {
          const lt = goals.longTerm?.[key]
          const targetYear = lt?.targetYear || (new Date().getFullYear() + parseInt(key))
          return (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="text-base font-bold text-gray-700">{label}</p>
                  <p className="text-sm text-gray-400">{targetYear} 年底達成</p>
                </div>
              </div>
              {lt?.subtotal ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-base">
                    <span className="text-gray-500">金額目標</span>
                    <span className="font-bold text-blue-700">{fmtM(lt.subtotal)}</span>
                  </div>
                  {lt.quantity > 0 && (
                    <div className="flex justify-between text-base">
                      <span className="text-gray-500">數量目標</span>
                      <span className="font-bold text-gray-700">{lt.quantity.toLocaleString()} 件</span>
                    </div>
                  )}
                  {byYear.length > 0 && (
                    <div className="flex justify-between text-sm text-gray-400 border-t border-gray-50 pt-1.5 mt-1.5">
                      <span>較目前需成長</span>
                      <span className="font-semibold text-emerald-600">
                        {summary.totalSales > 0 ? `+${Math.round((lt.subtotal / summary.totalSales - 1) * 100)}%` : '—'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-300 text-base">尚未設定</p>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <GoalEditorModal
          byYear={byYear}
          goals={goals}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

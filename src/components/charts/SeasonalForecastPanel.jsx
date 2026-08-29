import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { supabase, supabaseAdmin } from '../../config/supabase'

/**
 * 淡旺季 × 年底預測 × 閉迴路驗證
 * ・淡旺季：以「前 2 個完整年度」的月度平均算季節指數（旺季>115%、淡季<85%）
 * ・年底預測：今年已完成月份的實際值 ÷ 對應季節指數 → 推算剩餘月份與全年
 * ・閉迴路：「儲存本次預測」寫入 forecast_records；日後實際值出來自動對比誤差
 */
const fmtW = v => {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '億'
  if (Math.abs(v) >= 1e4) return Math.round(v / 1e4) + '萬'
  return Math.round(v).toLocaleString()
}
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

export default function SeasonalForecastPanel({ allRows = [], canManage = true, userEmail = '' }) {
  const client = supabaseAdmin || supabase
  const [saved, setSaved] = useState([])
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const model = useMemo(() => {
    if (!allRows.length) return null
    const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    // 月度加總（只取完整月份）
    const byYM = {}
    for (const r of allRows) {
      if (r.yearMonth >= nowYM) continue
      byYM[r.yearMonth] = (byYM[r.yearMonth] || 0) + (r.subtotal || 0)
    }
    const yms = Object.keys(byYM).sort()
    if (!yms.length) return null
    const thisYear = yms[yms.length - 1].slice(0, 4)
    const y1 = String(parseInt(thisYear) - 1), y2 = String(parseInt(thisYear) - 2)

    // 前 2 年季節指數（月均 / 全年月平均）
    const base = {}
    let baseTotal = 0, baseCount = 0
    MONTHS.forEach(m => {
      const vals = [y1, y2].map(y => byYM[`${y}-${m}`]).filter(v => v != null)
      if (vals.length) {
        base[m] = vals.reduce((s, v) => s + v, 0) / vals.length
        baseTotal += base[m]; baseCount++
      }
    })
    if (baseCount < 6) return { insufficient: true, thisYear }
    const avgMonth = baseTotal / baseCount
    const index = {}   // 季節指數（1 = 平均月）
    MONTHS.forEach(m => { if (base[m] != null) index[m] = base[m] / avgMonth })

    // 今年實際與預測
    const actual = {}
    MONTHS.forEach(m => { const v = byYM[`${thisYear}-${m}`]; if (v != null) actual[m] = v })
    const doneMonths = Object.keys(actual)
    const idxDone = doneMonths.reduce((s, m) => s + (index[m] || 1), 0)
    const ytd = doneMonths.reduce((s, m) => s + actual[m], 0)
    const scale = idxDone > 0 ? ytd / idxDone : avgMonth   // 今年的「每 1 單位指數」值
    const predictions = {}
    MONTHS.forEach(m => { if (actual[m] == null) predictions[m] = Math.round(scale * (index[m] || 1)) })
    const projectedTotal = ytd + Object.values(predictions).reduce((s, v) => s + v, 0)
    const lastYearTotal = MONTHS.reduce((s, m) => s + (byYM[`${y1}-${m}`] || 0), 0)

    const chart = MONTHS.map(m => ({
      month: `${parseInt(m)}月`,
      實際: actual[m] ?? null,
      預測: predictions[m] ?? null,
      前2年平均: base[m] != null ? Math.round(base[m]) : null,
      idx: index[m],
      season: index[m] == null ? '' : index[m] >= 1.15 ? '旺' : index[m] <= 0.85 ? '淡' : '',
    }))
    return { thisYear, y1, y2, chart, index, actual, predictions, ytd, projectedTotal, lastYearTotal }
  }, [allRows])

  const loadSaved = useCallback(async () => {
    if (!client) return
    const { data } = await client.from('forecast_records').select('*').order('created_at', { ascending: false }).limit(20)
    setSaved(data || [])
  }, [client])
  useEffect(() => { loadSaved() }, [loadSaved])

  const handleSave = async () => {
    if (!model || model.insufficient) return
    setSaving(true); setMsg(null)
    const { error } = await client.from('forecast_records').insert({
      target_year: model.thisYear,
      predictions: model.predictions,
      ytd_at_save: Math.round(model.ytd),
      projected_total: Math.round(model.projectedTotal),
      author: userEmail,
    })
    setSaving(false)
    if (error) { setMsg({ ok: false, text: '儲存失敗：' + error.message }); return }
    setMsg({ ok: true, text: `已儲存 ${model.thisYear} 年預測——年底後回來這裡看誤差，形成閉迴路。` })
    loadSaved()
  }

  // 閉迴路：已儲存的預測 vs 實際（實際值從 allRows 即時計算）
  const actualByYM = useMemo(() => {
    const m = {}
    for (const r of allRows) m[r.yearMonth] = (m[r.yearMonth] || 0) + (r.subtotal || 0)
    return m
  }, [allRows])

  if (!model) return null
  if (model.insufficient) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4 text-sm text-gray-400">
      歷史資料不足 6 個月，無法建立季節指數與預測。
    </div>
  )

  const peakMonths = model.chart.filter(c => c.season === '旺').map(c => c.month).join('、')
  const lowMonths = model.chart.filter(c => c.season === '淡').map(c => c.month).join('、')

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🔮 淡旺季 × {model.thisYear} 年底預測</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            季節指數取 {model.y2}~{model.y1} 兩年平均；預測＝今年實際節奏 × 季節指數。旺季：{peakMonths || '—'}｜淡季：{lowMonths || '—'}
          </p>
        </div>
        {canManage && (
          <button onClick={handleSave} disabled={saving}
            className="text-sm px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold">
            {saving ? '儲存中…' : '💾 儲存本次預測（供隔年驗證）'}
          </button>
        )}
      </div>

      {msg && (
        <div className={`my-2 px-3 py-2 rounded-xl text-sm border ${msg.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600'}`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      {/* 預估摘要 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 my-3">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3">
          <p className="text-xs text-gray-400">今年已完成（實際）</p>
          <p className="text-lg font-black text-gray-800 dark:text-gray-100 tabular-nums">{fmtW(model.ytd)}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-3">
          <p className="text-xs text-gray-400">預估全年</p>
          <p className="text-lg font-black text-indigo-700 dark:text-indigo-400 tabular-nums">{fmtW(model.projectedTotal)}</p>
        </div>
        <div className={`rounded-xl p-3 ${model.projectedTotal >= model.lastYearTotal ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className="text-xs text-gray-400">vs 去年全年 {fmtW(model.lastYearTotal)}</p>
          <p className={`text-lg font-black tabular-nums ${model.projectedTotal >= model.lastYearTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {model.lastYearTotal > 0 ? `${model.projectedTotal >= model.lastYearTotal ? '+' : ''}${((model.projectedTotal - model.lastYearTotal) / model.lastYearTotal * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* 圖：實際(實心) + 預測(半透明) + 前2年平均(線) */}
      <ResponsiveContainer width="100%" height={typeof window !== "undefined" && window.innerWidth < 640 ? 210 : 280}>
        <ComposedChart data={model.chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={fmtW} tick={{ fontSize: 12 }} width={52} />
          <Tooltip formatter={(v, n) => [Math.round(v).toLocaleString(), n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="實際" fill="#3B82F6" radius={[4, 4, 0, 0]}>
            {model.chart.map((c, i) => <Cell key={i} fill={c.season === '旺' ? '#2563EB' : '#3B82F6'} />)}
          </Bar>
          <Bar dataKey="預測" fill="#A5B4FC" radius={[4, 4, 0, 0]} fillOpacity={0.7} />
          <Line dataKey="前2年平均" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-1">深藍＝旺季月份；淺紫＝預測值；橘虛線＝前 2 年平均。旺季前 30~45 天請確認備貨。</p>

      {/* 閉迴路：歷次預測 vs 實際 */}
      {saved.length > 0 && (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">📋 歷次預測紀錄（閉迴路驗證）</p>
          <div className="space-y-1.5">
            {saved.map(rec => {
              const months = Object.keys(rec.predictions || {}).sort()
              let predSum = 0, actSum = 0, actualized = 0
              months.forEach(m => {
                predSum += rec.predictions[m] || 0
                const a = actualByYM[`${rec.target_year}-${m}`]
                if (a != null) { actSum += a; actualized++ }
              })
              const err = actualized > 0 && actSum > 0 ? (predSum * (actualized / months.length) - actSum) / actSum * 100 : null
              return (
                <div key={rec.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{new Date(rec.created_at).toLocaleDateString('zh-TW')} 預測 {rec.target_year} 年</span>
                  <span>全年預估 {fmtW(rec.projected_total)}</span>
                  <span>（當時累計 {fmtW(rec.ytd_at_save)}）</span>
                  {actualized > 0 ? (
                    <span className={Math.abs(err) <= 10 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      已驗證 {actualized}/{months.length} 個月，預測偏差 {err >= 0 ? '+' : ''}{err?.toFixed(1)}%
                    </span>
                  ) : <span className="text-gray-300">待實際資料驗證</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

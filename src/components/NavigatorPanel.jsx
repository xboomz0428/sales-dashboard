import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../config/supabase'
import { forecastYearEnd } from '../utils/forecast'

/**
 * 🧭 營運領航員
 * 雙軌目標階梯：公司整體（25%/年）× 好漢草（35%/年），從基期年複利展開到 10 年，
 * 每一年顯示 目標 / 實際（或今年的 YTD＋年底預測）/ 達成燈號；3・5・10 年為里程碑。
 * 設定（願景/基期/成長率）存 dashboard_settings.navigator_config，admin 可編輯。
 */
const DEFAULT_CONFIG = {
  vision: '成為台灣年輕漢方飲品與足浴、傳統文化的領頭羊',
  baseYear: 2025, baseCompany: 16364148, baseHero: 5595691,
  cagrCompany: 0.25, cagrHero: 0.35,
}
const HERO_BRAND = '好漢草'

const fmtW = v => {
  if (v == null) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + ' 萬'
  return Math.round(v).toLocaleString()
}

function Light({ ratio }) {
  if (ratio == null) return <span className="text-gray-300">—</span>
  const cls = ratio >= 1 ? 'bg-emerald-500' : ratio >= 0.9 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />
      <span className={`text-xs font-bold ${ratio >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ratio >= 0.9 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
        {(ratio * 100).toFixed(0)}%
      </span>
    </span>
  )
}

export default function NavigatorPanel({ allRows = [], canManage = false }) {
  const client = supabaseAdmin || supabase
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    if (!client) return
    const { data } = await client.from('dashboard_settings').select('value').eq('key', 'navigator_config').maybeSingle()
    if (data?.value) { try { setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(data.value) }) } catch { /* 用預設 */ } }
  }, [client])
  useEffect(() => { load() }, [load])

  const saveConfig = async () => {
    const next = {
      ...config, vision: form.vision,
      baseYear: parseInt(form.baseYear) || config.baseYear,
      baseCompany: Math.round(parseFloat(form.baseCompany) * 1e4) || config.baseCompany,
      baseHero: Math.round(parseFloat(form.baseHero) * 1e4) || config.baseHero,
      cagrCompany: (parseFloat(form.cagrCompany) || 25) / 100,
      cagrHero: (parseFloat(form.cagrHero) || 35) / 100,
    }
    const { error } = await client.from('dashboard_settings').upsert(
      { key: 'navigator_config', value: JSON.stringify(next), updated_at: new Date().toISOString() },
      { onConflict: 'key' })
    if (error) { setMsg({ ok: false, text: '儲存失敗：' + error.message }); return }
    setConfig(next); setEditing(false)
    setMsg({ ok: true, text: '目標設定已更新' })
  }

  // 各年實際（公司 / 好漢草）＋今年預測
  const model = useMemo(() => {
    if (!allRows.length) return null
    const actC = {}, actH = {}
    for (const r of allRows) {
      actC[r.year] = (actC[r.year] || 0) + (r.subtotal || 0)
      if (r.brand === HERO_BRAND) actH[r.year] = (actH[r.year] || 0) + (r.subtotal || 0)
    }
    const fcC = forecastYearEnd(allRows)
    const fcH = forecastYearEnd(allRows.filter(r => r.brand === HERO_BRAND))
    const currentYear = fcC?.year || String(new Date().getFullYear())

    const rows = []
    for (let n = 1; n <= 11; n++) {
      const y = config.baseYear + n
      const tC = config.baseCompany * Math.pow(1 + config.cagrCompany, n)
      const tH = config.baseHero * Math.pow(1 + config.cagrHero, n)
      const yS = String(y)
      const isCurrent = yS === currentYear
      const isPast = yS < currentYear
      const aC = isCurrent ? fcC?.projected : isPast ? actC[yS] : null
      const aH = isCurrent ? fcH?.projected : isPast ? actH[yS] : null
      const yearsOut = y - config.baseYear
      rows.push({
        year: y, milestone: yearsOut === 4 ? '3年' : yearsOut === 6 ? '5年' : yearsOut === 11 ? '10年' : yearsOut === 1 ? '今年' : '',
        tC, tH, aC, aH, isCurrent, isPast,
        rC: aC != null && tC > 0 ? aC / tC : null,
        rH: aH != null && tH > 0 ? aH / tH : null,
        heroShareTarget: tH / tC,
      })
    }
    return { rows, fcC, fcH, currentYear, actC, actH }
  }, [allRows, config])

  if (!model) return <p className="text-gray-400 text-base py-8 text-center">尚無資料</p>

  const cur = model.rows.find(r => String(r.year) === model.currentYear)
  const heroShareNow = model.fcC?.projected > 0 ? (model.fcH?.projected || 0) / model.fcC.projected : null

  return (
    <div className="space-y-5">
      {/* 願景 */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-emerald-700 to-teal-600 text-white shadow">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold tracking-widest opacity-80">🧭 十 年 願 景 · {config.baseYear + 11}</p>
            <h2 className="text-xl sm:text-2xl font-black mt-1 leading-snug">{config.vision}</h2>
            <p className="text-sm opacity-80 mt-2">
              雙軌成長：公司整體 <b>{Math.round(config.cagrCompany * 100)}%／年</b>　·　好漢草 <b>{Math.round(config.cagrHero * 100)}%／年</b>
              　（基期 {config.baseYear}：公司 {fmtW(config.baseCompany)}、好漢草 {fmtW(config.baseHero)}）
            </p>
          </div>
          {canManage && (
            <button onClick={() => { setForm({
              vision: config.vision, baseYear: config.baseYear,
              baseCompany: (config.baseCompany / 1e4).toFixed(0), baseHero: (config.baseHero / 1e4).toFixed(0),
              cagrCompany: Math.round(config.cagrCompany * 100), cagrHero: Math.round(config.cagrHero * 100),
            }); setEditing(true) }}
              className="text-sm px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 font-bold">✏️ 編輯目標</button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-xl text-sm border ${msg.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600'}`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      {/* 編輯表單 */}
      {editing && form && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 p-5 space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">編輯領航員目標（admin）</p>
          <input value={form.vision} onChange={e => setForm({ ...form, vision: e.target.value })}
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" placeholder="十年願景一句話" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
            {[['baseYear', '基期年'], ['baseCompany', '公司基期(萬)'], ['baseHero', '好漢草基期(萬)'], ['cagrCompany', '公司成長%'], ['cagrHero', '好漢草成長%']].map(([k, label]) => (
              <div key={k}>
                <label className="text-xs text-gray-400">{label}</label>
                <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 font-mono" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500">取消</button>
            <button onClick={saveConfig} className="text-sm px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">儲存</button>
          </div>
        </div>
      )}

      {/* 今年雙軌進度 */}
      {cur && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: '公司整體', t: cur.tC, fc: model.fcC, r: cur.rC, color: 'text-blue-700 dark:text-blue-400' },
            { name: '好漢草', t: cur.tH, fc: model.fcH, r: cur.rH, color: 'text-emerald-700 dark:text-emerald-400' },
          ].map(x => (
            <div key={x.name} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-black ${x.color}`}>{model.currentYear} 年 · {x.name}</p>
                <Light ratio={x.r} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div><p className="text-xs text-gray-400">目標</p><p className="font-black text-gray-800 dark:text-gray-100 tabular-nums">{fmtW(x.t)}</p></div>
                <div><p className="text-xs text-gray-400">已完成({x.fc?.monthsDone}月)</p><p className="font-black text-gray-800 dark:text-gray-100 tabular-nums">{fmtW(x.fc?.ytd)}</p></div>
                <div><p className="text-xs text-gray-400">年底預測</p><p className={`font-black tabular-nums ${x.r >= 1 ? 'text-emerald-600' : x.r >= 0.9 ? 'text-amber-500' : 'text-red-500'}`}>{fmtW(x.fc?.projected)}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {heroShareNow != null && (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
          🌿 轉型指標：好漢草預估占公司營收 <b className="text-emerald-600 dark:text-emerald-400">{(heroShareNow * 100).toFixed(0)}%</b>
          （雙軌成長下，10 年後目標占比約 {(model.rows[model.rows.length - 1].heroShareTarget * 100).toFixed(0)}%——好漢草將成為公司主體）
        </p>
      )}

      {/* 目標階梯 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 overflow-x-auto">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">🪜 十年目標階梯（每年 12 月檢視；綠 ≥100%・黃 ≥90%・紅 &lt;90%）</p>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700">
              <th className="text-left py-2 pr-2">年度</th>
              <th className="text-right py-2 px-2">公司目標</th>
              <th className="text-right py-2 px-2">公司實際/預測</th>
              <th className="text-center py-2 px-2">達成</th>
              <th className="text-right py-2 px-2 border-l border-gray-100 dark:border-gray-700 pl-4">好漢草目標</th>
              <th className="text-right py-2 px-2">好漢草實際/預測</th>
              <th className="text-center py-2 px-2">達成</th>
              <th className="text-right py-2 pl-2">好漢草占比目標</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map(r => (
              <tr key={r.year} className={`border-b border-gray-50 dark:border-gray-700/50 ${r.isCurrent ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''} ${r.milestone && !r.isCurrent ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                <td className="py-2 pr-2 font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {r.year}
                  {r.milestone && <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-black ${r.isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.milestone}</span>}
                </td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmtW(r.tC)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-gray-800 dark:text-gray-100">
                  {r.aC != null ? fmtW(r.aC) : '—'}{r.isCurrent && r.aC != null && <span className="text-[10px] text-gray-400 font-normal">預</span>}
                </td>
                <td className="py-2 px-2 text-center"><Light ratio={r.rC} /></td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-gray-600 dark:text-gray-300 border-l border-gray-100 dark:border-gray-700 pl-4">{fmtW(r.tH)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                  {r.aH != null ? fmtW(r.aH) : '—'}{r.isCurrent && r.aH != null && <span className="text-[10px] text-gray-400 font-normal">預</span>}
                </td>
                <td className="py-2 px-2 text-center"><Light ratio={r.rH} /></td>
                <td className="py-2 pl-2 text-right text-xs text-gray-400 tabular-nums">{(r.heroShareTarget * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">
          今年列＝實際 YTD＋季節指數年底預測（詳見趨勢分析的預測面板）；歷史年份補上後會自動亮燈。目標數字可由 admin「✏️ 編輯目標」調整。
        </p>
      </div>
    </div>
  )
}

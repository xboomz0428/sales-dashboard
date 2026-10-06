/**
 * GoogleAdsPanel — 行銷作戰室「Google 廣告」子頁
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 連線：填 Worker 網址 → 連結 Google 帳號 → 從帳號清單選客戶 ID（存設定中心）
 * ② 成效：近 7／14／30 天各活動花費、點擊、轉換、CPA、ROAS（同時寫入 google_ads_daily）
 * ③ 關鍵字建議產生器（Keyword Planner）＋閉迴路比對：
 *    每個建議字對照 關鍵字池／GSC 排名／實際搜尋字詞 → 給「機會／已覆蓋／浪費」建議 → 一鍵加入池或否定
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, supabaseReady } from '../../config/supabase'
import { asList } from '../../config/marketingDefaults'
import { checkText } from '../../utils/marketingCompliance'
import * as ads from '../../utils/googleAdsClient'

const CARD = 'bg-white dark:bg-gray-800 rounded-2xl border-2 border-[var(--line-strong)] dark:border-gray-700 p-4'
const BTN = 'min-h-[56px] px-5 rounded-2xl font-bold text-lg border-2 border-gray-900 dark:border-gray-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_PRIMARY = 'min-h-[56px] px-5 rounded-2xl font-bold text-lg text-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
const INPUT = 'w-full min-h-[56px] rounded-xl border-2 border-[var(--line-strong)] px-3 text-lg bg-white dark:bg-gray-900'
const fmt = n => n == null ? '—' : Math.round(n).toLocaleString()
const fmt1 = n => n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString()
const COMP = { LOW: ['低', '#0b5536', 'var(--mint-100)'], MEDIUM: ['中', '#8a4b00', 'var(--peach-100)'], HIGH: ['高', '#9b1c1c', 'var(--coral-100)'], UNSPECIFIED: ['—', '#3a4540', 'var(--bg-muted)'] }
const ADVICE = {
  negative:  { label: '已否定',        color: '#3a4540', bg: 'var(--bg-muted)' },
  converting:{ label: '已投放・有轉換', color: '#0b5536', bg: 'var(--mint-100)' },
  waste:     { label: '浪費・建議否定', color: '#9b1c1c', bg: 'var(--coral-100)' },
  covered:   { label: '自然已覆蓋・廣告補量', color: '#0b6ea3', bg: 'var(--sky-100)' },
  content:   { label: '排名 11–30・可衝內容', color: '#5a3fb0', bg: 'var(--lilac-100)' },
  opportunity:{ label: '機會・建議加入', color: '#0b5536', bg: 'var(--mint-100)' },
  pricey:    { label: '高競爭・出價貴', color: '#8a4b00', bg: 'var(--peach-100)' },
  longtail:  { label: '長尾・量小', color: '#3a4540', bg: 'var(--bg-muted)' },
  inpool:    { label: '已在關鍵字池', color: '#0b6ea3', bg: 'var(--sky-100)' },
}

function Trend({ monthly = [] }) {
  const xs = monthly.slice(-12); const max = Math.max(1, ...xs.map(m => m.searches))
  return <svg width="84" height="24" viewBox="0 0 84 24" aria-label="近 12 個月搜尋量趨勢" role="img">
    {xs.map((m, i) => <rect key={i} x={i * 7} y={24 - Math.max(2, m.searches / max * 22)} width="5" height={Math.max(2, m.searches / max * 22)} rx="1" fill={i === xs.length - 1 ? '#0b5536' : '#10744a'} />)}
  </svg>
}

export default function GoogleAdsPanel({ get, save, canManage, role, poolStats = [], userEmail = '' }) {
  const workerUrl = get('google.worker_url') || ''
  const customer = get('google.customer_id') || ''
  const isAdmin = role === 'admin'
  const [urlDraft, setUrlDraft] = useState(workerUrl)
  const [status, setStatus] = useState(null)          // { connected }
  const [accounts, setAccounts] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState([])
  const [seeds, setSeeds] = useState(() => {
    const core = asList(get('keywords.core')).flatMap(l => l.split('/').map(s => s.trim())).filter(Boolean)
    return Array.from(new Set([...core.slice(0, 8), ...poolStats.slice(0, 3).map(p => p.category)])).join('\n')
  })
  const [seedUrl, setSeedUrl] = useState('')
  const [ideas, setIdeas] = useState([])
  const [onlyOpp, setOnlyOpp] = useState(false)
  const [pool, setPool] = useState({})                 // keyword → { status, source }
  const [gsc, setGsc] = useState({})                   // query → { clicks, impressions, position }
  const [terms, setTerms] = useState({})               // search term → { cost, conversions }
  const [picked, setPicked] = useState(new Set())

  useEffect(() => { setUrlDraft(workerUrl) }, [workerUrl])

  const refreshStatus = useCallback(async () => {
    if (!workerUrl) return
    try { setStatus(await ads.getStatus(workerUrl)); setErr('') } catch (e) { setStatus(null); setErr(e.message) }
  }, [workerUrl])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  // 比對資料：關鍵字池、GSC 近 90 天
  useEffect(() => {
    if (!supabaseReady) return
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    supabase.from('keyword_pool').select('keyword,status,source').then(({ data }) => {
      const m = {}; for (const r of data || []) if (!m[r.keyword] || r.status === 'negative') m[r.keyword] = r; setPool(m)
    })
    supabase.from('gsc_daily').select('query,clicks,impressions,position').gte('date', from).limit(5000).then(({ data }) => {
      const m = {}; for (const r of data || []) { const o = (m[r.query] ||= { clicks: 0, impressions: 0, posSum: 0, n: 0 }); o.clicks += r.clicks || 0; o.impressions += r.impressions || 0; o.posSum += Number(r.position || 0); o.n++ }
      for (const k in m) m[k].position = m[k].n ? m[k].posSum / m[k].n : null
      setGsc(m)
    })
  }, [])

  const run = async (label, fn) => { setBusy(label); setErr(''); try { return await fn() } catch (e) { setErr(e.message) } finally { setBusy('') } }

  const saveUrl = () => run('url', async () => { await save('google.worker_url', urlDraft.trim()) })
  const link = () => run('link', async () => {
    const back = window.location.href.split('#')[0]
    const { url } = await ads.linkUrl(workerUrl, back)
    window.location.assign(url)
  })
  const loadAccounts = () => run('accounts', async () => { const { accounts } = await ads.listAccounts(workerUrl); setAccounts(accounts || []) })
  const chooseAccount = (id) => run('choose', async () => { await save('google.customer_id', id) })
  const loadCampaigns = () => run('campaigns', async () => { const { rows } = await ads.campaigns(workerUrl, customer, days); setRows(rows || []) })
  const loadTerms = () => run('terms', async () => {
    const { rows } = await ads.searchTerms(workerUrl, customer)
    const m = {}; for (const r of rows || []) m[r.keyword] = { cost: (r.cost_micros || 0) / 1e6, conversions: r.conversions || 0, clicks: r.clicks || 0 }
    setTerms(m)
  })
  const generate = () => run('ideas', async () => {
    const { ideas } = await ads.keywordIdeas(workerUrl, { customer, seeds: asList(seeds), url: seedUrl.trim() || undefined })
    setIdeas(ideas || []); setPicked(new Set())
  })

  const summary = useMemo(() => ads.summarizeCampaigns(rows), [rows])
  const totals = useMemo(() => summary.reduce((t, c) => ({ cost: t.cost + c.cost, clicks: t.clicks + c.clicks, conversions: t.conversions + c.conversions, value: t.value + c.value }), { cost: 0, clicks: 0, conversions: 0, value: 0 }), [summary])

  const judged = useMemo(() => ideas.map(k => {
    const p = pool[k.text], g = gsc[k.text], t = terms[k.text]
    let advice = 'longtail'
    if (p?.status === 'negative') advice = 'negative'
    else if (t && t.conversions > 0) advice = 'converting'
    else if (t && t.cost >= Number(get('alert.wasted_term_cost') || 500) && !t.conversions) advice = 'waste'
    else if (g?.position != null && g.position <= 10) advice = 'covered'
    else if (g?.position != null && g.position <= 30) advice = 'content'
    else if (p) advice = 'inpool'
    else if (k.avgMonthlySearches >= 500 && k.competition !== 'HIGH') advice = 'opportunity'
    else if (k.avgMonthlySearches >= 500) advice = 'pricey'
    const hits = checkText(k.text)
    return { ...k, pool: p, gsc: g, term: t, advice, claimWords: hits.map(h => h.word) }
  }).sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches), [ideas, pool, gsc, terms, get])
  const shown = onlyOpp ? judged.filter(k => k.advice === 'opportunity') : judged
  const counts = useMemo(() => judged.reduce((c, k) => { c[k.advice] = (c[k.advice] || 0) + 1; return c }, {}), [judged])

  const writePool = async (items, status) => run('pool', async () => {
    if (!supabaseReady) throw new Error('示範模式無法寫入關鍵字池')
    const rowsToWrite = items.map(k => ({ keyword: k.text, source: 'planner', volume: k.avgMonthlySearches, status, product_tag: null, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('keyword_pool').upsert(rowsToWrite, { onConflict: 'keyword,source' })
    if (error) throw new Error(error.message)
    setPool(m => { const n = { ...m }; for (const k of items) n[k.text] = { keyword: k.text, status, source: 'planner' }; return n })
    setPicked(new Set())
  })
  const copyPicked = async () => {
    const list = judged.filter(k => picked.has(k.text)).map(k => `${k.text}\t${k.avgMonthlySearches}\t${COMP[k.competition]?.[0] || ''}`).join('\n')
    try { await navigator.clipboard.writeText(list) } catch { /* 忽略 */ }
  }

  const Seg = ({ v, set, opts }) => <div className="flex gap-1 p-1 rounded-2xl border-2 border-gray-900 dark:border-gray-200 bg-white dark:bg-gray-800">
    {opts.map(o => <button key={o} type="button" onClick={() => set(o)} className={`flex-1 min-h-[48px] rounded-xl px-3 text-lg font-bold ${v === o ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : ''}`}>{o} 天</button>)}
  </div>

  return <div className="space-y-3">
    {err && <p className="text-base font-bold text-[#9b1c1c] bg-[var(--coral-100)] rounded-xl px-3 py-2 whitespace-pre-wrap">{err}</p>}

    {/* ① 連線 */}
    <div className={CARD} style={{ borderColor: status?.connected ? 'var(--mint-500)' : 'var(--peach-500)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xl font-black">① Google Ads 連線</p>
        <span className="rounded-full px-3 py-1 text-base font-black" style={{ background: status?.connected ? 'var(--mint-100)' : 'var(--peach-100)', color: status?.connected ? '#0b5536' : '#8a4b00' }}>
          {!workerUrl ? '未設定 Worker' : status == null ? '無法連到 Worker' : status.connected ? '已連結 Google 帳號' : '尚未連結 Google 帳號'}
        </span>
      </div>
      <label className="block text-lg font-bold mt-3">Worker 網址（部署 workers/google-sync 後填入）</label>
      <div className="flex gap-2 mt-1 flex-wrap">
        <input id="google-worker-url" className={INPUT + ' flex-1 min-w-[240px]'} value={urlDraft} onChange={e => setUrlDraft(e.target.value)} placeholder="https://google-sync.xxx.workers.dev" disabled={!isAdmin} />
        {isAdmin && urlDraft !== workerUrl && <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--mint-600)' }} disabled={busy === 'url'} onClick={saveUrl}>儲存</button>}
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--sky-500)' }} disabled={!workerUrl || !canManage || !!busy} onClick={link}>{status?.connected ? '重新連結 Google Ads' : '連結 Google Ads'}</button>
        <button type="button" className={BTN} disabled={!workerUrl || !!busy} onClick={() => { refreshStatus(); if (status?.connected) loadAccounts() }}>重新整理</button>
        {isAdmin && status?.connected && <button type="button" className={BTN} disabled={!!busy} onClick={() => run('disc', async () => { await ads.disconnect(workerUrl); refreshStatus() })}>解除連結</button>}
      </div>
      <div className="mt-3">
        <p className="text-lg font-bold">Google Ads 客戶 ID：<span className="font-black tabular-nums">{customer || '尚未選擇'}</span></p>
        {status?.connected && !accounts.length && <button type="button" className={BTN + ' mt-2'} disabled={!!busy} onClick={loadAccounts}>{busy === 'accounts' ? '讀取中…' : '列出可用帳號'}</button>}
        {accounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            {accounts.map(a => <button key={a.id} type="button" disabled={!canManage || !!busy} onClick={() => chooseAccount(a.id)}
              className={`min-h-[64px] rounded-xl border-2 px-3 text-left ${customer === a.id ? 'border-[var(--mint-500)] bg-[var(--mint-100)]' : 'border-[var(--line-strong)]'}`}>
              <span className="text-lg font-black tabular-nums">{a.id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</span>{a.manager ? <span className="ml-2 text-base font-bold">管理員帳戶</span> : null}
              <span className="block text-base font-semibold">{a.name || a.error || '（無名稱）'}{a.currency ? `｜${a.currency}` : ''}</span>
            </button>)}
          </div>
        )}
        <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">若帳號在管理員帳戶（MCC）底下，到「設定 → Google 廣告」填管理員帳戶 ID。</p>
      </div>
    </div>

    {/* ② 成效 */}
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xl font-black">② 活動成效</p>
        <div className="flex gap-2 items-center flex-wrap"><Seg v={days} set={setDays} opts={[7, 14, 30]} /><button type="button" className={BTN} disabled={!customer || !status?.connected || !!busy} onClick={loadCampaigns}>{busy === 'campaigns' ? '讀取中…' : '讀取'}</button></div>
      </div>
      {summary.length ? <>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
          {[['花費', 'NT$ ' + fmt(totals.cost)], ['點擊', fmt(totals.clicks)], ['轉換', fmt1(totals.conversions)], ['每筆成本', totals.conversions ? 'NT$ ' + fmt(totals.cost / totals.conversions) : '—'], ['ROAS', totals.cost ? fmt1(totals.value / totals.cost) + ' 倍' : '—']].map(([l, v]) => (
            <div key={l} className="rounded-xl border-2 border-[var(--line)] p-3"><p className="text-base font-semibold text-gray-700 dark:text-gray-300">{l}</p><p className="text-2xl font-black tabular-nums">{v}</p></div>
          ))}
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-base min-w-[640px]">
            <thead><tr className="text-left font-black border-b-2 border-[var(--line-strong)]"><th className="py-2 pr-2">活動</th><th className="py-2 pr-2 text-right">花費</th><th className="py-2 pr-2 text-right">點擊</th><th className="py-2 pr-2 text-right">轉換</th><th className="py-2 pr-2 text-right">CPA</th><th className="py-2 pr-2 text-right">ROAS</th></tr></thead>
            <tbody>{summary.map(c => <tr key={c.id} className="border-b-2 border-[var(--line)]">
              <td className="py-2 pr-2"><span className="font-bold">{c.name}</span> <span className="text-sm font-bold rounded-full px-2" style={{ background: c.status === 'ENABLED' ? 'var(--mint-100)' : 'var(--bg-muted)', color: c.status === 'ENABLED' ? '#0b5536' : '#3a4540' }}>{c.status === 'ENABLED' ? '進行中' : c.status === 'PAUSED' ? '暫停' : c.status}</span></td>
              <td className="py-2 pr-2 text-right tabular-nums">{fmt(c.cost)}</td><td className="py-2 pr-2 text-right tabular-nums">{fmt(c.clicks)}</td><td className="py-2 pr-2 text-right tabular-nums">{fmt1(c.conversions)}</td>
              <td className="py-2 pr-2 text-right tabular-nums" style={{ color: c.cpa != null && c.cpa > Number(get('bid.target_cpa')) * Number(get('alert.cpa_over_ratio')) ? '#9b1c1c' : undefined }}>{c.cpa != null ? fmt(c.cpa) : '—'}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{c.roas != null ? fmt1(c.roas) + 'x' : '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">讀取時已同步寫入 google_ads_daily；Worker 每天 06:30 也會自動回抓 {get('sync.ads_lookback_days')} 天。CPA 超過目標 × {get('alert.cpa_over_ratio')} 標紅。</p>
      </> : <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">{customer ? '按「讀取」取得各活動成效。' : '先完成連線並選擇客戶 ID。'}</p>}
    </div>

    {/* ③ 關鍵字建議 */}
    <div className={CARD}>
      <p className="text-xl font-black">③ 關鍵字建議產生器＋閉迴路比對</p>
      <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-1">用 Google Keyword Planner 產生建議字，逐字對照我們的關鍵字池、GSC 排名與實際搜尋字詞，直接給「機會／已覆蓋／浪費」的判斷。功效字可當關鍵字投放，但不能進標題。</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div><label className="block text-lg font-bold" htmlFor="kw-seeds">種子字（每行一個，最多 20）</label><textarea id="kw-seeds" className={INPUT + ' py-2'} rows={6} value={seeds} onChange={e => setSeeds(e.target.value)} /></div>
        <div>
          <label className="block text-lg font-bold" htmlFor="kw-url">或用網頁當種子（選填）</label><input id="kw-url" className={INPUT} value={seedUrl} onChange={e => setSeedUrl(e.target.value)} placeholder="https://你的官網/商品頁" />
          <div className="flex gap-2 mt-3 flex-wrap">
            <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--mint-600)' }} disabled={!customer || !status?.connected || !!busy} onClick={generate}>{busy === 'ideas' ? 'Google 計算中…' : '產生建議字'}</button>
            <button type="button" className={BTN} disabled={!customer || !status?.connected || !!busy} onClick={loadTerms} title="抓近 30 天實際搜尋字詞，用來標記浪費與有轉換的字">{busy === 'terms' ? '讀取中…' : Object.keys(terms).length ? `已載入搜尋字詞 ${Object.keys(terms).length}` : '載入實際搜尋字詞'}</button>
          </div>
          <p className="text-base font-semibold mt-2 text-gray-700 dark:text-gray-300">地區台灣、語言繁中（設定頁可改）。若 Google 回「權限不足」，代表 Cloud 專案的 Ads API 存取等級還不到 Basic。</p>
        </div>
      </div>
      {judged.length > 0 && <>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          {Object.entries(counts).map(([k, n]) => <span key={k} className="rounded-full px-3 py-1 text-base font-black" style={{ background: ADVICE[k].bg, color: ADVICE[k].color }}>{ADVICE[k].label} {n}</span>)}
          <button type="button" className={`min-h-[44px] px-4 rounded-full text-base font-bold border-2 ${onlyOpp ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'border-[var(--line-strong)]'}`} onClick={() => setOnlyOpp(v => !v)}>只看機會</button>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-base min-w-[760px]">
            <thead><tr className="text-left font-black border-b-2 border-[var(--line-strong)]">
              <th className="py-2 pr-2"><input type="checkbox" aria-label="全選" className="w-6 h-6" checked={picked.size > 0 && picked.size === shown.length} onChange={e => setPicked(e.target.checked ? new Set(shown.map(k => k.text)) : new Set())} /></th>
              <th className="py-2 pr-2">關鍵字</th><th className="py-2 pr-2 text-right">月搜尋</th><th className="py-2 pr-2">12 月趨勢</th><th className="py-2 pr-2">競爭</th><th className="py-2 pr-2 text-right">建議出價</th><th className="py-2 pr-2">我們的現況</th><th className="py-2 pr-2">判斷</th>
            </tr></thead>
            <tbody>{shown.map(k => {
              const a = ADVICE[k.advice]; const c = COMP[k.competition] || COMP.UNSPECIFIED
              return <tr key={k.text} className="border-b-2 border-[var(--line)]">
                <td className="py-2 pr-2"><input type="checkbox" aria-label={`選取 ${k.text}`} className="w-6 h-6" checked={picked.has(k.text)} onChange={e => setPicked(s => { const n = new Set(s); e.target.checked ? n.add(k.text) : n.delete(k.text); return n })} /></td>
                <td className="py-2 pr-2"><span className="font-bold">{k.text}</span>{k.claimWords.length ? <span className="block text-sm font-bold text-[#8a4b00]">含「{k.claimWords.join('、')}」：只當關鍵字，不進標題</span> : null}</td>
                <td className="py-2 pr-2 text-right tabular-nums font-black">{fmt(k.avgMonthlySearches)}</td>
                <td className="py-2 pr-2"><Trend monthly={k.monthly} /></td>
                <td className="py-2 pr-2"><span className="rounded-full px-2 py-0.5 font-black" style={{ background: c[2], color: c[1] }}>{c[0]}</span></td>
                <td className="py-2 pr-2 text-right tabular-nums">{k.lowTopBid != null ? `${fmt(k.lowTopBid)}–${fmt(k.highTopBid)}` : '—'}</td>
                <td className="py-2 pr-2 text-sm font-semibold">
                  {k.gsc ? `GSC 排名 ${fmt1(k.gsc.position)}・曝光 ${fmt(k.gsc.impressions)}` : 'GSC 無'}{k.term ? `｜投放花費 ${fmt(k.term.cost)}・轉換 ${fmt1(k.term.conversions)}` : ''}{k.pool ? `｜池：${k.pool.status}` : ''}
                </td>
                <td className="py-2 pr-2"><span className="rounded-full px-2 py-0.5 text-sm font-black whitespace-nowrap" style={{ background: a.bg, color: a.color }}>{a.label}</span></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {canManage && <div className="flex flex-wrap gap-2 mt-3 sticky bottom-20 md:bottom-2">
          <button type="button" className={BTN_PRIMARY} style={{ background: 'var(--mint-600)' }} disabled={!picked.size || !!busy} onClick={() => writePool(judged.filter(k => picked.has(k.text)), 'candidate')}>加入關鍵字池（{picked.size}）</button>
          <button type="button" className={BTN} disabled={!picked.size || !!busy} onClick={() => writePool(judged.filter(k => picked.has(k.text)), 'negative')}>標記為否定字</button>
          <button type="button" className={BTN} disabled={!judged.some(k => k.advice === 'opportunity') || !!busy} onClick={() => writePool(judged.filter(k => k.advice === 'opportunity'), 'active')}>所有「機會」設為投放中（下張企劃卡自動帶入）</button>
          <button type="button" className={BTN} disabled={!picked.size} onClick={copyPicked}>複製選取</button>
        </div>}
      </>}
    </div>
  </div>
}

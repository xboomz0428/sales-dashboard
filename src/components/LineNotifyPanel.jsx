import { useState, useMemo } from 'react'
import { formatDailySalesReport, formatWeeklyInvoiceReport, sendToLine } from '../utils/lineMessage'
import { supabase } from '../config/supabase'

const LS_KEY = 'line_notify_settings'
const WEEKDAYS = ['週日','週一','週二','週三','週四','週五','週六']

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

// ─── Edge Function 原始碼（顯示給用戶複製）──────────────────────────────────
const EDGE_FN_CODE = `// supabase/functions/line-push/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  try {
    const { channelToken, targetId, message } = await req.json()
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${channelToken}\`,
      },
      body: JSON.stringify({
        to: targetId,
        messages: [{ type: "text", text: message }],
      }),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: res.ok ? 200 : 400,
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})`

const CRON_SQL = `-- 每天晚上 8 點發送業績報告（台灣時間 = UTC+8，設 12:00 UTC）
select cron.schedule(
  'line-daily-sales',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/line-push',
    body := jsonb_build_object(
      'channelToken', (select value from app_settings where key = 'line_channel_token'),
      'targetId',     (select value from app_settings where key = 'line_target_id'),
      'message',      '（由 Edge Function 自行產生報告）'
    )
  );
  $$
);

-- 每週一上午 9 點發送對帳週報
select cron.schedule(
  'line-weekly-invoice',
  '0 1 * * 1',
  $$
  -- 同上，呼叫 Edge Function
  $$
);`

// ─── 區塊標題 ────────────────────────���───────────────────────��───────────────
function Section({ title, children, badge }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base font-bold text-gray-700 dark:text-gray-200">{title}</h3>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

// ─── 訊息預覽框 ─────────────────────────────────��────────────────────────────
function MessagePreview({ text }) {
  return (
    <div className="mt-3 bg-[#06C755]/5 dark:bg-[#06C755]/10 border border-[#06C755]/30 rounded-xl p-3">
      <p className="text-xs font-bold text-[#06C755] mb-1.5">📱 LINE 訊息預覽</p>
      <pre className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

// ─── 程式碼區塊 ──────────────────────────────────────────────────────────────
function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 dark:bg-gray-900 rounded-t-xl">
        <span className="text-xs text-gray-400">{label}</span>
        <button onClick={copy}
          className="text-xs text-gray-300 hover:text-white transition-colors">
          {copied ? '✓ 已複製' : '複製'}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-b-xl overflow-x-auto leading-relaxed max-h-52 scrollbar-thin">
        {code}
      </pre>
    </div>
  )
}

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export default function LineNotifyPanel({ salesData, invoiceRecords, allRows }) {
  const [settings, setSettings] = useState(loadSettings)
  const [sending, setSending] = useState(null)  // 'daily' | 'weekly' | null
  const [sendResult, setSendResult] = useState(null)
  const [showToken, setShowToken] = useState(false)
  const [activeGuide, setActiveGuide] = useState(null)

  const set = (k, v) => {
    const next = { ...settings, [k]: v }
    setSettings(next)
    saveSettings(next)
  }

  const isConfigured = !!(settings.channelToken && settings.targetId)
  const supabaseUrl = supabase?.supabaseUrl || ''

  // 產生訊息預覽
  const dailyPreview = useMemo(() => {
    try {
      return formatDailySalesReport({ ...salesData, allRows })
    } catch { return '（請先上傳銷售資料）' }
  }, [salesData, allRows])

  const weeklyPreview = useMemo(() => {
    try {
      return formatWeeklyInvoiceReport({ invoiceRecords })
    } catch { return '（尚無對帳資料）' }
  }, [invoiceRecords])

  const handleSend = async (type) => {
    if (!isConfigured) {
      setSendResult({ ok: false, msg: '請先填寫 Channel Token 和 User ID' })
      return
    }
    setSending(type)
    setSendResult(null)
    try {
      const message = type === 'daily' ? dailyPreview : weeklyPreview
      await sendToLine({
        supabaseUrl,
        channelToken: settings.channelToken,
        targetId: settings.targetId,
        message,
      })
      setSendResult({ ok: true, msg: `${type === 'daily' ? '業績報告' : '對帳週報'}已成功發送到 LINE！` })
    } catch (e) {
      setSendResult({ ok: false, msg: e.message })
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">LINE 通知設定</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
          每日業績自動推送、每週對帳進度提醒
        </p>
      </div>

      {/* 發送結果通知 */}
      {sendResult && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between border ${
          sendResult.ok
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-400'
        }`}>
          <span>{sendResult.ok ? '✓ ' : '✕ '}{sendResult.msg}</span>
          <button onClick={() => setSendResult(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Step 1：LINE 帳號設定 */}
      <Section title="① LINE 帳號設定" badge={isConfigured ? '已設定' : undefined}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase block mb-1">
              Channel Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={settings.channelToken || ''}
                onChange={e => set('channelToken', e.target.value)}
                placeholder="貼上 LINE Messaging API 的 Channel Access Token"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400 pr-16"
              />
              <button type="button" onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                {showToken ? '隱藏' : '顯示'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase block mb-1">
              推送對象 ID（User ID 或 Group ID）
            </label>
            <input
              type="text"
              value={settings.targetId || ''}
              onChange={e => set('targetId', e.target.value)}
              placeholder="例：Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-mono bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
            />
          </div>

          <button
            onClick={() => setActiveGuide(activeGuide === 'setup' ? null : 'setup')}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            {activeGuide === 'setup' ? '▲ 收起設定教學' : '▼ 如何取得 Token 和 User ID？'}
          </button>

          {activeGuide === 'setup' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <p className="font-bold">📋 設定步驟（約 10 分鐘）</p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
                <li>前往 <strong>LINE Developers Console</strong> → 建立 Provider → 建立 Messaging API Channel</li>
                <li>Channel 建立後，進入 <strong>Messaging API</strong> 頁籤 → 找到 <strong>Channel access token</strong> → 點「Issue」複製</li>
                <li>取得 <strong>User ID</strong>：掃描 QR Code 將 Bot 加為好友，傳任意訊息，後台 Webhook 會回傳你的 userId（格式 U 開頭 + 32 碼英數）</li>
                <li>或到 LINE App → 設定 → 個人檔案 → 複製「你的 ID」</li>
                <li>將以上資料填入上方欄位</li>
              </ol>
              <p className="text-xs text-blue-600 dark:text-blue-400">⚠️ Free tier 每月 500 則推播訊息，日常使用綽綽有餘。</p>
            </div>
          )}
        </div>
      </Section>

      {/* Step 2：立即發送 */}
      <Section title="② 立即發送">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 每日業績 */}
          <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📊</span>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">每日業績報告</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              包含今日業績、訂單數、最高客戶/品牌、本月累計與昨日比較
            </p>
            <button
              onClick={() => handleSend('daily')}
              disabled={sending === 'daily' || !isConfigured}
              className="w-full py-2 rounded-xl bg-[#06C755] hover:bg-[#05a847] disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {sending === 'daily' ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />發送中…</>
              ) : '📤 立即發送業績報告'}
            </button>
            <MessagePreview text={dailyPreview} />
          </div>

          {/* 週報 */}
          <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📋</span>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">對帳進度週報</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              包含本月發票總額、已入帳、待入帳、逾期清單
            </p>
            <button
              onClick={() => handleSend('weekly')}
              disabled={sending === 'weekly' || !isConfigured}
              className="w-full py-2 rounded-xl bg-[#06C755] hover:bg-[#05a847] disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {sending === 'weekly' ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />發送中…</>
              ) : '📤 立即發送對帳週報'}
            </button>
            <MessagePreview text={weeklyPreview} />
          </div>
        </div>
        {!isConfigured && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 text-center">
            ⚠️ 請先完成上方 LINE 帳號設定才能發送
          </p>
        )}
      </Section>

      {/* Step 3：自動排程 */}
      <Section title="③ 自動排程設定">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl text-sm text-amber-800 dark:text-amber-200">
            <p className="font-bold mb-1">⚙️ 需要 Supabase 後端支援</p>
            <p className="text-xs">自動排程需部署 Edge Function 並啟用 pg_cron。以下是完整設定步驟：</p>
          </div>

          <button
            onClick={() => setActiveGuide(activeGuide === 'edge' ? null : 'edge')}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
            <span>步驟 A：部署 Supabase Edge Function</span>
            <span className="text-gray-400">{activeGuide === 'edge' ? '▲' : '▼'}</span>
          </button>
          {activeGuide === 'edge' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
                在終端機執行以下指令，將 Function 部署到你的 Supabase 專案：
              </p>
              <CodeBlock
                label="Terminal"
                code={`npx supabase functions new line-push\n# 將下方程式碼貼入 supabase/functions/line-push/index.ts\nnpx supabase functions deploy line-push`}
              />
              <CodeBlock label="supabase/functions/line-push/index.ts" code={EDGE_FN_CODE} />
            </div>
          )}

          <button
            onClick={() => setActiveGuide(activeGuide === 'cron' ? null : 'cron')}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
            <span>步驟 B：設定 pg_cron 自動排程</span>
            <span className="text-gray-400">{activeGuide === 'cron' ? '▲' : '▼'}</span>
          </button>
          {activeGuide === 'cron' && (
            <div className="space-y-2">
              <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside px-1">
                <li>Supabase Dashboard → <strong>Database → Extensions</strong> → 啟用 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">pg_cron</code> 和 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">pg_net</code></li>
                <li>進入 <strong>SQL Editor</strong> → 執行以下 SQL</li>
              </ol>
              <CodeBlock label="SQL Editor" code={CRON_SQL} />
              <div className="text-xs text-gray-500 dark:text-gray-400 px-1 space-y-0.5">
                <p>• <code>0 12 * * *</code> = UTC 12:00（台灣時間晚上 8 點）每天執行</p>
                <p>• <code>0 1 * * 1</code> = UTC 週一 01:00（台灣時間週一上午 9 點）</p>
                <p>• 將 <code>YOUR_PROJECT</code> 換成你的 Supabase Project ID</p>
              </div>
            </div>
          )}

          {/* 排程時間偏好（僅作本地記錄/備忘） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">每日報告時間</label>
              <input
                type="time"
                value={settings.dailyTime || '20:00'}
                onChange={e => set('dailyTime', e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-400"
              />
              <p className="text-xs text-gray-400">設定後請對應修改 cron SQL</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">每週週報發送日</label>
              <select
                value={settings.weeklyDay ?? 1}
                onChange={e => set('weeklyDay', parseInt(e.target.value))}
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-400">
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <p className="text-xs text-gray-400">預設：週一早上 9 點</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 附註 */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-xs text-gray-400 dark:text-gray-500 space-y-1">
        <p>• Channel Token 和 User ID 僅存在本機（localStorage），不會上傳至伺服器</p>
        <p>• 訊息透過 Supabase Edge Function 轉發，不會暴露 Token 給前端其他使用者</p>
        <p>• LINE Messaging API 免費方案：每月 500 則推播訊息（每日+週報共約 5 則/週，綽綽有餘）</p>
      </div>
    </div>
  )
}

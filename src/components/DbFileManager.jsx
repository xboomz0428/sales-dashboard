import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../config/supabase'
import { cacheDel, SALES_CACHE_KEY } from '../utils/salesCache'

/**
 * 資料庫資料管理 — 顯示 sales_data 實際內容（依檔案分組），可刪除
 * ・每列：檔名、筆數、日期範圍、金額、批次數
 * ・批次數 > 1 = 上傳中斷留下的重複資料 → 紅色警示＋「清理重複」一鍵保留最新批次
 * ・刪除採分段刪（id 區間循環），不會逾時
 * ・新增資料＝上方「＋新增檔案」上傳（上傳會自動寫入資料庫）
 */
const fmtW = v => {
  if (v == null) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 萬'
  return Math.round(v).toLocaleString()
}
const STORAGE_BUCKET = 'sales-files'

// 分段刪除（同 useCloudData 的策略；extraFilter 用於「清理重複批次」）
async function deleteChunked(client, sourceFile, keepBatch = null) {
  const ID_WINDOW = 20000
  const applyFilter = (q) => {
    q = q.eq('source_file', sourceFile)
    if (keepBatch != null) q = q.or(`import_batch.is.null,import_batch.neq.${keepBatch}`)
    return q
  }
  let deleted = 0
  while (true) {
    const { data, error } = await applyFilter(
      client.from('sales_data').select('id').order('id', { ascending: true }).limit(1))
    if (error) throw error
    if (!data?.length) break
    const startId = data[0].id
    const { error: dErr } = await applyFilter(
      client.from('sales_data').delete().gte('id', startId).lt('id', startId + ID_WINDOW))
    if (dErr) throw dErr
    deleted += 1
  }
  return deleted
}

export default function DbFileManager({ canManage = true }) {
  const [files, setFiles] = useState(null)   // null = 載入中
  const [busy, setBusy] = useState(null)     // 檔名 = 該列操作中
  const [msg, setMsg] = useState(null)
  const client = supabaseAdmin || supabase

  const load = useCallback(async () => {
    if (!client) { setFiles([]); return }
    const { data, error } = await client.rpc('get_sales_files')
    if (error) { setMsg({ ok: false, text: '讀取失敗：' + error.message }); setFiles([]); return }
    setFiles(data || [])
  }, [client])

  useEffect(() => { load() }, [load])

  const afterChange = async () => {
    await cacheDel(SALES_CACHE_KEY)
    await load()
  }

  // 刪除整個檔案的資料庫資料（＋順手刪 Storage 同名檔與快取）
  const handleDelete = async (f) => {
    if (!window.confirm(`確定從資料庫刪除「${f.source_file}」的 ${Number(f.rows).toLocaleString()} 筆資料？\n（無法復原；雲端同名備份檔也會一併刪除）`)) return
    if (!window.confirm(`再次確認：真的要刪除「${f.source_file}」？`)) return
    setBusy(f.source_file); setMsg(null)
    try {
      await deleteChunked(client, f.source_file)
      try {
        await client.storage.from(STORAGE_BUCKET).remove([
          `shared/${f.source_file}`, `shared/${f.source_file}.rows.json`,
        ])
      } catch { /* Storage 沒有同名檔就算了 */ }
      await afterChange()
      setMsg({ ok: true, text: `已刪除「${f.source_file}」。重新整理頁面後圖表就會更新。` })
    } catch (e) {
      setMsg({ ok: false, text: `刪除失敗：${e.message}` })
    } finally { setBusy(null) }
  }

  // 清理重複批次：只保留最新批次
  const handleDedup = async (f) => {
    if (!window.confirm(`「${f.source_file}」有 ${f.batches} 個批次（重複資料）。\n清理後只保留最新批次，確定執行？`)) return
    setBusy(f.source_file); setMsg(null)
    try {
      await deleteChunked(client, f.source_file, f.latest_batch)
      await afterChange()
      setMsg({ ok: true, text: `已清理「${f.source_file}」的重複批次。重新整理頁面後圖表就會更新。` })
    } catch (e) {
      setMsg({ ok: false, text: `清理失敗：${e.message}` })
    } finally { setBusy(null) }
  }

  const totalRows = (files || []).reduce((s, f) => s + Number(f.rows), 0)
  const hasDup = (files || []).some(f => Number(f.batches) > 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🗃️ 資料庫資料管理（sales_data）</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            資料庫實際儲存的銷售資料，共 {totalRows.toLocaleString()} 筆。新增資料請用上方「＋新增檔案」上傳（會自動寫入資料庫）
          </p>
        </div>
        <button onClick={load}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
          🔄 重新整理清單
        </button>
      </div>

      {msg && (
        <div className={`mt-2 px-3 py-2 rounded-xl text-sm border ${msg.ok
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400'}`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}
      {hasDup && (
        <div className="mt-2 px-3 py-2 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 font-semibold">
          ⚠️ 偵測到重複批次（同檔案存了多份，金額會灌水）——請按該列的「清理重複」
        </div>
      )}

      <div className="overflow-x-auto mt-3">
        {files == null ? (
          <p className="text-sm text-gray-400 py-6 text-center">載入中…</p>
        ) : !files.length ? (
          <p className="text-sm text-gray-400 py-6 text-center">資料庫目前沒有銷售資料，請上傳檔案</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
                <th className="text-left  py-2 pr-2">檔案</th>
                <th className="text-right py-2 px-2">筆數</th>
                <th className="text-center py-2 px-2">日期範圍</th>
                <th className="text-right py-2 px-2">金額(小計)</th>
                <th className="text-center py-2 px-2">批次</th>
                {canManage && <th className="text-right py-2 pl-2">操作</th>}
              </tr>
            </thead>
            <tbody>
              {files.map(f => {
                const dup = Number(f.batches) > 1
                const working = busy === f.source_file
                return (
                  <tr key={f.source_file} className={`border-b border-gray-50 dark:border-gray-700/50 ${dup ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="py-2.5 pr-2 font-semibold text-gray-700 dark:text-gray-200 max-w-[240px] truncate" title={f.source_file}>{f.source_file}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{Number(f.rows).toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-center text-xs text-gray-500 dark:text-gray-400">{f.min_date} ~ {f.max_date}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-600 dark:text-gray-300">{fmtW(Number(f.subtotal))}</td>
                    <td className="py-2.5 px-2 text-center">
                      {dup
                        ? <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">⚠️ {f.batches} 份</span>
                        : <span className="text-xs text-gray-400">1</span>}
                    </td>
                    {canManage && (
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        {dup && (
                          <button onClick={() => handleDedup(f)} disabled={working}
                            className="text-xs px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold mr-1.5">
                            {working ? '處理中…' : '🧹 清理重複'}
                          </button>
                        )}
                        <button onClick={() => handleDelete(f)} disabled={working}
                          className="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                          {working ? '…' : '🗑 刪除'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        刪除/清理後，<span className="font-semibold">重新整理頁面</span>即可看到更新後的圖表（本地快取會自動作廢）。
      </p>
    </div>
  )
}

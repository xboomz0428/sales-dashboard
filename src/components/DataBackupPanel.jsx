import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseReady } from '../config/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function DataBackupPanel({
  productCosts,
  cloudFiles,
  allRows,
  onRestore,
}) {
  const { user, role } = useAuth()
  const canManage = role === 'admin' || role === 'manager'

  const [backups,     setBackups]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [creating,    setCreating]    = useState(false)
  const [restoring,   setRestoring]   = useState(null) // backup id
  const [backupName,  setBackupName]  = useState('')
  const [showForm,    setShowForm]    = useState(false)
  const [notice,      setNotice]      = useState('')
  const [error,       setError]       = useState('')

  const showNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

  // ── 載入備份清單 ────────────────────────────────────────────────────────
  const loadBackups = useCallback(async () => {
    if (!user) return
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('data_backups')
        .select('*')
        .order('created_at', { ascending: false })

      // 非 admin 只看自己的備份
      if (role !== 'admin') {
        query = query.eq('creator_id', user.id)
      }

      const { data, error: err } = await query
      if (err) throw err
      setBackups(data || [])
    } catch (e) {
      setError('載入備份失敗：' + e.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id, role])

  useEffect(() => { loadBackups() }, [loadBackups])

  // ── 建立備份 ────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!backupName.trim()) return
    if (!supabaseReady) { setError('示範模式無法使用備份功能，請先設定 Supabase 環境變數'); return }
    setCreating(true)
    setError('')
    try {
      const { error: err } = await supabase.from('data_backups').insert({
        name:          backupName.trim(),
        creator_id:    user.id,
        creator_email: user.email,
        costs:         productCosts || {},
        file_paths:    (cloudFiles || []).map(f => f.path),
        row_count:     allRows?.length || 0,
      })
      if (err) throw err

      showNotice('✓ 備份已建立')
      setBackupName('')
      setShowForm(false)
      await loadBackups()
    } catch (e) {
      setError('備份失敗：' + e.message)
    } finally {
      setCreating(false)
    }
  }

  // ── 刪除備份 ────────────────────────────────────────────────────────────
  async function handleDelete(backup) {
    if (!confirm(`確定要刪除備份「${backup.name}」？`)) return
    setError('')
    try {
      const { error: err } = await supabase
        .from('data_backups')
        .delete()
        .eq('id', backup.id)
      if (err) throw err
      setBackups(prev => prev.filter(b => b.id !== backup.id))
      showNotice('✓ 備份已刪除')
    } catch (e) {
      setError('刪除失敗：' + e.message)
    }
  }

  // ── 還原備份 ────────────────────────────────────────────────────────────
  async function handleRestore(backup) {
    if (!confirm(`確定要還原備份「${backup.name}」？\n目前的資料將被取代。`)) return
    setRestoring(backup.id)
    try {
      await onRestore?.(backup)
      showNotice(`✓ 已還原備份：${backup.name}`)
    } catch (e) {
      setError('還原失敗：' + e.message)
    } finally {
      setRestoring(null)
    }
  }

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8">

      {/* 標題 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">資料備份與還原</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            儲存目前狀態，紀錄操作人員與時間，必要時可一鍵還原
          </p>
        </div>
        {canManage && supabaseReady && (
          <button
            onClick={() => { setShowForm(v => !v); setError('') }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            💾 建立備份
          </button>
        )}
      </div>

      {/* 示範模式提示 */}
      {!supabaseReady && (
        <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl text-sm text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-semibold">⚠️ 示範模式 — 備份功能不可用</p>
          <p className="text-xs opacity-80">請在 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env</code> 或 Vercel 環境變數中設定 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">VITE_SUPABASE_URL</code> 與 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>，即可啟用備份功能。</p>
        </div>
      )}

      {/* 通知 / 錯誤 */}
      {notice && (
        <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="opacity-60 hover:opacity-100 ml-2">✕</button>
        </div>
      )}

      {/* 建立備份表單 */}
      {showForm && canManage && (
        <form onSubmit={handleCreate}
          className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-700 dark:text-gray-200">建立新備份</h3>

          {/* 目前狀態摘要 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <span>📊 資料：<strong className="text-gray-700 dark:text-gray-200">{(allRows?.length || 0).toLocaleString()} 筆</strong></span>
            <span>📁 檔案：<strong className="text-gray-700 dark:text-gray-200">{(cloudFiles || []).length} 個</strong></span>
            <span>💲 成本設定：<strong className="text-gray-700 dark:text-gray-200">{Object.keys(productCosts || {}).length} 項</strong></span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">備份名稱</label>
            <input
              type="text" required value={backupName}
              onChange={e => setBackupName(e.target.value)}
              placeholder={`備份 ${new Date().toLocaleDateString('zh-TW')}`}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={creating}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              {creating && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {creating ? '備份中…' : '確認備份'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              取消
            </button>
          </div>
        </form>
      )}

      {/* 備份清單 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            載入備份記錄…
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <div className="text-4xl mb-3">💾</div>
            <p className="text-sm">尚無備份記錄</p>
            {canManage && <p className="text-xs mt-1 opacity-70">點擊「建立備份」儲存目前的資料狀態</p>}
          </div>
        ) : (
          <>
            {/* 桌機表格 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <th className="text-left px-5 py-3 font-semibold">備份名稱</th>
                    <th className="text-center px-4 py-3 font-semibold">操作人員</th>
                    <th className="text-center px-4 py-3 font-semibold">建立時間</th>
                    <th className="text-right px-4 py-3 font-semibold">資料筆數</th>
                    <th className="text-center px-4 py-3 font-semibold">檔案數</th>
                    <th className="text-center px-4 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-800 dark:text-gray-100">💾 {b.name}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{b.creator_email}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(b.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {(b.row_count || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs">
                        {(b.file_paths || []).length}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canManage && (
                            <button
                              onClick={() => handleRestore(b)}
                              disabled={restoring === b.id}
                              className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-700/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                            >
                              {restoring === b.id ? '還原中…' : '還原'}
                            </button>
                          )}
                          {(role === 'admin' || b.creator_id === user?.id) && (
                            <button
                              onClick={() => handleDelete(b)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 手機卡片 */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
              {backups.map(b => (
                <div key={b.id} className="p-4 space-y-2">
                  <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">💾 {b.name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                    <div>👤 {b.creator_email}</div>
                    <div>🕐 {fmtDate(b.created_at)}</div>
                    <div>📊 {(b.row_count || 0).toLocaleString()} 筆 · 📁 {(b.file_paths || []).length} 個檔案</div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {canManage && (
                      <button
                        onClick={() => handleRestore(b)}
                        disabled={restoring === b.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                      >
                        {restoring === b.id ? '還原中…' : '還原'}
                      </button>
                    )}
                    {(role === 'admin' || b.creator_id === user?.id) && (
                      <button
                        onClick={() => handleDelete(b)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 底部統計 */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 text-xs text-gray-400 dark:text-gray-500">
              共 {backups.length} 筆備份記錄
            </div>
          </>
        )}
      </div>

      {/* 說明 */}
      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 px-1">
        <p>• 備份內容包含：已上傳的雲端檔案清單、商品成本設定</p>
        <p>• 還原時會重新下載備份時的檔案並重新解析，若檔案已被刪除則無法還原</p>
        <p>• 系統管理員可查看所有人的備份記錄；其他角色只能查看自己的備份</p>
      </div>
    </div>
  )
}

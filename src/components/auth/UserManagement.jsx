import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { ROLES } from '../../contexts/AuthContext'

const ROLE_OPTIONS = [
  { value: 'admin',   label: '系統管理員', desc: '全部功能' },
  { value: 'manager', label: '管理者',     desc: '分析 + 成本 + 目標' },
  { value: 'viewer',  label: '檢視者',     desc: '唯讀瀏覽' },
]

export default function UserManagement({ currentUserId }) {
  const [users,    setUsers]    = useState([])   // [{ id, email, role, created_at, last_sign_in_at }]
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [notice,   setNotice]   = useState('')

  // 新增帳號表單
  const [showForm,   setShowForm]   = useState(false)
  const [newEmail,   setNewEmail]   = useState('')
  const [newPwd,     setNewPwd]     = useState('')
  const [showPwd,    setShowPwd]    = useState(false)
  const [newRole,    setNewRole]    = useState('viewer')
  const [creating,   setCreating]   = useState(false)

  // 角色變更
  const [updatingId, setUpdatingId] = useState(null)

  // ── 載入使用者清單 ──────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!supabaseAdmin) {
        setError('未設定 VITE_SUPABASE_SERVICE_KEY，無法列出使用者')
        return
      }
      // 取得所有 auth users
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
      if (authErr) throw authErr

      // 取得所有角色
      const { data: roles, error: roleErr } = await supabaseAdmin.from('user_roles').select('id, role')
      if (roleErr) throw roleErr

      const roleMap = Object.fromEntries((roles || []).map(r => [r.id, r.role]))

      const list = (authData?.users || []).map(u => ({
        id:              u.id,
        email:           u.email,
        role:            roleMap[u.id] || 'viewer',
        created_at:      u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed:       !!u.email_confirmed_at,
      }))
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      setUsers(list)
    } catch (e) {
      setError('載入失敗：' + (e.message || '請確認 service_role key 正確'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  // ── 新增帳號 ─────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!newEmail.trim() || !newPwd) return
    setCreating(true)
    setError('')
    try {
      if (!supabaseAdmin) throw new Error('未設定 service_role key')

      // 建立 auth user（email_confirm: true 跳過驗證信）
      const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email:            newEmail.trim(),
        password:         newPwd,
        email_confirm:    true,
      })
      if (createErr) throw createErr

      const uid = data.user.id

      // 寫入角色（upsert 防重複）
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .upsert({ id: uid, role: newRole }, { onConflict: 'id' })
      if (roleErr) throw roleErr

      setNotice(`✓ 已建立帳號：${newEmail.trim()}（${ROLES[newRole]?.label}）`)
      setTimeout(() => setNotice(''), 4000)
      setNewEmail(''); setNewPwd(''); setNewRole('viewer'); setShowForm(false)
      await loadUsers()
    } catch (e) {
      setError(e.message || '建立失敗')
    } finally {
      setCreating(false)
    }
  }

  // ── 更改角色 ─────────────────────────────────────────────────────────────
  async function handleRoleChange(uid, newRoleVal) {
    if (uid === currentUserId && newRoleVal !== 'admin') {
      if (!confirm('確定要降低自己的權限嗎？')) return
    }
    setUpdatingId(uid)
    setError('')
    try {
      const { error } = await supabaseAdmin
        .from('user_roles')
        .upsert({ id: uid, role: newRoleVal }, { onConflict: 'id' })
      if (error) throw error
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRoleVal } : u))
      setNotice('✓ 角色已更新')
      setTimeout(() => setNotice(''), 3000)
    } catch (e) {
      setError('更新失敗：' + e.message)
    } finally {
      setUpdatingId(null)
    }
  }

  // ── 刪除帳號 ─────────────────────────────────────────────────────────────
  async function handleDelete(uid, email) {
    if (uid === currentUserId) { setError('無法刪除自己的帳號'); return }
    if (!confirm(`確定要刪除帳號「${email}」？此操作無法復原。`)) return
    setError('')
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid)
      if (error) throw error
      setUsers(prev => prev.filter(u => u.id !== uid))
      setNotice(`✓ 已刪除帳號：${email}`)
      setTimeout(() => setNotice(''), 3000)
    } catch (e) {
      setError('刪除失敗：' + e.message)
    }
  }

  // ── 格式化日期 ────────────────────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4 px-1 pb-8">

      {/* 標題 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">使用者管理</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">建立帳號、設定角色權限</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError('') }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <span className="text-lg leading-none">＋</span> 新增帳號
        </button>
      </div>

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

      {/* 新增帳號表單 */}
      {showForm && (
        <form onSubmit={handleCreate}
          className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-700 dark:text-gray-200">新增帳號</h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">電子郵件</label>
              <input
                type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">初始密碼</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} required minLength={6}
                  value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  placeholder="最少 6 個字元"
                  className="w-full px-3 py-2 pr-9 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" tabIndex={-1}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">角色</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map(r => (
                <button key={r.value} type="button" onClick={() => setNewRole(r.value)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    newRole === r.value
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                  }`}>
                  {r.label}
                  <span className="ml-1.5 text-xs opacity-70">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={creating}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              {creating && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {creating ? '建立中…' : '建立帳號'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              取消
            </button>
          </div>
        </form>
      )}

      {/* 使用者列表 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            載入使用者中…
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <div className="text-4xl mb-3">👥</div>
            <p>尚無使用者</p>
          </div>
        ) : (
          <>
            {/* 桌機表格 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <th className="text-left px-5 py-3 font-semibold">電子郵件</th>
                    <th className="text-center px-4 py-3 font-semibold">角色</th>
                    <th className="text-center px-4 py-3 font-semibold">狀態</th>
                    <th className="text-center px-4 py-3 font-semibold">建立日期</th>
                    <th className="text-center px-4 py-3 font-semibold">最後登入</th>
                    <th className="text-center px-4 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const roleInfo = ROLES[u.role]
                    const isSelf = u.id === currentUserId
                    return (
                      <tr key={u.id} className={`border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors ${isSelf ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                        <td className="px-5 py-3">
                          <span className="font-medium text-gray-800 dark:text-gray-100">{u.email}</span>
                          {isSelf && <span className="ml-2 text-xs text-blue-500 font-semibold">（我）</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            disabled={updatingId === u.id}
                            className={`text-xs font-bold px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${roleInfo?.badge || ''} bg-transparent`}
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          {updatingId === u.id && <span className="ml-1 inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin align-middle" />}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.confirmed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {u.confirmed ? '已驗證' : '未驗證'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs">{fmtDate(u.created_at)}</td>
                        <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs">{fmtDate(u.last_sign_in_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {!isSelf && (
                            <button onClick={() => handleDelete(u.id, u.email)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              刪除
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 手機卡片 */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
              {users.map(u => {
                const roleInfo = ROLES[u.role]
                const isSelf = u.id === currentUserId
                return (
                  <div key={u.id} className={`p-4 space-y-3 ${isSelf ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-100 text-sm truncate">{u.email}</p>
                        {isSelf && <span className="text-xs text-blue-500 font-semibold">（我）</span>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${roleInfo?.badge}`}>{roleInfo?.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={updatingId === u.id}
                        className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {!isSelf && (
                        <button onClick={() => handleDelete(u.id, u.email)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          刪除帳號
                        </button>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
                      <span>建立：{fmtDate(u.created_at)}</span>
                      <span>登入：{fmtDate(u.last_sign_in_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 底部統計 */}
        {!loading && users.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>共 {users.length} 個帳號</span>
            <div className="flex gap-3">
              {ROLE_OPTIONS.map(r => {
                const count = users.filter(u => u.role === r.value).length
                return count > 0 ? (
                  <span key={r.value}>{r.label} {count}</span>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

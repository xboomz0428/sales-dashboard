import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { ROLES, TAB_DEFS, ROLE_TABS_DEFAULT } from '../../contexts/AuthContext'
import { useAuth } from '../../contexts/AuthContext'

const ROLE_OPTIONS = [
  { value: 'admin',   label: '系統管理員', desc: '全部功能' },
  { value: 'manager', label: '管理者',     desc: '分析 + 成本 + 目標' },
  { value: 'viewer',  label: '檢視者',     desc: '唯讀瀏覽' },
]

// ─── 功能權限設定區塊 ─────────────────────────────────────────────────────────
function PermissionsEditor({ onNotice, onError }) {
  const { refreshPermissions } = useAuth()

  // permissions: { manager: Set<string>, viewer: Set<string> }
  const [permissions, setPermissions] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [open,        setOpen]        = useState(false)

  const loadPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const defaults = {
        manager: new Set(ROLE_TABS_DEFAULT.manager),
        viewer:  new Set(ROLE_TABS_DEFAULT.viewer),
      }
      if (!supabaseAdmin) { setPermissions(defaults); return }

      const { data } = await supabaseAdmin
        .from('role_permissions')
        .select('role, allowed_tabs')

      if (data?.length) {
        data.forEach(r => {
          if (r.role === 'manager' || r.role === 'viewer') {
            defaults[r.role] = new Set(r.allowed_tabs)
          }
        })
      }
      setPermissions(defaults)
    } catch {
      setPermissions({
        manager: new Set(ROLE_TABS_DEFAULT.manager),
        viewer:  new Set(ROLE_TABS_DEFAULT.viewer),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  function toggle(role, tabId) {
    setPermissions(prev => {
      const next = { ...prev, [role]: new Set(prev[role]) }
      next[role].has(tabId) ? next[role].delete(tabId) : next[role].add(tabId)
      return next
    })
  }

  function toggleAll(role, checked) {
    setPermissions(prev => ({
      ...prev,
      [role]: checked ? new Set(TAB_DEFS.map(t => t.id)) : new Set(),
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const rows = ['manager', 'viewer'].map(role => ({
        role,
        allowed_tabs: [...permissions[role]],
        updated_at: new Date().toISOString(),
      }))

      let saveErr
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('role_permissions')
          .upsert(rows, { onConflict: 'role' })
        saveErr = error
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .upsert(rows, { onConflict: 'role' })
        saveErr = error
      }

      if (saveErr) throw saveErr

      await refreshPermissions?.()
      onNotice('✓ 功能權限設定已儲存，即刻生效')
    } catch (e) {
      onError('儲存失敗：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // 依群組分組
  const groups = [...new Set(TAB_DEFS.map(t => t.group))]

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
      {/* 標題列（可折疊） */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🔐</span>
          <div className="text-left">
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100">功能區塊權限設定</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">設定各角色可存取的功能頁籤</div>
          </div>
        </div>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              載入權限設定…
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-5">
              {/* 說明 */}
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                ⚠️ <strong>系統管理員</strong>固定可見全部功能，無法限制。<br />
                勾選代表該角色<strong>可以看到</strong>此功能頁籤。
              </div>

              {/* 權限矩陣 */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[380px]">
                  <thead>
                    <tr className="text-xs text-gray-400 dark:text-gray-500">
                      <th className="text-left py-2 px-3 font-semibold w-full">功能頁籤</th>
                      {['manager', 'viewer'].map(r => (
                        <th key={r} className="text-center py-2 px-3 font-semibold whitespace-nowrap min-w-[90px]">
                          <div>{ROLES[r]?.label}</div>
                          <button
                            onClick={() => {
                              const allChecked = TAB_DEFS.every(t => permissions[r].has(t.id))
                              toggleAll(r, !allChecked)
                            }}
                            className="text-[10px] font-normal text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline mt-0.5 block mx-auto"
                          >
                            {TAB_DEFS.every(t => permissions[r].has(t.id)) ? '取消全選' : '全選'}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(group => (
                      <>
                        <tr key={`group-${group}`}>
                          <td colSpan={3} className="pt-3 pb-1 px-3">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                              {group}
                            </span>
                          </td>
                        </tr>
                        {TAB_DEFS.filter(t => t.group === group).map(tab => (
                          <tr key={tab.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 rounded-lg">
                            <td className="py-1.5 px-3 text-gray-700 dark:text-gray-200">{tab.label}</td>
                            {['manager', 'viewer'].map(r => (
                              <td key={r} className="py-1.5 px-3 text-center">
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={permissions[r].has(tab.id)}
                                    onChange={() => toggle(r, tab.id)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                                </label>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 儲存按鈕 */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  管理者 {permissions.manager.size}/{TAB_DEFS.length} 個功能 ·
                  檢視者 {permissions.viewer.size}/{TAB_DEFS.length} 個功能
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? '儲存中…' : '儲存權限設定'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 使用者管理主元件 ──────────────────────────────────────────────────────────
export default function UserManagement({ currentUserId }) {
  const [users,    setUsers]    = useState([])
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
        setError('SERVICE_KEY_MISSING')
        return
      }
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
      if (authErr) throw authErr

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

      const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email:         newEmail.trim(),
        password:      newPwd,
        email_confirm: true,
      })
      if (createErr) throw createErr

      const uid = data.user.id
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
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">建立帳號、設定角色與功能權限</p>
        </div>
        {supabaseAdmin && (
          <button
            onClick={() => { setShowForm(v => !v); setError('') }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">＋</span> 新增帳號
          </button>
        )}
      </div>

      {/* 通知 / 錯誤 */}
      {notice && (
        <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}
      {error === 'SERVICE_KEY_MISSING' ? (
        <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl space-y-3">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">⚠️ 需要設定 Service Role Key 才能管理使用者</p>
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
            <p>1. 前往 <strong>Supabase Dashboard → Project Settings → API</strong></p>
            <p>2. 複製 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">service_role</code> 的 Secret key（不是 anon key）</p>
            <p>3. 加入環境變數：</p>
            <p className="ml-3">
              <span className="font-semibold">本機開發：</span>在 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env</code> 加入<br />
              <code className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded block mt-0.5">VITE_SUPABASE_SERVICE_KEY=eyJhbGci...</code>
            </p>
            <p className="ml-3">
              <span className="font-semibold">Vercel 部署：</span>前往 <strong>Vercel Dashboard → Settings → Environment Variables</strong><br />
              新增 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">VITE_SUPABASE_SERVICE_KEY</code>，然後重新部署
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="opacity-60 hover:opacity-100 ml-2">✕</button>
        </div>
      ) : null}

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

      {/* 功能權限設定 */}
      <PermissionsEditor
        onNotice={msg => { setNotice(msg); setTimeout(() => setNotice(''), 4000) }}
        onError={msg => setError(msg)}
      />
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { ROLES, TAB_DEFS, ROLE_TABS_DEFAULT } from '../../contexts/AuthContext'
import { useAuth } from '../../contexts/AuthContext'

const ROLE_OPTIONS = [
  { value: 'admin',   label: '系統管理員', desc: '全部功能' },
  { value: 'manager', label: '管理者',     desc: '分析 + 成本 + 目標' },
  { value: 'viewer',  label: '檢視者',     desc: '唯讀瀏覽' },
]

// 依群組整理 TAB_DEFS
const TAB_GROUPS = [...new Set(TAB_DEFS.map(t => t.group))].map(group => ({
  label: group,
  tabs:  TAB_DEFS.filter(t => t.group === group),
}))

// ─── 階層式勾選器（主功能群組 → 子功能） ─────────────────────────────────────
function HierarchyPermEditor({ selected, onChange }) {
  // selected: Set<string>

  function isGroupChecked(group) {
    return group.tabs.every(t => selected.has(t.id))
  }
  function isGroupIndeterminate(group) {
    const some = group.tabs.some(t => selected.has(t.id))
    const all  = group.tabs.every(t => selected.has(t.id))
    return some && !all
  }

  function toggleGroup(group, checked) {
    const next = new Set(selected)
    group.tabs.forEach(t => checked ? next.add(t.id) : next.delete(t.id))
    onChange(next)
  }

  function toggleTab(tabId) {
    const next = new Set(selected)
    next.has(tabId) ? next.delete(tabId) : next.add(tabId)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {TAB_GROUPS.map(group => (
        <div key={group.label} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* 主功能標題列 */}
          <label className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isGroupChecked(group)}
              ref={el => { if (el) el.indeterminate = isGroupIndeterminate(group) }}
              onChange={e => toggleGroup(group, e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{group.label}</span>
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {group.tabs.filter(t => selected.has(t.id)).length}/{group.tabs.length}
            </span>
          </label>

          {/* 子功能列表 */}
          <div className="px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {group.tabs.map(tab => (
              <label key={tab.id} className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={selected.has(tab.id)}
                  onChange={() => toggleTab(tab.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                  {tab.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 個人權限設定 Modal ───────────────────────────────────────────────────────
function UserPermModal({ user: targetUser, onClose, onSaved }) {
  const [useDefault, setUseDefault]  = useState(true)   // true = 跟角色設定走
  const [selected,   setSelected]    = useState(new Set())
  const [dataYears,  setDataYears]   = useState('')
  const [loading,    setLoading]     = useState(true)
  const [saving,     setSaving]      = useState(false)

  useEffect(() => {
    loadUserPerm()
  }, [targetUser.id])

  async function loadUserPerm() {
    setLoading(true)
    try {
      const client = supabaseAdmin || supabase
      const { data } = await client
        .from('user_permissions')
        .select('allowed_tabs, data_years')
        .eq('user_id', targetUser.id)
        .maybeSingle()

      if (data) {
        setUseDefault(false)
        setSelected(new Set(data.allowed_tabs ?? []))
        setDataYears(data.data_years != null ? String(data.data_years) : '')
      } else {
        // 無個人設定 → 顯示角色預設值作為初始值
        setUseDefault(true)
        const roleDefault = ROLE_TABS_DEFAULT[targetUser.role] ?? []
        setSelected(new Set(roleDefault))
        setDataYears('')
      }
    } catch {
      setUseDefault(true)
      setSelected(new Set(ROLE_TABS_DEFAULT[targetUser.role] ?? []))
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const client = supabaseAdmin || supabase
      if (useDefault) {
        // 刪除個人設定 → 回到角色預設
        await client.from('user_permissions').delete().eq('user_id', targetUser.id)
      } else {
        await client.from('user_permissions').upsert({
          user_id:      targetUser.id,
          allowed_tabs: [...selected],
          data_years:   dataYears !== '' ? parseInt(dataYears, 10) : null,
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id' })
      }
      onSaved()
      onClose()
    } catch (e) {
      alert('儲存失敗：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="font-bold text-gray-800 dark:text-gray-100">個人功能權限</div>
            <div className="text-xs text-gray-400 mt-0.5">{targetUser.email}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              載入中…
            </div>
          ) : (
            <>
              {/* 說明 */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl text-xs text-blue-700 dark:text-blue-400">
                個人權限會覆蓋角色預設值，僅對此帳號生效。選「跟角色設定走」可清除個人設定。
              </div>

              {/* 使用角色預設 toggle */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={e => setUseDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">跟角色設定走</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    使用「{ROLES[targetUser.role]?.label}」的角色預設權限，不套用個人設定
                  </div>
                </div>
              </label>

              {!useDefault && (
                <>
                  {/* 資料年限 */}
                  <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-100 dark:border-gray-700 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">資料可視年限</span>
                    <input
                      type="number" min="1" max="99"
                      value={dataYears}
                      onChange={e => setDataYears(e.target.value)}
                      placeholder="不限"
                      className="w-20 px-2.5 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400 w-16">
                      {dataYears ? `最近 ${dataYears} 年` : '不限制'}
                    </span>
                  </div>

                  {/* 階層式勾選 */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      功能頁籤
                      <span className="ml-2 normal-case font-normal text-gray-400">
                        已選 {selected.size}/{TAB_DEFS.length}
                      </span>
                    </div>
                    <HierarchyPermEditor selected={selected} onChange={setSelected} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            取消
          </button>
          <button onClick={save} disabled={saving || loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 角色級功能權限設定（主功能/子功能階層） ─────────────────────────────────
function PermissionsEditor({ onNotice, onError }) {
  const { refreshPermissions } = useAuth()

  const [permissions, setPermissions] = useState(null)
  const [dataYears,   setDataYears]   = useState({ manager: '', viewer: '' })
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
      const defaultYears = { manager: '', viewer: '' }
      if (!supabaseAdmin) { setPermissions(defaults); setDataYears(defaultYears); return }

      const { data } = await supabaseAdmin
        .from('role_permissions')
        .select('role, allowed_tabs, data_years')

      if (data?.length) {
        data.forEach(r => {
          if (r.role === 'manager' || r.role === 'viewer') {
            defaults[r.role] = new Set(r.allowed_tabs)
            defaultYears[r.role] = r.data_years != null ? String(r.data_years) : ''
          }
        })
      }
      setPermissions(defaults)
      setDataYears(defaultYears)
    } catch {
      setPermissions({
        manager: new Set(ROLE_TABS_DEFAULT.manager),
        viewer:  new Set(ROLE_TABS_DEFAULT.viewer),
      })
      setDataYears({ manager: '', viewer: '' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  async function save() {
    setSaving(true)
    try {
      const rows = ['manager', 'viewer'].map(role => ({
        role,
        allowed_tabs: [...permissions[role]],
        data_years: dataYears[role] !== '' ? parseInt(dataYears[role], 10) : null,
        updated_at: new Date().toISOString(),
      }))

      const client = supabaseAdmin || supabase
      const { error } = await client
        .from('role_permissions')
        .upsert(rows, { onConflict: 'role' })
      if (error) throw error

      await refreshPermissions?.()
      onNotice('✓ 角色功能權限已儲存，即刻生效')
    } catch (e) {
      onError('儲存失敗：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🔐</span>
          <div className="text-left">
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100">角色功能區塊設定</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">設定管理者/檢視者的預設可存取頁籤（個人設定可進一步覆蓋）</div>
          </div>
        </div>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              載入中…
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-5">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                ⚠️ <strong>系統管理員</strong>固定可見全部功能，無法限制。此設定為角色預設值，可被個人權限覆蓋。
              </div>

              {/* 資料年限 */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl space-y-3">
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  資料可視年限（預設值）
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {['manager', 'viewer'].map(r => (
                    <div key={r}>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        {ROLES[r]?.label}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="1" max="99"
                          value={dataYears[r]}
                          onChange={e => setDataYears(prev => ({ ...prev, [r]: e.target.value }))}
                          placeholder="不限"
                          className="w-20 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {dataYears[r] ? `最近 ${dataYears[r]} 年` : '不限制'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 各角色的階層式勾選 */}
              <div className="grid md:grid-cols-2 gap-5">
                {['manager', 'viewer'].map(r => (
                  <div key={r}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{ROLES[r]?.label}</div>
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => setPermissions(prev => ({ ...prev, [r]: new Set(TAB_DEFS.map(t => t.id)) }))}
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 underline">全選</button>
                        <button onClick={() => setPermissions(prev => ({ ...prev, [r]: new Set() }))}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">清除</button>
                      </div>
                    </div>
                    {permissions && (
                      <HierarchyPermEditor
                        selected={permissions[r]}
                        onChange={sel => setPermissions(prev => ({ ...prev, [r]: sel }))}
                      />
                    )}
                    <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      已選 {permissions?.[r]?.size ?? 0}/{TAB_DEFS.length} 個功能
                    </div>
                  </div>
                ))}
              </div>

              {/* 儲存 */}
              <div className="flex justify-end pt-1">
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors">
                  {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? '儲存中…' : '儲存角色權限'}
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
  const { refreshUserPermissions } = useAuth()
  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [notice,   setNotice]   = useState('')

  const [showForm,   setShowForm]   = useState(false)
  const [newEmail,   setNewEmail]   = useState('')
  const [newPwd,     setNewPwd]     = useState('')
  const [showPwd,    setShowPwd]    = useState(false)
  const [newRole,    setNewRole]    = useState('viewer')
  const [creating,   setCreating]   = useState(false)

  const [updatingId, setUpdatingId] = useState(null)

  // 個人權限 Modal 狀態
  const [permModal, setPermModal] = useState(null)   // null | { id, email, role }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!supabaseAdmin) { setError('SERVICE_KEY_MISSING'); return }
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
      if (authErr) throw authErr

      const { data: roles, error: roleErr } = await supabaseAdmin.from('user_roles').select('id, role')
      if (roleErr) throw roleErr

      // 讀取已設定個人權限的 user_id 清單（用來標記是否有個人設定）
      const { data: userPerms } = await supabaseAdmin
        .from('user_permissions')
        .select('user_id')
      const userPermSet = new Set((userPerms || []).map(p => p.user_id))

      const roleMap = Object.fromEntries((roles || []).map(r => [r.id, r.role]))

      const list = (authData?.users || []).map(u => ({
        id:              u.id,
        email:           u.email,
        role:            roleMap[u.id] || 'viewer',
        created_at:      u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed:       !!u.email_confirmed_at,
        hasCustomPerm:   userPermSet.has(u.id),
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

  async function handleCreate(e) {
    e.preventDefault()
    if (!newEmail.trim() || !newPwd) return
    setCreating(true); setError('')
    try {
      if (!supabaseAdmin) throw new Error('未設定 service_role key')
      const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: newEmail.trim(), password: newPwd, email_confirm: true,
      })
      if (createErr) throw createErr

      const uid = data.user.id
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles').upsert({ id: uid, role: newRole }, { onConflict: 'id' })
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

  async function handleRoleChange(uid, newRoleVal) {
    if (uid === currentUserId && newRoleVal !== 'admin') {
      if (!confirm('確定要降低自己的權限嗎？')) return
    }
    setUpdatingId(uid); setError('')
    try {
      const { error } = await supabaseAdmin
        .from('user_roles').upsert({ id: uid, role: newRoleVal }, { onConflict: 'id' })
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

  function handlePermSaved() {
    setNotice('✓ 個人權限已儲存，立即生效')
    setTimeout(() => setNotice(''), 4000)
    loadUsers()  // 重新載入以更新 hasCustomPerm 標記
    // 若是修改自己的權限，刷新 context
    if (permModal?.id === currentUserId) {
      refreshUserPermissions?.(currentUserId)
    }
  }

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
            <p>2. 複製 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">service_role</code> 的 Secret key</p>
            <p>3. 加入環境變數 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">VITE_SUPABASE_SERVICE_KEY=...</code></p>
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
              <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">初始密碼</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} required minLength={6}
                  value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  placeholder="最少 6 個字元"
                  className="w-full px-3 py-2 pr-9 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                  {r.label}<span className="ml-1.5 text-xs opacity-70">{r.desc}</span>
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
                    <th className="text-center px-4 py-3 font-semibold">最後登入</th>
                    <th className="text-center px-4 py-3 font-semibold">個人權限</th>
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
                        <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs">{fmtDate(u.last_sign_in_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => setPermModal({ id: u.id, email: u.email, role: u.role })}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                u.hasCustomPerm
                                  ? 'border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {u.hasCustomPerm ? '⚙ 個人設定' : '設定'}
                            </button>
                          )}
                          {u.role === 'admin' && (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
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
                        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => setPermModal({ id: u.id, email: u.email, role: u.role })}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            u.hasCustomPerm
                              ? 'border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {u.hasCustomPerm ? '⚙ 個人權限' : '設定權限'}
                        </button>
                      )}
                      {!isSelf && (
                        <button onClick={() => handleDelete(u.id, u.email)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          刪除
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      登入：{fmtDate(u.last_sign_in_at)}
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
                return count > 0 ? <span key={r.value}>{r.label} {count}</span> : null
              })}
            </div>
          </div>
        )}
      </div>

      {/* 角色功能權限設定 */}
      <PermissionsEditor
        onNotice={msg => { setNotice(msg); setTimeout(() => setNotice(''), 4000) }}
        onError={msg => setError(msg)}
      />

      {/* 個人權限 Modal */}
      {permModal && (
        <UserPermModal
          user={permModal}
          onClose={() => setPermModal(null)}
          onSaved={handlePermSaved}
        />
      )}
    </div>
  )
}

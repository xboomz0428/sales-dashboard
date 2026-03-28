import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin, supabaseReady } from '../config/supabase'

// ─── 角色定義 ────────────────────────────────────────────────────────────────
// admin   : 全部功能 + 使用者管理
// manager : 全部分析功能（含成本、目標、預警）
// viewer  : 唯讀瀏覽（分析圖表，不可編輯成本 / 目標）
export const ROLES = {
  admin:   { label: '系統管理員', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  manager: { label: '管理者',     badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  viewer:  { label: '檢視者',     badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
}

// 所有可設定的功能區塊（不含 users/backup，這兩個固定依角色控制）
export const TAB_DEFS = [
  { id: 'summary',     label: '老闆視角',  group: '分析' },
  { id: 'performance', label: '績效矩陣',  group: '分析' },
  { id: 'comparison',  label: '對比分析',  group: '分析' },
  { id: 'trend',       label: '趨勢分析',  group: '分析' },
  { id: 'product',     label: '產品分析',  group: '分析' },
  { id: 'customer',    label: '客戶分析',  group: '分析' },
  { id: 'channel',     label: '通路分析',  group: '分析' },
  { id: 'brand',       label: '品牌分析',  group: '分析' },
  { id: 'heatmap',     label: '熱力圖',    group: '分析' },
  { id: 'table',       label: '資料表格',  group: '分析' },
  { id: 'costs',       label: '商品成本',  group: '管理' },
  { id: 'goals',       label: '目標管理',  group: '管理' },
  { id: 'alerts',      label: '預警中心',  group: '管理' },
  { id: 'health',      label: '客戶健康',  group: '進階' },
  { id: 'forecast',    label: '預測分析',  group: '進階' },
  { id: 'flow',        label: '流程架構',  group: '進階' },
]

// 預設角色可見 Tab（作為 DB 尚未設定時的 fallback）
// backup：admin + manager 可見（固定，不由 DB 設定）
// users ：admin 可見（固定）
export const ROLE_TABS_DEFAULT = {
  admin:   null,
  manager: ['summary','performance','comparison','trend','product','customer',
             'channel','brand','heatmap','table','costs','goals','alerts',
             'health','forecast','flow','backup'],
  viewer:  ['summary','performance','comparison','trend','product','customer',
             'channel','brand','heatmap','table','health','forecast','flow'],
}

// 保留向下相容的 export
export const ROLE_TABS = ROLE_TABS_DEFAULT

// 各角色功能權限
export const ROLE_PERMS = {
  admin:   { editCosts: true,  editGoals: true,  uploadData: true,  manageUsers: true  },
  manager: { editCosts: true,  editGoals: true,  uploadData: true,  manageUsers: false },
  viewer:  { editCosts: false, editGoals: false, uploadData: false, manageUsers: false },
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null)   // Supabase User 物件
  const [role,          setRole]          = useState(null)   // 'admin' | 'manager' | 'viewer'
  const [loading,       setLoading]       = useState(true)
  const [authError,     setAuthError]     = useState(null)
  const [dbPermissions, setDbPermissions] = useState(null)   // { manager: string[], viewer: string[] }

  // ── 示範模式（Supabase 未設定時） ────────────────────────────────────────
  const demoMode = !supabaseReady

  // ── 從 DB 載入角色可見 Tab 設定 ──────────────────────────────────────────
  const fetchRolePermissions = useCallback(async () => {
    if (!supabaseReady) return
    try {
      const { data } = await supabase
        .from('role_permissions')
        .select('role, allowed_tabs')
      if (data?.length) {
        setDbPermissions(Object.fromEntries(data.map(r => [r.role, r.allowed_tabs])))
      }
    } catch { /* 靜默失敗，使用預設值 */ }
  }, [])

  // ── 監聽 Supabase 會話變化 ───────────────────────────────────────────────
  // Supabase v2: onAuthStateChange 訂閱後會立即以 INITIAL_SESSION 事件
  // 回傳目前會話，不需另外呼叫 getSession()，避免重複觸發 fetchRole。
  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false)
      return
    }

    fetchRolePermissions()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user)
          await fetchRole(session.user.id)
        } else {
          setUser(null)
          setRole(null)
          setLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [fetchRolePermissions])

  // ── 檢查系統是否已有 admin ────────────────────────────────────────────────
  async function hasAnyAdmin() {
    if (!supabaseAdmin) return false
    try {
      const { count } = await supabaseAdmin
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
      return (count ?? 0) > 0
    } catch { return false }
  }

  // ── 從 user_roles 資料表取得角色 ─────────────────────────────────────────
  async function fetchRole(uid) {
    try {
      // 優先用 admin client 讀取（繞過 RLS），確保能讀到自己的角色
      const readClient = supabaseAdmin || supabase
      const { data, error } = await readClient
        .from('user_roles')
        .select('role')
        .eq('id', uid)
        .maybeSingle()

      if (error) throw error

      if (data?.role) {
        // 已有角色：若為 viewer 且系統沒有任何 admin，自動升級為 admin
        if (data.role === 'viewer') {
          const noAdmin = !(await hasAnyAdmin())
          if (noAdmin) {
            await readClient
              .from('user_roles')
              .update({ role: 'admin' })
              .eq('id', uid)
            setRole('admin')
            setLoading(false)
            return
          }
        }
        setRole(data.role)
      } else {
        // 全新使用者：若系統無 admin，成為 admin；否則設為 viewer
        const noAdmin = !(await hasAnyAdmin())
        const newRole = noAdmin ? 'admin' : 'viewer'
        await readClient
          .from('user_roles')
          .upsert({ id: uid, role: newRole }, { onConflict: 'id' })
        setRole(newRole)
      }
    } catch {
      setRole('viewer')
    } finally {
      setLoading(false)
    }
  }

  // ── 登入 ─────────────────────────────────────────────────────────────────
  async function login(email, password) {
    setAuthError(null)

    if (demoMode) {
      // 示範模式：依帳號決定角色
      const demoRoles = {
        'admin@demo.com':   'admin',
        'manager@demo.com': 'manager',
        'viewer@demo.com':  'viewer',
      }
      const demoRole = demoRoles[email] || 'viewer'
      setUser({ id: email, email, user_metadata: { full_name: email.split('@')[0] } })
      setRole(demoRole)
      return { success: true }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = {
        'Invalid login credentials':         '帳號或密碼錯誤',
        'Email not confirmed':               '請先至信箱驗證帳號',
        'Too many requests':                 '登入失敗次數過多，請稍後再試',
        'User not found':                    '找不到此帳號',
      }[error.message] || error.message || '登入失敗，請確認帳號密碼'
      setAuthError(msg)
      return { success: false, error: msg }
    }

    return { success: true, user: data.user }
  }

  // ── 登出 ─────────────────────────────────────────────────────────────────
  async function logout() {
    if (supabaseReady) await supabase.auth.signOut()
    setUser(null)
    setRole(null)
  }

  const perms    = role ? ROLE_PERMS[role] : {}
  const roleInfo = role ? ROLES[role]      : null

  // 動態 allowedTabs：優先使用 DB 設定，fallback 至預設值
  // admin 永遠是 null（全部可見）
  const allowedTabs = role
    ? (role === 'admin'
        ? null
        : (dbPermissions?.[role] ?? ROLE_TABS_DEFAULT[role]))
    : []

  const value = {
    user, role, loading, authError, demoMode,
    login, logout,
    perms, allowedTabs,
    isLoggedIn: !!user,
    roleInfo,
    refreshPermissions: fetchRolePermissions,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

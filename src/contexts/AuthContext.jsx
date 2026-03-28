import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, supabaseReady } from '../config/supabase'

// ─── 角色定義 ────────────────────────────────────────────────────────────────
// admin   : 全部功能 + 使用者管理
// manager : 全部分析功能（含成本、目標、預警）
// viewer  : 唯讀瀏覽（分析圖表，不可編輯成本 / 目標）
export const ROLES = {
  admin:   { label: '系統管理員', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  manager: { label: '管理者',     badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  viewer:  { label: '檢視者',     badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
}

// 各角色可看到的 Tab ID（null = 全部可見）
export const ROLE_TABS = {
  admin:   null,
  manager: ['summary','performance','comparison','trend','product','customer',
             'channel','brand','heatmap','table','costs','goals','alerts',
             'health','forecast','flow'],
  viewer:  ['summary','performance','comparison','trend','product','customer',
             'channel','brand','heatmap','table','health','forecast','flow'],
}

// 各角色功能權限
export const ROLE_PERMS = {
  admin:   { editCosts: true,  editGoals: true,  uploadData: true,  manageUsers: true  },
  manager: { editCosts: true,  editGoals: true,  uploadData: true,  manageUsers: false },
  viewer:  { editCosts: false, editGoals: false, uploadData: false, manageUsers: false },
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null)   // Supabase User 物件
  const [role,      setRole]      = useState(null)   // 'admin' | 'manager' | 'viewer'
  const [loading,   setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)

  // ── 示範模式（Supabase 未設定時） ────────────────────────────────────────
  const demoMode = !supabaseReady

  // ── 監聽 Supabase 會話變化 ───────────────────────────────────────────────
  // Supabase v2: onAuthStateChange 訂閱後會立即以 INITIAL_SESSION 事件
  // 回傳目前會話，不需另外呼叫 getSession()，避免重複觸發 fetchRole。
  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false)
      return
    }

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
  }, [])

  // ── 從 user_roles 資料表取得角色 ─────────────────────────────────────────
  async function fetchRole(uid) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', uid)
        .maybeSingle()

      if (error) throw error

      if (data?.role) {
        setRole(data.role)
      } else {
        // 新使用者：建立預設 viewer 角色
        await supabase
          .from('user_roles')
          .insert({ id: uid, role: 'viewer' })
          .select()
        setRole('viewer')
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

  const perms       = role ? ROLE_PERMS[role] : {}
  const allowedTabs = role ? ROLE_TABS[role]  : []
  const roleInfo    = role ? ROLES[role]      : null

  const value = {
    user, role, loading, authError, demoMode,
    login, logout,
    perms, allowedTabs,
    isLoggedIn: !!user,
    roleInfo,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

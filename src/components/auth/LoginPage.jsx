import { useState } from 'react'
import { useAuth, ROLES } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { login, authError, demoMode } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    if (!email.trim()) return setLocalError('請輸入電子郵件')
    if (!password)      return setLocalError('請輸入密碼')
    setSubmitting(true)
    const res = await login(email.trim(), password)
    if (!res.success) setLocalError(res.error || authError || '登入失敗')
    setSubmitting(false)
  }

  function fillDemo(role) {
    setEmail(`${role}@demo.com`)
    setPassword('demo1234')
    setLocalError('')
  }

  const error = localError || authError

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center px-4 py-8">

      {/* Logo + 標題 */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">📊</div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">銷售數據分析系統</h1>
        <p className="text-blue-300 text-sm mt-1">Sales Dashboard</p>
      </div>

      {/* 登入卡片 */}
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
          <h2 className="text-white font-bold text-lg">登入帳號</h2>
          <p className="text-blue-200 text-xs mt-0.5">請使用您的帳號密碼登入</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* 示範模式提示 */}
          {demoMode && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3">
              <p className="text-amber-700 dark:text-amber-400 text-xs font-semibold mb-1">⚡ 示範模式（Firebase 未設定）</p>
              <p className="text-amber-600 dark:text-amber-500 text-xs">點擊下方快速登入，或輸入任意帳號體驗功能</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              電子郵件
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              密碼
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                tabIndex={-1}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl px-4 py-2.5">
              <span className="text-red-500 text-sm flex-shrink-0">⚠️</span>
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* 登入按鈕 */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                登入中...
              </>
            ) : '登入'}
          </button>
        </form>

        {/* 示範帳號 */}
        {demoMode && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-6 pb-6">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-3 pt-4">快速體驗（示範帳號）</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ROLES).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => fillDemo(key)}
                  className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-center"
                >
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${info.badge}`}>{info.label}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">{key}@demo</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 角色說明 */}
      <div className="w-full max-w-md mt-6 grid grid-cols-3 gap-3">
        {Object.entries(ROLES).map(([key, info]) => {
          const descs = {
            admin:   '全部功能、使用者管理',
            manager: '分析、成本、目標設定',
            viewer:  '圖表瀏覽、唯讀',
          }
          return (
            <div key={key} className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className={`text-xs font-bold ${info.badge.includes('red') ? 'text-red-300' : info.badge.includes('blue') ? 'text-blue-300' : 'text-gray-300'} mb-1`}>{info.label}</p>
              <p className="text-gray-400 text-xs leading-snug">{descs[key]}</p>
            </div>
          )
        })}
      </div>

      <p className="text-gray-600 dark:text-gray-500 text-xs mt-6">
        Sales Dashboard v0.0.24
      </p>
    </div>
  )
}

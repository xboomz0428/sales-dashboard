import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin, supabaseReady } from '../config/supabase'

// ─── 狀態卡片 ────────────────────────────────────────────────────────────────
function StatusCard({ icon, label, value, sub, ok, loading }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
        loading ? 'bg-gray-100 dark:bg-gray-700' :
        ok === true  ? 'bg-emerald-50 dark:bg-emerald-900/30' :
        ok === false ? 'bg-red-50 dark:bg-red-900/30' :
                       'bg-blue-50 dark:bg-blue-900/30'
      }`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{label}</div>
        {loading
          ? <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse mt-1" />
          : <div className="text-base font-bold text-gray-800 dark:text-gray-100 mt-0.5 leading-tight">{value}</div>
        }
        {sub && !loading && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {!loading && ok !== undefined && (
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
          ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
             : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
        }`}>{ok ? '正常' : '異常'}</span>
      )}
    </div>
  )
}

// ─── 資料表狀態列 ─────────────────────────────────────────────────────────────
function TableRow({ name, count, ok, desc }) {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      <td className="px-4 py-2.5">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 font-mono">{name}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{desc}</div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{count ?? '—'}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">筆</span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-400'}`} />
      </td>
    </tr>
  )
}

// ─── 主元件 ───────────────────────────────────────────────────────────────────
export default function DatabaseStatusPanel({ cloudFiles, allRows }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState(null)

  const checkStatus = useCallback(async () => {
    setLoading(true)
    const result = {
      supabaseOk: supabaseReady,
      adminOk:    !!supabaseAdmin,
      users:      { total: 0, admin: 0, manager: 0, viewer: 0, list: [] },
      tables:     { user_roles: null, user_costs: null, data_backups: null, role_permissions: null },
      storage:    { files: cloudFiles.length, fileList: [...cloudFiles] },
      rows:       allRows.length,
    }

    if (supabaseAdmin) {
      // ── 使用者統計 ──
      try {
        const { data: auth } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 })
        result.users.total = auth?.users?.length || 0
        result.users.list  = (auth?.users || []).map(u => ({
          email: u.email,
          created: u.created_at,
          last:    u.last_sign_in_at,
          confirmed: !!u.email_confirmed_at,
        }))
      } catch {}

      // ── 角色分布 ──
      try {
        const { data: roles } = await supabaseAdmin.from('user_roles').select('role')
        result.tables.user_roles = roles?.length ?? 0
        if (roles) {
          result.users.admin   = roles.filter(r => r.role === 'admin').length
          result.users.manager = roles.filter(r => r.role === 'manager').length
          result.users.viewer  = roles.filter(r => r.role === 'viewer').length
        }
      } catch {}

      // ── user_costs 表 ──
      try {
        const { count } = await supabaseAdmin
          .from('user_costs')
          .select('*', { count: 'exact', head: true })
        result.tables.user_costs = count ?? 0
      } catch {}

      // ── data_backups 表 ──
      try {
        const { count } = await supabaseAdmin
          .from('data_backups')
          .select('*', { count: 'exact', head: true })
        result.tables.data_backups = count ?? 0
      } catch {}

      // ── role_permissions 表 ──
      try {
        const { count } = await supabaseAdmin
          .from('role_permissions')
          .select('*', { count: 'exact', head: true })
        result.tables.role_permissions = count ?? 0
      } catch {}

      // ── 取得雲端實際檔案（all users，admin 可見） ──
      // 注意：這裡只列出 cloudFiles 傳入的（當前用戶），更完整的需額外查詢
    } else if (supabase) {
      // 僅能查詢自己的資料
      try {
        const { count } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
        result.tables.user_roles = count ?? 0
      } catch {}
    }

    setData(result)
    setChecked(new Date())
    setLoading(false)
  }, [cloudFiles.length, allRows.length])

  useEffect(() => { checkStatus() }, [checkStatus])

  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—'

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">

      {/* 標題列 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">資料庫狀態</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Supabase 連線、資料表、雲端儲存狀態一覽
            {checked && <span className="ml-2 text-xs">· 最後檢查 {fmtTime(checked)}</span>}
          </p>
        </div>
        <button
          onClick={checkStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            : '🔄'
          }
          重新檢查
        </button>
      </div>

      {/* 狀態卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusCard icon="🔗" label="Supabase 連線"
          value={data?.supabaseOk ? '已連線' : '未設定'}
          sub={data?.adminOk ? '管理員金鑰 ✓' : '無管理員金鑰'}
          ok={data?.supabaseOk} loading={loading} />
        <StatusCard icon="👥" label="使用者總數"
          value={loading ? '—' : `${data?.users.total ?? 0} 人`}
          sub={data ? `管理員 ${data.users.admin}・管理者 ${data.users.manager}・檢視者 ${data.users.viewer}` : ''}
          ok={data ? data.users.total > 0 : undefined} loading={loading} />
        <StatusCard icon="📁" label="雲端檔案"
          value={loading ? '—' : `${data?.storage.files ?? 0} 個`}
          sub="目前登入用戶"
          loading={loading} />
        <StatusCard icon="📊" label="已載入資料"
          value={loading ? '—' : `${(data?.rows ?? 0).toLocaleString()} 筆`}
          sub="當前記憶體中"
          loading={loading} />
      </div>

      {/* 資料表狀態 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">🗄️ 資料表狀態</span>
        </div>
        {loading
          ? <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              檢查中…
            </div>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/30">
                  <th className="text-left px-4 py-2 font-semibold">資料表</th>
                  <th className="text-right px-4 py-2 font-semibold">紀錄數</th>
                  <th className="text-center px-4 py-2 font-semibold">狀態</th>
                </tr>
              </thead>
              <tbody>
                <TableRow name="user_roles"
                  desc="使用者角色對應"
                  count={data?.tables.user_roles}
                  ok={data?.tables.user_roles !== null} />
                <TableRow name="user_costs"
                  desc="商品成本設定"
                  count={data?.tables.user_costs}
                  ok={data?.tables.user_costs !== null} />
                <TableRow name="data_backups"
                  desc="備份記錄"
                  count={data?.tables.data_backups}
                  ok={data?.tables.data_backups !== null} />
                <TableRow name="role_permissions"
                  desc="角色功能區塊設定"
                  count={data?.tables.role_permissions}
                  ok={data?.tables.role_permissions !== null} />
              </tbody>
            </table>
          )
        }
        {!loading && data?.tables.role_permissions === null && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-400">
            ⚠️ 部分資料表尚未建立，請至 Windows 終端機執行 <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">db-push.bat</code> 套用 Migration。
          </div>
        )}
      </div>

      {/* 雲端檔案清單 */}
      {!loading && data?.storage.fileList?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
              📁 雲端檔案（{data.storage.fileList.length} 個）
            </span>
          </div>
          <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {data.storage.fileList.map(f => (
              <li key={f.path || f.name} className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <span className="text-sm">📄</span>
                <span className="text-sm text-gray-700 dark:text-gray-200 font-medium flex-1 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{f.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 使用者清單（admin 可見） */}
      {!loading && data?.users.list?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
              👥 登入帳號（{data.users.list.length} 個）
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/30">
                  <th className="text-left px-4 py-2 font-semibold">電子郵件</th>
                  <th className="text-center px-4 py-2 font-semibold">驗證</th>
                  <th className="text-center px-4 py-2 font-semibold">建立</th>
                  <th className="text-center px-4 py-2 font-semibold">最後登入</th>
                </tr>
              </thead>
              <tbody>
                {data.users.list.map((u, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200 font-medium">{u.email}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.confirmed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {u.confirmed ? '✓' : '未驗'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-gray-400 dark:text-gray-500">{fmtTime(u.created)}</td>
                    <td className="px-4 py-2 text-center text-xs text-gray-400 dark:text-gray-500">{fmtTime(u.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

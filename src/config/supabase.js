import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL         || ''
const supabaseKey    = import.meta.env.VITE_SUPABASE_ANON_KEY    || ''
const supabaseService = import.meta.env.VITE_SUPABASE_SERVICE_KEY || ''

/**
 * supabaseReady
 * 只有在 .env 填入 URL 與 ANON_KEY 後才為 true。
 * 若為 false，AuthContext 會自動進入示範模式（localStorage 降級）。
 */
export const supabaseReady = !!(supabaseUrl && supabaseKey)

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

/**
 * supabaseAdmin
 * 使用 service_role key，繞過 RLS，供 admin 管理使用者。
 * 僅在 VITE_SUPABASE_SERVICE_KEY 設定時有效。
 */
export const supabaseAdmin = (supabaseReady && supabaseService)
  ? createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

/**
 * useMarketingSettings — 行銷設定中心的讀寫
 * ─────────────────────────────────────────────────────────────────────────────
 * 來源優先序：Supabase `marketing_settings`（只存被改過的值）→ 程式內建預設（marketingDefaults.js）
 * 示範模式（未設定 Supabase）用 localStorage。
 * Worker 端讀同一張表，因此這裡改了，排程下次執行就生效。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, supabaseReady } from '../config/supabase'
import { SETTING_DEFS, SETTING_GROUPS, DEFAULTS } from '../config/marketingDefaults'

const TABLE = 'marketing_settings'
const LS_KEY = 'marketing_settings_v1'
const DEF_BY_KEY = Object.fromEntries(SETTING_DEFS.map(d => [d.key, d]))

function lsGet() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} } }
function lsSet(obj) { try { localStorage.setItem(LS_KEY, JSON.stringify(obj)) } catch {} }

export function useMarketingSettings(userEmail = '') {
  const [overrides, setOverrides] = useState({})     // key → value（只有被改過的）
  const [meta, setMeta] = useState({})               // key → { updated_by, updated_at }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    if (!supabaseReady) { setOverrides(lsGet()); setLoading(false); return }
    const { data, error: err } = await supabase.from(TABLE).select('key, value, updated_by, updated_at')
    if (err) { setError(err.message); setOverrides(lsGet()); setLoading(false); return }
    const ov = {}, mt = {}
    for (const r of data || []) {
      if (!(r.key in DEF_BY_KEY)) continue
      if (r.value !== null && r.value !== undefined) ov[r.key] = r.value
      mt[r.key] = { updated_by: r.updated_by, updated_at: r.updated_at }
    }
    setOverrides(ov); setMeta(mt); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const get = useCallback((key, fallback) => {
    if (key in overrides) return overrides[key]
    if (key in DEFAULTS) return DEFAULTS[key]
    return fallback
  }, [overrides])

  const save = useCallback(async (key, value) => {
    const next = { ...overrides, [key]: value }
    setOverrides(next)
    if (!supabaseReady) { lsSet(next); return true }
    const { error: err } = await supabase.from(TABLE).upsert(
      { key, value, updated_by: userEmail || null, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (err) { setError(err.message); return false }
    setMeta(m => ({ ...m, [key]: { updated_by: userEmail, updated_at: new Date().toISOString() } }))
    return true
  }, [overrides, userEmail])

  const reset = useCallback(async (key) => {
    const next = { ...overrides }; delete next[key]
    setOverrides(next)
    if (!supabaseReady) { lsSet(next); return true }
    const { error: err } = await supabase.from(TABLE).upsert(
      { key, value: null, updated_by: userEmail || null, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (err) { setError(err.message); return false }
    return true
  }, [overrides, userEmail])

  const isOverridden = useCallback(key => key in overrides, [overrides])

  const exportJSON = useCallback(() => JSON.stringify(overrides, null, 2), [overrides])
  const importJSON = useCallback(async (text) => {
    const obj = JSON.parse(text)
    for (const [k, v] of Object.entries(obj)) if (k in DEF_BY_KEY) await save(k, v)
  }, [save])

  const all = useMemo(() => ({ ...DEFAULTS, ...overrides }), [overrides])

  return { get, all, save, reset, reload: load, isOverridden, meta, loading, error, defs: SETTING_DEFS, groups: SETTING_GROUPS, exportJSON, importJSON }
}

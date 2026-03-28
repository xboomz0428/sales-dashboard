/**
 * useCloudData  ─  Supabase 版
 * ─────────────────────────────────────────────────────────────────────────────
 * 雲端資料同步：
 *   • 銷售 Excel → Supabase Storage bucket: sales-files
 *   • 產品成本   → Supabase DB 資料表: user_costs
 *   • 登入後自動下載歷史檔案並重新解析，無需重新上傳
 *
 * 若 Supabase 未設定（示範模式），全部降級為 localStorage。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseReady } from '../config/supabase'
import { processExcelFile } from '../utils/dataProcessor'

const STORAGE_BUCKET = 'sales-files'
const LS_COSTS = 'product_costs'

// ─── 工具：使用者的 Storage 資料夾路徑 ───────────────────────────────────────
const userPath = (uid, filename) =>
  filename ? `${uid}/${filename}` : `${uid}/`

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useCloudData(user, onDataLoaded, onCostsLoaded) {
  const [syncing,    setSyncing]    = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [cloudFiles, setCloudFiles] = useState([])  // { name, path }

  const onDataLoadedRef  = useRef(onDataLoaded)
  const onCostsLoadedRef = useRef(onCostsLoaded)
  useEffect(() => { onDataLoadedRef.current  = onDataLoaded  }, [onDataLoaded])
  useEffect(() => { onCostsLoadedRef.current = onCostsLoaded }, [onCostsLoaded])

  // ── 登入後初始化 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    if (supabaseReady) {
      loadCloudFiles(user.id)
      loadCosts(user.id)
    }
    // 示範模式：成本已在 localStorage，不需額外動作
  }, [user?.id])

  // ── 從 Supabase Storage 載入歷史銷售檔案 ────────────────────────────────
  async function loadCloudFiles(uid) {
    try {
      setSyncing(true)
      setSyncStatus('讀取雲端檔案清單…')

      const { data: files, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(uid, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } })

      if (error) throw error
      if (!files?.length) {
        setSyncing(false)
        setSyncStatus('')
        return
      }

      const validFiles = files.filter(f => f.name && !f.name.endsWith('/'))
      setCloudFiles(validFiles.map(f => ({ name: f.name, path: userPath(uid, f.name) })))

      setSyncStatus(`正在載入 ${validFiles.length} 個雲端檔案…`)

      const allRows = []
      for (const f of validFiles) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(userPath(uid, f.name))
          if (dlErr) continue

          const file = new File([blob], f.name)
          const result = await processExcelFile(file)
          if (result?.rows?.length) allRows.push(...result.rows)
        } catch { /* 單一檔案失敗不影響其他 */ }
      }

      if (allRows.length && onDataLoadedRef.current) {
        setSyncStatus(`✓ 已從雲端載入 ${allRows.length.toLocaleString()} 筆資料`)
        onDataLoadedRef.current(allRows, validFiles.map(f => f.name))
        setTimeout(() => setSyncStatus(''), 4000)
      } else {
        setSyncStatus('')
      }
    } catch (e) {
      setSyncStatus('雲端資料載入失敗')
      setTimeout(() => setSyncStatus(''), 4000)
    } finally {
      setSyncing(false)
    }
  }

  // ── 從 Supabase DB 載入成本，同步至 localStorage 並通知 App ────────────
  async function loadCosts(uid) {
    try {
      const { data, error } = await supabase
        .from('user_costs')
        .select('costs')
        .eq('user_id', uid)
        .maybeSingle()

      if (error) throw error
      if (data?.costs && Object.keys(data.costs).length > 0) {
        localStorage.setItem(LS_COSTS, JSON.stringify(data.costs))
        // 透過 callback 通知 App.jsx 更新 productCosts state
        onCostsLoadedRef.current?.(data.costs)
      }
    } catch { /* 靜默失敗，保留本地成本 */ }
  }

  // ── 上傳銷售 Excel 至 Storage ────────────────────────────────────────────
  const uploadSalesFile = useCallback(async (file) => {
    if (!user) return

    if (!supabaseReady) {
      setSyncStatus('✓ 示範模式：資料已載入（未同步雲端）')
      setTimeout(() => setSyncStatus(''), 3000)
      return
    }

    try {
      setSyncing(true)
      setSyncStatus('同步至雲端…')

      const path = userPath(user.id, file.name)
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true })   // upsert: 同名覆蓋

      if (error) throw error

      setCloudFiles(prev => {
        const filtered = prev.filter(f => f.name !== file.name)
        return [...filtered, { name: file.name, path }]
      })

      setSyncStatus('✓ 已同步至雲端')
      setTimeout(() => setSyncStatus(''), 3000)
    } catch {
      setSyncStatus('雲端上傳失敗，資料保留於本地')
      setTimeout(() => setSyncStatus(''), 4000)
    } finally {
      setSyncing(false)
    }
  }, [user])

  // ── 刪除雲端檔案 ─────────────────────────────────────────────────────────
  const deleteCloudFile = useCallback(async (fileName) => {
    if (!user || !supabaseReady) return
    const path = userPath(user.id, fileName)
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path])
    if (!error) {
      setCloudFiles(prev => prev.filter(f => f.name !== fileName))
    }
  }, [user])

  // ── 儲存成本（localStorage + Supabase DB） ───────────────────────────────
  const saveCosts = useCallback(async (costs) => {
    localStorage.setItem(LS_COSTS, JSON.stringify(costs))
    if (!user || !supabaseReady) return
    try {
      await supabase
        .from('user_costs')
        .upsert(
          { user_id: user.id, costs, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
    } catch { /* 靜默失敗，本地已存 */ }
  }, [user])

  return {
    syncing,
    syncStatus,
    cloudFiles,
    uploadSalesFile,
    deleteCloudFile,
    saveCosts,
  }
}

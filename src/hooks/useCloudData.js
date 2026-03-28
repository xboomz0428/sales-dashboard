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
import { supabase, supabaseAdmin, supabaseReady } from '../config/supabase'
import { processExcelFile } from '../utils/dataProcessor'

// Storage 讀取用 admin client（繞過 RLS），若無則降級至 anon client
// 上傳仍用 anon client（以使用者身份）
const storageReader = supabaseAdmin || supabase

const STORAGE_BUCKET = 'sales-files'
const SHARED_FOLDER  = 'shared'          // 所有帳號共用的資料夾
const LS_COSTS = 'product_costs'

// ─── 工具：共用資料夾路徑 ────────────────────────────────────────────────────
const sharedPath = (filename) =>
  filename ? `${SHARED_FOLDER}/${filename}` : SHARED_FOLDER

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useCloudData(user, onDataLoaded, onCostsLoaded) {
  const [syncing,      setSyncing]      = useState(false)
  const [syncStatus,   setSyncStatus]   = useState('')
  const [uploadErrors, setUploadErrors] = useState([])   // 每個檔案的上傳錯誤
  const [cloudFiles,   setCloudFiles]   = useState([])   // { name, path }

  const onDataLoadedRef  = useRef(onDataLoaded)
  const onCostsLoadedRef = useRef(onCostsLoaded)
  useEffect(() => { onDataLoadedRef.current  = onDataLoaded  }, [onDataLoaded])
  useEffect(() => { onCostsLoadedRef.current = onCostsLoaded }, [onCostsLoaded])

  // ── 登入後初始化 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    if (supabaseReady) {
      loadCloudFiles()
      loadCosts(user.id)
    }
    // 示範模式：成本已在 localStorage，不需額外動作
  }, [user?.id])

  // ── JSON 快取檔名（避免重複解析大型 .xls 造成 stack overflow）────────────
  const jsonCacheName = (fileName) => fileName + '.rows.json'

  // ── 從 Supabase Storage 載入共用銷售檔案 ────────────────────────────────
  async function loadCloudFiles() {
    try {
      setSyncing(true)
      setSyncStatus('讀取雲端檔案清單…')

      const { data: files, error } = await storageReader.storage
        .from(STORAGE_BUCKET)
        .list(SHARED_FOLDER, { limit: 200, sortBy: { column: 'created_at', order: 'asc' } })

      if (error) throw error

      const validFiles = (files || []).filter(
        f => f.name && f.name !== '.emptyFolderPlaceholder' && !f.name.endsWith('/')
      )

      if (!validFiles.length) {
        setSyncing(false); setSyncStatus(''); return
      }

      // 分類：Excel 檔 vs JSON 快取檔
      const jsonCacheSet = new Set(
        validFiles.filter(f => f.name.endsWith('.rows.json')).map(f => f.name)
      )
      const excelFiles = validFiles.filter(f => !f.name.endsWith('.rows.json'))

      setCloudFiles(excelFiles.map(f => ({ name: f.name, path: sharedPath(f.name) })))

      const allRows = []
      const failedFiles = []
      const loadedFileNames = []

      for (let i = 0; i < excelFiles.length; i++) {
        const f = excelFiles[i]
        setSyncStatus(`正在載入 ${f.name}（${i + 1}/${excelFiles.length}）…`)
        try {
          const cacheFile = jsonCacheName(f.name)

          if (jsonCacheSet.has(cacheFile)) {
            // ✅ 優先從 JSON 快取載入（不需重新解析 Excel，避免 stack overflow）
            const { data: blob, error: dlErr } = await storageReader.storage
              .from(STORAGE_BUCKET).download(sharedPath(cacheFile))
            if (dlErr) throw new Error(dlErr.message)
            const rows = JSON.parse(await blob.text())
            if (!rows?.length) throw new Error('快取資料為空')
            allRows.push(...rows)
            loadedFileNames.push(f.name)
          } else {
            // 無快取，解析原始 Excel
            const { data: blob, error: dlErr } = await storageReader.storage
              .from(STORAGE_BUCKET).download(sharedPath(f.name))
            if (dlErr) throw new Error(dlErr.message || '下載失敗')
            if (!blob) throw new Error('下載內容為空')

            const file = new File([blob], f.name)
            const result = await processExcelFile(file)
            if (!result?.rows?.length) throw new Error('檔案無可解析的資料列')
            allRows.push(...result.rows)
            loadedFileNames.push(f.name)
          }
        } catch (e) {
          failedFiles.push({ name: f.name, reason: e.message })
        }
      }

      if (failedFiles.length) {
        const failMsg = failedFiles.map(f => `${f.name}（${f.reason}）`).join('、')
        setSyncStatus(`⚠️ ${failedFiles.length} 個檔案載入失敗：${failMsg}`)
        setTimeout(() => setSyncStatus(''), 10000)
      }

      if (allRows.length && onDataLoadedRef.current) {
        if (!failedFiles.length) {
          setSyncStatus(`✓ 已從雲端載入 ${allRows.length.toLocaleString()} 筆資料（${loadedFileNames.length} 個檔案）`)
          setTimeout(() => setSyncStatus(''), 4000)
        }
        onDataLoadedRef.current(allRows, loadedFileNames)
      } else if (!allRows.length) {
        setSyncStatus('⚠️ 雲端有檔案但全部無法解析，請重新上傳')
        setTimeout(() => setSyncStatus(''), 8000)
      }
    } catch (e) {
      setSyncStatus(`⚠️ 雲端資料載入失敗：${e.message || '請確認網路連線'}`)
      setTimeout(() => setSyncStatus(''), 6000)
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
  const uploadSalesFile = useCallback(async (file, rows) => {
    if (!user) return

    if (!supabaseReady) {
      setSyncStatus('✓ 示範模式：資料已載入（未同步雲端）')
      setTimeout(() => setSyncStatus(''), 3000)
      return
    }

    // 先清除此檔案的舊錯誤
    setUploadErrors(prev => prev.filter(e => e.name !== file.name))

    try {
      setSyncing(true)
      setSyncStatus(`正在上傳 ${file.name}…`)

      const path = sharedPath(file.name)
      const { error } = await storageReader.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true })

      if (error) throw error

      // 上傳後立即列出確認檔案存在
      const { data: listed } = await storageReader.storage
        .from(STORAGE_BUCKET)
        .list(SHARED_FOLDER, { limit: 10, search: file.name })
      if (!listed?.find(f => f.name === file.name)) {
        throw new Error('上傳後無法確認存在，請重試')
      }

      setCloudFiles(prev => {
        const filtered = prev.filter(f => f.name !== file.name)
        return [...filtered, { name: file.name, path }]
      })

      // 同時存 JSON 快取（下次登入直接讀 JSON，不再解析 Excel，避免大型 .xls stack overflow）
      if (rows?.length) {
        try {
          const jsonBlob = new Blob([JSON.stringify(rows)], { type: 'application/json' })
          await storageReader.storage
            .from(STORAGE_BUCKET)
            .upload(sharedPath(jsonCacheName(file.name)), jsonBlob, { upsert: true })
        } catch { /* JSON 快取失敗不影響主流程 */ }
      }

      setSyncStatus(`✓ ${file.name} 已同步至雲端`)
      setTimeout(() => setSyncStatus(''), 3000)
    } catch (e) {
      const rawMsg = e.message || '請確認網路連線'
      const errMsg = rawMsg.includes('Bucket not found') || rawMsg.includes('bucket')
        ? 'BUCKET_NOT_FOUND'
        : rawMsg
      setUploadErrors(prev => [...prev.filter(x => x.name !== file.name), { name: file.name, reason: errMsg }])
      setSyncStatus(`⚠️ ${file.name} 上傳失敗`)
      setTimeout(() => setSyncStatus(''), 5000)
      console.error('[uploadSalesFile]', file.name, e)
    } finally {
      setSyncing(false)
    }
  }, [user])

  // ── 刪除雲端檔案 ─────────────────────────────────────────────────────────
  const deleteCloudFile = useCallback(async (fileName) => {
    if (!user || !supabaseReady) return
    const paths = [sharedPath(fileName), sharedPath(jsonCacheName(fileName))]
    await storageReader.storage.from(STORAGE_BUCKET).remove(paths)
    setCloudFiles(prev => prev.filter(f => f.name !== fileName))
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

  // ── 依指定路徑重新下載並解析檔案（備份還原用）──────────────────────────
  const loadSpecificFiles = useCallback(async (filePaths) => {
    if (!filePaths?.length || !supabaseReady) return { rows: [], fileNames: [] }

    setSyncing(true)
    setSyncStatus(`正在還原 ${filePaths.length} 個檔案…`)

    const allRows = []
    const fileNames = []

    for (const path of filePaths) {
      try {
        const { data: blob, error } = await storageReader.storage
          .from(STORAGE_BUCKET)
          .download(path)
        if (error || !blob) continue

        const fileName = path.split('/').pop()
        const file = new File([blob], fileName)
        const result = await processExcelFile(file)
        if (result?.rows?.length) {
          allRows.push(...result.rows)
          fileNames.push(fileName)
        }
      } catch { /* 單一檔案失敗不影響其他 */ }
    }

    setSyncStatus(allRows.length
      ? `✓ 已還原 ${allRows.length.toLocaleString()} 筆資料`
      : '還原完成（無可讀取的資料）')
    setTimeout(() => setSyncStatus(''), 4000)
    setSyncing(false)

    return { rows: allRows, fileNames }
  }, [])

  return {
    syncing,
    syncStatus,
    uploadErrors,
    cloudFiles,
    uploadSalesFile,
    deleteCloudFile,
    saveCosts,
    loadSpecificFiles,
  }
}

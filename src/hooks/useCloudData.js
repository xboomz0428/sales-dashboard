/**
 * useCloudData  ─  Supabase 版
 * ─────────────────────────────────────────────────────────────────────────────
 * 雲端資料同步：
 *   • 銷售資料   → Supabase DB 資料表: sales_data（主要儲存）
 *   • 銷售 Excel → Supabase Storage bucket: sales-files（備份）
 *   • 產品成本   → Supabase DB 資料表: user_costs
 *
 * 登入後優先從 sales_data 資料表讀取，無需重新解析 Excel 檔案。
 * 上傳新檔時，依 _key 去重：重複則跳過，新資料才寫入。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseAdmin, supabaseReady } from '../config/supabase'
import { processExcelFile } from '../utils/dataProcessor'

const storageReader  = supabaseAdmin || supabase
const STORAGE_BUCKET = 'sales-files'
const SHARED_FOLDER  = 'shared'
const LS_COSTS       = 'product_costs'
const DB_TABLE       = 'sales_data'
const DB_PAGE_SIZE   = 1000   // Supabase 每次最多回傳筆數
const DB_BATCH_SIZE  = 500    // upsert 每批筆數

const sharedPath = (filename) =>
  filename ? `${SHARED_FOLDER}/${filename}` : SHARED_FOLDER

// ─── 資料列欄位轉換（camelCase ↔ snake_case）───────────────────────────────
function rowToDb(r) {
  return {
    _key:          r._key,
    date:          r.date,
    year_month:    r.yearMonth,
    year:          r.year,
    month:         r.month,
    channel:       r.channel       ?? '',
    channel_type:  r.channelType   ?? '',
    brand:         r.brand         ?? '',
    agent_type:    r.agentType     ?? '',
    product:       r.product       ?? '',
    order_id:      r.orderId       ?? '',
    customer:      r.customer      ?? '',
    quantity:      r.quantity      ?? 0,
    subtotal:      r.subtotal      ?? 0,
    total:         r.total         ?? 0,
    discount_rate: r.discountRate  ?? 0,
  }
}

function rowFromDb(r) {
  return {
    date:         r.date,
    yearMonth:    r.year_month,
    year:         r.year,
    month:        r.month,
    channel:      r.channel      ?? '',
    channelType:  r.channel_type ?? '',
    brand:        r.brand        ?? '',
    agentType:    r.agent_type   ?? '',
    product:      r.product      ?? '',
    orderId:      r.order_id     ?? '',
    customer:     r.customer     ?? '',
    quantity:     r.quantity     ?? 0,
    subtotal:     r.subtotal     ?? 0,
    total:        r.total        ?? 0,
    discountRate: r.discount_rate ?? 0,
    _key:         r._key,
  }
}

// ─── 從 DB 讀取所有銷售資料（分頁） ─────────────────────────────────────────
async function loadRowsFromDb() {
  const client = supabaseAdmin || supabase
  const allRows = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from(DB_TABLE)
      .select('_key,date,year_month,year,month,channel,channel_type,brand,agent_type,product,order_id,customer,quantity,subtotal,total,discount_rate')
      .range(from, from + DB_PAGE_SIZE - 1)
      .order('date', { ascending: true })

    if (error) throw error
    if (!data?.length) break

    for (const r of data) allRows.push(rowFromDb(r))
    if (data.length < DB_PAGE_SIZE) break
    from += DB_PAGE_SIZE
  }

  return allRows
}

// ─── 批次 upsert 至 DB（_key 重複則跳過，不更新）──────────────────────────
async function upsertRowsToDb(rows) {
  if (!rows?.length) return { inserted: 0 }
  const client = supabaseAdmin || supabase
  let totalInserted = 0

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const chunk = rows.slice(i, i + DB_BATCH_SIZE).map(rowToDb)
    const { error } = await client
      .from(DB_TABLE)
      .upsert(chunk, { onConflict: '_key', ignoreDuplicates: true })
    if (error) throw error
    totalInserted += chunk.length
  }

  return { inserted: totalInserted }
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useCloudData(user, onDataLoaded, onCostsLoaded) {
  const [syncing,      setSyncing]      = useState(false)
  const [syncStatus,   setSyncStatus]   = useState('')
  const [uploadErrors, setUploadErrors] = useState([])
  const [cloudFiles,   setCloudFiles]   = useState([])

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
  }, [user?.id])

  const jsonCacheName = (fileName) => fileName + '.rows.json'

  // ── 主要資料載入：優先從 DB，再 fallback Storage ─────────────────────────
  async function loadCloudFiles() {
    try {
      setSyncing(true)

      // ① 嘗試從 DB 讀取
      if (supabaseReady) {
        setSyncStatus('從資料庫讀取銷售資料…')
        try {
          const dbRows = await loadRowsFromDb()
          if (dbRows.length > 0) {
            setSyncStatus(`✓ 已從資料庫載入 ${dbRows.length.toLocaleString()} 筆資料`)
            setTimeout(() => setSyncStatus(''), 4000)
            onDataLoadedRef.current?.(dbRows, [])
            setSyncing(false)
            return
          }
        } catch (dbErr) {
          // DB 讀取失敗（可能是資料表尚未建立）→ fallback 到 Storage
          console.warn('[loadCloudFiles] DB 讀取失敗，改用 Storage:', dbErr.message)
        }
      }

      // ② fallback：從 Storage 載入（並在成功後將資料同步至 DB）
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
        setSyncStatus(`載入 ${f.name}（${i + 1}/${excelFiles.length}）…`)
        try {
          const cacheFile = jsonCacheName(f.name)

          if (jsonCacheSet.has(cacheFile)) {
            const { data: blob, error: dlErr } = await storageReader.storage
              .from(STORAGE_BUCKET).download(sharedPath(cacheFile))
            if (dlErr) throw new Error(dlErr.message)
            const rows = JSON.parse(await blob.text())
            if (!rows?.length) throw new Error('快取資料為空')
            for (const r of rows) allRows.push(r)
            loadedFileNames.push(f.name)
          } else {
            const { data: blob, error: dlErr } = await storageReader.storage
              .from(STORAGE_BUCKET).download(sharedPath(f.name))
            if (dlErr) throw new Error(dlErr.message || '下載失敗')
            if (!blob) throw new Error('下載內容為空')

            const file = new File([blob], f.name)
            const result = await processExcelFile(file)
            if (!result?.rows?.length) throw new Error('檔案無可解析的資料列')
            for (const r of result.rows) allRows.push(r)
            loadedFileNames.push(f.name)
          }
        } catch (e) {
          failedFiles.push({ name: f.name, reason: e.message })
        }
      }

      if (allRows.length) {
        onDataLoadedRef.current?.(allRows, loadedFileNames)

        // 將 Storage 資料同步至 DB（背景執行，不阻塞 UI）
        upsertRowsToDb(allRows).catch(e =>
          console.warn('[loadCloudFiles] 同步至 DB 失敗:', e.message)
        )
      }

      if (failedFiles.length) {
        const failMsg = failedFiles.map(f => `${f.name}（${f.reason}）`).join('、')
        setSyncStatus(`⚠️ ${failedFiles.length} 個檔案載入失敗：${failMsg}`)
        setTimeout(() => setSyncStatus(''), 10000)
      } else if (allRows.length) {
        setSyncStatus(`✓ 已從雲端載入 ${allRows.length.toLocaleString()} 筆資料`)
        setTimeout(() => setSyncStatus(''), 4000)
      } else {
        setSyncStatus('⚠️ 雲端有檔案但全部無法解析，請重新上傳')
        setTimeout(() => setSyncStatus(''), 8000)
      }
    } catch (e) {
      setSyncStatus(`⚠️ 資料載入失敗：${e.message || '請確認網路連線'}`)
      setTimeout(() => setSyncStatus(''), 6000)
    } finally {
      setSyncing(false)
    }
  }

  // ── 載入成本 ─────────────────────────────────────────────────────────────
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
        onCostsLoadedRef.current?.(data.costs)
      }
    } catch { /* 靜默失敗，保留本地成本 */ }
  }

  // ── 上傳銷售 Excel：Storage + DB 同時寫入 ───────────────────────────────
  const uploadSalesFile = useCallback(async (file, rows) => {
    if (!user) return

    if (!supabaseReady) {
      setSyncStatus('✓ 示範模式：資料已載入（未同步雲端）')
      setTimeout(() => setSyncStatus(''), 3000)
      return
    }

    setUploadErrors(prev => prev.filter(e => e.name !== file.name))

    try {
      setSyncing(true)
      setSyncStatus(`正在上傳 ${file.name}…`)

      // ① 寫入 DB（主要儲存）─ 重複 _key 自動跳過
      let dbMsg = ''
      if (rows?.length) {
        try {
          setSyncStatus(`寫入資料庫（${rows.length.toLocaleString()} 筆）…`)
          await upsertRowsToDb(rows)
          dbMsg = `DB ✓`
        } catch (dbErr) {
          console.warn('[uploadSalesFile] DB 寫入失敗:', dbErr.message)
          dbMsg = `DB 失敗`
        }
      }

      // ② 上傳至 Storage（備份）
      const path = sharedPath(file.name)
      const { error: storageErr } = await storageReader.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true })

      if (!storageErr) {
        setCloudFiles(prev => {
          const filtered = prev.filter(f => f.name !== file.name)
          return [...filtered, { name: file.name, path }]
        })

        // 同時存 JSON 快取
        if (rows?.length) {
          try {
            const jsonBlob = new Blob([JSON.stringify(rows)], { type: 'application/json' })
            await storageReader.storage
              .from(STORAGE_BUCKET)
              .upload(sharedPath(jsonCacheName(file.name)), jsonBlob, { upsert: true })
          } catch { /* JSON 快取失敗不影響主流程 */ }
        }
      }

      setSyncStatus(`✓ ${file.name} 已同步（${dbMsg}）`)
      setTimeout(() => setSyncStatus(''), 3000)
    } catch (e) {
      const rawMsg = e.message || '請確認網路連線'
      const errMsg = rawMsg.includes('Bucket not found') || rawMsg.includes('bucket')
        ? 'BUCKET_NOT_FOUND'
        : rawMsg
      setUploadErrors(prev => [...prev.filter(x => x.name !== file.name), { name: file.name, reason: errMsg }])
      setSyncStatus(`⚠️ ${file.name} 上傳失敗`)
      setTimeout(() => setSyncStatus(''), 5000)
    } finally {
      setSyncing(false)
    }
  }, [user])

  // ── 刪除雲端檔案（Storage，DB 資料保留） ────────────────────────────────
  const deleteCloudFile = useCallback(async (fileName) => {
    if (!user || !supabaseReady) return
    const paths = [sharedPath(fileName), sharedPath(jsonCacheName(fileName))]
    await storageReader.storage.from(STORAGE_BUCKET).remove(paths)
    setCloudFiles(prev => prev.filter(f => f.name !== fileName))
  }, [user])

  // ── 儲存成本 ─────────────────────────────────────────────────────────────
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
    } catch { /* 靜默失敗 */ }
  }, [user])

  // ── 依指定路徑還原（備份還原用） ─────────────────────────────────────────
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
          for (const r of result.rows) allRows.push(r)
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

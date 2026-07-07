/**
 * salesCache.js — IndexedDB 本地快取
 * 首次載入後把銷售資料存在瀏覽器，之後開頁先秒開快取，
 * 背景比對資料庫戳記（筆數 + 最大 id）有變才重新抓取。
 * 所有操作失敗都靜默降級（例如無痕模式），不影響主流程。
 */
const DB_NAME = 'sales-dashboard-cache'
const STORE   = 'kv'

export const SALES_CACHE_KEY = 'sales_rows_v1'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheGet(key) {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      rq.onsuccess = () => resolve(rq.result ?? null)
      rq.onerror = () => reject(rq.error)
    })
  } catch { return null }
}

export async function cacheSet(key, value) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* 靜默失敗 */ }
}

export async function cacheDel(key) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* 靜默失敗 */ }
}

/**
 * excelWorker.js — Web Worker
 * 在獨立執行緒解析 Excel，避免大型 .xls 檔案造成主執行緒 stack overflow
 */
import { parseBuffer } from './excelCore.js'

self.onmessage = function ({ data: { buffer } }) {
  try {
    const result = parseBuffer(buffer)
    self.postMessage({ ok: true, result })
  } catch (e) {
    self.postMessage({ ok: false, error: e.message || '解析失敗' })
  }
}

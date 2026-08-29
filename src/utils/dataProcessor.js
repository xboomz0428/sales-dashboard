/**
 * dataProcessor.js
 * processExcelFile：優先用 Web Worker 在獨立執行緒解析（大檔不凍結 UI，手機不卡死）；
 * Worker 建立失敗或解析出錯時回退主執行緒解析（行為與舊版相同）。
 */
export { parseNumeric, parseDate } from './excelCore.js'
import { parseBuffer } from './excelCore.js'

function readFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsArrayBuffer(file)
  })
}

function parseInWorker(buffer) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = new Worker(new URL('./excelWorker.js', import.meta.url), { type: 'module' })
    } catch (e) {
      reject(e); return
    }
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')) }, 120000)
    worker.onmessage = ({ data }) => {
      clearTimeout(timer); worker.terminate()
      data.ok ? resolve(data.result) : reject(new Error(data.error || '解析失敗'))
    }
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); reject(new Error(e.message || 'worker 錯誤')) }
    worker.postMessage({ buffer }, [buffer])   // transfer 零複製
  })
}

export async function processExcelFile(file) {
  const buffer = await readFileBuffer(file)
  try {
    return await parseInWorker(buffer)
  } catch {
    // Worker 不可用或解析失敗 → 主執行緒重讀重解（buffer 已被 transfer，需重讀檔案）
    const buf2 = await readFileBuffer(file)
    return parseBuffer(buf2)
  }
}

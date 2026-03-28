/**
 * dataProcessor.js
 * processExcelFile 透過 Web Worker 解析，避免大型 .xls 在主執行緒造成 stack overflow
 */
export { parseNumeric, parseDate } from './excelCore.js'

export function processExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const buffer = e.target.result

      // 使用 Web Worker 在獨立執行緒解析，擁有全新呼叫堆疊
      const worker = new Worker(
        new URL('./excelWorker.js', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = ({ data }) => {
        worker.terminate()
        if (data.ok) resolve(data.result)
        else reject(new Error(data.error))
      }

      worker.onerror = (err) => {
        worker.terminate()
        reject(new Error(err.message || 'Worker 解析失敗'))
      }

      // 以 Transferable 方式傳送 buffer（零拷貝，節省記憶體）
      worker.postMessage({ buffer }, [buffer])
    }

    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsArrayBuffer(file)
  })
}

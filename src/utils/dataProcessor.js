/**
 * dataProcessor.js
 * processExcelFile 在主執行緒解析（Worker 呼叫堆疊與主執行緒相同，無法解決 stack overflow）
 */
export { parseNumeric, parseDate } from './excelCore.js'
import { parseBuffer } from './excelCore.js'

export function processExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const result = parseBuffer(e.target.result)
        resolve(result)
      } catch (err) {
        reject(new Error(err.message || '解析失敗'))
      }
    }

    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsArrayBuffer(file)
  })
}

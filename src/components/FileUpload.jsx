import { useState, useRef } from 'react'

export default function FileUpload({ onFileLoaded, onError, loading }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xls', 'xlsx', 'csv'].includes(ext)) {
      onError('請上傳 Excel 檔案（.xls / .xlsx）或 CSV 檔案')
      return
    }
    onFileLoaded(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 p-6 sm:p-8">
      <div className="mb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg mx-auto mb-4">S</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">銷售數據分析系統</h1>
        <p className="text-gray-500 dark:text-gray-400">上傳 Excel 或 CSV 銷售數據檔案以開始分析</p>
      </div>

      <div
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 sm:p-12 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">解析中，請稍候...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl">📊</div>
            <div>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">拖放檔案至此，或點擊選取</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">支援 .xls / .xlsx / .csv 格式</p>
            </div>
            <div className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm">
              選取檔案
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-gray-400 dark:text-gray-600 text-center">
        資料在本機瀏覽器中處理，不會上傳至任何伺服器
      </p>
    </div>
  )
}

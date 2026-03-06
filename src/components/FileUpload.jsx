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
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">銷售數據分析系統</h1>
        <p className="text-gray-500">上傳 Excel 銷售數據檔案以開始分析</p>
      </div>
      <div
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
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
            <p className="text-gray-600 font-medium">解析中，請稍候...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl">📊</div>
            <div>
              <p className="text-lg font-semibold text-gray-700">拖放檔案至此，或點擊選取</p>
              <p className="text-sm text-gray-400 mt-1">支援 .xls / .xlsx / .csv 格式</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-6 text-sm text-gray-400">
        資料在本機瀏覽器中處理，不會上傳至任何伺服器
      </p>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * ChartCard – 共用圖表卡片容器
 *
 * Props:
 *   title      – 卡片標題
 *   subtitle   – 副標題 (optional)
 *   className  – 額外 class (optional)
 *   children   – render function: (expanded: boolean) => JSX
 *              OR 一般 JSX（此時放大模式高度靠 CSS 自動延伸）
 */
export default function ChartCard({ title, subtitle, children, className = '' }) {
  const [expanded, setExpanded] = useState(false)

  // ESC 鍵關閉
  useEffect(() => {
    if (!expanded) return
    const handler = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  // 防止背景捲動
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [expanded])

  const content = typeof children === 'function' ? children(expanded) : children

  return (
    <>
      {/* 一般卡片 */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative group ${className}`}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between mb-4 gap-2">
            <div className="min-w-0">
              {title && <h3 className="text-lg font-bold text-gray-800 leading-snug">{title}</h3>}
              {subtitle && <p className="text-base text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={() => setExpanded(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-base text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="全螢幕顯示 (ESC 關閉)"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M1 5V1h4M14 5V1h-4M1 10v4h4M14 10v4h-4" />
              </svg>
              放大
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
            title="全螢幕顯示"
          >
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1 5V1h4M14 5V1h-4M1 10v4h4M14 10v4h-4" />
            </svg>
            放大
          </button>
        )}
        {content}
      </div>

      {/* 全螢幕 Modal */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          {/* 背景遮罩 */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          />
          {/* 內容框 */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl flex flex-col w-full h-full max-w-[1400px] max-h-[calc(100vh-48px)] overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="min-w-0">
                {title && <h2 className="text-xl font-bold text-gray-800">{title}</h2>}
                {subtitle && <p className="text-base text-gray-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-base text-gray-600 font-semibold transition-colors flex-shrink-0 ml-4"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
                關閉
              </button>
            </div>
            {/* Modal content */}
            <div className="flex-1 overflow-y-auto p-6">
              {typeof children === 'function' ? children(true) : children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

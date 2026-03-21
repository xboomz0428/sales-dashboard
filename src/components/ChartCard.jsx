import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ScreenshotEditor from './ScreenshotEditor'

// Camera icon SVG
function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

export default function ChartCard({ title, subtitle, children, className = '' }) {
  const [expanded, setExpanded]         = useState(false)
  const [showCardEditor, setShowCardEditor] = useState(false)  // screenshot from collapsed card
  const cardRef            = useRef(null)   // collapsed card element
  const modalContentRef    = useRef(null)
  const scrollContainerRef = useRef(null)

  // ESC to close modal
  useEffect(() => {
    if (!expanded) return
    const handler = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [expanded])

  const content = typeof children === 'function' ? children(expanded) : children

  return (
    <>
      {/* ── Card (collapsed) ── */}
      <div
        ref={cardRef}
        className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-5 relative group ${className}`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
            <div className="min-w-0">
              {title    && <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100 leading-snug">{title}</h3>}
              {subtitle && <p className="text-sm sm:text-base text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            {/* Action buttons — shown on hover */}
            <div className="flex items-center gap-1.5 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {/* Screenshot button */}
              <button
                onClick={() => setShowCardEditor(true)}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 min-h-[36px] rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                title="截圖並編輯"
              >
                <CameraIcon />
                <span className="hidden lg:inline text-sm">截圖</span>
              </button>
              {/* Expand button */}
              <button
                onClick={() => setExpanded(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg border border-gray-200 dark:border-gray-600 text-sm sm:text-base text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="全螢幕顯示 (ESC 關閉)"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M1 5V1h4M14 5V1h-4M1 10v4h4M14 10v4h-4" />
                </svg>
                放大
              </button>
            </div>
          </div>
        )}
        {!title && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
            <button
              onClick={() => setShowCardEditor(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-400 dark:text-gray-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              title="截圖並編輯"
            >
              <CameraIcon />
            </button>
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-400 dark:text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="全螢幕顯示"
            >
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M1 5V1h4M14 5V1h-4M1 10v4h4M14 10v4h-4" />
              </svg>
              放大
            </button>
          </div>
        )}
        {content}
      </div>

      {/* ── Expanded modal (放大 view — no screenshot button here) ── */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          />

          {/* Modal container */}
          <div
            ref={modalContentRef}
            className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col w-full h-full max-w-[1400px] max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)] overflow-hidden"
          >
            {/* Modal header — close only */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 gap-2">
              <div className="min-w-0">
                {title    && <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>}
                {subtitle && <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 text-sm sm:text-base text-gray-600 dark:text-gray-300 font-semibold transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
                <span className="hidden sm:inline">關閉</span>
              </button>
            </div>

            {/* Chart content */}
            <div ref={scrollContainerRef} data-screenshot-scroll className="flex-1 overflow-y-auto p-3 sm:p-6">
              {typeof children === 'function' ? children(true) : children}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Screenshot editor — triggered from collapsed card ── */}
      {showCardEditor && (
        <ScreenshotEditor
          targetRef={cardRef}
          scrollRef={null}
          onClose={() => setShowCardEditor(false)}
          title={title}
        />
      )}
    </>
  )
}

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ScreenshotEditor from './ScreenshotEditor'

export default function ChartCard({ title, subtitle, children, className = '' }) {
  const [expanded, setExpanded]       = useState(false)
  const [showEditor, setShowEditor]   = useState(false)
  const modalContentRef               = useRef(null)
  const scrollContainerRef            = useRef(null)

  // ESC to close modal (not editor — editor handles its own ESC)
  useEffect(() => {
    if (!expanded || showEditor) return
    const handler = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded, showEditor])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [expanded])

  const content = typeof children === 'function' ? children(expanded) : children

  return (
    <>
      {/* ── Card (collapsed) ── */}
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-5 relative group ${className}`}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
            <div className="min-w-0">
              {title    && <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100 leading-snug">{title}</h3>}
              {subtitle && <p className="text-sm sm:text-base text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={() => setExpanded(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg border border-gray-200 dark:border-gray-600 text-sm sm:text-base text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
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
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-400 dark:text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
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

      {/* ── Expanded modal ── */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { if (!showEditor) setExpanded(false) }}
          />

          {/* Modal container — ref used by ScreenshotEditor */}
          <div
            ref={modalContentRef}
            className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col w-full h-full max-w-[1400px] max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)] overflow-hidden"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 gap-2">
              <div className="min-w-0">
                {title    && <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>}
                {subtitle && <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
              </div>

              <div data-no-capture="true" className="flex items-center gap-2 flex-shrink-0">
                {/* Screenshot editor button */}
                <button
                  onClick={() => setShowEditor(true)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-400 dark:hover:border-violet-500 text-sm sm:text-base text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 font-semibold transition-colors"
                  title="截圖並開啟編輯器"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                    <line x1="3" y1="1" x2="6" y2="4"/><line x1="21" y1="1" x2="18" y2="4"/>
                    <line x1="9" y1="1" x2="9.01" y2="1" strokeWidth="3"/>
                  </svg>
                  <span className="hidden sm:inline">截圖編輯</span>
                  {/* Pencil overlay icon */}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="-ml-0.5 text-violet-500">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>

                {/* Close button */}
                <button
                  onClick={() => setExpanded(false)}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 text-sm sm:text-base text-gray-600 dark:text-gray-300 font-semibold transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 1l12 12M13 1L1 13" />
                  </svg>
                  <span className="hidden sm:inline">關閉</span>
                </button>
              </div>
            </div>

            {/* Chart content */}
            <div ref={scrollContainerRef} data-screenshot-scroll className="flex-1 overflow-y-auto p-3 sm:p-6">
              {typeof children === 'function' ? children(true) : children}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Screenshot editor (portal, full-screen overlay) ── */}
      {showEditor && (
        <ScreenshotEditor
          targetRef={modalContentRef}
          scrollRef={scrollContainerRef}
          onClose={() => setShowEditor(false)}
          title={title}
        />
      )}
    </>
  )
}

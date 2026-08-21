import pkg from '../../package.json'
import changelogRaw from '../../CHANGELOG.md?raw'

export const APP_VERSION = pkg.version

/**
 * 修改歷程視窗 — 直接渲染 repo 的 CHANGELOG.md（單一資料來源）
 * 支援的格式：## 版本標題、### 小節、- 條列、**粗體**、一般段落
 */
function Inline({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-gray-800 dark:text-gray-100">{p.slice(2, -2)}</strong>
      : p.startsWith('`') && p.endsWith('`')
        ? <code key={i} className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 font-mono">{p.slice(1, -1)}</code>
        : <span key={i}>{p}</span>
  )
}

export default function ChangelogModal({ open, onClose }) {
  if (!open) return null
  const lines = changelogRaw.split('\n')

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div>
            <h2 className="text-base font-black text-white">📋 修改歷程</h2>
            <p className="text-xs text-blue-200">目前版本 v{APP_VERSION}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          {lines.map((line, i) => {
            if (line.startsWith('## ')) return (
              <p key={i} className="font-black text-blue-700 dark:text-blue-400 text-base mt-4 mb-1 pb-1 border-b border-gray-100 dark:border-gray-700">
                {line.slice(3)}
              </p>
            )
            if (line.startsWith('### ')) return <p key={i} className="font-bold text-gray-700 dark:text-gray-200 mt-2 mb-0.5"><Inline text={line.slice(4)} /></p>
            if (line.startsWith('# ')) return null
            if (/^\s*- /.test(line)) {
              const indent = (line.match(/^\s*/)[0].length / 2) | 0
              return (
                <p key={i} className="flex gap-1.5 my-0.5 text-gray-600 dark:text-gray-300" style={{ paddingLeft: indent * 14 }}>
                  <span className="opacity-50 flex-shrink-0">•</span>
                  <span><Inline text={line.replace(/^\s*- /, '')} /></span>
                </p>
              )
            }
            if (line.startsWith('> ')) return <p key={i} className="text-xs text-gray-400 dark:text-gray-500 my-1 pl-3 border-l-2 border-gray-200 dark:border-gray-600"><Inline text={line.slice(2)} /></p>
            if (!line.trim()) return <div key={i} className="h-1.5" />
            return <p key={i} className="my-0.5 text-gray-600 dark:text-gray-300"><Inline text={line} /></p>
          })}
        </div>
      </div>
    </div>
  )
}

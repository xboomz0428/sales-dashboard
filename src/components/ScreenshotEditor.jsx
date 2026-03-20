import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'

// ── Constants ─────────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF', '#000000',
]

const TOOLS = [
  { id: 'mosaic', label: '馬賽克', icon: '▦', hint: '拖曳選取要遮擋的區域' },
  { id: 'rect',   label: '矩形',   icon: '▭', hint: '拖曳繪製矩形框' },
  { id: 'fill',   label: '色塊',   icon: '■', hint: '拖曳繪製實心色塊' },
  { id: 'circle', label: '圓形',   icon: '◯', hint: '拖曳繪製橢圓' },
  { id: 'line',   label: '直線',   icon: '╱', hint: '拖曳繪製直線（按住 Shift 鎖定 45°）' },
  { id: 'dline',  label: '虛線',   icon: '╌', hint: '拖曳繪製虛線（按住 Shift 鎖定 45°）' },
  { id: 'arrow',  label: '箭頭',   icon: '↗', hint: '拖曳繪製箭頭' },
  { id: 'pen',    label: '畫筆',   icon: '✏', hint: '自由手繪' },
  { id: 'text',   label: '文字',   icon: 'T', hint: '點擊畫面放置文字，Enter 確認' },
]

// ── ScreenshotEditor ──────────────────────────────────────────────────────────
export default function ScreenshotEditor({ targetRef, scrollRef, onClose, title = '' }) {
  const canvasRef  = useRef(null)
  const [tool, setTool]             = useState('rect')
  const [color, setColor]           = useState('#EF4444')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [mosaicSize, setMosaicSize]  = useState(16)
  const [capturing, setCapturing]    = useState(true)
  const [canUndo, setCanUndo]        = useState(false)
  const [textInput, setTextInput]    = useState(null) // { x, y, cx, cy, value }
  const [zoom, setZoom]              = useState(1)
  const [canvasNat, setCanvasNat]    = useState({ w: 0, h: 0 }) // natural canvas px size

  // Mutable refs (avoid stale closures in event handlers)
  const drawingRef   = useRef(false)
  const startPosRef  = useRef({ x: 0, y: 0 })
  const savedDataRef = useRef(null)
  const historyRef   = useRef([])
  const histIdx      = useRef(-1)
  const scaleRef     = useRef(1)       // capture DPR scale
  const shiftRef     = useRef(false)   // Shift key held
  const toolRef      = useRef(tool)
  const colorRef     = useRef(color)
  const swRef        = useRef(strokeWidth)
  const msRef        = useRef(mosaicSize)
  const textInputRef  = useRef(textInput)
  const canvasAreaRef = useRef(null)

  useEffect(() => { toolRef.current  = tool },        [tool])
  useEffect(() => { colorRef.current = color },       [color])
  useEffect(() => { swRef.current    = strokeWidth }, [strokeWidth])
  useEffect(() => { msRef.current    = mosaicSize },  [mosaicSize])
  useEffect(() => { textInputRef.current = textInput }, [textInput])

  // ── Capture ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = targetRef?.current
    if (!el) { setCapturing(false); return }

    const MAX_CAPTURE_H = 2000

    // ── Step 1: Measure dimensions BEFORE any changes ──────────────────────
    // We need these to accurately reconstruct the layout in the clone.
    const scrollEl      = scrollRef?.current
    const captureW      = el.offsetWidth
    const origScrollH   = scrollEl ? scrollEl.offsetHeight : 0
    const headerH       = el.offsetHeight - origScrollH   // header + padding outside scroll area

    // ── Step 2: Expand scroll container in the LIVE DOM ─────────────────────
    //    overflow:hidden removes the scrollbar (no content-width side-effect),
    //    explicit height expands the flex child to full content.
    //    We do NOT touch `el` (the outer modal) at all — changing its overflow
    //    or height breaks the flex-col layout and causes visual corruption.
    const scrollTargetH = scrollEl
      ? Math.min(scrollEl.scrollHeight, MAX_CAPTURE_H - headerH)
      : 0
    const captureH = Math.min(headerH + scrollTargetH, MAX_CAPTURE_H)

    let savedScroll = null
    if (scrollEl) {
      savedScroll = {
        overflow:   scrollEl.style.overflow,
        height:     scrollEl.style.height,
        maxHeight:  scrollEl.style.maxHeight,
        flexShrink: scrollEl.style.flexShrink,
        scrollTop:  scrollEl.scrollTop,
      }
      scrollEl.scrollTop        = 0
      scrollEl.style.overflow   = 'hidden'
      scrollEl.style.height     = scrollTargetH + 'px'
      scrollEl.style.maxHeight  = 'none'
      scrollEl.style.flexShrink = '0'
    }

    // ── Step 3: Background colour & scale ──────────────────────────────────
    // Always use pure white so the screenshot is clean regardless of dark mode.
    const bgColor = '#ffffff'
    const dpr = 1   // scale:1 is 4× faster than scale:2 on retina
    scaleRef.current = dpr

    const restore = () => {
      if (scrollEl && savedScroll) {
        scrollEl.style.overflow   = savedScroll.overflow
        scrollEl.style.height     = savedScroll.height
        scrollEl.style.maxHeight  = savedScroll.maxHeight
        scrollEl.style.flexShrink = savedScroll.flexShrink
        scrollEl.scrollTop        = savedScroll.scrollTop
      }
    }

    // ── Step 4: Double-rAF ──────────────────────────────────────────────────
    //    First rAF:  ResizeObserver fires, React queues chart re-renders.
    //    Second rAF: re-renders complete and paint — html2canvas sees correct
    //    chart dimensions (eliminates gray-area artifact on the right).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {

        html2canvas(el, {
          scale:           dpr,
          useCORS:         true,
          allowTaint:      true,
          logging:         false,
          imageTimeout:    0,
          backgroundColor: bgColor,
          width:           captureW,
          height:          captureH,
          ignoreElements:  (elem) => elem.dataset?.noCapture === 'true',
          // onclone: expand the OUTER modal container only inside the clone
          // (never in the live DOM) so the flex layout is never disrupted.
          // Also force light-mode so all dark: Tailwind variants are removed,
          // giving white backgrounds and consistent gray borders everywhere.
          onclone: (doc, clonedEl) => {
            // Remove dark mode → all dark:bg-* classes revert to light values
            doc.documentElement.classList.remove('dark')

            clonedEl.style.overflow        = 'visible'
            clonedEl.style.maxHeight       = 'none'
            clonedEl.style.height          = captureH + 'px'
            clonedEl.style.width           = captureW + 'px'
            clonedEl.style.backgroundColor = '#ffffff'

            const scrollClone = clonedEl.querySelector('[data-screenshot-scroll]')
            if (scrollClone) {
              scrollClone.style.overflow        = 'visible'
              scrollClone.style.height          = scrollTargetH + 'px'
              scrollClone.style.maxHeight       = 'none'
              scrollClone.style.flexShrink      = '0'
              scrollClone.style.backgroundColor = '#ffffff'
            }
          },
        }).then(captured => {
          restore()
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.width  = captured.width
          canvas.height = captured.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(captured, 0, 0)

          // Fit-zoom: fill editor window without scrolling
          const editorW = window.innerWidth  - 48
          const editorH = window.innerHeight - 120
          const fitZ    = Math.min(editorW / captured.width, editorH / captured.height, 1)
          setCanvasNat({ w: captured.width, h: captured.height })
          setZoom(Math.max(0.25, Math.round(fitZ * 4) / 4))

          setCapturing(false)
          const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
          historyRef.current = [id]
          histIdx.current    = 0
          setCanUndo(false)
        }).catch(err => {
          console.error('html2canvas error:', err)
          restore()
          setCapturing(false)
        })

      }) // end inner rAF
    }) // end outer rAF
  }, []) // eslint-disable-line

  // ── History ──────────────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const id  = ctx.getImageData(0, 0, canvas.width, canvas.height)
    historyRef.current = historyRef.current.slice(0, histIdx.current + 1)
    historyRef.current.push(id)
    histIdx.current = historyRef.current.length - 1
    setCanUndo(histIdx.current > 0)
  }, [])

  const undo = useCallback(() => {
    if (histIdx.current <= 0) return
    histIdx.current -= 1
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.putImageData(historyRef.current[histIdx.current], 0, 0)
    setCanUndo(histIdx.current > 0)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const applyCtxStyle = (ctx) => {
    const sw = swRef.current * scaleRef.current
    ctx.strokeStyle = colorRef.current
    ctx.fillStyle   = colorRef.current
    ctx.lineWidth   = sw
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    return sw
  }

  // ── Mosaic ───────────────────────────────────────────────────────────────────
  const applyMosaic = useCallback((ctx, x1, y1, x2, y2) => {
    const rx = Math.round(Math.min(x1, x2))
    const ry = Math.round(Math.min(y1, y2))
    const rw = Math.round(Math.abs(x2 - x1))
    const rh = Math.round(Math.abs(y2 - y1))
    if (rw < 2 || rh < 2) return
    const bs = Math.max(2, msRef.current * scaleRef.current)
    const id = ctx.getImageData(rx, ry, rw, rh)
    const d  = id.data
    for (let py = 0; py < rh; py += bs) {
      for (let px = 0; px < rw; px += bs) {
        let r = 0, g = 0, b = 0, a = 0, n = 0
        for (let dy = 0; dy < bs && py + dy < rh; dy++) {
          for (let dx = 0; dx < bs && px + dx < rw; dx++) {
            const i = ((py + dy) * rw + (px + dx)) * 4
            r += d[i]; g += d[i+1]; b += d[i+2]; a += d[i+3]; n++
          }
        }
        r = Math.round(r/n); g = Math.round(g/n)
        b = Math.round(b/n); a = Math.round(a/n)
        for (let dy = 0; dy < bs && py + dy < rh; dy++) {
          for (let dx = 0; dx < bs && px + dx < rw; dx++) {
            const i = ((py + dy) * rw + (px + dx)) * 4
            d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = a
          }
        }
      }
    }
    ctx.putImageData(id, rx, ry)
  }, [])

  // ── Arrow ────────────────────────────────────────────────────────────────────
  const drawArrow = (ctx, x1, y1, x2, y2, sw) => {
    const len = Math.hypot(x2-x1, y2-y1)
    if (len < 2) return
    const headLen = Math.max(sw * 3, len * 0.25, 12 * scaleRef.current)
    const angle   = Math.atan2(y2-y1, x2-x1)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    // Filled arrowhead
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI/6), y2 - headLen * Math.sin(angle - Math.PI/6))
    ctx.lineTo(x2 - headLen * 0.5 * Math.cos(angle), y2 - headLen * 0.5 * Math.sin(angle))
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI/6), y2 - headLen * Math.sin(angle + Math.PI/6))
    ctx.closePath(); ctx.fill()
  }

  // ── Shift-snap: constrain endpoint to 0°/45°/90°/135° ──────────────────────
  const snapAngle = (sx, sy, ex, ey) => {
    if (!shiftRef.current) return { x: ex, y: ey }
    const dx  = ex - sx
    const dy  = ey - sy
    const len = Math.hypot(dx, dy)
    const ang = Math.atan2(dy, dx)
    // Round to nearest 45°
    const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
    return { x: sx + len * Math.cos(snapped), y: sy + len * Math.sin(snapped) }
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (toolRef.current === 'text') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e)
    drawingRef.current  = true
    startPosRef.current = pos
    applyCtxStyle(ctx)
    if (toolRef.current === 'pen') {
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
    } else {
      savedDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
  }, []) // eslint-disable-line

  const handleMouseMove = useCallback((e) => {
    if (!drawingRef.current) return
    const t = toolRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    const pos  = getPos(e)
    const { x: sx, y: sy } = startPosRef.current
    const sw   = applyCtxStyle(ctx)

    if (t === 'pen') {
      ctx.lineTo(pos.x, pos.y); ctx.stroke()
    } else {
      if (savedDataRef.current) ctx.putImageData(savedDataRef.current, 0, 0)
      if (t === 'rect') {
        ctx.strokeRect(sx, sy, pos.x - sx, pos.y - sy)
      } else if (t === 'fill') {
        ctx.fillRect(sx, sy, pos.x - sx, pos.y - sy)
      } else if (t === 'circle') {
        const rx = Math.abs(pos.x - sx) / 2
        const ry = Math.abs(pos.y - sy) / 2
        ctx.beginPath()
        ctx.ellipse((sx + pos.x) / 2, (sy + pos.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI)
        ctx.stroke()
      } else if (t === 'line') {
        const ep = snapAngle(sx, sy, pos.x, pos.y)
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ep.x, ep.y); ctx.stroke()
      } else if (t === 'dline') {
        const ep = snapAngle(sx, sy, pos.x, pos.y)
        ctx.save()
        ctx.setLineDash([sw * 3.5, sw * 2.5])
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ep.x, ep.y); ctx.stroke()
        ctx.restore()
      } else if (t === 'arrow') {
        drawArrow(ctx, sx, sy, pos.x, pos.y, sw)
      } else if (t === 'mosaic') {
        // Dashed selection preview
        ctx.save()
        ctx.setLineDash([8 * scaleRef.current, 5 * scaleRef.current])
        ctx.strokeStyle = '#38BDF8'
        ctx.lineWidth   = 2 * scaleRef.current
        ctx.strokeRect(sx, sy, pos.x - sx, pos.y - sy)
        ctx.restore()
      }
    }
  }, []) // eslint-disable-line

  const handleMouseUp = useCallback((e) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const t      = toolRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    if (t === 'mosaic') {
      const pos = getPos(e)
      const { x: sx, y: sy } = startPosRef.current
      if (savedDataRef.current) ctx.putImageData(savedDataRef.current, 0, 0)
      applyMosaic(ctx, sx, sy, pos.x, pos.y)
    }
    savedDataRef.current = null
    pushHistory()
  }, [applyMosaic, pushHistory]) // eslint-disable-line

  // ── Text tool ────────────────────────────────────────────────────────────────
  const handleClick = useCallback((e) => {
    if (toolRef.current !== 'text') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect  = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    setTextInput({
      x:  e.clientX - rect.left,
      y:  e.clientY - rect.top,
      cx: (e.clientX - rect.left) * scaleX,
      cy: (e.clientY - rect.top)  * scaleY,
      value: '',
    })
  }, [])

  const commitText = useCallback(() => {
    if (!textInputRef.current?.value?.trim()) { setTextInput(null); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const fs  = (swRef.current * 7 + 14) * scaleRef.current
    ctx.font         = `bold ${fs}px sans-serif`
    ctx.fillStyle    = colorRef.current
    ctx.textBaseline = 'top'
    ctx.fillText(textInputRef.current.value, textInputRef.current.cx, textInputRef.current.cy)
    pushHistory()
    setTextInput(null)
  }, [pushHistory])

  // ── Save as JPG ──────────────────────────────────────────────────────────────
  const saveJpg = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      const ts  = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')
      a.href = url; a.download = `chart_${ts}.jpg`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/jpeg', 0.93)
  }, [])

  // ── Keyboard shortcuts + Shift tracking ─────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === 'Shift') { shiftRef.current = true; return }
      if (textInputRef.current) {
        if (e.key === 'Escape') setTextInput(null)
        return
      }
      if (e.key === 'Escape') { onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveJpg() }
    }
    const onUp = (e) => { if (e.key === 'Shift') shiftRef.current = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [onClose, undo, saveJpg])

  // ── Wheel zoom (Ctrl + scroll) ───────────────────────────────────────────────
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.25 : -0.25
      setZoom(z => Math.min(3, Math.max(0.25, Math.round((z + delta) * 4) / 4)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Cursor ───────────────────────────────────────────────────────────────────
  const cursor = tool === 'text' ? 'text' : 'crosshair'

  // ── Render ───────────────────────────────────────────────────────────────────
  const currentHint = TOOLS.find(t => t.id === tool)?.hint ?? ''

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-gray-950" style={{ zIndex: 999999 }}>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 min-h-[54px]">

        {/* Title */}
        <span className="text-white font-bold text-sm shrink-0 mr-1">✂️ 截圖編輯</span>
        <div className="w-px h-5 bg-gray-700 shrink-0" />

        {/* Tool buttons */}
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} title={t.hint}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tool === t.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/60 scale-105'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}>
            <span className="text-base leading-none">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}

        <div className="w-px h-5 bg-gray-700 shrink-0" />

        {/* Preset colors */}
        <div className="flex items-center gap-1">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} title={c}
              className={`w-6 h-6 rounded-full transition-all border-2 ${
                color === c ? 'border-white scale-110 shadow-lg' : 'border-gray-700 hover:border-gray-400'
              }`}
              style={{ background: c }}
            />
          ))}
          {/* Custom color picker */}
          <label title="自訂顏色" className="relative w-7 h-7 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-gray-500 hover:border-gray-300 transition-colors flex items-center justify-center" style={{ background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            <span className="text-white text-xs font-bold drop-shadow select-none">+</span>
          </label>
        </div>

        <div className="w-px h-5 bg-gray-700 shrink-0" />

        {/* Stroke width */}
        <div className="flex items-center gap-1">
          {[2, 3, 5, 8].map(w => (
            <button key={w} onClick={() => setStrokeWidth(w)} title={`線條粗細 ${w}px`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                strokeWidth === w ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
              }`}>
              <div style={{ width: Math.min(w * 2.5, 22), height: w, background: strokeWidth === w ? '#fff' : '#9ca3af', borderRadius: w }} />
            </button>
          ))}
        </div>

        {/* Mosaic size (only when mosaic active) */}
        {tool === 'mosaic' && <>
          <div className="w-px h-5 bg-gray-700 shrink-0" />
          <span className="text-gray-400 text-xs shrink-0">馬賽克大小:</span>
          {[8, 16, 32].map(s => (
            <button key={s} onClick={() => setMosaicSize(s)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                mosaicSize === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}>{s}px</button>
          ))}
        </>}

        <div className="flex-1" />

        {/* Zoom controls */}
        {!capturing && <>
          <div className="w-px h-5 bg-gray-700 shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 4) / 4))}
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-white text-lg font-bold leading-none transition-colors" title="縮小">−</button>
            <button onClick={() => setZoom(1)}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono min-w-[44px] text-center transition-colors" title="重設 100%">
              {Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 4) / 4))}
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-white text-lg font-bold leading-none transition-colors" title="放大">+</button>
          </div>
          <div className="w-px h-5 bg-gray-700 shrink-0" />
        </>}

        {/* Undo */}
        <button onClick={undo} disabled={!canUndo} title="撤銷 (Ctrl+Z)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm transition-colors shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>
          <span className="hidden sm:inline">撤銷</span>
        </button>

        {/* Save JPG */}
        <button onClick={saveJpg} title="儲存為 JPG (Ctrl+S)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          <span className="hidden sm:inline">存 JPG</span>
        </button>

        {/* Close */}
        <button onClick={onClose} title="關閉 (ESC)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-red-700 text-white text-sm transition-colors shrink-0">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M1 1l12 12M13 1L1 13"/></svg>
          <span className="hidden sm:inline">關閉</span>
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div ref={canvasAreaRef}
        className="flex-1 overflow-auto p-6 bg-gray-950"
        style={{ cursor }}>

        {capturing && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-gray-300 text-sm">正在截取畫面，請稍候…</p>
            </div>
          </div>
        )}

        {/* Wrapper maintains layout space for the zoomed canvas */}
        <div className="relative select-none inline-block" style={{ display: capturing ? 'none' : 'inline-block' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            style={{
              display: 'block',
              // Apply zoom via CSS width/height (canvas pixel data stays full-res)
              width:  canvasNat.w ? Math.round(canvasNat.w * zoom) + 'px' : undefined,
              height: canvasNat.h ? Math.round(canvasNat.h * zoom) + 'px' : undefined,
              cursor,
              userSelect: 'none',
              boxShadow: '0 4px 60px rgba(0,0,0,0.7)',
            }}
          />

          {/* Text input floating over canvas */}
          {textInput && (
            <div className="absolute z-20 flex items-center gap-1.5"
              style={{ left: textInput.x, top: textInput.y, transform: 'translateY(-50%)' }}>
              <input
                autoFocus
                value={textInput.value}
                onChange={e => setTextInput(p => ({ ...p, value: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextInput(null) }}
                className="px-3 py-1.5 rounded-xl border-2 border-blue-400 bg-white text-gray-900 text-sm font-medium outline-none shadow-2xl min-w-[160px]"
                placeholder="輸入文字後按 Enter…"
              />
              <button onClick={commitText}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-2xl transition-colors">
                確認
              </button>
              <button onClick={() => setTextInput(null)}
                className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm shadow-2xl transition-colors">
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      {!capturing && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-t border-gray-800 flex-shrink-0">
          <span className="text-blue-400 text-xs">{currentHint}</span>
          <span className="text-gray-600 text-xs hidden sm:inline">Ctrl+Z 撤銷 · Ctrl+S 儲存 · ESC 關閉</span>
        </div>
      )}
    </div>,
    document.body
  )
}

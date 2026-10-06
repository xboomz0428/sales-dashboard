/**
 * useFontScale — 全站字級與高對比（老花友善）
 * ─────────────────────────────────────────────────────────────────────────────
 * 把 <html> 的 font-size 設成 16／18／20／24px，Tailwind 的 rem 全部跟著放大；
 * 高對比加 class `hc`（index.css 內定義：深字、粗邊框）。設定存瀏覽器，每台裝置各自記。
 */
import { useState, useEffect, useCallback } from 'react'

export const FONT_SCALES = [
  { value: 16, label: '標準' },
  { value: 18, label: '大' },
  { value: 20, label: '特大' },
  { value: 24, label: '超大' },
]
const LS_SCALE = 'ui_font_scale'
const LS_HC = 'ui_high_contrast'

export function useFontScale() {
  const [scale, setScaleState] = useState(() => {
    const v = Number(localStorage.getItem(LS_SCALE))
    return FONT_SCALES.some(s => s.value === v) ? v : 18
  })
  const [highContrast, setHcState] = useState(() => localStorage.getItem(LS_HC) !== '0')

  useEffect(() => {
    document.documentElement.style.fontSize = scale + 'px'
    localStorage.setItem(LS_SCALE, String(scale))
  }, [scale])
  useEffect(() => {
    document.documentElement.classList.toggle('hc', highContrast)
    localStorage.setItem(LS_HC, highContrast ? '1' : '0')
  }, [highContrast])

  const setScale = useCallback(v => setScaleState(Number(v)), [])
  const setHighContrast = useCallback(v => setHcState(!!v), [])
  const bump = useCallback(() => setScaleState(s => {
    const i = FONT_SCALES.findIndex(x => x.value === s)
    return FONT_SCALES[(i + 1) % FONT_SCALES.length].value
  }), [])

  return { scale, setScale, highContrast, setHighContrast, bump, scales: FONT_SCALES }
}

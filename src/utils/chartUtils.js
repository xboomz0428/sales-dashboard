/**
 * 動態計算 Y 軸（數值軸）寬度
 * @param {number} maxVal - 最大值
 * @param {function} formatter - 格式化函數
 */
export function calcValueAxisWidth(maxVal, formatter) {
  if (!maxVal) return 55
  const label = formatter ? formatter(maxVal) : Math.round(maxVal).toLocaleString()
  return Math.max(50, label.length * 11 + 10)
}

/**
 * 動態計算橫向長條圖的類別軸（名稱軸）寬度
 * @param {Array} data - 資料陣列
 * @param {string} nameKey - 名稱欄位
 */
export function calcNameAxisWidth(data, nameKey = 'name') {
  if (!data?.length) return 90
  const longest = Math.max(...data.map(d => (d[nameKey] || '').length))
  // 中文字約 14px，英文約 8px，取近似值 12px/字
  return Math.max(60, Math.min(200, longest * 12 + 16))
}

/**
 * 動態計算 X 軸（時間 / 類別軸）的 tick 設定
 * 當項目過多時自動旋轉標籤
 * @param {number} count - 資料點數量
 * @param {object} options
 */
export function getXAxisTickProps(count, { maxFlat = 12, maxAngle30 = 24 } = {}) {
  if (count <= maxFlat) {
    return { angle: 0, textAnchor: 'middle', height: 32, interval: 0 }
  }
  if (count <= maxAngle30) {
    return { angle: -30, textAnchor: 'end', height: 52, interval: 0 }
  }
  return {
    angle: -45,
    textAnchor: 'end',
    height: 70,
    interval: Math.floor(count / 18),
  }
}

/**
 * 取得資料中某欄位的最大值（支援多 key）
 * @param {Array} data
 * @param {string|string[]} keys
 */
export function getMaxValue(data, keys) {
  if (!data?.length) return 0
  const keyList = Array.isArray(keys) ? keys : [keys]
  return Math.max(0, ...data.flatMap(d => keyList.map(k => d[k] || 0)))
}

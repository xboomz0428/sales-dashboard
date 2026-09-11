/**
 * opMargin.js — 營益率健康分級（一般零售／批發電商基準）
 * 台灣批發零售與電商業營益率普遍 3~6%；5% 為及格線、10%+ 良好、15%+ 優秀（品牌力/規模優勢）。
 * 本公司屬多品牌代理經銷＋自有品牌，採零售批發基準。
 */
export function opMarginTier(rate) {
  if (rate == null || isNaN(rate)) return { label: '', cls: 'text-gray-400', bg: '' }
  if (rate < 0) return { label: '虧損', cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' }
  if (rate < 0.05) return { label: '偏低', cls: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' }
  if (rate < 0.10) return { label: '尚可', cls: 'text-lime-600 dark:text-lime-500', bg: 'bg-lime-100 dark:bg-lime-900/40' }
  if (rate < 0.15) return { label: '良好', cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' }
  return { label: '優秀', cls: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-100 dark:bg-teal-900/40' }
}

export const OP_MARGIN_LEGEND =
  '營益率分級（零售/批發電商基準）：🔴 <0% 虧損｜🟠 0~5% 偏低（低於業界及格線）｜🟡 5~10% 尚可｜🟢 10~15% 良好｜💠 >15% 優秀。台灣批發零售業普遍 3~6%，自有品牌長期目標建議 10~15%+。'

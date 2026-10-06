/**
 * seo-plan.ts — 關鍵字池 × 關鍵字地圖 × 行事曆 → SEO 文章／活動規劃表（每週一產生，寫 seo_plan）
 * 規則：每個「可衝內容／長尾」字依所屬群組（keyword_map.cluster）聚成一篇；
 *       行事曆 60 天內的檔期各配一篇節氣／神明故事文與一個活動列；每週篇數上限 keywords.seo_posts_per_week。
 */
export interface PoolKw { keyword: string; judgement: string; cluster?: string; target_page?: string; score: number; gsc_position?: number }
export interface CalEvent { id: string; name: string; date: string; kind: string; stage: string; product_tags: string[]; note?: string }
export function buildSeoPlan(pool: PoolKw[], events: CalEvent[], weekStart: string, perWeek: number) {
  const rows: { week: string; type: 'article' | 'activity'; title: string; keywords: string[]; event_id?: string; target_page?: string; priority: number }[] = []
  // 1) 檔期文：醞釀／準備期的節氣、神明、盛事各一篇
  for (const e of events.filter(e => ['brewing', 'prepare'].includes(e.stage))) {
    const kws = pool.filter(k => k.keyword.includes(e.name.slice(0, 2)) || e.product_tags.some(t => k.keyword.includes(t.replace(/-.*/, '').slice(0, 2)))).map(k => k.keyword).slice(0, 5)
    rows.push({ week: weekStart, type: 'article', title: `${e.name}：${e.note || '由來、習俗與準備'}`, keywords: kws, event_id: e.id, priority: e.kind === 'religious' || e.kind === 'deity' ? 3 : 2 })
    rows.push({ week: weekStart, type: 'activity', title: `${e.name} 檔期活動（${e.product_tags.slice(0, 2).join('＋')}）`, keywords: kws.slice(0, 3), event_id: e.id, priority: 2 })
  }
  // 2) 內容字：依群組聚合，排名 4～10 優先
  const byCluster = new Map<string, PoolKw[]>()
  for (const k of pool.filter(k => ['content', 'longtail', 'opportunity'].includes(k.judgement))) {
    const c = k.cluster || k.keyword.slice(0, 4)
    byCluster.set(c, [...(byCluster.get(c) || []), k])
  }
  for (const [cluster, kws] of byCluster) {
    const sorted = kws.sort((a, b) => b.score - a.score)
    rows.push({ week: weekStart, type: 'article', title: `${cluster}：${sorted[0].keyword} 完整指南`, keywords: sorted.map(k => k.keyword).slice(0, 8), target_page: sorted[0].target_page, priority: sorted.some(k => (k.gsc_position || 99) <= 10) ? 3 : 1 })
  }
  return rows.sort((a, b) => b.priority - a.priority).slice(0, Math.max(perWeek, 1) + events.length)
}

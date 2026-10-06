/**
 * launch.ts — 企劃卡 → Google Ads 直接上線（plan / validate / apply）
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. buildLaunchPlan(brief, cfg)：把核准的企劃卡轉成 Google Ads API mutate 操作清單（純函式、可預覽）
 *    campaignBudget → campaign（搜尋、台灣、繁中、出價策略）→ adGroup → adGroupCriterion（關鍵字＋否定字）
 *    → adGroupAd（RSA：標題 ≤ 15、描述 ≤ 4）→ 自動標記 gclid、UTM 到達網址
 * 2. validate：同一份 operations 以 validateOnly=true 呼叫 googleAds:mutate，錯誤直接回畫面（字數、政策字）
 * 3. apply：正式送出；launch.mode=paused 時 campaign.status=PAUSED，老闆在 Ads 後台或本工具按「啟用」
 * 需要：Google Ads API Basic 以上存取等級（Explorer 只能讀）；developer token；OAuth refresh token。
 */
export interface Brief {
  id: number; title: string; campaign_name: string; adgroup_name: string
  headlines: string[]; descriptions: string[]
  keywords: { text: string; match: 'EXACT' | 'PHRASE' | 'BROAD' }[]
  negatives: string[]; final_url?: string; daily_budget: number; start_date?: string; end_date?: string
}
export interface LaunchCfg { customerId: string; mode: 'paused' | 'enabled' | 'manual'; bidding: string; final_url: string; utm_template: string; target_cpa?: number }

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
export function buildLaunchPlan(b: Brief, cfg: LaunchCfg) {
  const c = `customers/${cfg.customerId}`
  const budgetRes = `${c}/campaignBudgets/-1`, campRes = `${c}/campaigns/-2`, agRes = `${c}/adGroups/-3`
  const url = (b.final_url || cfg.final_url) + (cfg.utm_template ? ((b.final_url || cfg.final_url).includes('?') ? '&' : '?') + cfg.utm_template.replace('{campaign}', encodeURIComponent(b.campaign_name)).replace('{adgroup}', encodeURIComponent(b.adgroup_name)) : '')
  const bidding = cfg.bidding === 'TARGET_CPA' && cfg.target_cpa
    ? { maximizeConversions: { targetCpaMicros: String(Math.round(cfg.target_cpa * 1e6)) } }
    : { maximizeConversions: {} }
  const ops: any[] = [
    { campaignBudgetOperation: { create: { resourceName: budgetRes, name: `${b.campaign_name} 預算`, amountMicros: String(Math.round(b.daily_budget * 1e6)), deliveryMethod: 'STANDARD', explicitlyShared: false } } },
    { campaignOperation: { create: { resourceName: campRes, name: b.campaign_name, status: cfg.mode === 'enabled' ? 'ENABLED' : 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: budgetRes,
      ...bidding, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
      startDate: b.start_date?.replace(/-/g, ''), endDate: b.end_date?.replace(/-/g, '') } } },
    { campaignCriterionOperation: { create: { campaign: campRes, location: { geoTargetConstant: 'geoTargetConstants/2158' } } } },   // 台灣
    { campaignCriterionOperation: { create: { campaign: campRes, language: { languageConstant: 'languageConstants/1018' } } } },     // 繁體中文
    ...b.negatives.map(t => ({ campaignCriterionOperation: { create: { campaign: campRes, negative: true, keyword: { text: t, matchType: 'PHRASE' } } } })),
    { adGroupOperation: { create: { resourceName: agRes, name: b.adgroup_name, campaign: campRes, status: 'ENABLED', type: 'SEARCH_STANDARD' } } },
    ...b.keywords.map(k => ({ adGroupCriterionOperation: { create: { adGroup: agRes, status: 'ENABLED', keyword: { text: k.text, matchType: k.match } } } })),
    { adGroupAdOperation: { create: { adGroup: agRes, status: 'ENABLED', ad: { finalUrls: [url],
      responsiveSearchAd: { headlines: b.headlines.slice(0, 15).map(text => ({ text })), descriptions: b.descriptions.slice(0, 4).map(text => ({ text })) } } } } },
  ]
  const problems: string[] = []
  if (b.headlines.length < 3) problems.push('標題至少 3 則')
  if (b.descriptions.length < 2) problems.push('描述至少 2 則')
  b.headlines.forEach((h, i) => { if ([...h].length > 30) problems.push(`標題 ${i + 1} 超過 30 字元`) })
  b.descriptions.forEach((d, i) => { if ([...d].length > 90) problems.push(`描述 ${i + 1} 超過 90 字元`) })
  if (!b.keywords.length) problems.push('沒有關鍵字')
  return { mutateOperations: ops, problems, preview: { campaign: b.campaign_name, adgroup: b.adgroup_name, url, keywords: b.keywords.length, negatives: b.negatives.length, headlines: b.headlines.length, descriptions: b.descriptions.length, daily_budget: b.daily_budget, status: cfg.mode === 'enabled' ? 'ENABLED' : 'PAUSED' } }
}

/** validateOnly 或正式 apply：adsFetch 由 google.ts 提供（帶 developer-token、login-customer-id、OAuth） */
export async function mutate(adsFetch: (path: string, body: any) => Promise<any>, customerId: string, plan: ReturnType<typeof buildLaunchPlan>, validateOnly: boolean) {
  return adsFetch(`customers/${customerId}/googleAds:mutate`, { mutateOperations: plan.mutateOperations, validateOnly, partialFailure: false })
}

/** 上線前串接檢查（全綠才開放「送上 Google Ads」）：每項回 ok/訊息；資料來自 GAQL 與 GA4 Admin */
export async function preflight(gaql: (q: string) => Promise<any[]>, ga4Linked: () => Promise<boolean>, siteOk: () => Promise<boolean>) {
  const items: { key: string; label: string; ok: boolean; hint: string }[] = []
  const conv = await gaql(`select conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.primary_for_goal from conversion_action where conversion_action.status = 'ENABLED'`)
  const hasPurchase = conv.some((r: any) => /GA4|purchase|購買/i.test(r.conversionAction?.name || '') || r.conversionAction?.type?.startsWith('GOOGLE_ANALYTICS_4'))
  items.push({ key: 'conversion', label: '轉換動作（GA4 購買匯入）', ok: hasPurchase, hint: hasPurchase ? '' : 'Ads 後台 → 目標 → 轉換 → 從 GA4 匯入 purchase' })
  const cust = await gaql(`select customer.auto_tagging_enabled, customer.currency_code, customer.time_zone from customer`)
  items.push({ key: 'autotag', label: '自動標記（gclid）', ok: !!cust[0]?.customer?.autoTaggingEnabled, hint: 'Ads 後台 → 管理員 → 帳戶設定 → 自動標記' })
  items.push({ key: 'ga4link', label: 'Ads ↔ GA4 354485202 已連結', ok: await ga4Linked(), hint: 'GA4 管理 → 產品連結 → Google Ads' })
  items.push({ key: 'site', label: '到達網址 heroherb.co 回 200 且含 GA4 標籤', ok: await siteOk(), hint: 'QDM 後台確認 gtag(G-…) 或 GTM 有裝' })
  return { ok: items.every(i => i.ok), items }
}

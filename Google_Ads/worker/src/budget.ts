/**
 * budget.ts — 上線後每日觀察與預算自動優化（07:00 排程呼叫）
 * ─────────────────────────────────────────────────────────────────────────────
 * 純函式 planBudgetChanges(rows, cfg) 回傳每個活動的建議（不碰 API），
 * applyBudgetChanges() 依設定 budget.auto_mode：
 *   suggest → 寫 suggestions + alerts，老闆在「今天要做」按確認才套用
 *   auto    → 在 auto_daily_min～auto_daily_max、單次 ±auto_step_pct、冷卻天數內直接呼叫
 *             campaignBudgets:mutate；每次都寫 budget_log，LINE 摘要列出
 *   off     → 只觀察
 * 所有門檻來自 settings（見 shared/settings.js budget.* / bid.* / alert.*）。
 */
export interface CampaignWindow {
  campaign_id: string; campaign: string; status: string
  daily_budget: number            // 目前日預算（元）
  cost7: number; conv7: number; value7: number   // 近 7 天
  cpa_over_days: number           // 連續幾天 CPA > 目標 × auto_pause_cpa_ratio
  zero_conv_days: number          // 連續零轉換天數
  lost_is_budget7: number         // 近 7 天因預算流失的曝光占比（0～1）
  last_change_day?: string        // 上次調整日
  month_cost: number              // 本月累計花費（全帳戶）
}
export interface BudgetCfg {
  mode: 'suggest' | 'auto' | 'off'; step_pct: number; daily_min: number; daily_max: number
  min_conv: number; cooldown_days: number; pause_cpa_ratio: number; boost_roas: number
  target_cpa: number; target_roas: number; monthly_cap: number; daily_cap: number; today: string
}
export interface BudgetChange { campaign_id: string; campaign: string; before: number; after: number; reason: string; kind: 'boost' | 'cut' | 'pause_suggest' | 'hold' }

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
const round10 = (n: number) => Math.round(n / 10) * 10

export function planBudgetChanges(rows: CampaignWindow[], cfg: BudgetCfg): BudgetChange[] {
  const out: BudgetChange[] = []
  const daysLeft = Math.max(1, new Date(new Date(cfg.today).getFullYear(), new Date(cfg.today).getMonth() + 1, 0).getDate() - new Date(cfg.today).getDate())
  for (const r of rows) {
    if (r.status !== 'ENABLED') continue
    const cpa = r.conv7 > 0 ? r.cost7 / r.conv7 : Infinity
    const roas = r.cost7 > 0 ? r.value7 / r.cost7 : 0
    const cooled = !r.last_change_day || daysBetween(r.last_change_day, cfg.today) >= cfg.cooldown_days
    const monthRoom = cfg.monthly_cap - r.month_cost          // 本月剩餘可花
    const maxByMonth = Math.max(0, monthRoom / daysLeft)      // 平均到剩餘天數
    const cap = Math.min(cfg.daily_max, cfg.daily_cap, maxByMonth || cfg.daily_max)
    let after = r.daily_budget, reason = '', kind: BudgetChange['kind'] = 'hold'

    if (r.zero_conv_days >= 5 && r.cost7 > 0) {
      kind = 'pause_suggest'; reason = `連續 ${r.zero_conv_days} 天零轉換，近 7 天花 ${Math.round(r.cost7)} 元 → 建議暫停（不自動暫停）`
    } else if (r.cpa_over_days >= 3 && cooled) {
      after = Math.max(cfg.daily_min, round10(r.daily_budget * (1 - cfg.step_pct / 100)))
      kind = 'cut'; reason = `連續 ${r.cpa_over_days} 天 CPA ${Math.round(cpa)} 元 > 目標 ${cfg.target_cpa} × ${cfg.pause_cpa_ratio} → 降 ${cfg.step_pct}%`
    } else if (r.conv7 >= cfg.min_conv && roas >= cfg.target_roas * cfg.boost_roas && r.lost_is_budget7 >= 0.2 && cooled) {
      after = Math.min(cap, round10(r.daily_budget * (1 + cfg.step_pct / 100)))
      kind = after > r.daily_budget ? 'boost' : 'hold'
      reason = after > r.daily_budget
        ? `近 7 天 ROAS ${roas.toFixed(1)} 倍 ≥ 目標 × ${cfg.boost_roas}、預算流失曝光 ${(r.lost_is_budget7 * 100).toFixed(0)}% → 加 ${cfg.step_pct}%`
        : `成效好但已到上限（日上限 ${cfg.daily_max}／月剩餘 ${Math.round(monthRoom)} 元）`
    } else if (r.month_cost >= cfg.monthly_cap) {
      kind = 'cut'; after = cfg.daily_min; reason = `本月花費 ${Math.round(r.month_cost)} 已達月上限 ${cfg.monthly_cap} → 降到下限`
    }
    if (kind !== 'hold' || reason) out.push({ campaign_id: r.campaign_id, campaign: r.campaign, before: r.daily_budget, after, reason, kind })
  }
  return out
}

/** 套用：依 mode 決定只建議或直接呼叫 Google Ads API（mutate 需要 Basic 以上存取等級） */
export async function applyBudgetChanges(env: any, changes: BudgetChange[], cfg: BudgetCfg, mutate: (campaignId: string, amount: number) => Promise<void>) {
  for (const c of changes) {
    const applyNow = cfg.mode === 'auto' && (c.kind === 'boost' || c.kind === 'cut') && c.after !== c.before
    if (applyNow) await mutate(c.campaign_id, c.after)
    await env.DB.prepare('insert into budget_log (day, campaign_id, before_amount, after_amount, reason, mode, applied, created_at) values (?,?,?,?,?,?,?,datetime("now"))')
      .bind(cfg.today, c.campaign_id, c.before, c.after, c.reason, cfg.mode, applyNow ? 1 : 0).run()
    if (!applyNow && cfg.mode !== 'off') {
      await env.DB.prepare('insert into alerts (day, level, kind, title, body, created_at) values (?,?,?,?,?,datetime("now"))')
        .bind(cfg.today, c.kind === 'pause_suggest' ? 'red' : 'amber', 'budget', `${c.campaign}：${c.kind === 'boost' ? '建議加預算' : c.kind === 'cut' ? '建議降預算' : '建議暫停'}`, `${c.before} → ${c.after} 元／日。${c.reason}`).run()
    }
  }
}

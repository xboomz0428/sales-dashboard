// 行事曆自我檢查：關鍵日期對照已知公告；失敗會以非 0 結束
import { buildYearCalendar, upcomingEvents, eventStage, lunarToISO } from '../shared/calendar.js'
const ev = buildYearCalendar(2026)
const find = (n, y = ev) => y.find(e => e.name.startsWith(n))
const checks = [
  ['媽祖聖誕 2026 = 5/9',            find('媽祖聖誕')?.date === '2026-05-09'],
  ['虎爺聖誕 2026 = 7/19',           find('虎爺聖誕')?.date === '2026-07-19'],
  ['媽祖飛昇 2026 = 10/18',          find('媽祖飛昇')?.date === '2026-10-18'],
  ['白沙屯 2026 = 4/12～4/20 已公告', find('白沙屯')?.date === '2026-04-12' && find('白沙屯')?.end_date === '2026-04-20' && !find('白沙屯')?.estimated],
  ['大甲 2026 = 4/17～4/26 已公告',   find('大甲')?.date === '2026-04-17' && find('大甲')?.end_date === '2026-04-26'],
  ['鹽水蜂炮 2026 = 3/2～3/3',        find('鹽水蜂炮')?.date === '2026-03-02' && find('鹽水蜂炮')?.end_date === '2026-03-03'],
  ['北港迎媽祖 2026 = 5/5～5/9',      find('北港')?.date === '2026-05-05' && find('北港')?.end_date === '2026-05-09'],
  ['東港迎王 2026 不排、2027 排',     !find('東港') && !!find('東港', buildYearCalendar(2027))],
  ['24 節氣齊全',                     ev.filter(e => e.kind === 'solar_term').length === 24],
  ['關鬼門 = 農曆 7 月最後一天',      find('關鬼門')?.date === lunarToISO(2026, 7, 'last')],
  ['宗教盛事提前 60 天',              find('白沙屯')?.lead_days === 60 && find('虎爺聖誕')?.lead_days === 60],
  ['2026-10-06 看得到 60 天內的媽祖飛昇、立冬、雙 11', (() => { const u = upcomingEvents(ev, '2026-10-06'); return ['媽祖飛昇', '立冬', '雙 11'].every(n => u.some(e => e.name.startsWith(n))) })()],
  ['階段：10/06 看媽祖飛昇(10/18)=準備、艋舺青山王祭=醞釀', eventStage(find('媽祖飛昇'), '2026-10-06') === 'prepare' && eventStage(find('艋舺青山王祭'), '2026-10-06') === 'brewing'],
  ['設定覆寫白沙屯 2027', (() => { const y = buildYearCalendar(2027, k => k === 'calendar.religious_overrides' ? ['白沙屯媽祖進香｜2027-04-02｜2027-04-10'] : undefined); const b = find('白沙屯', y); return b?.date === '2027-04-02' && !b.estimated })()],
]
let bad = 0
for (const [name, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) bad++ }
console.log(`${checks.length - bad}/${checks.length} 通過`)
process.exit(bad ? 1 : 0)

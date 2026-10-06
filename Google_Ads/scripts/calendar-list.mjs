// 產生全年行銷行事曆清單（Markdown）：node scripts/calendar-list.mjs 2026 > docs/行事曆_全年清單_2026.md
import { buildYearCalendar, yearList, KINDS, TIERS } from '../shared/calendar.js'
const year = Number(process.argv[2]) || new Date().getFullYear()
const events = buildYearCalendar(year)
const weekday = d => '日一二三四五六'[new Date(d + 'T00:00:00').getDay()]
const fmt = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${weekday(d)}）`
const lines = []
lines.push(`# 好漢草 ${year} 行銷行事曆 全年清單`, '',
  `由 \`shared/calendar.js\` 產生（\`npm run calendar:list -- ${year}\`）。農曆日期已換算成國曆；「預估」表示由農曆推算、待廟方公告（白沙屯、大甲每年元宵擲筊後公告，公告後填進設定「宗教盛事公告日期」即可覆寫）。`, '',
  `提前天數（可在設定改）：${Object.values(TIERS).map(t => `${t.label} ${t.defLead} 天`).join('、')}。`, '',
  `| 類別 | 顏色意義 |`, `|---|---|`, ...Object.values(KINDS).map(k => `| ${k.label} | ${k.color} |`), '')
for (const g of yearList(events, year)) {
  lines.push(`## ${year} 年 ${g.label}`, '', '| 日期 | 類別 | 檔期 | 農曆 | 提前 | 主推品類 | 說明 |', '|---|---|---|---|---|---|---|')
  for (const e of g.items) {
    const range = e.end_date !== e.date ? `${fmt(e.date)}～${fmt(e.end_date)}` : fmt(e.date)
    const kind = KINDS[e.kind]?.label || e.kind
    const lead = e.lead_days ? `${e.lead_days} 天` : '只顯示'
    const name = e.estimated ? `${e.name}（預估）` : e.name
    lines.push(`| ${range} | ${kind} | ${name}${e.place ? `・${e.place}` : ''} | ${e.lunar || ''} | ${lead} | ${e.product_tags.join('、')} | ${e.note || ''} |`)
  }
  lines.push('')
}
process.stdout.write(lines.join('\n'))

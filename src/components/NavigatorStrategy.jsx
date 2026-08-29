import { useMemo } from 'react'

/**
 * 領航員 Phase 2：五管執行戰略 × 商業模式圖
 * - StrategySection：產銷人發財＋海外擴張六張戰略卡。年度目標依領航員階梯自動換算，
 *   可由數據計算的現況（新品數/通路數/集中度/好漢草占比）即時顯示。
 * - BmcSection：商業模式九宮格——現行模式＋🆕通往願景的新模式，附延伸產品路線圖。
 * 內容為內部企劃參考；任何對外文案（品名/功效/文案）仍須通過藥事法/食安法合規審查。
 */
const fmtW = v => {
  if (v == null) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 億'
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + ' 萬'
  return Math.round(v).toLocaleString()
}

// ─── 五管戰略 ────────────────────────────────────────────────────────────────
export function StrategySection({ model, config, allRows }) {
  const stats = useMemo(() => {
    if (!allRows?.length || !model) return null
    const cy = model.currentYear
    const py = String(parseInt(cy) - 1)
    const prodFirstYear = {}, chThis = new Set(), chPrev = new Set()
    let newProdRev = 0, cyTotal = 0
    const chRev = {}
    for (const r of allRows) {
      if (r.product && (!prodFirstYear[r.product] || r.year < prodFirstYear[r.product])) prodFirstYear[r.product] = r.year
    }
    for (const r of allRows) {
      if (r.year === cy) {
        cyTotal += r.subtotal || 0
        const ch = r.channelType || '其他'
        chThis.add(ch)
        chRev[ch] = (chRev[ch] || 0) + (r.subtotal || 0)
        if (r.product && prodFirstYear[r.product] === cy) newProdRev += r.subtotal || 0
      } else if (r.year === py) {
        chPrev.add(r.channelType || '其他')
      }
    }
    const newProducts = Object.values(prodFirstYear).filter(y => y === cy).length
    const newChannels = [...chThis].filter(c => !chPrev.has(c))
    const topCh = Object.entries(chRev).sort((a, b) => b[1] - a[1])[0]
    return {
      newProducts,
      newProdShare: cyTotal > 0 ? newProdRev / cyTotal * 100 : 0,
      channelCount: chThis.size,
      newChannels,
      topChannel: topCh ? { name: topCh[0], share: cyTotal > 0 ? topCh[1] / cyTotal * 100 : 0 } : null,
    }
  }, [allRows, model])

  if (!model || !stats) return null
  const cur = model.rows.find(r => String(r.year) === model.currentYear)
  if (!cur) return null
  const headcount = config.headcount || 0

  const CARDS = [
    {
      icon: '🏷️', name: '銷 · 產品銷售目標', color: 'border-blue-200 dark:border-blue-800',
      goals: [
        { label: '公司營收', target: fmtW(cur.tC), now: `預測 ${fmtW(model.fcC?.projected)}`, ok: cur.rC != null ? cur.rC >= 1 : null },
        { label: '好漢草營收', target: fmtW(cur.tH), now: `預測 ${fmtW(model.fcH?.projected)}`, ok: cur.rH != null ? cur.rH >= 1 : null },
      ],
      tactics: [
        '旺季引擎：8 月＋中元檔（歷史日均 +40%）提前 45 天備貨與投放，目標旺季月營收 ≥ 平月 1.6 倍',
        '主力深耕：momo 寄倉與實體經銷（今年 +85%）擴大陳列；網路團購（−61%）檢討停損或換檔期',
        '客單提升：艾草包×足浴袋組合禮盒、彌月/年節檔期套組',
      ],
    },
    {
      icon: '🧪', name: '發 · 新產品目標', color: 'border-emerald-200 dark:border-emerald-800',
      goals: [
        { label: '年推新品', target: '≥ 3 支', now: `今年 ${stats.newProducts} 支`, ok: stats.newProducts >= 3 },
        { label: '新品營收占比', target: '≥ 10%', now: `${stats.newProdShare.toFixed(1)}%`, ok: stats.newProdShare >= 10 },
      ],
      tactics: [
        '漢方飲品線啟動（願景核心）：冷泡漢方茶包→RTD 即飲青草茶/氣泡飲，先小量代工打樣＋90 天試賣',
        '足浴延伸：足浴禮盒（送禮規格）、沐浴/香氛線，沿用既有客群驗證',
        '每支新品設 90 天驗收：銷量/回購/毛利三關，不過即停',
      ],
    },
    {
      icon: '🏪', name: '銷 · 通路目標', color: 'border-amber-200 dark:border-amber-800',
      goals: [
        { label: '活躍通路類型', target: `≥ ${Math.max(stats.channelCount, 8)} 類`, now: `${stats.channelCount} 類${stats.newChannels.length ? `（新增 ${stats.newChannels.join('、')}）` : ''}`, ok: stats.channelCount >= 8 },
        { label: '最大通路集中度', target: '< 40%', now: stats.topChannel ? `${stats.topChannel.name} ${stats.topChannel.share.toFixed(0)}%` : '—', ok: stats.topChannel ? stats.topChannel.share < 40 : null },
      ],
      tactics: [
        '年內新開 2 類通路：連鎖藥局/藥妝（漢方場景）、選物店與文創通路（文化財）',
        '飲品上市後的必爭之地：便利商店/超市——先以茶包進駕超市養身區練兵',
        '通路真毛利管理：接入平台抽成與廣告費後，砍掉負毛利檔期',
      ],
    },
    {
      icon: '🌏', name: '銷 · 海外擴張目標', color: 'border-cyan-200 dark:border-cyan-800',
      goals: [
        { label: `${parseInt(model.currentYear) + 1} 試水`, target: '跨境電商上架', now: '未啟動', ok: null },
        { label: `${parseInt(model.currentYear) + 3} 目標`, target: '海外占營收 5%', now: '0%', ok: null },
      ],
      tactics: [
        '從華人市場切入：蝦皮星馬、北美華人電商（亞米/Weee）——艾草淨身/平安文化財有天然需求',
        '產品選型：輕量、耐儲運、免冷鏈（艾草包/茶包優先，飲品後期）',
        '先借船出海（跨境平台/代理商），驗證後再設海外經銷；同步佈局商標註冊',
      ],
    },
    {
      icon: '👥', name: '人 · 人力與人事', color: 'border-purple-200 dark:border-purple-800',
      goals: [
        { label: '人均營收', target: headcount > 0 ? fmtW(cur.tC / headcount) : '（請在編輯目標填入編制人數）', now: headcount > 0 ? `預測 ${fmtW((model.fcC?.projected || 0) / headcount)}` : '—', ok: headcount > 0 ? (model.fcC?.projected || 0) / headcount >= cur.tC / headcount : null },
        { label: '業務目標歸屬', target: '每位業務掛年度目標', now: '待建立', ok: null },
      ],
      tactics: [
        '把年度目標拆到 業務×客戶 歸屬（系統 bonus_plans 骨架已在），獎金與達成率連動',
        '35% 成長的用人原則：先外包/兼職試（設計、投放、客服），月營收站穩再轉正',
        '旺季（7~9 月）前一個月備妥臨時倉儲/出貨人力',
      ],
    },
    {
      icon: '💰', name: '財 · 財務分析', color: 'border-rose-200 dark:border-rose-800',
      goals: [
        { label: '毛利率', target: '≥ 45%', now: '見「通路毛利」分頁', ok: null },
        { label: '行銷費用率', target: '< 15% 營收', now: '待接入廣告費資料', ok: null },
      ],
      tactics: [
        '每月固定記錄：平台抽成＋廣告費＋人事＋倉儲（月費用頁），季度看真實損益',
        '現金規則：旺季備貨佔用現金，備貨上限＝上一旺季實銷 × 1.3；飲品線注意效期存貨',
        '好漢草毛利高於代理品——占比每 +10%，公司整體毛利率自然上升，轉型本身就是財務戰略',
      ],
    },
  ]

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">⚙️ {model.currentYear} 年五管執行戰略（產銷人發財）</h3>
        <p className="text-xs text-gray-400">目標隨十年階梯逐年自動換算 · 每年 12 月依達成狀況檢討下修/上修</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {CARDS.map(c => (
          <div key={c.name} className={`bg-white dark:bg-gray-800 rounded-2xl border-2 ${c.color} shadow-sm p-4 flex flex-col`}>
            <p className="text-sm font-black text-gray-800 dark:text-gray-100 mb-2">{c.icon} {c.name}</p>
            <div className="space-y-1 mb-3">
              {c.goals.map(g => (
                <div key={g.label} className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{g.label}</span>
                  <span className="text-right">
                    <span className="font-bold text-gray-700 dark:text-gray-200">{g.target}</span>
                    <span className="text-gray-400 mx-1">｜</span>
                    <span className={g.ok == null ? 'text-gray-400' : g.ok ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>{g.now}{g.ok != null && (g.ok ? ' ✓' : ' ⚠')}</span>
                  </span>
                </div>
              ))}
            </div>
            <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {c.tactics.map((t, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-gray-300 dark:text-gray-600 flex-shrink-0">▸</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 商業模式圖 ──────────────────────────────────────────────────────────────
const BMC = [
  { key: 'kp', title: '🤝 關鍵夥伴', area: 'kp', now: ['品牌原廠（HUGGER/BAILEY/Milton…）', '電商平台', '製造協力'], next: ['飲料代工廠（OEM/ODM）', '宮廟與文創單位（聯名）', '海外代理商/跨境平台', '中醫師・營養師 KOL'] },
  { key: 'ka', title: '🔧 關鍵活動', area: 'ka', now: ['選品代理與通路經營', '數據驅動決策（本系統）'], next: ['漢方飲品研發與代工管理', '內容行銷（短影音節氣衛教）', '展會：食品展/文博會'] },
  { key: 'kr', title: '💎 關鍵資源', area: 'kr', now: ['品牌代理權', '好漢草配方與品牌', '8 年銷售數據資產'], next: ['飲品配方＋SGS 檢驗報告', '文化 IP 聯名資產', '海外商標'] },
  { key: 'vp', title: '⭐ 價值主張', area: 'vp', now: ['嚴選安心母嬰一站購足', '好漢草＝民俗×草本情感價值'], next: ['「年輕人的漢方」：好喝好用、不苦情', '節氣生活儀式感（訂閱）', '看得見文化根源的台灣漢方'] },
  { key: 'cr', title: '💬 顧客關係', area: 'cr', now: ['平台評價經營', '經銷業務 RFM 分級維護'], next: ['LINE 官方帳號會員經營', '節氣訂閱制（月月見面）', '社群共創（票選新口味）'] },
  { key: 'ch', title: '🚚 通路', area: 'ch', now: ['momo/蝦皮/PChome', '實體經銷・百貨櫃', '單檔團購'], next: ['便利商店/超市（飲品）', '連鎖藥局藥妝', '選物店/文創通路', '跨境電商（星馬/北美華人）'] },
  { key: 'cs', title: '👥 客戶區隔', area: 'cs', now: ['母嬰網購族', '實體婦嬰通路', '彌月 B2B'], next: ['20~35 歲輕養生族', '上班族女性（足浴紓壓）', '海外華人市場'] },
  { key: 'cost', title: '📉 成本結構', area: 'cost', now: ['進貨成本（毛利約 44~50%）', '平台抽成與廣告', '人事・倉儲物流'], next: ['研發打樣費', '飲品效期存貨風險', '行銷投放（新客群）'] },
  { key: 'rev', title: '📈 收益流', area: 'rev', now: ['商品銷售（代理＋自有）', '彌月禮盒'], next: ['飲品（即飲/沖泡）', '訂閱盒月費', '聯名授權金', '海外經銷收入'] },
]

const ROADMAP = [
  { stage: '1 年內', color: 'bg-emerald-500', items: ['冷泡漢方茶包（切入飲品、免冷鏈）', '足浴禮盒送禮規格', '節氣訂閱盒小量試賣', '跨境電商上架（星馬）'] },
  { stage: '3 年（里程碑 2029）', color: 'bg-amber-500', items: ['RTD 即飲青草茶/漢方氣泡飲進便利店', '沐浴・香氛延伸線', '宮廟/文創聯名系列', '海外占營收 5%'] },
  { stage: '5~10 年（2031→2036）', color: 'bg-rose-500', items: ['漢方飲品獨立品牌線', '海外經銷網（星馬→北美）', '文化 IP 授權事業', '＝台灣年輕漢方領頭羊'] },
]

export function BmcSection() {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">🗺️ 商業模式圖（現行 ＋ 🆕 通往願景）</h3>
        <p className="text-xs text-gray-400">灰字＝現行模式 · 綠字🆕＝為達成願景的新模式 · 每年 12 月檢視一次</p>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 overflow-x-auto">
        <div className="grid gap-2 min-w-[860px]" style={{
          gridTemplateColumns: 'repeat(10, minmax(0,1fr))',
          gridTemplateAreas: `"kp kp ka ka vp vp cr cr cs cs" "kp kp kr kr vp vp ch ch cs cs" "cost cost cost cost cost rev rev rev rev rev"`,
        }}>
          {BMC.map(b => (
            <div key={b.key} style={{ gridArea: b.area }} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-2.5">
              <p className="text-xs font-black text-gray-700 dark:text-gray-200 mb-1.5">{b.title}</p>
              <ul className="space-y-0.5 text-[11px] leading-snug">
                {b.now.map((x, i) => <li key={i} className="text-gray-500 dark:text-gray-400">{x}</li>)}
                {b.next.map((x, i) => <li key={'n' + i} className="text-emerald-700 dark:text-emerald-400 font-semibold">🆕 {x}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 延伸產品路線圖 */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROADMAP.map(r => (
          <div key={r.stage} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <p className="text-xs font-black text-white inline-block px-2.5 py-1 rounded-full mb-2" style={{}}>
              <span className={`${r.color} px-2.5 py-1 rounded-full`}>{r.stage}</span>
            </p>
            <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {r.items.map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-gray-300 dark:text-gray-600 flex-shrink-0">▸</span><span>{x}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">⚠️ 以上為內部企劃方向；任何對外的品名、功效與文案，仍須通過藥事法／食安法／化粧品法合規審查後才可使用。</p>
    </div>
  )
}

function fmtN(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

export function buildAIPayload({ summary, productData, brandData, channelData, channelTypeData, channelCustomerData, customerData, trendData, performanceData, filters, activeBrands, activeProducts, dataThrough, fullOverview }) {
  const topN = (arr, n = 10) => arr.slice(0, n)
  const botN = (arr, n = 5) => arr.slice(-n)

  // 排除近 3 年無銷售的品牌/產品：不再對已死品項做分析與建議
  const actB = activeBrands?.length ? new Set(activeBrands) : null
  const actP = activeProducts?.length ? new Set(activeProducts) : null
  if (actP) productData = productData.filter(d => actP.has(d.name))
  if (actB) brandData = brandData.filter(d => actB.has(d.name))
  if (actP && performanceData?.productPerf) {
    performanceData = { ...performanceData, productPerf: performanceData.productPerf.filter(d => actP.has(d.name)) }
  }

  const data = {
    分析期間: filters.dateRange
      ? `${filters.dateRange.start} ~ ${filters.dateRange.end}`
      : filters.years.length > 0 ? `${filters.years.join('、')} 年` : '全部期間',
    ...(dataThrough ? { 資料截止: `${dataThrough}（僅計完整月份，進行中的當月不納入）` } : {}),
    ...(actB || actP ? { 分析範圍說明: '近 3 年無銷售的品牌與產品已排除，不列入品項分析與建議' } : {}),
    ...(fullOverview ? {
      數據結構說明: '「全資料庫概覽」為完整歷史全貌（全部年份/月份/品牌/分類/通路，不受篩選影響）；其後欄位為目前篩選範圍的細項摘要。判讀長期趨勢與結構請用概覽，判讀當期細節請用篩選摘要。',
      全資料庫概覽: fullOverview,
    } : {}),
    總體指標: {
      總銷售金額: fmtN(summary.totalSales),
      總銷售數量: summary.totalQty.toLocaleString(),
      訂單筆數: summary.orderCount.toLocaleString(),
      不重複客戶數: summary.customerCount > 0 ? summary.customerCount : '無客戶資料',
      品項數: summary.productCount > 0 ? summary.productCount : '無產品資料',
      平均折扣率: summary.avgDiscount > 0 ? Math.round(summary.avgDiscount * 100) + '%' : '無折扣資料',
    },
    月度趨勢_含YoY_MoM: (() => {
      const sorted = [...trendData].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
      const map = Object.fromEntries(sorted.map(d => [d.yearMonth, d.subtotal]))
      return sorted.slice(-18).map((d, i, arr) => {
        const prev = arr[i - 1]
        const prevYM = `${parseInt(d.yearMonth.slice(0, 4)) - 1}-${d.yearMonth.slice(5)}`
        const mom = prev?.subtotal > 0 ? ((d.subtotal - prev.subtotal) / prev.subtotal * 100).toFixed(0) + '%' : '—'
        const yoy = map[prevYM] > 0 ? ((d.subtotal - map[prevYM]) / map[prevYM] * 100).toFixed(0) + '%' : '—'
        return { 月份: d.yearMonth, 銷售金額: fmtN(d.subtotal), MoM月增率: mom, YoY年增率: yoy }
      })
    })(),
    TOP產品: topN(productData).map((d, i) => ({
      排名: i + 1,
      產品: d.name,
      銷售金額: fmtN(d.subtotal),
      銷售數量: d.quantity,
      訂單數: d.count,
      平均客單: fmtN(d.avgOrderValue),
      客戶數: d.customerCount,
    })),
    待改善產品: botN(productData).map(d => ({
      產品: d.name,
      銷售金額: fmtN(d.subtotal),
      銷售數量: d.quantity,
    })),
    TOP品牌: topN(brandData, 8).map((d, i) => ({
      排名: i + 1,
      品牌: d.name,
      銷售金額: fmtN(d.subtotal),
      銷售數量: d.quantity,
      佔比: brandData[0]?.subtotal ? Math.round(d.subtotal / brandData.reduce((s, r) => s + r.subtotal, 0) * 100) + '%' : '—',
    })),
    通路表現: channelData.map((d, i) => ({
      排名: i + 1,
      通路: d.name,
      銷售金額: fmtN(d.subtotal),
      銷售數量: d.quantity,
      訂單數: d.count,
    })),
    通路客群統計: channelCustomerData.map(d => ({
      通路類型: d.name,
      不重複客戶數: d.customerCount,
      涉及品牌數: d.brandCount,
      涉及品項數: d.productCount,
      銷售金額: fmtN(d.subtotal),
      平均客單: d.customerCount > 0 ? fmtN(d.subtotal / d.customerCount) : '—',
    })),
    TOP客戶: topN(customerData, 8).map((d, i) => ({
      排名: i + 1,
      客戶: d.name,
      銷售金額: fmtN(d.subtotal),
      訂單數: d.count,
      平均客單: fmtN(d.avgOrderValue),
      購買通路: d.channelTypes.join('、') || '—',
      購買品牌: d.brands.slice(0, 3).join('、') || '—',
    })),
    績效矩陣: {
      明星產品: performanceData.productPerf.filter(d => d.subtotal >= performanceData.productMedian.subtotal && d.quantity >= performanceData.productMedian.quantity).slice(0, 5).map(d => d.name),
      待檢討產品: performanceData.productPerf.filter(d => d.subtotal < performanceData.productMedian.subtotal && d.quantity < performanceData.productMedian.quantity).slice(0, 5).map(d => d.name),
    },
  }
  return JSON.stringify(data, null, 2)
}

export function buildFilterContext(filters) {
  if (!filters) return ''
  const parts = []
  if (filters.dateRange) parts.push(`日期範圍：${filters.dateRange.start} ～ ${filters.dateRange.end}`)
  else if (filters.years?.length) parts.push(`年份：${filters.years.join('、')} 年`)
  if (filters.months?.length) parts.push(`月份：${filters.months.map(m => m + '月').join('、')}`)
  if (filters.brands?.length) parts.push(`品牌：${filters.brands.join('、')}`)
  if (filters.channels?.length) parts.push(`通路：${filters.channels.join('、')}`)
  if (filters.channelTypes?.length) parts.push(`通路類型：${filters.channelTypes.join('、')}`)
  if (filters.customers?.length) parts.push(`客戶：${filters.customers.join('、')}`)
  if (filters.products?.length) parts.push(`商品：${filters.products.join('、')}`)
  if (!parts.length) return ''
  return `⚠️ **重要：本次分析為篩選後的子集資料，並非全部銷售資料。**\n篩選條件：${parts.join('；')}\n請勿宣稱「整體市場」或「所有資料」，應以「在此篩選範圍內」為前提進行分析。\n\n`
}

// 公司背景：讓 AI 的建議貼合實況，而非通用電商建議
const COMPANY_CONTEXT = `## 受分析公司背景（請據此給出貼合實況的建議，而非通用電商建議）
- 公司：威斯邁國際有限公司，台灣母嬰／婦幼用品的多品牌經營與代理經銷商。
- 自有／代理品牌：BAILEY（母乳儲存袋等耗材）、HUGGER（揹巾/背包/水壺）、miYim（有機棉玩具）、好漢草（草本足浴/淨身包）等。
- 通路結構同時橫跨三種型態：
  1) 線上平台終端（momo、蝦皮、PChome、酷澎、Yahoo…）：走量、演算法曝光、價格敏感。
  2) 自營 D2C（品牌官網、單檔團購）：毛利高、掌握第一方客戶資料。
  3) 實體與經銷（婦幼連鎖、百貨專櫃、地區婦嬰店、批發經銷）：關係經營、鋪貨與帳期。
- 產業趨勢：台灣少子化使新生兒數逐年下滑（總市場萎縮），但「精緻育兒／單胎重壓／送禮彌月」使客單價與品質需求上升；耗材類（母乳袋、足浴包）具「回購」特性。
- 合規紅線（務必遵守）：好漢草等草本／保健／清潔類，以及母嬰安全訴求，任何對外可用的文案或功效建議都必須符合台灣《藥事法》《食品安全衛生管理法》《化粧品衛生安全管理法》——嚴禁療效／醫療／誇大字眼；不確定的字詞請以 ⚠️「」標註並註明「需人工合規審查」（純文字標註，**嚴禁輸出任何 HTML 標籤**如 <span>）。`

export function buildPrompt(dataJson, analysisType, filters) {
  const typePrompts = {
    comprehensive: `請針對以下所有面向進行完整分析，每個章節都要有具體數字支撐：
1. **整體銷售績效評估**（含 YoY/MoM 趨勢、成長或衰退幅度與可能原因）
2. **品牌分析**（各品牌優劣勢、品牌集中度風險：最大品牌佔比幾成？若下滑影響幾成業績？）
3. **產品分析**（BCG 明星/金牛/問號/落水狗；耗材回購型 vs 一次性商品的結構）
4. **通路分析**（三型態通路：線上平台／D2C官網／實體經銷各自表現、客群、毛利含義）
5. **各通路新產品開發建議**（考量該通路客單價與客群，對應現有品牌可延伸什麼）
6. **每年25%成長策略**（短期1-3月、中期3-6月、長期6-12月，各附可衡量 KPI）
7. **優先行動建議 Top 10**（可立即執行，依「影響 × 可行性」排序，每項標負責角色與時程）`,

    channel: `請以「通路經濟學」深入分析各通路的特性與機會，區分線上平台／D2C官網／實體經銷三型態：
1. 各通路表現對比（金額、數量、訂單數、平均客單、客戶數）與**毛利含義**（線上走量但被平台抽成/廣告吃毛利；D2C 毛利高；經銷有帳期與鋪貨成本）
2. 推估各通路客群年齡層、消費習慣、偏好品項（以客單價與品項佐證）
3. 各通路成長潛力與風險（平台演算法/抽成變動、單一通路依賴度）
4. 通路優化：資源分配、**價格帶區隔以避免通路衝突**、商品配置（哪些品項該獨家給哪個通路）
5. 新通路開拓建議（評估：進入成本、毛利結構、品牌契合度、既有客群重疊）`,

    channelDev: `你是一個整合多位通路與業務大師思想的「新通路開發顧問團」：Philip Kotler（通路設計與行銷管理）、Neil Rackham（SPIN 顧問式銷售）、Matthew Dixon（挑戰者銷售）、Geoffrey Moore（跨越鴻溝：灘頭堡策略）、金偉燦（藍海：到非顧客所在的地方開通路）。每個論斷都必須引用上方數據，嚴禁空泛。

⚠️ **本分析的唯一目的是「開發目前完全沒出現在銷售資料中的新通路」**。嚴禁以下偷懶答案：
- 把既有通路的優化（調價、加廣告、多鋪貨）當成通路開發——那是通路維護
- 「加強經營 momo／蝦皮／既有經銷商」——不是本題
既有通路結構用 1 小段快速盤點即可，其餘篇幅全部留給新通路。

### 1. 既有通路一段式盤點
線上平台／D2C／實體經銷的佔比與健康度，一段講完，作為新通路的對照基準。

### 2. 客群足跡推演（Kotler：通路跟著顧客走）
從數據推演我們的三種買家「還會出現在哪裡」：新手媽媽、送禮者（彌月/節慶）、民俗信仰族群（好漢草）——列出 8~10 個他們的生活接觸點（線上社群、實體場域、業態），這是候選通路池。

### 3. 新通路提案（至少 6 個，全部是數據中不存在的通路，表格）
| 新通路 | 業態(B2B/B2C/跨境/訂閱) | 為何適合（客群足跡＋品類契合，引用數據） | 進入門檻與成本 | 首談對象與名單來源 | 適配品項 | 預估毛利結構 |
母嬰與民俗品類可評估但不限於：月子中心/產後護理之家、連鎖藥局、婦產科/小兒科診所衛教通路、企業福委彌月方案、幼兒園/親子館團購、宮廟文創與遶境活動合作（好漢草）、選物店/文創平台、跨境華人市場（星馬港澳）、訂閱制（耗材定期購）、直播團媽體系。

### 4. 前 3 名深挖：業務開發作戰計畫（大師方法落地）
每個入選通路提供：
- **灘頭堡（Moore）**：先攻哪一個具體對象（點名業態＋區域，例：雙北月子中心前 10 大）
- **SPIN 提問（Rackham）**：對該通路採購的 情境S／問題P／影響I／需求回報N 四類開場提問各 1 句
- **挑戰者觀點（Dixon）**：我們能「教」對方什麼洞察——用我們的銷售數據當談判素材（例：艾草包在零售通路的實際轉速與客單）
- 合作模式與條件：寄售/買斷/分潤、帳期、起訂量的建議值
- 90 天里程碑：第一單目標金額、續做/收手門檻
### 5. 通路衝突預防
新通路對既有通路的價格帶衝擊與治理原則（獨家品項/差異包裝/建議售價帶）。

⚠️ 合規：涉及草本／母嬰的通路提案與話術，一律附藥事法/食安法提醒，嚴禁療效訴求。`,

    product: `你是一個整合多位產品大師思想的「新品開發顧問團」：Clayton Christensen（JTBD／破壞式創新）、金偉燦＆莫伯尼（藍海策略：ERRC、非顧客三層）、Tony Ulwick（成果導向創新 ODI）、Peter Drucker（創新七大來源）、Eric Ries（精實創業 MVP 驗證）、Al Ries＆Jack Trout（定位論／開創新品類）、Geoffrey Moore（跨越鴻溝）。每個論斷都必須引用上方數據，嚴禁空泛。

⚠️ **本分析的唯一目的是「開發目前不存在於銷售資料中的新產品／新品類」**。嚴禁以下偷懶答案：
- 把既有商品做成禮盒／組合／加價購當成新品（那是促銷企劃，不是產品開發）
- 只建議補顏色、補規格、補入數（那是 SKU 管理）
- 「加強行銷現有商品」（那不是本題）
每一個提案都必須是數據中**沒有出現過**的新品項或新品類。

### 1. 能力盤點——我們憑什麼做新品（1 段完成）
從數據歸納可遷移資產：既有客群是誰（母嬰/送禮/民俗信仰）、掌握哪些通路、累積哪些品類知識（草本配方/揹具織品/矽膠餐具代理）、品牌信任在哪。新品必須站在這些資產上。

### 2. 需求缺口——大師視角交叉（每個視角至少 1 個發現）
- **JTBD（Christensen）**：現有客群在「同一段人生旅程」的前後還有哪些未完成任務？（例：買母乳袋的媽媽，6 個月後、2 年後需要什麼？買平安包的人，人生其他儀式時刻需要什麼？）
- **藍海非顧客三層（金偉燦）**：即將流失的邊緣顧客／拒絕購買者／從未考慮過我們的人，各是誰、為何不買、什麼新品能收服？
- **Drucker 意外的成功**：數據裡有沒有「小品項卻異常暢銷/高成長」的訊號？它暗示哪個新品類？（務必實際點名數據中的品項）
- **定位論（Ries&Trout）**：有沒有機會開創一個「我們可以當第一」的新品類，而不是在既有品類當第 N 名？

### 3. 新品提案（至少 5 個，全部是數據中不存在的品項，表格）
| 新品/新品類 | 目標客群與其 JTBD | 為什麼是我們（能力遷移依據，引用數據） | 定位一句話 | 預估價格帶 | MVP 驗證法（30 天內可執行） | 主要風險 |
價格帶請參考數據中相近品類的實際客單價推估。

### 4. 優先順序與 90 天驗證計畫
以「影響 × 可行性」選出前 3 名，各列 90 天精實驗證步驟（Ries）：最小可行版本是什麼、先賣給誰（點名數據中的通路或客群）、達標數字、不達標的停損決定。

⚠️ 合規：涉及草本／保健／母嬰安全的新品概念，一律附藥事法/食安法/化粧品法提醒，嚴禁療效訴求；不確定宣稱標註「需人工合規審查」。`,

    growth: `你是一個以「成長帳（Growth Accounting）」方法論為核心的成長顧問團：成長不是口號，是一筆一筆算出來的——**成長 = 留住的 + 擴大的 + 新增的 − 流失的**。請制定 25% 年度成長計畫。

⚠️ **禁止大話條款**：以下句型出現即視為不合格——「提升品牌知名度」「加強行銷力道」「優化客戶體驗」「深化會員經營」等任何**沒有基準數字、沒有金額目標、沒有驗收方式**的建議一律禁止。每一條建議必須同時具備：目前基準值（引用數據）→ 具體動作 → 金額/數字目標 → 負責角色 → 期限 → 驗收方式。

### 1. 目標數學（先把帳算清楚）
以「全資料庫概覽」近 12 個月營收為基準：25% 成長 = 需新增 NT$ X／年，換算每月 +Y、每天 +Z。把 X 算出來寫死，後面所有引擎的目標加總必須 ≥ X 的 120%（預留失敗緩衝）。

### 2. 成長帳拆解（錢從哪裡漏、從哪裡來——全部用數據點名）
用全月度營收與品牌/客戶彙總，逐項點名：
- **流失中**：哪些客戶「歷史總額高但近12月大幅下滑」？各流失多少 NT$？（挽回它就是最便宜的成長）
- **衰退中**：哪些品牌/分類近12月 vs 歷史趨勢在掉？各掉多少？止血值多少 NT$？
- **成長中**：哪些品牌/分類/通路在漲？加碼的天花板估多少？
- **季節性**：從全月度營收指出旺季月份與歷史峰值——今年旺季若打平歷史峰值，值多少 NT$？

### 3. 五個成長引擎——缺口分配表
| 引擎 | 12個月目標金額 | 依據（引用數據） | 主要動作 | 負責角色 |
五個引擎固定為：A 流失客戶挽回（點名對象）／B 既有客戶擴大（回購頻率×客單，耗材訂閱）／C 旺季衝刺（點名月份與目標峰值）／D 成長品項加碼（點名品項與通路）／E 新通路或新品（金額目標即可，細節由通路/產品開發分析承接）。五個金額加總 ≥ 缺口 X 的 120%。

### 4. 每個引擎一張行動卡
| 引擎 | 基準值(數據) | 30天KPI | 60天KPI | 90天KPI | 每週檢核指標 | 停損/調整條件 |
KPI 全部要是數字（金額、單數、回購率、拜訪家數），不准寫「持續優化」。

### 5. 前 30 天週計畫（今天就能開始）
| 週次 | 具體動作（誰、做什麼、產出什麼） |
| W1 | 例：匯出回購週期預警的逾期客戶清單，排定前 10 家拜訪 |
| W2~W4 | … |
動作要具體到「可以直接寫進行事曆」的程度。

### 6. 用這套儀表板追蹤（對應到系統現有功能）
指定每週要看的頁面與數字：老闆視角同比開關、對比分析的區間累計欄、客戶健康的回購預警、品牌記分卡——每個引擎對應一個追蹤位置。

### 7. 前 3 大風險（真實的，不要湊數）
每個風險附：觸發訊號（看哪個數字知道發生了）＋ 應對動作。

⚠️ 合規：涉及好漢草/草本的成長動作，文案與宣稱禁療效字眼（藥事法/食安法），需標註人工合規審查。`,
  }

  const filterCtx = buildFilterContext(filters)
  return `${filterCtx}${COMPANY_CONTEXT}

你是一個由五位頂尖專家組成的商業顧問團隊，請整合以下視角進行分析，**必須用繁體中文**回答。所有建議必須有數據支撐，嚴禁空泛通用建議：

## 專家團隊視角
- 🏢 **企業管理專家**：策略規劃、資源配置、組織效能、KPI管理
- 📊 **市場分析專家**：市場定位、消費者洞察（含台灣少子化/精緻育兒趨勢）、通路策略
- 🎯 **產品策略顧問**（Christensen JTBD × 藍海 ERRC/非顧客 × Ulwick ODI × Drucker 創新來源 × Ries&Trout 定位 × 精實 MVP）：新品類開發、BCG 診斷、Kano、Ansoff、耗材訂閱回購與禮盒/彌月機會
- 🏪 **通路發展顧問**（Kotler 通路設計 × Rackham SPIN × Dixon 挑戰者銷售 × Moore 灘頭堡）：新通路開發、經銷維護與分級(RFM)、通路衝突與價格帶治理、平台演算法曝光
- 🔬 **研發評估**：產品創新可行性、差異化點、成本效益、時程評估

## 銷售數據摘要
\`\`\`json
${dataJson}
\`\`\`

## 分析任務
${typePrompts[analysisType] || typePrompts.comprehensive}

**可落地要求（每個建議都要能執行）**：
- 每個建議一律用這個結構表達：**現況數據佐證 → 具體動作 → 負責角色 → 時程 → 可衡量目標(KPI) → 預期效果/風險**。缺任何一項視為不合格。
- 目標要用數字（例如「該通路客單價 X→Y」「回購率提升 N 個百分點」），不要「提升銷量」這種空話。
- 涉及好漢草／草本／保健／母嬰安全的產品或文案建議，必須附一句合規提醒，禁療效字眼；不確定字詞以 ⚠️「」標註並註明「需人工合規審查」。
- 只輸出 Markdown 純文字，**嚴禁任何 HTML 標籤**（如 <span style=...>、<font>、<br>）。

**格式要求**：
- 使用 Markdown 格式，每個章節有清楚的標題（##、###）
- 重要數字要明確列出
- 每個建議都要說明「為什麼」（依據是什麼）
- 在每個主要分析章節標示哪位專家的視角（例如：🏢 企業管理觀點）
- **凡是比較、排行、矩陣、數字對照等表格型資料，一律使用標準 Markdown 表格語法**（第一行為標題行，第二行為分隔行 | --- |，之後為資料行）。**嚴禁使用 ASCII 符號（+-=）手繪表格邊框**
- **嚴禁使用 --- 水平分隔線**，章節之間直接用標題（##、###）分隔即可`
}

// ─── AI 問答：附件 → Gemini parts ────────────────────────────────────────────
// attachment: { name, kind: 'image'|'pdf'|'text', mime?, dataB64?, text? }
// 圖片/PDF 用 inline_data 傳給 Gemini；表格/文字檔已在前端轉成文字，併入 text part
function chatParts(text, attachments = []) {
  const parts = []
  let merged = text || ''
  for (const a of attachments) {
    if (a.kind === 'text') {
      merged += `\n\n【附件「${a.name}」內容】\n${a.text}`
    } else if (a.dataB64) {
      parts.push({ inline_data: { mime_type: a.mime, data: a.dataB64 } })
    }
  }
  parts.push({ text: merged || '（請參考附件）' })
  return parts
}

// ─── AI 問答：把「數據上下文＋歷史對話＋新問題」組成 Gemini messages ───────────
// chatHistory: [{ role: 'user'|'model', text, attachments? }]
export function buildChatMessages({ dataJson, filters, chatHistory = [], question, attachments = [], kbContext = '' }) {
  const filterCtx = buildFilterContext(filters)
  const system = `${filterCtx}${COMPANY_CONTEXT}

你是威斯邁國際的「銷售數據問答助手」。使用者會針對以下銷售數據提問，請遵守：
- **必須用繁體中文**、口語簡潔，直接回答問題本身，不要長篇報告
- 數據分兩層：「全資料庫概覽」是完整歷史全貌（全部年份/月份/品牌/分類/通路/TOP產品客戶）；其餘欄位是使用者目前篩選範圍的細項。問歷史、跨年、全品牌的問題用概覽答；問當期細節用篩選摘要答
- 每個論斷都引用數據中的實際數字；數據裡沒有的，明說「目前數據看不到」，嚴禁編造
- 適合條列時用「•」開頭的短行；表格才用 Markdown 表格；不要用 # 標題
- **只輸出純文字，嚴禁任何 HTML 標籤**（如 <span>、<br>、<font>）；要強調的字詞用「」或 ⚠️ 標註
- 涉及好漢草/草本/母嬰功效的文案或宣稱，附一句合規提醒（藥事法/食安法，禁療效字眼）
- 使用者追問時，延續前文脈絡回答
- 使用者可能附上圖片/PDF/表格檔作為參考資料：請先讀懂附件內容，再結合銷售數據回答；附件與數據矛盾時，兩者並列說明

## 銷售數據摘要
\`\`\`json
${dataJson}
\`\`\`${kbContext ? `

## 內部知識庫 FAQ（回答產品/品牌相關問題時，優先依這些官方答案，不要自行編造產品資訊）
${kbContext}` : ''}`

  const msgs = [
    { role: 'user',  parts: [{ text: system }] },
    { role: 'model', parts: [{ text: '了解，我已讀完銷售數據摘要，請直接提問。' }] },
  ]
  for (const m of chatHistory) {
    msgs.push({ role: m.role, parts: m.role === 'user' ? chatParts(m.text, m.attachments) : [{ text: m.text }] })
  }
  msgs.push({ role: 'user', parts: chatParts(question, attachments) })
  return msgs
}

/* messages: 多輪對話陣列 [{ role, parts }]；若只傳 prompt 則自動包裝 */
export async function streamAnalysis({ apiKey, model, prompt, messages, onChunk, onDone, onError }) {
  const CHUNK_TIMEOUT_MS = 30000  // 30 秒沒有新 chunk 視為卡住
  const abortCtrl = new AbortController()
  const modelId = model || 'gemini-2.5-flash'

  try {
    const contents = messages ?? [{ role: 'user', parts: [{ text: prompt }] }]
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
        }),
        signal: abortCtrl.signal,
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(err.error?.message || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let finishReason = null
    let gotAnyChunk = false

    // 逐 chunk 讀取，附帶 timeout 防止卡住
    const readWithTimeout = () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        abortCtrl.abort()
        reject(new Error('STREAM_TIMEOUT'))
      }, CHUNK_TIMEOUT_MS)
      reader.read().then(result => { clearTimeout(timer); resolve(result) }).catch(reject)
    })

    while (true) {
      let done, value
      try {
        ;({ done, value } = await readWithTimeout())
      } catch (e) {
        if (e.message === 'STREAM_TIMEOUT') {
          // 已有內容時視為提前截斷，回傳 TRUNCATED 讓上層決定是否繼續
          onDone?.(gotAnyChunk ? 'TRUNCATED' : null)
          return
        }
        throw e
      }
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) { onChunk(text); gotAnyChunk = true }
          const reason = parsed.candidates?.[0]?.finishReason
          if (reason) finishReason = reason
        } catch {}
      }
    }
    // finishReason 為 null（連線中斷未收到）視同 TRUNCATED
    onDone?.(finishReason ?? (gotAnyChunk ? 'TRUNCATED' : null))
  } catch (err) {
    if (err.name === 'AbortError') return   // timeout 已在上方處理
    onError?.(err.message)
  }
}

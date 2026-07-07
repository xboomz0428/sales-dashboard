function fmtN(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬'
  return Math.round(v).toLocaleString()
}

export function buildAIPayload({ summary, productData, brandData, channelData, channelTypeData, channelCustomerData, customerData, trendData, performanceData, filters }) {
  const topN = (arr, n = 10) => arr.slice(0, n)
  const botN = (arr, n = 5) => arr.slice(-n)

  const data = {
    分析期間: filters.dateRange
      ? `${filters.dateRange.start} ~ ${filters.dateRange.end}`
      : filters.years.length > 0 ? `${filters.years.join('、')} 年` : '全部期間',
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
- 合規紅線（務必遵守）：好漢草等草本／保健／清潔類，以及母嬰安全訴求，任何對外可用的文案或功效建議都必須符合台灣《藥事法》《食品安全衛生管理法》《化粧品衛生安全管理法》——嚴禁療效／醫療／誇大字眼；不確定的字詞請標紅並註明「需人工合規審查」。`

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

    channelDev: `你是一位專精「多通路鋪貨與經銷維護」的通路發展顧問。請依下列結構，**每一點都要引用上方數據**，並輸出可落地的動作：

### 1. 現有通路健檢（分三型態）
以表格列出：線上平台／D2C官網／實體經銷 各自的 銷售金額、佔比、客戶數、平均客單，並判定每個通路是「該加碼／該維持／該檢討」。

### 2. 客戶分層與維護（RFM 概念）
依 TOP 客戶的金額、訂單數、購買通路，將客戶概念性分為：
- **A 級（核心經銷/大戶）**：貢獻最高，需固定拜訪、優先供貨、專屬檔期。
- **B 級（成長中）**：有潛力，需誘因往上推（滿額獎勵、新品優先）。
- **C 級（零星/沉睡）**：低頻或流失，需喚醒或收斂資源。
每級給出：判定門檻、維護動作、聯繫頻率、對應負責角色。

### 3. 通路衝突與價格帶治理
指出目前可能的價格帶重疊風險（同品項在不同通路可能削價），提出「品項×通路」的獨家/差異化配置與建議售價帶原則。

### 4. 新通路開發評估矩陣
| 候選通路 | 為何適合（客群/品類契合） | 進入成本 | 毛利結構 | 與現有通路衝突風險 | 優先級 |
針對母嬰品類實務，具體點名可評估的通路類型（例：婦嬰連鎖、月子中心/產後護理之家、藥局通路、社群團購主、企業福委/彌月禮盒 B2B、跨境）。

### 5. 90 天通路行動計畫
| 時程 | 具體動作 | 負責角色 | 可衡量目標(KPI) | 預期效果 |
| 0-30 天 | | | | |
| 30-60 天 | | | | |
| 60-90 天 | | | | |`,

    product: `你是一個整合 Marty Cagan（產品發現）、Clayton Christensen（JTBD待完成任務）、Geoffrey Moore（市場區隔跨越鴻溝）三大框架的產品策略顧問團隊，請依以下結構深度分析，**每個建議都必須明確引用上方數據**，嚴禁空泛建議：

### 1. 產品組合 BCG 診斷
依銷售金額與成長趨勢，將現有產品/品牌分類為「明星、金牛、問號、落水狗」四象限，並列出每象限的具體品項名稱及建議行動。

### 2. 品牌 × 通路 × 推估客群交叉分析
- 逐一說明各品牌在各通路的表現強弱
- 依客單價、消費頻率、品類特性，**推估各通路的主力客群年齡層**（嬰兒潮/X世代/千禧/Z世代）
- 指出品牌集中度風險：哪個品牌依賴過高？若該品牌表現下滑，影響幾成業績？

### 3. 🎯 JTBD 需求缺口矩陣
針對前 5 大品牌/品類，分析三種任務層次：
- **功能性任務**（實際需達成的事）
- **情感性任務**（使用後的感受需求）
- **社會性任務**（在他人眼中的形象）
以表格呈現「目前滿足程度」與「缺口機會」，並結合台灣人口結構趨勢說明：
- 超高齡社會（2025年65歲以上佔20.8%）帶來的銀髮需求缺口
- 少子化（TFR 1.09）造成的市場萎縮或精緻化機會
- 寵物經濟、單身經濟、健康意識上升的具體應用

### 4. 新產品/服務具體建議（依通路分別提出）
針對每個主要通路，必須以表格輸出：
| 通路 | 推估主力年齡層 | 現有未被滿足的需求（Job） | 具體新產品/服務建議 | 對應現有品牌延伸 | 優先級 |
以**實際數據**作為每個建議的佐證（例如：「該通路客單價 X 元、消費頻率 Y 次，顯示...」）。

### 5. 產品路線圖（附 KPI）
| 時程 | 具體行動 | 數據依據 | 目標 KPI |
| 0-3 個月 | | | |
| 3-6 個月 | | | |
| 6-12 個月 | | | |`,

    growth: `請制定詳細的25%年度成長計畫：
1. 現況差距分析（要達到25%需要增加多少業績）
2. 短期快贏策略（1-3個月內可執行）
3. 中期結構調整（3-6個月）
4. 長期能力建設（6-12個月）
5. KPI設定建議（月度、季度追蹤指標）
6. 風險評估與應對措施`,
  }

  const filterCtx = buildFilterContext(filters)
  return `${filterCtx}${COMPANY_CONTEXT}

你是一個由五位頂尖專家組成的商業顧問團隊，請整合以下視角進行分析，**必須用繁體中文**回答。所有建議必須有數據支撐，嚴禁空泛通用建議：

## 專家團隊視角
- 🏢 **企業管理專家**：策略規劃、資源配置、組織效能、KPI管理
- 📊 **市場分析專家**：市場定位、消費者洞察（含台灣少子化/精緻育兒趨勢）、通路策略
- 🎯 **產品策略顧問**（Marty Cagan × Clayton Christensen × Geoffrey Moore）：產品組合 BCG 診斷、JTBD 需求缺口分析、Kano 模型（基本/期望/驚奇需求）、Ansoff 成長矩陣、耗材訂閱回購與禮盒/彌月機會
- 🏪 **通路發展顧問**：多通路鋪貨、經銷維護與分級(RFM)、通路衝突與價格帶治理、平台演算法曝光
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
- 涉及好漢草／草本／保健／母嬰安全的產品或文案建議，必須附一句合規提醒，禁療效字眼；不確定字詞標紅並註明「需人工合規審查」。

**格式要求**：
- 使用 Markdown 格式，每個章節有清楚的標題（##、###）
- 重要數字要明確列出
- 每個建議都要說明「為什麼」（依據是什麼）
- 在每個主要分析章節標示哪位專家的視角（例如：🏢 企業管理觀點）
- **凡是比較、排行、矩陣、數字對照等表格型資料，一律使用標準 Markdown 表格語法**（第一行為標題行，第二行為分隔行 | --- |，之後為資料行）。**嚴禁使用 ASCII 符號（+-=）手繪表格邊框**
- **嚴禁使用 --- 水平分隔線**，章節之間直接用標題（##、###）分隔即可`
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

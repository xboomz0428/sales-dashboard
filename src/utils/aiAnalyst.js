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

export function buildPrompt(dataJson, analysisType) {
  const typePrompts = {
    comprehensive: `請針對以下所有面向進行完整分析，每個章節都要有具體數字支撐：
1. **整體銷售績效評估**（含趨勢分析、成長幅度）
2. **品牌分析**（各品牌優劣勢、品牌集中度風險）
3. **產品分析**（明星商品、問題商品、產品組合健康度）
4. **通路分析**（各通路表現、通路客群特性、推估各通路主力客群年齡層與消費行為）
5. **特定通路新產品開發建議**（針對每個主要通路，建議可以開發什麼新商品，考量該通路的消費客單價與客群特性）
6. **每年25%成長策略**（短期1-3月、中期3-6月、長期6-12月的具體行動計畫）
7. **優先行動建議 Top 10**（可立即執行，依重要性排序）`,

    channel: `請深入分析各通路的特性與機會：
1. 各通路表現對比分析
2. 推估各通路客群年齡層、消費習慣、偏好品項
3. 各通路的成長潛力評估
4. 通路優化建議（資源分配、定價策略、商品配置）
5. 新通路開拓建議`,

    product: `請從PM與研發角度進行產品策略分析：
1. 現有產品組合健康度評估
2. 熱銷產品成功因素分析
3. 滯銷產品改善或汰換建議
4. 針對各通路的新產品開發機會（依通路客群消費特性）
5. 產品路線圖建議（3個月、6個月、12個月）`,

    growth: `請制定詳細的25%年度成長計畫：
1. 現況差距分析（要達到25%需要增加多少業績）
2. 短期快贏策略（1-3個月內可執行）
3. 中期結構調整（3-6個月）
4. 長期能力建設（6-12個月）
5. KPI設定建議（月度、季度追蹤指標）
6. 風險評估與應對措施`,
  }

  return `你是一個由四位頂尖專家組成的商業顧問團隊，請整合以下視角進行分析，**必須用繁體中文**回答：

## 專家團隊視角
- 🏢 **企業管理專家**：策略規劃、資源配置、組織效能、KPI管理
- 📊 **市場分析專家**：市場定位、競爭分析、消費者洞察、通路策略
- 🎯 **產品PM**：產品組合、需求分析、用戶體驗、產品路線圖
- 🔬 **研發評估**：產品創新可行性、技術差異化、成本效益評估

## 銷售數據摘要
\`\`\`json
${dataJson}
\`\`\`

## 分析任務
${typePrompts[analysisType] || typePrompts.comprehensive}

**格式要求**：
- 使用 Markdown 格式，每個章節有清楚的標題（##、###）
- 重要數字要明確列出
- 每個建議都要說明「為什麼」（依據是什麼）
- 結論要具體可執行，不要泛泛而談
- 在每個主要分析章節標示哪位專家的視角（例如：🏢 企業管理觀點）
- **凡是比較、排行、矩陣、數字對照等表格型資料，一律使用標準 Markdown 表格語法**（第一行為標題行，第二行為分隔行 | --- |，之後為資料行）。**嚴禁使用 ASCII 符號（+-=）手繪表格邊框**`
}

export async function streamAnalysis({ apiKey, prompt, onChunk, onDone, onError }) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(err.error?.message || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) onChunk(text)
        } catch {}
      }
    }
    onDone?.()
  } catch (err) {
    onError?.(err.message)
  }
}

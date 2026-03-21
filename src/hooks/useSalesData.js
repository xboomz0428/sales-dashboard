import { useMemo } from 'react'
import dayjs from 'dayjs'

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Apply non-date filters only
function applyNonDateFilters(rows, filters) {
  return rows.filter(row => {
    if (filters.channels.length > 0 && !filters.channels.includes(row.channel)) return false
    if (filters.channelTypes.length > 0 && !filters.channelTypes.includes(row.channelType)) return false
    if (filters.brands.length > 0 && !filters.brands.includes(row.brand)) return false
    if (filters.customers?.length > 0 && !filters.customers.includes(row.customer)) return false
    if (filters.products?.length > 0 && !filters.products.some(kw => row.product.includes(kw))) return false
    return true
  })
}

export function useSalesData(rows, filters) {
  // Main filtered data
  const filtered = useMemo(() => {
    if (!rows?.length) return []
    return rows.filter(row => {
      if (filters.years.length > 0 && !filters.years.includes(row.year)) return false
      if (filters.months.length > 0 && !filters.months.includes(row.month)) return false
      if (filters.channels.length > 0 && !filters.channels.includes(row.channel)) return false
      if (filters.channelTypes.length > 0 && !filters.channelTypes.includes(row.channelType)) return false
      if (filters.brands.length > 0 && !filters.brands.includes(row.brand)) return false
      if (filters.customers?.length > 0 && !filters.customers.includes(row.customer)) return false
      if (filters.products?.length > 0 && !filters.products.some(kw => row.product.includes(kw))) return false
      if (filters.dateRange) {
        if (filters.dateRange.start && row.date < filters.dateRange.start) return false
        if (filters.dateRange.end && row.date > filters.dateRange.end) return false
      }
      return true
    })
  }, [rows, filters])

  const metric = filters.metric

  // KPI Summary
  const summary = useMemo(() => {
    const totalSales = filtered.reduce((s, r) => s + r.subtotal, 0)
    const totalQty = filtered.reduce((s, r) => s + r.quantity, 0)
    const orderCount = filtered.length
    const avgDiscount = filtered.length > 0 ? filtered.reduce((s, r) => s + r.discountRate, 0) / filtered.length : 0
    const customerCount = new Set(filtered.map(r => r.customer).filter(Boolean)).size
    const productCount = new Set(filtered.map(r => r.product).filter(Boolean)).size
    return { totalSales, totalQty, orderCount, avgDiscount, customerCount, productCount }
  }, [filtered])

  // Trend: overall
  const trendData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.yearMonth
      if (!map[key]) map[key] = { yearMonth: key, subtotal: 0, quantity: 0 }
      map[key].subtotal += row.subtotal
      map[key].quantity += row.quantity
    })
    return Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  }, [filtered])

  // YoY comparison: same months, previous year, same non-date filters
  const trendDataYoY = useMemo(() => {
    if (!rows?.length) return []
    const currentMonths = new Set(filtered.map(r => r.yearMonth))
    if (!currentMonths.size) return []

    // Compute prev year yearMonths
    const prevMonthMap = {}
    currentMonths.forEach(ym => {
      const [y, m] = ym.split('-')
      prevMonthMap[`${parseInt(y) - 1}-${m}`] = ym // prevYM -> currentYM
    })
    const prevMonthSet = new Set(Object.keys(prevMonthMap))

    const baseRows = applyNonDateFilters(rows, filters)
    const map = {}
    baseRows.forEach(row => {
      if (!prevMonthSet.has(row.yearMonth)) return
      const alignedYM = prevMonthMap[row.yearMonth]
      if (!map[alignedYM]) map[alignedYM] = { yearMonth: alignedYM, subtotal: 0, quantity: 0 }
      map[alignedYM].subtotal += row.subtotal
      map[alignedYM].quantity += row.quantity
    })
    return Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  }, [rows, filtered, filters])

  // MoM comparison: previous month, same non-date filters
  const trendDataMoM = useMemo(() => {
    if (!rows?.length) return []
    const currentMonths = new Set(filtered.map(r => r.yearMonth))
    if (!currentMonths.size) return []

    // prev month = current month - 1
    const prevMonthMap = {}
    currentMonths.forEach(ym => {
      const prev = dayjs(ym + '-01').subtract(1, 'month').format('YYYY-MM')
      prevMonthMap[prev] = ym
    })
    const prevMonthSet = new Set(Object.keys(prevMonthMap))

    const baseRows = applyNonDateFilters(rows, filters)
    const map = {}
    baseRows.forEach(row => {
      if (!prevMonthSet.has(row.yearMonth)) return
      const alignedYM = prevMonthMap[row.yearMonth]
      if (!map[alignedYM]) map[alignedYM] = { yearMonth: alignedYM, subtotal: 0, quantity: 0 }
      map[alignedYM].subtotal += row.subtotal
      map[alignedYM].quantity += row.quantity
    })
    return Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  }, [rows, filtered, filters])

  // Trend by channel
  const trendByChannel = useMemo(() => {
    const channelSet = [...new Set(filtered.map(r => r.channel).filter(Boolean))]
    const map = {}
    filtered.forEach(row => {
      const key = row.yearMonth
      if (!map[key]) map[key] = { yearMonth: key }
      const ch = row.channel || '其他'
      map[key][ch] = (map[key][ch] || 0) + row[metric]
    })
    return { data: Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)), series: channelSet }
  }, [filtered, metric])

  // Trend by brand (top 8)
  const trendByBrand = useMemo(() => {
    const brandTotals = {}
    filtered.forEach(r => { if (r.brand) brandTotals[r.brand] = (brandTotals[r.brand] || 0) + r[metric] })
    const topBrands = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b)
    const map = {}
    filtered.forEach(row => {
      if (!topBrands.includes(row.brand)) return
      const key = row.yearMonth
      if (!map[key]) map[key] = { yearMonth: key }
      map[key][row.brand] = (map[key][row.brand] || 0) + row[metric]
    })
    return { data: Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)), series: topBrands }
  }, [filtered, metric])

  // Trend by product (top 8)
  const trendByProduct = useMemo(() => {
    const prodTotals = {}
    filtered.forEach(r => { if (r.product) prodTotals[r.product] = (prodTotals[r.product] || 0) + r[metric] })
    const topProducts = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p]) => p)
    const map = {}
    filtered.forEach(row => {
      if (!topProducts.includes(row.product)) return
      const key = row.yearMonth
      if (!map[key]) map[key] = { yearMonth: key }
      map[key][row.product] = (map[key][row.product] || 0) + row[metric]
    })
    return { data: Object.values(map).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)), series: topProducts }
  }, [filtered, metric])

  // Channel analysis
  const channelData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.channel || '其他'
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, count: 0 }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity; map[key].count++
    })
    return Object.values(map).sort((a, b) => b[metric] - a[metric])
  }, [filtered, metric])

  const channelTypeData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.channelType || '其他'
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, count: 0 }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity; map[key].count++
    })
    return Object.values(map).sort((a, b) => b[metric] - a[metric])
  }, [filtered, metric])

  const channelCustomerData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.channelType || row.channel || '其他'
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, customers: new Set(), brands: new Set(), products: new Set() }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity
      if (row.customer) map[key].customers.add(row.customer)
      if (row.brand) map[key].brands.add(row.brand)
      if (row.product) map[key].products.add(row.product)
    })
    return Object.values(map).map(d => ({
      name: d.name, subtotal: d.subtotal, quantity: d.quantity,
      customerCount: d.customers.size, brandCount: d.brands.size, productCount: d.products.size,
      customers: [...d.customers], brands: [...d.brands], products: [...d.products],
    })).sort((a, b) => b.customerCount - a.customerCount)
  }, [filtered])

  // Brand × Channel × Year analysis (for the channel comparison tab)
  const brandChannelData = useMemo(() => {
    // map: brand → channel → year → value
    const map = {}
    filtered.forEach(row => {
      const brand   = row.brand || '未知'
      const channel = row.channelType || row.channel || '其他'
      const year    = row.yearMonth?.slice(0, 4)
      if (!year) return
      if (!map[brand]) map[brand] = {}
      if (!map[brand][channel]) map[brand][channel] = {}
      map[brand][channel][year] = (map[brand][channel][year] || 0) + row[metric]
    })
    // Sort brands by total descending
    const brands = Object.keys(map).sort((a, b) => {
      const tot = obj => Object.values(obj).reduce((s, y) => s + Object.values(y).reduce((ss, v) => ss + v, 0), 0)
      return tot(map[b]) - tot(map[a])
    })
    const channels = [...new Set(filtered.map(r => r.channelType || r.channel).filter(Boolean))].sort()
    const years    = [...new Set(filtered.map(r => r.yearMonth?.slice(0, 4)).filter(Boolean))].sort()
    return { map, brands, channels, years }
  }, [filtered, metric])

  // ── Flow data for Sankey diagrams ──────────────────────────────────────────
  const flowData = useMemo(() => {
    if (!filtered.length) return null

    const chTotals = {}, brTotals = {}, prTotals = {}
    const chBrMap = {}, brPrMap = {}

    filtered.forEach(row => {
      const ch = row.channelType || row.channel || '其他'
      const br = row.brand || '未知'
      const pr = row.product || '未知產品'
      const v  = row[metric] || 0
      chTotals[ch] = (chTotals[ch] || 0) + v
      brTotals[br] = (brTotals[br] || 0) + v
      prTotals[pr] = (prTotals[pr] || 0) + v
      if (!chBrMap[ch]) chBrMap[ch] = {}
      chBrMap[ch][br] = (chBrMap[ch][br] || 0) + v
      if (!brPrMap[br]) brPrMap[br] = {}
      brPrMap[br][pr] = (brPrMap[br][pr] || 0) + v
    })

    // Channel → Brand (top 12 brands)
    const top12Brands = Object.entries(brTotals).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
    const top12Set = new Set(top12Brands)
    const chTotalsVis = {}
    Object.entries(chBrMap).forEach(([ch, brands]) => {
      Object.entries(brands).forEach(([br, v]) => { if (top12Set.has(br)) chTotalsVis[ch] = (chTotalsVis[ch] || 0) + v })
    })
    const channelToBrand = {
      sourceNodes: Object.entries(chTotalsVis).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ id, value })),
      targetNodes: top12Brands.map(id => ({ id, value: brTotals[id] })),
      links: Object.entries(chBrMap).flatMap(([ch, brands]) =>
        Object.entries(brands).filter(([br]) => top12Set.has(br)).map(([br, value]) => ({ source: ch, target: br, value }))
      ),
    }

    // Brand → Product (top 8 brands, top 12 products)
    const top8Brands = Object.entries(brTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id)
    const top8Set = new Set(top8Brands)
    const top12Prods = Object.entries(prTotals).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
    const top12ProdSet = new Set(top12Prods)
    const brTotalsVis = {}
    Object.entries(brPrMap).forEach(([br, prods]) => {
      if (!top8Set.has(br)) return
      Object.entries(prods).forEach(([pr, v]) => { if (top12ProdSet.has(pr)) brTotalsVis[br] = (brTotalsVis[br] || 0) + v })
    })
    const brandToProduct = {
      sourceNodes: top8Brands.filter(id => brTotalsVis[id] > 0).map(id => ({ id, value: brTotalsVis[id] })),
      targetNodes: top12Prods.map(id => ({ id, value: prTotals[id] })),
      links: top8Brands.flatMap(br =>
        Object.entries(brPrMap[br] || {}).filter(([pr]) => top12ProdSet.has(pr)).map(([pr, value]) => ({ source: br, target: pr, value }))
      ),
    }

    return { channelToBrand, brandToProduct }
  }, [filtered, metric])

  // ── Structure data for tree / treemap diagrams ──────────────────────────────
  const structureData = useMemo(() => {
    if (!filtered.length) return null

    // Channel → Brand tree (top 5 brands per channel)
    const chBrTree = {}
    filtered.forEach(row => {
      const ch = row.channelType || row.channel || '其他'
      const br = row.brand || '未知'
      const v  = row[metric] || 0
      if (!chBrTree[ch]) chBrTree[ch] = {}
      chBrTree[ch][br] = (chBrTree[ch][br] || 0) + v
    })
    const channelBrandTree = Object.entries(chBrTree).map(([ch, brands]) => {
      const sorted = Object.entries(brands).sort((a, b) => b[1] - a[1])
      const topBrands = sorted.slice(0, 5).map(([name, value]) => ({ name, value }))
      const othersVal = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
      if (othersVal > 0) topBrands.push({ name: '其他品牌', value: othersVal })
      return { name: ch, value: Object.values(brands).reduce((s, v) => s + v, 0), children: topBrands }
    }).sort((a, b) => b.value - a.value)

    // Brand → Product tree (top 8 brands, top 5 products each)
    const brPrTree = {}
    filtered.forEach(row => {
      const br = row.brand || '未知'
      const pr = row.product || '未知產品'
      const v  = row[metric] || 0
      if (!brPrTree[br]) brPrTree[br] = {}
      brPrTree[br][pr] = (brPrTree[br][pr] || 0) + v
    })
    const brTotals2 = Object.entries(brPrTree).map(([br, prods]) => ({ br, total: Object.values(prods).reduce((s, v) => s + v, 0) })).sort((a, b) => b.total - a.total)
    const brandProductTree = brTotals2.slice(0, 8).map(({ br, total }) => {
      const sorted = Object.entries(brPrTree[br]).sort((a, b) => b[1] - a[1])
      const topProds = sorted.slice(0, 5).map(([name, value]) => ({ name, value }))
      const othersVal = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
      if (othersVal > 0) topProds.push({ name: '其他產品', value: othersVal })
      return { name: br, value: total, children: topProds }
    })

    return { channelBrandTree, brandProductTree }
  }, [filtered, metric])

  // Brand analysis
  const brandData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.brand || '未知'
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, count: 0 }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity; map[key].count++
    })
    return Object.values(map).sort((a, b) => b[metric] - a[metric])
  }, [filtered, metric])

  // Product analysis
  const productData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      const key = row.product || '未知產品'
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, count: 0, customers: new Set(), channels: new Set() }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity; map[key].count++
      if (row.customer) map[key].customers.add(row.customer)
      if (row.channel) map[key].channels.add(row.channel)
    })
    return Object.values(map).map(d => ({
      name: d.name, subtotal: d.subtotal, quantity: d.quantity, count: d.count,
      customerCount: d.customers.size, channelCount: d.channels.size,
      avgOrderValue: d.count > 0 ? Math.round(d.subtotal / d.count) : 0,
    })).sort((a, b) => b[metric] - a[metric])
  }, [filtered, metric])

  // Product × channel (top 15 products, stacked)
  const productByChannel = useMemo(() => {
    const prodTotals = {}
    filtered.forEach(r => { if (r.product) prodTotals[r.product] = (prodTotals[r.product] || 0) + r[metric] })
    const top15 = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([p]) => p)
    const channelSet = [...new Set(filtered.map(r => r.channel).filter(Boolean))]
    const map = {}
    filtered.forEach(row => {
      if (!top15.includes(row.product)) return
      const key = row.product
      if (!map[key]) map[key] = { product: key }
      const ch = row.channel || '其他'
      map[key][ch] = (map[key][ch] || 0) + row[metric]
    })
    return { data: top15.map(p => map[p] || { product: p }), series: channelSet }
  }, [filtered, metric])

  // Product × customer (top 10 products)
  const productCustomerData = useMemo(() => {
    const prodTotals = {}
    filtered.forEach(r => { if (r.product) prodTotals[r.product] = (prodTotals[r.product] || 0) + r[metric] })
    const top10 = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p)
    const result = {}
    top10.forEach(prod => {
      const custMap = {}
      filtered.filter(r => r.product === prod && r.customer).forEach(r => {
        if (!custMap[r.customer]) custMap[r.customer] = { name: r.customer, subtotal: 0, quantity: 0 }
        custMap[r.customer].subtotal += r.subtotal; custMap[r.customer].quantity += r.quantity
      })
      result[prod] = Object.values(custMap).sort((a, b) => b[metric] - a[metric]).slice(0, 8)
    })
    return result
  }, [filtered, metric])

  // Customer analysis
  const customerData = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      if (!row.customer) return
      const key = row.customer
      if (!map[key]) map[key] = { name: key, subtotal: 0, quantity: 0, count: 0, channelTypes: new Set(), brands: new Set(), products: new Set() }
      map[key].subtotal += row.subtotal; map[key].quantity += row.quantity; map[key].count++
      if (row.channelType) map[key].channelTypes.add(row.channelType)
      if (row.brand) map[key].brands.add(row.brand)
      if (row.product) map[key].products.add(row.product)
    })
    return Object.values(map).map(d => ({
      name: d.name, subtotal: d.subtotal, quantity: d.quantity, count: d.count,
      avgOrderValue: d.count > 0 ? Math.round(d.subtotal / d.count) : 0,
      channelTypes: [...d.channelTypes], brands: [...d.brands], products: [...d.products],
    })).sort((a, b) => b[metric] - a[metric])
  }, [filtered, metric])

  // Customer top 5 by channel (網路 / 實體)
  const customerByChannelTop = useMemo(() => {
    const map = {}
    filtered.forEach(row => {
      if (!row.customer) return
      const ch = row.channel || '其他'
      if (!map[ch]) map[ch] = {}
      if (!map[ch][row.customer]) map[ch][row.customer] = { name: row.customer, subtotal: 0, quantity: 0 }
      map[ch][row.customer].subtotal += row.subtotal
      map[ch][row.customer].quantity += row.quantity
    })
    const result = {}
    Object.entries(map).forEach(([ch, custMap]) => {
      result[ch] = Object.values(custMap).sort((a, b) => b[metric] - a[metric]).slice(0, 5)
    })
    return result
  }, [filtered, metric])

  // Performance matrix data
  const performanceData = useMemo(() => {
    const productPerf = productData.map(d => ({ ...d }))
    const channelPerf = channelData.map(d => ({ ...d }))
    const brandPerf = brandData.map(d => ({ ...d }))
    const customerPerf = customerData.map(d => ({ ...d }))
    return {
      productPerf, channelPerf, brandPerf, customerPerf,
      productMedian:  { subtotal: median(productPerf.map(d => d.subtotal)),  quantity: median(productPerf.map(d => d.quantity)) },
      channelMedian:  { subtotal: median(channelPerf.map(d => d.subtotal)),  quantity: median(channelPerf.map(d => d.quantity)) },
      brandMedian:    { subtotal: median(brandPerf.map(d => d.subtotal)),    quantity: median(brandPerf.map(d => d.quantity)) },
      customerMedian: { subtotal: median(customerPerf.map(d => d.subtotal)), quantity: median(customerPerf.map(d => d.quantity)) },
    }
  }, [productData, channelData, brandData, customerData])

  // Comparison: by year and by quarter
  const comparisonData = useMemo(() => {
    const yearMap = {}
    filtered.forEach(row => {
      if (!yearMap[row.year]) yearMap[row.year] = { year: row.year, subtotal: 0, quantity: 0 }
      yearMap[row.year].subtotal += row.subtotal
      yearMap[row.year].quantity += row.quantity
    })
    const byYear = Object.values(yearMap).sort((a, b) => a.year.localeCompare(b.year))

    const qMap = {}
    filtered.forEach(row => {
      const q = Math.ceil(parseInt(row.month) / 3)
      const key = `${row.year}-Q${q}`
      if (!qMap[key]) qMap[key] = { label: key, year: row.year, quarter: q, subtotal: 0, quantity: 0 }
      qMap[key].subtotal += row.subtotal
      qMap[key].quantity += row.quantity
    })
    const byQuarter = Object.values(qMap).sort((a, b) => a.label.localeCompare(b.label))

    return { byYear, byQuarter }
  }, [filtered])

  // Heatmap: month × channelType
  const heatmapData = useMemo(() => {
    const channelTypes = [...new Set(filtered.map(r => r.channelType).filter(Boolean))].sort()
    const months = [...new Set(filtered.map(r => r.yearMonth))].sort()
    const map = {}
    filtered.forEach(row => {
      const ct = row.channelType || '其他'
      const key = `${ct}__${row.yearMonth}`
      map[key] = (map[key] || 0) + row[metric]
    })
    const data = channelTypes.map(ct => {
      const entry = { channelType: ct }
      months.forEach(ym => { entry[ym] = map[`${ct}__${ym}`] || 0 })
      return entry
    })
    return { data, months, channelTypes }
  }, [filtered, metric])

  return {
    filtered, summary,
    trendData, trendDataYoY, trendDataMoM,
    trendByChannel, trendByBrand, trendByProduct,
    channelData, channelTypeData, channelCustomerData,
    brandData, brandChannelData, heatmapData,
    productData, productByChannel, productCustomerData,
    customerData, customerByChannelTop, performanceData,
    comparisonData,
    flowData, structureData,
  }
}

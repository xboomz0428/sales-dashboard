/* 營收分析系統 - 資料 mock */

const MONTHLY_REVENUE = [
  { month: "1月", revenue: 1280000, orders: 1840, customers: 1120 },
  { month: "2月", revenue: 1105000, orders: 1620, customers: 980 },
  { month: "3月", revenue: 1420000, orders: 1960, customers: 1280 },
  { month: "4月", revenue: 1680000, orders: 2180, customers: 1480 },
  { month: "5月", revenue: 1540000, orders: 2050, customers: 1380 },
  { month: "6月", revenue: 1820000, orders: 2340, customers: 1610 },
  { month: "7月", revenue: 2100000, orders: 2680, customers: 1820 },
  { month: "8月", revenue: 1980000, orders: 2520, customers: 1720 },
  { month: "9月", revenue: 2240000, orders: 2820, customers: 1940 },
  { month: "10月", revenue: 2380000, orders: 2960, customers: 2080 },
  { month: "11月", revenue: 2580000, orders: 3180, customers: 2240 },
  { month: "12月", revenue: 2820000, orders: 3480, customers: 2460 },
];

const TOP_PRODUCTS = [
  { name: "經典焙茶拿鐵",    category: "飲品", sales: 428000, units: 2140, pct: 100 },
  { name: "手作肉桂捲",      category: "烘焙", sales: 362000, units: 1810, pct: 85 },
  { name: "季節莓果塔",      category: "甜點", sales: 298000, units: 1192, pct: 70 },
  { name: "冷萃黑咖啡",      category: "飲品", sales: 254000, units: 1680, pct: 60 },
  { name: "櫻花戚風蛋糕",    category: "甜點", sales: 218000, units: 872,  pct: 52 },
  { name: "抹茶生巧克力",    category: "甜點", sales: 186000, units: 744,  pct: 44 },
  { name: "焦糖瑪琪朵",      category: "飲品", sales: 172000, units: 1075, pct: 41 },
  { name: "可頌三明治",      category: "烘焙", sales: 148000, units: 593,  pct: 35 },
];

const CUSTOMER_SEGMENTS = [
  { label: "VIP 會員",   value: 38, color: "var(--mint-500)",  count: 486 },
  { label: "回頭客",     value: 29, color: "var(--sky-500)",   count: 372 },
  { label: "新客",       value: 22, color: "var(--peach-500)", count: 282 },
  { label: "流失警示",   value: 11, color: "var(--coral-500)", count: 140 },
];

const KPIS = [
  {
    key: "revenue",
    label: "本月總營收",
    value: 2820000,
    unit: "元",
    delta: 9.3,
    trend: "up",
    color: "mint",
    spark: [22, 28, 24, 32, 30, 38, 42, 40, 48, 54, 58, 68],
  },
  {
    key: "orders",
    label: "訂單數",
    value: 3480,
    unit: "筆",
    delta: 9.4,
    trend: "up",
    color: "sky",
    spark: [18, 22, 20, 28, 26, 32, 38, 36, 42, 48, 52, 62],
  },
  {
    key: "avg",
    label: "平均客單價",
    value: 810,
    unit: "元",
    delta: -2.1,
    trend: "down",
    color: "peach",
    spark: [42, 40, 38, 44, 46, 42, 38, 44, 42, 40, 38, 36],
  },
  {
    key: "customers",
    label: "活躍客戶",
    value: 2460,
    unit: "人",
    delta: 9.8,
    trend: "up",
    color: "lilac",
    spark: [12, 18, 16, 22, 20, 28, 34, 32, 38, 44, 48, 54],
  },
];

const HOURLY = [
  { h: "09", v: 32 }, { h: "10", v: 58 }, { h: "11", v: 82 },
  { h: "12", v: 120 }, { h: "13", v: 96 }, { h: "14", v: 68 },
  { h: "15", v: 74 }, { h: "16", v: 88 }, { h: "17", v: 104 },
  { h: "18", v: 132 }, { h: "19", v: 142 }, { h: "20", v: 118 },
  { h: "21", v: 72 },
];

Object.assign(window, {
  MONTHLY_REVENUE, TOP_PRODUCTS, CUSTOMER_SEGMENTS, KPIS, HOURLY,
});

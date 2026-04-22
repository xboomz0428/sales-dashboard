/* 營收分析系統 - Main App */

const { useState, useEffect, useMemo } = React;

/* ---------- Tweaks hook ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "fontScale": "medium",
  "density": "comfy",
  "chartType": "area"
}/*EDITMODE-END*/;

const fontScaleMap = { small: 0.9, medium: 1.0, large: 1.12 };
const densityMap = { compact: 0.78, comfy: 1.0 };

function useTweaks() {
  const [tw, setTw] = useState(() => {
    try {
      const s = localStorage.getItem("revenue-tweaks");
      return s ? { ...TWEAK_DEFAULTS, ...JSON.parse(s) } : TWEAK_DEFAULTS;
    } catch { return TWEAK_DEFAULTS; }
  });
  useEffect(() => {
    document.documentElement.style.setProperty("--fs-scale", fontScaleMap[tw.fontScale] || 1);
    document.documentElement.style.setProperty("--density", densityMap[tw.density] || 1);
    localStorage.setItem("revenue-tweaks", JSON.stringify(tw));
  }, [tw]);
  const set = (k, v) => setTw(p => ({ ...p, [k]: v }));
  return [tw, set];
}

/* ---------- Sidebar nav items ---------- */
const NAV = [
  { id: "home",    icon: "home",     label: "總覽" },
  { id: "revenue", icon: "chart",    label: "營收分析", active: true },
  { id: "product", icon: "pkg",      label: "商品分析" },
  { id: "customer",icon: "users",    label: "客戶分析" },
  { id: "store",   icon: "store",    label: "分店比較" },
];
const NAV_2 = [
  { id: "settings", icon: "settings", label: "系統設定" },
];

/* ---------- KPI Card ---------- */
const KpiCard = ({ kpi }) => {
  const colorMap = {
    mint:   { bg: "linear-gradient(135deg, var(--mint-100), var(--mint-50))",   ic: "var(--mint-600)",  spark: "var(--mint-500)"  },
    sky:    { bg: "linear-gradient(135deg, var(--sky-100), #f0f9ff)",           ic: "var(--sky-500)",   spark: "var(--sky-500)"   },
    peach:  { bg: "linear-gradient(135deg, var(--peach-100), #fffaf0)",         ic: "var(--peach-500)", spark: "var(--peach-500)" },
    lilac:  { bg: "linear-gradient(135deg, var(--lilac-100), #f7f3fe)",         ic: "var(--lilac-500)", spark: "var(--lilac-500)" },
  };
  const iconMap = { revenue: "coin", orders: "cart", avg: "ticket", customers: "user-plus" };
  const c = colorMap[kpi.color];
  return (
    <div className="kpi">
      <div className="kpi-bg" style={{ background: c.bg }}/>
      <div className="kpi-content">
        <div className="kpi-label">
          <span className="kpi-icon" style={{ color: c.ic }}>
            <Icon name={iconMap[kpi.key]} size={16} stroke={2}/>
          </span>
          <span>{kpi.label}</span>
        </div>
        <div className="kpi-value num">
          <span>{kpi.key === "revenue" ? fmt(kpi.value) : kpi.value.toLocaleString()}</span>
          <span className="kpi-unit">{kpi.unit}</span>
        </div>
        <div className={`kpi-delta ${kpi.trend}`}>
          <Icon name={kpi.trend === "up" ? "arrow-up" : "arrow-down"} size={11} stroke={2.5}/>
          <span className="num">{Math.abs(kpi.delta)}%</span>
          <span style={{ color: "var(--ink-400)", marginLeft: 2, fontWeight: 400 }}>vs 上月</span>
        </div>
        <div className="kpi-spark"><Sparkline data={kpi.spark} color={c.spark}/></div>
      </div>
    </div>
  );
};

/* ---------- Product Rank ---------- */
const ProductRank = ({ products }) => (
  <div className="rank-list">
    {products.map((p, i) => (
      <div key={i} className="rank-row">
        <div className="rank-num num">{String(i + 1).padStart(2, "0")}</div>
        <div className="rank-info">
          <div className="rank-name">{p.name}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)", marginTop: 2 }}>
            {p.category} · 售出 {p.units.toLocaleString()} 件
          </div>
          <div className="rank-bar-wrap">
            <div className="rank-bar" style={{ width: `${p.pct}%` }}/>
          </div>
        </div>
        <div className="rank-val num">
          NT$ {fmt(p.sales)}
          <span className="rank-val-sub">佔比 {p.pct}%</span>
        </div>
      </div>
    ))}
  </div>
);

/* ---------- Customer Segments ---------- */
const CustomerPanel = ({ segments }) => (
  <div className="donut-wrap">
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Donut data={segments}/>
    </div>
    <div className="legend">
      {segments.map((s, i) => (
        <div key={i} className="legend-item">
          <span className="legend-dot" style={{ background: s.color }}/>
          <div>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)", marginTop: 1 }}>{s.count} 人</div>
          </div>
          <div className="legend-val num">{s.value}%</div>
        </div>
      ))}
    </div>
  </div>
);

/* ---------- Date range chips ---------- */
const RANGES = [
  { id: "7d",  label: "近 7 天" },
  { id: "30d", label: "近 30 天" },
  { id: "ytd", label: "今年迄今" },
  { id: "1y",  label: "近一年" },
];

/* ---------- Main App ---------- */
const App = () => {
  const [tw, setTw] = useTweaks();
  const [range, setRange] = useState("1y");
  const [metric, setMetric] = useState("revenue");
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState("overview");
  const [showTweaks, setShowTweaks] = useState(false);

  // Tweaks protocol
  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode") setShowTweaks(true);
      if (e.data.type === "__deactivate_edit_mode") setShowTweaks(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const updateTweak = (k, v) => {
    setTw(k, v);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };

  return (
    <div className="app">
      {/* ---------- Desktop Sidebar ---------- */}
      <aside className="sidebar">
        <SidebarContent/>
      </aside>

      {/* ---------- Mobile Drawer ---------- */}
      <div className={`drawer-backdrop ${drawer ? "open" : ""}`} onClick={() => setDrawer(false)}/>
      <aside className={`drawer ${drawer ? "open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="brand-mark"><Icon name="chart" size={18} stroke={2.5}/></div>
            <div>
              <div className="brand-name">營收分析</div>
              <div className="brand-sub">店長儀表板</div>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setDrawer(false)}><Icon name="x" size={20}/></button>
        </div>
        <SidebarContent/>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger icon-btn" onClick={() => setDrawer(true)}>
              <Icon name="menu" size={22}/>
            </button>
            <div>
              <div className="page-title">營收分析</div>
              <div className="page-sub hide-mob">2026 全年度 · 總計 12 家分店</div>
            </div>
          </div>
          <div className="topbar-right">
            <button className="icon-btn hide-mob"><Icon name="search"/></button>
            <button className="icon-btn"><Icon name="bell"/></button>
            <div className="avatar">林</div>
          </div>
        </header>

        {/* Mobile horizontal tabs (swipeable) */}
        <div className="m-tabs">
          {[
            { id: "overview", label: "總覽" },
            { id: "trend",    label: "月趨勢" },
            { id: "product",  label: "商品" },
            { id: "customer", label: "客戶" },
            { id: "hour",     label: "時段" },
          ].map(t => (
            <button key={t.id}
              className={`m-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="content">
          {/* Page head with filters (desktop) */}
          <div className="page-head">
            <div>
              <div className="filter-row hide-mob">
                {RANGES.map(r => (
                  <button key={r.id}
                    className={`chip ${range === r.id ? "active" : ""}`}
                    onClick={() => setRange(r.id)}>
                    {r.label}
                  </button>
                ))}
                <button className="chip ghost">
                  <Icon name="calendar" size={14}/> 自訂區間
                </button>
              </div>
              {/* Mobile filter button */}
              <button className="chip hide-desk" style={{ display: "none" }}
                onClick={() => setSheet(true)}>
                <Icon name="filter" size={14}/>
                <span>{RANGES.find(r => r.id === range)?.label} · 全部分店</span>
              </button>
            </div>
            <div className="flex gap-sm hide-mob">
              <button className="chip"><Icon name="download" size={14}/> 匯出報表</button>
            </div>
          </div>

          {/* Mobile single filter row */}
          <div style={{ marginBottom: 14 }} className="hide-desk">
            <button className="chip" style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setSheet(true)}>
              <Icon name="filter" size={14}/>
              <span>{RANGES.find(r => r.id === range)?.label} · 全部分店 · 全部商品</span>
            </button>
          </div>

          {/* ---------- KPIs (always visible, or "overview" on mobile) ---------- */}
          {(tab === "overview" || !isMobileTab(tab)) && (
            <section className="grid-kpi">
              {KPIS.map(k => <KpiCard key={k.key} kpi={k}/>)}
            </section>
          )}

          {/* ---------- Main chart row ---------- */}
          {(tab === "overview" || tab === "trend") && (
            <section className="grid-main">
              <div className="card">
                <div className="card-title">
                  <div>
                    <h3>月營收趨勢</h3>
                    <div className="card-title-sub">2026 年 · 單位：新台幣</div>
                  </div>
                  <div className="seg hide-mob">
                    {[
                      { id: "revenue",   label: "營收" },
                      { id: "orders",    label: "訂單" },
                      { id: "customers", label: "客戶" },
                    ].map(m => (
                      <button key={m.id}
                        className={metric === m.id ? "active" : ""}
                        onClick={() => setMetric(m.id)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <RevenueChart data={MONTHLY_REVENUE} type={tw.chartType}/>
                <div className="seg hide-desk" style={{ marginTop: 12, width: "100%", display: "none" }}>
                  {[
                    { id: "revenue",   label: "營收" },
                    { id: "orders",    label: "訂單" },
                    { id: "customers", label: "客戶" },
                  ].map(m => (
                    <button key={m.id} style={{ flex: 1 }}
                      className={metric === m.id ? "active" : ""}
                      onClick={() => setMetric(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-title">
                  <div>
                    <h3>今日時段分佈</h3>
                    <div className="card-title-sub">當日來客數 · 截至 21:00</div>
                  </div>
                </div>
                <HourlyBars data={HOURLY}/>
                <div style={{ marginTop: 14, padding: 12, background: "var(--peach-100)", borderRadius: "var(--r-sm)",
                              fontSize: "var(--fs-xs)", color: "var(--ink-700)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div>
                    <strong>尖峰時段 19:00</strong>
                    <div style={{ color: "var(--ink-500)", marginTop: 2 }}>建議排班 2 位以上夥伴</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Secondary row ---------- */}
          {(tab === "overview" || tab === "product" || tab === "customer") && (
            <section className="grid-sec">
              {(tab !== "customer") && (
                <div className="card">
                  <div className="card-title">
                    <div>
                      <h3>商品銷售排行</h3>
                      <div className="card-title-sub">本月銷售金額 Top 8</div>
                    </div>
                    <div className="seg hide-mob">
                      <button className="active">金額</button>
                      <button>數量</button>
                    </div>
                  </div>
                  <ProductRank products={TOP_PRODUCTS}/>
                </div>
              )}

              {(tab !== "product") && (
                <div className="card">
                  <div className="card-title">
                    <div>
                      <h3>客戶組成</h3>
                      <div className="card-title-sub">共 1,280 位活躍客戶</div>
                    </div>
                  </div>
                  <CustomerPanel segments={CUSTOMER_SEGMENTS}/>

                  <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <MiniStat label="新客成長" value="+18%" color="var(--mint-600)" bg="var(--mint-50)"/>
                    <MiniStat label="回流率" value="62%" color="var(--sky-500)" bg="var(--sky-100)"/>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---------- Mobile bottom tabbar ---------- */}
        <nav className="tabbar">
          <button className="tabbar-item active">
            <Icon name="chart" size={20}/> <span>分析</span>
          </button>
          <button className="tabbar-item">
            <Icon name="pkg" size={20}/> <span>商品</span>
          </button>
          <button className="tabbar-item" onClick={() => setSheet(true)}>
            <Icon name="filter" size={20}/> <span>篩選</span>
          </button>
          <button className="tabbar-item">
            <Icon name="users" size={20}/> <span>客戶</span>
          </button>
          <button className="tabbar-item" onClick={() => setDrawer(true)}>
            <Icon name="menu" size={20}/> <span>更多</span>
          </button>
        </nav>
      </main>

      {/* ---------- Filter bottom sheet ---------- */}
      <div className={`sheet-backdrop ${sheet ? "open" : ""}`} onClick={() => setSheet(false)}/>
      <div className={`sheet ${sheet ? "open" : ""}`}>
        <div className="sheet-handle"/>
        <h4>篩選條件</h4>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)", marginBottom: 8 }}>時間範圍</div>
          <div className="filter-row">
            {RANGES.map(r => (
              <button key={r.id}
                className={`chip ${range === r.id ? "active" : ""}`}
                onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)", marginBottom: 8 }}>分店</div>
          <div className="filter-row">
            <button className="chip active">全部分店</button>
            <button className="chip">信義旗艦</button>
            <button className="chip">大安店</button>
            <button className="chip">中山店</button>
            <button className="chip">東區店</button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)", marginBottom: 8 }}>商品分類</div>
          <div className="filter-row">
            <button className="chip active">全部</button>
            <button className="chip">飲品</button>
            <button className="chip">烘焙</button>
            <button className="chip">甜點</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="chip" style={{ flex: 1, justifyContent: "center", minHeight: 48 }}
                  onClick={() => setSheet(false)}>取消</button>
          <button className="chip active" style={{ flex: 2, justifyContent: "center", minHeight: 48 }}
                  onClick={() => setSheet(false)}>套用條件</button>
        </div>
      </div>

      {/* ---------- Tweaks panel ---------- */}
      <div className={`tweaks ${showTweaks ? "open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ margin: 0 }}>Tweaks</h4>
          <Icon name="sliders" size={16} style={{ color: "var(--ink-500)" }}/>
        </div>

        <div className="tweak-row">
          <div className="tweak-label">字級大小</div>
          <div className="tweak-seg">
            {[["small", "小"], ["medium", "中"], ["large", "大"]].map(([k, l]) => (
              <button key={k}
                className={tw.fontScale === k ? "active" : ""}
                onClick={() => updateTweak("fontScale", k)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="tweak-row">
          <div className="tweak-label">資料密度</div>
          <div className="tweak-seg">
            {[["compact", "緊湊"], ["comfy", "舒適"]].map(([k, l]) => (
              <button key={k}
                className={tw.density === k ? "active" : ""}
                onClick={() => updateTweak("density", k)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="tweak-row">
          <div className="tweak-label">月趨勢圖表類型</div>
          <div className="tweak-seg">
            {[["area", "面積"], ["line", "折線"], ["bar", "長條"]].map(([k, l]) => (
              <button key={k}
                className={tw.chartType === k ? "active" : ""}
                onClick={() => updateTweak("chartType", k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Helpers ---------- */
const isMobileTab = (t) => window.innerWidth <= 960 && t !== "overview";

const MiniStat = ({ label, value, color, bg }) => (
  <div style={{ background: bg, borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)" }}>{label}</div>
    <div className="num" style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color, marginTop: 2 }}>{value}</div>
  </div>
);

const SidebarContent = () => (
  <>
    <div className="brand">
      <div className="brand-mark"><Icon name="chart" size={18} stroke={2.5}/></div>
      <div>
        <div className="brand-name">營收分析</div>
        <div className="brand-sub">店長儀表板</div>
      </div>
    </div>
    <div className="nav-group-label">主要功能</div>
    {NAV.map(n => (
      <button key={n.id} className={`nav-item ${n.active ? "active" : ""}`}>
        <span className="nav-ic"><Icon name={n.icon} size={18}/></span>
        <span>{n.label}</span>
      </button>
    ))}
    <div className="nav-group-label" style={{ marginTop: 8 }}>其他</div>
    {NAV_2.map(n => (
      <button key={n.id} className="nav-item">
        <span className="nav-ic"><Icon name={n.icon} size={18}/></span>
        <span>{n.label}</span>
      </button>
    ))}
    <div style={{ flex: 1 }}/>
    <div style={{ padding: 14, background: "var(--mint-50)", borderRadius: "var(--r-md)", marginTop: 14 }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--mint-700)", fontWeight: 600 }}>本月目標</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0 8px" }}>
        <span className="num" style={{ fontSize: "var(--fs-md)", fontWeight: 700 }}>94%</span>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)" }}>已達成</span>
      </div>
      <div style={{ height: 6, background: "#fff", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "94%", background: "linear-gradient(90deg, var(--mint-400), var(--mint-500))", borderRadius: 3 }}/>
      </div>
    </div>
  </>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

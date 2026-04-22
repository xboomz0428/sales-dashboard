/* 營收分析系統 - 圖表元件（純 SVG，響應式 + 互動） */

const { useState, useRef, useEffect } = React;

/* ---------- Helpers ---------- */
const fmt = (n) => {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "億";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "萬";
  return n.toLocaleString();
};
const fmtShort = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return n;
};

/* ---------- Sparkline (mini trend in KPI) ---------- */
const Sparkline = ({ data, color = "var(--mint-500)", filled = true }) => {
  const w = 100, h = 28;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / span) * h * 0.85 - 2,
  ]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
  const area = d + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 28, display: "block" }}>
      {filled && <path d={area} fill={color} fillOpacity="0.15" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* ---------- Monthly revenue chart (line / area / bar) ---------- */
const RevenueChart = ({ data, type = "area" }) => {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [size, setSize] = useState({ w: 720, h: 320 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const h = cr.width < 520 ? 240 : cr.width < 800 ? 280 : 320;
      setSize({ w: cr.width, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const padL = 42, padR = 14, padT = 18, padB = 34;
  const cw = Math.max(100, w - padL - padR);
  const ch = h - padT - padB;

  const max = Math.max(...data.map(d => d.revenue)) * 1.1;
  const min = 0;
  const xOf = (i) => padL + (i / (data.length - 1)) * cw;
  const yOf = (v) => padT + ch - ((v - min) / (max - min)) * ch;

  const linePts = data.map((d, i) => [xOf(i), yOf(d.revenue)]);
  const dLine = linePts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
  const dArea = dLine + ` L ${xOf(data.length - 1)},${padT + ch} L ${xOf(0)},${padT + ch} Z`;

  // gridlines
  const yTicks = 4;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = min + ((max - min) / yTicks) * i;
    return { v, y: yOf(v) };
  });

  // Bar width
  const barW = Math.max(6, (cw / data.length) * 0.55);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dd = Math.abs(xOf(i) - rx);
      if (dd < bestDist) { bestDist = dd; best = i; }
    }
    setHover(best);
  };
  const handleLeave = () => setHover(null);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", touchAction: "pan-y" }}
           onMouseMove={handleMove} onMouseLeave={handleLeave}
           onTouchMove={(e) => {
             const t = e.touches[0];
             handleMove({ clientX: t.clientX, currentTarget: e.currentTarget });
           }}
           onTouchEnd={handleLeave}>
        <defs>
          <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint-400)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--mint-400)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint-500)" />
            <stop offset="100%" stopColor="var(--mint-300)" />
          </linearGradient>
        </defs>

        {/* grid */}
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={g.y} y2={g.y}
                  stroke="var(--line)" strokeWidth="1" strokeDasharray={i === yTicks ? "" : "3 5"}/>
            <text x={padL - 8} y={g.y + 4} fontSize="10.5" fill="var(--ink-400)" textAnchor="end">
              {fmtShort(g.v)}
            </text>
          </g>
        ))}

        {/* chart type */}
        {type === "bar" && data.map((d, i) => {
          const isHover = hover === i;
          return (
            <rect key={i}
              x={xOf(i) - barW / 2}
              y={yOf(d.revenue)}
              width={barW}
              height={padT + ch - yOf(d.revenue)}
              rx="5"
              fill={isHover ? "var(--mint-600)" : "url(#gradBar)"}
              style={{ transition: "fill .2s" }}
            />
          );
        })}

        {type === "area" && (
          <>
            <path d={dArea} fill="url(#gradArea)" />
            <path d={dLine} fill="none" stroke="var(--mint-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {type === "line" && (
          <path d={dLine} fill="none" stroke="var(--mint-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* data points */}
        {(type === "area" || type === "line") && data.map((d, i) => {
          const isHover = hover === i;
          return (
            <circle key={i} cx={xOf(i)} cy={yOf(d.revenue)}
              r={isHover ? 6 : 3.5}
              fill="#fff"
              stroke="var(--mint-500)"
              strokeWidth={isHover ? 3 : 2}
              style={{ transition: "r .15s" }}
            />
          );
        })}

        {/* hover vertical line */}
        {hover !== null && (
          <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + ch}
                stroke="var(--ink-300)" strokeWidth="1" strokeDasharray="3 3"/>
        )}

        {/* x labels */}
        {data.map((d, i) => {
          // On mobile, skip every other label
          const skip = w < 520 && i % 2 !== 0;
          if (skip) return null;
          return (
            <text key={i} x={xOf(i)} y={h - 12} fontSize="11" fill="var(--ink-500)" textAnchor="middle">
              {d.month}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div className="tooltip show" style={{
          left: `${(xOf(hover) / w) * 100}%`,
          top: `${(yOf(data[hover].revenue) / h) * 100}%`,
        }}>
          <div className="tooltip-label">{data[hover].month}</div>
          <div className="tooltip-value">NT$ {fmt(data[hover].revenue)}</div>
        </div>
      )}
    </div>
  );
};

/* ---------- Donut chart ---------- */
const Donut = ({ data, size = 160, thickness = 22 }) => {
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0);
  let acc = 0;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={thickness} />
      {data.map((d, i) => {
        const frac = d.value / total;
        const dash = frac * C;
        const offset = -acc * C + C * 0.25;
        acc += frac;
        return (
          <circle key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${C}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" className="donut-center">{total}%</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="var(--ink-500)">客戶組成</text>
    </svg>
  );
};

/* ---------- Hourly bar (for "今日時段") ---------- */
const HourlyBars = ({ data }) => {
  const max = Math.max(...data.map(d => d.v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100, width: "100%" }}>
      {data.map((d, i) => {
        const h = (d.v / max) * 100;
        const peak = d.v === max;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%",
              height: `${h}%`,
              background: peak
                ? "linear-gradient(180deg, var(--peach-500), var(--coral-500))"
                : "linear-gradient(180deg, var(--mint-400), var(--mint-500))",
              borderRadius: 4,
              minHeight: 3,
            }}/>
            <div style={{ fontSize: 10, color: "var(--ink-400)" }}>{d.h}</div>
          </div>
        );
      })}
    </div>
  );
};

Object.assign(window, { Sparkline, RevenueChart, Donut, HourlyBars, fmt, fmtShort });

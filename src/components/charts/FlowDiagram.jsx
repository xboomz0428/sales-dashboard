import { useState, useMemo } from 'react'
import ChartCard from '../ChartCard'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1',
  '#14B8A6', '#A855F7', '#E11D48', '#0EA5E9', '#22C55E',
]

function fmtV(v) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '萬'
  return Math.round(v).toLocaleString()
}

function trunc(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Sankey Flow View ────────────────────────────────────────────────────────────
function SankeyView({ sourceNodes, targetNodes, links, leftLabel, rightLabel }) {
  const [hovered, setHovered] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  const VW = 900, VH = 480
  const NODE_W = 20
  const LEFT_X = 172   // x where source rects start
  const RIGHT_X = 708  // x where target rects start
  const PAD = 5

  const layout = useMemo(() => {
    if (!sourceNodes?.length || !targetNodes?.length || !links?.length) return null

    const srcBarUsable = VH - 40 - PAD * Math.max(sourceNodes.length - 1, 0)
    const tgtBarUsable = VH - 40 - PAD * Math.max(targetNodes.length - 1, 0)
    const totalSrc = sourceNodes.reduce((s, n) => s + n.value, 0) || 1
    const totalTgt = targetNodes.reduce((s, n) => s + n.value, 0) || 1

    // Source node positions
    const srcPos = {}
    let y = 20
    sourceNodes.forEach(node => {
      const h = Math.max(6, (node.value / totalSrc) * srcBarUsable)
      srcPos[node.id] = { y, h, cy: y + h / 2 }
      y += h + PAD
    })

    // Target node positions
    const tgtPos = {}
    y = 20
    targetNodes.forEach(node => {
      const h = Math.max(6, (node.value / totalTgt) * tgtBarUsable)
      tgtPos[node.id] = { y, h, cy: y + h / 2 }
      y += h + PAD
    })

    // Color map: source node → color index
    const srcColorIdx = {}
    sourceNodes.forEach((n, i) => { srcColorIdx[n.id] = i })

    // Stack offsets within each node
    const srcOff = {}
    const tgtOff = {}
    sourceNodes.forEach(n => { srcOff[n.id] = 0 })
    targetNodes.forEach(n => { tgtOff[n.id] = 0 })

    // Sort links: by source order, then value desc
    const srcOrder = Object.fromEntries(sourceNodes.map((n, i) => [n.id, i]))
    const sortedLinks = [...links].sort((a, b) =>
      (srcOrder[a.source] ?? 99) - (srcOrder[b.source] ?? 99) || b.value - a.value
    )

    const paths = sortedLinks.map((link, i) => {
      const src = srcPos[link.source]
      const tgt = tgtPos[link.target]
      if (!src || !tgt) return null

      const lhSrc = Math.max(1, (link.value / totalSrc) * srcBarUsable)
      const lhTgt = Math.max(1, (link.value / totalTgt) * tgtBarUsable)

      const sy0 = src.y + srcOff[link.source]
      const sy1 = sy0 + lhSrc
      const ty0 = tgt.y + tgtOff[link.target]
      const ty1 = ty0 + lhTgt

      srcOff[link.source] += lhSrc
      tgtOff[link.target] += lhTgt

      const midX = (LEFT_X + NODE_W + RIGHT_X) / 2
      const d = [
        `M ${LEFT_X + NODE_W} ${sy0}`,
        `C ${midX} ${sy0}, ${midX} ${ty0}, ${RIGHT_X} ${ty0}`,
        `L ${RIGHT_X} ${ty1}`,
        `C ${midX} ${ty1}, ${midX} ${sy1}, ${LEFT_X + NODE_W} ${sy1}`,
        'Z',
      ].join(' ')

      return { d, source: link.source, target: link.target, value: link.value, colorIdx: srcColorIdx[link.source] ?? 0, i }
    }).filter(Boolean)

    return { srcPos, tgtPos, paths, srcColorIdx }
  }, [sourceNodes, targetNodes, links])

  if (!layout) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">無資料</div>
  }

  const { srcPos, tgtPos, paths } = layout

  return (
    <div className="relative w-full h-full">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible' }}
      >
        {/* Flow paths */}
        {paths.map(p => (
          <path
            key={p.i}
            d={p.d}
            fill={COLORS[p.colorIdx % COLORS.length]}
            fillOpacity={hovered === p.i ? 0.65 : 0.22}
            style={{ cursor: 'pointer', transition: 'fill-opacity 0.12s' }}
            onMouseEnter={e => {
              setHovered(p.i)
              setTooltip({ x: e.clientX, y: e.clientY, src: p.source, tgt: p.target, val: p.value })
            }}
            onMouseLeave={() => { setHovered(null); setTooltip(null) }}
          />
        ))}

        {/* Source nodes + labels */}
        {sourceNodes.map((node, i) => {
          const pos = srcPos[node.id]
          if (!pos) return null
          const color = COLORS[i % COLORS.length]
          return (
            <g key={node.id}>
              <rect x={LEFT_X} y={pos.y} width={NODE_W} height={Math.max(pos.h, 6)} fill={color} rx={3} />
              <text x={LEFT_X - 10} y={pos.cy - 6} textAnchor="end" dominantBaseline="middle" fontSize={15} fill="#374151" fontWeight={700}>
                {trunc(node.id, 10)}
              </text>
              <text x={LEFT_X - 10} y={pos.cy + 8} textAnchor="end" dominantBaseline="middle" fontSize={13} fill="#9ca3af">
                {fmtV(node.value)}
              </text>
            </g>
          )
        })}

        {/* Target nodes + labels */}
        {targetNodes.map((node, i) => {
          const pos = tgtPos[node.id]
          if (!pos) return null
          const color = COLORS[i % COLORS.length]
          return (
            <g key={node.id}>
              <rect x={RIGHT_X} y={pos.y} width={NODE_W} height={Math.max(pos.h, 6)} fill={color} rx={3} />
              <text x={RIGHT_X + NODE_W + 10} y={pos.cy - 6} textAnchor="start" dominantBaseline="middle" fontSize={14} fill="#374151" fontWeight={700}>
                {trunc(node.id, 12)}
              </text>
              <text x={RIGHT_X + NODE_W + 10} y={pos.cy + 8} textAnchor="start" dominantBaseline="middle" fontSize={13} fill="#9ca3af">
                {fmtV(node.value)}
              </text>
            </g>
          )
        })}

        {/* Column headers */}
        <text x={LEFT_X + NODE_W / 2} y={9} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight={700}>
          {leftLabel}
        </text>
        <text x={RIGHT_X + NODE_W / 2} y={9} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight={700}>
          {rightLabel}
        </text>
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-xl px-3 py-2 pointer-events-none shadow-2xl"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          <div className="font-semibold">{trunc(tooltip.src, 14)} → {trunc(tooltip.tgt, 14)}</div>
          <div className="text-gray-300 mt-0.5">{fmtV(tooltip.val)}</div>
        </div>
      )}
    </div>
  )
}

// ── Tree (Architecture) View ─────────────────────────────────────────────────
function TreeView({ data }) {
  // data: [{ name, value, children: [{ name, value }] }]
  const [hoverId, setHoverId] = useState(null)

  const NODE_W = 114, NODE_H = 54
  const CHILD_W = 98, CHILD_H = 46
  const H_GAP = 10, V_GAP = 48

  const layout = useMemo(() => {
    if (!data?.length) return null

    const maxChildVal = data.flatMap(n => n.children || []).reduce((m, n) => Math.max(m, n.value), 0) || 1

    const level1 = [], level2 = [], lines = []
    let xOffset = 0

    data.forEach((chan, ci) => {
      const children = chan.children || []
      const subtreeW = Math.max(NODE_W, children.length * (CHILD_W + H_GAP) - H_GAP)
      const cx = xOffset + (subtreeW - NODE_W) / 2

      level1.push({ ...chan, x: cx, y: 0, ci })

      let childX = xOffset
      children.forEach((child, bi) => {
        level2.push({ ...child, x: childX, y: NODE_H + V_GAP, ci, bi, maxChildVal })
        lines.push({
          x1: cx + NODE_W / 2, y1: NODE_H,
          x2: childX + CHILD_W / 2, y2: NODE_H + V_GAP,
        })
        childX += CHILD_W + H_GAP
      })

      xOffset += subtreeW + H_GAP * 3
    })

    const totalW = Math.max(xOffset - H_GAP * 3 + H_GAP * 2, 400)
    const totalH = NODE_H + V_GAP + CHILD_H + 16

    return { level1, level2, lines, totalW, totalH }
  }, [data])

  if (!layout) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">無資料</div>

  const { level1, level2, lines, totalW, totalH } = layout

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-hidden">
      <svg
        viewBox={`-12 -12 ${totalW + 24} ${totalH + 24}`}
        width={Math.max(totalW + 24, 600)}
        height={totalH + 24}
        style={{ minWidth: '100%', display: 'block' }}
      >
        {/* Curved connectors */}
        {lines.map((l, i) => (
          <path
            key={i}
            d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + V_GAP * 0.55}, ${l.x2} ${l.y2 - V_GAP * 0.55}, ${l.x2} ${l.y2}`}
            fill="none"
            stroke="#d1d5db"
            strokeWidth={1.5}
          />
        ))}

        {/* Level 1: channel parent nodes */}
        {level1.map(node => {
          const color = COLORS[node.ci % COLORS.length]
          const isHov = hoverId === `p${node.ci}`
          return (
            <g key={node.ci}
              onMouseEnter={() => setHoverId(`p${node.ci}`)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: 'default' }}
            >
              {/* Shadow */}
              {isHov && (
                <rect x={node.x - 2} y={node.y + 3} width={NODE_W + 4} height={NODE_H} fill={color} rx={11} opacity={0.2} />
              )}
              <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} fill={color} rx={10} />
              {/* Top accent strip */}
              <rect x={node.x} y={node.y} width={NODE_W} height={6} fill="rgba(255,255,255,0.25)" rx={10} />
              <text x={node.x + NODE_W / 2} y={node.y + NODE_H / 2 - 7}
                textAnchor="middle" dominantBaseline="middle" fontSize={15} fill="white" fontWeight={700}>
                {trunc(node.name, 8)}
              </text>
              <text x={node.x + NODE_W / 2} y={node.y + NODE_H / 2 + 9}
                textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="rgba(255,255,255,0.82)">
                {fmtV(node.value)}
              </text>
            </g>
          )
        })}

        {/* Level 2: child nodes */}
        {level2.map(node => {
          const color = COLORS[node.ci % COLORS.length]
          const isHov = hoverId === `c${node.ci}-${node.bi}`
          const barW = Math.max(4, Math.round((node.value / node.maxChildVal) * (CHILD_W - 10)))
          return (
            <g key={`${node.ci}-${node.bi}`}
              onMouseEnter={() => setHoverId(`c${node.ci}-${node.bi}`)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: 'default' }}
            >
              <rect x={node.x} y={node.y} width={CHILD_W} height={CHILD_H}
                fill={color + '14'} rx={8}
                stroke={color} strokeWidth={isHov ? 2 : 1.5}
              />
              {/* Value bar at bottom */}
              <rect x={node.x + 5} y={node.y + CHILD_H - 7} width={barW} height={4}
                fill={color + '88'} rx={2} />
              <text x={node.x + CHILD_W / 2} y={node.y + 17}
                textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#374151" fontWeight={600}>
                {trunc(node.name, 8)}
              </text>
              <text x={node.x + CHILD_W / 2} y={node.y + 31}
                textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#6b7280">
                {fmtV(node.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Main FlowDiagram Component ─────────────────────────────────────────────────
export default function FlowDiagram({ flowData, structureData }) {
  const [view, setView] = useState('sankey1')

  const VIEWS = [
    { v: 'sankey1', l: '📊 通路→品牌', title: '通路 → 品牌 銷售流向' },
    { v: 'sankey2', l: '📊 品牌→產品', title: '品牌 → 產品 銷售流向' },
    { v: 'tree1',   l: '🌳 通路架構',  title: '通路 / 品牌 架構' },
    { v: 'tree2',   l: '🌳 品牌架構',  title: '品牌 / 產品 架構' },
  ]

  const currentView = VIEWS.find(t => t.v === view) || VIEWS[0]
  const hasData = !!(flowData || structureData)

  return (
    <ChartCard
      title="流程圖 & 架構圖"
      subtitle={currentView.title}
    >
      {expanded => (
        <div className="flex flex-col gap-3" style={{ height: expanded ? '100%' : undefined }}>
          {/* Sub-tab bar */}
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map(t => (
              <button
                key={t.v}
                onClick={() => setView(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === t.v
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>

          {/* Legend hint */}
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
            {view.startsWith('sankey')
              ? '路徑寬度代表銷售量；滑鼠懸停可查看詳細數值。'
              : '節點大小代表銷售佔比；底部色條代表相對業績。'}
          </p>

          {/* Chart area */}
          <div
            className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700"
            style={{ height: expanded ? 'calc(100% - 80px)' : 440 }}
          >
            {!hasData ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">請先上傳資料</div>
            ) : view === 'sankey1' ? (
              <div className="p-4 h-full">
                <SankeyView
                  sourceNodes={flowData?.channelToBrand?.sourceNodes || []}
                  targetNodes={flowData?.channelToBrand?.targetNodes || []}
                  links={flowData?.channelToBrand?.links || []}
                  leftLabel="通路類型"
                  rightLabel="品牌（前 12）"
                />
              </div>
            ) : view === 'sankey2' ? (
              <div className="p-4 h-full">
                <SankeyView
                  sourceNodes={flowData?.brandToProduct?.sourceNodes || []}
                  targetNodes={flowData?.brandToProduct?.targetNodes || []}
                  links={flowData?.brandToProduct?.links || []}
                  leftLabel="品牌（前 8）"
                  rightLabel="產品（前 12）"
                />
              </div>
            ) : view === 'tree1' ? (
              <div className="p-4 h-full">
                <TreeView data={structureData?.channelBrandTree || []} />
              </div>
            ) : (
              <div className="p-4 h-full">
                <TreeView data={structureData?.brandProductTree || []} />
              </div>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  )
}

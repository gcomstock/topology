import dagre from '@dagrejs/dagre'
import type { Topology, NodePosition } from '../types'
import { CELL } from '../scene/nodeShape'

export type LayoutMode = 'flow' | 'grouped'

export interface GroupAnchor {
  label: string
  x: number
  y: number
}

// Flow-ordering: layered DAG, left→right. Upstream (callers) on the left,
// downstream (callees) on the right. Edge source→target = caller→callee, so
// rankdir LR places sources left of targets. Computed once, then frozen.
//
// Dagre runs in GRID-CELL units (node = 3×3 cells, nodesep/ranksep in cells),
// then every node center is snapped to an integer cell so it rests cleanly on
// the GridField lattice (lines at k·CELL). Collisions are nudged apart so
// neighbours keep at least a one-cell gap.
const NODE_CELLS = 3
const NODESEP_CELLS = 2 // ≥1-cell gap between siblings
const RANKSEP_CELLS = 6

export function flowLayout(topo: Topology): Record<string, NodePosition> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'LR',
    nodesep: NODESEP_CELLS,
    ranksep: RANKSEP_CELLS,
    marginx: 1,
    marginy: 1,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const s of topo.services) g.setNode(s.id, { width: NODE_CELLS, height: NODE_CELLS })
  for (const e of topo.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  // Use ONLY dagre's rank (x) and within-rank ORDER (y) — not its absolute
  // coordinates, which balloon with dummy nodes from long cross-rank edges (a
  // 31-degree hub inflates the cross-axis to ~1800 units). Re-place each rank
  // compactly on the cell grid instead.
  const RANK_STRIDE = NODE_CELLS + RANKSEP_CELLS // cells between rank columns
  const ROW_STRIDE = NODE_CELLS + NODESEP_CELLS // cells between rows in a rank

  const expBy = expectedTrafficMap(topo)
  const ranks = new Map<number, string[]>()
  for (const s of topo.services) {
    const n = g.node(s.id)
    const rx = n ? Math.round(n.x) : 0
    if (!ranks.has(rx)) ranks.set(rx, [])
    ranks.get(rx)!.push(s.id)
  }
  const rankKeys = [...ranks.keys()].sort((a, b) => a - b)
  const centerCol = ((rankKeys.length - 1) * RANK_STRIDE) / 2

  const out: Record<string, NodePosition> = {}
  rankKeys.forEach((rk, ri) => {
    // Order each rank's rows by traffic so the tallest bars sit at the BACK
    // (low z = far from the camera) and don't occlude shorter ones in front.
    const members = [...ranks.get(rk)!].sort((a, b) => expBy[b] - expBy[a])
    const gx = ri * RANK_STRIDE - centerCol
    members.forEach((id, i) => {
      const gz = (i - (members.length - 1) / 2) * ROW_STRIDE
      out[id] = { x: gx * CELL, y: gz * CELL }
    })
  })
  return out
}

// expectedTraffic per service id (drives bar height + tall-in-back sort order).
function expectedTrafficMap(topo: Topology): Record<string, number> {
  const m: Record<string, number> = {}
  for (const s of topo.services) m[s.id] = s.expectedTraffic
  return m
}

// ---------------------------------------------------------------------------
// Grouped-by-team layout: each team is a fixed anchor on a circle; its services
// pack into a compact grid block at that anchor. Surfaces ownership clusters.
// Within a block the tallest-traffic services sit at the BACK rows so they don't
// occlude shorter ones. Computed once, then frozen.
const CLUSTER_STRIDE = 4 // cells between nodes within a cluster (3 footprint + 1 gap)

export function groupAnchorsFor(topo: Topology): GroupAnchor[] {
  const set = new Set<string>()
  for (const s of topo.services) set.add(s.team)
  const values = [...set].sort()
  const n = values.length
  const radius = Math.max(7, n * 1.8)
  return values.map((label, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2
    return { label, x: Math.cos(ang) * radius, y: Math.sin(ang) * radius }
  })
}

export function groupedLayout(
  topo: Topology,
): { positions: Record<string, NodePosition>; anchors: GroupAnchor[] } {
  const anchors = groupAnchorsFor(topo)
  const anchorBy = new Map(anchors.map((a) => [a.label, a]))
  const expBy = expectedTrafficMap(topo)

  // bucket services by their team's anchor cell
  const buckets = new Map<string, string[]>()
  for (const s of topo.services) {
    const a = anchorBy.get(s.team)!
    const gx = Math.round(a.x / CELL)
    const gz = Math.round(a.y / CELL)
    const key = `${gx},${gz}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(s.id)
  }

  // place each cluster as a compact block; resolve collisions on the global grid
  const taken = new Set<string>()
  const freeNear = (gx: number, gz: number): [number, number] => {
    if (!taken.has(`${gx},${gz}`)) return [gx, gz]
    for (let r = 1; r < 60; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue // ring only
          const k = `${gx + dx},${gz + dz}`
          if (!taken.has(k)) return [gx + dx, gz + dz]
        }
      }
    }
    return [gx, gz]
  }

  const positions: Record<string, NodePosition> = {}
  for (const key of [...buckets.keys()].sort()) {
    // Sort each block by traffic descending → tallest fill the back rows first.
    const ids = buckets.get(key)!.sort((a, b) => expBy[b] - expBy[a])
    const [bgx, bgz] = key.split(',').map(Number)
    const cols = Math.ceil(Math.sqrt(ids.length))
    const rows = Math.ceil(ids.length / cols)
    ids.forEach((id, i) => {
      const col = i % cols
      const row = Math.floor(i / cols) // row 0 = back (low z)
      const dgx = Math.round((col - (cols - 1) / 2) * CLUSTER_STRIDE)
      const dgz = Math.round((row - (rows - 1) / 2) * CLUSTER_STRIDE)
      const [gx, gz] = freeNear(bgx + dgx, bgz + dgz)
      taken.add(`${gx},${gz}`)
      positions[id] = { x: gx * CELL, y: gz * CELL }
    })
  }
  return { positions, anchors }
}

export function computeLayout(topo: Topology, mode: LayoutMode): Record<string, NodePosition> {
  if (mode === 'grouped') return groupedLayout(topo).positions
  return flowLayout(topo)
}

// Bounds of a layout (for sizing the terrain and framing the camera).
export function layoutBounds(positions: Record<string, NodePosition>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of Object.values(positions)) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  if (!isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1, w: 2, h: 2 }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY }
}

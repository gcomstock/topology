import dagre from '@dagrejs/dagre'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Topology, NodePosition } from '../types'
import { CELL } from '../scene/nodeShape'

export type LayoutMode = 'layered' | 'flow' | 'organic' | 'grouped'
export type GroupAttr = 'team' | 'region' | 'datastore'

export interface GroupAnchor {
  label: string
  x: number
  y: number
}

const ORGANIC_SCALE = 0.09

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

  const ranks = new Map<number, { id: string; y: number }[]>()
  for (const s of topo.services) {
    const n = g.node(s.id)
    const rx = n ? Math.round(n.x) : 0
    if (!ranks.has(rx)) ranks.set(rx, [])
    ranks.get(rx)!.push({ id: s.id, y: n ? n.y : 0 })
  }
  const rankKeys = [...ranks.keys()].sort((a, b) => a - b)
  const centerCol = ((rankKeys.length - 1) * RANK_STRIDE) / 2

  const out: Record<string, NodePosition> = {}
  rankKeys.forEach((rk, ri) => {
    const members = ranks.get(rk)!.sort((a, b) => a.y - b.y)
    const gx = ri * RANK_STRIDE - centerCol
    members.forEach((m, i) => {
      const gz = (i - (members.length - 1) / 2) * ROW_STRIDE
      out[m.id] = { x: gx * CELL, y: gz * CELL }
    })
  })
  return out
}

interface SimNode extends SimulationNodeDatum {
  id: string
  layer: number
}

// Organic clusters: force-directed grouping by connectivity. Computed once,
// then frozen. We run the simulation synchronously to convergence.
export function organicLayout(topo: Topology): Record<string, NodePosition> {
  const nodes: SimNode[] = topo.services.map((s) => ({ id: s.id, layer: s.layer }))
  const links = topo.edges
    .filter((e) => topo.services.some((s) => s.id === e.source) && topo.services.some((s) => s.id === e.target))
    .map((e) => ({ source: e.source, target: e.target }))

  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d: any) => d.id).distance(14).strength(0.4))
    .force('charge', forceManyBody().strength(-60))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(6))
    .stop()

  for (let i = 0; i < 400; i++) sim.tick()

  const out: Record<string, NodePosition> = {}
  for (const n of nodes) {
    out[n.id] = { x: (n.x ?? 0) * ORGANIC_SCALE, y: (n.y ?? 0) * ORGANIC_SCALE }
  }
  return out
}

// Layered layout: altitude (world Y) = dependency layer, so requests flow
// downward and hop-count is read by COUNTING layers, not measuring distance.
// Each layer is a horizontal X–Z shelf; within a shelf nodes are grid-placed and
// barycenter-ordered so connected nodes align across layers (short, mostly
// vertical edges). Computed once, then frozen.
const LAYER_GAP = 5.4 // world-Y between adjacent layers (clear floor separation)
const SPACING_X = 3.4
const SPACING_Z = 3.2

export function layeredLayout(topo: Topology): Record<string, NodePosition> {
  // undirected neighbor map for barycenter alignment
  const nbr: Record<string, string[]> = {}
  for (const s of topo.services) nbr[s.id] = []
  for (const e of topo.edges) {
    if (nbr[e.source] && nbr[e.target]) {
      nbr[e.source].push(e.target)
      nbr[e.target].push(e.source)
    }
  }

  // bucket by layer
  const byLayer = new Map<number, string[]>()
  let maxLayer = 0
  for (const s of topo.services) {
    maxLayer = Math.max(maxLayer, s.layer)
    if (!byLayer.has(s.layer)) byLayer.set(s.layer, [])
    byLayer.get(s.layer)!.push(s.id)
  }
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b)

  const pos: Record<string, NodePosition> = {}

  // Assign grid positions (X,Z) for an ordered list of ids within one layer,
  // centered on the origin. Wide layers wrap into a second Z row.
  const placeLayer = (ids: string[], elev: number) => {
    const n = ids.length
    // Wide, SHALLOW floors (1–2 Z-rows) so stacked layers separate cleanly in
    // isometric instead of interleaving, while keeping a little floor depth.
    const rows = n <= 6 ? 1 : 2
    const cols = Math.ceil(n / rows)
    ids.forEach((id, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      const rowCount = Math.min(cols, n - row * cols) // nodes in this row
      const x = (col - (rowCount - 1) / 2) * SPACING_X
      const z = (row - (rows - 1) / 2) * SPACING_Z
      pos[id] = { x, y: z, elev }
    })
  }

  // initial placement: hubs (high inDegree) toward the center of each shelf
  const inDeg: Record<string, number> = {}
  for (const s of topo.services) inDeg[s.id] = s.inDegree
  for (const L of layerKeys) {
    const ids = [...byLayer.get(L)!].sort((a, b) => inDeg[b] - inDeg[a])
    placeLayer(centerHubs(ids), elevFor(L, maxLayer))
  }

  // barycenter sweeps: order each shelf by mean neighbor X, re-place.
  for (let sweep = 0; sweep < 6; sweep++) {
    const order = sweep % 2 === 0 ? layerKeys : [...layerKeys].reverse()
    for (const L of order) {
      const ids = byLayer.get(L)!
      const bx: Record<string, number> = {}
      for (const id of ids) {
        const ns = nbr[id]
        if (ns.length) {
          let sum = 0
          for (const m of ns) sum += pos[m]?.x ?? 0
          bx[id] = sum / ns.length
        } else {
          bx[id] = pos[id]?.x ?? 0
        }
      }
      const sorted = [...ids].sort((a, b) => bx[a] - bx[b])
      placeLayer(sorted, elevFor(L, maxLayer))
    }
  }

  return pos
}

// Edge services (layer 0) ride on top; deepest layer rests near the ground.
function elevFor(layer: number, maxLayer: number): number {
  return (maxLayer - layer) * LAYER_GAP
}

// Reorder so the highest-degree nodes sit in the middle of the row (visually
// anchoring hubs centrally) rather than at one end.
function centerHubs(idsByDegreeDesc: string[]): string[] {
  const out: string[] = []
  idsByDegreeDesc.forEach((id, i) => {
    if (i % 2 === 0) out.push(id)
    else out.unshift(id)
  })
  return out
}

// ---------------------------------------------------------------------------
// Grouped (attribute-anchored) layout: each attribute value is a fixed anchor on
// a circle; a service sits at the mean of its values' anchors. Multi-valued
// attributes (a service in two regions) land between anchors; services sharing
// the same value-set cluster together — surfacing shared-substrate correlation
// the call graph can't show. Computed once, then frozen.
const CLUSTER_STRIDE = 4 // cells between nodes within a cluster (3 footprint + 1 gap)

function valuesFor(s: Topology['services'][number], attr: GroupAttr): string[] {
  if (attr === 'team') return [s.team]
  const arr = attr === 'region' ? s.regions : s.datastores
  return arr.length ? arr : ['—']
}

export function groupAnchorsFor(topo: Topology, groupBy: GroupAttr): GroupAnchor[] {
  const set = new Set<string>()
  for (const s of topo.services) for (const v of valuesFor(s, groupBy)) set.add(v)
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
  groupBy: GroupAttr,
): { positions: Record<string, NodePosition>; anchors: GroupAnchor[] } {
  const anchors = groupAnchorsFor(topo, groupBy)
  const anchorBy = new Map(anchors.map((a) => [a.label, a]))

  // bucket services by their snapped centroid cell
  const buckets = new Map<string, string[]>()
  for (const s of topo.services) {
    const vals = valuesFor(s, groupBy)
    let sx = 0
    let sy = 0
    for (const v of vals) {
      const a = anchorBy.get(v)!
      sx += a.x
      sy += a.y
    }
    const gx = Math.round(sx / vals.length / CELL)
    const gz = Math.round(sy / vals.length / CELL)
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
    const ids = buckets.get(key)!.sort()
    const [bgx, bgz] = key.split(',').map(Number)
    const cols = Math.ceil(Math.sqrt(ids.length))
    ids.forEach((id, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const dgx = Math.round((col - (cols - 1) / 2) * CLUSTER_STRIDE)
      const dgz = Math.round((row - (Math.ceil(ids.length / cols) - 1) / 2) * CLUSTER_STRIDE)
      const [gx, gz] = freeNear(bgx + dgx, bgz + dgz)
      taken.add(`${gx},${gz}`)
      positions[id] = { x: gx * CELL, y: gz * CELL }
    })
  }
  return { positions, anchors }
}

export function computeLayout(
  topo: Topology,
  mode: LayoutMode,
  groupBy: GroupAttr = 'team',
): Record<string, NodePosition> {
  if (mode === 'layered') return layeredLayout(topo)
  if (mode === 'flow') return flowLayout(topo)
  if (mode === 'grouped') return groupedLayout(topo, groupBy).positions
  return organicLayout(topo)
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

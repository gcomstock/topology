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

export type LayoutMode = 'layered' | 'flow' | 'organic'

// World-space scale. Dagre emits pixel-ish coordinates; we scale down to a
// comfortable Three.js world size and center on the origin.
const FLOW_SCALE = 0.018
const ORGANIC_SCALE = 0.09

// Flow-ordering: layered DAG, left→right. Upstream (callers) on the left,
// downstream (callees) on the right. Edge source→target = caller→callee, so
// rankdir LR places sources left of targets. Computed once, then frozen.
export function flowLayout(topo: Topology): Record<string, NodePosition> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const s of topo.services) {
    g.setNode(s.id, { width: 40, height: 40 })
  }
  for (const e of topo.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  // Center the graph on origin.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const s of topo.services) {
    const n = g.node(s.id)
    if (!n) continue
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const out: Record<string, NodePosition> = {}
  for (const s of topo.services) {
    const n = g.node(s.id)
    if (!n) { out[s.id] = { x: 0, y: 0 }; continue }
    out[s.id] = { x: (n.x - cx) * FLOW_SCALE, y: (n.y - cy) * FLOW_SCALE }
  }
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

export function computeLayout(topo: Topology, mode: LayoutMode): Record<string, NodePosition> {
  if (mode === 'layered') return layeredLayout(topo)
  if (mode === 'flow') return flowLayout(topo)
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

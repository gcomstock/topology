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

export type LayoutMode = 'flow' | 'organic'

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

export function computeLayout(topo: Topology, mode: LayoutMode): Record<string, NodePosition> {
  return mode === 'flow' ? flowLayout(topo) : organicLayout(topo)
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

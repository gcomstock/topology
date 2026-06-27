import type { Topology, Timeseries } from '../types'
import { sampleAt } from './timeseries'

// Adjacency built from edges. "downstream" = services this one calls (callees);
// "upstream" = services that call this one (callers).
export interface GraphIndex {
  downstream: Record<string, string[]> // source -> [targets]
  upstream: Record<string, string[]> // target -> [sources]
  edgeBySrcTgt: Record<string, string> // `${src}->${tgt}` -> edgeId
}

export function buildGraphIndex(topo: Topology): GraphIndex {
  const downstream: Record<string, string[]> = {}
  const upstream: Record<string, string[]> = {}
  const edgeBySrcTgt: Record<string, string> = {}
  for (const s of topo.services) {
    downstream[s.id] = downstream[s.id] || []
    upstream[s.id] = upstream[s.id] || []
  }
  for (const e of topo.edges) {
    ;(downstream[e.source] ||= []).push(e.target)
    ;(upstream[e.target] ||= []).push(e.source)
    edgeBySrcTgt[`${e.source}->${e.target}`] = e.id
  }
  return { downstream, upstream, edgeBySrcTgt }
}

// Blast radius: if `serviceId` degrades, which services are affected?
// Failure propagates to CALLERS (a callee going down breaks its callers), so we
// traverse the upstream direction. Returns the affected set (excluding self) with
// hop distance.
export function blastRadius(
  graph: GraphIndex,
  serviceId: string,
  maxHops = 6,
): Map<string, number> {
  const result = new Map<string, number>()
  let frontier = [serviceId]
  let hop = 0
  const seen = new Set([serviceId])
  while (frontier.length && hop < maxHops) {
    hop++
    const next: string[] = []
    for (const id of frontier) {
      for (const caller of graph.upstream[id] || []) {
        if (!seen.has(caller)) {
          seen.add(caller)
          result.set(caller, hop)
          next.push(caller)
        }
      }
    }
    frontier = next
  }
  return result
}

export interface PriorityEntry {
  serviceId: string
  score: number
  criticality: number
  fastBurn: number
  blast: number
}

// priority ≈ criticality × fastBurnRate × blastRadius, at the current clock.
// Fixed formula, org-wide (spec §5). criticality blends tier and inDegree.
export function computePriority(
  topo: Topology,
  ts: Timeseries,
  graph: GraphIndex,
  clock: number,
): PriorityEntry[] {
  const out: PriorityEntry[] = []
  for (const s of topo.services) {
    const criticality = s.tier + s.inDegree / 8 // tier dominates; inDegree refines
    const fastBurn = sampleAt(ts.perService[s.id]?.burnFast, clock)
    const blast = blastRadius(graph, s.id).size + 1 // +1 so leaves aren't zeroed
    const score = criticality * fastBurn * Math.sqrt(blast)
    out.push({ serviceId: s.id, score, criticality, fastBurn, blast })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

import type { Topology } from '../types'

// The third dimension encodes RELATIVE traffic. A log map compresses the huge
// dynamic range (smallest ↔ largest can be ~500×) into a capped height range so
// the tallest bar is only a few× the shortest — "6× tall might be 100s× traffic".
export interface TrafficDomain {
  logMin: number
  logMax: number
}

const MIN_H = 0.3 // world height of the smallest-traffic bar (always visible)
const MAX_H = 3.0 // world height of the largest-traffic bar (the cap)
const GRAY_BELOW = 100 // exclude tiny "no data" services from the height domain

export function trafficDomain(topo: Topology): TrafficDomain {
  let min = Infinity
  let max = -Infinity
  for (const s of topo.services) {
    const v = s.expectedTraffic
    if (v < GRAY_BELOW) continue // don't let the gray outliers compress the scale
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!isFinite(min)) return { logMin: 0, logMax: 1 }
  return { logMin: Math.log(min), logMax: Math.log(Math.max(max, min * Math.E)) }
}

// Map a traffic value to a bar height within [MIN_H, MAX_H]. Values above the
// domain max (e.g. a flash-sale spike beyond any baseline) are allowed to exceed
// MAX_H a little so spikes still visibly poke out, but are softly capped.
export function trafficToHeight(value: number, d: TrafficDomain): number {
  const v = Math.max(1, value)
  const span = d.logMax - d.logMin || 1
  const t = (Math.log(v) - d.logMin) / span // 0..1 across the baseline domain
  const h = MIN_H + Math.max(0, t) * (MAX_H - MIN_H)
  // soft-cap overshoot (t>1) so a 3× spike reads as "above" without towering
  return t > 1 ? MAX_H + (h - MAX_H) * 0.45 : h
}

export { MIN_H, MAX_H }

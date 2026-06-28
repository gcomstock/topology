import { sampleAt } from '../lib/timeseries'
import { trafficToHeight, type TrafficDomain } from '../lib/traffic'
import type { ServiceSeries } from '../types'

// Grid cell size. A node's footprint is 3×3 cells, so the base width is 3·CELL.
// Layout positions snap to this grid so everything rests on it cleanly.
export const CELL = 0.34
export const BASE_W = CELL * 3

// Criticality is read as 3 levels. The data's 4 tiers collapse:
//   tier 4 → T0 (critical) · tier 3 → T1 (important) · tier 1–2 → T2 (non-critical).
export function tierLabel(tier: number): string {
  if (tier >= 4) return 'T0'
  if (tier === 3) return 'T1'
  return 'T2'
}

export function tierMeaning(tier: number): string {
  const t = tierLabel(tier)
  return t === 'T0' ? 'critical' : t === 'T1' ? 'important' : 'non-critical'
}

// Current bar height (world units) from live traffic at the clock. Shared so
// labels / bubbles can float at the top of the animating bar.
export function barHeight(
  series: ServiceSeries | undefined,
  clock: number,
  domain: TrafficDomain,
): number {
  const traffic = sampleAt(series?.golden.traffic, clock)
  return trafficToHeight(traffic, domain)
}

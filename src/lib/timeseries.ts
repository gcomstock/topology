import type { Timeseries } from '../types'

// The global clock is a fractional index into timeseries.timestamps:
//   t = 0          → first slice
//   t = N-1        → last slice (the "live" edge)
// Fractional values interpolate between adjacent slices for smooth scrubbing.

export function timestampsToMs(timestamps: string[]): number[] {
  return timestamps.map((s) => Date.parse(s))
}

// Convert an absolute ms time to a fractional clock index.
export function msToClock(ms: number, tsMs: number[]): number {
  if (ms <= tsMs[0]) return 0
  const last = tsMs.length - 1
  if (ms >= tsMs[last]) return last
  // binary search for the bracketing pair
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (tsMs[mid] <= ms) lo = mid
    else hi = mid
  }
  const span = tsMs[hi] - tsMs[lo]
  const frac = span > 0 ? (ms - tsMs[lo]) / span : 0
  return lo + frac
}

// Convert a fractional clock index back to absolute ms.
export function clockToMs(clock: number, tsMs: number[]): number {
  const last = tsMs.length - 1
  const c = Math.max(0, Math.min(last, clock))
  const lo = Math.floor(c)
  if (lo >= last) return tsMs[last]
  const frac = c - lo
  return tsMs[lo] + frac * (tsMs[lo + 1] - tsMs[lo])
}

// Sample a numeric series at a fractional clock index (linear interpolation).
export function sampleAt(series: number[] | undefined, clock: number): number {
  if (!series || series.length === 0) return 0
  const last = series.length - 1
  const c = Math.max(0, Math.min(last, clock))
  const lo = Math.floor(c)
  if (lo >= last) return series[last]
  const frac = c - lo
  const a = series[lo]
  const b = series[lo + 1]
  return a + frac * (b - a)
}

// Nearest integer index (for discrete reads like sampleCount).
export function nearestIndex(clock: number, length: number): number {
  return Math.max(0, Math.min(length - 1, Math.round(clock)))
}

// Aggregate node burn-height = MAX across per-SLO burn series (spec §11.2 note),
// falling back to burnFast/burnSlow. We return both components so terrain can
// shape acute (sharp) vs chronic (broad) kernels separately.
export function nodeBurn(
  ts: Timeseries,
  serviceId: string,
  clock: number,
): { fast: number; slow: number } {
  const s = ts.perService[serviceId]
  if (!s) return { fast: 0, slow: 0 }
  return {
    fast: sampleAt(s.burnFast, clock),
    slow: sampleAt(s.burnSlow, clock),
  }
}

export function serviceHealth(ts: Timeseries, serviceId: string, clock: number): number {
  const s = ts.perService[serviceId]
  if (!s) return 1
  return sampleAt(s.health, clock)
}

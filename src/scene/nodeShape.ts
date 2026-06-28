// Shared node-geometry constants so pyramids, labels, and event bubbles agree
// on how tall a node is.

export const STEP_H = 0.32
export const BASE_W = 0.95

// Criticality is read as 3 levels (the common Tier-0 / Tier-1 / Tier-2 scheme),
// so the data's 4 tiers collapse to 1–3 stacked steps:
//   tier 4 (critical) → 3 steps · tier 3 (important) → 2 · tier 1–2 → 1.
export function critSteps(tier: number): number {
  if (tier >= 4) return 3
  if (tier === 3) return 2
  return 1
}

export function nodeHeight(tier: number): number {
  return critSteps(tier) * STEP_H
}

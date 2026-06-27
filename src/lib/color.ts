import { Color } from 'three'
import type { Theme } from '../theme'

// Map a 0..1 health value to a green→amber→red color (1 = healthy/green).
// Returns a THREE.Color so it can drive materials directly.
export function healthColor(health: number, theme: Theme): Color {
  const good = new Color(theme.healthGood)
  const mid = new Color(theme.healthMid)
  const bad = new Color(theme.healthBad)
  const h = Math.max(0, Math.min(1, health))
  // 1.0 → good, 0.5 → mid, 0.0 → bad
  if (h >= 0.5) {
    return mid.clone().lerp(good, (h - 0.5) / 0.5)
  }
  return bad.clone().lerp(mid, h / 0.5)
}

// Same ramp but keyed by burn severity (0 = calm/green, higher = worse/red).
// burn is unbounded-ish; clamp to a reference max for the ramp.
export function burnColor(burn: number, theme: Theme, refMax = 4): Color {
  const t = Math.max(0, Math.min(1, burn / refMax))
  return healthColor(1 - t, theme)
}

// CSS hex string version for DOM usage.
export function healthColorHex(health: number, theme: Theme): string {
  return '#' + healthColor(health, theme).getHexString()
}

export function burnColorHex(burn: number, theme: Theme, refMax = 4): string {
  return '#' + burnColor(burn, theme, refMax).getHexString()
}

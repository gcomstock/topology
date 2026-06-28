// Synthetic per-instance detail, derived deterministically from the service +
// region + index (no backing data needed). Each replica becomes a discrete,
// clickable "instance" with an id, version, uptime, and status.

export type InstanceStatus = 'up' | 'rebooting' | 'down'

export interface Instance {
  id: string
  region: string
  index: number
  status: InstanceStatus
  version: string
  uptimeHours: number
}

function hash01(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const HEX = '0123456789abcdef'
function hex(str: string, n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += HEX[Math.floor(hash01(str + i) * 16)]
  return out
}

// health (0..1) drives how many instances are unhealthy: the sicker the service,
// the more rebooting/down instances.
export function instancesFor(
  serviceId: string,
  region: string,
  count: number,
  health: number,
  liveVersion = 'v412',
): Instance[] {
  const badFrac = Math.max(0, 1 - health)
  const out: Instance[] = []
  for (let i = 0; i < count; i++) {
    const seed = `${serviceId}|${region}|${i}`
    const roll = hash01(seed)
    let status: InstanceStatus = 'up'
    if (roll < badFrac * 0.55) status = 'down'
    else if (roll < badFrac) status = 'rebooting'
    out.push({
      id: `i-0${hex(seed, 11)}`,
      region,
      index: i,
      status,
      version: hash01(seed + 'v') < 0.15 ? 'v411' : liveVersion,
      uptimeHours:
        status === 'rebooting'
          ? Math.round(hash01(seed + 'u') * 0.4 * 10) / 10
          : Math.round((6 + hash01(seed + 'u') * 480) * 10) / 10,
    })
  }
  return out
}

export function fmtUptime(hours: number): string {
  if (hours < 1) return Math.round(hours * 60) + 'm'
  if (hours < 48) return hours.toFixed(1).replace(/\.0$/, '') + 'h'
  return Math.round(hours / 24) + 'd'
}

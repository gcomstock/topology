export function fmtTime(ms: number): string {
  const d = new Date(ms)
  return d.toISOString().slice(11, 16) + ' UTC'
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

export function fmtAgo(fromMs: number, nowMs: number): string {
  const s = Math.round((nowMs - fromMs) / 1000)
  if (s < 0) return 'in ' + fmtAgo(nowMs, fromMs).replace(' ago', '')
  if (s < 90) return s + 's ago'
  const m = Math.round(s / 60)
  if (m < 90) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 36) return h + 'h ago'
  return Math.round(h / 24) + 'd ago'
}

export function fmtNum(n: number, digits = 0): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k'
  return n.toFixed(digits)
}

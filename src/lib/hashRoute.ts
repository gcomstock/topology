// Hash-based routing (GitHub Pages safe). Encodes shareable app state.
//   #/service/{id}?t={iso}      — focus a service at a moment (past, not live)
//   #/compare?ids={a,b,c}&t={iso}
//   #/                          — overview / cold start (live)

export interface RouteState {
  view: 'overview' | 'service' | 'compare'
  serviceId?: string
  compareIds?: string[]
  t?: string // ISO timestamp; presence => playhead at that moment (past)
}

export function parseHash(hash: string): RouteState {
  const h = hash.replace(/^#/, '')
  const [path, query] = h.split('?')
  const params = new URLSearchParams(query || '')
  const t = params.get('t') || undefined

  const segs = path.split('/').filter(Boolean) // e.g. ["service", "svc-x"]

  if (segs[0] === 'service' && segs[1]) {
    return { view: 'service', serviceId: decodeURIComponent(segs[1]), t }
  }
  if (segs[0] === 'compare') {
    const ids = (params.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return { view: 'compare', compareIds: ids, t }
  }
  return { view: 'overview', t }
}

export function buildHash(state: RouteState): string {
  const q = new URLSearchParams()
  if (state.t) q.set('t', state.t)
  if (state.view === 'service' && state.serviceId) {
    const qs = q.toString()
    return `#/service/${encodeURIComponent(state.serviceId)}${qs ? '?' + qs : ''}`
  }
  if (state.view === 'compare') {
    if (state.compareIds?.length) q.set('ids', state.compareIds.join(','))
    const qs = q.toString()
    return `#/compare${qs ? '?' + qs : ''}`
  }
  const qs = q.toString()
  return `#/${qs ? '?' + qs : ''}`
}

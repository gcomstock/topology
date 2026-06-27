import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { parseHash, buildHash, type RouteState } from '../lib/hashRoute'
import { clockToMs } from '../lib/timeseries'

// Two-way sync between the URL hash and app state. A deep link with ?t= sets the
// playhead to that moment (the past), dropping the responder in at the problem.
export function useHashSync(ready: boolean) {
  const applyingFromHash = useRef(false)

  // hash -> state
  useEffect(() => {
    if (!ready) return
    const apply = () => {
      const s = useStore.getState()
      const r = parseHash(window.location.hash)
      applyingFromHash.current = true
      if (r.t) s.setClockFromIso(r.t)
      else s.goLive()

      if (r.view === 'service' && r.serviceId) {
        s.exitCompare()
        s.select(r.serviceId)
      } else if (r.view === 'compare' && r.compareIds?.length) {
        s.select(null)
        s.setCompareIds(r.compareIds)
        if (r.compareIds.length >= 2) {
          useStore.setState({ compareMode: 'committed' })
        }
      } else {
        s.select(null)
        s.exitCompare()
      }
      setTimeout(() => (applyingFromHash.current = false), 0)
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [ready])

  // state -> hash
  useEffect(() => {
    if (!ready) return
    const unsub = useStore.subscribe((s) => {
      if (applyingFromHash.current) return
      const tIso = s.live
        ? undefined
        : new Date(clockToMs(s.clock, s.tsMs)).toISOString()

      let route: RouteState
      if (s.compareMode === 'committed') {
        route = { view: 'compare', compareIds: s.compareIds, t: tIso }
      } else if (s.selectedId) {
        route = { view: 'service', serviceId: s.selectedId, t: tIso }
      } else {
        route = { view: 'overview', t: tIso }
      }
      const next = buildHash(route)
      if (next !== window.location.hash) {
        history.replaceState(null, '', next)
      }
    })
    return unsub
  }, [ready])
}

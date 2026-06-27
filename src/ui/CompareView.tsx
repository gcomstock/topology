import { useMemo } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColorHex } from '../lib/color'
import { msToClock } from '../lib/timeseries'
import { fmtDateTime } from './format'
import type { Service } from '../types'

// Analyze topological relationship of the selected set.
function analyzeTopology(ids: string[], edges: { source: string; target: string }[]) {
  const set = new Set(ids)
  const adj: Record<string, Set<string>> = {}
  for (const id of ids) adj[id] = new Set()
  for (const e of edges) {
    if (set.has(e.source) && set.has(e.target)) {
      adj[e.source].add(e.target)
      adj[e.target].add(e.source)
    }
  }
  // connectivity via BFS
  const seen = new Set<string>([ids[0]])
  const q = [ids[0]]
  while (q.length) {
    const cur = q.shift()!
    for (const n of adj[cur]) if (!seen.has(n)) { seen.add(n); q.push(n) }
  }
  const connected = seen.size === ids.length
  return { connected }
}

function intersectAll(lists: string[][]): string[] {
  if (lists.length === 0) return []
  return lists.reduce((acc, l) => acc.filter((x) => l.includes(x)))
}

export function CompareView() {
  const data = useStore((s) => s.data)!
  const compareIds = useStore((s) => s.compareIds)
  const exit = useStore((s) => s.exitCompare)
  const clock = useStore((s) => s.clock)
  const lastIndex = useStore((s) => s.lastIndex)
  const tsMs = useStore((s) => s.tsMs)
  const setClock = useStore((s) => s.setClock)
  const theme = useTheme()

  const byId = Object.fromEntries(data.topology.services.map((s) => [s.id, s])) as Record<string, Service>
  const services = compareIds.map((id) => byId[id]).filter(Boolean)

  const topo = useMemo(
    () => analyzeTopology(compareIds, data.topology.edges),
    [compareIds, data.topology.edges],
  )

  const sharedRegions = intersectAll(services.map((s) => s.regions))
  const sharedDatastores = intersectAll(services.map((s) => s.datastores))
  const sharedDeps = intersectAll(services.map((s) => s.dependsOn))

  const VB_W = 600
  const cursorX = (clock / lastIndex) * VB_W

  const events = data.events.events.filter((e) => compareIds.includes(e.serviceId))

  return (
    <div className="compare-view">
      <div className="chd">
        <strong>Comparison</strong>
        <span className="subtle" style={{ fontSize: 11 }}>{compareIds.length} services · shared playhead</span>
        <div style={{ flex: 1 }} />
        <button onClick={exit}>✕ close</button>
      </div>

      <div className="cbody">
        {/* 1. Aligned multi-service health timeline (the spine) */}
        <div className="section">
          <div className="sh">aligned health timeline — onset stagger</div>
          <div className="timeline">
            {services.map((svc) => {
              const series = data.timeseries.perService[svc.id]
              const health = series?.health ?? []
              return (
                <div className="tl-row" key={svc.id}>
                  <div className="nm" title={svc.name}>{svc.name}</div>
                  <div className="lane">
                    <svg
                      viewBox={`0 0 ${VB_W} 22`}
                      width="100%"
                      height="22"
                      preserveAspectRatio="none"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect()
                        const frac = (e.clientX - rect.left) / rect.width
                        setClock(frac * lastIndex)
                      }}
                    >
                      {health.map((h, i) => {
                        const x = (i / (health.length - 1)) * VB_W
                        const w = VB_W / health.length + 0.5
                        return <rect key={i} x={x} y={0} width={w} height={22} fill={healthColorHex(h, theme)} opacity={0.9} />
                      })}
                      {/* 2. change/deploy markers on this lane */}
                      {events
                        .filter((ev) => ev.serviceId === svc.id)
                        .map((ev) => {
                          const c = msToClock(Date.parse(ev.timestamp), tsMs)
                          const x = (c / lastIndex) * VB_W
                          return <line key={ev.id} x1={x} x2={x} y1={0} y2={22} stroke={theme.textPrimary} strokeWidth={1.5} strokeDasharray="2 1" />
                        })}
                    </svg>
                  </div>
                </div>
              )
            })}
            <div className="subtle" style={{ fontSize: 10, marginTop: 4 }}>
              playhead: {fmtDateTime(tsMs.length ? (clock / lastIndex) * (tsMs[lastIndex] - tsMs[0]) + tsMs[0] : 0)} · click a lane to move it
            </div>
          </div>
        </div>

        {/* 3. Topological relationship */}
        <div className="section">
          <div className="sh">topological relationship</div>
          <div className="topo-rel">
            {topo.connected ? (
              <div>These services <strong>share a dependency path</strong> — likely a propagating failure along edges.</div>
            ) : (
              <>
                <div>These services are <strong>disconnected</strong> in the dependency graph.</div>
                <div className="hint">
                  ⚠ No dependency path links them — look for a common substrate:
                  {sharedRegions.length ? ` region (${sharedRegions.join(', ')})` : ''}
                  {sharedDatastores.length ? ` · datastore (${sharedDatastores.join(', ')})` : ''}
                  {!sharedRegions.length && !sharedDatastores.length ? ' a shared region, datastore, or deploy target.' : '.'}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 5. Computed shared dependencies / infra */}
        <div className="section">
          <div className="sh">computed shared infra</div>
          <div className="kv">
            <div className="k">shared regions</div>
            <div className="v">{sharedRegions.length ? sharedRegions.join(', ') : <span className="faint">none</span>}</div>
            <div className="k">shared datastores</div>
            <div className="v">{sharedDatastores.length ? sharedDatastores.join(', ') : <span className="faint">none</span>}</div>
            <div className="k">shared dependencies</div>
            <div className="v">{sharedDeps.length ? sharedDeps.map((d) => byId[d]?.name ?? d).join(', ') : <span className="faint">none</span>}</div>
          </div>
        </div>

        {/* 4. side-by-side golden signals (compact) */}
        <div className="section">
          <div className="sh">side-by-side signals (now)</div>
          <div className="kv" style={{ gridTemplateColumns: `120px repeat(${services.length}, 1fr)` }}>
            <div className="k" />
            {services.map((s) => <div className="v" key={s.id} style={{ fontWeight: 600 }}>{s.name.replace(/-.*/, '')}</div>)}
            {(['latencyP99', 'errorRate', 'saturation'] as const).map((sig) => (
              <div style={{ display: 'contents' }} key={sig}>
                <div className="k">{sig}</div>
                {services.map((s) => {
                  const arr = data.timeseries.perService[s.id]?.golden[sig] ?? []
                  const idx = Math.round(clock)
                  const v = arr[Math.max(0, Math.min(arr.length - 1, idx))] ?? 0
                  const disp = sig === 'latencyP99' ? `${v.toFixed(0)}ms` : `${(v * 100).toFixed(1)}%`
                  return <div className="v" key={s.id}>{disp}</div>
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="faint" style={{ fontSize: 10 }}>
          Shareable URL is in the address bar (#/compare?ids=…). The timeline and topology share the global playhead.
        </div>
      </div>
    </div>
  )
}

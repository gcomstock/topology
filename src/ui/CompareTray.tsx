import { useStore } from '../store'
import { sampleAt } from '../lib/timeseries'

// Multi-select staging mode: topology-dominant, minimal chrome, running tray of
// picked services + smart-seeded suggestions. Comparison surface is suspended
// until commit (spec §9).
export function CompareTray() {
  const data = useStore((s) => s.data)!
  const compareIds = useStore((s) => s.compareIds)
  const toggle = useStore((s) => s.toggleCompareId)
  const commit = useStore((s) => s.commitCompare)
  const exit = useStore((s) => s.exitCompare)
  const clock = useStore((s) => s.clock)
  const graph = useStore((s) => s.graph)!
  const setCompareIds = useStore((s) => s.setCompareIds)

  const byId = Object.fromEntries(data.topology.services.map((s) => [s.id, s]))

  // Smart seed: unhealthy neighbors of the first picked service.
  const anchor = compareIds[0]
  const burning = (id: string) => sampleAt(data.timeseries.perService[id]?.burnFast, clock) > 0.6
  const neighborBurning = anchor
    ? [...(graph.upstream[anchor] ?? []), ...(graph.downstream[anchor] ?? [])].filter(
        (id) => burning(id) && !compareIds.includes(id),
      )
    : []

  return (
    <div className="compare-tray">
      <div>
        <div className="subtle" style={{ fontSize: 10, marginBottom: 4 }}>
          COMPARE · click services in the topology to add ({compareIds.length} selected)
        </div>
        <div className="picks">
          {compareIds.length === 0 && <span className="subtle" style={{ fontSize: 11 }}>none yet — click a node</span>}
          {compareIds.map((id) => (
            <span className="pick" key={id}>
              {byId[id]?.name ?? id}
              <span className="rm" onClick={() => toggle(id)}>✕</span>
            </span>
          ))}
        </div>
        {neighborBurning.length > 0 && (
          <div
            className="seed"
            style={{ marginTop: 5 }}
            onClick={() => setCompareIds([...compareIds, ...neighborBurning])}
          >
            + add the {neighborBurning.length} burning service{neighborBurning.length > 1 ? 's' : ''} connected to{' '}
            {byId[anchor]?.name}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="active" disabled={compareIds.length < 2} onClick={commit}>
          compare {compareIds.length >= 2 ? `(${compareIds.length})` : ''}
        </button>
        <button onClick={exit}>cancel</button>
      </div>
    </div>
  )
}

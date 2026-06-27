import { useStore } from '../store'
import { useTheme } from '../hooks'
import { burnColorHex } from '../lib/color'

// Ranked incident sidebar: top-priority nodes by priority score (a considered
// ranking, text). Clicking selects the node.
export function Sidebar() {
  const priorityList = useStore((s) => s.priorityList)
  const services = useStore((s) => s.data?.topology.services ?? [])
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const selectedId = useStore((s) => s.selectedId)
  const theme = useTheme()

  const byId = Object.fromEntries(services.map((s) => [s.id, s]))
  const ranked = priorityList.filter((p) => p.score > 0.02).slice(0, 10)

  return (
    <div className="sidebar">
      <div className="hd">
        <span>Priority — click to triage</span>
        <span>{ranked.length}</span>
      </div>
      {ranked.length === 0 ? (
        <div className="calm">All clear at this moment. No services burning above threshold.</div>
      ) : (
        <div className="list">
          {ranked.map((p) => {
            const svc = byId[p.serviceId]
            if (!svc) return null
            return (
              <div
                key={p.serviceId}
                className={'rank-row' + (selectedId === p.serviceId ? ' sel' : '')}
                onClick={() => select(p.serviceId)}
                onMouseEnter={() => setHovered(p.serviceId)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="bar" style={{ background: burnColorHex(p.fastBurn, theme) }} />
                <div className="nm">
                  <div className="svc">{svc.name}</div>
                  <div className="sub">
                    {svc.team} · T{svc.tier} · blast {p.blast}
                  </div>
                </div>
                <div className="score">{p.score.toFixed(1)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

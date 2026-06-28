import { useStore } from '../store'
import { resetView } from '../scene/Scene'

export function TopBar() {
  const layoutMode = useStore((s) => s.layoutMode)
  const setLayoutMode = useStore((s) => s.setLayoutMode)
  const themeName = useStore((s) => s.themeName)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const compareMode = useStore((s) => s.compareMode)
  const startCompare = useStore((s) => s.startCompare)
  const exitCompare = useStore((s) => s.exitCompare)
  const select = useStore((s) => s.select)
  const data = useStore((s) => s.data)
  const user = data?.topology.currentUser

  return (
    <div className="topbar">
      <div className="brand">
        topology<span className="dot">●</span>
      </div>
      {user && <div className="meta">Inferred: services you own · {user.name}</div>}

      <div className="spacer" />

      <div className="seg" title="Graph layout">
        <button
          className={layoutMode === 'flow' ? 'active' : ''}
          onClick={() => setLayoutMode('flow')}
          title="Flat left→right DAG on the grid"
        >
          flow
        </button>
        <button
          className={layoutMode === 'layered' ? 'active' : ''}
          onClick={() => setLayoutMode('layered')}
          title="Layered by dependency depth (altitude = layer)"
        >
          layered
        </button>
        <button
          className={layoutMode === 'organic' ? 'active' : ''}
          onClick={() => setLayoutMode('organic')}
          title="Force-directed clusters"
        >
          organic
        </button>
        <button
          className={layoutMode === 'grouped' ? 'active' : ''}
          onClick={() => setLayoutMode('grouped')}
          title="Cluster by owning team"
        >
          grouped
        </button>
      </div>

      {compareMode === 'off' ? (
        <button onClick={startCompare} title="Compare services">
          compare
        </button>
      ) : (
        <button className="active" onClick={exitCompare}>
          exit compare
        </button>
      )}

      <button onClick={() => { select(null); exitCompare() }} title="Reset to overview">
        overview
      </button>
      <button onClick={resetView} title="Reset camera">
        reset view
      </button>
      <button onClick={toggleTheme} title="Toggle theme">
        {themeName === 'dark' ? '◐ dark' : '◑ light'}
      </button>
    </div>
  )
}

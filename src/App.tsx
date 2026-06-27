import { useEffect, useState } from 'react'
import { useStore } from './store'
import { loadData } from './lib/data'
import { applyThemeToDOM, themes } from './theme'
import { Scene } from './scene/Scene'
import { TopBar } from './ui/TopBar'
import { Scrubber } from './ui/Scrubber'
import { PastBanner } from './ui/PastBanner'
import { Sidebar } from './ui/Sidebar'
import { DetailPanel } from './ui/DetailPanel'
import { DiagramModal } from './ui/DiagramModal'
import { CompareView } from './ui/CompareView'
import { CompareTray } from './ui/CompareTray'
import { useHashSync } from './ui/useHashSync'

export default function App() {
  const init = useStore((s) => s.init)
  const setError = useStore((s) => s.setError)
  const data = useStore((s) => s.data)
  const loadError = useStore((s) => s.loadError)
  const selectedId = useStore((s) => s.selectedId)
  const compareMode = useStore((s) => s.compareMode)
  const themeName = useStore((s) => s.themeName)
  const [ready, setReady] = useState(false)

  // Apply default (dark) theme to the DOM immediately.
  useEffect(() => {
    applyThemeToDOM(themes[themeName], themeName)
  }, [themeName])

  useEffect(() => {
    loadData()
      .then((d) => {
        init(d)
        setReady(true)
      })
      .catch((e) => setError(String(e)))
  }, [init, setError])

  useHashSync(ready)

  const panelOpen = !!selectedId && compareMode !== 'committed'
  const comparing = compareMode === 'committed'

  return (
    <div className="app-root">
      <TopBar />
      <div className="scene-wrap">
        {loadError && (
          <div className="center-flag">
            <div>Failed to load data</div>
            <div className="faint">{loadError}</div>
          </div>
        )}
        {!data && !loadError && (
          <div className="center-flag">
            <div className="spinner" />
            <div>loading topology…</div>
          </div>
        )}

        <div
          className="canvas-host"
          style={{ right: panelOpen ? 'var(--panel-w)' : comparing ? '50%' : '0' }}
        >
          <Scene />
        </div>

        <PastBanner />
        {compareMode !== 'committed' && <Sidebar />}
        {compareMode === 'staging' && <CompareTray />}
        {panelOpen && <DetailPanel />}
        {comparing && <CompareView />}

        <Scrubber />
        <DiagramModal />
      </div>
    </div>
  )
}

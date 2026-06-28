import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { clockToMs } from '../lib/timeseries'
import { barHeight } from './nodeShape'
import type { SystemEvent } from '../types'

const WINDOW_MS = 22 * 60 * 1000 // ±22 min fade window (persistence-and-decay)

const GLYPH: Record<SystemEvent['type'], string> = {
  deploy: '▲',
  config: '◆',
  scale: '⇅',
  incident: '✶',
}
const HUE: Record<SystemEvent['type'], string> = {
  deploy: 'var(--accent-blue)',
  config: 'var(--warning)',
  scale: 'var(--accent)',
  incident: 'var(--health-bad)',
}

// Typed event bubbles above nodes, fading in/out as the playhead passes (no hard
// strobe during fast scrubs — opacity decays with time distance).
export function EventBubbles() {
  const events = useStore((s) => s.data?.events.events ?? [])
  const positions = useStore((s) => s.positions)
  const data = useStore((s) => s.data)
  const clock = useStore((s) => s.clock)
  const tsMs = useStore((s) => s.tsMs)
  const domain = useStore((s) => s.trafficDomain)

  const nowMs = clockToMs(clock, tsMs)

  return (
    <group>
      {events.map((ev) => {
        const p = positions[ev.serviceId]
        if (!p) return null
        const dt = Math.abs(Date.parse(ev.timestamp) - nowMs)
        if (dt > WINDOW_MS) return null
        const opacity = 1 - dt / WINDOW_MS
        const series = data?.timeseries.perService[ev.serviceId]
        const top = (p.elev ?? 0) + barHeight(series, clock, domain) + 0.78
        return (
          <Html
            key={ev.id}
            position={[p.x, top, p.y]}
            center
            zIndexRange={[120, 10]}
            wrapperClass="r3f-html-passthrough"
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="event-bubble"
              style={{ opacity, borderColor: HUE[ev.type], color: HUE[ev.type] }}
              title={ev.title}
            >
              {GLYPH[ev.type]}
            </div>
          </Html>
        )
      })}
    </group>
  )
}

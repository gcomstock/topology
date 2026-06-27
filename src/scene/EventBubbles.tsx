import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { clockToMs } from '../lib/timeseries'
import type { SystemEvent } from '../types'

const STEP_H = 0.16
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
  const services = useStore((s) => s.data?.topology.services ?? [])
  const clock = useStore((s) => s.clock)
  const tsMs = useStore((s) => s.tsMs)

  const nowMs = clockToMs(clock, tsMs)
  const tierById: Record<string, number> = {}
  for (const s of services) tierById[s.id] = s.tier

  return (
    <group>
      {events.map((ev) => {
        const p = positions[ev.serviceId]
        if (!p) return null
        const dt = Math.abs(Date.parse(ev.timestamp) - nowMs)
        if (dt > WINDOW_MS) return null
        const opacity = 1 - dt / WINDOW_MS
        const tier = tierById[ev.serviceId] ?? 1
        return (
          <Html
            key={ev.id}
            position={[p.x, tier * STEP_H + 0.62, p.y]}
            center
            zIndexRange={[120, 10]}
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

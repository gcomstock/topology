import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { barHeight } from './nodeShape'

// Every service is labelled; the name floats just above the top of its traffic
// bar (which animates with the clock). Selection/priority drive emphasis.
export function Labels() {
  const services = useStore((s) => s.data?.topology.services ?? [])
  const positions = useStore((s) => s.positions)
  const selectedId = useStore((s) => s.selectedId)
  const priorityTop = useStore((s) => s.priorityTop)
  const blast = useStore((s) => s.blastSet)
  const data = useStore((s) => s.data)
  const clock = useStore((s) => s.clock)
  const domain = useStore((s) => s.trafficDomain)

  const dimming = blast.size > 0

  return (
    <group>
      {services.map((s) => {
        const pos = positions[s.id]
        if (!pos) return null
        const series = data?.timeseries.perService[s.id]
        const top = barHeight(series, clock, domain) + 0.42 // clear the bar top
        const associated = !dimming || s.id === selectedId || blast.has(s.id)
        const cls =
          'node-label' +
          (s.id === selectedId ? ' selected' : '') +
          (priorityTop.has(s.id) && s.id !== selectedId ? ' priority' : '') +
          (associated ? '' : ' dim')
        return (
          <Html
            key={s.id}
            position={[pos.x, top, pos.y]}
            center
            zIndexRange={associated ? [100, 0] : [40, 0]}
            wrapperClass="r3f-html-passthrough"
            style={{ pointerEvents: 'none' }}
          >
            <div className={cls}>{s.name}</div>
          </Html>
        )
      })}
    </group>
  )
}

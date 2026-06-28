import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { critSteps, STEP_H } from './nodeShape'

function labelY(tier: number) {
  return critSteps(tier) * STEP_H + 0.24
}

// Every service is labelled (the layered + isometric arrangement gives enough
// room). Selection/priority drive emphasis, not visibility.
export function Labels() {
  const services = useStore((s) => s.data?.topology.services ?? [])
  const positions = useStore((s) => s.positions)
  const selectedId = useStore((s) => s.selectedId)
  const priorityTop = useStore((s) => s.priorityTop)

  return (
    <group>
      {services.map((s) => {
        const pos = positions[s.id]
        if (!pos) return null
        const cls =
          'node-label' +
          (s.id === selectedId ? ' selected' : '') +
          (priorityTop.has(s.id) && s.id !== selectedId ? ' priority' : '')
        return (
          <Html
            key={s.id}
            position={[pos.x, (pos.elev ?? 0) + labelY(s.tier), pos.y]}
            center
            zIndexRange={[100, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className={cls}>{s.name}</div>
          </Html>
        )
      })}
    </group>
  )
}

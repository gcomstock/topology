import { Html } from '@react-three/drei'
import { useStore } from '../store'
import type { Service } from '../types'

const STEP_H = 0.16

function labelY(tier: number) {
  return tier * STEP_H + 0.22
}

// Decluttering: render labels only for the active node + its neighbors +
// high-priority nodes (+ hovered). Others reveal on hover. Avoids thousands of
// DOM labels (spec §4).
export function Labels() {
  const services = useStore((s) => s.data?.topology.services ?? [])
  const positions = useStore((s) => s.positions)
  const selectedId = useStore((s) => s.selectedId)
  const hoveredId = useStore((s) => s.hoveredId)
  const graph = useStore((s) => s.graph)
  const priorityTop = useStore((s) => s.priorityTop)
  const compareIds = useStore((s) => s.compareIds)

  const focus = hoveredId ?? selectedId
  const neighbors = new Set<string>()
  if (focus && graph) {
    for (const n of graph.downstream[focus] ?? []) neighbors.add(n)
    for (const n of graph.upstream[focus] ?? []) neighbors.add(n)
  }

  const shouldShow = (s: Service) => {
    if (s.id === selectedId || s.id === hoveredId) return true
    if (neighbors.has(s.id)) return true
    if (priorityTop.has(s.id)) return true
    if (compareIds.includes(s.id)) return true
    if (s.tier >= 4) return true
    return false
  }

  return (
    <group>
      {services.map((s) => {
        const pos = positions[s.id]
        if (!pos || !shouldShow(s)) return null
        const cls =
          'node-label' +
          (s.id === selectedId ? ' selected' : '') +
          (priorityTop.has(s.id) && s.id !== selectedId ? ' priority' : '')
        return (
          <Html
            key={s.id}
            position={[pos.x, labelY(s.tier), pos.y]}
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

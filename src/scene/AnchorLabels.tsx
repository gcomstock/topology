import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'

// Team zone headers for the grouped layout. Each label sits BELOW its cluster
// (in front, toward the camera) and centered on the cluster's width — computed
// from the actual member node positions so it never overlaps the nodes.
export function AnchorLabels() {
  const anchors = useStore((s) => s.groupAnchors)
  const positions = useStore((s) => s.positions)
  const services = useStore((s) => s.data?.topology.services ?? [])

  const placed = useMemo(() => {
    const known = new Set(anchors.map((a) => a.label))
    const acc: Record<string, { minX: number; maxX: number; maxZ: number }> = {}
    for (const s of services) {
      if (!known.has(s.team)) continue
      const p = positions[s.id]
      if (!p) continue
      const b = acc[s.team] ?? { minX: Infinity, maxX: -Infinity, maxZ: -Infinity }
      b.minX = Math.min(b.minX, p.x)
      b.maxX = Math.max(b.maxX, p.x)
      b.maxZ = Math.max(b.maxZ, p.y) // +z = front (toward camera) = "below" on screen
      acc[s.team] = b
    }
    return anchors
      .filter((a) => acc[a.label])
      .map((a) => {
        const b = acc[a.label]
        return { label: a.label, x: (b.minX + b.maxX) / 2, z: b.maxZ + 0.9 }
      })
  }, [anchors, positions, services])

  return (
    <group>
      {placed.map((p) => (
        <Html
          key={p.label}
          position={[p.x, 0, p.z]}
          center
          zIndexRange={[60, 0]}
          wrapperClass="r3f-html-passthrough"
          style={{ pointerEvents: 'none' }}
        >
          <div className="zone-label">{p.label}</div>
        </Html>
      ))}
    </group>
  )
}

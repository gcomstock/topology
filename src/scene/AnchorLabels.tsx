import { Html } from '@react-three/drei'
import { useStore } from '../store'

// Zone headers for the grouped layout — one faint, constant-size label per
// attribute anchor (team / region / datastore) so the clusters are legible.
export function AnchorLabels() {
  const anchors = useStore((s) => s.groupAnchors)
  return (
    <group>
      {anchors.map((a) => (
        <Html
          key={a.label}
          position={[a.x, 0.05, a.y]}
          center
          zIndexRange={[60, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="zone-label">{a.label}</div>
        </Html>
      ))}
    </group>
  )
}

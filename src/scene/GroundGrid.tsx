import { useStore } from '../store'
import { useTheme } from '../hooks'

// Faint floor grid under everything for the technical/IDE feel + spatial ref.
// Sits just below the neutral plane so terrain pits read against it.
export function GroundGrid() {
  const theme = useTheme()
  const bounds = useStore((s) => s.bounds)
  const size = Math.max(bounds.w, bounds.h) + 8
  const divisions = Math.round(size / 0.6)
  return (
    <gridHelper
      args={[size, divisions, theme.grid, theme.grid]}
      position={[(bounds.minX + bounds.maxX) / 2, -0.01, (bounds.minY + bounds.maxY) / 2]}
    />
  )
}

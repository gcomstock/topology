import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { CELL } from './nodeShape'

// A flat static gray line-grid on black — the reference floor the traffic bars
// rest on. (Health is on bar color and traffic on bar height now, so the floor
// no longer deforms or recolors.) Grid lines fade toward the background by
// distance to the nearest node so empty margins don't read as busy hatching.
const PAD_CELLS = 4
const FADE_NEAR = 2.2
const FADE_FAR = 5.5

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function GridField() {
  const theme = useTheme()
  const bounds = useStore((s) => s.bounds)
  const positions = useStore((s) => s.positions)

  const geom = useMemo(() => {
    const i0 = Math.floor(bounds.minX / CELL) - PAD_CELLS
    const i1 = Math.ceil(bounds.maxX / CELL) + PAD_CELLS
    const j0 = Math.floor(bounds.minY / CELL) - PAD_CELLS
    const j1 = Math.ceil(bounds.maxY / CELL) + PAD_CELLS
    const nx = i1 - i0 + 1
    const nz = j1 - j0 + 1

    const nodes = Object.values(positions)
    const gray = new THREE.Color(theme.textFaint)
    const bg = new THREE.Color(theme.bgBase)
    const tmp = new THREE.Color()

    // color per lattice point (gray, faded toward bg by distance to nearest node)
    const lcol = new Float32Array(nx * nz * 3)
    for (let i = 0; i < nx; i++) {
      const wx = (i0 + i) * CELL
      for (let j = 0; j < nz; j++) {
        const wz = (j0 + j) * CELL
        let minD2 = Infinity
        for (const n of nodes) {
          const dx = wx - n.x
          const dz = wz - n.y
          const d2 = dx * dx + dz * dz
          if (d2 < minD2) minD2 = d2
        }
        tmp.copy(gray)
        const fade = smoothstep(FADE_NEAR, FADE_FAR, Math.sqrt(minD2))
        if (fade > 0) tmp.lerp(bg, fade)
        const li = i * nz + j
        lcol[li * 3] = tmp.r
        lcol[li * 3 + 1] = tmp.g
        lcol[li * 3 + 2] = tmp.b
      }
    }

    // build flat (y=0) line segments between adjacent lattice points
    const idx = (i: number, j: number) => i * nz + j
    const segLat: number[] = []
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (i < nx - 1) segLat.push(idx(i, j), idx(i + 1, j))
        if (j < nz - 1) segLat.push(idx(i, j), idx(i, j + 1))
      }
    }
    const vert = segLat.length
    const position = new Float32Array(vert * 3)
    const color = new Float32Array(vert * 3)
    for (let v = 0; v < vert; v++) {
      const li = segLat[v]
      const i = Math.floor(li / nz)
      const j = li % nz
      position[v * 3] = (i0 + i) * CELL
      position[v * 3 + 1] = 0
      position[v * 3 + 2] = (j0 + j) * CELL
      color[v * 3] = lcol[li * 3]
      color[v * 3 + 1] = lcol[li * 3 + 1]
      color[v * 3 + 2] = lcol[li * 3 + 2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(position, 3))
    g.setAttribute('color', new THREE.BufferAttribute(color, 3))
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, positions, theme])

  return (
    <lineSegments geometry={geom} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} />
    </lineSegments>
  )
}

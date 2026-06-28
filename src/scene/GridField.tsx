import { useMemo, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { sampleAt } from '../lib/timeseries'
import { CELL } from './nodeShape'

// The floor is a fine GRAY LINE grid on black (no fill, no shadows). Healthy =
// flat gray. As a service's SLO burn rises, the grid SINKS into a well centered
// on that node and the grid LINES in the well take on health color (gray →
// amber → red by depth). Nodes rest on the neutral plane, perched over the well.
const PAD_CELLS = 4
const ACUTE_AMP = 0.7 // depth per unit burnFast
const ACUTE_SIGMA = 0.55 // narrow, sharp well
const CHRONIC_AMP = 0.34 // depth per unit burnSlow
const CHRONIC_SIGMA = 1.5 // broad, shallow basin
const MAX_DEPTH = 3.0
const DEPTH_REF = 2.0 // depth that maps to full red
// Distance-fade: grid is solid within FADE_NEAR of any node and dissolves into
// the background by FADE_FAR, so empty margins don't read as busy hatching.
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
  const services = useStore((s) => s.data?.topology.services ?? [])
  const ts = useStore((s) => s.data?.timeseries)
  const clock = useStore((s) => s.clock)

  // Lattice aligned to the global k·CELL grid so snapped node centers sit on
  // intersections. Built once per bounds change.
  const lattice = useMemo(() => {
    const i0 = Math.floor(bounds.minX / CELL) - PAD_CELLS
    const i1 = Math.ceil(bounds.maxX / CELL) + PAD_CELLS
    const j0 = Math.floor(bounds.minY / CELL) - PAD_CELLS
    const j1 = Math.ceil(bounds.maxY / CELL) + PAD_CELLS
    const nx = i1 - i0 + 1
    const nz = j1 - j0 + 1

    // segment list: horizontal + vertical edges between adjacent lattice points
    const segs: number[] = [] // flattened pairs of lattice indices (a,b)
    const idx = (i: number, j: number) => i * nz + j
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (i < nx - 1) segs.push(idx(i, j), idx(i + 1, j))
        if (j < nz - 1) segs.push(idx(i, j), idx(i, j + 1))
      }
    }
    const segCount = segs.length / 2
    const vertCount = segCount * 2
    const position = new Float32Array(vertCount * 3)
    const color = new Float32Array(vertCount * 3)
    const vlat = new Int32Array(vertCount) // lattice index per vertex
    // world position of a lattice index
    const wx = (li: number) => (i0 + Math.floor(li / nz)) * CELL
    const wz = (li: number) => (j0 + (li % nz)) * CELL
    for (let v = 0; v < vertCount; v++) {
      const li = segs[v]
      vlat[v] = li
      position[v * 3] = wx(li)
      position[v * 3 + 2] = wz(li)
    }
    return { nx, nz, i0, j0, position, color, vlat, latCount: nx * nz }
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])

  const geomRef = useRef<THREE.BufferGeometry>(null)

  // Per-node world position + live burn (recomputed on clock change).
  const nodes = useMemo(() => {
    if (!ts) return []
    return services.map((s) => {
      const p = positions[s.id]
      const series = ts.perService[s.id]
      return {
        x: p?.x ?? 0,
        z: p?.y ?? 0,
        fast: sampleAt(series?.burnFast, clock),
        slow: sampleAt(series?.burnSlow, clock),
      }
    })
  }, [services, positions, ts, clock])

  useLayoutEffect(() => {
    const geom = geomRef.current
    if (!geom) return
    const { nx, nz, i0, j0, position, color, vlat, latCount } = lattice

    // 1) depth + color per lattice point
    const depth = new Float32Array(latCount)
    const lcol = new Float32Array(latCount * 3)
    const gray = new THREE.Color(theme.textFaint) // visible gray on black
    const amber = new THREE.Color(theme.healthMid)
    const red = new THREE.Color(theme.healthBad)
    const bg = new THREE.Color(theme.bgBase)
    const burn = new THREE.Color()
    const tmp = new THREE.Color()
    for (let i = 0; i < nx; i++) {
      const wx = (i0 + i) * CELL
      for (let j = 0; j < nz; j++) {
        const wz = (j0 + j) * CELL
        let d = 0
        let minD2 = Infinity
        for (const n of nodes) {
          const dx = wx - n.x
          const dz = wz - n.z
          const d2 = dx * dx + dz * dz
          if (d2 < minD2) minD2 = d2
          if (n.fast > 0.05) d += n.fast * ACUTE_AMP * Math.exp(-d2 / (2 * ACUTE_SIGMA * ACUTE_SIGMA))
          if (n.slow > 0.03) d += n.slow * CHRONIC_AMP * Math.exp(-d2 / (2 * CHRONIC_SIGMA * CHRONIC_SIGMA))
        }
        d = Math.min(MAX_DEPTH, d)
        const li = i * nz + j
        depth[li] = d
        const d01 = Math.min(1, d / DEPTH_REF)
        if (d01 < 0.04) {
          tmp.copy(gray)
        } else {
          // A well only forms under burn, so ramp gray → amber → red by depth
          // (never green); brighten with depth so deep wells bloom.
          burn.copy(amber).lerp(red, Math.min(1, Math.max(0, (d01 - 0.3) / 0.7)))
          tmp.copy(gray).lerp(burn, Math.min(1, d01 * 1.6))
          tmp.multiplyScalar(1 + d01 * 0.8)
        }
        // Fade toward the background by distance to the nearest node.
        const fade = smoothstep(FADE_NEAR, FADE_FAR, Math.sqrt(minD2))
        if (fade > 0) tmp.lerp(bg, fade)
        lcol[li * 3] = tmp.r
        lcol[li * 3 + 1] = tmp.g
        lcol[li * 3 + 2] = tmp.b
      }
    }

    // 2) write y (downward) + color into the segment vertex attributes
    for (let v = 0; v < vlat.length; v++) {
      const li = vlat[v]
      position[v * 3 + 1] = -depth[li]
      color[v * 3] = lcol[li * 3]
      color[v * 3 + 1] = lcol[li * 3 + 1]
      color[v * 3 + 2] = lcol[li * 3 + 2]
    }

    geom.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geom.attributes.position.needsUpdate = true
    geom.attributes.color.needsUpdate = true
  }, [lattice, nodes, theme])

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geomRef} />
      <lineBasicMaterial vertexColors transparent opacity={0.9} />
    </lineSegments>
  )
}

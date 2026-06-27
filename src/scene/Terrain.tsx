import { useMemo, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColor } from '../lib/color'
import { sampleAt } from '../lib/timeseries'

const SEG = 96 // grid resolution
const PAD = 2.2 // world padding beyond layout bounds
const ACUTE_AMP = 0.85 // depth per unit burnFast
const ACUTE_SIGMA = 0.5 // narrow, sharp pit
const CHRONIC_AMP = 0.4 // depth per unit burnSlow
const CHRONIC_SIGMA = 1.5 // broad, shallow basin
const MAX_DEPTH = 4.0
const DEPTH_REF = 2.4 // depth that maps to full red

// Terrain sits BELOW the node layer and deforms downward only (spec §4):
//   y(x,z,t) = -Σ services [ burnFast·sharpKernel + burnSlow·broadKernel ]
// Nodes rest on the neutral plane at y=0 and always sit in clear airspace above
// the pits. The plane's -90° X rotation is BAKED INTO the geometry so the Y
// position attribute is the real world-up axis — setting Y negative is
// unambiguously downward, no render-time rotation to reason about.
export function Terrain() {
  const theme = useTheme()
  const bounds = useStore((s) => s.bounds)
  const positions = useStore((s) => s.positions)
  const services = useStore((s) => s.data?.topology.services ?? [])
  const ts = useStore((s) => s.data?.timeseries)
  const clock = useStore((s) => s.clock)

  const minX = bounds.minX - PAD
  const maxX = bounds.maxX + PAD
  const minZ = bounds.minY - PAD
  const maxZ = bounds.maxY + PAD
  const w = maxX - minX
  const h = maxZ - minZ
  const cX = (minX + maxX) / 2
  const cZ = (minZ + maxZ) / 2

  // Geometry built once, with the flat-on-ground rotation baked in.
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, SEG, SEG)
    g.rotateX(-Math.PI / 2) // now lies in XZ; Y is up
    const count = g.attributes.position.count
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(count), 1))
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h])

  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  // Per-node world position + live burn, recomputed when clock changes.
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

  // Inject per-vertex emissive so deep pits bloom from within the void.
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * 0.32;',
        )
    },
    [],
  )

  useLayoutEffect(() => {
    const pos = geom.attributes.position as THREE.BufferAttribute
    const colorAttr = geom.attributes.color as THREE.BufferAttribute
    const glowAttr = geom.attributes.aGlow as THREE.BufferAttribute
    const count = pos.count

    const calm = new THREE.Color(theme.healthGood).multiplyScalar(0.5)
    const tmp = new THREE.Color()

    for (let i = 0; i < count; i++) {
      // After the baked rotation, X and Z are the horizontal plane coords
      // (centered on origin); add the mesh center to get world coords.
      const wx = cX + pos.getX(i)
      const wz = cZ + pos.getZ(i)
      let depth = 0
      for (const n of nodes) {
        const dx = wx - n.x
        const dz = wz - n.z
        const d2 = dx * dx + dz * dz
        if (n.fast > 0.05) depth += n.fast * ACUTE_AMP * Math.exp(-d2 / (2 * ACUTE_SIGMA * ACUTE_SIGMA))
        if (n.slow > 0.03) depth += n.slow * CHRONIC_AMP * Math.exp(-d2 / (2 * CHRONIC_SIGMA * CHRONIC_SIGMA))
      }
      depth = Math.min(MAX_DEPTH, depth)
      // The rotation is baked into the geometry and the mesh has no rotation,
      // so the Y position attribute is world-up. Negative = downward pit; the
      // node layer at y≥0 always sits in clear airspace above the chasm.
      pos.setY(i, -depth)

      const d01 = Math.min(1, depth / DEPTH_REF)
      if (d01 < 0.02) {
        tmp.copy(calm)
        glowAttr.setX(i, 0)
      } else {
        tmp.copy(healthColor(1 - d01, theme))
        // Only deeper pit cores glow; shallow walls stay lit/shaded so the
        // concavity reads as a pit rather than a glowing dome.
        glowAttr.setX(i, Math.min(1, Math.max(0, d01 - 0.4) * 1.7))
      }
      colorAttr.setXYZ(i, tmp.r, tmp.g, tmp.b)
    }

    pos.needsUpdate = true
    colorAttr.needsUpdate = true
    glowAttr.needsUpdate = true
    geom.computeVertexNormals()
  }, [geom, nodes, theme, cX, cZ])

  return (
    <group position={[cX, 0, cZ]}>
      <mesh geometry={geom} receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          vertexColors
          emissive={'#000000'}
          emissiveIntensity={1}
          metalness={0.1}
          roughness={0.85}
          side={THREE.DoubleSide}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
      {/* Wireframe overlay on the same deforming geometry — grid lines funneling
          downward make the pits unmistakably read as concave chasms (and suit
          the technical/IDE aesthetic). */}
      <mesh geometry={geom} renderOrder={1}>
        <meshBasicMaterial
          color={theme.accent}
          wireframe
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

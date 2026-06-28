import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColor } from '../lib/color'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import { critSteps, STEP_H, BASE_W } from './nodeShape'
import type { Service } from '../types'

// Geometry for a stepped/ziggurat pyramid with `steps` stacked steps.
// More steps = taller + more stepped = more critical (counting steps is the read).
function stepBoxes(steps: number) {
  const boxes: { w: number; y: number; h: number }[] = []
  for (let i = 0; i < steps; i++) {
    const w = BASE_W * (1 - i * (0.5 / Math.max(steps, 1)))
    boxes.push({ w: Math.max(0.16, w), y: i * STEP_H + STEP_H / 2, h: STEP_H })
  }
  return boxes
}

function PyramidNode({ service }: { service: Service }) {
  const theme = useTheme()
  const pos = useStore((s) => s.positions[service.id])
  const clock = useStore((s) => s.clock)
  const data = useStore((s) => s.data)!
  const selectedId = useStore((s) => s.selectedId)
  const hoveredId = useStore((s) => s.hoveredId)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const compareMode = useStore((s) => s.compareMode)
  const compareIds = useStore((s) => s.compareIds)
  const toggleCompareId = useStore((s) => s.toggleCompareId)
  const blast = useStore((s) => s.blastSet)

  const boxes = useMemo(() => stepBoxes(critSteps(service.tier)), [service.tier])
  const matRef = useRef<THREE.MeshStandardMaterial[]>([])

  const series = data.timeseries.perService[service.id]
  const burnFast = sampleAt(series?.burnFast, clock)
  const health = sampleAt(series?.health, clock)
  const sampleCount = series ? series.sampleCount[nearestIndex(clock, series.sampleCount.length)] : 5000

  // Health is communicated by COLOR (not opacity) in this demo. A handful of
  // very-low-sample services render gray to show what "no data" looks like.
  const hasData = sampleCount > 15

  const selected = selectedId === service.id
  const hovered = hoveredId === service.id
  const inCompare = compareIds.includes(service.id)

  // Hover/selection dimming: when a highlight set is active, non-members dim
  // hard so only the associated services stand out.
  const blastActive = blast.size > 0
  const inBlast = selected || blast.has(service.id)
  const dim = blastActive && !inBlast ? 0.12 : 1

  // Glow = acute health urgency only (dynamic). Healthy nodes never glow.
  const glow = Math.max(0, burnFast - 0.25)
  const glowColor = useMemo(
    () => (hasData ? healthColor(health, theme) : new THREE.Color(theme.nodata)),
    [health, theme, hasData],
  )
  const baseColor = useMemo(() => {
    // Body color = health (green→amber→red). Criticality stays in the shape.
    // No-data services render gray to demonstrate the missing-data state.
    if (!hasData) return new THREE.Color(theme.nodata)
    return healthColor(health, theme)
  }, [theme, hasData, health])

  // Per-frame subtle glow pulse around the burn-derived base intensity.
  useFrame((state) => {
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3 + pos?.x * 7) * 0.18
    const intensity = glow > 0 ? Math.min(3.2, glow * 0.9) * pulse : 0
    for (const m of matRef.current) {
      if (!m) continue
      m.emissiveIntensity = intensity
    }
  })

  if (!pos) return null

  const outlineColor = selected
    ? theme.accent
    : hovered || inCompare
    ? theme.accentBlue
    : theme.textMuted

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (compareMode === 'staging') toggleCompareId(service.id)
    else select(service.id)
  }

  return (
    <group
      position={[pos.x, pos.elev ?? 0, pos.y]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(service.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {boxes.map((b, i) => (
        <group key={i} position={[0, b.y, 0]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, b.w]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) matRef.current[i] = m as THREE.MeshStandardMaterial
              }}
              color={baseColor}
              emissive={glowColor}
              emissiveIntensity={0}
              metalness={0.25}
              roughness={0.5}
              transparent
              opacity={dim}
            />
          </mesh>
          {/* Neutral outline so the silhouette stays readable against terrain/edges. */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(b.w, b.h, b.w)]} />
            <lineBasicMaterial
              color={outlineColor}
              transparent
              opacity={(selected || hovered ? 1 : 0.7) * dim}
            />
          </lineSegments>
        </group>
      ))}
    </group>
  )
}

export function Nodes() {
  const services = useStore((s) => s.data?.topology.services ?? [])
  return (
    <group>
      {services.map((s) => (
        <PyramidNode key={s.id} service={s} />
      ))}
    </group>
  )
}

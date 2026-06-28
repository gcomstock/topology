import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColor } from '../lib/color'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import { trafficToHeight } from '../lib/traffic'
import { BASE_W, tierLabel } from './nodeShape'
import type { Service } from '../types'

// A service is a rectangular BAR:
//   height = relative traffic (live, animates on scrub)
//   color  = aggregate SLO health (green→amber→red); gray = no data
//   cage   = a wireframe box at EXPECTED traffic — fill pokes above on a spike,
//            leaves a hollow cage on a dip
//   tier   = a T0/T1/T2 tag on the box top
function TrafficBar({ service }: { service: Service }) {
  const theme = useTheme()
  const pos = useStore((s) => s.positions[service.id])
  const clock = useStore((s) => s.clock)
  const data = useStore((s) => s.data)!
  const domain = useStore((s) => s.trafficDomain)
  const selectedId = useStore((s) => s.selectedId)
  const hoveredId = useStore((s) => s.hoveredId)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const compareMode = useStore((s) => s.compareMode)
  const compareIds = useStore((s) => s.compareIds)
  const toggleCompareId = useStore((s) => s.toggleCompareId)
  const blast = useStore((s) => s.blastSet)

  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  const series = data.timeseries.perService[service.id]
  const burnFast = sampleAt(series?.burnFast, clock)
  const health = sampleAt(series?.health, clock)
  const sampleCount = series ? series.sampleCount[nearestIndex(clock, series.sampleCount.length)] : 5000
  const hasData = sampleCount > 15

  const selected = selectedId === service.id
  const hovered = hoveredId === service.id
  const inCompare = compareIds.includes(service.id)

  const blastActive = blast.size > 0
  const inBlast = selected || blast.has(service.id)
  const dim = blastActive && !inBlast ? 0.12 : 1

  // Expected (cage) height is static; the cap is rendered as a wireframe box.
  const expectedH = useMemo(
    () => trafficToHeight(service.expectedTraffic, domain),
    [service.expectedTraffic, domain],
  )

  const baseColor = useMemo(() => {
    if (!hasData) return new THREE.Color(theme.nodata)
    return healthColor(health, theme)
  }, [theme, hasData, health])
  const glowColor = useMemo(
    () => (hasData ? healthColor(health, theme) : new THREE.Color(theme.nodata)),
    [health, theme, hasData],
  )

  // Glow = acute burn only (attention beacon); otherwise no emissive.
  const glow = Math.max(0, burnFast - 0.25)

  // Live bar height from current-clock traffic (re-renders on clock change).
  const actualTraffic = sampleAt(series?.golden.traffic, clock)
  const actualH = Math.max(0.04, trafficToHeight(actualTraffic, domain))
  const topH = Math.max(actualH, expectedH)

  // useFrame only drives the glow pulse — height comes from React render above.
  useFrame((state) => {
    if (!matRef.current) return
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3 + (pos?.x ?? 0) * 7) * 0.18
    matRef.current.emissiveIntensity = glow > 0 ? Math.min(3.0, glow * 0.9) * pulse : 0
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

  const cageGeom = useMemo(() => new THREE.BoxGeometry(BASE_W, 1, BASE_W), [])
  // A flat square rim (slightly larger) marking the expected height — a bright
  // "you are here" reference the fill bar visibly pokes above / falls short of.
  const rimGeom = useMemo(() => new THREE.BoxGeometry(BASE_W * 1.12, 0.001, BASE_W * 1.12), [])

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
      {/* Solid fill bar — a unit cube scaled in Y from the base plane up. */}
      <mesh position={[0, actualH / 2, 0]} scale={[1, actualH, 1]}>
        <boxGeometry args={[BASE_W, 1, BASE_W]} />
        <meshStandardMaterial
          ref={matRef}
          color={baseColor}
          emissive={glowColor}
          emissiveIntensity={0}
          metalness={0.25}
          roughness={0.5}
          transparent
          opacity={dim}
        />
      </mesh>

      {/* Expected-traffic cage — static wireframe the fill is read against. */}
      <lineSegments position={[0, expectedH / 2, 0]} scale={[1, expectedH, 1]}>
        <edgesGeometry args={[cageGeom]} />
        <lineBasicMaterial
          color={selected || hovered ? outlineColor : theme.textMuted}
          transparent
          opacity={(selected || hovered ? 1 : 0.8) * dim}
        />
      </lineSegments>
      {/* Emphasized "expected" rim — the reference line the fill crosses. */}
      <lineSegments position={[0, expectedH, 0]}>
        <edgesGeometry args={[rimGeom]} />
        <lineBasicMaterial
          color={selected || hovered ? outlineColor : theme.textPrimary}
          transparent
          opacity={(selected || hovered ? 1 : 0.9) * dim}
        />
      </lineSegments>

      {/* Tier tag on top — above whichever is taller (fill or cage). */}
      {dim > 0.5 && (
        <Html
          position={[0, topH + 0.14, 0]}
          center
          zIndexRange={[50, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="tier-tag">{tierLabel(service.tier)}</div>
        </Html>
      )}
    </group>
  )
}

export function Nodes() {
  const services = useStore((s) => s.data?.topology.services ?? [])
  return (
    <group>
      {services.map((s) => (
        <TrafficBar key={s.id} service={s} />
      ))}
    </group>
  )
}

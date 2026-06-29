import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColor } from '../lib/color'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import { trafficToHeight } from '../lib/traffic'
import { BASE_W } from './nodeShape'
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

  // When a service is selected, the "active topology" is the highlighted set
  // (selected + its blast set). Everything else dims AND becomes inert — not
  // hoverable or clickable; traversal is limited to the active set.
  const selectionActive = selectedId != null
  const inBlast = selected || blast.has(service.id)
  const dim = blast.size > 0 && !inBlast ? 0.12 : 1
  const interactive = !selectionActive || inBlast

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
    // Staging mode is always interactive; otherwise dimmed (non-active) nodes
    // are inert so clicking is limited to the active topology.
    if (compareMode !== 'staging' && !interactive) return
    e.stopPropagation()
    if (compareMode === 'staging') toggleCompareId(service.id)
    else select(service.id)
  }

  // A flat square ring marking the EXPECTED (average) traffic height — the single
  // reference the fill bar reads against (pokes above when traffic > normal,
  // floats above the bar when below). Slightly larger than the footprint.
  const rimGeom = useMemo(() => new THREE.BoxGeometry(BASE_W * 1.12, 0.001, BASE_W * 1.12), [])

  // Box-edge segments for the fill BAR (selection/hover outline). Only the bar is
  // outlined — never the expected rim — at a doubled stroke width.
  const barEdges = useMemo(() => {
    const w = BASE_W / 2
    const h = actualH
    const c = [
      [-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w],
      [-w, h, -w], [w, h, -w], [w, h, w], [-w, h, w],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z))
    const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
    return E.flatMap(([a, b]) => [c[a], c[b]])
  }, [actualH])

  return (
    <group
      position={[pos.x, 0, pos.y]}
      onClick={onClick}
      onPointerOver={(e) => {
        if (compareMode !== 'staging' && !interactive) return // dimmed → inert
        e.stopPropagation()
        setHovered(service.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (compareMode !== 'staging' && !interactive) return
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

      {/* Expected-traffic rim — a single flat white ring at the average height. */}
      <lineSegments position={[0, expectedH, 0]} raycast={() => null}>
        <edgesGeometry args={[rimGeom]} />
        <lineBasicMaterial color={theme.textPrimary} transparent opacity={0.9 * dim} />
      </lineSegments>
      {/* Selection/hover outline — on the BAR only, doubled stroke width. */}
      {(selected || hovered || inCompare) && (
        <Line
          points={barEdges}
          segments
          color={outlineColor}
          lineWidth={selected ? 3 : 1.5}
          raycast={() => null}
        />
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

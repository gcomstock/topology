import { useMemo, useRef } from 'react'
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColor } from '../lib/color'
import { sampleAt } from '../lib/timeseries'
import type { Edge } from '../types'

const EDGE_Y = 0.06

// Map edge latency (ms) to dash crawl speed. Higher latency = slower crawl.
// Returns offset velocity (units/sec); sign sets direction source→target.
function dashSpeed(latencyMs: number): number {
  const norm = Math.min(1, latencyMs / 600) // 0..1 across a plausible range
  // slow (0.15) when high latency, fast (1.4) when low latency
  return 1.4 - norm * 1.25
}

function EdgeLine({ edge }: { edge: Edge }) {
  const theme = useTheme()
  const a = useStore((s) => s.positions[edge.source])
  const b = useStore((s) => s.positions[edge.target])
  const clock = useStore((s) => s.clock)
  const data = useStore((s) => s.data)!
  const blast = useStore((s) => s.blastSet)
  const lineRef = useRef<any>(null)

  const series = data.timeseries.perEdge[edge.id]
  const health = sampleAt(series?.health, clock)
  const latency = sampleAt(series?.latencyMs, clock)
  const speed = dashSpeed(latency)

  const points = useMemo(() => {
    if (!a || !b) return [new THREE.Vector3(), new THREE.Vector3()]
    return [
      new THREE.Vector3(a.x, (a.elev ?? 0) + EDGE_Y, a.y),
      new THREE.Vector3(b.x, (b.elev ?? 0) + EDGE_Y, b.y),
    ]
  }, [a, b])

  const color = useMemo(() => healthColor(health, theme), [health, theme])

  const blastActive = blast.size > 0
  // An edge is "associated" only if BOTH endpoints are in the highlight set, so
  // hovering a node lights up just its incident edges and dims the rest hard.
  const onPath = blastActive && blast.has(edge.source) && blast.has(edge.target)
  const dim = blastActive && !onPath ? 0.05 : 1

  useFrame((_, delta) => {
    if (lineRef.current?.material) {
      // Slow crawl — fast enough to read direction, calm enough not to distract.
      lineRef.current.material.dashOffset -= speed * delta * 0.2
    }
  })

  if (!a || !b) return null

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={onPath ? 2.2 : 1.1}
      transparent
      opacity={(0.55 + health * 0.2) * dim}
      dashed
      dashSize={0.12}
      gapSize={0.09}
      dashScale={1}
    />
  )
}

export function Edges() {
  const edges = useStore((s) => s.data?.topology.edges ?? [])
  return (
    <group>
      {edges.map((e) => (
        <EdgeLine key={e.id} edge={e} />
      ))}
    </group>
  )
}

import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { MapControls, OrthographicCamera } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { GridField } from './GridField'
import { Nodes } from './Nodes'
import { Edges } from './Edges'
import { Labels } from './Labels'
import { EventBubbles } from './EventBubbles'
import { AnchorLabels } from './AnchorLabels'
import { CameraRig, controlsRef } from './CameraRig'

// Fixed isometric camera poses per layout. The angle is LOCKED (no orbit) and the
// camera is ORTHOGRAPHIC — a true 3/4 isometric so depth doesn't shrink distant
// nodes (denser, more legible). `zoom` = pixels per world unit.
const POSES: Record<
  string,
  { pos: [number, number, number]; target: [number, number, number]; zoom: number }
> = {
  // Low azimuth so the wide LR graph runs screen-horizontal (not a long diagonal).
  flow: { pos: [9, 20, 40], target: [0, 0, 0], zoom: 30 },
  organic: { pos: [12, 18, 28], target: [0, 0, 0], zoom: 22 },
  // Grouped clusters spread in 2D → square-ish iso framing.
  grouped: { pos: [20, 24, 30], target: [0, 0, 0], zoom: 18 },
  // Layered keeps its tall-stack framing (secondary mode).
  layered: { pos: [12, 26, 42], target: [0, 11, 0], zoom: 28 },
}

// Isometric offset (camera − target) used to frame the grouped clusters around
// their own bounds center, with a zoom that adapts to each attribute's spread.
const GROUPED_OFFSET: [number, number, number] = [16, 22, 26]

export function resetView() {
  const c = controlsRef.current
  if (!c) return
  const st = useStore.getState()
  if (st.layoutMode === 'grouped') {
    const b = st.bounds
    const cx = (b.minX + b.maxX) / 2
    const cz = (b.minY + b.maxY) / 2
    const extent = Math.max(b.w, b.h, 4)
    c.object.position.set(cx + GROUPED_OFFSET[0], GROUPED_OFFSET[1], cz + GROUPED_OFFSET[2])
    c.object.zoom = Math.max(9, Math.min(48, 820 / (extent + 10)))
    c.target.set(cx, 0, cz)
  } else {
    const pose = POSES[st.layoutMode] ?? POSES.flow
    c.object.position.set(...pose.pos)
    c.object.zoom = pose.zoom
    c.target.set(...pose.target)
  }
  c.object.updateProjectionMatrix()
  c.update()
}

export function Scene() {
  const theme = useTheme()
  const data = useStore((s) => s.data)
  const select = useStore((s) => s.select)
  const layoutMode = useStore((s) => s.layoutMode)

  // Reframe to the locked pose whenever the layout changes (and on mount).
  useEffect(() => {
    const id = requestAnimationFrame(resetView)
    return () => cancelAnimationFrame(id)
  }, [layoutMode, data])

  if (!data) return null

  const initial = POSES[layoutMode] ?? POSES.flow

  return (
    <Canvas
      dpr={[1, 2]}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <OrthographicCamera makeDefault position={initial.pos} zoom={initial.zoom} near={-100} far={600} />
      <color attach="background" args={[theme.bgBase]} />

      {/* No shadows (perf + visual simplicity). Light is just for the node solids. */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 22, 10]} intensity={1.3} />
      <hemisphereLight args={[theme.accentBlue, theme.bgBase, 0.25]} />

      {/* The line grid floor (sinks + recolors with burn) — flat layouts only. */}
      {layoutMode !== 'layered' && <GridField />}
      <Edges />
      <Nodes />
      <Labels />
      {layoutMode === 'grouped' && <AnchorLabels />}
      <EventBubbles />

      <CameraRig />
      {/* Locked-angle camera: left-drag pans, wheel/trackpad zooms, NO rotation. */}
      <MapControls
        ref={controlsRef as any}
        makeDefault
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        screenSpacePanning
        minZoom={7}
        maxZoom={130}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />

      <EffectComposer>
        <Bloom
          intensity={theme.bloomIntensity}
          luminanceThreshold={theme.bloomThreshold}
          luminanceSmoothing={0.18}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}

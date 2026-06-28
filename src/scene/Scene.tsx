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
  // Layered keeps its tall-stack framing (secondary mode).
  layered: { pos: [12, 26, 42], target: [0, 11, 0], zoom: 28 },
}

export function resetView() {
  const c = controlsRef.current
  if (!c) return
  const pose = POSES[useStore.getState().layoutMode] ?? POSES.flow
  c.object.position.set(...pose.pos)
  c.object.zoom = pose.zoom
  c.object.updateProjectionMatrix()
  c.target.set(...pose.target)
  c.update()
}

export function Scene() {
  const theme = useTheme()
  const data = useStore((s) => s.data)
  const select = useStore((s) => s.select)
  const layoutMode = useStore((s) => s.layoutMode)

  // Reframe to the locked pose whenever the layout mode changes (and on mount).
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

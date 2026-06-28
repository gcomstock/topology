import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { MapControls, OrthographicCamera } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { GroundGrid } from './GroundGrid'
import { Nodes } from './Nodes'
import { Edges } from './Edges'
import { Terrain } from './Terrain'
import { Labels } from './Labels'
import { EventBubbles } from './EventBubbles'
import { CameraRig, controlsRef } from './CameraRig'

// Fixed isometric camera poses per layout. The angle is LOCKED (no orbit) and the
// camera is ORTHOGRAPHIC — a true 3/4 isometric so depth doesn't shrink distant
// nodes (denser, more legible). Equal X/Z offset = 45° azimuth; the height gives
// the ~30° elevation. `zoom` = pixels per world unit (drives apparent size).
const POSES: Record<
  string,
  { pos: [number, number, number]; target: [number, number, number]; zoom: number }
> = {
  // Gentle azimuth/elevation: layer width runs screen-horizontal, the layer
  // stack runs screen-vertical, and the shallow Z gives the 3/4 isometric tilt.
  layered: { pos: [12, 28, 42], target: [0, 13, 0], zoom: 27 },
  flow: { pos: [16, 20, 30], target: [0, 0, 0], zoom: 28 },
  organic: { pos: [16, 20, 30], target: [0, 0, 0], zoom: 28 },
}

export function resetView() {
  const c = controlsRef.current
  if (!c) return
  const pose = POSES[useStore.getState().layoutMode] ?? POSES.layered
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

  const initial = POSES[layoutMode] ?? POSES.layered

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <OrthographicCamera
        makeDefault
        position={initial.pos}
        zoom={initial.zoom}
        near={-100}
        far={600}
      />
      <color attach="background" args={[theme.bgBase]} />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[10, 22, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
      />
      <hemisphereLight args={[theme.accentBlue, theme.bgBase, 0.25]} />

      {/* Ground grid + terrain belong to the flat layouts; the layered view
          floats its stack and spends the vertical axis on structure instead. */}
      {layoutMode !== 'layered' && <GroundGrid />}
      {layoutMode !== 'layered' && <Terrain />}
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
        minZoom={9}
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

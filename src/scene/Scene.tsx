import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { GroundGrid } from './GroundGrid'
import { Nodes } from './Nodes'
import { Edges } from './Edges'
import { Terrain } from './Terrain'
import { Labels } from './Labels'
import { EventBubbles } from './EventBubbles'
import { CameraRig, controlsRef } from './CameraRig'

export function resetView() {
  const c = controlsRef.current
  if (c) {
    c.object.position.set(11, 9, 11)
    c.target.set(0, 0, 0)
    c.update()
  }
}

export function Scene() {
  const theme = useTheme()
  const data = useStore((s) => s.data)
  const select = useStore((s) => s.select)

  if (!data) return null

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [11, 9, 11], fov: 42, near: 0.1, far: 200 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[theme.bgBase]} />
      <fog attach="fog" args={[theme.bgBase, 22, 60]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
      <hemisphereLight args={[theme.accentBlue, theme.bgBase, 0.25]} />

      <GroundGrid />
      <Terrain />
      <Edges />
      <Nodes />
      <Labels />
      <EventBubbles />

      <CameraRig />
      <OrbitControls
        ref={controlsRef as any}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={45}
        maxPolarAngle={Math.PI / 2.05}
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

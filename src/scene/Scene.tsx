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

// Isometric camera framing per layout. The angle is LOCKED (no orbit) and the
// camera is ORTHOGRAPHIC. `off` = camera−target direction (magnitude only sets
// clip depth); `targetY`/`yTop` describe the vertical extent to frame. The zoom
// is computed to FIT the layout into the actual viewport (measured), filled tight
// so each chart opens zoomed-in.
const FRAMES: Record<
  string,
  { off: [number, number, number]; targetY: number; yTop: number }
> = {
  // Low azimuth so the wide LR graph runs screen-horizontal (not a long diagonal).
  flow: { off: [9, 20, 40], targetY: 0, yTop: 3.6 },
  organic: { off: [12, 18, 28], targetY: 0, yTop: 3.6 },
  grouped: { off: [16, 22, 26], targetY: 0, yTop: 3.6 },
  layered: { off: [12, 26, 42], targetY: 11, yTop: 24 },
}

// >1 overfills the viewport (zoomed in, edges/sky cropped but pannable).
const FILL = 1.3

export function resetView() {
  const c = controlsRef.current
  if (!c || !c.object) return
  const st = useStore.getState()
  const b = st.bounds
  const f = FRAMES[st.layoutMode] ?? FRAMES.flow
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minY + b.maxY) / 2
  const cam = c.object as THREE.OrthographicCamera

  cam.position.set(cx + f.off[0], f.targetY + f.off[1], cz + f.off[2])
  c.target.set(cx, f.targetY, cz)
  cam.zoom = 1
  cam.updateProjectionMatrix()
  c.update() // orient toward target
  cam.updateMatrixWorld()

  // Project the layout's bounding box corners and pick the zoom that fits them
  // into the measured viewport (NDC ∈ [-1,1]).
  let maxAbs = 1e-4
  const v = new THREE.Vector3()
  for (const X of [b.minX, b.maxX])
    for (const Y of [0, f.yTop])
      for (const Z of [b.minY, b.maxY]) {
        v.set(X, Y, Z).project(cam)
        maxAbs = Math.max(maxAbs, Math.abs(v.x), Math.abs(v.y))
      }
  cam.zoom = Math.max(5, Math.min(200, FILL / maxAbs))
  cam.updateProjectionMatrix()
  c.update()
}

export function Scene() {
  const theme = useTheme()
  const data = useStore((s) => s.data)
  const select = useStore((s) => s.select)
  const layoutMode = useStore((s) => s.layoutMode)

  // Reframe to the locked pose whenever the layout changes (and on mount). The
  // controls ref isn't set on the first frame, so poll until it's ready.
  useEffect(() => {
    let raf = 0
    let tries = 0
    const tick = () => {
      if (controlsRef.current?.object) resetView()
      else if (tries++ < 90) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layoutMode, data])

  if (!data) return null

  const initial = FRAMES[layoutMode] ?? FRAMES.flow

  return (
    <Canvas
      dpr={[1, 2]}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      {/* Initial pose; resetView() refits zoom to the measured viewport on mount. */}
      <OrthographicCamera makeDefault position={initial.off} zoom={20} near={-100} far={600} />
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

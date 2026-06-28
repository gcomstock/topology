import { useRef, useEffect, createRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

// Shared ref to MapControls so UI buttons (reset view) can drive the camera.
export const controlsRef = createRef<any>()

// On node selection we PAN the locked-angle camera to center the node — moving
// the camera and the controls target by the same delta so the viewing angle is
// preserved (no tilt/orbit). This re-targets the inspector in place without
// redrawing a neighborhood graph.
export function CameraRig() {
  const selectedId = useStore((s) => s.selectedId)
  const positions = useStore((s) => s.positions)
  const { camera } = useThree()
  const desiredTarget = useRef(new THREE.Vector3())
  const animating = useRef(false)

  useEffect(() => {
    if (!selectedId) return
    const p = positions[selectedId]
    if (!p) return
    desiredTarget.current.set(p.x, p.elev ?? 0, p.y)
    animating.current = true
  }, [selectedId, positions])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls || !animating.current) return
    // delta toward the desired target, applied to BOTH camera and target → pan.
    const next = controls.target.clone().lerp(desiredTarget.current, 0.1)
    const delta = next.clone().sub(controls.target)
    camera.position.add(delta)
    controls.target.copy(next)
    controls.update()
    if (controls.target.distanceTo(desiredTarget.current) < 0.02) animating.current = false
  })

  return null
}

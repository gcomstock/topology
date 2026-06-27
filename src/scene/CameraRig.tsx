import { useRef, useEffect, createRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

// Shared ref to OrbitControls so UI buttons (reset view) can drive the camera.
export const controlsRef = createRef<any>()

// On node selection the topology "recenters/scales around the active node" so
// its neighbors are visible (spec §6) — we glide the orbit target to the node
// and ease the camera in, without redrawing a new neighborhood graph.
export function CameraRig() {
  const selectedId = useStore((s) => s.selectedId)
  const positions = useStore((s) => s.positions)
  const { camera } = useThree()
  const desiredTarget = useRef(new THREE.Vector3())
  const animating = useRef(false)
  const desiredDist = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedId) return
    const p = positions[selectedId]
    if (!p) return
    desiredTarget.current.set(p.x, 0, p.y)
    desiredDist.current = 9
    animating.current = true
  }, [selectedId, positions])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls || !animating.current) return
    controls.target.lerp(desiredTarget.current, 0.08)

    if (desiredDist.current != null) {
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
      const curDist = dir.length()
      const nextDist = THREE.MathUtils.lerp(curDist, desiredDist.current, 0.06)
      dir.normalize().multiplyScalar(nextDist)
      camera.position.copy(controls.target).add(dir)
    }

    controls.update()
    if (controls.target.distanceTo(desiredTarget.current) < 0.02) {
      animating.current = false
      desiredDist.current = null
    }
  })

  return null
}

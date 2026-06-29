import { useRef, useEffect, createRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

// Shared ref to MapControls so UI buttons (reset view) can drive the camera.
export const controlsRef = createRef<any>()

// On node selection we PAN the locked-angle camera (camera + target by the same
// delta, preserving the angle) so the focused node lands in the VISIBLE region —
// the part of the canvas not covered by the overlaid detail panel. On dismiss we
// pan back to the layout center. The canvas is never resized, so the pan is the
// only motion (smooth) — no GL-reflow pop.
export function CameraRig() {
  const selectedId = useStore((s) => s.selectedId)
  const positions = useStore((s) => s.positions)
  const bounds = useStore((s) => s.bounds)
  const { camera } = useThree()
  const desiredTarget = useRef(new THREE.Vector3())
  const animating = useRef(false)
  const everSelected = useRef(false)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    if (selectedId) {
      const p = positions[selectedId]
      if (!p) return
      everSelected.current = true
      const t = new THREE.Vector3(p.x, p.elev ?? 0, p.y)
      // Shift the target along screen-right by half the panel width so the node
      // sits centered in the uncovered area (ortho: world units = pixels / zoom).
      const panelW =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 720
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize()
      t.addScaledVector(right, panelW / 2 / zoom)
      desiredTarget.current.copy(t)
      animating.current = true
    } else if (everSelected.current) {
      // Dismiss → recenter the overview (keep current height/angle).
      desiredTarget.current.set(
        (bounds.minX + bounds.maxX) / 2,
        controls.target.y,
        (bounds.minY + bounds.maxY) / 2,
      )
      animating.current = true
    }
  }, [selectedId, positions, bounds, camera])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls || !animating.current) return
    // delta toward the desired target, applied to BOTH camera and target → pan.
    const next = controls.target.clone().lerp(desiredTarget.current, 0.16)
    const delta = next.clone().sub(controls.target)
    camera.position.add(delta)
    controls.target.copy(next)
    controls.update()
    if (controls.target.distanceTo(desiredTarget.current) < 0.01) animating.current = false
  })

  return null
}

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
  const panToId = useStore((s) => s.panToId)
  const panToSeq = useStore((s) => s.panToSeq)
  const { camera } = useThree()
  const desiredTarget = useRef(new THREE.Vector3())
  const animating = useRef(false)
  const everSelected = useRef(false)

  // Target that centers a node in the VISIBLE region — shifted along screen-right
  // by half the panel width when the detail panel covers the right side
  // (ortho: world units = pixels / zoom).
  const centerTargetFor = (x: number, z: number, panelOpen: boolean) => {
    const t = new THREE.Vector3(x, 0, z)
    if (panelOpen) {
      const panelW =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 720
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize()
      t.addScaledVector(right, panelW / 2 / zoom)
    }
    return t
  }

  // Pan on selection: center the node (offset for the open panel) or recenter the
  // overview on dismiss.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (selectedId) {
      const p = positions[selectedId]
      if (!p) return
      everSelected.current = true
      desiredTarget.current.copy(centerTargetFor(p.x, p.y, true))
      animating.current = true
    } else if (everSelected.current) {
      desiredTarget.current.set(
        (bounds.minX + bounds.maxX) / 2,
        controls.target.y,
        (bounds.minY + bounds.maxY) / 2,
      )
      animating.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, positions, bounds, camera])

  // Pan on request (hovering a Top Concerns row) — center that node.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !panToId) return
    const p = positions[panToId]
    if (!p) return
    desiredTarget.current.copy(centerTargetFor(p.x, p.y, !!selectedId))
    animating.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panToSeq])

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

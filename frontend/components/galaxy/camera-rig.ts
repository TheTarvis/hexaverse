// Galaxy camera rig — the RTS pan-orbit model, spec #0002 Decision #8.
//
// Own OrbitControls and set camera.up = +Z before construction so the
// galactic disk and all orbit/pan gestures share the same coordinate basis.
// GalaxyGraph advances this rig from its single presentation loop; standalone
// callers can retain the default internally scheduled updates.
//
// Model: the XY galactic disk is the ground; you hover above it looking down/in.
//  - orbit          — left-drag / one-finger.
//  - ground pan     — two-finger swipe (capture-phase wheel interceptor), speed
//                     scaled by camera HEIGHT above the disk, not slant distance.
//  - zoom = dolly   — pinch (ctrl+wheel falls through to OrbitControls).
//  - pitch UNCLAMPED (pole-to-pole); damping on.
//
// Camera "by-feel" knobs (auto-follow, pan bounds, zoom clamps, keybindings)
// are left for Travis to tune — sensible defaults + TODO(travis-feel) markers.

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GalaxyBounds } from '@/lib/types/galaxy'

interface Neuterable {
  enabled: boolean
  enableDamping?: boolean
}

type Vec3 = { x: number; y: number; z: number }

// Standard oblique framing offset (relative to a focused system), Z-up: sit
// above and to one side so the disk reads at an angle with the star centred.
// TODO(travis-feel): the framing distance/angle is the "spawned on the rim,
// looking inward" default — tune the multipliers to taste.
const FRAME_DIST = 240
const FRAME_OFFSET = new THREE.Vector3(0.15, -0.6, 0.7)

export class CameraRig {
  readonly controls: OrbitControls
  private camera: THREE.PerspectiveCamera
  private wrapper: HTMLElement
  private raf = 0
  private disposed = false
  private onWheelCapture: (e: WheelEvent) => void

  // Active glide (double-click focus / recenter). null when idle.
  private glide: {
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    start: number
    ms: number
  } | null = null

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    wrapper: HTMLElement,
    internalControls: Neuterable | null,
    autoUpdate = true,
  ) {
    this.camera = camera
    this.wrapper = wrapper

    // Neuter the force-graph's own controls so only this rig drives the camera.
    if (internalControls) {
      internalControls.enabled = false
      internalControls.enableDamping = false
    }

    // World up = Z BEFORE constructing OrbitControls — this is the whole point:
    // the orbit basis is derived from camera.up in the constructor.
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, domElement)
    this.controls = controls

    // Ground-plane pan (not screen-space): pan holds a constant height instead
    // of climbing toward the camera when pitched.
    controls.screenSpacePanning = false
    // Pitch unclamped — full pole-to-pole; makeSafe keeps the poles stable.
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI
    // Damping smooths trackpad inertia into a glide.
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    // Gesture map (trackpad-first): left-drag orbits, right-drag pans, wheel
    // dollies (plain wheel is intercepted below for pan; ctrl+wheel = pinch
    // falls through to dolly).
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    // TODO(travis-feel): zoom (dolly) range clamp — leaving OrbitControls
    // defaults (min 0 / max Infinity). Tune min/maxDistance for the
    // board-tier handoff once that feel is decided.

    // Two-finger swipe -> ground-plane pan. macOS delivers a swipe as a plain
    // `wheel` and a pinch as `wheel` + ctrlKey. We intercept in the CAPTURE
    // phase on the wrapper (before OrbitControls' own canvas listener) so we
    // can preempt zoom on plain wheel; ctrl+wheel falls through to dolly.
    this.onWheelCapture = (e: WheelEvent) => this.handleWheel(e)
    wrapper.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false })

    // Standalone callers may let the rig drive damping; owned renderers pass
    // autoUpdate=false and step it only when presentation is eligible.
    const tick = () => {
      if (this.disposed) return
      this.stepGlide()
      controls.update()
      this.raf = requestAnimationFrame(tick)
    }
    if (autoUpdate) this.raf = requestAnimationFrame(tick)
  }

  update() {
    if (this.disposed) return
    this.stepGlide()
    this.controls.update()
  }

  private handleWheel(e: WheelEvent) {
    if (!this.controls.enabled) return
    if (e.ctrlKey) return // pinch — leave it for OrbitControls to dolly
    const cam = this.camera
    const target = this.controls.target
    e.preventDefault()
    e.stopPropagation()
    // world-units-per-pixel scaled by the camera's HEIGHT above the disk, not
    // its slant distance — at a grazing pitch the slant stays large while the
    // camera sits low, so distance-scaling flings the foreground past you.
    // abs() so swipe-pan keeps working when orbited under the disk.
    const height = Math.max(1, Math.abs(cam.position.z - target.z))
    const perPx =
      (2 * height * Math.tan(((cam.fov ?? 50) / 2) * (Math.PI / 180))) /
      (this.wrapper.clientHeight || 1)
    // camera right + forward, flattened onto the z=0 ground plane (up = Z)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0)
    right.z = 0
    right.normalize()
    const forward = new THREE.Vector3(-right.y, right.x, 0) // worldUp(Z) x right
    // grab-the-map feel: content follows the fingers.
    const move = right
      .multiplyScalar(-e.deltaX * perPx)
      .add(forward.multiplyScalar(e.deltaY * perPx))
    cam.position.add(move)
    target.add(move)
    this.controls.update()
  }

  private stepGlide() {
    const g = this.glide
    if (!g) return
    const t = Math.min(1, (performance.now() - g.start) / g.ms)
    // ease-in-out
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    this.camera.position.copy(g.fromPos.clone().lerp(g.toPos, e))
    this.controls.target.copy(g.fromTarget.clone().lerp(g.toTarget, e))
    if (t >= 1) this.glide = null
  }

  /**
   * Glide a system to centre, PRESERVING the current viewing angle & zoom
   * (double-click focus). The camera keeps its offset from the target so
   * orbit/pan/zoom pivot on the new star with no jump.
   */
  focus(pos: Vec3, ms = 600) {
    const target = new THREE.Vector3(pos.x, pos.y, pos.z)
    const offset = this.camera.position.clone().sub(this.controls.target)
    this.startGlide(target.clone().add(offset), target, ms)
  }

  /**
   * Snap to the standard oblique framing on a system (⌖ recenter): reset the
   * viewing angle/distance, not just the target.
   */
  recenter(pos: Vec3, ms = 600) {
    const target = new THREE.Vector3(pos.x, pos.y, pos.z)
    const camPos = target.clone().add(FRAME_OFFSET.clone().multiplyScalar(FRAME_DIST))
    this.startGlide(camPos, target, ms)
  }

  private startGlide(toPos: THREE.Vector3, toTarget: THREE.Vector3, ms: number) {
    if (ms <= 0) {
      this.camera.position.copy(toPos)
      this.controls.target.copy(toTarget)
      this.controls.update()
      return
    }
    this.glide = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      start: performance.now(),
      ms,
    }
  }

  /**
   * Seed the initial framing from the galaxy bounds — centre the disk and back
   * off far enough to see it all, in the standard oblique angle.
   */
  frameBounds(bounds: GalaxyBounds) {
    const cx = (bounds.x[0] + bounds.x[1]) / 2
    const cy = (bounds.y[0] + bounds.y[1]) / 2
    const cz = (bounds.z[0] + bounds.z[1]) / 2
    const span = Math.max(bounds.x[1] - bounds.x[0], bounds.y[1] - bounds.y[0])
    const target = new THREE.Vector3(cx, cy, cz)
    // back off ~1x the span along the oblique offset so the whole disk frames.
    const dist = Math.max(FRAME_DIST, span * 1.1)
    const camPos = target.clone().add(FRAME_OFFSET.clone().normalize().multiplyScalar(dist))
    this.startGlide(camPos, target, 0)
  }

  dispose() {
    this.disposed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.wrapper.removeEventListener('wheel', this.onWheelCapture, { capture: true })
    this.controls.dispose()
  }
}

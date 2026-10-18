// Shared Galaxy-feel camera/input owner. Scenes adapt coordinates, limits and focus.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
export interface MapBounds { x: [number, number]; y: [number, number]; z: [number, number] }
export type CameraIntent = 'orbit' | 'pan' | 'zoom'
export interface MapCameraOptions {
  up?: THREE.Vector3
  minDistance?: number
  maxDistance?: number
  minPolarAngle?: number
  maxPolarAngle?: number
  maxTargetRadius?: number
  keyPanDistance?: number
  onIntent?: (intent: CameraIntent) => void
  onChange?: () => void
  onRest?: () => void
  onHome?: () => void
  onConfirm?: () => void
}


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

export class MapCameraRig {
  readonly controls: OrbitControls
  private camera: THREE.PerspectiveCamera
  private input: HTMLElement
  private wrapper: HTMLElement
  private raf = 0
  private disposed = false
  private stepping = false
  private awaitingRest = false
  private changed: () => void
  private onKey: (event: KeyboardEvent) => void
  private onPointerIntent: (event: PointerEvent) => void
  private options: MapCameraOptions
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
    options: MapCameraOptions = {},
  ) {
    this.input = domElement
    this.options = options
    this.camera = camera
    this.wrapper = wrapper

    // Neuter the force-graph's own controls so only this rig drives the camera.
    if (internalControls) {
      internalControls.enabled = false
      internalControls.enableDamping = false
    }

    // World up = Z BEFORE constructing OrbitControls — this is the whole point:
    // the orbit basis is derived from camera.up in the constructor.
    camera.up.copy(options.up ?? new THREE.Vector3(0, 0, 1))
    const controls = new OrbitControls(camera, domElement)
    this.controls = controls

    // Ground-plane pan (not screen-space): pan holds a constant height instead
    // of climbing toward the camera when pitched.
    controls.screenSpacePanning = false
    // Pitch unclamped — full pole-to-pole; makeSafe keeps the poles stable.
    controls.minPolarAngle = options.minPolarAngle ?? 0
    controls.maxPolarAngle = options.maxPolarAngle ?? Math.PI
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
    controls.minDistance = options.minDistance ?? 0
    controls.maxDistance = options.maxDistance ?? Infinity
    controls.maxTargetRadius = options.maxTargetRadius ?? Infinity
    this.changed = () => { if (!this.stepping) this.awaitingRest = true; this.publish(); options.onChange?.() }
    controls.addEventListener('change', this.changed)
    this.onPointerIntent = event => {
      if (!controls.enabled || domElement.closest('[inert]')) return
      this.glide = null
      const intent = event.pointerType === 'touch'
        ? (event.isPrimary === false ? 'pan' : 'orbit')
        : event.button === 1 ? 'zoom' : event.button === 2 || event.ctrlKey || event.metaKey || event.shiftKey ? 'pan' : 'orbit'
      options.onIntent?.(intent)
    }
    // Capture precedes OrbitControls so the scene adapter can release following.
    domElement.addEventListener('pointerdown', this.onPointerIntent, true)
    this.onKey = event => this.handleKey(event)
    domElement.addEventListener('keydown', this.onKey)

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
      this.update()
      this.raf = requestAnimationFrame(tick)
    }
    if (autoUpdate) this.raf = requestAnimationFrame(tick)
  }

  update() {
    if (this.disposed) return
    const before = this.camera.position.clone().sub(this.controls.target)
    this.stepping = true
    try { this.stepGlide(); this.controls.update() } finally { this.stepping = false }
    this.publish()
    // Follow translation does not count as residual camera motion. Publish
    // coarse overlay membership once damping settles, never every frame.
    if (this.awaitingRest && !this.glide && before.distanceTo(this.camera.position.clone().sub(this.controls.target)) < 1e-7) {
      this.awaitingRest = false
      this.options.onRest?.()
    }
  }

  clearMotion() {
    const damping = this.controls.enableDamping
    this.controls.enableDamping = false
    this.controls.update()
    this.controls.enableDamping = damping
  }

  private publish() {
    const value = JSON.stringify({ position: this.camera.position.toArray(), target: this.controls.target.toArray(), up: this.camera.up.toArray() })
    if (this.input.dataset.mapCamera !== value) this.input.dataset.mapCamera = value
  }

  private handleWheel(e: WheelEvent) {
    if (!this.controls.enabled) return
    this.options.onIntent?.(e.ctrlKey ? 'zoom' : 'pan')
    if (e.ctrlKey) return // pinch — leave it for OrbitControls to dolly
    const cam = this.camera
    const target = this.controls.target
    e.preventDefault()
    e.stopPropagation()
    // world-units-per-pixel scaled by the camera's HEIGHT above the disk, not
    // its slant distance — at a grazing pitch the slant stays large while the
    // camera sits low, so distance-scaling flings the foreground past you.
    // abs() so swipe-pan keeps working when orbited under the disk.
    const up = cam.up.clone().normalize()
    const height = Math.max(1, Math.abs(cam.position.clone().sub(target).dot(up)))
    const perPx = (2 * height * Math.tan(((cam.fov ?? 50) / 2) * (Math.PI / 180))) / (this.wrapper.clientHeight || 1)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0)
    right.addScaledVector(up, -right.dot(up)).normalize()
    const forward = new THREE.Vector3().crossVectors(up, right)
    // grab-the-map feel: content follows the fingers.
    const move = right
      .multiplyScalar(-e.deltaX * perPx)
      .add(forward.multiplyScalar(e.deltaY * perPx))
    cam.position.add(move)
    target.add(move)
    this.controls.update()
  }

  private handleKey(event: KeyboardEvent) {
    if (!this.controls.enabled || event.target !== this.controls.domElement || event.altKey || event.ctrlKey || event.metaKey) return
    const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
    const step = direction[event.key]
    if (step) {
      this.options.onIntent?.(event.shiftKey ? 'pan' : 'orbit')
      this.glide = null
      const offset = this.camera.position.clone().sub(this.controls.target)
      if (event.shiftKey) {
        const up = this.camera.up.clone().normalize()
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0)
        right.addScaledVector(up, -right.dot(up)).normalize()
        const forward = new THREE.Vector3().crossVectors(up, right)
        const distance = this.options.keyPanDistance ?? offset.length() * 0.05
        const move = right.multiplyScalar(step[0] * distance).addScaledVector(forward, step[1] * distance)
        this.camera.position.add(move); this.controls.target.add(move)
      } else {
        const rotation = new THREE.Quaternion().setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0))
        const spherical = new THREE.Spherical().setFromVector3(offset.applyQuaternion(rotation))
        spherical.theta -= step[0] * 0.05
        spherical.phi = THREE.MathUtils.clamp(spherical.phi - step[1] * 0.05, this.controls.minPolarAngle, this.controls.maxPolarAngle)
        spherical.makeSafe()
        offset.setFromSpherical(spherical).applyQuaternion(rotation.invert())
        this.camera.position.copy(this.controls.target).add(offset)
      }
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      this.options.onIntent?.('zoom')
      const offset = this.camera.position.clone().sub(this.controls.target)
      offset.multiplyScalar(['+', '='].includes(event.key) ? 0.9 : 1 / 0.9)
      this.camera.position.copy(this.controls.target).add(offset)
    } else if (event.key === 'Home') { event.preventDefault(); this.clearMotion(); this.glide = null; this.options.onHome?.(); return }
    else if (event.key === 'Enter') { event.preventDefault(); this.options.onConfirm?.(); return }
    else return
    event.preventDefault()
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
  frameBounds(bounds: MapBounds) {
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
    this.input.removeEventListener('keydown', this.onKey)
    this.input.removeEventListener('pointerdown', this.onPointerIntent, true)
    this.controls.removeEventListener('change', this.changed)
    this.controls.dispose()
  }
}

// Shared Galaxy-feel camera/input owner. Scenes adapt coordinates, limits and focus.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
export interface MapBounds { x: [number, number]; y: [number, number]; z: [number, number] }
export type CameraIntent = 'orbit' | 'zoom'
export interface MapCameraTarget { id: string; position: Vec3; activate: () => void }
export interface MapCameraOptions {
  targets?: () => MapCameraTarget[]
  selectedId?: () => string | null | undefined
  up?: THREE.Vector3
  minDistance?: number
  maxDistance?: number
  minPolarAngle?: number
  maxPolarAngle?: number
  maxTargetRadius?: number
  onIntent?: (intent: CameraIntent) => void
  onChange?: () => void
  onRest?: () => void
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
  private onPointerIntent: (event: PointerEvent) => void
  private onPointerMove: (event: PointerEvent) => void
  private onPointerUp: (event: PointerEvent) => void
  private suppressClick = false
  private multiTouch = false
  private touchMode: 'switch' | 'zoom' | 'pinch' | null = null
  private touchFrame = 0
  private touchSwitched = false
  private touchPrevious: { x: number; y: number; distance: number } | null = null
  private wheelGesture = { at: -Infinity, axis: '', amount: 0, switched: false }
  private onClick: (event: MouseEvent) => void
  private presses = new Map<number, { x: number; y: number; currentX: number; currentY: number }>()
  private following: (() => { position: Vec3; rotation?: THREE.Quaternion } | null) | null = null
  private followRotation: THREE.Quaternion | null = null
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
    rotateView: boolean
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
    controls.enablePan = false
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null }
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null }
    controls.minDistance = options.minDistance ?? 0
    controls.maxDistance = options.maxDistance ?? Infinity
    controls.maxTargetRadius = options.maxTargetRadius ?? Infinity
    this.changed = () => { if (!this.stepping) this.awaitingRest = true; this.publish(); options.onChange?.() }
    controls.addEventListener('change', this.changed)
    this.onPointerIntent = event => {
      if (!controls.enabled || domElement.closest('[inert]')) return
      if (event.pointerType !== 'touch' && event.button !== 0) return
      if (!this.presses.size) {
        this.suppressClick = false; this.multiTouch = false
        this.touchMode = null; this.touchSwitched = false
      }
      // Pointer interaction returns keyboard ownership to the canvas on release.
      if (event.target === domElement || event.target instanceof HTMLCanvasElement) domElement.focus({ preventScroll: true })
      this.presses.set(event.pointerId, { x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY })
      if (this.presses.size >= 2) {
        this.multiTouch = true; this.suppressClick = true
        const [a, b] = [...this.presses.values()]
        a.x = a.currentX; a.y = a.currentY; b.x = b.currentX; b.y = b.currentY
        this.touchPrevious = this.touchMetrics()
        this.clearMotion()
      }
    }
    this.onPointerMove = event => {
      const press = this.presses.get(event.pointerId)
      if (!controls.enabled || !press) return
      press.currentX = event.clientX; press.currentY = event.clientY
      if (this.multiTouch) {
        // OrbitControls must never interpret two fingers as pan, or a remaining
        // finger as a fresh orbit after a pinch/swipe.
        event.stopImmediatePropagation()
        if (event.cancelable) event.preventDefault()
        if (this.presses.size === 2) this.handleTouch()
      } else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 6) {
        this.suppressClick = true
        this.interrupt('orbit')
      } else {
        // A small press tremor remains a click rather than a camera rotation.
        event.stopImmediatePropagation()
      }
    }
    this.onPointerUp = event => {
      if (event.type !== 'pointercancel' && controls.enabled && this.presses.has(event.pointerId)) domElement.focus({ preventScroll: true })
      this.presses.delete(event.pointerId)
      if (this.presses.size < 2 && this.touchFrame) { cancelAnimationFrame(this.touchFrame); this.touchFrame = 0 }
      if (this.multiTouch || this.suppressClick) {
        // Keep release-click suppression until the next press.
        this.suppressClick = true
      }
    }
    this.onClick = event => {
      if (event.detail > 0 && this.suppressClick) { event.preventDefault(); event.stopImmediatePropagation() }
    }
    domElement.addEventListener('click', this.onClick, true)
    domElement.addEventListener('pointerdown', this.onPointerIntent, true)
    domElement.addEventListener('pointermove', this.onPointerMove, true)
    domElement.addEventListener('pointerup', this.onPointerUp, true)
    domElement.addEventListener('pointercancel', this.onPointerUp, true)

    // TODO(travis-feel): zoom (dolly) range clamp — leaving OrbitControls
    // defaults (min 0 / max Infinity). Tune min/maxDistance for the
    // board-tier handoff once that feel is decided.

    // Own wheel classification before OrbitControls, including trackpad momentum.
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
    let residual = 0
    this.stepping = true
    try {
      this.stepFollow()
      this.stepGlide()
      const before = this.camera.position.clone().sub(this.controls.target)
      this.controls.update()
      residual = before.distanceTo(this.camera.position.clone().sub(this.controls.target))
    } finally { this.stepping = false }
    this.publish()
    // Follow translation does not count as residual camera motion. Publish
    // coarse overlay membership once damping settles, never every frame.
    if (this.awaitingRest && !this.glide && residual < 1e-7) {
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

  get isFollowing() { return this.following !== null }

  /** Whether scene pointer-up picking must ignore this gesture. */
  get gestureActive() { return this.suppressClick || this.multiTouch }

  private zoom(delta: number) {
    this.interrupt('zoom')
    const offset = this.camera.position.clone().sub(this.controls.target)
    offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(THREE.MathUtils.clamp(delta * 0.002, -1, 1)), this.controls.minDistance, this.controls.maxDistance))
    this.camera.position.copy(this.controls.target).add(offset)
    this.controls.update()
  }

  private switchTarget(direction: number) {
    this.camera.updateMatrixWorld(true)
    const origin = this.controls.target.clone().project(this.camera)
    const width = this.wrapper.clientWidth || 1, height = this.wrapper.clientHeight || 1
    let nearest: MapCameraTarget | undefined, distance = Infinity
    for (const target of this.options.targets?.() ?? []) {
      if (target.id === this.options.selectedId?.()) continue
      const projected = new THREE.Vector3().copy(target.position).project(this.camera)
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) continue
      const dx = (projected.x - origin.x) * width / 2
      if (dx * direction <= 0) continue
      const d = Math.hypot(dx, (projected.y - origin.y) * height / 2)
      if (d < distance) { nearest = target; distance = d }
    }
    nearest?.activate()
  }

  private touchMetrics() {
    const [a, b] = [...this.presses.values()]
    return { x: (a.currentX + b.currentX) / 2, y: (a.currentY + b.currentY) / 2,
      distance: Math.hypot(a.currentX - b.currentX, a.currentY - b.currentY) }
  }

  private handleTouch(flush = false) {
    const [a, b] = [...this.presses.values()]
    const current = this.touchMetrics(), previous = this.touchPrevious!
    const dx = current.x - previous.x, dy = current.y - previous.y
    const spread = current.distance - previous.distance
    if (!this.touchMode) {
      // Wait for both fingers before classifying: half of a parallel swipe
      // otherwise looks exactly like a pinch.
      if (!flush && ((a.currentX === a.x && a.currentY === a.y) || (b.currentX === b.x && b.currentY === b.y))) {
        if (!this.touchFrame) this.touchFrame = requestAnimationFrame(() => {
          this.touchFrame = 0
          if (this.controls.enabled && this.presses.size === 2) this.handleTouch(true)
        })
        return
      }
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(spread)) < 8) return
      this.touchMode = Math.abs(spread) > Math.hypot(dx, dy) * 1.5 ? 'pinch' : Math.abs(dy) >= Math.abs(dx) ? 'zoom' : 'switch'
    }
    if (this.touchMode === 'switch') {
      if (!this.touchSwitched && Math.abs(dx) >= 30) { this.touchSwitched = true; this.switchTarget(Math.sign(dx)) }
    } else {
      this.zoom(this.touchMode === 'pinch' ? -spread * 2 : dy * 2)
      this.touchPrevious = current
    }
  }

  private handleWheel(e: WheelEvent) {
    if (!this.controls.enabled || this.input.closest('[inert]')) return
    // HUD scroll events are unrelated to the map even if they share a wrapper.
    if (e.target instanceof Element && e.target !== this.input && !this.input.contains(e.target)) return
    e.preventDefault(); e.stopImmediatePropagation()
    const now = performance.now(), gesture = this.wheelGesture
    if (now - gesture.at > 220) { gesture.axis = ''; gesture.amount = 0; gesture.switched = false }
    gesture.at = now
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (this.wrapper.clientHeight || 800) : 1
    if (e.ctrlKey) gesture.axis = 'y'
    if (!gesture.axis) gesture.axis = !e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y'
    if (gesture.axis === 'y') this.zoom(e.deltaY * unit)
    else {
      gesture.amount += e.deltaX * unit
      if (!gesture.switched && Math.abs(gesture.amount) >= 30) { gesture.switched = true; this.switchTarget(Math.sign(gesture.amount)) }
    }
  }

  private interrupt(intent: CameraIntent) {
    this.glide = null
    this.options.onIntent?.(intent)
  }

  stopFollowing() {
    this.glide = null
    this.following = null
    this.followRotation = null
  }

  /** Follow live positions during and after the glide. Null releases at the last pose. */
  follow(resolve: () => { position: Vec3; rotation?: THREE.Quaternion } | null, distance: number, ms = 600, viewDirection?: Vec3) {
    this.stopFollowing()
    this.clearMotion()
    this.following = resolve
    const target = resolve()
    if (!target) { this.stopFollowing(); return }
    this.followRotation = target.rotation?.clone() ?? null
    this.focus(target.position, ms, distance, viewDirection)
  }

  private stepFollow() {
    if (!this.following) return
    const next = this.following()
    if (!next) { this.stopFollowing(); this.glide = null; return }
    const target = new THREE.Vector3(next.position.x, next.position.y, next.position.z)
    const offset = this.camera.position.clone().sub(this.controls.target)
    const rotation = next.rotation && this.followRotation
      ? next.rotation.clone().multiply(this.followRotation.clone().invert()) : null
    this.followRotation = next.rotation?.clone() ?? null
    if (this.glide) {
      const goalOffset = this.glide.toPos.clone().sub(this.glide.toTarget)
      if (rotation) goalOffset.applyQuaternion(rotation)
      this.glide.toTarget.copy(target)
      this.glide.toPos.copy(target).add(goalOffset)
    } else {
      if (rotation) offset.applyQuaternion(rotation)
      this.controls.target.copy(target)
      this.camera.position.copy(target).add(offset)
    }
  }

  private stepGlide() {
    const g = this.glide
    if (!g) return
    const t = Math.min(1, (performance.now() - g.start) / g.ms)
    // ease-in-out
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    this.controls.target.copy(g.fromTarget.clone().lerp(g.toTarget, e))
    if (g.rotateView) {
      // Swing around the pivot when changing sides, rather than cutting through it.
      // Interpolate azimuth separately so a change of sides cannot tilt the
      // view up over the pole when the requested elevation is unchanged.
      const basis = new THREE.Quaternion().setFromUnitVectors(this.camera.up.clone().normalize(), new THREE.Vector3(0, 1, 0))
      const from = new THREE.Spherical().setFromVector3(g.fromPos.clone().sub(g.fromTarget).applyQuaternion(basis))
      const to = new THREE.Spherical().setFromVector3(g.toPos.clone().sub(g.toTarget).applyQuaternion(basis))
      const turn = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta))
      const pose = new THREE.Spherical(THREE.MathUtils.lerp(from.radius, to.radius, e), THREE.MathUtils.lerp(from.phi, to.phi, e), from.theta + turn * e)
      pose.makeSafe()
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(pose).applyQuaternion(basis.invert()))
    } else this.camera.position.copy(g.fromPos.clone().lerp(g.toPos, e))
    if (t >= 1) this.glide = null
  }

  /**
   * Glide to a target, optionally choosing a new viewing direction. Omit distance to retain
   * zoom; focus/follow callers can instead request a consistent framing.
   */
  focus(pos: Vec3, ms = 600, distance?: number, viewDirection?: Vec3) {
    const target = new THREE.Vector3(pos.x, pos.y, pos.z)
    const offset = this.camera.position.clone().sub(this.controls.target)
    if (viewDirection && Math.hypot(viewDirection.x, viewDirection.y, viewDirection.z) > 0) {
      const length = offset.length()
      offset.copy(viewDirection).setLength(length)
    }
    if (distance !== undefined) offset.setLength(THREE.MathUtils.clamp(distance, this.controls.minDistance, this.controls.maxDistance))
    this.startGlide(target.clone().add(offset), target, ms, viewDirection !== undefined)
  }

  /**
   * Snap to the standard oblique framing on a system (⌖ recenter): reset the
   * viewing angle/distance, not just the target.
   */
  recenter(pos: Vec3, ms = 600) {
    this.stopFollowing()
    const target = new THREE.Vector3(pos.x, pos.y, pos.z)
    const camPos = target.clone().add(FRAME_OFFSET.clone().multiplyScalar(FRAME_DIST))
    this.startGlide(camPos, target, ms)
  }

  private startGlide(toPos: THREE.Vector3, toTarget: THREE.Vector3, ms: number, rotateView = false) {
    this.glide = null
    this.clearMotion()
    this.awaitingRest = true
    if (ms <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
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
      rotateView,
    }
  }

  /**
   * Seed the initial framing from the galaxy bounds — centre the disk and back
   * off far enough to see it all, in the standard oblique angle.
   */
  frameBounds(bounds: MapBounds) {
    this.stopFollowing()
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
    if (this.touchFrame) cancelAnimationFrame(this.touchFrame)
    this.wrapper.removeEventListener('wheel', this.onWheelCapture, { capture: true })
    this.input.removeEventListener('click', this.onClick, true)
    this.input.removeEventListener('pointerdown', this.onPointerIntent, true)
    this.input.removeEventListener('pointermove', this.onPointerMove, true)
    this.input.removeEventListener('pointerup', this.onPointerUp, true)
    this.input.removeEventListener('pointercancel', this.onPointerUp, true)
    this.controls.removeEventListener('change', this.changed)
    this.controls.dispose()
  }
}

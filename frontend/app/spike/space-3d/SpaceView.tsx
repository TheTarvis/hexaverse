'use client'

// SPIKE — the continuous-space GL view for /spike/space-3d.
//
// One self-contained three.js scene: bodies advance on their sim orbits every
// frame, OrbitControls gives pan/zoom/tilt for free (left-drag tilts, right-
// drag pans, wheel dollies), and a click raycasts first against generous
// body proxies, then falls through to the ecliptic plane — so "burn to that
// planet" and "burn to that empty mark" are the same gesture. Everything the
// scene draws is derived per-frame from the pure sim module; this file holds
// no game state beyond prop mirrors for the rAF loop.

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { Button } from '@/components/catalyst/button'
import { createRendererOwner, type RendererOwner, type RendererSnapshot } from '@/components/render-guard/renderer-owner'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  bodyPosition,
  burnBeforeFlip,
  burnPath,
  burnSpeed,
  burnTangent,
  orbitLocalPosition,
  resolveShip,
  shipPosition,
} from './sim'
import type { Burn, ShipState, SystemDef, Target, Vec3 } from './sim'

export interface SimClock {
  t: number
  scale: number
  paused: boolean
}

export interface SpaceViewProps {
  system: SystemDef
  clock: RefObject<SimClock>
  ship: ShipState
  preview: Burn | null
  selected: Target | null
  onPick: (target: Target) => void
  // Fired once when the active burn's arrival time passes — the render loop
  // is the opportunistic resolver here, the way a read is on the backend.
  onArrive: (settled: ShipState) => void
}

const PICK_DRAG_TOLERANCE_PX = 6
const PICK_MAX_RADIUS = 170

const toV = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z)

export function SpaceView({ system, clock, ship, preview, selected, onPick, onArrive }: SpaceViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rendererState, setRendererState] = useState<RendererSnapshot>({ phase: 'pending', backend: null, retrying: false })
  const ownerRef = useRef<RendererOwner | null>(null)

  // Prop mirrors the rAF loop reads without re-running the mount effect.
  const shipRef = useRef(ship)
  const previewRef = useRef(preview)
  const selectedRef = useRef(selected)
  const onPickRef = useRef(onPick)
  const onArriveRef = useRef(onArrive)
  useEffect(() => {
    shipRef.current = ship
    previewRef.current = preview
    selectedRef.current = selected
    onPickRef.current = onPick
    onArriveRef.current = onArrive
  }, [ship, preview, selected, onPick, onArrive])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let canvas = document.createElement('canvas')
    let owner: RendererOwner | null = null
    let intersecting = true
    let disposed = false
    const drawable = () => intersecting && document.visibilityState !== 'hidden' && container.clientWidth > 0 && container.clientHeight > 0

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05060a)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000)
    camera.position.set(0, 110, 170)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 15
    controls.maxDistance = 800

    scene.add(new THREE.AmbientLight(0x8890b0, 0.35))
    const starLight = new THREE.PointLight(0xffe0b0, 3.2, 0, 0)
    scene.add(starLight)

    // Starfield — far shell of unattenuated points.
    {
      const positions = new Float32Array(1200 * 3)
      for (let i = 0; i < 1200; i++) {
        const u = Math.random() * 2 - 1
        const phi = Math.random() * Math.PI * 2
        const r = 900 + Math.random() * 600
        const s = Math.sqrt(1 - u * u)
        positions.set([r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)], i * 3)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      scene.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ color: 0x9aa3c0, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75 })
        )
      )
    }

    // Faint ecliptic grid — depth reference for the free-space click plane.
    const grid = new THREE.PolarGridHelper(PICK_MAX_RADIUS, 12, 8, 96, 0x1c2438, 0x141a2c)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.4
    scene.add(grid)

    // Bodies + generous invisible pick proxies + orbit rings in parent frames.
    const bodyMeshes = new Map<string, THREE.Mesh>()
    const pickProxies: THREE.Mesh[] = []
    const ringGroups: { group: THREE.Group; parentId: string }[] = []
    for (const body of system.bodies) {
      const isStar = body.kind === 'star'
      const material = isStar
        ? new THREE.MeshBasicMaterial({ color: body.color })
        : new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.85, metalness: 0.05 })
      const geometry =
        body.kind === 'station'
          ? new THREE.OctahedronGeometry(body.size * 1.4)
          : new THREE.SphereGeometry(body.size, 28, 18)
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      bodyMeshes.set(body.id, mesh)

      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(body.size * 2.2, 3.2)),
        new THREE.MeshBasicMaterial({ visible: false })
      )
      proxy.userData.bodyId = body.id
      scene.add(proxy)
      pickProxies.push(proxy)

      if (body.orbit) {
        const samples: THREE.Vector3[] = []
        for (let i = 0; i <= 96; i++) {
          samples.push(toV(orbitLocalPosition(body.orbit, (i / 96) * body.orbit.period)))
        }
        const ring = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(samples),
          new THREE.LineBasicMaterial({ color: body.kind === 'moon' ? 0x223048 : 0x28324e, transparent: true, opacity: 0.65 })
        )
        const group = new THREE.Group()
        group.add(ring)
        scene.add(group)
        ringGroups.push({ group, parentId: body.orbit.parentId })
      }

      if (isStar) {
        // Additive halo shell so the star reads as a light source without a post chain.
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(body.size * 1.9, 28, 18),
          new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })
        )
        mesh.add(halo)
      }
    }

    // Belt — a jittered ring of points, slowly shearing.
    let beltPoints: THREE.Points | null = null
    if (system.belt) {
      const positions = new Float32Array(900 * 3)
      for (let i = 0; i < 900; i++) {
        const theta = Math.random() * Math.PI * 2
        const r = system.belt.radius + (Math.random() - 0.5) * 2 * system.belt.width
        positions.set([r * Math.cos(theta), (Math.random() - 0.5) * 2.4, r * Math.sin(theta)], i * 3)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      beltPoints = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: 0x6b6f82, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.8 })
      )
      scene.add(beltPoints)
    }

    // The ship: hull cone + drive plume, oriented along the thrust axis.
    const shipGroup = new THREE.Group()
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 3.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.4, metalness: 0.3, emissive: 0x2a3348, emissiveIntensity: 0.6 })
    )
    shipGroup.add(hull)
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 3.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    plume.rotation.x = Math.PI
    plume.position.y = -3.2
    plume.visible = false
    shipGroup.add(plume)
    scene.add(shipGroup)

    // Trajectory overlays — geometries rewritten per frame from the sim.
    const previewLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0x67e8f9, dashSize: 2.4, gapSize: 1.6, transparent: true, opacity: 0.9 })
    )
    const burnLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xffb454, dashSize: 2.4, gapSize: 1.2 })
    )
    const interceptMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true, transparent: true, opacity: 0.8 })
    )
    // Selection reticle — a camera-facing ring riding the picked body's LIVE
    // position (the ghost shows where it will be; this shows what you picked).
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.12, 48),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    for (const overlay of [previewLine, burnLine, interceptMarker, reticle]) {
      overlay.frustumCulled = false
      overlay.visible = false
      scene.add(overlay)
    }

    const setPath = (line: THREE.Line, points: Vec3[]) => {
      line.geometry.setFromPoints(points.map(toV))
      line.computeLineDistances()
    }

    // The arrival ghost: for a body target it IS the body — a body-sized
    // wireframe at the body's position at arrival ("go to VI"), not a mark
    // at the insertion standoff beside it. Point targets keep a small mark.
    const bodySizes = new Map(system.bodies.map((b) => [b.id, b.size]))
    const placeMarker = (burn: Burn, now: number) => {
      if (burn.target.kind === 'body') {
        interceptMarker.position.copy(toV(bodyPosition(system, burn.target.bodyId, burn.arrive)))
        interceptMarker.scale.setScalar((bodySizes.get(burn.target.bodyId) ?? 1) * (0.9 + Math.sin(now / 180) * 0.05))
      } else {
        interceptMarker.position.copy(toV(burn.intercept))
        interceptMarker.scale.setScalar(1.4 + Math.sin(now / 180) * 0.35)
      }
      interceptMarker.visible = true
    }

    // Picking: a click (not a drag) hits body proxies first, then the ecliptic.
    const raycaster = new THREE.Raycaster()
    const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let downAt: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) downAt = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!downAt || owner?.snapshot().phase !== 'ready') return
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
      downAt = null
      if (moved > PICK_DRAG_TOLERANCE_PX) return
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(pickProxies, false)[0]
      if (hit) {
        onPickRef.current({ kind: 'body', bodyId: hit.object.userData.bodyId as string })
        return
      }
      const point = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(pickPlane, point) && point.length() <= PICK_MAX_RADIUS) {
        onPickRef.current({ kind: 'point', point: { x: point.x, y: point.y, z: point.z } })
      }
    }

    let raf = 0
    let last = performance.now()
    let notifiedBurn: Burn | null = null
    let drawnCommitted: Burn | null = null
    let drawnPreview: Burn | null = null
    const thrustAxis = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)

    const frame = (now: number) => {
      raf = 0
      if (disposed) return
      const state = owner?.snapshot()
      if ((state?.phase === 'unavailable' || state?.phase === 'interrupted') && !state.retrying) return
      if (!drawable()) return
      void owner?.update(() => {
      // No dt cap: every position is closed-form in t, so a huge jump (rAF
      // throttled in a background tab, laptop lid closed) is safe — the world
      // moves on and the fold settles arrivals, exactly the game's contract.
      const dt = (now - last) / 1000
      last = now
      const sim = clock.current
      if (!sim.paused) sim.t += dt * sim.scale
      const t = sim.t

      for (const [id, mesh] of bodyMeshes) {
        mesh.position.copy(toV(bodyPosition(system, id, t)))
      }
      for (const proxy of pickProxies) {
        proxy.position.copy(bodyMeshes.get(proxy.userData.bodyId as string)!.position)
      }
      for (const { group, parentId } of ringGroups) {
        group.position.copy(toV(bodyPosition(system, parentId, t)))
      }
      if (beltPoints) beltPoints.rotation.y += dt * 0.008

      // The ship reads through the fold every frame; arrival notifies once.
      const shipState = shipRef.current
      const resolved = resolveShip(system, shipState, t)
      if (shipState.mode === 'burn' && resolved.mode === 'idle' && notifiedBurn !== shipState.burn) {
        notifiedBurn = shipState.burn
        onArriveRef.current(resolved)
      }
      const shipAt = shipPosition(system, shipState, t)
      shipGroup.position.copy(toV(shipAt))
      if (resolved.mode === 'burn') {
        const burn = resolved.burn
        // Thrust rides the curve tangent — forward to the flip, retro after.
        thrustAxis.copy(toV(burnTangent(burn, t)))
        if (!burnBeforeFlip(burn, t)) thrustAxis.negate()
        shipGroup.quaternion.setFromUnitVectors(up, thrustAxis)
        plume.visible = true
        plume.scale.setScalar(0.5 + Math.min(burnSpeed(burn, t) / 40, 1.2))
        if (drawnCommitted !== burn) {
          drawnCommitted = burn
          setPath(burnLine, burnPath(burn, 48))
        }
        burnLine.visible = true
        placeMarker(burn, now)
      } else {
        drawnCommitted = null
        // A station-keeping ship shows a small steady trim plume — that's fuel.
        plume.visible = resolved.at.kind === 'stationkeep'
        if (plume.visible) plume.scale.setScalar(0.4)
        burnLine.visible = false
        shipGroup.quaternion.identity()
        interceptMarker.visible = false
      }

      const previewBurn = previewRef.current
      if (previewBurn && resolved.mode === 'idle') {
        if (drawnPreview !== previewBurn) {
          drawnPreview = previewBurn
          setPath(previewLine, burnPath(previewBurn, 48))
        }
        previewLine.visible = true
        placeMarker(previewBurn, now)
      } else {
        drawnPreview = null
        previewLine.visible = false
      }

      // Selection highlight: the picked body — or the destination while a
      // burn is in flight — gets a camera-facing ring at its live position.
      const sel = selectedRef.current
      const highlightId =
        sel?.kind === 'body'
          ? sel.bodyId
          : resolved.mode === 'burn' && resolved.burn.target.kind === 'body'
            ? resolved.burn.target.bodyId
            : null
      if (highlightId) {
        reticle.position.copy(bodyMeshes.get(highlightId)!.position)
        reticle.scale.setScalar((bodySizes.get(highlightId) ?? 1) * (1.7 + Math.sin(now / 260) * 0.08))
        reticle.quaternion.copy(camera.quaternion)
        reticle.visible = true
      } else {
        reticle.visible = false
      }

      controls.update()
      }).then(() => owner?.present(scene, camera))
      schedule()
    }
    function schedule() { if (!disposed && !raf && drawable()) raf = requestAnimationFrame(frame) }
    const eligibility = () => {
      owner?.setPresentationEligible(drawable())
      controls.enabled = drawable() && (owner?.snapshot().phase === 'ready' || owner?.snapshot().phase === 'pending')
    }
    owner = createRendererOwner({
      surface: 'space-spike', alpha: false, stencil: false,
      createCanvas: () => document.createElement('canvas'),
      onCanvas: next => {
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointerup', onPointerUp)
        controls.disconnect()
        canvas.remove()
        canvas = next
        canvas.style.cssText = 'width:100%;height:100%;display:block'
        canvas.setAttribute('aria-label', 'Continuous space scene')
        container.prepend(canvas)
        controls.connect(canvas)
        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointerup', onPointerUp)
      },
      onState: state => {
        if (disposed) return
        setRendererState(state)
        if ((state.phase === 'unavailable' || state.phase === 'interrupted') && !state.retrying) { cancelAnimationFrame(raf); raf = 0 }
        else schedule()
        eligibility()
      },
    })
    ownerRef.current = owner
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight
      owner?.resize(width, height, Math.min(window.devicePixelRatio || 1, 2))
      if (width > 0 && height > 0) { camera.aspect = width / height; camera.updateProjectionMatrix() }
      eligibility(); schedule()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    const intersection = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting ?? true; eligibility(); schedule() })
    intersection.observe(container)
    const visibility = () => { eligibility(); schedule() }
    document.addEventListener('visibilitychange', visibility)
    resize()

    return () => {
      disposed = true
      ownerRef.current = null
      owner?.dispose()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((m) => m.dispose())
        }
      })
      canvas.remove()
    }
  }, [system, clock])

  return <div className="absolute inset-0">
    <div ref={containerRef} data-testid="space-gl-stage" className="absolute inset-0" />
    {rendererState.phase !== 'ready' && rendererState.phase !== 'disposed' && <div data-testid="space-gl-fallback" role="status" aria-live="polite" className="absolute inset-0 grid place-content-center gap-3 text-sm text-zinc-400">
      {rendererState.phase === 'pending' ? 'Preparing 3D view…' : rendererState.phase === 'interrupted' ? '3D view interrupted.' : '3D view unavailable.'}
      {rendererState.phase !== 'pending' && <Button data-testid="space-renderer-retry" disabled={rendererState.retrying} onClick={() => ownerRef.current?.retry()}>{rendererState.retrying ? 'Retrying…' : 'Retry'}</Button>}
    </div>}
  </div>
}

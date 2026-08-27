'use client'

// SPIKE — the GL view for /spike/intel. Render-only: the page owns all
// knowledge state (ticked through the pure fold in ./intel); this scene just
// draws the two boards of the game — TRUTH (god view: everything, plus the
// divergence between the real enemy and your prediction) and KNOWLEDGE (only
// what your bubble sees live, plus the timestamped ghost of your latest
// sighting). Same mount-once/refs pattern and GL-unavailable fallback as the
// space-3d SpaceView.

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  bodyPosition,
  burnBeforeFlip,
  burnSpeed,
  burnTangent,
  dist,
  orbitLocalPosition,
  resolveShip,
  shipPosition,
} from '../space-3d/sim'
import type { ShipState, SystemDef, Vec3 } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import {
  BUBBLE_RADIUS,
  SCAN_MAX_RANGE,
  SCAN_SPEED,
  fmtTime,
  inBubble,
  patrolState,
  predictedPosition,
} from './intel'
import type { Knowledge, Patrol } from './intel'

export interface IntelViewProps {
  system: SystemDef
  clock: RefObject<SimClock>
  you: ShipState
  patrol: Patrol
  knowledge: RefObject<Knowledge>
  godMode: boolean
}

const TRACK_PATH_HORIZON = 40 // sim-seconds of predicted rail drawn ahead
const TRACK_PATH_SAMPLES = 48

const toV = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z)

export function IntelView({ system, clock, you, patrol, knowledge, godMode }: IntelViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  const godRef = useRef(godMode)
  useEffect(() => {
    godRef.current = godMode
  }, [godMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05060a)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000)
    camera.position.set(0, 110, 170)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 15
    controls.maxDistance = 800

    scene.add(new THREE.AmbientLight(0x8890b0, 0.35))
    scene.add(new THREE.PointLight(0xffe0b0, 3.2, 0, 0))

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

    const grid = new THREE.PolarGridHelper(170, 12, 8, 96, 0x1c2438, 0x141a2c)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.4
    scene.add(grid)

    // Bodies + orbit rings in parent frames. Non-star bodies get an emissive
    // channel so the scan wavefront can flash them as it sweeps past.
    const bodyMeshes = new Map<string, THREE.Mesh>()
    const flashable: { id: string; material: THREE.MeshStandardMaterial }[] = []
    const ringGroups: { group: THREE.Group; parentId: string }[] = []
    for (const body of system.bodies) {
      const isStar = body.kind === 'star'
      const material = isStar
        ? new THREE.MeshBasicMaterial({ color: body.color })
        : new THREE.MeshStandardMaterial({
            color: body.color,
            roughness: 0.85,
            metalness: 0.05,
            emissive: body.color,
            emissiveIntensity: 0,
          })
      const geometry =
        body.kind === 'station'
          ? new THREE.OctahedronGeometry(body.size * 1.4)
          : new THREE.SphereGeometry(body.size, 28, 18)
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      bodyMeshes.set(body.id, mesh)
      if (!isStar) flashable.push({ id: body.id, material: material as THREE.MeshStandardMaterial })

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
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(body.size * 1.9, 28, 18),
          new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })
        )
        mesh.add(halo)
      }
    }

    // Belt — a jittered ring of points.
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

    // Your ship + the passive sensor bubble riding it.
    const youGroup = new THREE.Group()
    youGroup.add(
      new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.4, metalness: 0.3, emissive: 0x2a3348, emissiveIntensity: 0.6 })
      )
    )
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_RADIUS, 32, 20),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
    youGroup.add(bubble)
    scene.add(youGroup)

    // The enemy: red hull + plume, hidden outside your bubble unless god view.
    const enemyGroup = new THREE.Group()
    enemyGroup.add(
      new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.45, metalness: 0.25, emissive: 0x4a1c1c, emissiveIntensity: 0.7 })
      )
    )
    const enemyPlume = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 3.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    enemyPlume.rotation.x = Math.PI
    enemyPlume.position.y = -3.2
    enemyPlume.visible = false
    enemyGroup.add(enemyPlume)
    scene.add(enemyGroup)

    // The ghost of your latest sighting: amber wireframe + predicted rail
    // (tracks only) + a floating timestamp label.
    const ghost = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.9 })
    )
    const trackLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 2.4, gapSize: 1.6, transparent: true, opacity: 0.7 })
    )
    // God view only: the divorce between prediction and reality.
    const divergenceLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
    )

    // Timestamp label as a canvas sprite — redrawn only when its text changes.
    const labelCanvas = document.createElement('canvas')
    labelCanvas.width = 256
    labelCanvas.height = 40
    const labelCtx = labelCanvas.getContext('2d')
    const labelTexture = new THREE.CanvasTexture(labelCanvas)
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false })
    )
    label.scale.set(22, 3.4, 1)
    let labelText = ''
    const drawLabel = (text: string) => {
      if (text === labelText || !labelCtx) return
      labelText = text
      labelCtx.clearRect(0, 0, 256, 40)
      labelCtx.font = '20px ui-monospace, monospace'
      labelCtx.textAlign = 'center'
      labelCtx.fillStyle = '#fbbf24'
      labelCtx.fillText(text, 128, 27)
      labelTexture.needsUpdate = true
    }

    // The scan pulse wavefront.
    const pulseFront = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true, transparent: true, opacity: 0.4, depthWrite: false })
    )

    // Live-contact flag: a pulsing red camera-facing ring on anything your
    // passive bubble is currently painting.
    const contactRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.14, 48),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )

    for (const overlay of [ghost, trackLine, divergenceLine, label, pulseFront, contactRing]) {
      overlay.frustumCulled = false
      overlay.visible = false
      scene.add(overlay)
    }

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let raf = 0
    let last = performance.now()
    const thrustAxis = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      // Uncapped dt — closed-form positions make big jumps safe (the game's contract).
      const dt = (now - last) / 1000
      last = now
      const sim = clock.current
      if (!sim.paused) sim.t += dt * sim.scale
      const t = sim.t
      const god = godRef.current
      const know = knowledge.current

      for (const [id, mesh] of bodyMeshes) {
        mesh.position.copy(toV(bodyPosition(system, id, t)))
      }
      for (const { group, parentId } of ringGroups) {
        group.position.copy(toV(bodyPosition(system, parentId, t)))
      }
      if (beltPoints) beltPoints.rotation.y += dt * 0.008

      youGroup.position.copy(toV(shipPosition(system, you, t)))

      // The enemy reads through the patrol's fold; visibility is the fog rule.
      const enemyState = resolveShip(system, patrolState(patrol, t), t)
      const enemyAt = shipPosition(system, enemyState, t)
      enemyGroup.position.copy(toV(enemyAt))
      const live = inBubble(system, patrol, you, t)
      enemyGroup.visible = god || live
      contactRing.visible = live
      if (live) {
        contactRing.position.copy(enemyGroup.position)
        contactRing.scale.setScalar(3.4 + Math.sin(now / 140) * 0.5)
        contactRing.quaternion.copy(camera.quaternion)
      }
      if (enemyState.mode === 'burn') {
        thrustAxis.copy(toV(burnTangent(enemyState.burn, t)))
        if (!burnBeforeFlip(enemyState.burn, t)) thrustAxis.negate()
        enemyGroup.quaternion.setFromUnitVectors(up, thrustAxis)
        enemyPlume.visible = true
        enemyPlume.scale.setScalar(0.5 + Math.min(burnSpeed(enemyState.burn, t) / 40, 1.2))
      } else {
        enemyGroup.quaternion.identity()
        enemyPlume.visible = false
      }

      // The ghost renders your latest sighting — hidden while you have live
      // contact (the real thing supersedes it) unless god view compares them.
      const sighting = know.latest
      const showGhost = sighting !== null && (!live || god)
      if (sighting && showGhost) {
        const predicted = predictedPosition(system, sighting, t)
        ghost.position.copy(toV(predicted))
        ghost.rotation.y += dt * 0.8
        ghost.visible = true
        if (sighting.state) {
          const points: THREE.Vector3[] = []
          for (let i = 0; i <= TRACK_PATH_SAMPLES; i++) {
            points.push(toV(predictedPosition(system, sighting, t + (i / TRACK_PATH_SAMPLES) * TRACK_PATH_HORIZON)))
          }
          trackLine.geometry.setFromPoints(points)
          trackLine.computeLineDistances()
          trackLine.visible = true
        } else {
          trackLine.visible = false
        }
        label.position.copy(ghost.position)
        label.position.y += 5
        label.visible = true
        drawLabel(
          `${sighting.quality === 'track' ? 'TRACK' : 'SEEN'} ${fmtTime(sighting.asOf)} · Δ${Math.max(t - sighting.asOf, 0).toFixed(0)}s`
        )
        // God view: the red line from prediction to reality — the divorce.
        const apart = ghost.position.distanceTo(enemyGroup.position)
        divergenceLine.visible = god && apart > 3
        if (divergenceLine.visible) {
          divergenceLine.geometry.setFromPoints([ghost.position, enemyGroup.position])
        }
      } else {
        ghost.visible = false
        trackLine.visible = false
        label.visible = false
        divergenceLine.visible = false
      }

      // The pulse wavefront + body flashes as it sweeps past them.
      const pulse = know.pulse
      if (pulse) {
        const radius = Math.min(SCAN_SPEED * Math.max(t - pulse.emittedAt, 0), SCAN_MAX_RANGE)
        pulseFront.position.copy(toV(pulse.origin))
        pulseFront.scale.setScalar(Math.max(radius, 0.1))
        ;(pulseFront.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - radius / SCAN_MAX_RANGE)
        pulseFront.visible = true
        for (const { id, material } of flashable) {
          const gap = Math.abs(dist(pulse.origin, bodyPosition(system, id, t)) - radius)
          if (gap < 4) material.emissiveIntensity = 0.9
        }
      } else {
        pulseFront.visible = false
      }
      for (const { material } of flashable) {
        if (material.emissiveIntensity > 0) material.emissiveIntensity *= 0.92
      }

      controls.update()
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      labelTexture.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
          obj.geometry.dispose()
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [system, clock, you, patrol, knowledge])

  if (failed) {
    return (
      <div data-testid="intel-gl-fallback" className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
        WebGL unavailable — the intel view needs a GL context.
      </div>
    )
  }
  return <div ref={containerRef} data-testid="intel-gl-stage" className="absolute inset-0" />
}

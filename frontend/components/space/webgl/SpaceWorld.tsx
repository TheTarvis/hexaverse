'use client'

// SpaceWorld — the GL half of the space view: it draws the scene model onto
// the guarded canvas and nothing else. Dynamically imported with SSR
// disabled (three needs a GL context), so it never reaches the server path.
//
// It is a pure CONSUMER of `SceneModel`: every position, radius and curve
// here was resolved by `space-scene.ts` from served values, and every
// projection agrees with `space-projection.ts`'s own basis (same vertical
// field of view, same eye) so a drawn mark and its DOM hit target land in
// the same place. Nothing in this file computes a rule-bearing number, and
// nothing displayed to the player is read back out of it.
//
// WHAT IT DRESSES THE SCENE WITH — lifted from the `/spike/space-3d` look:
// a lit world (one ambient fill plus a point light riding the star), tinted
// bodies by served feature type, an additive halo on the star, faint orbit
// rings in each parent's frame, a jittered particle ring per belt, a far
// starfield shell and a faint ecliptic grid, and a camera-facing reticle on
// the selection. All of it lives in a `decor` group so the world's DIRECT
// children stay exactly one mesh per mark and one line per burn curve —
// the shape the draw tests pin.
//
// DECORATION FOLLOWS `decorativeTimeMs`, positions follow the marks: under
// a reduced-motion preference the scene freezes the former and the latter
// keep advancing, and this file never reads a clock of its own.
//
// It FAILS SOFT. Under jsdom — and on any context this renderer cannot be
// constructed against — it mounts, finds it cannot draw, and returns
// without throwing: the renderer-availability guard, not this module, owns
// the player-facing unavailable state.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { drawOrbitPosition, type DrawOrbitElements, type DrawVec3 } from '@/lib/space/draw'
import { TAN_HALF_FOV, viewBasisOf } from '../space-projection'
import type { SpaceCamera } from '../space-camera'
import type { SceneMark, SceneModel } from '../space-scene'

export interface SpaceWorldProps {
  canvas: HTMLCanvasElement
  scene: SceneModel
  camera: SpaceCamera
  extent: number
  onFirstFrame?: () => void
}

// --- visual scale -----------------------------------------------------------

/**
 * A served `size` is a physical figure at the system's scale; drawn at 1:1
 * against an extent of several hundred units a planet is a two-pixel dot.
 * Every mark is drawn at its served radius times ONE of these — purely a
 * silhouette choice, never read back — and never below `extent / MARK_FLOOR_DIV`.
 */
export const STAR_DRAW_SCALE = 1.3
export const BODY_DRAW_SCALE = 2.2
export const MARK_FLOOR_DIV = 400
export const SELECTED_DRAW_SCALE = 1.25

export function drawScaleFor(kind: SceneMark['kind']): number {
  return kind === 'star' ? STAR_DRAW_SCALE : BODY_DRAW_SCALE
}

// --- palette --------------------------------------------------------------------

const STAR_TINT: Record<string, number> = {
  O: 0x9bb0ff,
  B: 0xaabfff,
  A: 0xcad7ff,
  F: 0xf8f3e6,
  G: 0xffe7b8,
  K: 0xffc98a,
  M: 0xff9f6a,
}
const STAR_TINT_DEFAULT = 0xffd9a0

const BODY_TINTS: Record<string, number[]> = {
  rocky: [0xb56a4e, 0xc2a678, 0x8f7a6a, 0xa3836b, 0x9c6b5a],
  gas_giant: [0xcabf8f, 0xd9a877, 0x9fb7d1, 0xb5a0c9, 0xc9b39a],
  ice: [0xbfe3f2, 0xd6ecf5, 0x9fc9dd],
  moon: [0xa8a8b4, 0x8f8f99, 0xb8b0a6],
  belt: [0x8a8d99],
  station: [0x86e0d0],
  ruin: [0x9a86c4],
  anomaly: [0xe879f9],
  nebula: [0x7c6fb0],
  gravity_well: [0x3b3f58],
  debris: [0x6f6f7a],
  radiation: [0x8ec9a8],
  gate: [0x67e8f9],
}

const MARK_COLOR: Record<string, number> = {
  star: 0xfde68a,
  body: 0xa5b4fc,
  belt: 0x8a8d99,
  gate: 0x67e8f9,
  fleet: 0x4ade80,
  contact: 0xfbbf24,
  ghost: 0x94a3b8,
  // add-scan-and-sightings-surface: a SIGHTING ghost — a frozen record from
  // the corporation's own pile — is a DIFFERENT mark class from `ghost`
  // above (a burn's arrival preview). Distinct from a contact's amber and a
  // fleet's green so the register reads as its own thing at a glance.
  sighting: 0xe879f9,
  'point-selection': 0xf472b6,
}

/** Marks drawn as a lit, opaque surface; everything else is self-lit. */
const LIT_TYPES = new Set(['rocky', 'gas_giant', 'ice', 'moon', 'belt', 'ruin', 'debris'])
/** Marks drawn as an octahedron rather than a sphere. */
const FACETED_TYPES = new Set(['station', 'gate'])
/** Marks drawn as a hollow wireframe — previews and records, not things. */
const WIRE_KINDS = new Set<SceneMark['kind']>(['ghost', 'sighting', 'point-selection'])

const STARFIELD_COUNT = 1400
const ORBIT_RING_SAMPLES = 128
const BELT_RADIAL_JITTER = 0.05
const BELT_NORMAL_JITTER = 0.012

const FOV_DEGREES = (Math.atan(TAN_HALF_FOV) * 360) / Math.PI

function hashOf(s: string): number {
  let hash = 2166136261
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

/** A tiny seeded generator so decoration is stable across mounts. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function tintOf(mark: SceneMark): number {
  if (mark.kind === 'star') return STAR_TINT[(mark.starClass ?? '').charAt(0).toUpperCase()] ?? STAR_TINT_DEFAULT
  const byType = mark.bodyType ? BODY_TINTS[mark.bodyType] : undefined
  if (byType && byType.length > 0) return byType[hashOf(mark.id) % byType.length]!
  return MARK_COLOR[mark.kind] ?? MARK_COLOR.body!
}

function toV(p: DrawVec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z)
}

/** Sample one full orbit of `elements` in its parent's frame. */
function orbitSamples(elements: DrawOrbitElements, count: number): THREE.Vector3[] {
  const period = elements.periodMs > 0 ? elements.periodMs : 1
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= count; i++) points.push(toV(drawOrbitPosition(elements, (i / count) * period)))
  return points
}

function ringKeyOf(ring: { parentId: string; elements: DrawOrbitElements }): string {
  const e = ring.elements
  return `${ring.parentId}:${e.radius.toFixed(4)}:${e.inclination}:${e.node}`
}

export function SpaceWorld({ canvas, scene, camera, extent, onFirstFrame }: SpaceWorldProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<SceneModel>(scene)
  const cameraRef = useRef<SpaceCamera>(camera)
  sceneRef.current = scene
  cameraRef.current = camera

  useEffect(() => {
    // A context that cannot answer the calls a renderer makes is not a
    // context to build one against. Under jsdom the stub answers
    // `getExtension` and nothing else, and a half-constructed renderer would
    // still attach its own context-lost/restored listeners to this canvas —
    // and then throw from inside them, outside any React boundary.
    const probe = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (!probe || typeof probe.createProgram !== 'function') return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    } catch {
      // No usable context here (jsdom, or a driver that refused): the guard
      // owns that state — this module simply does not draw.
      return
    }
    rendererRef.current = renderer
    renderer.setClearColor(0x05060a, 1)
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2))

    const world = new THREE.Scene()
    const view = new THREE.PerspectiveCamera(FOV_DEGREES, 1, extent / 1000, extent * 100)
    const floor = extent / MARK_FLOOR_DIV

    // --- shared geometry ---------------------------------------------------
    const sphere = new THREE.SphereGeometry(1, 28, 18)
    const wireSphere = new THREE.SphereGeometry(1, 12, 8)
    const octahedron = new THREE.OctahedronGeometry(1.4)
    const sharedGeometry = [sphere, wireSphere, octahedron]

    // --- light -------------------------------------------------------------
    world.add(new THREE.AmbientLight(0x8890b0, 0.35))
    const starLight = new THREE.PointLight(STAR_TINT_DEFAULT, 3.2, 0, 0)
    world.add(starLight)

    // --- decoration, all under one group -----------------------------------
    const decor = new THREE.Group()
    world.add(decor)

    // Starfield — a far shell of unattenuated points, seeded so it is the
    // same sky every mount.
    {
      const rand = seeded(0x5eed)
      const positions = new Float32Array(STARFIELD_COUNT * 3)
      for (let i = 0; i < STARFIELD_COUNT; i++) {
        const u = rand() * 2 - 1
        const phi = rand() * Math.PI * 2
        const r = extent * (12 + rand() * 8)
        const s = Math.sqrt(1 - u * u)
        positions.set([r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)], i * 3)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      decor.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            color: 0x9aa3c0,
            size: 1.6,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.75,
          }),
        ),
      )
    }

    // Faint ecliptic grid — a depth reference for the free-space pick plane.
    {
      const grid = new THREE.PolarGridHelper(extent, 12, 8, 96, 0x1c2438, 0x141a2c)
      const material = grid.material as THREE.Material
      material.transparent = true
      material.opacity = 0.35
      decor.add(grid)
    }

    // Selection reticle — a camera-facing ring riding the selected mark.
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    reticle.visible = false
    decor.add(reticle)

    // --- per-entity caches -------------------------------------------------
    interface MarkEntry {
      mesh: THREE.Mesh
      kind: SceneMark['kind']
    }
    const meshes = new Map<string, MarkEntry>()
    const lines: THREE.Line[] = []
    const rings = new Map<string, THREE.Line>()
    const belts = new Map<string, THREE.Points>()
    let frame = 0
    let announced = false

    const halo = (color: number, opacity: number, scale: number): THREE.Mesh => {
      const shell = new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      )
      shell.scale.setScalar(scale)
      return shell
    }

    const buildMesh = (mark: SceneMark): THREE.Mesh => {
      const tint = tintOf(mark)
      const type = mark.bodyType ?? ''
      if (mark.kind === 'star') {
        const mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: tint }))
        mesh.add(halo(tint, 0.16, 1.9))
        mesh.add(halo(tint, 0.06, 3.2))
        return mesh
      }
      if (WIRE_KINDS.has(mark.kind)) {
        return new THREE.Mesh(
          wireSphere,
          new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.8 }),
        )
      }
      if (FACETED_TYPES.has(type)) {
        const mesh = new THREE.Mesh(
          octahedron,
          new THREE.MeshStandardMaterial({
            color: tint,
            roughness: 0.35,
            metalness: 0.4,
            emissive: tint,
            emissiveIntensity: 0.35,
          }),
        )
        mesh.add(halo(tint, 0.12, 2.6))
        return mesh
      }
      if (LIT_TYPES.has(type)) {
        return new THREE.Mesh(
          sphere,
          new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, metalness: 0.05 }),
        )
      }
      if (mark.kind === 'fleet' || mark.kind === 'contact') {
        const mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: tint }))
        mesh.add(halo(tint, 0.22, 2.4))
        return mesh
      }
      // Hazards and anything unclassified: a translucent self-lit sphere.
      return new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.55 }),
      )
    }

    const disposeMesh = (mesh: THREE.Mesh) => {
      ;(mesh.material as THREE.Material).dispose()
      for (const child of mesh.children) {
        if (child instanceof THREE.Mesh) (child.material as THREE.Material).dispose()
      }
    }

    const drawRadiusOf = (mark: SceneMark): number =>
      Math.max(mark.radius * drawScaleFor(mark.kind), floor)

    const syncMarks = () => {
      const live = new Set<string>()
      let selected: { mark: SceneMark; radius: number } | null = null
      for (const mark of sceneRef.current.marks) {
        live.add(mark.id)
        let entry = meshes.get(mark.id)
        if (!entry || entry.kind !== mark.kind) {
          if (entry) {
            world.remove(entry.mesh)
            disposeMesh(entry.mesh)
          }
          entry = { mesh: buildMesh(mark), kind: mark.kind }
          meshes.set(mark.id, entry)
          world.add(entry.mesh)
        }
        const mesh = entry.mesh
        mesh.position.set(mark.position.x, mark.position.y, mark.position.z)
        const size = drawRadiusOf(mark)
        mesh.scale.setScalar(mark.selected ? size * SELECTED_DRAW_SCALE : size)
        if (mark.kind === 'star') {
          starLight.position.set(mark.position.x, mark.position.y, mark.position.z)
          starLight.color.set(tintOf(mark))
        }
        if (mark.selected && mark.kind !== 'point-selection' && !selected) selected = { mark, radius: size }
      }
      for (const [id, entry] of meshes) {
        if (live.has(id)) continue
        world.remove(entry.mesh)
        disposeMesh(entry.mesh)
        meshes.delete(id)
      }

      if (selected) {
        const { mark, radius } = selected
        const pulse = 1.7 + Math.sin(sceneRef.current.decorativeTimeMs / 260) * 0.08
        reticle.position.set(mark.position.x, mark.position.y, mark.position.z)
        reticle.scale.setScalar(radius * pulse)
        reticle.quaternion.copy(view.quaternion)
        reticle.visible = true
      } else {
        reticle.visible = false
      }
    }

    const syncCurves = () => {
      for (const line of lines.splice(0)) {
        world.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      for (const curve of sceneRef.current.curves) {
        const points = curve.controlPoints.map(toV)
        if (points.length < 2) continue
        const smooth = new THREE.CatmullRomCurve3(points).getPoints(64)
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(smooth),
          new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.9 }),
        )
        lines.push(line)
        world.add(line)
      }
    }

    // Orbit rings: one line loop per distinct orbit (the lane gates share
    // one), sampled once and moved to the parent's frame every frame.
    const syncRings = () => {
      const live = new Set<string>()
      for (const ring of sceneRef.current.orbitRings) {
        const key = ringKeyOf(ring)
        live.add(key)
        let line = rings.get(key)
        if (!line) {
          const dim = ring.bodyType === 'moon' || ring.bodyType === 'station' || ring.bodyType === 'gate'
          line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(orbitSamples(ring.elements, ORBIT_RING_SAMPLES)),
            new THREE.LineBasicMaterial({
              color: dim ? 0x223048 : 0x28324e,
              transparent: true,
              opacity: dim ? 0.5 : 0.65,
            }),
          )
          rings.set(key, line)
          decor.add(line)
        }
        line.position.set(ring.parentPosition.x, ring.parentPosition.y, ring.parentPosition.z)
      }
      for (const [key, line] of rings) {
        if (live.has(key)) continue
        decor.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
        rings.delete(key)
      }
    }

    // Belt fields: a jittered particle ring along the belt's served orbit,
    // in its parent's frame — never a mark, never pickable.
    const syncBelts = () => {
      const live = new Set<string>()
      for (const field of sceneRef.current.beltFields) {
        live.add(field.bodyId)
        let points = belts.get(field.bodyId)
        if (!points) {
          const rand = seeded(hashOf(field.bodyId))
          const period = field.elements.periodMs > 0 ? field.elements.periodMs : 1
          const a = toV(drawOrbitPosition(field.elements, 0))
          const b = toV(drawOrbitPosition(field.elements, period / 4))
          const normal = new THREE.Vector3().crossVectors(a, b).normalize()
          const positions = new Float32Array(field.memberCount * 3)
          for (let i = 0; i < field.memberCount; i++) {
            const p = toV(drawOrbitPosition(field.elements, rand() * period))
            p.multiplyScalar(1 + (rand() - 0.5) * 2 * BELT_RADIAL_JITTER)
            p.addScaledVector(normal, (rand() - 0.5) * 2 * BELT_NORMAL_JITTER * field.elements.radius)
            positions.set([p.x, p.y, p.z], i * 3)
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          points = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
              color: 0x6b6f82,
              size: Math.max(floor * 0.6, 0.6),
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.8,
            }),
          )
          belts.set(field.bodyId, points)
          decor.add(points)
        }
        points.position.set(field.ringCenter.x, field.ringCenter.y, field.ringCenter.z)
      }
      for (const [id, points] of belts) {
        if (live.has(id)) continue
        decor.remove(points)
        points.geometry.dispose()
        ;(points.material as THREE.Material).dispose()
        belts.delete(id)
      }
    }

    const draw = () => {
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1
      renderer.setSize(width, height, false)
      view.aspect = width / height
      view.updateProjectionMatrix()

      const basis = viewBasisOf(cameraRef.current, { width, height })
      view.position.set(basis.eye.x, basis.eye.y, basis.eye.z)
      view.up.set(basis.up.x, basis.up.y, basis.up.z)
      const target = cameraRef.current.target
      view.lookAt(target.x, target.y, target.z)

      syncMarks()
      syncCurves()
      syncRings()
      syncBelts()
      renderer.render(world, view)
      if (!announced) {
        announced = true
        onFirstFrame?.()
      }
      frame = requestAnimationFrame(draw)
    }

    const disposeAll = () => {
      cancelAnimationFrame(frame)
      for (const [, entry] of meshes) disposeMesh(entry.mesh)
      for (const line of lines) {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      for (const [, line] of rings) {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      for (const [, points] of belts) {
        points.geometry.dispose()
        ;(points.material as THREE.Material).dispose()
      }
      for (const child of decor.children) {
        const drawable = child as { geometry?: { dispose(): void }; material?: THREE.Material }
        drawable.geometry?.dispose()
        drawable.material?.dispose()
      }
      for (const geometry of sharedGeometry) geometry.dispose()
      // dispose() also detaches three's own context-lost/restored listeners
      // from the canvas — without it a renderer that failed to draw would
      // keep reacting to a restore it can no longer serve.
      try {
        renderer.dispose()
      } catch {
        // A renderer this broken has nothing left to release.
      }
      rendererRef.current = null
    }

    try {
      draw()
    } catch {
      disposeAll()
      return
    }

    return disposeAll
  }, [canvas, extent, onFirstFrame])

  return null
}

export default SpaceWorld

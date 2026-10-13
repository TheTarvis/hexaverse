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
import {
  bezierPointAt,
  drawOrbitPosition,
  type DrawOrbitElements,
  type DrawVec3,
} from '@/lib/space/draw'
import { TAN_HALF_FOV, MARK_FLOOR_DIV, drawRadiusFor } from '../space-projection'
import type { SceneMark, SceneModel } from '../space-scene'
import type { SpaceFrame } from '../space-transform-loop'
import { createSpacecraftModel, loadSpacecraftAsset, type SpacecraftKind } from './spacecraft-art'
import { advancePlanetClouds, createPlanetModel, planetKind, createRadialGlowTexture, createHexGrid, createBackdropMaterial } from './scene-art'

export interface SpaceWorldProps {
  canvas: HTMLCanvasElement
  /**
   * The transform loop's published frame (openspec change
   * `fix-world-time-render-loop`, impl contract §8) — replaces the former
   * `scene`/`camera` props. `draw()` reads `frameRef.current` fresh every
   * frame; with no frame published yet it renders nothing and announces
   * nothing.
   */
  frameRef: { readonly current: SpaceFrame | null }
  extent: number
  /**
   * The fleet the view is commanding — ringed in the fleet green so the
   * player can tell which mark the command panels are about. Separate from
   * `selection` (the burn TARGET, ringed in cyan): both can show at once.
   */
  actingFleetId?: string | null
  onFirstFrame?: () => void
}

// --- visual scale -----------------------------------------------------------

/**
 * A served `size` is a physical figure at the system's scale; drawn at 1:1
 * against an extent of several hundred units a planet is a two-pixel dot.
 * Every mark is drawn at its served radius times ONE of these — purely a
 * silhouette choice, never read back — and never below `extent / MARK_FLOOR_DIV`.
 */
export { STAR_DRAW_SCALE, BODY_DRAW_SCALE, MARK_FLOOR_DIV, drawScaleFor } from '../space-projection'

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

/**
 * A fleet mark's tint by served mode — the at-a-glance cue for what the
 * fleet is doing. Burn orange matches the path it is riding; drift violet
 * matches the roster's own drifting tone; parked stays the fleet green.
 */
export const FLEET_MODE_COLOR: Record<0 | 1 | 2, number> = {
  0: 0xffb454,
  1: 0x4ade80,
  2: 0xc4b5fd,
}
const BURN_PATH_COLOR = 0xffb454
const ACTING_RING_COLOR = 0x4ade80
/**
 * A drift's heading streak: this many seconds of served velocity, capped at
 * a fraction of the system's extent so a fast coast reads as a heading
 * pointer rather than a line off the edge of the world.
 */
const DRIFT_STREAK_SECONDS = 30
const DRIFT_STREAK_MAX_EXTENT = 0.08
const CURVE_SAMPLES = 96

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
  if (mark.kind === 'fleet' && mark.fleetMode !== undefined) return FLEET_MODE_COLOR[mark.fleetMode]
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

export function SpaceWorld({
  canvas,
  frameRef,
  extent,
  actingFleetId = null,
  onFirstFrame,
}: SpaceWorldProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const actingRef = useRef<string | null>(actingFleetId)
  actingRef.current = actingFleetId

  useEffect(() => {
    // A context that cannot answer the calls a renderer makes is not a
    // context to build one against. Under jsdom the stub answers
    // `getExtension` and nothing else, and a half-constructed renderer would
    // still attach its own context-lost/restored listeners to this canvas —
    // and then throw from inside them, outside any React boundary.
    // Context attributes are fixed by the first request, before Three reuses
    // this context. Reserve the stencil buffer used by the hex silhouette mask.
    const probe = canvas.getContext('webgl2', { stencil: true }) as WebGL2RenderingContext | null
    if (!probe || typeof probe.createProgram !== 'function') return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: true })
    } catch {
      // No usable context here (jsdom, or a driver that refused): the guard
      // owns that state — this module simply does not draw.
      return
    }
    rendererRef.current = renderer
    renderer.setClearColor(0x071324, 1)
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
    world.add(new THREE.AmbientLight(0xa8c5ed, 0.65))
    const starLight = new THREE.PointLight(STAR_TINT_DEFAULT, 3.2, 0, 0)
    world.add(starLight)

    // --- decoration, all under one group -----------------------------------
    const decor = new THREE.Group()
    world.add(decor)

    const backdrop = new THREE.Mesh(sphere, createBackdropMaterial())
    backdrop.scale.setScalar(extent * 40)
    backdrop.renderOrder = -1000
    decor.add(backdrop)

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

    // One decorative XZ plane; picking continues to use continuous space.
    const grid = createHexGrid(extent)
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    // Bodies straddle XZ, so depth alone lets the plane cut across their
    // lower hemispheres. Their opaque silhouettes mask decorative lines.
    gridMaterial.stencilWrite = true
    gridMaterial.stencilRef = 1
    gridMaterial.stencilFunc = THREE.NotEqualStencilFunc
    const gridOpacity = gridMaterial.opacity
    decor.add(grid)

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

    // Acting-fleet ring — the same camera-facing ring in the fleet green,
    // riding whichever own fleet the command panels are about.
    const actingRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.12, 48),
      new THREE.MeshBasicMaterial({
        color: ACTING_RING_COLOR,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    actingRing.visible = false
    decor.add(actingRing)

    // --- per-entity caches -------------------------------------------------
    interface MarkEntry {
      mesh: THREE.Mesh
      kind: SceneMark['kind']
      /** A fleet's served mode: its tint, so a mode change rebuilds the mesh. */
      variant: number | undefined
      bodyType: string | undefined
      starClass: string | undefined
    }
    const meshes = new Map<string, MarkEntry>()
    let rendererLive = true
    const assets = new Map<SpacecraftKind, Promise<THREE.Group | null>>()
    const sources = new Map<SpacecraftKind, THREE.Group>()
    const spacecraftKind = (mark: SceneMark): SpacecraftKind | null =>
      mark.kind === 'fleet' ? 'ship' : mark.kind === 'body' && mark.bodyType === 'station' ? 'station' : null
    const lines: THREE.Line[] = []
    /** Decorative streaks rebuilt every frame: the path ahead, drift headings. */
    const streaks: THREE.Line[] = []
    const rings = new Map<string, THREE.Line>()
    const belts = new Map<string, THREE.Points>()
    let frameId = 0
    let announced = false
    // The published frame's scene, refreshed at the top of every `draw()`
    // call — the sync helpers below read THIS, never `frameRef` directly, so
    // they stay agnostic to where the scene came from.
    let liveScene: SceneModel = {
      marks: [],
      curves: [],
      beltFields: [],
      orbitRings: [],
      positionTimeMs: 0,
      decorativeTimeMs: 0,
      omissions: [],
    }

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
        const surface = new THREE.MeshBasicMaterial({ color: tint })
        // Static local-space granulation: the luminous surface stays attached
        // to the sphere across camera motion without an extra animation clock.
        surface.onBeforeCompile = shader => {
          shader.vertexShader = 'varying vec3 vStellarPosition;\n' + shader.vertexShader
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvStellarPosition = position;')
          shader.fragmentShader = 'varying vec3 vStellarPosition;\n' + shader.fragmentShader
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            vec3 p = normalize(vStellarPosition);
            float broad = sin(p.x * 13.0 + sin(p.y * 17.0)) * sin(p.z * 15.0 + sin(p.x * 11.0));
            float grain = sin(p.x * 53.0 + sin(p.z * 39.0)) * sin(p.y * 47.0 + sin(p.x * 37.0));
            diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.65)) * (0.94 + broad * 0.12 + grain * 0.04);
          `)
        }
        const mesh = new THREE.Mesh(sphere, surface)
        const corona = new THREE.Color(tint)
        corona.setRGB(corona.r ** 4, corona.g ** 4, corona.b ** 4)
        const glowMap = createRadialGlowTexture()
        for (const [scale, opacity] of [[7.5, 0.95], [4, 1.0]]) {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowMap, color: corona, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, opacity,
          }))
          glow.scale.set(scale!, scale!, 1)
          mesh.add(glow)
        }
        return mesh
      }
      if (WIRE_KINDS.has(mark.kind)) {
        return new THREE.Mesh(
          wireSphere,
          new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.8 }),
        )
      }
      const modelKind = spacecraftKind(mark)
      if (modelKind) return createSpacecraftModel(modelKind, tint, sources.get(modelKind))
      // Anonymous contacts never inherit incidental served body decoration.
      if (mark.kind === 'contact') {
        const mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: tint }))
        mesh.add(halo(tint, 0.22, 2.4))
        return mesh
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
      const planet = planetKind(type)
      if (planet) return createPlanetModel(planet, mark.id, sphere)
      if (LIT_TYPES.has(type)) {
        return new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({
          color: tint, roughness: 0.85, metalness: 0.05,
        }))
      }
      if (mark.kind === 'fleet') {
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

    // Materials/maps are mesh-owned; geometries may be shared across marks.
    // A single traversal at teardown also avoids disposing cached decor twice.
    const disposeResources = (root: THREE.Object3D, geometry: boolean, closeImages = false) => {
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()
      const geometries = new Set<THREE.BufferGeometry>()
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points)) return
        if (!(object instanceof THREE.Sprite) && (geometry || !sharedGeometry.includes(object.geometry as THREE.SphereGeometry))) geometries.add(object.geometry)
        const list = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of list) {
          materials.add(material)
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
        }
      })
      const images = new Set<ImageBitmap>()
      for (const texture of textures) {
        if (closeImages && typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image)
        texture.dispose()
      }
      for (const image of images) image.close()
      for (const material of materials) material.dispose()
      for (const item of geometries) item.dispose()
    }
    const disposeMesh = (mesh: THREE.Mesh) => disposeResources(mesh, false)

    const drawRadiusOf = (mark: SceneMark): number =>
      drawRadiusFor(mark, extent)

    const stencilModel = (root: THREE.Mesh) => root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.transparent) { material.depthWrite = false; continue }
        if (!object.geometry.getAttribute('position')) continue
        material.stencilWrite = true
        material.stencilRef = 1
        material.stencilZPass = THREE.ReplaceStencilOp
      }
    })

    const syncMarks = (cloudDelta: number) => {
      const live = new Set<string>()
      let selected: { mark: SceneMark; radius: number } | null = null
      let acting: { mark: SceneMark; radius: number } | null = null
      for (const mark of liveScene.marks) {
        live.add(mark.id)
        let entry = meshes.get(mark.id)
        const variant = mark.kind === 'fleet' ? mark.fleetMode : undefined
        if (!entry || entry.kind !== mark.kind || entry.variant !== variant || entry.bodyType !== mark.bodyType || entry.starClass !== mark.starClass) {
          const previousIndex = entry ? world.children.indexOf(entry.mesh) : -1
          if (entry) {
            world.remove(entry.mesh)
            disposeMesh(entry.mesh)
          }
          entry = { mesh: buildMesh(mark), kind: mark.kind, variant, bodyType: mark.bodyType, starClass: mark.starClass }
          stencilModel(entry.mesh)
          meshes.set(mark.id, entry)
          world.add(entry.mesh)
          if (previousIndex >= 0) {
            world.children.splice(world.children.indexOf(entry.mesh), 1)
            world.children.splice(previousIndex, 0, entry.mesh)
          }
          const modelKind = spacecraftKind(mark)
          if (modelKind && !sources.has(modelKind)) {
            let pending = assets.get(modelKind)
            if (!pending) {
              pending = loadSpacecraftAsset(modelKind).then(source => {
                if (!rendererLive) { disposeResources(source, true, true); return null }
                // Decode success does not imply usable geometry. Validate the same
                // normalization path before publishing a source to synchronous
                // appearance rebuilds; a bad source becomes a cached failure.
                try {
                  const probe = createSpacecraftModel(modelKind, tintOf(mark), source)
                  disposeMesh(probe)
                } catch {
                  disposeResources(source, true, true)
                  return null
                }
                sources.set(modelKind, source)
                return source
              }).catch(() => null)
              assets.set(modelKind, pending)
            }
            const subscribed = entry
            void pending.then(source => {
              if (!source || !rendererLive || meshes.get(mark.id) !== subscribed) return
              let replacement: THREE.Mesh
              try { replacement = createSpacecraftModel(modelKind, tintOf(mark), source) }
              catch { return } // A decoded but unusable model retains its fallback.
              replacement.position.copy(subscribed.mesh.position)
              replacement.scale.copy(subscribed.mesh.scale)
              stencilModel(replacement)
              const index = world.children.indexOf(subscribed.mesh)
              world.remove(subscribed.mesh)
              disposeMesh(subscribed.mesh)
              subscribed.mesh = replacement
              world.add(replacement)
              world.children.splice(world.children.indexOf(replacement), 1)
              world.children.splice(index, 0, replacement)
            })
          }
        }
        const mesh = entry.mesh
        mesh.position.set(mark.position.x, mark.position.y, mark.position.z)
        const size = drawRadiusOf(mark)
        mesh.scale.setScalar(size)
        if (mark.selected && mark.bodyType === 'gas_giant' && cloudDelta > 0) {
          const frame = frameRef.current!
          const screen = frame.projected.get(mark.id)?.screen
          const depth = mesh.position.distanceTo(view.position)
          const diameterPx = mesh.scale.x * frame.basis.heightPx / (Math.max(depth, 0.001) * TAN_HALF_FOV)
          if (screen?.onScreen && diameterPx >= 80) advancePlanetClouds(mesh, cloudDelta)
        }
        if (mark.kind === 'star') {
          starLight.position.set(mark.position.x, mark.position.y, mark.position.z)
          starLight.color.set(tintOf(mark))
        }
        if (mark.selected && mark.kind !== 'point-selection' && !selected) selected = { mark, radius: size }
        if (mark.kind === 'fleet' && mark.id === actingRef.current) acting = { mark, radius: size }
      }
      for (const [id, entry] of meshes) {
        if (live.has(id)) continue
        world.remove(entry.mesh)
        disposeMesh(entry.mesh)
        meshes.delete(id)
      }

      if (selected) {
        const { mark, radius } = selected
        const pulse = 1.7 + Math.sin(liveScene.decorativeTimeMs / 260) * 0.08
        reticle.position.set(mark.position.x, mark.position.y, mark.position.z)
        reticle.scale.setScalar(radius * pulse)
        reticle.quaternion.copy(view.quaternion)
        reticle.visible = true
      } else {
        reticle.visible = false
      }

      if (acting && !liveScene.marks.some(mark => mark.selected)) {
        const { mark, radius } = acting
        const pulse = 2.2 + Math.sin(liveScene.decorativeTimeMs / 340) * 0.1
        actingRing.position.set(mark.position.x, mark.position.y, mark.position.z)
        actingRing.scale.setScalar(radius * pulse)
        actingRing.quaternion.copy(view.quaternion)
        actingRing.visible = true
      } else {
        actingRing.visible = false
      }
    }

    const disposeLine = (line: THREE.Line) => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }

    /**
     * The served curve, sampled on the SAME Bézier evaluation the fleet's
     * mark rides (`bezierPointAt`) — never a spline THROUGH the control
     * points, which would draw a path the mark visibly leaves. One line per
     * curve as a direct child of the world (the shape the draw tests pin),
     * drawn dim; the part still AHEAD of the mark is overlaid bright under
     * `decor`, so the traversed and remaining halves read differently.
     */
    const syncCurves = () => {
      for (const line of lines.splice(0)) {
        world.remove(line)
        disposeLine(line)
      }
      for (const line of streaks.splice(0)) {
        decor.remove(line)
        disposeLine(line)
      }
      for (const curve of liveScene.curves) {
        if (curve.controlPoints.length < 2) continue
        const whole: THREE.Vector3[] = []
        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          whole.push(toV(bezierPointAt(curve.controlPoints, i / CURVE_SAMPLES)))
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(whole),
          new THREE.LineBasicMaterial({ color: BURN_PATH_COLOR, transparent: true, opacity: 0.28 }),
        )
        lines.push(line)
        world.add(line)

        const u = curve.param
        if (u < 1) {
          const ahead: THREE.Vector3[] = [toV(bezierPointAt(curve.controlPoints, u))]
          for (let i = 0; i <= CURVE_SAMPLES; i++) {
            const t = i / CURVE_SAMPLES
            if (t > u) ahead.push(toV(bezierPointAt(curve.controlPoints, t)))
          }
          if (ahead.length >= 2) {
            const bright = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(ahead),
              new THREE.LineBasicMaterial({ color: BURN_PATH_COLOR, transparent: true, opacity: 0.95 }),
            )
            streaks.push(bright)
            decor.add(bright)
          }
        }
      }

      // A drifting fleet's heading: a streak from the mark along its SERVED
      // velocity. Decorative — the facts card displays the served figures.
      for (const mark of liveScene.marks) {
        if (mark.kind !== 'fleet' || mark.fleetMode !== 2 || !mark.velocity) continue
        const v = mark.velocity
        const speed = Math.hypot(v.x, v.y, v.z)
        if (!(speed > 0)) continue
        const length = Math.min(speed * DRIFT_STREAK_SECONDS, extent * DRIFT_STREAK_MAX_EXTENT)
        const from = toV(mark.position)
        const to = new THREE.Vector3(
          mark.position.x + (v.x / speed) * length,
          mark.position.y + (v.y / speed) * length,
          mark.position.z + (v.z / speed) * length,
        )
        const streak = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([from, to]),
          new THREE.LineBasicMaterial({
            color: FLEET_MODE_COLOR[2],
            transparent: true,
            opacity: 0.8,
          }),
        )
        streaks.push(streak)
        decor.add(streak)
      }
    }

    // Orbit rings: one line loop per distinct orbit (the lane gates share
    // one), sampled once and moved to the parent's frame every frame.
    const syncRings = () => {
      const live = new Set<string>()
      for (const ring of liveScene.orbitRings) {
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
      for (const field of liveScene.beltFields) {
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

    const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    let previousCloudFrame = performance.now()
    const draw = () => {
      const now = performance.now()
      const cloudDelta = !document.hidden && !motionPreference?.matches ? Math.min((now - previousCloudFrame) / 1000, 0.1) : 0
      previousCloudFrame = now
      const published = frameRef.current
      if (!published) {
        // No frame has been built yet — render nothing, announce nothing,
        // and keep the loop alive for the next one.
        frameId = requestAnimationFrame(draw)
        return
      }
      liveScene = published.scene
      const basis = published.basis
      renderer.setSize(basis.widthPx, basis.heightPx, false)
      view.aspect = basis.widthPx / Math.max(1, basis.heightPx)
      view.updateProjectionMatrix()

      view.position.set(basis.eye.x, basis.eye.y, basis.eye.z)
      view.up.set(basis.up.x, basis.up.y, basis.up.z)
      const target = published.camera.target
      view.lookAt(target.x, target.y, target.z)
      // Follow the published camera only; no extra clock, allocations or state.
      backdrop.position.copy(view.position)
      const distance = Math.hypot(basis.eye.x - target.x, basis.eye.y - target.y, basis.eye.z - target.z)
      const elevation = Math.abs(basis.eye.y - target.y) / Math.max(distance, 0.001)
      const distanceFade = 1 / (1 + (distance / Math.max(extent, 0.001)) ** 2)
      const angleFade = THREE.MathUtils.smoothstep(elevation, 0.035, 0.55)
      gridMaterial.opacity = gridOpacity * THREE.MathUtils.clamp(distanceFade * angleFade, 0, 1)

      syncMarks(cloudDelta)
      syncCurves()
      syncRings()
      syncBelts()
      renderer.render(world, view)
      if (!announced) {
        announced = true
        onFirstFrame?.()
      }
      frameId = requestAnimationFrame(draw)
    }

    const disposeAll = () => {
      if (!rendererLive) return
      rendererLive = false
      cancelAnimationFrame(frameId)
      // Shared geometry might no longer be attached after its last mark was
      // removed. Dispose it explicitly, excluding it from the scene traversal.
      const attachedShared = new Set<THREE.BufferGeometry>()
      world.traverse(object => {
        if (object instanceof THREE.Mesh && sharedGeometry.includes(object.geometry as THREE.SphereGeometry)) attachedShared.add(object.geometry)
      })
      disposeResources(world, true)
      for (const source of sources.values()) disposeResources(source, true, true)
      sources.clear()
      for (const geometry of sharedGeometry) if (!attachedShared.has(geometry)) geometry.dispose()
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
    // `frameRef` is a stable ref object (`{ readonly current: SpaceFrame |
    // null }`) for the whole mount — it belongs in no dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, extent, onFirstFrame])

  return null
}

export default SpaceWorld

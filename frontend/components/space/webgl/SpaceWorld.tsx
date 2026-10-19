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
// rings in each parent's frame, instanced rocky detail per belt, a far
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
import { advanceFeatureModel, createFeatureModel, featureArtKind } from './feature-art'
import { advanceLaneGatePortal, createLaneGateModel, loadLaneGateAsset } from './lane-gate-art'
import { advancePlanetClouds, createPlanetModel, planetKind, createHexGrid } from './scene-art'
import { createSpaceSky, updateSpaceSky, type SpaceGridMode, type HexSkySettings } from '@/components/graphics/space-sky'

import { createRendererOwner } from '@/components/render-guard/renderer-owner'
import type { SpaceRendererBindings } from '../SpaceCanvas'
import { createStarModel, stellarTint, type StarModel } from './star-art'

export interface SpaceWorldProps extends Partial<SpaceRendererBindings> {
  gridMode?: SpaceGridMode
  gridSettings?: Partial<HexSkySettings>
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

const ORBIT_RING_SAMPLES = 128
const BELT_RADIAL_JITTER = 0.05
const BELT_NORMAL_JITTER = 0.012
// Presentation budget per belt, independent of the number of simulated members.
const BELT_ROCK_LIMIT = 384

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

/** Owned faceted rock with all vertices inside the existing unit draw radius. */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const rand = seeded(seed)
  const geometry = new THREE.IcosahedronGeometry(1, 1)
  const vertices = geometry.getAttribute('position')
  const shapeSeed = rand() * Math.PI * 2
  let maxRadius = 0
  // Coherent deformation keeps duplicated vertices on adjoining facets together.
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
    const relief = 1 + 0.18 * Math.sin(x * 7 + shapeSeed) * Math.cos(y * 5 - z * 6)
    vertices.setXYZ(i, x * relief, y * relief * 0.82, z * relief)
    maxRadius = Math.max(maxRadius, Math.hypot(vertices.getX(i), vertices.getY(i), vertices.getZ(i)))
  }
  geometry.scale(1 / maxRadius, 1 / maxRadius, 1 / maxRadius)
  geometry.computeVertexNormals()
  const colors = new Float32Array(vertices.count * 3)
  for (let i = 0; i < vertices.count; i += 3) {
    const shade = 0.65 + rand() * 0.35
    for (let j = 0; j < 3; j++) colors.set([shade, shade, shade], (i + j) * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function tintOf(mark: SceneMark): number {
  if (mark.kind === 'star') return stellarTint(mark.starClass)
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
  gridMode = 'ground',
  gridSettings,
  onFirstFrame, createCanvas, onCanvas, onRendererState, onRendererOwner, rendererFactory,
}: SpaceWorldProps) {
  const bindings = useRef({ createCanvas, onCanvas, onRendererState, onRendererOwner, rendererFactory, onFirstFrame })
  bindings.current = { createCanvas, onCanvas, onRendererState, onRendererOwner, rendererFactory, onFirstFrame }
  const actingRef = useRef<string | null>(actingFleetId)
  const gridSettingsRef = useRef(gridSettings)
  gridSettingsRef.current = gridSettings
  actingRef.current = actingFleetId

  useEffect(() => {
    const world = new THREE.Scene()
    const view = new THREE.PerspectiveCamera(FOV_DEGREES, 1, extent / 1000, extent * 100)
    const floor = extent / MARK_FLOOR_DIV

    // --- shared geometry ---------------------------------------------------
    const sphere = new THREE.SphereGeometry(1, 28, 18)
    const wireSphere = new THREE.SphereGeometry(1, 12, 8)
    const octahedron = new THREE.OctahedronGeometry(1.4)
    const sharedGeometry = [sphere, wireSphere, octahedron]

    // --- light -------------------------------------------------------------
    world.add(new THREE.AmbientLight(0xa8c5ed, 0.23))
    world.add(new THREE.HemisphereLight(0x9bbce8, 0x171523, 0.32))
    const starLight = new THREE.PointLight(STAR_TINT_DEFAULT, 4.4, 0, 0)
    world.add(starLight)

    // --- decoration, all under one group -----------------------------------
    const decor = new THREE.Group()
    world.add(decor)

    const sky = createSpaceSky(extent, { hexLattice: gridMode === 'surround' })
    decor.add(sky)

    // One decorative XZ plane; picking continues to use continuous space.
    const grid = createHexGrid(extent)
    grid.visible = gridMode === 'ground'
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    // Bodies straddle XZ, so depth alone lets the plane cut across their
    // lower hemispheres. Their opaque silhouettes mask decorative lines.
    gridMaterial.stencilWrite = true
    // The mask is binary: cleared background is 0; opaque silhouettes write 1.
    // Equal/0 therefore preserves NotEqual/1's mask while ending each pass at
    // the WebGPU default reference. Three r185 caches this reference across
    // passes; switching opaque 1 → grid 0 avoids a stale reference on frame two.
    // Grid stencil operations remain Keep; decoration never writes silhouettes.
    gridMaterial.stencilRef = 0
    gridMaterial.stencilFunc = THREE.EqualStencilFunc
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
    const stars = new Map<THREE.Mesh, StarModel>()
    let rendererLive = true
    type ModelKind = SpacecraftKind | 'gate'
    const assets = new Map<ModelKind, Promise<THREE.Group | null>>()
    const sources = new Map<ModelKind, THREE.Group>()
    const modelKindOf = (mark: SceneMark): ModelKind | null =>
      mark.kind === 'gate' ? 'gate' : mark.kind === 'fleet' ? 'ship' : mark.kind === 'body' && mark.bodyType === 'station' ? 'station' : null
    const createModel = (kind: ModelKind, tint: number, source?: THREE.Group) =>
      kind === 'gate' ? createLaneGateModel(source) : createSpacecraftModel(kind, tint, source)
    const lines: THREE.Line[] = []
    /** Decorative streaks rebuilt every frame: the path ahead, drift headings. */
    const streaks: THREE.Line[] = []
    const rings = new Map<string, THREE.Line>()
    const belts = new Map<string, { mesh: THREE.InstancedMesh; variant: string }>()
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
        const star = createStarModel({ objectId: mark.id, starClass: mark.starClass, geometry: sphere })
        stars.set(star.mesh, star)
        return star.mesh
      }
      if (WIRE_KINDS.has(mark.kind)) {
        return new THREE.Mesh(
          wireSphere,
          new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.8 }),
        )
      }
      const modelKind = modelKindOf(mark)
      if (modelKind) return createModel(modelKind, tint, sources.get(modelKind))
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
      if (type === 'belt' || mark.kind === 'belt') {
        return new THREE.Mesh(rockGeometry(hashOf(mark.id)), new THREE.MeshStandardMaterial({
          color: tint, vertexColors: true, roughness: 0.9, metalness: 0.04, flatShading: true,
        }))
      }
      const feature = mark.kind === 'body' ? featureArtKind(type) : null
      if (feature) return createFeatureModel(feature, mark.id)
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
        // Instance buffers are owned by the object, separately from geometry.
        if (object instanceof THREE.InstancedMesh) object.dispose()
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
    const disposeMesh = (mesh: THREE.Mesh) => {
      const star = stars.get(mesh)
      if (star) { star.dispose(); stars.delete(mesh) } else disposeResources(mesh, false)
    }

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
      // Animate nearby visible giants without selection, but bound decorative
      // updates in crowded systems and give the inspected world first priority.
      const cloudIds = new Set(cloudDelta > 0 ? liveScene.marks.filter(mark => {
        if (mark.bodyType !== 'gas_giant' || !frameRef.current?.projected.get(mark.id)?.screen.onScreen) return false
        const depth = Math.hypot(mark.position.x - view.position.x, mark.position.y - view.position.y, mark.position.z - view.position.z)
        return drawRadiusOf(mark) * frameRef.current.basis.heightPx / (Math.max(depth, 0.001) * TAN_HALF_FOV) >= 48
      }).sort((a, b) => Number(b.selected) - Number(a.selected)).slice(0, 3).map(mark => mark.id) : [])
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
          const modelKind = modelKindOf(mark)
          if (modelKind && !sources.has(modelKind)) {
            let pending = assets.get(modelKind)
            if (!pending) {
              pending = (modelKind === 'gate' ? loadLaneGateAsset() : loadSpacecraftAsset(modelKind)).then(source => {
                if (!rendererLive) { disposeResources(source, true, true); return null }
                // Decode success does not imply usable geometry. Validate the same
                // normalization path before publishing a source to synchronous
                // appearance rebuilds; a bad source becomes a cached failure.
                try {
                  const probe = createModel(modelKind, tintOf(mark), source)
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
              try { replacement = createModel(modelKind, tintOf(mark), source) }
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
        if (mark.kind === 'gate') advanceLaneGatePortal(mesh, liveScene.decorativeTimeMs)
        if (mark.kind === 'body' && featureArtKind(mark.bodyType ?? '')) advanceFeatureModel(mesh, liveScene.decorativeTimeMs)
        if (cloudIds.has(mark.id)) advancePlanetClouds(mesh, cloudDelta)
        if (mark.kind === 'star') {
          if (cloudDelta > 0) stars.get(mesh)?.advance(cloudDelta)
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
              color: dim ? 0x405068 : 0x4b6076,
              transparent: true,
              opacity: dim ? 0.2 : 0.32,
              depthWrite: false,
              stencilWrite: true, stencilRef: 0, stencilFunc: THREE.EqualStencilFunc,
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

    // Belt fields: bounded rocky instances along the belt's served orbit,
    // in its parent's frame — never a mark, never pickable.
    const syncBelts = () => {
      const live = new Set<string>()
      for (const field of liveScene.beltFields) {
        live.add(field.bodyId)
        const variant = JSON.stringify([field.memberCount, field.elements])
        const previous = belts.get(field.bodyId)
        let rocks = previous?.mesh
        if (previous && previous.variant !== variant) {
          decor.remove(previous.mesh)
          disposeResources(previous.mesh, true)
          belts.delete(field.bodyId)
          rocks = undefined
        }
        if (!rocks) {
          const rand = seeded(hashOf(field.bodyId))
          const period = field.elements.periodMs > 0 ? field.elements.periodMs : 1
          const a = toV(drawOrbitPosition(field.elements, 0))
          const b = toV(drawOrbitPosition(field.elements, period / 4))
          const normal = new THREE.Vector3().crossVectors(a, b).normalize()
          const count = Number.isFinite(field.memberCount) ? THREE.MathUtils.clamp(Math.floor(field.memberCount), 0, BELT_ROCK_LIMIT) : 0
          const geometry = rockGeometry(hashOf(field.bodyId))
          rocks = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
            color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.04,
            flatShading: true,
          }), count)
          const pose = new THREE.Object3D()
          const palette = [0xafa291, 0x78695f, 0x9babbc, 0xbd896a]
          for (let i = 0; i < count; i++) {
            const p = toV(drawOrbitPosition(field.elements, rand() * period))
            p.multiplyScalar(1 + (rand() - 0.5) * 2 * BELT_RADIAL_JITTER)
            p.addScaledVector(normal, (rand() - 0.5) * 2 * BELT_NORMAL_JITTER * field.elements.radius)
            pose.position.copy(p)
            pose.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
            const size = Math.max(floor * 0.6, 0.6) * (0.45 + rand() * 0.8)
            pose.scale.set(size * (0.7 + rand() * 0.6), size * (0.6 + rand() * 0.4), size)
            pose.updateMatrix()
            rocks.setMatrixAt(i, pose.matrix)
            rocks.setColorAt(i, new THREE.Color(palette[Math.floor(rand() * palette.length)]!))
          }
          rocks.instanceMatrix.needsUpdate = true
          if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true
          rocks.computeBoundingSphere()
          rocks.raycast = () => {}
          stencilModel(rocks)
          belts.set(field.bodyId, { mesh: rocks, variant })
          decor.add(rocks)
        }
        rocks.position.set(field.ringCenter.x, field.ringCenter.y, field.ringCenter.z)
      }
      for (const [id, { mesh: rocks }] of belts) {
        if (live.has(id)) continue
        decor.remove(rocks)
        disposeResources(rocks, true)
        belts.delete(id)
      }
    }

    const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    let previousCloudFrame = performance.now()
    const draw = async () => {
      frameId = 0
      if (!rendererLive) return
      const now = performance.now()
      const cloudDelta = !document.hidden && !motionPreference?.matches ? Math.min((now - previousCloudFrame) / 1000, 0.1) : 0
      previousCloudFrame = now
      const published = frameRef.current
      if (!published) {
        // No frame has been built yet — render nothing, announce nothing,
        // and keep the loop alive for the next one.
        frameId = requestAnimationFrame(() => { void draw() })
        return
      }
      liveScene = published.scene
      const basis = published.basis
      owner.resize(basis.widthPx, basis.heightPx, Math.min(globalThis.devicePixelRatio || 1, 2))
      owner.setPresentationEligible(!document.hidden && basis.widthPx > 0 && basis.heightPx > 0)
      await owner.update(() => {
      view.aspect = basis.widthPx / Math.max(1, basis.heightPx)
      view.updateProjectionMatrix()

      view.position.set(basis.eye.x, basis.eye.y, basis.eye.z)
      view.up.set(basis.up.x, basis.up.y, basis.up.z)
      const target = published.camera.target
      view.lookAt(target.x, target.y, target.z)
      // Follow the published camera only; no extra clock, allocations or state.
      updateSpaceSky(sky, view, extent, gridSettingsRef.current)
      const distance = Math.hypot(basis.eye.x - target.x, basis.eye.y - target.y, basis.eye.z - target.z)
      const elevation = Math.abs(basis.eye.y - target.y) / Math.max(distance, 0.001)
      const distanceFade = 1 / (1 + (distance / Math.max(extent, 0.001)) ** 2)
      const angleFade = THREE.MathUtils.smoothstep(elevation, 0.035, 0.55)
      gridMaterial.opacity = gridOpacity * THREE.MathUtils.clamp(distanceFade * angleFade, 0, 1)

      syncMarks(cloudDelta)
      syncCurves()
      syncRings()
      syncBelts()
      })
      const presented = await owner.present(world, view)
      if (presented && !announced) { announced = true; bindings.current.onFirstFrame?.() }
      schedule()
    }

    const schedule = () => {
      const state = owner.snapshot()
      if (rendererLive && !frameId && (state.phase === 'pending' || state.phase === 'ready' || state.retrying)) frameId = requestAnimationFrame(() => { void draw() })
    }
    let seedUsed = false
    const owner = createRendererOwner({ surface: 'space', alpha: false, stencil: true,
      factory: bindings.current.rendererFactory,
      createCanvas: () => bindings.current.createCanvas?.() ?? (!seedUsed ? (seedUsed = true, canvas) : document.createElement('canvas')),
      onCanvas: next => { bindings.current.onCanvas?.(next) },
      onState: state => {
        bindings.current.onRendererState?.(state)
        if ((state.phase === 'interrupted' || state.phase === 'unavailable') && !state.retrying || state.phase === 'disposed') { cancelAnimationFrame(frameId); frameId = 0 }
        else queueMicrotask(() => { if (rendererLive) schedule() })
      },
    })
    bindings.current.onRendererOwner?.(owner)
    const visibility = () => { previousCloudFrame = performance.now(); owner.setPresentationEligible(!document.hidden); schedule() }
    document.addEventListener('visibilitychange', visibility)

    const disposeAll = () => {
      if (!rendererLive) return
      rendererLive = false
      cancelAnimationFrame(frameId)
      // Shared geometry might no longer be attached after its last mark was
      // removed. Dispose it explicitly, excluding it from the scene traversal.
      for (const [mesh, star] of stars) { world.remove(mesh); star.dispose() }
      stars.clear()
      const attachedShared = new Set<THREE.BufferGeometry>()
      world.traverse(object => {
        if (object instanceof THREE.Mesh && sharedGeometry.includes(object.geometry as THREE.SphereGeometry)) attachedShared.add(object.geometry)
      })
      disposeResources(world, true)
      for (const source of sources.values()) disposeResources(source, true, true)
      sources.clear()
      for (const geometry of sharedGeometry) if (!attachedShared.has(geometry)) geometry.dispose()
      owner.dispose()
      bindings.current.onRendererOwner?.(null)
      document.removeEventListener('visibilitychange', visibility)
    }

    void draw()

    return disposeAll
    // `frameRef` is a stable ref object (`{ readonly current: SpaceFrame |
    // null }`) for the whole mount — it belongs in no dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, extent, gridMode])

  return null
}

export default SpaceWorld

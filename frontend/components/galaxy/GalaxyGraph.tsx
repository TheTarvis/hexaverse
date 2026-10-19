'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'
import { createRendererOwner, type RendererOwner, type RendererSnapshot } from '@/components/render-guard/renderer-owner'
import type { RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'
import { REGION_PALETTE } from './region-palette'
import { glowTexture } from './glow-texture'
import { MapCameraRig as CameraRig } from '@/components/map/map-camera-rig'
import { createStellarEnvironment, createStellarNode, disposeStellarArt } from './stellar-map-art'
import { paintMapRoute, resolveRoute, type MapPalette, type MapRoute } from './map-route-overlay'
import { updateSpaceSky, type SpaceGridMode, type HexSkySettings } from '@/components/graphics/space-sky'

export interface GalaxyGraphController {
  recenter: () => void
  focusSystem: (id: string) => void
  focusPoint: (p: { x: number; y: number; z: number }) => void
  canvas: () => HTMLCanvasElement | null
  pause: () => void
  resume: () => void
  retry: () => void
}
interface GalaxyGraphProps {
  galaxy: Galaxy
  selectedId: string | null
  onSelect: (node: GalaxyNode | null) => void
  onReady?: (controller: GalaxyGraphController) => void
  onController?: (controller: GalaxyGraphController | null) => void
  onRendererState?: (snapshot: RendererSnapshot) => void
  rendererFactory?: RendererCandidateFactory
  fleetSystemIds?: string[]
  homeSystemId?: string | null
  /** The live view selects Stellar; the original remains available for comparison. */
  artStyle?: 'current' | 'stellar'
  route?: MapRoute
  mapPalette?: MapPalette
  gridMode?: SpaceGridMode
  gridSettings?: Partial<HexSkySettings>
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      // Sprite geometry is shared by Three; the cached glow texture is shared too.
      if (!(object instanceof THREE.Sprite)) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => material.dispose())
    }
  })
  group.clear()
}

export function GalaxyGraph(props: GalaxyGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const routeCanvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  latest.current = props
  const rebuildRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070d)
    const content = new THREE.Group()
    scene.add(content)
    let environment: THREE.Group | null = null
    let environmentSource: Galaxy | null = null
    let environmentGrid: SpaceGridMode | undefined
    let routeSource: MapRoute | undefined
    let routeGalaxy: Galaxy | null = null
    let routeLegs: ReturnType<typeof resolveRoute> = []
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000)
    let canvas: HTMLCanvasElement | null = null
    let rig: CameraRig | null = null
    let owner: RendererOwner | null = null
    let raf = 0, paused = false, disposed = false, intersecting = true
    let detach = () => {}
    let firstReady = false
    const proxies: THREE.Mesh[] = []
    const makeNode = (node: GalaxyNode) => {
      const style = REGION_PALETTE[node.region]
      const selected = latest.current.selectedId === node.id
      // The star map is common knowledge — every system renders fully visible
      // (#0006). Subspace tier is surfaced in the inspector, not by dimming the
      // graph; any explored-vs-charted emphasis is an M7 board-view decision.
      const dim = 1
      const sel = selected ? 1.5 : 1

      const group = props.artStyle === 'stellar' ? createStellarNode(node, selected) : new THREE.Group()

      if (props.artStyle !== 'stellar') {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color(style.color),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.32 * dim * (selected ? 1.4 : 1),
          }),
        )
        const hs = (5 + style.size * 8) * sel
        halo.scale.set(hs, hs, 1)

        const core = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color(style.color).lerp(new THREE.Color('#ffffff'), 0.5),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.95 * dim,
          }),
        )
        const cs = (2.2 + style.size * 3) * sel
        core.scale.set(cs, cs, 1)

        group.add(halo)
        group.add(core)
      }

      // Own-fleet presence marker — a bright cyan pip lifted above the star on
      // +Z so it reads as "a hull is on station here" from the oblique disk view
      // (#0002 Follow-ups 2026-07-11). A freshly spawned player sees it at home.
      if ((latest.current.fleetSystemIds ?? []).includes(node.id)) {
        const pip = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color('#67e8f9'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.98,
          }),
        )
        const ps = 3.6
        pip.scale.set(ps, ps, 1)
        pip.position.set(0, 0, 6 + style.size * 4)
        group.add(pip)
      }
      return group
    }
    const rebuild = () => {
      disposeGroup(content)
      proxies.length = 0
      const galaxy = latest.current.galaxy
      if (props.artStyle === 'stellar' && (environmentSource !== galaxy || environmentGrid !== latest.current.gridMode)) {
        if (environment) { scene.remove(environment); disposeStellarArt(environment) }
        environment = createStellarEnvironment(galaxy, latest.current.gridMode)
        environmentSource = galaxy
        environmentGrid = latest.current.gridMode
        scene.add(environment)
      }
      const nodes = new Map(galaxy.nodes.map(node => [node.id, node]))
      for (const node of galaxy.nodes) {
        const group = makeNode(node)
        group.position.set(node.x, node.y, node.z)
        content.add(group)
        const proxy = new THREE.Mesh(new THREE.SphereGeometry(props.artStyle === 'stellar' ? 7 : 4), new THREE.MeshBasicMaterial({ visible: false }))
        proxy.position.copy(group.position)
        proxy.userData.nodeId = node.id
        content.add(proxy)
        proxies.push(proxy)
      }
      for (const lane of galaxy.links) {
        const a = nodes.get(lane.source), b = nodes.get(lane.target)
        if (!a || !b) continue
        const seam = a.region === 'barrier' || b.region === 'barrier'
        const start = new THREE.Vector3(a.x, a.y, a.z), end = new THREE.Vector3(b.x, b.y, b.z)
        const direction = end.clone().sub(start)
        // Cylinders preserve the original world-space lane width on both backends.
        const width = props.artStyle === 'stellar' ? 0.65 : lane.bridge ? 0.25 : 0.5
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, direction.length(), 6), new THREE.MeshBasicMaterial({
          color: props.artStyle === 'stellar' ? 0x9aafc4 : lane.bridge || !seam ? 0x96b9e6 : 0xf472b6,
          transparent: true, opacity: props.artStyle === 'stellar' ? 0.58 : lane.bridge ? 0.16 : seam ? 0.5 : 0.42, depthWrite: false,
        }))
        mesh.position.copy(start.add(end).multiplyScalar(0.5))
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
        content.add(mesh)
      }
      if (props.artStyle !== 'stellar') {
        const span = Math.max(galaxy.bounds.x[1] - galaxy.bounds.x[0], galaxy.bounds.y[1] - galaxy.bounds.y[0])
        const grid = new THREE.GridHelper(span * 1.4, 26, 0x33415e, 0x1b2440)
        grid.rotation.x = Math.PI / 2
        grid.renderOrder = -1
        const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
        materials.forEach(material => { material.transparent = true; material.opacity = 0.5; material.depthWrite = false })
        content.add(grid)
      }
      scene.updateMatrixWorld(true)
    }
    rebuild()
    rebuildRef.current = () => { void owner?.update(rebuild) }
    const home = () => latest.current.galaxy.nodes.find(node => node.id === latest.current.homeSystemId)
    const focusSystem = (id: string) => rig?.follow(() => {
      const node = latest.current.galaxy.nodes.find(node => node.id === id)
      return node ? { position: node } : null
    }, 240)
    const controller: GalaxyGraphController = {
      recenter: () => { const node = home(); if (node) rig?.recenter(node); else rig?.frameBounds(latest.current.galaxy.bounds) },
      focusSystem,
      focusPoint: point => { rig?.stopFollowing(); rig?.focus(point) },
      canvas: () => canvas,
      pause: () => { paused = true; eligibility() },
      resume: () => { paused = false; eligibility(); schedule() },
      retry: () => owner?.retry(),
    }
    const drawable = () => !paused && intersecting && document.visibilityState !== 'hidden' && wrap.clientWidth > 0 && wrap.clientHeight > 0
    const eligibility = () => {
      owner?.setPresentationEligible(drawable())
      if (rig) rig.controls.enabled = drawable() && (owner?.snapshot().phase === 'ready' || owner?.snapshot().phase === 'pending')
    }
    const frame = () => {
      raf = 0
      if (disposed) return
      const state = owner?.snapshot()
      if ((state?.phase === 'unavailable' || state?.phase === 'interrupted') && !state.retrying) return
      if (drawable()) {
        void owner?.update(() => {
          rig?.update()
          const sky = environment?.getObjectByName('space-sky') as THREE.Group | undefined
          if (sky) {
            const bounds = latest.current.galaxy.bounds
            updateSpaceSky(sky, camera, Math.max(bounds.x[1] - bounds.x[0], bounds.y[1] - bounds.y[0], 100), latest.current.gridSettings)
          }
          if (routeCanvasRef.current) {
            const { galaxy, route } = latest.current
            if (routeSource !== route || routeGalaxy !== galaxy) {
              routeSource = route; routeGalaxy = galaxy
              routeLegs = route ? resolveRoute(galaxy, route) : []
            }
            routeCanvasRef.current.hidden = owner?.snapshot().phase !== 'ready'
            paintMapRoute(routeCanvasRef.current, camera, routeLegs, route, latest.current.mapPalette ?? 'emerald', wrap.clientWidth, wrap.clientHeight)
          }
        }).then(() => owner?.present(scene, camera))
      }
      schedule()
    }
    function schedule() { if (!disposed && !raf && drawable()) raf = requestAnimationFrame(frame) }
    owner = createRendererOwner({
      surface: 'galaxy', alpha: false, stencil: false, factory: props.rendererFactory,
      createCanvas: () => document.createElement('canvas'),
      onCanvas: next => {
        detach()
        const target = rig?.controls.target.clone()
        rig?.dispose()
        canvas?.remove()
        canvas = next
        next.style.cssText = 'width:100%;height:100%;display:block'
        next.tabIndex = 0
        next.setAttribute('aria-label', 'Interactive galaxy map. Arrow keys orbit; Shift and arrow keys pan. Plus and minus zoom. Home recenters.')
        wrap.prepend(next)
        rig = new CameraRig(camera, next, wrap, null, false, { onHome: () => controller.recenter() })
        if (target) { rig.controls.target.copy(target); rig.controls.update() }
        else { const node = home(); if (node) rig.recenter(node, 0); else rig.frameBounds(latest.current.galaxy.bounds) }
        const raycaster = new THREE.Raycaster()
        const pick = (event: PointerEvent) => {
          const rect = next.getBoundingClientRect()
          if (!rect.width || !rect.height) return null
          camera.updateMatrixWorld(true)
          scene.updateMatrixWorld(true)
          raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera)
          const id = raycaster.intersectObjects(proxies, false)[0]?.object.userData.nodeId
          return latest.current.galaxy.nodes.find(node => node.id === id) ?? null
        }
        let down: { x: number; y: number } | null = null
        let last = { id: '', time: -Infinity }
        const pointerDown = (event: PointerEvent) => { if (event.button === 0) down = { x: event.clientX, y: event.clientY } }
        const pointerUp = (event: PointerEvent) => {
          if (!down) return
          const movement = Math.hypot(event.clientX - down.x, event.clientY - down.y)
          down = null
          if (movement > 6 || owner?.snapshot().phase !== 'ready') return
          const node = pick(event)
          const now = event.timeStamp
          if (node && last.id === node.id && now - last.time < 350) {
            focusSystem(node.id)
            last = { id: '', time: -Infinity }
            latest.current.onSelect(node)
          } else {
            last = { id: node?.id ?? '', time: now }
            latest.current.onSelect(node?.id === latest.current.selectedId ? null : node)
          }
        }
        const hover = (event: PointerEvent) => {
          const label = labelRef.current
          if (!label) return
          const node = pick(event)
          label.textContent = node?.name ?? ''
          label.hidden = !node
          label.style.left = `${event.clientX - wrap.getBoundingClientRect().left + 12}px`
          label.style.top = `${event.clientY - wrap.getBoundingClientRect().top + 12}px`
        }
        const leave = () => { if (labelRef.current) labelRef.current.hidden = true; down = null }
        next.addEventListener('pointerdown', pointerDown)
        next.addEventListener('pointerup', pointerUp)
        next.addEventListener('pointermove', hover)
        next.addEventListener('pointerleave', leave)
        next.addEventListener('pointercancel', leave)
        detach = () => {
          next.removeEventListener('pointerdown', pointerDown); next.removeEventListener('pointerup', pointerUp)
          next.removeEventListener('pointermove', hover); next.removeEventListener('pointerleave', leave); next.removeEventListener('pointercancel', leave)
        }
      },
      onState: state => {
        latest.current.onRendererState?.(state)
        if (routeCanvasRef.current && state.phase !== 'ready') routeCanvasRef.current.hidden = true
        if (state.phase === 'ready' && !firstReady) { firstReady = true; latest.current.onReady?.(controller) }
        if ((state.phase === 'unavailable' || state.phase === 'interrupted') && !state.retrying) { cancelAnimationFrame(raf); raf = 0 }
        else schedule()
        eligibility()
      },
    })
    latest.current.onController?.(controller)
    const resize = () => {
      const width = wrap.clientWidth, height = wrap.clientHeight
      owner?.resize(width, height, Math.min(window.devicePixelRatio || 1, 2))
      if (width > 0 && height > 0) { camera.aspect = width / height; camera.updateProjectionMatrix() }
      eligibility(); schedule()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    const intersection = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting ?? true; eligibility(); schedule() })
    intersection.observe(wrap)
    const visibility = () => { eligibility(); schedule() }
    document.addEventListener('visibilitychange', visibility)
    resize()
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect(); intersection.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      detach(); rig?.dispose(); owner?.dispose(); canvas?.remove(); disposeGroup(content)
      if (environment) disposeStellarArt(environment)
      rebuildRef.current = null
      latest.current.onController?.(null)
    }
  }, [props.rendererFactory, props.artStyle])
  useEffect(() => { rebuildRef.current?.() }, [props.galaxy, props.selectedId, props.fleetSystemIds, props.gridMode])
  return <div ref={wrapRef} data-testid="galaxy-graph" className="absolute inset-0">
    {(props.artStyle === 'stellar' || props.route) && <canvas ref={routeCanvasRef} data-testid="galaxy-route-overlay" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />}
    <div ref={labelRef} hidden className="pointer-events-none absolute rounded bg-zinc-800 px-2 py-1 hud-type-caption text-white" />
  </div>
}
export default GalaxyGraph

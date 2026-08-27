'use client'

// WebGLBoard — the board's GL world layer: scene assembly, post chain, render
// loop (port-board-to-webgl-renderer). Plumbing only: everything it draws
// arrives pre-resolved through the boundary contract (./contract) — a
// PackedScene built once per board read, PackedFleetInstance[] reconciled on
// every roster update, and a getFrame callback producing each frame's resolved
// positions/accents/clock. No domain DTO and no palette record crosses into
// this module; the decisions all happened outside (board-pack/board-frame).
//
// The post chain is where "flat" actually gets solved:
//   RenderPass → UnrealBloomPass → InstrumentShader → OutputPass
// Bloom is not decoration here. The star, the exhaust and the brightest stars
// are all authored ABOVE 1.0 specifically so the threshold catches them and
// nothing else — which is why they read as light sources and the planets,
// which stay below it, read as lit objects.
//
// The camera is a CONSUMER: useBoardProjection owns the parameters (fit
// distance, tilt, worldPerPixel) as React state and hands them down through
// the `camera` prop each render; this module places its THREE camera from them
// every frame and never reads state back out of it.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createStarfield } from './scene-starfield'
import { createLattice } from './scene-lattice'
import { createBodies, createStar } from './scene-bodies'
import { createFleets } from './scene-fleets'
import { createOrbitRings } from './scene-rings'
import { InstrumentShader } from './instrument-pass'
import { TUNED_LOOK } from './contract'
import type { BoardCameraState, FrameData, PackedFleetInstance, PackedScene, Rgb } from './contract'

// The tuned production defaults (TUNED_LOOK in ./contract): the effects
// should make the board legible, not announce themselves. Constants, not spec
// thresholds; the tuning bench and dev panel override them through `settings`.
// Threshold 0.78 is the load-bearing number: set so ONLY the star, the exhaust
// and the brightest field stars clear it.
const BLOOM_THRESHOLD = 0.78

export interface WebGLBoardSettings {
  bloom: number
  instrument: number
  starfield: boolean
  // Live scene-look knobs (BoardTuning): star photosphere scale, a linear-RGB
  // tint overriding the starClass colour (null = packed tint; it also drives
  // the planets' rim light), and a size multiplier for every non-star body.
  starScale: number
  starTint: Rgb | null
  bodyScale: number
}

export interface WebGLBoardProps {
  // The canvas to attach the renderer to — BoardCanvas's element, the same
  // node the render guard's contextlost/contextrestored listeners are bound to.
  canvas: HTMLCanvasElement
  scene: PackedScene
  fleets: PackedFleetInstance[]
  camera: BoardCameraState
  getFrame: (wallNowMs: number) => FrameData
  settings?: Partial<WebGLBoardSettings>
  // Fires once, after the first composer.render() — the loading-state gate
  // (`System Board Route and Data Fan-In`, first-frame scenario).
  onFirstFrame?: () => void
}

// Render-health introspection for the e2e gate (task 4.10): after each frame
// the canvas element carries a callable reporting the renderer's draw stats.
// Not exposed in production builds.
export interface BoardRenderHealth {
  calls: number
  triangles: number
  frames: number
}

export function WebGLBoard({ canvas, scene, fleets, camera, getFrame, settings, onFirstFrame }: WebGLBoardProps) {
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const getFrameRef = useRef(getFrame)
  getFrameRef.current = getFrame
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const onFirstFrameRef = useRef(onFirstFrame)
  onFirstFrameRef.current = onFirstFrame
  const fleetsRef = useRef<ReturnType<typeof createFleets> | null>(null)
  const pendingFleetsRef = useRef(fleets)

  // Rebuild only when the packed SCENE changes (a fresh board read). Camera,
  // settings, frames and fleet syncs all ride refs/effects so nothing else
  // tears down the GL context.
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    renderer.setPixelRatio(pixelRatio)
    const [cr, cg, cb] = scene.clearColor
    renderer.setClearColor(new THREE.Color(cr, cg, cb), 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const world = new THREE.Scene()

    // FOV matches useBoardProjection's BOARD_FOV_DEG — the hook computes the
    // fit distance for this frustum.
    const cam = new THREE.PerspectiveCamera(38, 1, 1, 20000)

    const starfield = createStarfield(0xbeef, pixelRatio)
    world.add(starfield.group)

    const lattice = createLattice(scene.latticeTiles, scene.theme.signal)
    world.add(lattice.mesh)

    const rings = createOrbitRings(scene.rings, scene.theme.orbitRing, scene.theme.orbitRingHilite)
    world.add(rings.group)

    const bodies = createBodies(scene.bodies)
    world.add(bodies.mesh)

    const star = scene.star ? createStar(scene.star.radius, scene.star.tint) : null
    if (star) world.add(star.mesh)

    const fleetsVisual = createFleets(scene.theme.thruster, scene.theme.signal)
    world.add(fleetsVisual.group)
    fleetsRef.current = fleetsVisual
    fleetsVisual.sync(pendingFleetsRef.current)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(world, cam))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), TUNED_LOOK.bloom, 0.4, BLOOM_THRESHOLD)
    composer.addPass(bloom)
    const instrument = new ShaderPass(InstrumentShader)
    composer.addPass(instrument)
    composer.addPass(new OutputPass())

    function resize() {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      bloom.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      ;(instrument.uniforms.uResolution!.value as THREE.Vector2).set(w * pixelRatio, h * pixelRatio)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    let raf = 0
    let last = performance.now()
    let frames = 0
    // Accumulate draw stats across the whole post chain — auto-reset would
    // leave only the final OutputPass quad (1 call, 1 triangle) visible to
    // the render-health probe.
    renderer.info.autoReset = false

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      // Battery/GPU courtesy: hold the post chain while the tab is hidden.
      // Correctness never depends on this — the world clock is a closed-form
      // re-anchored projection, not an integrated accumulator.
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      const c = cameraRef.current
      const s = settingsRef.current
      const f = getFrameRef.current(now)

      const starTint = s?.starTint ?? null
      bodies.update(f.bodyOffsets, f.fxTime, c.worldPerPixel, s?.bodyScale ?? TUNED_LOOK.bodyScale, starTint)
      fleetsVisual.update(f.fleets, f.fxTime, dt, c.worldPerPixel)
      lattice.update(f.fxTime, f.pulse, f.sensor, c.worldPerPixel)
      rings.update(f.selectedRing)
      star?.update(f.fxTime, c.worldPerPixel, s?.starScale ?? TUNED_LOOK.starScale, starTint)
      const wantStarfield = s?.starfield ?? true
      if (wantStarfield) starfield.update(f.fxTime, c.worldPerPixel)
      starfield.group.visible = wantStarfield

      const bloomStrength = s?.bloom ?? TUNED_LOOK.bloom
      bloom.enabled = bloomStrength > 0
      bloom.strength = bloomStrength
      const instrumentAmount = s?.instrument ?? TUNED_LOOK.instrument
      instrument.enabled = instrumentAmount > 0
      instrument.uniforms.uAmount!.value = instrumentAmount
      instrument.uniforms.uTime!.value = f.fxTime

      // Place the camera from the hook-owned parameters — below the target,
      // looking up the tilt at the board plane.
      cam.position.set(
        c.target.x,
        c.target.y - Math.sin(c.tiltRad) * c.dist,
        Math.cos(c.tiltRad) * c.dist,
      )
      cam.lookAt(c.target.x, c.target.y, 0)

      renderer.info.reset()
      composer.render()
      frames++

      if (process.env.NODE_ENV !== 'production') {
        ;(canvas as HTMLCanvasElement & { __boardRenderHealth?: () => BoardRenderHealth }).__boardRenderHealth =
          () => ({
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            frames,
          })
      }

      if (frames === 1) onFirstFrameRef.current?.()
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      fleetsRef.current = null
      starfield.dispose()
      lattice.dispose()
      rings.dispose()
      bodies.dispose()
      star?.dispose()
      fleetsVisual.dispose()
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [canvas, scene])

  // Fleet arrivals/departures reconcile against the live scene — on the same
  // roster update, never waiting for a scene rebuild.
  useEffect(() => {
    pendingFleetsRef.current = fleets
    fleetsRef.current?.sync(fleets)
  }, [fleets])

  return null
}

export default WebGLBoard

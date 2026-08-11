'use client'

// SPIKE (throwaway) — the WebGL board: scene assembly, post chain, render loop.
//
// Client-only and dynamically imported (three needs a GL context), the same way
// GalaxyGraph is pulled into GalaxyView.
//
// The post chain is where "flat" actually gets solved:
//   RenderPass → UnrealBloomPass → InstrumentShader → OutputPass
// Bloom is not decoration here. The star, the scan pulse, the exhaust and the
// brightest stars are all authored ABOVE 1.0 specifically so the threshold
// catches them and nothing else — which is why they read as light sources and
// the planets, which stay below it, read as lit objects. That distinction is
// impossible in SVG: an <circle fill="#ffd27d"> cannot be brighter than #ffd27d.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { fitViewBox, HEX_SIZE, hexesWithinRadius, hexToPixel } from '@/lib/hex/pixel'
import { createStarfield } from './scene-starfield'
import { createLattice } from './scene-lattice'
import { createBodies, createStar } from './scene-bodies'
import { createFleet } from './scene-fleet'
import { InstrumentShader } from './instrument-pass'
import { VOID } from './spike-palette'
import { patrolAt } from './patrol'
import type { SpikeBoard } from './mock-board'

export interface BoardSettings {
  bloom: number // UnrealBloomPass strength; 0 disables the pass
  starfield: boolean
  instrument: number // InstrumentShader master amount, 0..1
  tiltDeg: number // camera tilt off straight-down
  speed: number // world-time multiplier
  // Pan/zoom is off while the wipe comparator is up: moving this camera would
  // slide it out of register with the SVG pane behind the wipe line.
  interactive: boolean
}

// The animation clock both boards share, advanced by one rAF in the page so the
// two panes are frame-identical in split view.
export interface SpikeClock {
  elapsed: number // seconds since mount
  worldTime: number // world-milliseconds, speed-scaled
}

export interface WebGLBoardProps {
  board: SpikeBoard
  settings: BoardSettings
  clock: { current: SpikeClock }
}

// Scan cycle: the echo disc grows from the fleet out to the rim, then rests.
const SCAN_TRAVEL = 5.0
const SCAN_REST = 2.6

export function WebGLBoard({ board, settings, clock }: WebGLBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Settings are read inside the render loop, which must not be torn down and
  // rebuilt on every slider drag — so they go through a ref, not the closure.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const clockRef = useRef(clock)
  clockRef.current = clock

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(new THREE.Color(VOID), 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'

    const scene = new THREE.Scene()

    // Frame EXACTLY the SVG board's viewBox, so at tilt 0 / zoom 1 the two
    // renderers are in pixel register and the wipe comparator lines up. Same
    // fitViewBox the SVG board uses, same xMidYMid-meet fitting rule.
    const boardRadius = board.radius * Math.sqrt(3) * HEX_SIZE
    const vb = fitViewBox(hexesWithinRadius(board.radius))
    const FOV = 38
    const halfFov = THREE.MathUtils.degToRad(FOV / 2)

    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000)
    // Distance at which the whole viewBox fits; `zoom` scales off it.
    let fitDist = 1000
    let zoom = 1
    const target = new THREE.Vector3(0, 0, 0)

    function refit(aspect: number) {
      const vbAspect = vb.w / vb.h
      // "meet": whichever axis is tighter decides, exactly as preserveAspectRatio does.
      const visibleH = aspect > vbAspect ? vb.h : vb.w / aspect
      fitDist = visibleH / (2 * Math.tan(halfFov))
    }

    function placeCamera() {
      const tilt = THREE.MathUtils.degToRad(settingsRef.current.tiltDeg)
      const dist = fitDist / zoom
      camera.position.set(target.x, target.y - Math.sin(tilt) * dist, Math.cos(tilt) * dist)
      camera.lookAt(target)
    }

    // --- scene ------------------------------------------------------------------
    const starfield = createStarfield(0xbeef, pixelRatio)
    scene.add(starfield.group)

    const lattice = createLattice(board.radius, board.innerMaxRing, board.midMaxRing)
    scene.add(lattice.mesh)

    const bodies = createBodies(board.bodies)
    scene.add(bodies.mesh)

    const starBody = board.bodies.find((b) => b.type === 'star')
    const star = createStar(starBody?.drawRadius ?? 52, board.starClass)
    scene.add(star.mesh)

    const fleet = createFleet()
    scene.add(fleet.group)

    // --- post chain -------------------------------------------------------------
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))

    // Threshold 0.78 is the load-bearing number: it is set so ONLY the star, the
    // scan pulse, the exhaust and the brightest field stars clear it. Planets sit
    // deliberately underneath, so they read as lit objects rather than lamps.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), settings.bloom, 0.4, 0.78)
    composer.addPass(bloom)

    const instrument = new ShaderPass(InstrumentShader)
    composer.addPass(instrument)

    composer.addPass(new OutputPass())

    // --- fleet patrol path ------------------------------------------------------
    // Shared with the SVG board via ./patrol so both ships fly the same line at
    // the same instant. Points come out in SVG space (y down); the scene's y is
    // up, so every y is negated on the way in.
    const A = hexToPixel(board.fleet.hex.q, board.fleet.hex.r)
    // Burn toward the far side of the goldilocks band, so the ship crosses the
    // lit part of the system rather than skirting the dark rim.
    const B = hexToPixel(-Math.round(board.radius * 0.35), Math.round(board.radius * 0.1))

    // --- interaction ------------------------------------------------------------
    let dragging = false
    let lastX = 0
    let lastY = 0

    function onPointerDown(e: PointerEvent) {
      if (!settingsRef.current.interactive) return
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return
      // Convert pixel drag to world units at the target plane.
      const worldPerPx = (2 * (fitDist / zoom) * Math.tan(halfFov)) / renderer.domElement.clientHeight
      target.x -= (e.clientX - lastX) * worldPerPx
      target.y += (e.clientY - lastY) * worldPerPx
      lastX = e.clientX
      lastY = e.clientY
    }
    function onPointerUp(e: PointerEvent) {
      dragging = false
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId)
      }
    }
    function onWheel(e: WheelEvent) {
      if (!settingsRef.current.interactive) return
      e.preventDefault()
      zoom = THREE.MathUtils.clamp(zoom * Math.pow(0.9984, e.deltaY), 0.25, 6)
    }

    const el = renderer.domElement
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    // --- resize -----------------------------------------------------------------
    function resize() {
      const w = host!.clientWidth
      const h = host!.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      bloom.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      refit(w / h)
      placeCamera()
      ;(instrument.uniforms.uResolution!.value as THREE.Vector2).set(w * pixelRatio, h * pixelRatio)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    // --- loop -------------------------------------------------------------------
    let raf = 0
    let last = performance.now()
    const pulseCenter = new THREE.Vector2()
    const sensorCenter = new THREE.Vector2()

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      const s = settingsRef.current
      // dt is local (the trail emits per real second regardless of world speed);
      // elapsed/worldTime come from the page's shared clock so the SVG pane
      // beside us is showing the exact same instant.
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const { elapsed, worldTime } = clockRef.current.current

      // Fleet along its patrol leg (SVG space → scene space: negate y).
      const pat = patrolAt(A, B, elapsed)
      const fx = pat.x
      const fy = -pat.y
      // The hull models point along local +y, which rotation by `heading` maps to
      // (-sin h, cos h). Solve that for the scene-space velocity (vx, -vy).
      const heading = Math.atan2(-pat.vx, -pat.vy)

      fleet.update(fx, fy, heading, pat.moving, elapsed, dt)

      // The scan echo rides the fleet (#0006 Decision #23) — the pulse is pinned
      // to where the unit is now, and grows out to the rim.
      const scanT = elapsed % (SCAN_TRAVEL + SCAN_REST)
      const scanning = scanT < SCAN_TRAVEL
      const scanP = scanning ? scanT / SCAN_TRAVEL : 0
      pulseCenter.set(fx, fy)
      sensorCenter.set(fx, fy)

      lattice.update(
        elapsed,
        {
          center: pulseCenter,
          radius: scanning ? scanP * boardRadius : -1,
          // The ring thins as it travels — bright at the muzzle, faint at the rim.
          strength: scanning ? Math.pow(1 - scanP, 1.4) * 0.9 : 0,
        },
        { center: sensorCenter, radius: board.sensorRadius * Math.sqrt(3) * HEX_SIZE },
      )

      bodies.update(worldTime, elapsed)
      star.update(elapsed)
      if (s.starfield) starfield.update(elapsed)
      starfield.group.visible = s.starfield

      bloom.enabled = s.bloom > 0
      bloom.strength = s.bloom
      instrument.enabled = s.instrument > 0
      instrument.uniforms.uAmount!.value = s.instrument
      instrument.uniforms.uTime!.value = elapsed

      placeCamera()
      composer.render()
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      starfield.dispose()
      lattice.dispose()
      bodies.dispose()
      star.dispose()
      fleet.dispose()
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
      if (el.parentNode === host) host.removeChild(el)
    }
    // Rebuild only when the BOARD changes. Settings ride the ref above so that
    // dragging a slider never tears down the GL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  return <div ref={hostRef} data-testid="webgl-board" className="absolute inset-0 h-full w-full" />
}

export default WebGLBoard

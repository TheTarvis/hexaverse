'use client'

import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform, uv, vec2, vec3, vec4, max, exp, atan, cos, smoothstep } from 'three/tsl'
import { createRendererOwner } from '@/components/render-guard/renderer-owner'
import styles from './hud-frame-lighting.module.css'

type Props = {
  hostRef: RefObject<HTMLElement | null>
  intensity?: number
  speed?: number
  paused?: boolean
}

/** Decorative frame only; CSS remains visible throughout renderer startup or failure. */
export function HudFrameLighting({ hostRef, intensity = 1.2, speed = 0.7, paused = false }: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const settings = useRef({ intensity, speed, paused })
  const requestDraw = useRef<() => void>(() => {})

  useEffect(() => {
    settings.current = { intensity, speed, paused }
    requestDraw.current()
  }, [intensity, speed, paused])

  useEffect(() => {
    const host = hostRef.current
    const layer = layerRef.current
    if (!host || !layer) return

    const padding = 12
    const size = uniform(new THREE.Vector2(1, 1))
    const halfSize = uniform(new THREE.Vector2(1, 1))
    const time = uniform(0)
    const gain = uniform(settings.current.intensity)
    const titleBox = uniform(new THREE.Vector4(0, 0, -1, -1))
    const closeBox = uniform(new THREE.Vector4(0, 0, -1, -1))

    // Pixel-space half-planes describe the same fixed 20px chamfers as the CSS shell.
    const p = vec2(uv().x.sub(0.5), uv().y.oneMinus().sub(0.5)).mul(size)
    const q = p.abs()
    const edge = max(
      max(q.x.sub(halfSize.x), q.y.sub(halfSize.y)),
      q.x.add(q.y).sub(halfSize.x).sub(halfSize.y).add(20).mul(Math.SQRT1_2),
    ).add(2.5).abs()
    const rim = exp(edge.mul(-0.85))
    const halo = exp(edge.mul(-0.2)).mul(0.16)
    const angle = atan(p.y, p.x)
    // Absolute cosine produces two matching peaks, exactly half a turn apart.
    const opposedPulses = exp(cos(angle.sub(time)).abs().sub(1).mul(22))
    const pulse = opposedPulses.mul(2.1).add(0.025)
    const titleMask = smoothstep(0, 1.5, max(p.x.sub(titleBox.x).abs().sub(titleBox.z), p.y.sub(titleBox.y).abs().sub(titleBox.w)))
    const closeMask = smoothstep(0, 1.5, max(p.x.sub(closeBox.x).abs().sub(closeBox.z), p.y.sub(closeBox.y).abs().sub(closeBox.w)))
    const alpha = rim.add(halo).mul(pulse).mul(gain).mul(titleMask).mul(closeMask).clamp(0, 0.95)
    const color = vec3(0.3, 0.76, 1).add(vec3(0.55, 0.23, 0).mul(rim))
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false })
    material.fragmentNode = vec4(color, alpha)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry, material))
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2)
    camera.position.z = 1

    let disposed = false
    let visible = typeof IntersectionObserver === 'undefined'
    let frame: number | null = null
    let last = 0
    let width = 0
    let height = 0
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const forcedColors = window.matchMedia('(forced-colors: active)')
    const eligible = () => !disposed && visible && !document.hidden && !forcedColors.matches && width > 0 && height > 0
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      last = 0
    }
    const schedule = () => {
      if (frame === null && eligible()) frame = requestAnimationFrame(draw)
    }
    function draw(now: number) {
      frame = null
      if (!eligible()) return
      const state = owner.snapshot()
      if (state.phase !== 'pending' && state.phase !== 'ready' && !state.retrying) return
      const current = settings.current
      const animated = !current.paused && !motion.matches
      // Cap decorative submissions at 30fps. Static and hidden cards have no loop.
      if (animated && last && now - last < 1000 / 30) { schedule(); return }
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = animated ? now : 0
      gain.value = current.intensity
      if (animated) {
        time.value += delta * current.speed
      }
      void owner.present(scene, camera)
      if (animated) schedule()
    }
    const sync = () => {
      owner.setPresentationEligible(eligible())
      stop()
      schedule()
    }
    const owner = createRendererOwner({
      surface: 'hud',
      alpha: true,
      stencil: false,
      createCanvas: () => document.createElement('canvas'),
      onCanvas: canvas => { layer.replaceChildren(canvas) },
      onState: () => {
        if (disposed) return
        schedule()
      },
    })
    const resize = () => {
      const rect = host.getBoundingClientRect()
      width = rect.width
      height = rect.height
      size.value.set(width + padding * 2, height + padding * 2)
      halfSize.value.set(width / 2, height / 2)
      for (const [element, box] of [[host.querySelector('[data-slot="hud-title"]'), titleBox], [host.querySelector('[data-slot="hud-close"]'), closeBox]] as const) {
        const bounds = element?.getBoundingClientRect()
        if (bounds) box.value.set(bounds.x + bounds.width / 2 - rect.x - width / 2, bounds.y + bounds.height / 2 - rect.y - height / 2, bounds.width / 2, bounds.height / 2)
        else box.value.set(0, 0, -1, -1)
      }
      owner.resize(width + padding * 2, height + padding * 2, Math.min(devicePixelRatio, 2))
      sync()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    // Title/close changes can move masks without changing the shell's dimensions.
    const chromeObserver = new MutationObserver(resize)
    chromeObserver.observe(host, { childList: true, subtree: true, characterData: true })
    const intersection = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
      : null
    intersection?.observe(host)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    forcedColors.addEventListener('change', sync)
    requestDraw.current = sync
    resize()

    return () => {
      disposed = true
      requestDraw.current = () => {}
      stop()
      observer.disconnect()
      chromeObserver.disconnect()
      intersection?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      forcedColors.removeEventListener('change', sync)
      owner.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [hostRef])

  return <div ref={layerRef} data-slot="hud-frame-lighting" aria-hidden="true" className={styles.layer} />
}

import * as THREE from 'three'
import type { ModelViewEffectFactory } from './WebGPUModelView'

/** Separate, instance-owned field; uses ordinary materials on both renderer backends. */
export const createLaneGatePortal: ModelViewEffectFactory = ({ bounds }) => {
  const height = bounds.max.y - bounds.min.y
  const object = new THREE.Group()
  object.name = 'LaneGatePortal'
  // The emitting rails sit behind the front plate surfaces.
  object.position.z = -height * 0.09
  const contour = (y: number) => {
    const cap = Math.max(0, (Math.abs(y) - 0.82) / 0.18)
    return Math.sqrt(Math.max(0, 1 - cap * cap))
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / (canvas.width - 1) * 2 - 1
    const v = y / (canvas.height - 1) * 2 - 1
    const edge = contour(v) * 0.93
    const distance = Math.abs(u) - edge
    const rim = Math.exp(-Math.pow(distance / 0.032, 2))
    const halo = Math.exp(-Math.pow(distance / 0.12, 2))
    const mist = distance < 0 ? (0.24 + 0.20 * Math.pow(Math.sin(u * 13 + Math.sin(v * 15) * 2) * Math.cos(v * 19 + u * 5), 2)) * Math.min(1, (1 - Math.abs(v)) * 9) : 0
    const alpha = (rim * 0.95 + halo * 0.32 + mist) * Math.min(1, (1 - Math.abs(v)) * 18)
    const i = (y * canvas.width + x) * 4
    pixels.data[i] = 45 + rim * 140
    pixels.data[i + 1] = 125 + rim * 120
    pixels.data[i + 2] = 235 + rim * 20
    pixels.data[i + 3] = Math.round(Math.min(1, alpha) * 255)
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const membrane = new THREE.Mesh(new THREE.PlaneGeometry(1, height * 0.98), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }))
  object.add(membrane)
  const segments = 80
  const filaments = Array.from({ length: 14 }, (_, index) => {
    const positions = new Float32Array((segments + 1) * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({ color: index < 4 ? 0x73c5ff : 0x2777df, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    object.add(line)
    return { positions, geometry, material, index }
  })
  return {
    object,
    update(progress, elapsed) {
      const opening = THREE.MathUtils.clamp(progress, 0, 1)
      object.visible = opening > 0.025
      object.scale.x = height * (0.012 + 0.688 * opening) * 1.08
      membrane.material.opacity = THREE.MathUtils.smoothstep(opening, 0.025, 0.24) * (0.96 + Math.sin(elapsed * 1.4) * 0.04)
      for (const { positions, geometry, material, index } of filaments) {
        const side = index % 2 ? 1 : -1
        const inner = index < 4 ? 0.99 : 0.12 + (index - 4) * 0.085
        for (let i = 0; i <= segments; i++) {
          const t = i / segments
          const y = t * 2 - 1
          const envelope = contour(y)
          const ripple = Math.sin(y * 19 + elapsed * (0.9 + index * 0.07) + index * 5) * Math.sin(y * 37 - elapsed * 0.65 + index) * 0.018
          const sweep = index < 4 ? side * 0.465 * inner : Math.sin(y * (1.5 + index * 0.13) + index * 2.3 + elapsed * 0.13) * 0.38
          positions[i * 3] = envelope * (sweep + ripple)
          positions[i * 3 + 1] = y * height * 0.49
          positions[i * 3 + 2] = Math.sin(y * 8 + index) * height * 0.004
        }
        geometry.getAttribute('position').needsUpdate = true
        material.opacity = membrane.material.opacity * (index < 4 ? 0.62 : 0.32) * (0.75 + Math.sin(elapsed * 1.1 + index * 3) * 0.25)
      }
    },
  }
}

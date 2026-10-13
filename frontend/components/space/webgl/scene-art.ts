import * as THREE from 'three'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { uniform, uv, sin, vec2, vec3, texture, normalView, positionViewDirection, positionLocal, exp } from 'three/tsl'

// Presentation only: sample a continuous 3D field on the sphere so longitude
// wraps without a texture seam. No world generation or simulation uses this.
function seedOf(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

function noise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const smooth = (v: number) => v * v * (3 - 2 * v)
  const sx = smooth(x - ix), sy = smooth(y - iy), sz = smooth(z - iz)
  let sum = 0
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    let h = Math.imul(ix + dx, 374761393) ^ Math.imul(iy + dy, 668265263) ^ Math.imul(iz + dz, 2147483647) ^ seed
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const value = ((h ^ (h >>> 16)) >>> 0) / 4294967295
    sum += value * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz)
  }
  return sum
}

function terrain(x: number, y: number, z: number, seed: number): number {
  let value = 0, amplitude = 0.55
  for (let i = 0; i < 5; i++) {
    value += amplitude * noise(x, y, z, seed + i * 1013)
    x *= 2.07; y *= 2.07; z *= 2.07; amplitude *= 0.48
  }
  return value
}

export function createSurfaceTexture(bodyType: string, seed: string): THREE.DataTexture | null {
  if (!['gas_giant', 'rocky', 'ice', 'moon'].includes(bodyType)) return null
  const width = 256, height = 128, key = seedOf(seed)
  const data = new Uint8Array(width * height * 4)
  const gasPalettes = [
    [[113, 68, 42], [238, 211, 160]],
    [[75, 108, 126], [203, 225, 225]],
    [[131, 93, 65], [245, 224, 189]],
  ]
  const gas = gasPalettes[key % gasPalettes.length]!
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const latitude = Math.PI * row / (height - 1)
    const longitude = 2 * Math.PI * col / width
    const x = Math.sin(latitude) * Math.cos(longitude), y = Math.cos(latitude), z = Math.sin(latitude) * Math.sin(longitude)
    const broad = terrain(x * 3, y * 3, z * 3, key)
    const fine = noise(x * 65, y * 65, z * 65, key)
    let low: number[], high: number[], blend: number
    if (bodyType === 'gas_giant') {
      const turbulence = terrain(x * 6, y * 14, z * 6, key)
      const band = latitude * 32 + turbulence * 3.8
      blend = 0.52 + 0.25 * Math.sin(band) + 0.12 * Math.sin(band * 2.7 + broad * 4) + (fine - 0.5) * 0.1
      low = gas[0]!; high = gas[1]!
    } else if (bodyType === 'rocky') {
      const ridge = 1 - Math.abs(terrain(x * 15, y * 15, z * 15, key) * 2 - 1)
      blend = THREE.MathUtils.clamp((broad - 0.28) * 2.1 + ridge * 0.13 + (fine - 0.5) * 0.14, 0, 1)
      low = [49, 48, 46]; high = [208, 164 + key % 25, 113 + key % 35]
    } else if (bodyType === 'ice') {
      const fracture = Math.pow(1 - Math.abs(broad * 2 - 1), 12)
      blend = THREE.MathUtils.clamp(0.9 - fracture * 0.65 + (fine - 0.5) * 0.12, 0, 1)
      low = [52, 104, 139]; high = [218, 239, 243]
    } else {
      blend = THREE.MathUtils.clamp((broad - 0.2) * 1.65 + (fine - 0.5) * 0.2, 0, 1)
      low = [65, 64, 69]; high = [197, 193, 186]
    }
    const offset = (row * width + col) * 4
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = Math.round(THREE.MathUtils.lerp(low[channel]!, high[channel]!, blend))
    data[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export type PlanetKind = 'rocky' | 'gas_giant' | 'ice' | 'moon'

export function planetKind(kind: string): PlanetKind | null {
  const normalized = kind.replaceAll(' ', '_')
  return normalized === 'rocky' || normalized === 'gas_giant' || normalized === 'ice' || normalized === 'moon' ? normalized : null
}

const cloudTimes = new WeakMap<THREE.Mesh, { value: number }>()

/** Presentation seconds only; pausing preserves the cloud pose without a jump. */
export function advancePlanetClouds(mesh: THREE.Mesh, seconds: number): void {
  const time = cloudTimes.get(mesh)
  if (time && Number.isFinite(seconds)) time.value += THREE.MathUtils.clamp(seconds, 0, 0.1)
}

/** Shared by the system map and inspector; the object ID fixes its surface. */
export function createPlanetModel(kind: PlanetKind, objectId: string, geometry: THREE.SphereGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new MeshStandardNodeMaterial({
    color: 0xffffff, map: createSurfaceTexture(kind, objectId),
    roughness: kind === 'ice' ? 0.65 : 0.9, metalness: 0,
  }))
  if (kind === 'gas_giant') {
    const time = uniform(0)
    cloudTimes.set(mesh, time)
    const latitude = uv().y.mul(Math.PI)
    const shear = sin(latitude.mul(8)).mul(sin(time.mul(0.12))).mul(0.045)
    const ripple = sin(latitude.mul(14).add(time.mul(0.18))).sub(sin(latitude.mul(14))).mul(0.008)
    const offset = time.mul(0.006).add(shear.add(ripple).mul(sin(latitude)))
    mesh.material.colorNode = texture(mesh.material.map!, uv().add(vec2(offset, 0)))

  }
  if (kind === 'rocky') {
    const atmosphere = new THREE.Mesh(geometry, createAtmosphereMaterial())
    atmosphere.scale.setScalar(1.025)
    mesh.add(atmosphere)
  }
  return mesh
}

export function createRadialGlowTexture(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x - 63.5) / 63.5, (y - 63.5) / 63.5)
    const alpha = r >= 1 ? 0 : Math.exp(-5 * r * r) * (1 - r * r) ** 2
    const i = (y * size + x) * 4
    data[i] = data[i + 1] = data[i + 2] = 255
    data[i + 3] = Math.round(alpha * 255)
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export function createHexGrid(extent: number): THREE.LineSegments {
  const radius = Math.max(Number.isFinite(extent) ? extent : 1, 0.001)
  const size = radius / 24
  const positions: number[] = [], colors: number[] = []
  const edges = new Set<string>()
  // Flat-topped axial coordinates; duplicate shared edges are emitted once.
  for (let q = -17; q <= 17; q++) for (let r = -30; r <= 30; r++) {
    const cx = 1.5 * size * q, cz = Math.sqrt(3) * size * (r + q / 2)
    if (Math.hypot(cx, cz) + size > radius * 1.04) continue
    for (let edge = 0; edge < 6; edge++) {
      const a = edge * Math.PI / 3, b = (edge + 1) * Math.PI / 3
      const x1 = cx + size * Math.cos(a), z1 = cz + size * Math.sin(a)
      const x2 = cx + size * Math.cos(b), z2 = cz + size * Math.sin(b)
      const key = [x1 + x2, z1 + z2].map(v => Math.round(v / size * 1000)).join(':')
      if (edges.has(key)) continue
      edges.add(key)
      positions.push(x1, 0, z1, x2, 0, z2)
      for (const distance of [Math.hypot(x1, z1), Math.hypot(x2, z2)]) {
        const fade = 1 - THREE.MathUtils.smoothstep(distance / radius, 0.62, 1.04)
        colors.push(fade, fade, fade)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0x24768e, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
  }))
}

/** A restrained scattering rim; its parent supplies position and draw scale. */
export function createAtmosphereMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  material.colorNode = vec3(0.16, 0.48, 0.7)
  material.opacityNode = normalView.normalize().dot(positionViewDirection.normalize()).max(0).oneMinus().pow(5).mul(0.48)
  return material
}

/** Far sky: static broad haze, never a foreground veil. */
export function createBackdropMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false })
  const d = positionLocal.normalize()
  const ribbon = exp(d.y.add(0.22).add(sin(d.x.mul(4).add(d.z.mul(2))).mul(0.16)).mul(3.8).pow(2).negate())
  const cloud = sin(d.x.mul(7).add(d.z.mul(5))).mul(sin(d.z.mul(8).sub(d.y.mul(6)))).mul(0.22).add(0.55)
  material.colorNode = vec3(0.0015, 0.004, 0.012).add(vec3(0.003, 0.012, 0.032).mul(ribbon).mul(cloud))
  return material
}

import * as THREE from 'three'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { uniform, uv, sin, cos, atan, length, smoothstep, vec2, vec3, texture, normalView, positionViewDirection, positionLocal, exp } from 'three/tsl'

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

/** Cloud morphology varies independently of color, fixed by the object's ID. */
function gasAppearance(key: number) {
  const family = (key >>> 8) % 4
  return {
    family,
    bands: [42, 12, 22, 18][family]! + (key >>> 16) % 7,
    phase: (key % 997) / 997 * Math.PI * 2,
    turbulence: [1.4, 2.1, 7.5, 3.2][family]!,
    speed: 0.004 + (key % 11) * 0.0005,
    shear: [0.003, 0.008, 0.012, 0.006][family]!,
    stormU: 0.18 + (key % 101) / 101 * 0.64,
    stormV: 0.32 + (key >>> 16) % 97 / 97 * 0.36,
    stormWidth: family === 3 ? 0.58 : 0.3,
    stormHeight: family === 3 ? 0.22 : 0.13,
  }
}

export function createSurfaceTexture(bodyType: string, seed: string): THREE.DataTexture | null {
  if (!['gas_giant', 'rocky', 'ice', 'moon'].includes(bodyType)) return null
  const width = 256, height = 128, key = seedOf(seed)
  const data = new Uint8Array(width * height * 4)
  const gasPalettes = [
    [[106, 45, 29], [249, 206, 139]],
    [[25, 70, 123], [167, 225, 239]],
    [[67, 42, 112], [225, 172, 216]],
    [[25, 88, 88], [169, 226, 195]],
    [[117, 67, 35], [246, 228, 183]],
  ]
  const gas = gasPalettes[key % gasPalettes.length]!
  const clouds = gasAppearance(key)
  // Art styles are fixed by identity, not new climate or habitability facts.
  const oceanStyle = key % 3 !== 0
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const latitude = Math.PI * row / (height - 1)
    const longitude = 2 * Math.PI * col / width
    const x = Math.sin(latitude) * Math.cos(longitude), y = Math.cos(latitude), z = Math.sin(latitude) * Math.sin(longitude)
    const broad = terrain(x * 3, y * 3, z * 3, key)
    const fine = noise(x * 65, y * 65, z * 65, key)
    let low: number[], high: number[], blend: number
    if (bodyType === 'gas_giant') {
      const turbulence = terrain(x * 7, y * 18, z * 7, key)
      const band = latitude * clouds.bands + clouds.phase + (turbulence - 0.5) * clouds.turbulence
      const main = Math.sin(band)
      const filaments = Math.sin(band * (clouds.family === 0 ? 2.1 : 3.7) + broad * 8)
      blend = THREE.MathUtils.clamp(0.5 + main * 0.32 + filaments * (clouds.family === 2 ? 0.23 : 0.1) + (fine - 0.5) * 0.07, 0, 1)
      if (clouds.family === 1) blend = THREE.MathUtils.smoothstep(blend, 0.16, 0.84)
      low = gas[0]!; high = gas[1]!
      if (clouds.family >= 2) {
        // Periodic longitude keeps oval storm eyes away from a texture seam.
        const delta = longitude - clouds.stormU * Math.PI * 2
        const sx = Math.atan2(Math.sin(delta), Math.cos(delta)) / clouds.stormWidth
        const sy = (latitude - clouds.stormV * Math.PI) / clouds.stormHeight
        const radius = Math.hypot(sx, sy)
        const mask = 1 - THREE.MathUtils.smoothstep(radius, 0.75, 1.5)
        const spiral = Math.sin(radius * 19 - Math.atan2(sy, sx) * 2 + clouds.phase)
        const eye = Math.exp(-radius * radius * 18)
        const storm = [239, 160 + key % 60, 112 + key % 65]
        const cloudTop = THREE.MathUtils.clamp(0.55 + spiral * 0.2 - eye * 0.4, 0, 1)
        // Bake independent cloud colors so the GPU only needs one atlas sample.
        low = low.map((channel, i) => THREE.MathUtils.lerp(channel, storm[i]! * cloudTop, mask))
        high = high.map((channel, i) => THREE.MathUtils.lerp(channel, storm[i]! * (cloudTop + 0.24), mask))
      }
    } else if (bodyType === 'rocky') {
      const ridge = 1 - Math.abs(terrain(x * 15, y * 15, z * 15, key) * 2 - 1)
      if (oceanStyle) {
        // Broad continents, shallow cyan coasts and dark blue deep water.
        const elevation = broad + (ridge - 0.5) * 0.075
        if (elevation < 0.48) {
          blend = THREE.MathUtils.smoothstep(elevation, 0.3, 0.48)
          low = [8, 30, 86]; high = [22, 133, 167]
        } else if (elevation < 0.5) {
          blend = THREE.MathUtils.smoothstep(elevation, 0.48, 0.5)
          low = [177, 181, 104]; high = [42, 116, 59]
        } else {
          blend = THREE.MathUtils.clamp((elevation - 0.5) * 4.4 + (fine - 0.5) * 0.18, 0, 1)
          low = [28, 83, 44]; high = [131, 157, 90]
        }
      } else {
        // Rust dunes and darker volcanic ridges retain a separate warm identity.
        blend = THREE.MathUtils.clamp((broad - 0.25) * 2.3 + ridge * 0.12 + (fine - 0.5) * 0.19, 0, 1)
        low = [78, 27, 22]; high = [231, 120 + key % 23, 57]
      }
    } else if (bodyType === 'ice') {
      const fractures = terrain(x * 12, y * 12, z * 12, key)
      const fracture = Math.pow(1 - Math.abs(fractures * 2 - 1), 22)
      blend = THREE.MathUtils.clamp(0.94 - fracture * 0.62 - broad * 0.12 + (fine - 0.5) * 0.14, 0, 1)
      low = [28, 86, 137]; high = [226, 244, 250]
    } else {
      blend = THREE.MathUtils.clamp((broad - 0.2) * 1.65 + (fine - 0.5) * 0.2, 0, 1)
      low = [42, 46, 61]; high = [195, 195, 204]
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
  const surface = createSurfaceTexture(kind, objectId)
  const mesh = new THREE.Mesh(geometry, new MeshStandardNodeMaterial({
    color: 0xffffff, map: surface,
    // Reuse the owned surface map: no extra per-body texture or disposal path.
    bumpMap: kind === 'gas_giant' ? null : surface,
    bumpScale: kind === 'ice' ? 0.018 : 0.035,
    roughness: kind === 'ice' ? 0.48 : kind === 'gas_giant' ? 0.82 : 0.76,
    metalness: 0,
  }))
  if (kind === 'gas_giant') {
    const time = uniform(0)
    cloudTimes.set(mesh, time)
    const clouds = gasAppearance(seedOf(objectId))
    // Keep seed-specific parameters in uniforms instead of generating a unique
    // shader source for every giant in a crowded system.
    const flow = uniform(new THREE.Vector4(clouds.bands * 0.3, clouds.phase, clouds.shear, clouds.speed))
    const latitude = uv().y.mul(Math.PI)
    const jets = sin(latitude.mul(flow.x).add(flow.y)).mul(flow.z).add(flow.w)
    let sample = uv().add(vec2(time.mul(jets), 0))
    if (clouds.family >= 2) {
      const center = uniform(new THREE.Vector2(clouds.stormU, clouds.stormV))
      const deltaU = sample.x.sub(center.x).mul(Math.PI * 2)
      const delta = vec2(atan(sin(deltaU), cos(deltaU)).div(Math.PI * 2), sample.y.sub(center.y))
      const scale = uniform(new THREE.Vector2(clouds.stormWidth / (Math.PI * 2), clouds.stormHeight / Math.PI))
      const oval = delta.div(scale)
      // Local cyclonic shear stays bounded; jets carry the storm around the globe.
      const angle = smoothstep(0.1, 1.6, length(oval)).oneMinus().mul(sin(time.mul(0.17)).mul(0.65))
      const rotated = vec2(oval.x.mul(cos(angle)).sub(oval.y.mul(sin(angle))), oval.x.mul(sin(angle)).add(oval.y.mul(cos(angle)))).mul(scale)
      sample = sample.add(rotated.sub(delta))
    }
    const p = positionLocal.normalize()
    const ripple = sin(p.x.mul(9).add(flow.y).add(time.mul(0.13)))
      .mul(cos(p.z.mul(7).sub(time.mul(0.09)))).mul(sin(latitude).pow(2))
      .mul(uniform(clouds.family === 2 ? 0.018 : 0.006))
    mesh.material.colorNode = texture(mesh.material.map!, sample.add(vec2(ripple.mul(0.5), ripple)))
  }
  if (kind === 'rocky') {
    const atmosphere = new THREE.Mesh(geometry, createAtmosphereMaterial(seedOf(objectId) % 3 === 0 ? 0xe69668 : 0x58b8ee))
    atmosphere.scale.setScalar(1.018)
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
    color: 0x355463, vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false,
  }))
}

/** A restrained scattering rim; its parent supplies position and draw scale. */
export function createAtmosphereMaterial(tint = 0x58b8ee): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const color = new THREE.Color(tint)
  material.colorNode = vec3(color.r, color.g, color.b)
  material.opacityNode = normalView.normalize().dot(positionViewDirection.normalize()).max(0).oneMinus().pow(6).mul(0.32)
  return material
}

/** Far sky: static broad haze, never a foreground veil. */
export function createBackdropMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false })
  const d = positionLocal.normalize()
  const ribbon = exp(d.y.add(0.22).add(sin(d.x.mul(4).add(d.z.mul(2))).mul(0.16)).mul(3.8).pow(2).negate())
  const cloud = sin(d.x.mul(7).add(d.z.mul(5))).mul(sin(d.z.mul(8).sub(d.y.mul(6)))).mul(0.22).add(0.55)
  const violet = exp(d.z.sub(0.35).add(d.x.mul(0.4)).mul(4).pow(2).negate())
  material.colorNode = vec3(0.001, 0.002, 0.006)
    .add(vec3(0.004, 0.018, 0.026).mul(ribbon).mul(cloud))
    .add(vec3(0.018, 0.003, 0.024).mul(violet).mul(ribbon).mul(cloud))
  return material
}

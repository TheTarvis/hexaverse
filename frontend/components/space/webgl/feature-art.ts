import * as THREE from 'three'

export type FeatureArtKind = 'anomaly' | 'ruin' | 'nebula' | 'gravity_well' | 'debris' | 'radiation'
const kinds = new Set<string>(['anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation'])

/** Only disclosed canonical feature categories belong here; contacts are separate. */
export function featureArtKind(type: string): FeatureArtKind | null {
  return kinds.has(type) ? type as FeatureArtKind : null
}

type Motion = { object: THREE.Object3D; axis: 'x' | 'y' | 'z'; initial: number; speed: number }
type Pulse = { material: THREE.Material & { opacity: number }; opacity: number; phase: number }
const animations = new WeakMap<THREE.Mesh, { motions: Motion[]; pulses: Pulse[] }>()

function seeded(id: string) {
  let value = 2166136261
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619)
  return () => {
    value += 0x6d2b79f5
    let t = Math.imul(value ^ value >>> 15, 1 | value)
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** Canvas-free radial falloff, owned by one feature instance. */
function mistTexture(filaments = false) {
  const side = filaments ? 64 : 32
  const pixels = new Uint8Array(side * side * 4)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const u = (x + 0.5) / side * 2 - 1, v = (y + 0.5) / side * 2 - 1
    const warp = Math.sin(v * 8 + Math.sin(u * 5)) * 0.13
    const radius = Math.hypot(u + (filaments ? warp : 0), v)
    const offset = (y * side + x) * 4
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255
    const detail = filaments ? (0.35 + Math.sin(u * 17 + Math.sin(v * 12) * 2) * 0.18 + Math.sin(v * 31 + u * 9) * 0.12) : 1
    const lane = filaments ? THREE.MathUtils.smoothstep(Math.abs(v - Math.sin(u * 5) * 0.2 + 0.12), 0.015, 0.1) : 1
    pixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), filaments ? 0.7 : 2) * detail * lane * 255)
  }
  const texture = new THREE.DataTexture(pixels, side, side)
  texture.needsUpdate = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  return texture
}

/**
 * Instance-owned deterministic art, shared by the world and offline HUD captures.
 * Empty mesh roots retain the world's position/picking/stencil/disposal contract.
 * All positions are decorative; no density, radius or motion implies gameplay.
 */
export function createFeatureModel(kind: FeatureArtKind, objectId: string): THREE.Mesh {
  const random = seeded(`${kind}:${objectId}`)
  const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }))
  root.name = `feature:${kind}`
  root.userData.featureArtKind = kind
  const assembly = new THREE.Group()
  root.add(assembly)
  const motions: Motion[] = []
  const pulses: Pulse[] = []
  const animate = (object: THREE.Object3D, axis: Motion['axis'], speed: number) => {
    motions.push({ object, axis, speed, initial: object.rotation[axis] })
  }
  const pulse = (material: Pulse['material']) => pulses.push({ material, opacity: material.opacity, phase: random() * Math.PI * 2 })
  let mist: THREE.DataTexture | undefined
  const glow = (parent: THREE.Object3D, color: number, size: number, opacity: number, position: THREE.Vector3) => {
    mist ??= mistTexture(kind === 'nebula')
    const material = new THREE.SpriteMaterial({ map: mist, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.setScalar(size)
    parent.add(sprite)
    pulse(material)
    return sprite
  }
  const trace = (parent: THREE.Object3D, points: THREE.Vector3[], color: number, opacity: number, width = 0) => {
    if (width) {
      const curve = new THREE.CatmullRomCurve3(points)
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false })
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, width, 4, false), material)
      parent.add(mesh)
      pulse(material)
    } else {
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false })
      parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material))
      pulse(material)
    }
  }
  const arc = (radius: number, start: number, length: number, flatten = 1) => Array.from({ length: 49 }, (_, i) => {
    const angle = start + i / 48 * length
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle * 2) * radius * 0.08, Math.sin(angle) * radius * flatten)
  })

  if (kind === 'ruin' || kind === 'debris') {
    const primary = new THREE.MeshStandardMaterial({ color: 0xb6c1c7, roughness: 0.72, metalness: 0.66 })
    const graphite = new THREE.MeshStandardMaterial({ color: 0x29333c, roughness: 0.84, metalness: 0.58 })
    const amber = new THREE.MeshStandardMaterial({ color: 0xc19145, emissive: 0xa96718, emissiveIntensity: 0.3, roughness: 0.55, metalness: 0.45 })
    const plate = (parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...position)
      parent.add(mesh)
      return mesh
    }
    const hull = (size: number, broken: number) => {
      const section = new THREE.Group()
      // Broad bevelled faces and jagged fracture edges read as hull, not wire debris.
      const shape = new THREE.Shape()
      const points = [[-0.5, -0.34], [0.35, -0.4], [0.52, -0.12], [0.3, 0.02],
        [0.46, 0.13], [0.12 + broken * 0.08, 0.19], [0.22, 0.36], [-0.42, 0.32]]
      shape.moveTo(points[0]![0]!, points[0]![1]!)
      for (const point of points.slice(1)) shape.lineTo(point[0]!, point[1]!)
      shape.closePath()
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true,
        bevelThickness: 0.018, bevelSize: 0.025, bevelSegments: 2, steps: 1 })
      geometry.rotateX(-Math.PI / 2)
      const frame = new THREE.Mesh(geometry, graphite)
      frame.position.y = -0.08
      frame.scale.set(1.08, 1.15, 1.08)
      section.add(frame)
      const face = new THREE.Mesh(geometry.clone(), [primary, graphite])
      section.add(face)
      // Broken panel caps leave the graphite frame visible between offset layers.
      for (let i = 0; i < 3; i++) {
        const cap = new THREE.Mesh(geometry.clone(), [primary, graphite])
        cap.scale.set(0.27, 0.25, 0.75 - i * 0.12)
        cap.position.set(-0.3 + i * 0.25, 0.11 + i * 0.008, -0.03 + i * 0.025)
        cap.rotation.y = (random() - 0.5) * 0.1
        section.add(cap)
      }
      for (let i = 0; i < 3; i++) {
        plate(section, [0.05, 0.09, 0.48 - i * 0.09], [-0.3 + i * 0.23, -0.1, 0.03], graphite)
        plate(section, [0.065, 0.018, 0.09], [-0.3 + i * 0.23, 0.155, -0.2], amber)
      }
      section.scale.setScalar(size)
      return section
    }
    if (kind === 'ruin') {
      // A collapsed architectural spine with uneven, leaning armored buttresses.
      const foundation = hull(1.05, random())
      foundation.position.set(-0.08, -0.23, 0)
      foundation.rotation.set(0.14, -0.25, 0.06)
      assembly.add(foundation)
      for (let i = 0; i < 4; i++) {
        const tower = new THREE.Group()
        tower.position.set(-0.45 + i * 0.25, -0.02, 0.18 + Math.sin(i * 1.8) * 0.16)
        tower.rotation.set(-0.1 + i * 0.12, i * 0.22, (i - 1) * 0.17)
        const height = i === 1 ? 0.7 : 0.28 + random() * 0.22
        plate(tower, [0.16, height, 0.22], [0, height * 0.4, 0], graphite)
        const armor = hull(0.38 + random() * 0.12, random())
        armor.rotation.z = Math.PI / 2 - 0.14
        armor.position.set(-0.04, height * 0.45, 0)
        tower.add(armor)
        const crown = hull(0.35, random())
        crown.rotation.set(i * 0.17, 0.2, (i - 1) * 0.25)
        crown.position.y = height
        tower.add(crown)
        // Exposed snapped reinforcement extends irregularly above broken armor.
        for (let j = 0; j < 2; j++) {
          const strut = plate(tower, [0.028, height * 0.4, 0.045], [-0.065 + j * 0.12, height * 0.95, 0.05], graphite)
          strut.rotation.z = (random() - 0.5) * 0.8
        }
        assembly.add(tower)
      }
      const fallen = hull(0.52, random())
      fallen.position.set(0.36, -0.1, -0.35)
      fallen.rotation.set(0.25, 0.8, -0.3)
      assembly.add(fallen)
      assembly.rotation.y = 0.4
    } else {
      // A few substantial torn hull sections make a cohesive wreckage cluster.
      for (let i = 0; i < 6; i++) {
        const section = hull(i === 0 ? 0.82 : 0.38 + random() * 0.18, random())
        const angle = i * 2.399
        const radius = i === 0 ? 0 : 0.38 + random() * 0.12
        section.position.set(Math.cos(angle) * radius, (random() - 0.5) * 0.28, Math.sin(angle) * radius)
        section.rotation.set((random() - 0.5) * 0.9, angle, (random() - 0.5) * 0.6)
        assembly.add(section)
      }
    }
  } else if (kind === 'anomaly') {
    glow(assembly, 0xb8a0ef, 1.5, 0.7, new THREE.Vector3())
    for (let i = 0; i < 4; i++) {
      const echo = new THREE.Group()
      echo.position.set((random() - 0.5) * 0.18, (random() - 0.5) * 0.22, (random() - 0.5) * 0.18)
      echo.rotation.set(i * 0.34, i * 1.7, i * 0.2)
      trace(echo, arc(0.5 + i * 0.06, random() * 6, Math.PI * (0.8 + random() * 0.45)), i % 2 ? 0xe6d9ff : 0x9b7bd4, 0.8, 0.012)
      assembly.add(echo)
      animate(echo, 'y', (i % 2 ? -1 : 1) * 0.035)
    }
    for (let i = 0; i < 8; i++) glow(assembly, 0xd8bfff, 0.35 + random() * 0.4, 0.5, new THREE.Vector3((random() - 0.5) * 0.6, (random() - 0.5) * 0.4, (random() - 0.5) * 0.6))
  } else if (kind === 'nebula') {
    // Torn, filament-textured ribbons overlap around a sinuous dark channel.
    for (let i = 0; i < 16; i++) {
      const t = i / 15 * 2 - 1
      const sprite = glow(assembly, [0x5f8ccc, 0xa575ac, 0x779eaf][i % 3]!, 0.7 + random() * 0.25, 0.85,
        new THREE.Vector3(t * 0.56, (random() - 0.5) * 0.25, Math.sin(t * 4) * 0.26 + (i % 2 ? 0.1 : -0.1)))
      sprite.scale.y *= 0.45 + random() * 0.25
      sprite.material.rotation = t * 0.8 + (random() - 0.5) * 0.5
    }
    for (let i = 0; i < 9; i++) glow(assembly, 0xc7dcf4, 0.045, 0.7, new THREE.Vector3((random() - 0.5) * 1.2, random() * 0.3, (random() - 0.5) * 0.8))
  } else if (kind === 'gravity_well') {
    assembly.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: 0x090e19 })))
    glow(assembly, 0x597cb8, 0.85, 0.65, new THREE.Vector3())
    const field = new THREE.Group()
    field.rotation.z = 0.18
    assembly.add(field)
    for (let i = 0; i < 7; i++) {
      const radius = 0.32 + i * 0.085
      const points = arc(radius, 0.1 + i * 0.05, Math.PI * 1.92, 0.6)
      for (const p of points) p.y += Math.exp(-Math.hypot(p.x, p.z) * 3) * -0.65
      trace(field, points, i % 2 ? 0x7199cb : 0xadc4e0, 0.35 + (6 - i) * 0.06, i === 1 ? 0.012 : 0)
    }
    animate(field, 'y', 0.018)
  } else {
    // Open, directional emissions: angular rays distinguish radiation from mist.
    for (let i = 0; i < 28; i++) {
      const angle = i * 2.399 + random() * 0.25
      const direction = new THREE.Vector3(Math.cos(angle), (random() - 0.5) * 0.8, Math.sin(angle)).normalize()
      const start = 0.17 + random() * 0.25
      const end = start + 0.12 + random() * 0.26
      const offset = new THREE.Vector3(0.08, 0, -0.05)
      const points = [direction.clone().multiplyScalar(start).add(offset), direction.clone().multiplyScalar(end).add(offset)]
      // A restrained darker carrier retains the ray structure on light surfaces.
      trace(assembly, points, i % 4 ? 0x376b57 : 0x917447, 0.95, 0.014)
      trace(assembly, points, i % 4 ? 0xa1e5bd : 0xe4c580, 0.65, i % 3 === 0 ? 0.009 : 0)
      glow(assembly, i % 4 ? 0xadecc9 : 0xf0d69d, 0.09 + random() * 0.08, 0.9, direction.multiplyScalar(end).add(offset))
    }
    animate(assembly, 'y', 0.025)
  }

  // Fit the complete composition once. Runtime scaling remains the world's job.
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(assembly)
  const center = bounds.getCenter(new THREE.Vector3())
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius
  assembly.position.sub(center)
  const fit = 0.95 / radius
  assembly.scale.setScalar(fit)
  assembly.position.multiplyScalar(fit)
  animations.set(root, { motions, pulses })
  advanceFeatureModel(root, 0)
  return root
}

/** Absolute decorative time is idempotent; caller freezes it when hidden/reduced-motion. */
export function advanceFeatureModel(mesh: THREE.Mesh, decorativeTimeMs: number): void {
  const state = animations.get(mesh)
  if (!state || !Number.isFinite(decorativeTimeMs)) return
  const seconds = decorativeTimeMs / 1000
  for (const { object, axis, initial, speed } of state.motions) object.rotation[axis] = initial + seconds * speed
  for (const { material, opacity, phase } of state.pulses) material.opacity = opacity * (0.91 + Math.sin(seconds * 0.7 + phase) * 0.09)
}

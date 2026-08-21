// The backdrop: a nebula wash and three parallax star layers.
//
// The SVG board drew the lattice onto the page background, so the board read
// as a diagram lying flat on a surface. Putting real depth behind it — layers
// at different z, separating as the camera moves — is what makes the same
// hexes read as a viewport onto somewhere rather than a chart of somewhere.
//
// Parallax here is free: the layers sit at genuinely different depths under a
// perspective camera, so panning separates them without any parallax code.

import * as THREE from 'three'
import { GLSL_NOISE } from './glsl-common'

// Depths behind the board plane (z=0). The spread is wide because parallax
// strength is the ratio between them, not the absolute distance.
const LAYER_Z = [-500, -1200, -2600]
const LAYER_COUNT = [900, 1400, 2200]
const LAYER_SIZE = [7.0, 5.0, 3.6]
const LAYER_GAIN = [1.5, 1.0, 0.6]

export interface Starfield {
  group: THREE.Group
  update(elapsed: number, worldPerPixel?: number): void
  dispose(): void
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One star layer. Stars are drawn as point sprites with a soft core, a faint
// cross-flare on the brightest few, and a slow per-star twinkle — the twinkle
// phase is an attribute so no two stars breathe together.
function starLayer(count: number, spread: number, z: number, size: number, gain: number, seed: number) {
  const rng = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  const bright = new Float32Array(count)
  const tint = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * spread
    pos[i * 3 + 1] = (rng() - 0.5) * spread
    pos[i * 3 + 2] = z + (rng() - 0.5) * Math.abs(z) * 0.25
    phase[i] = rng() * Math.PI * 2
    // Heavy-tailed brightness: mostly faint, a few genuinely bright.
    bright[i] = Math.pow(rng(), 3.2)
    // Stellar colour index — cool blue through white to warm amber.
    tint[i] = rng()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uGain: { value: gain },
      uPixelRatio: { value: 1 },
      uWorldPerPixel: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aBright;
      attribute float aTint;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vBright;
      varying vec3 vTint;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;

        // Slow, per-star twinkle. Two incommensurate rates so it never pulses.
        float tw = 0.78
          + 0.16 * sin(uTime * 0.7 + aPhase)
          + 0.06 * sin(uTime * 1.9 + aPhase * 2.3);
        vBright = aBright * tw;

        // Colour index → blue-white-amber ramp.
        vec3 cool = vec3(0.62, 0.76, 1.0);
        vec3 warm = vec3(1.0, 0.83, 0.62);
        vTint = mix(cool, warm, smoothstep(0.35, 0.9, aTint));

        // Perspective-correct point size, floored so distant layers stay visible.
        float s = uSize * uPixelRatio * (1.0 + aBright * 2.4);
        gl_PointSize = max(1.0, s * (900.0 / -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying float vBright;
      varying vec3 vTint;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        if (d > 1.0) discard;

        // Core plus halo. The halo is what the bloom pass latches onto.
        float core = pow(max(0.0, 1.0 - d), 6.0);
        float halo = pow(max(0.0, 1.0 - d), 1.6) * 0.35;

        // A faint diffraction cross on the brightest stars only.
        float cross = max(0.0, 1.0 - abs(uv.x) * 9.0) + max(0.0, 1.0 - abs(uv.y) * 9.0);
        cross *= smoothstep(0.55, 1.0, vBright) * (1.0 - d) * 0.5;

        float a = (core + halo + cross) * vBright * uGain;
        gl_FragColor = vec4(vTint * a, a);
      }
    `,
  })

  return new THREE.Points(geo, mat)
}

// The nebula wash: a very large plane far behind everything, running fbm at two
// scales in two tints. Kept deliberately dim (it should never be *noticed*, only
// missed when removed) — its job is to stop the far field reading as flat black.
function nebulaPlane(spread: number, z: number) {
  const geo = new THREE.PlaneGeometry(spread, spread)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCool: { value: new THREE.Color('#2a4a86') },
      uWarm: { value: new THREE.Color('#6d3a72') },
      uGain: { value: 1 },
      uWorldPerPixel: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime;
      uniform vec3 uCool;
      uniform vec3 uWarm;
      uniform float uGain;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv * 3.4;
        // Two drifting fbm fields at different rates read as depth within the
        // cloud itself rather than one scrolling texture.
        float a = fbm(p + vec2(uTime * 0.006, uTime * 0.004));
        float b = fbm(p * 1.9 - vec2(uTime * 0.009, 0.0));
        float cloud = smoothstep(0.42, 0.95, a * 0.72 + b * 0.38);

        // Radial falloff so the cloud never reaches the frame edge hard.
        float vig = 1.0 - smoothstep(0.15, 0.72, length(vUv - 0.5));

        vec3 col = mix(uCool, uWarm, smoothstep(0.3, 0.8, b));
        float amt = cloud * vig * 0.16 * uGain;
        gl_FragColor = vec4(col * amt, amt);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.z = z
  return mesh
}

export function createStarfield(seed = 0xbeef, pixelRatio = 1): Starfield {
  const group = new THREE.Group()
  const materials: THREE.ShaderMaterial[] = []

  const nebula = nebulaPlane(9000, -3400)
  group.add(nebula)
  materials.push(nebula.material as THREE.ShaderMaterial)

  LAYER_Z.forEach((z, i) => {
    // Spread scales with depth so every layer fills the frustum at that distance.
    const spread = 2600 + Math.abs(z) * 2.4
    const pts = starLayer(LAYER_COUNT[i]!, spread, z, LAYER_SIZE[i]!, LAYER_GAIN[i]!, seed + i * 7919)
    const mat = pts.material as THREE.ShaderMaterial
    mat.uniforms.uPixelRatio!.value = pixelRatio
    group.add(pts)
    materials.push(mat)
  })

  return {
    group,
    update(elapsed: number, worldPerPixel = 1) {
      for (const m of materials) {
        const u = m.uniforms.uTime
        if (u) u.value = elapsed
        const wpp = m.uniforms.uWorldPerPixel
        if (wpp) wpp.value = worldPerPixel
      }
    },
    dispose() {
      group.traverse((o) => {
        const any = o as THREE.Mesh | THREE.Points
        if (any.geometry) any.geometry.dispose()
        const mat = any.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose())
      })
    },
  }
}

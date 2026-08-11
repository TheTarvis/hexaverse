// SPIKE (throwaway) — the hex lattice as one instanced draw call.
//
// The production lattice (components/board/HexLattice.tsx) emits one <polygon>
// per tile: 817 DOM nodes at radius 16, and the node count is the reason the
// board cannot afford per-tile effects. Here the whole lattice is a single
// InstancedBufferGeometry — one draw call, any radius — and each tile is carved
// out of its quad by a hexagon SDF, which gives the edge sub-pixel antialiasing
// the SVG stroke never had and leaves room to modulate every tile per frame.
//
// That per-frame room is the point. Three things now live IN the lattice instead
// of as separate overlay elements:
//   - the sensor bubble (production: a separate <polygon> set, ScanOverlay)
//   - the scan pulse ring (production: ScanPing's stroked circle)
//   - a slow ambient shimmer, so the grid is never perfectly dead
//
// Drawn additively over the starfield: the grid is light laid onto the dark, not
// a surface with fills.

import * as THREE from 'three'
import { HEX_SIZE, hexToPixel } from '@/lib/hex/pixel'
import { hexesWithinRadius } from '@/lib/hex/pixel'
import { ringOf } from '@/lib/hex'
import { BAND_TINT, bandForRing, SIGNAL } from './spike-palette'

export interface Lattice {
  mesh: THREE.Mesh
  update(elapsed: number, pulse: { center: THREE.Vector2; radius: number; strength: number }, sensor: { center: THREE.Vector2; radius: number }): void
  dispose(): void
}

const APOTHEM = (HEX_SIZE * Math.sqrt(3)) / 2

export function createLattice(radius: number, innerMaxRing: number, midMaxRing: number): Lattice {
  const hexes = hexesWithinRadius(radius)
  const count = hexes.length

  const offsets = new Float32Array(count * 2)
  const tints = new Float32Array(count * 3)
  const rings = new Float32Array(count)

  const color = new THREE.Color()
  hexes.forEach((h, i) => {
    const p = hexToPixel(h.q, h.r)
    // SVG y runs down, the scene's y runs up — negate once, here, so every
    // consumer downstream shares one convention.
    offsets[i * 2] = p.x
    offsets[i * 2 + 1] = -p.y
    const ring = ringOf(h)
    rings[i] = ring
    color.set(BAND_TINT[bandForRing(ring, innerMaxRing, midMaxRing)])
    tints[i * 3] = color.r
    tints[i * 3 + 1] = color.g
    tints[i * 3 + 2] = color.b
  })

  // One quad, sized to the hex's circumradius, instanced across the board.
  const base = new THREE.PlaneGeometry(HEX_SIZE * 2, HEX_SIZE * 2)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position!
  geo.attributes.uv = base.attributes.uv!
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2))
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
  geo.setAttribute('aRing', new THREE.InstancedBufferAttribute(rings, 1))
  geo.instanceCount = count
  base.dispose()

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uApothem: { value: APOTHEM },
      uPulseCenter: { value: new THREE.Vector2() },
      uPulseR: { value: -1 },
      uPulseStrength: { value: 0 },
      uSensorCenter: { value: new THREE.Vector2() },
      uSensorR: { value: 0 },
      uSignal: { value: new THREE.Color(SIGNAL) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aOffset;
      attribute vec3 aTint;
      attribute float aRing;
      varying vec2 vLocal;
      varying vec2 vWorld;
      varying vec3 vTint;
      varying float vRing;

      void main() {
        vLocal = position.xy;
        vTint = aTint;
        vRing = aRing;
        vec3 world = vec3(position.xy + aOffset, 0.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uApothem;
      uniform vec2 uPulseCenter;
      uniform float uPulseR;
      uniform float uPulseStrength;
      uniform vec2 uSensorCenter;
      uniform float uSensorR;
      uniform vec3 uSignal;

      varying vec2 vLocal;
      varying vec2 vWorld;
      varying vec3 vTint;
      varying float vRing;

      // Signed distance to a hexagon (Inigo Quilez). Fed p.yx so the flat edges
      // land left/right and the vertices top/bottom — the pointy-top layout
      // lib/hex/pixel draws.
      float sdHexagon(vec2 p, float r) {
        const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
        p = abs(p);
        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
        p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
        return length(p) * sign(p.y);
      }

      void main() {
        float d = sdHexagon(vLocal.yx, uApothem - 1.2);

        // Antialiased interior and a hairline edge. fwidth keeps both crisp at
        // any zoom — the SVG stroke could only ever be one authored width.
        float aa = fwidth(d) * 1.2;
        float inside = 1.0 - smoothstep(-aa, aa, d);
        float edge = (1.0 - smoothstep(0.0, 1.6 + aa, abs(d))) * inside;

        // A very slow shimmer keyed to position, so the empty grid breathes
        // instead of sitting perfectly still.
        float shimmer = 0.85 + 0.15 * sin(uTime * 0.5 + vWorld.x * 0.008 + vWorld.y * 0.011);

        // Matched by eye against the SVG lattice's apparent weight. The grid is
        // the tactical substrate — losing its legibility to atmosphere would be
        // trading the wrong thing away.
        vec3 col = vTint * (inside * 0.034 + edge * 0.25) * shimmer;

        // The live sensor bubble, drawn into the tiles it actually covers.
        float ds = length(vWorld - uSensorCenter);
        float bubble = 1.0 - smoothstep(uSensorR - HEX, uSensorR, ds);
        float bubbleRim = exp(-pow((ds - uSensorR) / 14.0, 2.0));
        col += uSignal * (bubble * 0.055 + bubbleRim * 0.16) * inside;

        // The scan pulse: one expanding ring pinned at the emission hex, pacing
        // the echo returns (#0006 Decision #26). Thins as it travels outward.
        if (uPulseR > 0.0) {
          float dp = length(vWorld - uPulseCenter) - uPulseR;
          float ring = exp(-pow(dp / 20.0, 2.0));
          col += uSignal * ring * uPulseStrength * (inside * 0.5 + edge * 1.4);
        }

        float a = max(max(col.r, col.g), col.b);
        gl_FragColor = vec4(col, a);
      }
    `,
  })
  // HEX is referenced in the fragment source above; define it rather than
  // interpolating a number into the string so the constant has one home.
  mat.fragmentShader = `#define HEX ${HEX_SIZE.toFixed(1)}\n${mat.fragmentShader}`

  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  return {
    mesh,
    update(elapsed, pulse, sensor) {
      const u = mat.uniforms
      u.uTime!.value = elapsed
      ;(u.uPulseCenter!.value as THREE.Vector2).copy(pulse.center)
      u.uPulseR!.value = pulse.radius
      u.uPulseStrength!.value = pulse.strength
      ;(u.uSensorCenter!.value as THREE.Vector2).copy(sensor.center)
      u.uSensorR!.value = sensor.radius
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

// The hex lattice as one instanced draw call.
//
// The SVG lattice emitted one <polygon> per tile: 817 DOM nodes at radius 16,
// and the node count was the reason the board could not afford per-tile
// effects. Here the whole lattice is a single InstancedBufferGeometry — one
// draw call, any radius — and each tile is carved out of its quad by a hexagon
// SDF, which gives the edge sub-pixel antialiasing the SVG stroke never had
// and leaves room to modulate every tile per frame.
//
// Plumbing only (the decision rule): tile centres arrive in GL space and tints
// arrive resolved — packLatticeTiles (outside webgl/) owns the ring-band
// decision. The spike-era pulse/sensor uniforms remain as inputs; production
// passes them disabled (scan UI lives on the SVG overlay).
//
// Drawn additively over the starfield: the grid is light laid onto the dark,
// not a surface with fills.

import * as THREE from 'three'
import { LAYER_Z, RENDER_ORDER } from './layers'
import type { PackedLatticeTile, Rgb } from './contract'

export interface Lattice {
  mesh: THREE.Mesh
  update(
    fxTime: number,
    pulse: { x: number; y: number; radius: number; strength: number } | null,
    sensor: { x: number; y: number; radius: number } | null,
    worldPerPixel: number,
  ): void
  dispose(): void
}

// The hex circumradius and apothem in world units. The lattice's geometry is
// authored at this scale by the packer's tile centres; the SDF only needs the
// two extents.
const HEX_WORLD = 34
const APOTHEM = (HEX_WORLD * Math.sqrt(3)) / 2

export function createLattice(tiles: PackedLatticeTile[], signal: Rgb): Lattice {
  const count = tiles.length

  const offsets = new Float32Array(count * 2)
  const tints = new Float32Array(count * 3)
  tiles.forEach((t, i) => {
    offsets[i * 2] = t.x
    offsets[i * 2 + 1] = t.y
    tints[i * 3] = t.tint[0]
    tints[i * 3 + 1] = t.tint[1]
    tints[i * 3 + 2] = t.tint[2]
  })

  // One quad, sized to the hex's circumradius, instanced across the board.
  const base = new THREE.PlaneGeometry(HEX_WORLD * 2, HEX_WORLD * 2)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position!
  geo.attributes.uv = base.attributes.uv!
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2))
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
  geo.instanceCount = count
  base.dispose()

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uApothem: { value: APOTHEM },
      uWorldPerPixel: { value: 1 },
      uPulseCenter: { value: new THREE.Vector2() },
      uPulseR: { value: -1 },
      uPulseStrength: { value: 0 },
      uSensorCenter: { value: new THREE.Vector2() },
      uSensorR: { value: 0 },
      uSignal: { value: new THREE.Color(signal[0], signal[1], signal[2]) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aOffset;
      attribute vec3 aTint;
      varying vec2 vLocal;
      varying vec2 vWorld;
      varying vec3 vTint;

      void main() {
        vLocal = position.xy;
        vTint = aTint;
        vec3 world = vec3(position.xy + aOffset, ${LAYER_Z.lattice.toFixed(1)});
        vWorld = world.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    // HEX is the tile circumradius; folded into the source here so the shader
    // string is complete where it is written.
    fragmentShader: /* glsl */ `
      #define HEX ${HEX_WORLD.toFixed(1)}
      uniform float uTime;
      uniform float uApothem;
      uniform float uWorldPerPixel;
      uniform vec2 uPulseCenter;
      uniform float uPulseR;
      uniform float uPulseStrength;
      uniform vec2 uSensorCenter;
      uniform float uSensorR;
      uniform vec3 uSignal;

      varying vec2 vLocal;
      varying vec2 vWorld;
      varying vec3 vTint;

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

  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.lattice

  return {
    mesh,
    update(fxTime, pulse, sensor, worldPerPixel) {
      const u = mat.uniforms
      u.uTime!.value = fxTime
      u.uWorldPerPixel!.value = worldPerPixel
      if (pulse) {
        ;(u.uPulseCenter!.value as THREE.Vector2).set(pulse.x, pulse.y)
        u.uPulseR!.value = pulse.radius
        u.uPulseStrength!.value = pulse.strength
      } else {
        u.uPulseR!.value = -1
        u.uPulseStrength!.value = 0
      }
      if (sensor) {
        ;(u.uSensorCenter!.value as THREE.Vector2).set(sensor.x, sensor.y)
        u.uSensorR!.value = sensor.radius
      } else {
        u.uSensorR!.value = 0
      }
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

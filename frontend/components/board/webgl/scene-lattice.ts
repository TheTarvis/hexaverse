// The polar lattice as one instanced draw call.
//
// The SVG lattice emitted one <polygon> per tile: 817 DOM nodes at radius 16,
// and the node count was the reason the board could not afford per-tile
// effects. Here the whole lattice is a single InstancedBufferGeometry — one
// draw call, any radius — and each cell is carved out of its quad by a wedge
// SDF, which gives the edge sub-pixel antialiasing the SVG stroke never had
// and leaves room to modulate every cell per frame.
//
// A polar cell is an annular sector, not a hexagon, so the carve is evaluated
// in WORLD polar coordinates about the board origin rather than in the quad's
// local space: a wedge is defined by its ring radii and slot angles about the
// centre of the board, not about the centre of its own tile. Each instance
// therefore carries its own bounds (and its own quad size — a wedge's arc is
// wider at ring 15 than at ring 1, where the hexagon's apothem was constant).
//
// Plumbing only (the decision rule): cell centres arrive in GL space, wedge
// bounds arrive resolved, and tints arrive resolved — packLatticeTiles
// (outside webgl/) owns the schedule and ring-band decisions. The spike-era
// pulse/sensor uniforms remain as inputs; production passes them disabled
// (scan UI lives on the SVG overlay).
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

// The board's radial unit in world units — the spacing between adjacent rings.
// The lattice's geometry is authored at this scale by the packer; the SDF
// takes its extents per instance, so this is only the sensor bubble's falloff
// width now.
const RADIAL_WORLD = 34

// The cell border's inset, in SCREEN pixels. It was a world-unit constant when
// every tile was one fixed size; a wedge's screen extent varies with ring, so
// a world-unit inset reads heavier at ring 1 than at ring 15. Multiplying by
// uWorldPerPixel keeps the drawn border one constant weight everywhere on the
// board, at every zoom.
const BORDER_INSET_PX = 1.2

export function createLattice(tiles: PackedLatticeTile[], signal: Rgb): Lattice {
  const count = tiles.length

  const offsets = new Float32Array(count * 2)
  const tints = new Float32Array(count * 3)
  const wedges = new Float32Array(count * 4)
  const halves = new Float32Array(count)
  tiles.forEach((t, i) => {
    offsets[i * 2] = t.x
    offsets[i * 2 + 1] = t.y
    tints[i * 3] = t.tint[0]
    tints[i * 3 + 1] = t.tint[1]
    tints[i * 3 + 2] = t.tint[2]
    wedges[i * 4] = t.rInner
    wedges[i * 4 + 1] = t.rOuter
    wedges[i * 4 + 2] = t.angCenter
    wedges[i * 4 + 3] = t.angHalf
    halves[i] = t.half
  })

  // A unit quad (±1), scaled per instance to that cell's bounding half-extent.
  const base = new THREE.PlaneGeometry(2, 2)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position!
  geo.attributes.uv = base.attributes.uv!
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2))
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
  geo.setAttribute('aWedge', new THREE.InstancedBufferAttribute(wedges, 4))
  geo.setAttribute('aHalf', new THREE.InstancedBufferAttribute(halves, 1))
  geo.instanceCount = count
  base.dispose()

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
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
      attribute vec4 aWedge;
      attribute float aHalf;
      varying vec2 vWorld;
      varying vec3 vTint;
      varying vec4 vWedge;

      void main() {
        vTint = aTint;
        vWedge = aWedge;
        vec3 world = vec3(position.xy * aHalf + aOffset, ${LAYER_Z.lattice.toFixed(1)});
        vWorld = world.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    // RADIAL is the ring spacing in world units; folded into the source here so
    // the shader string is complete where it is written.
    fragmentShader: /* glsl */ `
      #define RADIAL ${RADIAL_WORLD.toFixed(1)}
      #define INSET_PX ${BORDER_INSET_PX.toFixed(2)}
      #define PI 3.141592653589793
      uniform float uTime;
      uniform float uWorldPerPixel;
      uniform vec2 uPulseCenter;
      uniform float uPulseR;
      uniform float uPulseStrength;
      uniform vec2 uSensorCenter;
      uniform float uSensorR;
      uniform vec3 uSignal;

      varying vec2 vWorld;
      varying vec3 vTint;
      varying vec4 vWedge;

      // Signed distance to an annular sector (a polar cell), evaluated about
      // the board origin. Bounded by two radii and two angles: the distance is
      // the larger of the radial and angular violations, which is the standard
      // intersection-of-half-spaces bound — exact on the four edges and a
      // slight over-estimate in the corners, which is all the antialias needs.
      //
      // The angular term is scaled by r so it is an ARC length, in the same
      // world units as the radial term; without that the two terms could not be
      // compared and the inner cells would carve wrong.
      float sdWedge(vec2 p, float rIn, float rOut, float angC, float angH) {
        float r = length(p);
        float a = atan(p.y, p.x) - angC;
        a = mod(a + PI, 2.0 * PI) - PI;
        float dR = max(rIn - r, r - rOut);
        float dA = (abs(a) - angH) * r;
        return max(dR, dA);
      }

      void main() {
        // The inset is expressed in screen pixels, not world units: a wedge's
        // screen extent grows with its ring, so a world-unit border would read
        // as a different weight at every radius.
        float inset = uWorldPerPixel * INSET_PX;
        float d = sdWedge(vWorld, vWedge.x, vWedge.y, vWedge.z, vWedge.w) + inset;

        // Antialiased interior and a hairline edge. fwidth keeps both crisp at
        // any zoom — the SVG stroke could only ever be one authored width.
        float aa = fwidth(d) * 1.2;
        float inside = 1.0 - smoothstep(-aa, aa, d);
        // The hairline's width is screen-relative for the same reason the
        // inset is: one authored world width would thicken with ring index.
        float edge = (1.0 - smoothstep(0.0, uWorldPerPixel * 1.6 + aa, abs(d))) * inside;

        // A very slow shimmer keyed to position, so the empty grid breathes
        // instead of sitting perfectly still.
        float shimmer = 0.85 + 0.15 * sin(uTime * 0.5 + vWorld.x * 0.008 + vWorld.y * 0.011);

        // Matched by eye against the SVG lattice's apparent weight. The grid is
        // the tactical substrate — losing its legibility to atmosphere would be
        // trading the wrong thing away.
        vec3 col = vTint * (inside * 0.034 + edge * 0.25) * shimmer;

        // The live sensor bubble, drawn into the tiles it actually covers.
        float ds = length(vWorld - uSensorCenter);
        float bubble = 1.0 - smoothstep(uSensorR - RADIAL, uSensorR, ds);
        float bubbleRim = exp(-pow((ds - uSensorR) / 14.0, 2.0));
        col += uSignal * (bubble * 0.055 + bubbleRim * 0.16) * inside;

        // The scan pulse: one expanding ring pinned at the emission cell, pacing
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

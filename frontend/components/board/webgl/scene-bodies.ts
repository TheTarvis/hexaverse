// Bodies as lit spheres, and the star as a light source.
//
// Each body is a billboarded quad with a sphere solved in the fragment shader:
// normal from the disc, Lambert against the real direction to the star, a soft
// terminator, limb-brightened atmosphere, and procedural surface detail
// (latitudinal banding on gas giants, mottling elsewhere). The star is a
// separate additive corona that blows past the bloom threshold, so it lights
// the scene instead of sitting in it.
//
// Plumbing only (the decision rule): createBodies takes PRE-PACKED instances —
// colour triples, resolved radii, the fog treatment quad — from
// packBodyInstance (outside webgl/). Whether an astronomical-band body ships a
// surface at all was decided there; the shader consumes `wireOnly` without
// re-deriving it. writeBodyInstance below is the decision-free buffer writer:
// index arithmetic only, no lookups, no branches on domain values.

import * as THREE from 'three'
import { GLSL_NOISE } from './glsl-common'
import { LAYER_Z, RENDER_ORDER } from './layers'
import type { PackedBody, Rgb } from './contract'

// How much larger than the sphere each quad is, leaving room for the
// atmosphere halo and the charted outline. The shader derives the sphere
// radius from it.
const QUAD = 1.45

interface BodyBuffers {
  colors: Float32Array
  radii: Float32Array
  seeds: Float32Array
  banded: Float32Array
  fog: Float32Array
}

// The one place the packed record meets the attribute layout. A stride change
// here cannot break the pure pack tests — that decoupling is the point.
export function writeBodyInstance(buffers: BodyBuffers, i: number, packed: PackedBody): void {
  buffers.colors[i * 3] = packed.color[0]
  buffers.colors[i * 3 + 1] = packed.color[1]
  buffers.colors[i * 3 + 2] = packed.color[2]
  buffers.radii[i] = packed.radius
  buffers.seeds[i] = packed.seed
  buffers.banded[i] = packed.banded
  buffers.fog[i * 4] = packed.fog.dim
  buffers.fog[i * 4 + 1] = packed.fog.chroma
  buffers.fog[i * 4 + 2] = packed.fog.breakUp
  buffers.fog[i * 4 + 3] = packed.fog.wireOnly
}

export interface Bodies {
  mesh: THREE.Mesh
  // offsets: xy per body in GL world space, in the packed instance order.
  update(offsets: Float32Array, fxTime: number, worldPerPixel: number): void
  dispose(): void
}

export function createBodies(packed: PackedBody[]): Bodies {
  const count = packed.length

  const offsets = new Float32Array(count * 2)
  const buffers: BodyBuffers = {
    colors: new Float32Array(count * 3),
    radii: new Float32Array(count),
    seeds: new Float32Array(count),
    banded: new Float32Array(count),
    fog: new Float32Array(count * 4),
  }
  packed.forEach((p, i) => writeBodyInstance(buffers, i, p))

  const base = new THREE.PlaneGeometry(2, 2)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position!
  const offsetAttr = new THREE.InstancedBufferAttribute(offsets, 2)
  offsetAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aOffset', offsetAttr)
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(buffers.colors, 3))
  geo.setAttribute('aRadius', new THREE.InstancedBufferAttribute(buffers.radii, 1))
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(buffers.seeds, 1))
  geo.setAttribute('aBanded', new THREE.InstancedBufferAttribute(buffers.banded, 1))
  geo.setAttribute('aFog', new THREE.InstancedBufferAttribute(buffers.fog, 4))
  geo.instanceCount = count
  base.dispose()

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uQuad: { value: QUAD },
      uWorldPerPixel: { value: 1 },
      uStarTint: { value: new THREE.Color('#fff0cf') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aOffset;
      attribute vec3 aColor;
      attribute float aRadius;
      attribute float aSeed;
      attribute float aBanded;
      attribute vec4 aFog;

      uniform float uQuad;

      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vLight;
      varying float vSeed;
      varying float vBanded;
      varying vec4 vFog;

      void main() {
        vUv = position.xy;
        vColor = aColor;
        vSeed = aSeed;
        vBanded = aBanded;
        vFog = aFog;

        // Billboard: place the centre in view space, then offset in the view
        // plane so a sphere always reads round however the camera is tilted.
        vec4 center = modelViewMatrix * vec4(aOffset, ${LAYER_Z.bodies.toFixed(1)}, 1.0);

        // The star sits at the world origin, so the direction to it — in view
        // space — is the real light direction for this body. This is what gives
        // every planet a terminator that points the right way.
        vec3 starView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vLight = normalize(starView - center.xyz + vec3(0.0, 0.0, 1e-4));

        vec4 mv = center + vec4(position.xy * aRadius * uQuad, 0.0, 0.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}

      uniform float uTime;
      uniform float uQuad;
      uniform float uWorldPerPixel;
      uniform vec3 uStarTint;

      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vLight;
      varying float vSeed;
      varying float vBanded;
      varying vec4 vFog;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      void main() {
        float dim     = vFog.x;
        float chroma  = vFog.y;
        float breakUp = vFog.z;
        float wire    = vFog.w;

        float SPH = 1.0 / uQuad;
        float d = length(vUv);

        // --- the sphere ------------------------------------------------------
        vec2 s = vUv / SPH;
        float r2 = min(dot(s, s), 1.0);
        float z = sqrt(1.0 - r2);
        vec3 n = vec3(s.x, s.y, z);

        vec3 L = normalize(vLight);

        // Per-channel light direction. At chroma 0 all three agree and the image
        // is registered; as chroma rises the reconstruction comes apart at the
        // terminator — a remembered body literally loses colour registration.
        // (This port packs chroma/breakUp at 0 — opacity-era parity; the
        // channels stay wired for board-visual-language.)
        vec3 lam = vec3(
          dot(n, normalize(vec3(rot( chroma) * L.xy, L.z))),
          dot(n, L),
          dot(n, normalize(vec3(rot(-chroma) * L.xy, L.z)))
        );
        vec3 lit = smoothstep(vec3(-0.18), vec3(0.42), lam);

        // Procedural surface: latitudinal banding for gas giants, mottling for
        // everything else. Sampled in sphere-normal space so it wraps with the
        // curvature instead of sliding across a flat disc.
        float nz = fbm(n.xy * 3.1 + vSeed);
        float bands = 0.5 + 0.5 * sin(n.y * 12.0 + nz * 2.6 + vSeed);
        float surface = mix(0.80 + 0.40 * nz, 0.66 + 0.56 * bands, vBanded);

        // Limb brightening on the lit edge — the cue that says "atmosphere".
        float rim = pow(1.0 - z, 3.4) * max(0.0, lam.y);

        // Ambient is generous on purpose: physically the night side is black, but
        // a body you cannot find is a worse board than a slightly unphysical one.
        vec3 sphere = (vColor * surface * (lit * dim + 0.11)
                    + uStarTint * rim * 0.55 * dim) * 1.35;

        // Signal break-up: drifting dropout bands, only on remembered bodies.
        float band = fract(vUv.y * 9.0 - uTime * 0.35 + hash21(vec2(vSeed, 0.0)) * 10.0);
        float drop = smoothstep(0.46, 0.5, band) * smoothstep(0.62, 0.58, band);
        sphere *= 1.0 - breakUp * drop * 0.75;

        float aa = 0.02;
        float mask = (1.0 - smoothstep(SPH - aa, SPH + aa, d)) * (1.0 - wire);

        // --- atmosphere halo --------------------------------------------------
        // Brighter on the star-facing limb, which is what stops the halo reading
        // as a uniform sticker ring.
        vec2 ldir = normalize(L.xy + vec2(1e-5));
        float limb = 0.3 + 0.7 * max(0.0, dot(normalize(vUv + vec2(1e-5)), ldir));
        float halo = exp(-pow(max(0.0, d - SPH) / 0.17, 2.0)) * limb * dim * 1.25;
        vec3 haloCol = mix(vColor, uStarTint, 0.35);

        // --- charted outline --------------------------------------------------
        // No surface at all: geometry is free (it is astronomy), everything else
        // has to be earned. A dashed predicted circle, nothing inside it.
        float ringBand = exp(-pow((d - SPH) / 0.05, 2.0));
        float ang = atan(vUv.y, vUv.x);
        float dash = step(0.42, fract(ang * 2.2));
        float wireA = ringBand * dash * 0.85;

        vec3 col = mix(haloCol, sphere, mask);
        float alpha = mix(halo * 0.55, 1.0, mask);

        col = mix(col, vColor, wire * step(0.001, wireA));
        alpha = mix(alpha, wireA, wire);

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.bodies

  return {
    mesh,
    update(next, fxTime, worldPerPixel) {
      offsets.set(next.subarray(0, offsets.length))
      offsetAttr.needsUpdate = true
      mat.uniforms.uTime!.value = fxTime
      mat.uniforms.uWorldPerPixel!.value = worldPerPixel
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

// --- the star -----------------------------------------------------------------

export interface Star {
  mesh: THREE.Mesh
  update(fxTime: number, worldPerPixel: number): void
  dispose(): void
}

// The star gets its own quad and its own shader because it is the only thing on
// the board that emits. The core is pushed well past 1.0 so the bloom pass
// blows it out; the corona is animated fbm in polar coordinates with radial
// streaks, so it churns rather than pulses. The tint arrives RESOLVED — the
// starClass → colour decision lives in board-palette (starTint), not here.
export function createStar(radius: number, tint: Rgb): Star {
  // A unit quad scaled on the mesh, so `position.xy` is already normalised to
  // [-1,1] in the shader and the corona maths never has to know the world size.
  const geo = new THREE.PlaneGeometry(2, 2)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uWorldPerPixel: { value: 1 },
      uTint: { value: new THREE.Color(tint[0], tint[1], tint[2]) },
      uCoreR: { value: 0.25 }, // photosphere radius as a fraction of the quad
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime;
      uniform float uWorldPerPixel;
      uniform vec3 uTint;
      uniform float uCoreR;
      varying vec2 vUv;

      void main() {
        float d = length(vUv);
        float ang = atan(vUv.y, vUv.x);

        // Photosphere: flat white-hot inside, falling off fast at the limb.
        float core = 1.0 - smoothstep(uCoreR * 0.88, uCoreR, d);

        // Granulation on the disc itself, so the core is not a plain white plate.
        float gran = fbm(vUv * 46.0 + uTime * 0.12);
        core *= 0.86 + 0.14 * gran;

        // Corona: fbm in (angle, radius) churning outward, plus radial streaks.
        // Kept TIGHT — the failure mode here is a white blob that eats the board,
        // so the corona has to stay a structured collar, not a wash.
        vec2 polar = vec2(ang * 1.6, d * 7.5 - uTime * 0.16);
        float cor = fbm(polar) * fbm(polar * 2.1 + 4.0);
        float streak = 0.5 + 0.5 * sin(ang * 9.0 + fbm(polar * 1.3) * 6.0);
        float falloff = exp(-pow(max(0.0, d - uCoreR) / 0.085, 1.6));
        float corona = cor * streak * falloff * 1.6;

        // Narrow outer glow — the part the bloom pass smears into the scene.
        float glow = exp(-pow(d / 0.20, 2.0)) * 0.28;

        // The core reads hotter (whiter) than the corona, which keeps its tint.
        // 1.7 sits just far enough over the bloom threshold to blow out cleanly.
        vec3 col = mix(uTint, vec3(1.0), 0.45) * core * 1.7
                 + uTint * corona * 1.1
                 + uTint * glow * 1.2;

        float a = clamp(core + corona * 0.7 + glow, 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  // Quad half-extent = 4× the photosphere radius, so the corona has room to
  // reach without the core shrinking to nothing (uCoreR = 0.25 = radius/4×).
  mesh.scale.setScalar(radius * 4)
  mesh.position.z = LAYER_Z.bodies
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.surfaceFx

  return {
    mesh,
    update(fxTime, worldPerPixel) {
      mat.uniforms.uTime!.value = fxTime
      mat.uniforms.uWorldPerPixel!.value = worldPerPixel
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

// The fleet collection: N fleets with add/remove lifecycle, roster-driven
// hulls, and the own/foreign fork as an INSTANCE ATTRIBUTE — one draw, one
// shader branch, never a second mesh (port-board-to-webgl-renderer, seam 3).
//
// Structure: one instanced SDF-quad draw for every hull slot across every
// fleet (a fleet contributes formation.length slots — foreign fleets always
// exactly one, the constant contact mark), one instanced quad draw for the
// exhaust plumes (one per fleet), and one shared particle pool for the burn
// trails. An SSE arrival/departure rewrites instance counts, not meshes:
// per-fleet handles hold bookkeeping only, so a removed fleet cannot leak GPU
// memory by construction — and the reconciler (fleet-collection.ts, outside
// webgl/) still disposes each removed handle on the same roster update, which
// is what evicts its hull slots and stops its trail emission that frame.
//
// Plumbing only: formations, accents, and the audience fork arrive resolved
// (packFleetInstance / the frame packer); colours are theme triples.

import * as THREE from 'three'
import { GLSL_NOISE } from './glsl-common'
import { reconcileFleets } from '../fleet-collection'
import { LAYER_Z, RENDER_ORDER } from './layers'
import type { FleetFrame, PackedFleetInstance, Rgb } from './contract'

// Quad half-extent in world units — room for the docked ring outside the
// accent ring (HEX_SIZE·0.42 ≈ 14.3 ring inside a 20-unit quad).
const QUAD = 20
const TRAIL_POOL = 512

interface FleetHandle {
  audience: 0 | 1
  formation: { dx: number; dy: number }[]
  emitAccum: number
}

export interface Fleets {
  group: THREE.Group
  // Reconcile the drawn set against the latest read — disposes removed
  // fleets' handles on this same update (never waits for unmount).
  sync(instances: PackedFleetInstance[]): void
  update(frames: FleetFrame[], fxTime: number, dt: number, worldPerPixel: number): void
  dispose(): void
}

export function createFleets(thruster: Rgb, signal: Rgb): Fleets {
  const group = new THREE.Group()
  const handles = new Map<string, FleetHandle>()
  let packedById = new Map<string, PackedFleetInstance>()

  // --- hulls: one instanced SDF quad for every hull slot ----------------------
  let hullCapacity = 64
  let hullOffsets = new Float32Array(hullCapacity * 2)
  let hullRots = new Float32Array(hullCapacity)
  let hullAccents = new Float32Array(hullCapacity * 3)
  // (audience, docked, isLead) per slot.
  let hullFlags = new Float32Array(hullCapacity * 3)

  const hullMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uWorldPerPixel: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aOffset;
      attribute float aRot;
      attribute vec3 aAccent;
      attribute vec3 aFlags;
      varying vec2 vUv;
      varying vec3 vAccent;
      varying vec3 vFlags;

      void main() {
        vUv = position.xy;
        vAccent = aAccent;
        vFlags = aFlags;
        float c = cos(aRot);
        float s = sin(aRot);
        vec2 local = position.xy * ${QUAD.toFixed(1)};
        vec2 rotated = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
        vec3 world = vec3(aOffset + rotated, ${LAYER_Z.fleets.toFixed(1)});
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uWorldPerPixel;
      varying vec2 vUv;
      varying vec3 vAccent;
      varying vec3 vFlags;

      // Signed distance to the hull triangle (chevron pointing +y at rot 0 —
      // the SVG hull's silhouette, scaled to quad space).
      float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
        vec2 e0 = b - a, e1 = c - b, e2 = a - c;
        vec2 v0 = p - a, v1 = p - b, v2 = p - c;
        vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
        vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
        vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
        float s = sign(e0.x * e2.y - e0.y * e2.x);
        vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                         vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                     vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
        return -sqrt(d.x) * sign(d.y);
      }

      void main() {
        float audience = vFlags.x;
        float docked = vFlags.y;
        float isLead = vFlags.z;
        float d = length(vUv);
        float aa = fwidth(d) * 1.4;
        float stroke = 0.075; // 1.5 world px at quad scale

        float alpha = 0.0;
        vec3 col = vAccent;

        if (audience < 0.5) {
          // OWN: accent mode ring on the lead slot, hull chevron on every slot,
          // dashed dock ring while docked.
          float ring = (1.0 - smoothstep(stroke, stroke + aa, abs(d - 0.715))) * 0.9 * isLead;
          // sdTriangle is negative inside; fill where the distance is below 0.
          float tri = sdTriangle(vUv, vec2(0.0, 0.643), vec2(0.357, -0.393), vec2(-0.357, -0.393));
          float hull = 1.0 - smoothstep(-aa, aa, tri);
          float ang = atan(vUv.y, vUv.x);
          float dash = step(0.5, fract(ang * 2.86478898)); // ~18 dashes
          float dock = (1.0 - smoothstep(stroke * 0.7, stroke * 0.7 + aa, abs(d - 0.865)))
                     * dash * docked * isLead * 0.9;
          alpha = max(max(ring, hull), dock);
        } else {
          // FOREIGN: the bare contact mark — a diamond outline, nothing else.
          // Geometry is constant across every foreign fleet by construction.
          float sd = abs(vUv.x) + abs(vUv.y) - 0.505;
          float aaSd = fwidth(sd) * 1.4;
          alpha = (1.0 - smoothstep(stroke, stroke + aaSd, abs(sd))) * 0.9;
        }

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })

  const hullBase = new THREE.PlaneGeometry(2, 2)

  function buildHullGeometry(): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = hullBase.index
    geo.attributes.position = hullBase.attributes.position!
    const off = new THREE.InstancedBufferAttribute(hullOffsets, 2)
    const rot = new THREE.InstancedBufferAttribute(hullRots, 1)
    const acc = new THREE.InstancedBufferAttribute(hullAccents, 3)
    const flags = new THREE.InstancedBufferAttribute(hullFlags, 3)
    for (const a of [off, rot, acc, flags]) a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aOffset', off)
    geo.setAttribute('aRot', rot)
    geo.setAttribute('aAccent', acc)
    geo.setAttribute('aFlags', flags)
    geo.instanceCount = 0
    return geo
  }

  let hullGeo = buildHullGeometry()
  const hullMesh = new THREE.Mesh(hullGeo, hullMat)
  hullMesh.frustumCulled = false
  hullMesh.renderOrder = RENDER_ORDER.fleetHull
  group.add(hullMesh)

  function ensureHullCapacity(n: number) {
    if (n <= hullCapacity) return
    while (hullCapacity < n) hullCapacity *= 2
    hullOffsets = new Float32Array(hullCapacity * 2)
    hullRots = new Float32Array(hullCapacity)
    hullAccents = new Float32Array(hullCapacity * 3)
    hullFlags = new Float32Array(hullCapacity * 3)
    hullGeo.dispose()
    hullGeo = buildHullGeometry()
    hullMesh.geometry = hullGeo
  }

  // --- plumes: one instanced quad per fleet -----------------------------------
  let plumeCapacity = 16
  let plumeOffsets = new Float32Array(plumeCapacity * 2)
  let plumeRots = new Float32Array(plumeCapacity)
  let plumeOn = new Float32Array(plumeCapacity)

  const plumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uWorldPerPixel: { value: 1 },
      uHot: { value: new THREE.Color(thruster[0], thruster[1], thruster[2]) },
      uTip: { value: new THREE.Color('#fff3d0') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aOffset;
      attribute float aRot;
      attribute float aOn;
      varying vec2 vUv;
      varying float vOn;

      void main() {
        vUv = position.xy;
        vOn = aOn;
        // Plume quad: 26×46 world units, nozzle edge at the hull's tail.
        vec2 local = vec2(position.x * 26.0, position.y * 46.0 - 50.0);
        float c = cos(aRot);
        float s = sin(aRot);
        vec2 rotated = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
        vec3 world = vec3(aOffset + rotated, ${LAYER_Z.fleets.toFixed(1)});
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime;
      uniform float uWorldPerPixel;
      uniform vec3 uHot;
      uniform vec3 uTip;
      varying vec2 vUv;
      varying float vOn;

      void main() {
        // Local space: the nozzle sits at y=+1, the plume streams to y=-1.
        float t = (1.0 - vUv.y) * 0.5;            // 0 at nozzle → 1 at tail
        if (t <= 0.0 || vOn < 0.01) discard;

        // Cone: allowed half-width grows with distance from the nozzle.
        float width = 0.06 + t * 0.30;
        float across = abs(vUv.x) / width;
        if (across > 1.0) discard;

        // Flicker: two noise fields scrolling down the plume at different rates.
        float flick = fbm(vec2(vUv.x * 6.0, t * 7.0 - uTime * 5.5)) * 0.6
                    + fbm(vec2(vUv.x * 13.0, t * 15.0 - uTime * 9.0)) * 0.4;

        float body = pow(1.0 - across, 1.7) * pow(1.0 - t, 1.5);
        float a = body * (0.55 + 0.75 * flick) * vOn;

        // White-hot at the nozzle, cooling to amber down the plume.
        vec3 col = mix(uTip, uHot, smoothstep(0.0, 0.45, t));
        gl_FragColor = vec4(col * a * 1.9, a);
      }
    `,
  })

  const plumeBase = new THREE.PlaneGeometry(2, 2)

  function buildPlumeGeometry(): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = plumeBase.index
    geo.attributes.position = plumeBase.attributes.position!
    const off = new THREE.InstancedBufferAttribute(plumeOffsets, 2)
    const rot = new THREE.InstancedBufferAttribute(plumeRots, 1)
    const on = new THREE.InstancedBufferAttribute(plumeOn, 1)
    for (const a of [off, rot, on]) a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aOffset', off)
    geo.setAttribute('aRot', rot)
    geo.setAttribute('aOn', on)
    geo.instanceCount = 0
    return geo
  }

  let plumeGeo = buildPlumeGeometry()
  const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat)
  plumeMesh.frustumCulled = false
  plumeMesh.renderOrder = RENDER_ORDER.fleetPlume
  group.add(plumeMesh)

  function ensurePlumeCapacity(n: number) {
    if (n <= plumeCapacity) return
    while (plumeCapacity < n) plumeCapacity *= 2
    plumeOffsets = new Float32Array(plumeCapacity * 2)
    plumeRots = new Float32Array(plumeCapacity)
    plumeOn = new Float32Array(plumeCapacity)
    plumeGeo.dispose()
    plumeGeo = buildPlumeGeometry()
    plumeMesh.geometry = plumeGeo
  }

  // --- trail: one shared particle pool ----------------------------------------
  // A ring buffer of world positions; every burning fleet emits into the same
  // pool. Each point carries the fxTime it was emitted so the shader fades it
  // by age with no per-frame CPU work beyond writing slots.
  const trailPos = new Float32Array(TRAIL_POOL * 3)
  const trailBorn = new Float32Array(TRAIL_POOL)
  trailBorn.fill(-1e9)
  const trailGeo = new THREE.BufferGeometry()
  const trailPosAttr = new THREE.BufferAttribute(trailPos, 3)
  const trailBornAttr = new THREE.BufferAttribute(trailBorn, 1)
  trailPosAttr.setUsage(THREE.DynamicDrawUsage)
  trailBornAttr.setUsage(THREE.DynamicDrawUsage)
  trailGeo.setAttribute('position', trailPosAttr)
  trailGeo.setAttribute('aBorn', trailBornAttr)

  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLife: { value: 2.6 },
      uWorldPerPixel: { value: 1 },
      uHot: { value: new THREE.Color(thruster[0], thruster[1], thruster[2]) },
      uCool: { value: new THREE.Color(signal[0], signal[1], signal[2]) },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aBorn;
      uniform float uTime;
      uniform float uLife;
      uniform float uPixelRatio;
      varying float vAge;

      void main() {
        vAge = clamp((uTime - aBorn) / uLife, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Particles expand slightly as they cool and disperse.
        float size = mix(5.5, 13.0, vAge) * uPixelRatio;
        gl_PointSize = max(1.0, size * (900.0 / -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHot;
      uniform vec3 uCool;
      varying float vAge;

      void main() {
        if (vAge >= 1.0) discard;
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        if (d > 1.0) discard;

        float soft = pow(max(0.0, 1.0 - d), 2.2);
        // Fade fast at first, then linger — exhaust cools quickly and drifts.
        float fade = pow(1.0 - vAge, 2.4);
        vec3 col = mix(uHot, uCool, smoothstep(0.15, 0.85, vAge));
        float a = soft * fade * 0.55;
        gl_FragColor = vec4(col * a, a);
      }
    `,
  })
  const trail = new THREE.Points(trailGeo, trailMat)
  trail.frustumCulled = false
  trail.renderOrder = RENDER_ORDER.fleetTrail
  group.add(trail)

  let trailHead = 0

  return {
    group,

    sync(instances) {
      packedById = new Map(instances.map((p) => [p.id, p]))
      reconcileFleets(handles, instances.map((p) => p.id), {
        create(id) {
          const p = packedById.get(id)!
          return { audience: p.audience, formation: p.formation, emitAccum: 0 }
        },
        dispose() {
          // Handles hold bookkeeping only — pooled GPU resources are owned by
          // the collection, so eviction (this delete) IS the release. The call
          // still lands here per removed id, on the same roster update.
        },
      })
      // A kept fleet's roster can change (formation grows/shrinks) — refresh
      // static data on every sync, not only on create.
      for (const [id, handle] of handles) {
        const p = packedById.get(id)
        if (p) {
          handle.audience = p.audience
          handle.formation = p.formation
        }
      }
    },

    update(frames, fxTime, dt, worldPerPixel) {
      let slots = 0
      for (const f of frames) {
        const h = handles.get(f.id)
        if (h) slots += h.formation.length
      }
      ensureHullCapacity(slots)
      ensurePlumeCapacity(frames.length)

      let i = 0
      let pi = 0
      let emitted = false
      for (const f of frames) {
        const h = handles.get(f.id)
        if (!h) continue
        const c = Math.cos(f.headingRad)
        const s = Math.sin(f.headingRad)
        for (let k = 0; k < h.formation.length; k++) {
          const slot = h.formation[k]!
          hullOffsets[i * 2] = f.x + c * slot.dx - s * slot.dy
          hullOffsets[i * 2 + 1] = f.y + s * slot.dx + c * slot.dy
          hullRots[i] = f.headingRad
          hullAccents[i * 3] = f.accent[0]
          hullAccents[i * 3 + 1] = f.accent[1]
          hullAccents[i * 3 + 2] = f.accent[2]
          hullFlags[i * 3] = h.audience
          hullFlags[i * 3 + 1] = f.docked
          hullFlags[i * 3 + 2] = k === 0 ? 1 : 0
          i++
        }

        plumeOffsets[pi * 2] = f.x
        plumeOffsets[pi * 2 + 1] = f.y
        plumeRots[pi] = f.headingRad
        plumeOn[pi] = h.audience === 0 ? f.burning : 0
        pi++

        // Trail emission at a fixed rate per burning own fleet, so density does
        // not change with refresh rate. Skipped entirely at dt 0 (reduced
        // motion passes a frozen clock and no dt).
        if (h.audience === 0 && f.burning && dt > 0) {
          h.emitAccum += dt
          const interval = 1 / 90
          // The tail direction is local (0,-1) rotated by heading: (s, -c).
          const back = 16
          const bx = f.x + s * back
          const by = f.y - c * back
          while (h.emitAccum >= interval) {
            h.emitAccum -= interval
            const spread = 3.2
            trailPos[trailHead * 3] = bx + (Math.random() - 0.5) * spread
            trailPos[trailHead * 3 + 1] = by + (Math.random() - 0.5) * spread
            trailPos[trailHead * 3 + 2] = LAYER_Z.fleets + (Math.random() - 0.5) * 2
            trailBorn[trailHead] = fxTime
            trailHead = (trailHead + 1) % TRAIL_POOL
            emitted = true
          }
        }
      }

      hullGeo.instanceCount = i
      plumeGeo.instanceCount = pi
      for (const name of ['aOffset', 'aRot', 'aAccent', 'aFlags'] as const) {
        ;(hullGeo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true
      }
      for (const name of ['aOffset', 'aRot', 'aOn'] as const) {
        ;(plumeGeo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true
      }
      if (emitted) {
        trailPosAttr.needsUpdate = true
        trailBornAttr.needsUpdate = true
      }

      hullMat.uniforms.uWorldPerPixel!.value = worldPerPixel
      plumeMat.uniforms.uTime!.value = fxTime
      plumeMat.uniforms.uWorldPerPixel!.value = worldPerPixel
      trailMat.uniforms.uTime!.value = fxTime
      trailMat.uniforms.uWorldPerPixel!.value = worldPerPixel
    },

    dispose() {
      handles.clear()
      hullGeo.dispose()
      hullBase.dispose()
      hullMat.dispose()
      plumeGeo.dispose()
      plumeBase.dispose()
      plumeMat.dispose()
      trailGeo.dispose()
      trailMat.dispose()
    },
  }
}

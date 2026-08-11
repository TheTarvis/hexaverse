// SPIKE (throwaway) — the fleet: hull, exhaust plume, and a particle trail.
//
// The production FleetGlyph draws a chevron and, when burning, a THRUSTER-tinted
// flame shape. It reads clearly, which matters more than anything else, but a
// burning ship and a coasting ship differ only by a small amber wedge.
//
// Here the burn is an event in the scene: a cone of hot exhaust that flickers on
// noise, and a decaying particle trail that persists behind the ship for a few
// seconds. Both are additive and both sit well above the bloom threshold, so a
// burn actually lights the tiles it passes over. The hull itself stays a clean,
// readable chevron — the ship is the thing you click, and it should never become
// an effect.

import * as THREE from 'three'
import { GLSL_NOISE } from './glsl-common'
import { HULL, SIGNAL, THRUSTER } from './spike-palette'

const TRAIL_COUNT = 220

export interface FleetVisual {
  group: THREE.Group
  // Place the fleet this frame. `heading` is radians in scene space (y up).
  update(x: number, y: number, heading: number, burning: boolean, elapsed: number, dt: number): void
  dispose(): void
}

// The hull outline — a chevron pointing along +y, sized in world units so it
// sits inside a hex (HEX_SIZE is 34).
function hullGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 15)
  s.lineTo(9.5, -9)
  s.lineTo(0, -3.5)
  s.lineTo(-9.5, -9)
  s.closePath()
  return new THREE.ShapeGeometry(s)
}

export function createFleet(): FleetVisual {
  const group = new THREE.Group()

  // --- hull -------------------------------------------------------------------
  const hullGeo = hullGeometry()
  const hullMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(HULL),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const hull = new THREE.Mesh(hullGeo, hullMat)
  hull.renderOrder = 6

  // --- exhaust ----------------------------------------------------------------
  // An additive quad behind the hull. The plume is a cone in local space,
  // flickering on fbm so the burn never looks like a static decal.
  const plumeGeo = new THREE.PlaneGeometry(2, 2)
  const plumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHot: { value: new THREE.Color(THRUSTER) },
      uTip: { value: new THREE.Color('#fff3d0') },
      uOn: { value: 0 },
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
      uniform vec3 uHot;
      uniform vec3 uTip;
      uniform float uOn;
      varying vec2 vUv;

      void main() {
        // Local space: the nozzle sits at y=+1, the plume streams to y=-1.
        float t = (1.0 - vUv.y) * 0.5;            // 0 at nozzle → 1 at tail
        if (t <= 0.0 || uOn < 0.01) discard;

        // Cone: allowed half-width grows with distance from the nozzle.
        float width = 0.06 + t * 0.30;
        float across = abs(vUv.x) / width;
        if (across > 1.0) discard;

        // Flicker: two noise fields scrolling down the plume at different rates.
        float flick = fbm(vec2(vUv.x * 6.0, t * 7.0 - uTime * 5.5)) * 0.6
                    + fbm(vec2(vUv.x * 13.0, t * 15.0 - uTime * 9.0)) * 0.4;

        float body = pow(1.0 - across, 1.7) * pow(1.0 - t, 1.5);
        float a = body * (0.55 + 0.75 * flick) * uOn;

        // White-hot at the nozzle, cooling to amber down the plume.
        vec3 col = mix(uTip, uHot, smoothstep(0.0, 0.45, t));
        gl_FragColor = vec4(col * a * 1.9, a);
      }
    `,
  })
  const plume = new THREE.Mesh(plumeGeo, plumeMat)
  plume.scale.set(26, 46, 1)
  // The quad's nozzle edge (local y=+1) must land at the ship's tail.
  plume.position.y = -46 - 4
  plume.renderOrder = 5

  const ship = new THREE.Group()
  ship.add(plume)
  ship.add(hull)
  group.add(ship)

  // --- trail ------------------------------------------------------------------
  // A ring buffer of world positions, oldest overwritten. Each point carries the
  // elapsed time it was emitted so the shader can fade it by age without any
  // per-frame CPU work beyond writing one slot.
  const trailPos = new Float32Array(TRAIL_COUNT * 3)
  const trailBorn = new Float32Array(TRAIL_COUNT)
  trailBorn.fill(-1e9)
  const trailGeo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(trailPos, 3)
  const bornAttr = new THREE.BufferAttribute(trailBorn, 1)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  bornAttr.setUsage(THREE.DynamicDrawUsage)
  trailGeo.setAttribute('position', posAttr)
  trailGeo.setAttribute('aBorn', bornAttr)

  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLife: { value: 2.6 },
      uHot: { value: new THREE.Color(THRUSTER) },
      uCool: { value: new THREE.Color(SIGNAL) },
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
  trail.renderOrder = 2
  group.add(trail)

  let head = 0
  let emitAccum = 0

  return {
    group,
    update(x, y, heading, burning, elapsed, dt) {
      ship.position.set(x, y, 0)
      ship.rotation.z = heading

      plumeMat.uniforms.uTime!.value = elapsed
      plumeMat.uniforms.uOn!.value = burning ? 1 : 0
      trailMat.uniforms.uTime!.value = elapsed

      if (!burning) return

      // Emit at a fixed rate rather than per frame, so the trail's density does
      // not change with refresh rate.
      emitAccum += dt
      const interval = 1 / 90
      while (emitAccum >= interval) {
        emitAccum -= interval
        // Emit at the nozzle, scattered a little so the plume root has volume.
        // The hull points along local +y, so after rotating by `heading` the
        // tail direction is (sin h, -cos h).
        const spread = 3.2
        const back = 16
        const bx = x + Math.sin(heading) * back
        const by = y - Math.cos(heading) * back
        trailPos[head * 3] = bx + (Math.random() - 0.5) * spread
        trailPos[head * 3 + 1] = by + (Math.random() - 0.5) * spread
        trailPos[head * 3 + 2] = (Math.random() - 0.5) * 2
        trailBorn[head] = elapsed
        head = (head + 1) % TRAIL_COUNT
      }
      posAttr.needsUpdate = true
      bornAttr.needsUpdate = true
    },
    dispose() {
      hullGeo.dispose()
      hullMat.dispose()
      plumeGeo.dispose()
      plumeMat.dispose()
      trailGeo.dispose()
      trailMat.dispose()
    },
  }
}

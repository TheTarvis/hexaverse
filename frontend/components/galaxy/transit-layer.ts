// Transit layer — the travelling-fleet overlay on the 3D galaxy (#0008): a bright
// pip crawling its lane, a comet tail behind it, and the trip's lane chain lit up
// so you can see WHERE it's going, not just that it's going.
//
// It owns a THREE.Group in the graph's scene and is driven imperatively (setFleets
// when the trip set changes, update() every frame) so a per-frame position never
// costs a React render of the force graph. The math is transit-geometry's; this
// file is only paint.

import * as THREE from 'three'
import type { Fleet } from '@/lib/types/fleet'
import { glowTexture } from './glow-texture'
import { routePath, transitPoint, type NodePositions, type Vec3 } from './transit-geometry'

const MARKER_COLOR = '#67e8f9' // the own-fleet cyan the presence pip uses
const ROUTE_COLOR = '#38bdf8'
const HOLD_COLOR = '#fbbf24' // amber — parked mid-lane, matches the banner
const MARKER_SIZE = 5.2
const TAIL_LENGTH = 14 // world units of comet tail behind the marker

interface Trail {
  fleet: Fleet
  marker: THREE.Sprite
  tail: THREE.Line
  route: THREE.Line | null
}

export class TransitLayer {
  private group = new THREE.Group()
  private scene: THREE.Scene
  private nodes: NodePositions
  private trails = new Map<string, Trail>()

  constructor(scene: THREE.Scene, nodes: NodePositions) {
    this.scene = scene
    this.nodes = nodes
    this.group.renderOrder = 2
    this.scene.add(this.group)
  }

  // setFleets reconciles the drawn set against the fleets currently on a lane —
  // rebuilding a trail only when its fleet's route actually changes, so an
  // unchanged trip keeps its objects (and the frame loop stays allocation-free).
  setFleets(fleets: Fleet[]): void {
    const live = new Set<string>()
    for (const f of fleets) {
      if (f.state.mode !== 'laneTransit' && f.state.mode !== 'laneHold') continue
      live.add(f.id)
      const existing = this.trails.get(f.id)
      if (existing && sameTrip(existing.fleet, f)) {
        existing.fleet = f
        continue
      }
      if (existing) this.destroy(existing)
      this.trails.set(f.id, this.build(f))
    }
    for (const [id, trail] of this.trails) {
      if (live.has(id)) continue
      this.destroy(trail)
      this.trails.delete(id)
    }
  }

  // update repositions every marker for the given world time. Called once per
  // animation frame; a fleet with no lane position (bad route ids) is hidden
  // rather than parked at the origin.
  update(worldTime: number): void {
    for (const trail of this.trails.values()) {
      const p = transitPoint(trail.fleet, worldTime, this.nodes)
      if (!p) {
        trail.marker.visible = false
        trail.tail.visible = false
        continue
      }
      trail.marker.visible = true
      trail.marker.position.set(p.x, p.y, p.z)

      // The tail trails the point the fleet occupied a moment ago — so it lags
      // the marker along the actual lane, curving through a multi-hop turn.
      const behind = transitPoint(trail.fleet, worldTime - tailMs(trail.fleet), this.nodes) ?? p
      const dir = norm({ x: p.x - behind.x, y: p.y - behind.y, z: p.z - behind.z })
      trail.tail.visible = !!dir
      if (dir) {
        setLine(trail.tail, [
          { x: p.x - dir.x * TAIL_LENGTH, y: p.y - dir.y * TAIL_LENGTH, z: p.z - dir.z * TAIL_LENGTH },
          p,
        ])
      }
    }
  }

  // pick returns the fleet whose marker a ray hits (nearest first), or null. The
  // markers are plain scene objects — the force graph knows nothing about them —
  // so the view raycasts them itself to make a travelling fleet clickable.
  pick(raycaster: THREE.Raycaster): string | null {
    let bestId: string | null = null
    let bestDist = Infinity
    for (const [id, trail] of this.trails) {
      if (!trail.marker.visible) continue
      const hits = raycaster.intersectObject(trail.marker, false)
      if (hits.length > 0 && hits[0].distance < bestDist) {
        bestDist = hits[0].distance
        bestId = id
      }
    }
    return bestId
  }

  dispose(): void {
    for (const trail of this.trails.values()) this.destroy(trail)
    this.trails.clear()
    this.scene.remove(this.group)
  }

  private build(fleet: Fleet): Trail {
    const held = fleet.state.mode === 'laneHold'
    const color = held ? HOLD_COLOR : MARKER_COLOR

    const marker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 1,
      }),
    )
    marker.scale.set(MARKER_SIZE, MARKER_SIZE, 1)
    this.group.add(marker)

    const tail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    )
    this.group.add(tail)

    // The lit lane chain — the trip's whole route, so a multi-hop leg reads as a
    // planned path rather than a pip drifting through the dark.
    let route: THREE.Line | null = null
    const path = routePath(fleet, this.nodes)
    if (path.length >= 2) {
      route = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(ROUTE_COLOR),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      )
      setLine(route, path)
      this.group.add(route)
    }

    return { fleet, marker, tail, route }
  }

  private destroy(trail: Trail): void {
    for (const obj of [trail.marker, trail.tail, trail.route]) {
      if (!obj) continue
      this.group.remove(obj)
      obj.geometry?.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    }
  }
}

// A trip is "the same" while its identity (mode + route + arrival) holds; a
// redirect or a re-order changes one of them and earns a fresh trail.
function sameTrip(a: Fleet, b: Fleet): boolean {
  if (a.state.mode !== b.state.mode) return false
  const x = a.state.laneTransit
  const y = b.state.laneTransit
  if (x && y) return x.arriveTime === y.arriveTime && x.route.join('>') === y.route.join('>')
  const h = a.state.laneHold
  const k = b.state.laneHold
  if (h && k) return h.from === k.from && h.to === k.to && h.fraction === k.fraction
  return false
}

// How far back in world time the tail samples — a fixed slice of the trip, so the
// tail is a consistent length whatever the lane's crossing time.
function tailMs(fleet: Fleet): number {
  const lt = fleet.state.laneTransit
  if (!lt || lt.route.length < 2) return 1_000
  const span = lt.arriveTime - lt.departTime
  return Math.max(200, span / 60)
}

function setLine(line: THREE.Line, points: Vec3[]): void {
  line.geometry.setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)))
}

function norm(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len === 0) return null
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

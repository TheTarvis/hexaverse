import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createSurfaceTexture, createRadialGlowTexture, createHexGrid } from './scene-art'

function pixels(texture: THREE.DataTexture) {
  expect(texture.image.data).toBeInstanceOf(Uint8Array)
  return texture.image.data as Uint8Array
}

describe('refresh-system-scene-art texture and geometry contract', () => {
  it('Scenario: Other body types and missing features', () => {
    expect(createSurfaceTexture('unknown', 'x')).toBeNull()
    expect(createSurfaceTexture('station', 'x')).toBeNull()
    const ice = createSurfaceTexture('ice', 'x')!
    const moon = createSurfaceTexture('moon', 'x')!
    expect(pixels(ice)).not.toEqual(pixels(moon))
    ice.dispose(); moon.dispose()
  })

  it.each(['gas_giant', 'rocky', 'ice', 'moon'])('Scenario: Repeatable and refreshed classification — %s', (type) => {
    const a = createSurfaceTexture(type, 'alpha')!
    const b = createSurfaceTexture(type, 'alpha')!
    const c = createSurfaceTexture(type, 'beta')!
    expect(a).toBeInstanceOf(THREE.DataTexture)
    expect(a).not.toBe(b)
    expect(a.image.width).toBe(256)
    expect(a.image.height).toBe(128)
    expect(a.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(pixels(a)).toEqual(pixels(b))
    expect(pixels(a)).not.toEqual(pixels(c))
    const data = pixels(a)
    const colors = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
      colors.add(data[i]! * 65536 + data[i + 1]! * 256 + data[i + 2]!)
    }
    expect(data.every((value, i) => i % 4 !== 3 || value === 255)).toBe(true)
    expect(colors.size).toBeGreaterThan(16)
    a.dispose(); b.dispose(); c.dispose()
  })

  it('Scenario: Gas giant surface', () => {
    const texture = createSurfaceTexture('gas_giant', 'banded-world')!
    const data = pixels(texture)
    const rows = Array.from({ length: 128 }, (_, y) => {
      let total = 0
      for (let x = 0; x < 256; x++) total += data[(y * 256 + x) * 4]!
      return total / 256
    })
    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(10)
    const middle = Array.from({ length: 256 }, (_, x) => data[(64 * 256 + x) * 4]!)
    expect(new Set(middle).size).toBeGreaterThan(3)
    texture.dispose()
  })

  it.each(['gas_giant', 'rocky', 'ice', 'moon'])('Scenario: Surface wraps continuously — %s', (type) => {
    const texture = createSurfaceTexture(type, 'banded-world')!
    const data = pixels(texture)
    // The seam must be no more conspicuous than ordinary adjacent samples.
    let seam = 0; let interior = 0
    for (let y = 0; y < 128; y++) {
      seam += Math.abs(data[y * 256 * 4]! - data[(y * 256 + 255) * 4]!)
      for (let x = 1; x < 256; x++) interior += Math.abs(data[(y * 256 + x) * 4]! - data[(y * 256 + x - 1) * 4]!)
    }
    expect(seam / 128).toBeLessThanOrEqual(interior / (128 * 255) * 3 + 2)
    // A sphere has one point at each pole; longitude must not change it.
    for (const y of [0, 127]) {
      const pole = Array.from(data.slice(y * 256 * 4, y * 256 * 4 + 4))
      for (let x = 1; x < 256; x++) expect(Array.from(data.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4))).toEqual(pole)
    }
    texture.dispose()
  })

  it('Scenario: Warm reference star — continuous alpha falloff', () => {
    const texture = createRadialGlowTexture()
    expect(texture.image.width).toBe(128)
    expect(texture.image.height).toBe(128)
    const data = pixels(texture)
    const alpha = (x: number, y: number) => data[(y * 128 + x) * 4 + 3]!
    expect(alpha(64, 64)).toBeGreaterThan(200)
    expect(alpha(127, 64)).toBe(0)
    expect(alpha(0, 0)).toBe(0)
    const ray = Array.from({ length: 64 }, (_, i) => alpha(64 + i, 64))
    expect(new Set(ray).size).toBeGreaterThan(20)
    for (let i = 1; i < ray.length; i++) expect(ray[i]).toBeLessThanOrEqual(ray[i - 1]!)
    texture.dispose()
  })

  it('Scenario: Planar depth reference', () => {
    const grid = createHexGrid(100)
    expect(grid).toBeInstanceOf(THREE.LineSegments)
    const p = grid.geometry.getAttribute('position')
    expect(p.count).toBeGreaterThan(12)
    expect(p.count).toBeLessThanOrEqual(30000)
    const lengths: number[] = []
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBe(0)
      expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getZ(i))).toBe(true)
      expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThanOrEqual(110.001)
      if (i % 2 === 1) lengths.push(Math.hypot(p.getX(i) - p.getX(i - 1), p.getZ(i) - p.getZ(i - 1)))
    }
    expect(Math.min(...lengths)).toBeGreaterThan(0)
    // Actual regular hex edges occupy three undirected axes, not polar spokes/circles.
    const angles = new Set(lengths.map((_, i) => Math.round(((Math.atan2(p.getZ(i * 2 + 1) - p.getZ(i * 2), p.getX(i * 2 + 1) - p.getX(i * 2)) + Math.PI) % Math.PI) * 100)))
    expect(angles.size).toBeLessThanOrEqual(4)
    const m = grid.material as THREE.LineBasicMaterial
    expect(m.transparent).toBe(true)
    expect(m.depthWrite).toBe(false)
    expect(m.depthTest).toBe(true)
    expect(m.color.g).toBeGreaterThan(m.color.r)
    expect(m.color.b).toBeGreaterThan(m.color.r)
    expect(grid.geometry.getAttribute('color') || ('uniforms' in m)).toBeTruthy()
    grid.geometry.dispose(); m.dispose()
  })
})

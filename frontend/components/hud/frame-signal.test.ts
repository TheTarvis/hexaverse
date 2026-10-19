import { expect, it, vi } from 'vitest'

// Evaluate the production shader expression numerically, rather than duplicating
// its falloff formula. Renderer lifecycle is covered by HudCardShell.test.tsx.
vi.mock('three/tsl', () => {
  type Input = Value | number
  const number = (v: Input) => v instanceof Value ? v.value : v
  class Value {
    constructor(readonly value: number) {}
    add(v: Input): Value { return new Value(this.value + number(v)) }
    sub(v: Input): Value { return new Value(this.value - number(v)) }
    mul(v: Input): Value { return new Value(this.value * number(v)) }
    div(v: Input): Value { return new Value(this.value / number(v)) }
    abs(): Value { return new Value(Math.abs(this.value)) }
    negate(): Value { return new Value(-this.value) }
    sqrt(): Value { return new Value(Math.sqrt(this.value)) }
    pow(v: Input): Value { return new Value(this.value ** number(v)) }
    mod(v: Input): Value { return new Value(((this.value % number(v)) + number(v)) % number(v)) }
    min(v: Input): Value { return new Value(Math.min(this.value, number(v))) }
    clamp(lo: Input, hi: Input): Value { return new Value(Math.max(number(lo), Math.min(number(hi), this.value))) }
    lessThan(v: Input): { select: (a: Input, b: Input) => Value } { return { select: (a, b) => new Value(number(this.value < number(v) ? a : b)) } }
  }
  class Vector {
    readonly x: Value
    readonly y: Value
    constructor(x: Input, y: Input) { this.x = new Value(number(x)); this.y = new Value(number(y)) }
    add(v: Vector): Vector { return new Vector(this.x.add(v.x), this.y.add(v.y)) }
    sub(v: Vector): Vector { return new Vector(this.x.sub(v.x), this.y.sub(v.y)) }
    mul(v: Input): Vector { return new Vector(this.x.mul(v), this.y.mul(v)) }
    dot(v: Vector): Value { return this.x.mul(v.x).add(this.y.mul(v.y)) }
    length(): Value { return this.dot(this).sqrt() }
  }
  return {
    float: (v: number) => new Value(v),
    vec2: (x: Input, y: Input) => new Vector(x, y),
    atan: (y: Input, x: Input) => new Value(Math.atan2(number(y), number(x))),
    cos: (v: Input) => new Value(Math.cos(number(v))),
    exp: (v: Input) => new Value(Math.exp(number(v))),
  }
})

import { float, vec2 } from 'three/tsl'
import { frameSignal } from './frame-signal'

function litLength(width: number, height: number, phase: number, c = 20) {
  const w = width / 2, h = height / 2
  const vertices = [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]]
  const travelPixels = phase / (Math.PI * 2) * (2 * (width + height) - c * (8 - 4 * Math.SQRT2))
  let lit = 0
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const samples = Math.ceil(length * 2)
    for (let j = 0; j < samples; j++) {
      const t = (j + 0.5) / samples
      const output = frameSignal(vec2(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), vec2(w, h), float(travelPixels), float(c))
      if ((output as unknown as { value: number }).value >= 0.5) lit += length / samples
    }
  }
  return lit / 2 // Two matching opposed highlights.
}

it.each([[216, 56, 20], [360, 600, 20], [292, 68, 12]])('keeps highlight length within 10%% around a %s×%s frame with a %spx cut', (width, height, cut) => {
  const lengths = Array.from({ length: 8 }, (_, i) => litLength(width, height, i * Math.PI / 8, cut))
  expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.1)
})

it('keeps the halo continuous where the closest edge changes at a chamfer', () => {
  const travelPixels = 176 - 10
  // Points either side of the inside angle bisector at the top-right vertex.
  // They are almost coincident; changing the nearest edge must not split light.
  const x = 88 - 10 * Math.sin(Math.PI / 8)
  const y = -28 + 10 * Math.cos(Math.PI / 8)
  const sample = (dx: number) => (frameSignal(vec2(x + dx, y), vec2(108, 28), float(travelPixels)) as unknown as { value: number }).value
  expect(Math.abs(sample(-0.001) - sample(0.001))).toBeLessThan(0.001)
})

it.each([[292, 68, 12], [360, 700, 20]])('advances the highlight by screen pixels on a %s×%s frame', (width, height, cut) => {
  const distance = 77
  const point = vec2(-width / 2 + cut + distance, -height / 2)
  const output = frameSignal(point, vec2(width / 2, height / 2), float(distance), float(cut))
  expect((output as unknown as { value: number }).value).toBeCloseTo(1, 6)
})

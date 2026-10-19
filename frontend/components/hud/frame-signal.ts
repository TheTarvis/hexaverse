import { exp, float, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/** Two opposed light spots travel the chamfered rim without edge-switch seams. */
export function frameSignal(p: Node<'vec2'>, halfSize: Node<'vec2'>, travelPixels: Node<'float'>, cut: Node<'float'> = float(20)) {
  const x = halfSize.x, y = halfSize.y
  // Use the same corner cut as the CSS shell and lighting rim.
  const vertices = [
    vec2(x.negate().add(cut), y.negate()), vec2(x.sub(cut), y.negate()),
    vec2(x, y.negate().add(cut)), vec2(x, y.sub(cut)),
    vec2(x.sub(cut), y), vec2(x.negate().add(cut), y),
    vec2(x.negate(), y.sub(cut)), vec2(x.negate(), y.negate().add(cut)),
  ]
  const perimeter = x.add(y).mul(4).sub(cut.mul(8 - 4 * Math.SQRT2))
  const position = travelPixels.mod(perimeter)
  const positions = [position, position.add(perimeter.mul(0.5)).mod(perimeter)]
  const heads: { x: Node<'float'>; y: Node<'float'> }[] = [
    { x: float(0), y: float(0) }, { x: float(0), y: float(0) },
  ]
  let start: Node<'float'> = float(0)
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length]
    const segment = b.sub(a)
    const length = segment.length()
    positions.forEach((position, index) => {
      const along = position.sub(start).div(length).clamp(0, 1)
      const point = a.add(segment.mul(along))
      const before = position.lessThan(start)
      heads[index] = {
        x: before.select(heads[index].x, point.x),
        y: before.select(heads[index].y, point.y),
      }
    })
    start = start.add(length)
  }
  // Measure in screen pixels from the light itself, not from the closest edge.
  // Projecting each halo pixel onto an edge introduces a seam at angle bisectors.
  const distances = heads.map(head => {
    const offset = p.sub(vec2(head.x, head.y))
    return offset.dot(offset)
  })
  return exp(distances[0].min(distances[1]).div(18 * 18).negate())
}

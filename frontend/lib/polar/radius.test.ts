import { describe, expect, it } from 'vitest'
import { ringRadius } from './radius'

describe('ringRadius', () => {
  it('one radius per ring, configured table honored, core at the center', () => {
    const radii = [0, 1, 1.75, 2.25, 4] // non-uniform: the open radial-spacing lever
    radii.forEach((want, ring) => expect(ringRadius(ring, radii)).toBe(want))
    expect(ringRadius(7, radii)).toBe(7) // unit fallback beyond the table
    expect(ringRadius(3)).toBe(3)
    expect(ringRadius(0, [9, 9])).toBe(0) // the core even against a table claiming otherwise
  })
})

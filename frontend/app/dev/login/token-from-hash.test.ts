import { describe, expect, it } from 'vitest'
import { tokenFromHash } from './token-from-hash'

describe('/dev/login fragment parser', () => {
  it('reads the token from the fragment only', () => {
    expect(tokenFromHash('#token=abc.def.')).toBe('abc.def.')
    expect(tokenFromHash('#other=1')).toBeNull()
    expect(tokenFromHash('')).toBeNull()
  })
  it('preserves URL decoding and treats an empty token as absent', () => {
    expect(tokenFromHash('#other=1&token=abc%2Bdef%3D')).toBe('abc+def=')
    expect(tokenFromHash('#token=')).toBeNull()
  })
})

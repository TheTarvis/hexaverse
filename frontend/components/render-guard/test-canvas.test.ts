import { describe, it, expect, afterEach } from 'vitest'
import {
  fakeGlContext,
  stubUnsupported,
  stubCreationError,
  loseContext,
  restoreContext,
} from './test-canvas'

describe('test-canvas helpers', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('fakeGlContext exposes an inspectable WEBGL_lose_context handle, stable across calls', () => {
    const ctx = fakeGlContext()
    const first = ctx.getExtension('WEBGL_lose_context')
    const second = ctx.getExtension('WEBGL_lose_context')
    expect(first).toBe(second)
    first?.loseContext()
    expect(ctx.loseContext).toHaveBeenCalledTimes(1)
  })

  it('fakeGlContext returns null for an unrecognised extension', () => {
    const ctx = fakeGlContext()
    expect(ctx.getExtension('SOME_OTHER_EXTENSION')).toBeNull()
  })

  it('the default test world (vitest.setup.ts) declares WebGL available', () => {
    const canvas = document.createElement('canvas')
    expect(canvas.getContext('webgl2')).not.toBeNull()
  })

  it('stubUnsupported makes getContext(webgl2) return null, never throwing', () => {
    restore = stubUnsupported()
    const canvas = document.createElement('canvas')
    expect(() => canvas.getContext('webgl2')).not.toThrow()
    expect(canvas.getContext('webgl2')).toBeNull()
    expect(canvas.getContext('webgl')).toBeNull()
  })

  it('stubUnsupported restores the available default afterward', () => {
    const undo = stubUnsupported()
    undo()
    const canvas = document.createElement('canvas')
    expect(canvas.getContext('webgl2')).not.toBeNull()
  })

  it('stubCreationError dispatches webglcontextcreationerror with statusMessage, then returns null', () => {
    restore = stubCreationError('CONTEXT_CREATION_FAILED: out of memory')
    const canvas = document.createElement('canvas')
    let captured: Event | null = null
    canvas.addEventListener('webglcontextcreationerror', (e) => {
      captured = e
    })
    const result = canvas.getContext('webgl2')
    expect(result).toBeNull()
    expect(captured).not.toBeNull()
    expect((captured as unknown as { statusMessage: string }).statusMessage).toBe(
      'CONTEXT_CREATION_FAILED: out of memory',
    )
  })

  it('loseContext dispatches webglcontextlost on the given canvas', () => {
    const canvas = document.createElement('canvas')
    let fired = false
    canvas.addEventListener('webglcontextlost', () => {
      fired = true
    })
    loseContext(canvas)
    expect(fired).toBe(true)
  })

  it('restoreContext dispatches webglcontextrestored on the given canvas', () => {
    const canvas = document.createElement('canvas')
    let fired = false
    canvas.addEventListener('webglcontextrestored', () => {
      fired = true
    })
    restoreContext(canvas)
    expect(fired).toBe(true)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemHudStudioPage from './page'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/components/space/storyboard/SystemStoryboard', () => ({ SystemStoryboard: () => null }))
afterEach(() => vi.unstubAllEnvs())

describe('hud prototype route', () => {
  it('is available in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(SystemHudStudioPage().props.mode).toBe('hud')
  })
  it('is unavailable in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => SystemHudStudioPage()).toThrow('NOT_FOUND')
  })
})

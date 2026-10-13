import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemStoryboardPage from './page'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/components/space/storyboard/SystemStoryboard', () => ({ SystemStoryboard: () => null }))
afterEach(() => vi.unstubAllEnvs())

describe('journey prototype route', () => {
  it('is available in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(SystemStoryboardPage().props.mode).toBe('journey')
  })
  it('is unavailable in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => SystemStoryboardPage()).toThrow('NOT_FOUND')
  })
})

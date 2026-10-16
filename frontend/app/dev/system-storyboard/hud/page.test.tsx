import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemHudStudioPage from './page'
import { HudPrototype } from '@/components/space/hud-prototype/HudPrototype'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/components/space/storyboard/SystemStoryboard', () => ({ SystemStoryboard: () => null }))
afterEach(() => vi.unstubAllEnvs())

describe('hud prototype route', () => {
  it('opens the selected HUD prototype in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect((await SystemHudStudioPage({ searchParams: Promise.resolve({}) })).type).toBe(HudPrototype)
  })
  it('is unavailable in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(SystemHudStudioPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND')
  })
})

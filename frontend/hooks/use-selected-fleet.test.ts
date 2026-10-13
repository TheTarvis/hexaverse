import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Fleet } from '@/lib/types/fleet'
import { useSelectedFleet } from './use-selected-fleet'
const fleet = (id: string, corporationId = 'corp') => ({ id, corporationId, own: true } as Fleet)
beforeEach(() => {
  const values = new Map<string, string>()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => values.get(k) ?? null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { values.set(k, v) })
})
it('shares selection between mounted views and restores it on remount', () => {
  const fleets = [fleet('a'), fleet('b')]
  const first = renderHook(() => useSelectedFleet(fleets))
  const second = renderHook(() => useSelectedFleet(fleets))
  act(() => first.result.current.select('b'))
  expect(second.result.current.fleet?.id).toBe('b')
  first.unmount(); second.unmount()
  expect(renderHook(() => useSelectedFleet(fleets)).result.current.fleet?.id).toBe('b')
})
it('falls back to transit fleets and isolates corporations and invalid ids', () => {
  const fleets = [fleet('a'), { ...fleet('b'), jump: { destSystemId: 'there' } } as Fleet]
  const { result, rerender } = renderHook(({ list }) => useSelectedFleet(list), { initialProps: { list: fleets } })
  act(() => result.current.select('b'))
  rerender({ list: [fleet('c', 'other')] })
  expect(result.current.fleet?.id).toBe('c')
  act(() => result.current.select('b'))
  expect(result.current.fleet?.id).toBe('c')
  rerender({ list: [fleets[1]] })
  expect(result.current.fleet?.id).toBe('b')
  rerender({ list: [fleets[0]] })
  expect(result.current.fleet?.id).toBe('a')
})
it('does not persist fallback from failed telemetry and tolerates blocked storage', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  const fleets = [fleet('x', 'blocked'), fleet('y', 'blocked')]
  const { result } = renderHook(() => useSelectedFleet(fleets))
  act(() => result.current.select('y'))
  expect(result.current.fleet?.id).toBe('y')
  const failed = renderHook(() => useSelectedFleet([fleets[0]], null, true))
  failed.unmount()
  expect(renderHook(() => useSelectedFleet(fleets)).result.current.fleet?.id).toBe('y')
})

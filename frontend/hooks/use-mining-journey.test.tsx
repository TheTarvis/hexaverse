import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useMiningJourney } from './use-mining-journey'
import { createWorldClock } from '@/lib/client-clock'
import type { Fleet, MiningOptions } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { SpaceBody } from '@/lib/types/system-space'

const service = vi.hoisted(() => ({ options: vi.fn(), mine: vi.fn(), running: vi.fn(), fleet: vi.fn(), action: vi.fn(), subscribe: vi.fn(), cancel: vi.fn() }))
vi.mock('@/lib/services', () => ({
  fleetService: { miningOptions: (...args: unknown[]) => service.options(...args), mine: (...args: unknown[]) => service.mine(...args), get: (...args: unknown[]) => service.fleet(...args) },
  actionService: { listRunning: (...args: unknown[]) => service.running(...args), get: (...args: unknown[]) => service.action(...args), subscribe: (...args: unknown[]) => service.subscribe(...args), cancel: (...args: unknown[]) => service.cancel(...args) },
}))
const fleet: Fleet = { id: 'fleet', own: true, corporationId: 'corp', systemId: 'system', attachedTo: 'belt#2', position: { X: 0, Y: 0, Z: 0 }, worldTime: 1000,
  state: { Mode: 1, Burn: null, Drift: null, Park: null }, roster: { ships: [{ class: 'seed' }], cargo: { fuel: 10 }, cargoCapacity: 50, freeHold: 40, miningRate: 0.02 } }
const target: SpaceBody = { id: 'belt', name: 'Belt', type: 'belt', space: { X: 0, Y: 0, Z: 0 }, size: 1, resources: [{ kind: 'metals', richness: 0.5 }] }
const prerequisites: MiningOptions = { eligible: true, featureId: 'belt', commitFeatureId: 'belt#2', freeHold: 40, miningRate: 0.02, minRunTons: 1, resources: [{ kind: 'metals', remainingTons: 30 }], worldTime: 1000 }
const action: GameAction = { id: 'mine', actor: 'fleet', scope: 'system', type: 'mine', status: 'running', committedAt: 1000, eta: 3000, worldTime: 1000, params: { featureId: 'belt', kind: 'metals', tons: 40 } }
let client: QueryClient
const accepted = vi.fn()
async function flush(ms = 5) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const clock = createWorldClock(() => Date.now())
  clock.anchor(1000, 1)
  return renderHook(({ worldTime }: { worldTime: number }) => useMiningJourney({ systemId: 'system', fleets: [fleet], features: [target], worldTime, clock, scale: 1,
    failed: false, loading: false, onFleet: vi.fn(), onAccepted: accepted }),
  { initialProps: { worldTime: 1000 }, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
async function review() {
  const hook = mount()
  act(() => hook.result.current.begin({ fleetId: 'fleet' }, 'fleet'))
  await flush()
  expect(hook.result.current.eligibleTargets).toEqual([target])
  act(() => hook.result.current.selectTarget('belt'))
  await flush()
  return hook
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); vi.clearAllMocks()
  for (const mock of Object.values(service)) mock.mockReset()
  service.options.mockResolvedValue(prerequisites)
  service.mine.mockResolvedValue({ actionId: 'mine', eta: 3000, worldTime: 1000 })
  service.running.mockResolvedValue([])
  service.fleet.mockResolvedValue(fleet)
  service.action.mockResolvedValue(action)
  service.subscribe.mockReturnValue(() => {})
})
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers() })

it('retains the same fleet/target draft through Back and reopening, with server-priced limits', async () => {
  const { result } = await review()
  expect(result.current.card?.quantity).toBe('40')
  act(() => result.current.card?.onQuantity('15'))
  act(() => result.current.back())
  act(() => result.current.back())
  expect(result.current.active).toBe(false)
  act(() => result.current.begin({ fleetId: 'fleet', targetId: 'belt' }, 'fleet'))
  expect(result.current.card?.quantity).toBe('15')
  expect(result.current.card?.fleet.roster?.miningRate).toBe(0.02)
  expect(service.mine).not.toHaveBeenCalled()
})

it('revalidates before committing, submits the attached belt member, and guards duplicate activation', async () => {
  const { result } = await review()
  act(() => { result.current.card?.onStart(); result.current.card?.onStart() })
  await flush(20)
  expect(service.mine).toHaveBeenCalledExactlyOnceWith('fleet', { featureId: 'belt#2', kind: 'metals', tons: 40 })
  expect(accepted).toHaveBeenCalledOnce()
  expect(result.current.card?.action?.id).toBe('mine')
  expect(result.current.card?.action?.eta).toBe(3000)
})

it('withdraws a stale amount when fresh free hold changes without losing the draft', async () => {
  const { result } = await review()
  service.options.mockResolvedValue({ ...prerequisites, freeHold: 10 })
  act(() => { void result.current.card?.onStart() })
  await flush(20)
  expect(service.mine).not.toHaveBeenCalled()
  expect(result.current.card?.quantity).toBe('40')
  expect(result.current.card?.error).toMatch(/limits changed/i)
  expect(result.current.card?.fleet.roster?.freeHold).toBe(10)
})

it('filters object-first fleet choice through authoritative busy/depleted options', async () => {
  service.options.mockResolvedValue({ ...prerequisites, eligible: false, resources: [] })
  const { result } = mount()
  act(() => result.current.begin({ targetId: 'belt' }, 'object'))
  await flush(20)
  expect(result.current.eligibleFleets).toEqual([])
  act(() => result.current.selectFleet('fleet'))
  expect(result.current.step).toBe('fleet')
  expect(service.mine).not.toHaveBeenCalled()
})

it('does not complete at ETA, keeps uncertainty on failed checks, and reads the exact result after fleet settlement', async () => {
  const { result, rerender } = await review()
  act(() => { void result.current.card?.onStart() })
  await flush(20)
  await flush(2400)
  rerender({ worldTime: 4000 })
  expect(result.current.card?.action?.status).toBe('running')
  service.fleet.mockRejectedValue(new Error('offline'))
  act(() => result.current.card?.onRetry())
  await flush(20)
  expect(result.current.card?.connectionUncertain).toBe(true)
  expect(result.current.card?.action?.status).toBe('running')
  let resolveFleet!: (fleet: Fleet) => void
  service.fleet.mockReturnValue(new Promise<Fleet>(resolve => { resolveFleet = resolve }))
  service.action.mockResolvedValue({ ...action, status: 'done', reasonCode: 'lodeDry', outcome: 'lode ran dry' })
  const previousReads = service.action.mock.calls.length
  act(() => result.current.card?.onRetry())
  await flush()
  expect(service.action).toHaveBeenCalledTimes(previousReads)
  await act(async () => resolveFleet(fleet))
  await flush(20)
  expect(result.current.card?.action?.status).toBe('done')
  expect(result.current.card?.action?.reasonCode).toBe('lodeDry')
  expect(result.current.card?.connectionUncertain).toBe(false)
})

it('accepts notification/reconnect nudges as reads and confirms cancellation through the action response', async () => {
  const { result } = await review()
  act(() => { void result.current.card?.onStart() })
  await flush(20)
  const [, notify] = service.subscribe.mock.calls[0]
  const before = service.action.mock.calls.length
  act(() => notify({ actionId: 'someone-else' }))
  await flush()
  expect(service.action).toHaveBeenCalledTimes(before)
  act(() => notify({ actionId: 'mine' }))
  await flush(20)
  expect(service.action.mock.calls.length).toBeGreaterThan(before)
  service.cancel.mockResolvedValue({ ...action, status: 'cancelled' })
  act(() => result.current.card?.onCancel?.())
  await flush(20)
  expect(service.cancel).toHaveBeenCalledWith('mine')
  expect(result.current.card?.action?.status).toBe('cancelled')
})

it('recovers an existing running action after a fresh entry without committing another run', async () => {
  service.running.mockResolvedValue([action])
  service.options.mockResolvedValue({ ...prerequisites, eligible: false, activeActionId: action.id })
  const { result } = mount()
  act(() => result.current.begin({ fleetId: 'fleet' }, 'fleet'))
  await flush(20)
  expect(result.current.step).toBe('review')
  expect(result.current.target?.id).toBe('belt')
  expect(result.current.card?.action?.id).toBe('mine')
  expect(service.mine).not.toHaveBeenCalled()
})

it('keeps a rejected commit draft and allows an explicit retry without duplicate acceptance', async () => {
  const { result } = await review()
  act(() => result.current.card?.onQuantity('12'))
  service.mine.mockRejectedValueOnce({ data: { error: 'mine: movement channel occupied' } })
  act(() => { void result.current.card?.onStart() })
  await flush(20)
  expect(result.current.card?.quantity).toBe('12')
  expect(result.current.card?.error).toMatch(/busy/i)
  expect(result.current.card?.pending).toBe(false)
  expect(accepted).not.toHaveBeenCalled()
  act(() => { void result.current.card?.onStart() })
  await flush(20)
  expect(service.mine).toHaveBeenCalledTimes(2)
  expect(accepted).toHaveBeenCalledOnce()
})

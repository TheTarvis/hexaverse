import React, { type ReactNode } from 'react'
import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { discoveryService } from '@/lib/services/discovery-service'
import { useSurvey, useSurveyOptions } from './use-discovery'

vi.mock('@/lib/services/discovery-service', () => ({ discoveryService: { surveyOptions: vi.fn(), survey: vi.fn(), name: vi.fn() } }))
const clients: QueryClient[] = []
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 } } })
  clients.push(client)
  return function SurveyProvider({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}
const response = { range: 20, durationMs: 10_000, worldTime: 1000, scale: 1, sensorBusy: false, inTransit: false, survey: null, targets: [] }
async function tick(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) }) }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', 'true')
  focusManager.setFocused(true)
  vi.mocked(discoveryService.surveyOptions).mockResolvedValue(response)
})
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear())
  focusManager.setFocused(undefined); vi.unstubAllEnvs(); vi.useRealTimers()
})

it('reduces preview reads while preserving the ordinary one-second survey cadence', async () => {
  const preview = renderHook(() => useSurveyOptions('fleet-one'), { wrapper: wrapper() })
  await tick(1)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(1)
  await tick(9998)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(1)
  await tick(2)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(2)
  preview.unmount(); vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', 'false')
  renderHook(() => useSurveyOptions('fleet-two'), { wrapper: wrapper() })
  await tick(1001)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(2)
})

it('does not poll a background page, and refreshes immediately on returning to the preview', async () => {
  renderHook(() => useSurveyOptions('fleet-one'), { wrapper: wrapper() })
  await tick(1)
  act(() => focusManager.setFocused(false))
  await tick(30_000)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(1)
  act(() => focusManager.setFocused(true))
  await tick(1)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(2)
})

it('refreshes survey facts immediately after commit instead of waiting for the slower interval', async () => {
  const { result } = renderHook(() => ({ options: useSurveyOptions('fleet-one'), commit: useSurvey() }), { wrapper: wrapper() })
  await tick(1)
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(1)
  await act(async () => { await result.current.commit.mutateAsync({ fleetId: 'fleet-one', bodyId: 'body-one' }) })
  await tick(1)
  expect(discoveryService.survey).toHaveBeenCalledWith('fleet-one', 'body-one')
  expect(discoveryService.surveyOptions).toHaveBeenCalledTimes(2)
})

it('does not request survey options without a command fleet', async () => {
  renderHook(() => useSurveyOptions(null), { wrapper: wrapper() })
  await tick(30_000)
  expect(discoveryService.surveyOptions).not.toHaveBeenCalled()
})

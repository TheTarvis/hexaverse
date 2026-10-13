import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { deferred, rendererHarness, installPresentationEnvironment, frames } from '@/components/galaxy/renderer-test-harness'

const seam = vi.hoisted(() => ({ factory: vi.fn() }))
vi.mock('@/components/render-guard/renderer-candidate', () => ({ createRendererCandidate: seam.factory }))
import { SpaceView } from './SpaceView'
import { defaultOrbit, generateSystem } from './sim'

function mount() {
  const system = generateSystem(1)
  return render(<SpaceView system={system} clock={{ current: { t: 0, scale: 1, paused: true } }} ship={{ mode: 'idle', at: defaultOrbit(system, 'p1') }} preview={null} selected={null} onPick={vi.fn()} onArrive={vi.fn()} />)
}

describe('SpaceView shared renderer consumer', () => {
  let gpu: ReturnType<typeof rendererHarness>
  beforeEach(() => {
    installPresentationEnvironment()
    gpu = rendererHarness()
    seam.factory.mockImplementation(gpu.factory)
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it.each(['webgpu', 'webgl2'] as const)('Scenario: Every owner presents through WebGPU — %s first submission gates readiness', async (backend) => {
    const init = deferred(), frame = deferred()
    gpu.plans.push({ init, frame, backend })
    const view = mount()
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    expect(gpu.candidates[0].render).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-renderer-ready="true"]')).toBeNull()
    await act(async () => init.resolve())
    await frames()
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-renderer-ready="true"]')).toBeNull()
    await act(async () => frame.resolve())
    await frames()
    const canvas = view.container.querySelector('canvas')!
    expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
    expect(canvas).toHaveAttribute('data-renderer-backend', backend)
    view.unmount()
    expect(gpu.candidates[0].dispose).toHaveBeenCalled()
    const draws = gpu.candidates[0].render.mock.calls.length
    await frames()
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(draws)
  })

  it('Scenario: Both backends fail locally — spike offers retry without exposing diagnostics', async () => {
    const first = deferred(), second = deferred()
    gpu.plans.push({ init: first }, { init: second })
    mount()
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    await act(async () => first.reject(new Error('private adapter diagnostic')))
    await frames()
    expect(gpu.candidates).toHaveLength(2)
    expect(gpu.candidates[1].forceWebGL).toBe(true)
    expect(gpu.candidates[1].canvas).not.toBe(gpu.candidates[0].canvas)
    await act(async () => second.reject(new Error('private adapter diagnostic')))
    await frames()
    expect(screen.queryByText(/private adapter diagnostic/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await frames()
    expect(gpu.candidates).toHaveLength(3)
    expect(gpu.candidates[2].canvas).toHaveAttribute('data-renderer-ready', 'true')
  })

  it('Scenario: Post-readiness frame failure is local — stopped drawing resumes only by retry', async () => {
    mount()
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    gpu.candidates[0].render.mockImplementationOnce(() => Promise.reject(new Error('private draw diagnostic')))
    await frames()
    const draws = gpu.candidates[0].render.mock.calls.length
    await frames(20)
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(draws)
    expect(gpu.candidates).toHaveLength(1)
    expect(screen.queryByText(/private draw diagnostic/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await frames()
    expect(gpu.candidates).toHaveLength(2)
    expect(gpu.candidates[1].canvas).toHaveAttribute('data-renderer-ready', 'true')
  })
})

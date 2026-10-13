import { expect, it } from 'vitest'
import { deferred, rendererHarness } from './renderer-test-harness'

it('test candidate preserves deferred init and detaches loss listener', async () => {
  const harness = rendererHarness()
  const init = deferred()
  harness.plans.push({ init })
  const candidate = harness.factory({ canvas: document.createElement('canvas'), forceWebGL: false })
  expect(candidate.init()).toBe(init.promise)
  init.resolve()
  await candidate.init()
  let count = 0
  const off = candidate.onLoss(() => { count++ })
  candidate.lose()
  off()
  candidate.lose()
  expect(count).toBe(1)
})

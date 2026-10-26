import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LocalTuningContext, type LocalTuning } from './LocalTuningContext'
import { TuningCard } from './TuningCard'
import { TunableHudCard } from './TunableHudCard'
import { HudWorkspace } from '@/components/hud/HudWorkspace'

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
function fixture(): LocalTuning {
  const snapshot = { fields: [
    { key: 'hulls.holdCapacity', label: 'Seed hull hold', group: 'Ships', unit: 'tons', default: 200, min: 0, max: 1000 },
    { key: 'orbits.baseSeconds', label: 'Orbit period', group: 'Orbits', unit: 'seconds', default: 40, min: 1, max: 1000, regenerate: true },
  ], profile: { version: 1, values: { 'hulls.holdCapacity': 200, 'orbits.baseSeconds': 80 } }, active: { 'hulls.holdCapacity': 200, 'orbits.baseSeconds': 40 }, restartPending: true }
  return { snapshot, pending: false, apply: vi.fn().mockResolvedValue(snapshot), stage: vi.fn().mockResolvedValue(snapshot), regenerate: vi.fn().mockResolvedValue(snapshot) }
}
it('applies a complete profile from a contextual section and preserves unrelated values', async () => {
  const tuning = fixture()
  render(<LocalTuningContext.Provider value={tuning}><TuningCard groups={['Ships']} /></LocalTuningContext.Provider>)
  fireEvent.change(screen.getByLabelText('Seed hull hold'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  await waitFor(() => expect(tuning.apply).toHaveBeenCalledWith({ version: 1, values: { 'hulls.holdCapacity': 100, 'orbits.baseSeconds': 80 } }))
  expect(screen.queryByRole('button', { name: 'Export JSON' })).toBeNull()
})
it('preserves the original task draft and hides task actions while tuning', () => {
  render(<LocalTuningContext.Provider value={fixture()}><TunableHudCard groups={['Ships']} title="Fleet" footer={<button>Start trip</button>}><input aria-label="Task draft" /></TunableHudCard></LocalTuningContext.Provider>)
  const draft = screen.getByLabelText('Task draft')
  fireEvent.change(draft, { target: { value: 'Borealis' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tune' }))
  expect(draft).not.toBeVisible()
  expect(screen.queryByRole('button', { name: 'Start trip' })).toBeNull()
  expect(screen.getByLabelText('Seed hull hold')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Back to card' }))
  expect(screen.getByLabelText('Task draft')).toBe(draft)
  expect(draft).toBeVisible()
  expect(draft).toHaveValue('Borealis')
  expect(screen.getByRole('button', { name: 'Start trip' })).toBeVisible()
})
it('exposes local Tuning in Settings and stages JSON without applying it', async () => {
  const tuning = fixture()
  render(<LocalTuningContext.Provider value={tuning}><HudWorkspace corporationId="local" panels={[]} /></LocalTuningContext.Provider>)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Tuning' }))
  const input = screen.getByLabelText('Import tuning JSON')
  const profile = { version: 1, values: { 'hulls.holdCapacity': 50, 'orbits.baseSeconds': 40 } }
  fireEvent.change(input, { target: { files: [{ text: async () => JSON.stringify(profile) }] } })
  await waitFor(() => expect(tuning.stage).toHaveBeenCalledWith(profile))
  expect(tuning.apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore all tuning defaults' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  await waitFor(() => expect(tuning.apply).toHaveBeenCalledWith({ version: 1, values: { 'hulls.holdCapacity': 200, 'orbits.baseSeconds': 40 } }))
})

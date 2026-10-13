import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HudColumn, HudHeading, HudPanel, HudRoot } from './GameHud'

it('preserves accessible content, panel semantics and caller-owned interactions', () => {
  const select = vi.fn()
  render(<HudRoot><HudColumn side="left" paired><HudPanel as="aside" aria-label="Fleet commands">
    <HudHeading eyebrow="Command network" title="Fleets" detail="Two connected" />
    <button data-testid="select-fleet" onClick={select}>Select fleet</button>
    <p role="alert">Telemetry unavailable</p>
  </HudPanel></HudColumn></HudRoot>)
  expect(screen.getByRole('complementary', { name: 'Fleet commands' })).toContainElement(screen.getByRole('heading', { name: 'Fleets' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Telemetry unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Select fleet' }))
  expect(select).toHaveBeenCalledOnce()
})

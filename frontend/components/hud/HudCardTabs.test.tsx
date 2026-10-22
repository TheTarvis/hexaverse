import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HudCardTabs } from './HudCardTabs'

afterEach(cleanup)

function Example({ onCommand = () => {} }: { onCommand?: () => void }) {
  const [tab, setTab] = useState('actions')
  return <HudCardTabs label="Fleet information" value={tab} onChange={setTab} tabs={[
    { id: 'cargo', label: 'Cargo', content: 'Fuel 24 t' },
    { id: 'actions', label: 'Actions', content: <button onClick={onCommand}>Travel</button> },
    { id: 'stats', label: 'Ship stats', content: '3 generalists' },
  ]} />
}

it('supports direct tabs and roving keyboard focus with linked panels', () => {
  render(<Example />)
  const actions = screen.getByRole('tab', { name: 'Actions' })
  expect(actions).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', actions.id)
  fireEvent.keyDown(actions, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Ship stats' })).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveTextContent('3 generalists')
  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  expect(screen.getByRole('tab', { name: 'Cargo' })).toHaveFocus()
  fireEvent.click(actions)
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Travel')
})

it('swipes horizontally without activating the command under the finger', () => {
  const onCommand = vi.fn()
  render(<Example onCommand={onCommand} />)
  const command = screen.getByRole('button', { name: 'Travel' })
  fireEvent.touchStart(command, { touches: [{ clientX: 220, clientY: 50 }] })
  fireEvent.touchEnd(command, { touches: [], changedTouches: [{ clientX: 80, clientY: 55 }] })
  fireEvent.click(command)
  expect(onCommand).not.toHaveBeenCalled()
  expect(screen.getByRole('tab', { name: 'Ship stats' })).toHaveAttribute('aria-selected', 'true')
})

it('leaves vertical scroll and multi-touch alone', () => {
  render(<Example />)
  const panel = screen.getByRole('tabpanel')
  fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 50 }] })
  fireEvent.touchEnd(panel, { touches: [], changedTouches: [{ clientX: 120, clientY: 220 }] })
  expect(screen.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 50 }] })
  fireEvent.touchMove(panel, { touches: [{ clientX: 150, clientY: 50 }, { clientX: 180, clientY: 50 }] })
  fireEvent.touchEnd(panel, { touches: [], changedTouches: [{ clientX: 50, clientY: 50 }] })
  expect(screen.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true')
})

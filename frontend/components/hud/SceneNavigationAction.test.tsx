import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { HudWorkspace } from './HudWorkspace'
import { SceneNavigationAction } from './SceneNavigationAction'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
const panels=[{id:'objects' as const,label:'Objects',children:<input aria-label="Search draft" defaultValue="" />}]
it('groups a single visible leave action with the phone navigation and preserves drafts through settings', () => {
  render(<HudWorkspace corporationId="one" panels={panels} navigationAction={<SceneNavigationAction destination="galaxy" />} />)
  const navigation=screen.getByRole('navigation',{name:'HUD panels'})
  expect(within(navigation).getByRole('link',{name:'Leave system for galaxy'})).toHaveAttribute('href','/')
  fireEvent.click(within(navigation).getByRole('button',{name:'Objects'}))
  fireEvent.change(screen.getByLabelText('Search draft'),{target:{value:'Peregrine'}})
  fireEvent.click(screen.getByRole('button',{name:'Arrange HUD'}))
  expect(screen.getAllByRole('navigation',{name:'HUD panels'})).toHaveLength(1)
  expect(screen.getAllByRole('link',{name:'Leave system for galaxy'})).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Objects'}))
  expect(screen.getByLabelText('Search draft')).toHaveValue('Peregrine')
})
it('shows enter only when the adapter supplies a disclosed selection and delegates explicitly', () => {
  const enter=vi.fn()
  const view=render(<HudWorkspace corporationId="one" panels={panels} />)
  expect(screen.queryByRole('button',{name:/Enter selected system/})).toBeNull()
  view.rerender(<HudWorkspace corporationId="one" panels={panels} navigationAction={<SceneNavigationAction destination="system" systemName="Axion" onEnter={enter} />} />)
  fireEvent.click(screen.getByRole('button',{name:'Enter selected system: Axion'}))
  expect(enter).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('link',{name:'Leave system for galaxy'})).toBeNull()
})

it('carries the current system in the galaxy navigation link', () => {
  render(<SceneNavigationAction destination="galaxy" systemId="sys/one two" />)
  expect(screen.getByRole('link', { name: 'Leave system for galaxy' })).toHaveAttribute('href', '/?system=sys%2Fone%20two')
})

import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { usePhoneSheet } from './use-phone-sheet'

function Sheet({ open, name, initialFocus = 'close' }: { open: boolean; name: string; initialFocus?: 'root' | 'close' }) {
  const ref = useRef<HTMLDivElement>(null)
  usePhoneSheet(open, ref, name, initialFocus)
  return <div ref={ref} tabIndex={-1} data-testid={name}><button data-mobile-close>{name}</button></div>
}
it('hands isolation to the remaining sheet when an older sheet closes after its replacement opens', () => {
  function Host({ first, second }: { first: boolean; second: boolean }) {
    return <><button>Map</button><Sheet open={first} name="First" /><Sheet open={second} name="Second" /></>
  }
  const view = render(<Host first second={false} />)
  view.rerender(<Host first second />)
  expect(screen.getByText('Second').closest('[inert]')).toBeNull()
  view.rerender(<Host first={false} second />)
  expect(screen.getByText('Map')).toHaveAttribute('inert')
  expect(screen.getByText('Second').closest('[inert]')).toBeNull()
  view.rerender(<Host first={false} second={false} />)
  expect(screen.getByText('Map')).not.toHaveAttribute('inert')
  expect(screen.getByText('First').closest('[inert]')).toBeNull()
  expect(screen.getByText('Second').closest('[inert]')).toBeNull()
})

it('can focus a noninteractive dialog root without selecting its dismiss control', () => {
  const view = render(<Sheet open name="Recovery" initialFocus="root" />)
  expect(screen.getByTestId('Recovery')).toHaveFocus()
  expect(screen.getByText('Recovery')).not.toHaveFocus()
  view.unmount()
  expect(document.querySelector('[inert]')).toBeNull()
})

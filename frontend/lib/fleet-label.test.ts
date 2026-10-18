import { expect, it } from 'vitest'
import { fleetLabel } from './fleet-label'

it('prefers a served name, with an explicit fallback for legacy or blank names', () => {
  expect(fleetLabel({ id: 'fleet_abcdef12', name: 'Peregrine' })).toBe('Peregrine')
  expect(fleetLabel({ id: 'fleet_abcdef12', name: '  遠星  ' })).toBe('遠星')
  expect(fleetLabel({ id: 'fleet_abcdef12' })).toBe('Fleet abcdef12')
  expect(fleetLabel({ id: 'fleet_abcdef12', name: '   ' })).toBe('Fleet abcdef12')
})

import { expect, it } from 'vitest'
import { formatHudCardTitle, type HudCardTitle } from './hud-card-title'

it.each<[HudCardTitle, string]>([
  [{ fleet: 'Peregrine', action: 'mining', object: 'Nereid outer belt' }, 'Peregrine · Mining at Nereid outer belt'],
  [{ fleet: 'Peregrine', action: 'travel', object: 'Solace Station' }, 'Peregrine · Travel to Solace Station'],
  [{ action: 'mining', object: 'Nereid outer belt' }, 'Mining at Nereid outer belt'],
  [{ action: 'travel', object: 'Solace Station' }, 'Travel to Solace Station'],
  [{ fleet: '  ', action: 'travel', object: ' ' }, 'Travel'],
  [{ fleet: 'Peregrine', action: 'travel' }, 'Peregrine · Travel'],
  ['Objects', 'Objects'],
  [{ search: 'objects', scope: 'Solace' }, 'Objects · Solace'],
  [{ search: 'travel-destination', fleet: 'Peregrine', scope: 'Solace' }, 'Peregrine · Choose destination · Solace'],
  [{ search: 'mining-target', fleet: 'Peregrine', scope: 'Solace' }, 'Peregrine · Choose mining target · Solace'],
  [{ search: 'command-fleet', object: 'Solace Station', scope: 'Solace' }, 'Choose command fleet for Solace Station · Solace'],
  [{ search: 'objects', scope: ' ', fleet: ' ', object: ' ' }, 'Objects'],
])('formats contextual and ordinary titles: %j', (input, expected) => {
  expect(formatHudCardTitle(input)).toBe(expected)
})

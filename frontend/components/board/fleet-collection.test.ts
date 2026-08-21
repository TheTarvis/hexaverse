import { describe, it, expect, vi } from 'vitest'
import { diffIds, reconcileFleets } from './fleet-collection'

describe('diffIds', () => {
  it('splits ids into added, removed, kept', () => {
    const d = diffIds(['a', 'b', 'c'], ['b', 'c', 'd'])
    expect(d.added).toEqual(['d'])
    expect(d.removed).toEqual(['a'])
    expect(d.kept.sort()).toEqual(['b', 'c'])
  })

  it('handles the empty-to-populated and populated-to-empty edges', () => {
    expect(diffIds([], ['a']).added).toEqual(['a'])
    expect(diffIds(['a'], []).removed).toEqual(['a'])
    expect(diffIds([], [])).toEqual({ added: [], removed: [], kept: [] })
  })
})

// `### Requirement: Foreign Fleets Render as Contact Marks Only`, scenario
// "A fleet absent from the latest read is removed from the board": removal
// disposes on the SAME roster update — never deferred to unmount.
describe('reconcileFleets', () => {
  it('disposes exactly once per removed id and never for kept ids', () => {
    const dispose = vi.fn()
    const current = new Map([
      ['a', 'visual-a'],
      ['b', 'visual-b'],
      ['c', 'visual-c'],
    ])
    reconcileFleets(current, ['b', 'c'], { create: (id) => `visual-${id}`, dispose })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith('visual-a', 'a')
    expect(current.has('a')).toBe(false)
    expect(current.get('b')).toBe('visual-b')
  })

  it('creates every added id through the factory', () => {
    const create = vi.fn((id: string) => `visual-${id}`)
    const current = new Map<string, string>()
    reconcileFleets(current, ['x', 'y'], { create, dispose: () => {} })
    expect(create).toHaveBeenCalledTimes(2)
    expect(current.get('x')).toBe('visual-x')
  })

  it('a foreign fleet dropping out of sensor coverage leaves no stale contact', () => {
    // The board asserting a contact the requester no longer senses is exactly
    // the claim fog exists to withhold — eviction happens on this update.
    const dispose = vi.fn()
    const current = new Map([['foreign-1', 'visual']])
    const diff = reconcileFleets(current, [], { create: () => 'x', dispose })
    expect(diff.removed).toEqual(['foreign-1'])
    expect(current.size).toBe(0)
    expect(dispose).toHaveBeenCalledOnce()
  })
})

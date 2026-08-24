import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BoardTuning, DEFAULT_LOOK, readStoredLook } from './BoardTuning'
import { BOARD_TILT_DEG } from './use-board-projection'
import { TUNED_LOOK } from './webgl/contract'

const STORAGE_KEY = 'hexaverse.boardLook'

// vitest.setup.ts replaces window.localStorage with vi.fn() stubs — storage is
// scripted per test via getItem's mock, and writes are asserted on setItem.
const storage = window.localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.getItem.mockReturnValue(null)
})

describe('BoardTuning', () => {
  it('collapses to the toggle pill and opens to the panel', () => {
    render(<BoardTuning onChange={vi.fn()} />)
    expect(screen.queryByTestId('board-tuning-panel')).toBeNull()

    fireEvent.click(screen.getByTestId('board-tuning-toggle'))
    expect(screen.getByTestId('board-tuning-panel')).toBeTruthy()

    fireEvent.click(screen.getByTestId('board-tuning-close'))
    expect(screen.queryByTestId('board-tuning-panel')).toBeNull()
  })

  it('opens at the tuned production constants', () => {
    render(<BoardTuning onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    expect((screen.getByTestId('board-tuning-bloom') as HTMLInputElement).value).toBe(String(TUNED_LOOK.bloom))
    expect((screen.getByTestId('board-tuning-instrument') as HTMLInputElement).value).toBe(
      String(TUNED_LOOK.instrument),
    )
    expect((screen.getByTestId('board-tuning-tilt') as HTMLInputElement).value).toBe(String(BOARD_TILT_DEG))
  })

  it('emits the full look on a slider change and persists it', () => {
    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    fireEvent.change(screen.getByTestId('board-tuning-bloom'), { target: { value: '0.8' } })

    const expected = { ...DEFAULT_LOOK, bloom: 0.8 }
    expect(onChange).toHaveBeenLastCalledWith(expected)
    expect(storage.setItem).toHaveBeenLastCalledWith(STORAGE_KEY, JSON.stringify(expected))
  })

  it('toggles the starfield off and back on', () => {
    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    fireEvent.click(screen.getByTestId('board-tuning-starfield'))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starfield: false })

    fireEvent.click(screen.getByTestId('board-tuning-starfield'))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starfield: true })
  })

  it('adjusts the star and body scene knobs', () => {
    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    fireEvent.change(screen.getByTestId('board-tuning-star-scale'), { target: { value: '1.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starScale: 1.5 })

    fireEvent.change(screen.getByTestId('board-tuning-body-scale'), { target: { value: '2' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starScale: 1.5, bodyScale: 2 })
  })

  it('overrides the star colour and returns it to auto', () => {
    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    // No override → no auto button offered.
    expect(screen.queryByTestId('board-tuning-star-color-auto')).toBeNull()

    fireEvent.change(screen.getByTestId('board-tuning-star-color'), { target: { value: '#88ccff' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starTint: '#88ccff' })

    fireEvent.click(screen.getByTestId('board-tuning-star-color-auto'))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, starTint: null })
    expect(screen.queryByTestId('board-tuning-star-color-auto')).toBeNull()
  })

  it('re-applies a stored look on mount', () => {
    const stored = { ...DEFAULT_LOOK, instrument: 0.6, tiltDeg: 22 }
    storage.getItem.mockReturnValue(JSON.stringify(stored))

    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith(stored)
  })

  it('reset clears the override and the store', () => {
    storage.getItem.mockReturnValue(JSON.stringify({ ...DEFAULT_LOOK, bloom: 1.5 }))
    const onChange = vi.fn()
    render(<BoardTuning onChange={onChange} />)
    fireEvent.click(screen.getByTestId('board-tuning-toggle'))

    fireEvent.click(screen.getByTestId('board-tuning-reset'))

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })
})

describe('readStoredLook', () => {
  it('returns null with nothing stored', () => {
    expect(readStoredLook()).toBeNull()
  })

  it('fills missing or mistyped fields from the defaults', () => {
    storage.getItem.mockReturnValue(JSON.stringify({ bloom: 0.9, tiltDeg: 'sideways', starTint: 'not-a-hex' }))
    expect(readStoredLook()).toEqual({ ...DEFAULT_LOOK, bloom: 0.9 })
  })

  it('keeps a stored star tint only when it is a well-formed hex', () => {
    storage.getItem.mockReturnValue(JSON.stringify({ starTint: '#88ccff' }))
    expect(readStoredLook()).toEqual({ ...DEFAULT_LOOK, starTint: '#88ccff' })
  })

  it('survives corrupt JSON', () => {
    storage.getItem.mockReturnValue('{not json')
    expect(readStoredLook()).toBeNull()
  })
})

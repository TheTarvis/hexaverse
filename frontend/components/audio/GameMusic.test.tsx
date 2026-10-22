import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GameMusicProvider } from './GameMusicProvider'
import { GameMusicControls } from './GameMusicControls'
import { AppMusicProvider } from './AppMusicProvider'

const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))
const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  storage.set('hexaverse:music:v1', JSON.stringify({ musicOn: false }))
  vi.mocked(localStorage.getItem).mockImplementation(key => storage.get(key) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { storage.set(key, value) })
  route.pathname = '/'
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function audio() { return screen.getByTestId('game-music-audio') as HTMLAudioElement }

it('restores saved off without a source, then plays the selected track and persists volume and choice', async () => {
  localStorage.setItem('hexaverse:music:v1', JSON.stringify({ trackId: 'aurora', volume: 0.2, musicOn: false }))
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  expect(audio()).not.toHaveAttribute('src')
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Track')).toHaveValue('aurora')
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/aurora.mp3')
  expect(audio().volume).toBe(0.2)
  fireEvent.change(screen.getByLabelText('Music volume'), { target: { value: '0.5' } })
  expect(audio().volume).toBe(0.5)
  fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'hiraeth' } })
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/hiraeth.mp3')
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!)).toEqual({ trackId: 'hiraeth', volume: 0.5, musicOn: true, playInBackground: false })
  fireEvent.click(screen.getByRole('button', { name: 'Pause music' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play music' })).toBeEnabled())
})

it('wraps the playlist after the final track and supports previous/next', () => {
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'signal-to-noise' } })
  fireEvent.ended(audio())
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/machina.mp3')
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByLabelText('Track')).toHaveValue('signal-to-noise')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByLabelText('Track')).toHaveValue('machina')
})

it('retains one player and position through settings remount and game-route navigation, then pauses outside the game', () => {
  const view = render(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  const element = audio()
  element.currentTime = 37
  view.rerender(<AppMusicProvider><p>Settings closed</p></AppMusicProvider>)
  route.pathname = '/systems/serais'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(audio()).toBe(element)
  expect(audio().currentTime).toBe(37)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  route.pathname = '/login'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(screen.getByRole('button', { name: 'Play music' })).toBeDisabled()
})

it('pauses hidden tabs and releases its media source on unmount', () => {
  const view = render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  const element = audio()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByRole('button', { name: 'Play music' })).toBeEnabled()
  view.unmount()
  expect(element).not.toHaveAttribute('src')
})

it('uses default-on with quiet volume for corrupt preferences and works with blocked storage', () => {
  localStorage.setItem('hexaverse:music:v1', '{broken')
  vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('Blocked storage') })
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  expect(screen.getByLabelText('Music volume')).toHaveValue('0.35')
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/machina.mp3')
})

it('autoplays for a first visit and for preferences saved before the on/off field existed', () => {
  storage.clear()
  const view = render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Music enabled')).toBeChecked()
  view.unmount()
  storage.set('hexaverse:music:v1', JSON.stringify({ trackId: 'aurora', volume: 0.2 }))
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/aurora.mp3')
  expect(audio().volume).toBe(0.2)
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
})

it('keeps an explicit pause off after reload and unrelated interaction or volume changes', () => {
  const view = render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pause music' }))
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(false)
  view.unmount()
  vi.mocked(HTMLMediaElement.prototype.play).mockClear()
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.click(document.body)
  fireEvent.change(screen.getByLabelText('Music volume'), { target: { value: '0.1' } })
  expect(screen.getByLabelText('Music enabled')).not.toBeChecked()
  expect(audio()).not.toHaveAttribute('src')
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(false)
})

it('retries browser-blocked autoplay after a game interaction without saving off', async () => {
  storage.clear()
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'))
  render(<GameMusicProvider><GameMusicControls /><button>Explore</button></GameMusicProvider>)
  await screen.findByText('Music will start after your first game interaction, or press Play.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  expect(screen.queryByText('Music will start after your first game interaction, or press Play.')).not.toBeInTheDocument()
})

it('can switch off blocked autoplay before the first playable interaction', async () => {
  storage.clear()
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'))
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  await screen.findByText('Music will start after your first game interaction, or press Play.')
  fireEvent.click(screen.getByLabelText('Music enabled'))
  fireEvent.click(document.body)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Music enabled')).not.toBeChecked()
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(false)
})

it('resumes after temporary tab or route suspension while preserving enabled intent', () => {
  storage.clear()
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const view = render(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  hidden.mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByLabelText('Music enabled')).toBeChecked()
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(true)
  hidden.mockReturnValue(false)
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  route.pathname = '/login'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  route.pathname = '/'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).musicOn).toBe(true)
})

it('ignores a cancelled play rejection after changing tracks, and offers retry for a real rejection', async () => {
  let rejectFirst!: (error: Error) => void
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject }))
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await act(async () => { rejectFirst(new Error('Interrupted by changing source')) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked'))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Press Play to retry')
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps playing and advances tracks while hidden when background music is enabled', () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  render(<GameMusicProvider><GameMusicControls /></GameMusicProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
  fireEvent.click(screen.getByLabelText('Play music in background'))
  const element = audio()
  element.currentTime = 37
  vi.mocked(HTMLMediaElement.prototype.pause).mockClear()
  hidden.mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
  expect(element.currentTime).toBe(37)
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  fireEvent.ended(element)
  expect(audio()).toHaveAttribute('src', '/audio/ambient-round-03/aurora.mp3')
  expect(JSON.parse(localStorage.getItem('hexaverse:music:v1')!).playInBackground).toBe(true)
  fireEvent.click(screen.getByLabelText('Play music in background'))
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  hidden.mockReturnValue(false)
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
})

it('restores background playback on a hidden load and respects explicit pause and game routes', () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  storage.set('hexaverse:music:v1', JSON.stringify({ musicOn: true, playInBackground: true }))
  const view = render(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(screen.getByLabelText('Play music in background')).toBeChecked()
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  route.pathname = '/login'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(screen.getByRole('button', { name: 'Play music' })).toBeDisabled()
  route.pathname = '/'
  view.rerender(<AppMusicProvider><GameMusicControls /></AppMusicProvider>)
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Pause music' }))
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByLabelText('Music enabled')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Play music' })).toBeEnabled()
})

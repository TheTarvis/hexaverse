'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import sources from '../../public/audio/ambient-round-03/sources.json'

export const GAME_MUSIC_TRACKS = sources.map(({ id, title, artist, file, source }) => ({
  id, title, artist, source, url: `/audio/ambient-round-03/${file}`,
}))
const STORAGE_KEY = 'hexaverse:music:v1'

interface GameMusic {
  track: typeof GAME_MUSIC_TRACKS[number]
  playing: boolean
  musicOn: boolean
  waitingForInteraction: boolean
  volume: number
  ready: boolean
  error: string
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
  select: (id: string) => void
  setVolume: (volume: number) => void
}

const MusicContext = createContext<GameMusic | null>(null)
export function useGameMusic() { return useContext(MusicContext) }

/** One persistent player. Saved user intent is separate from temporary suspension. */
export function GameMusicProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const indexRef = useRef(0)
  const volumeRef = useRef(0.35)
  const requestRef = useRef(0)
  const musicOnRef = useRef(true)
  const blockedRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [volume, updateVolume] = useState(0.35)
  const [playing, setPlaying] = useState(false)
  const [musicOn, setMusicOn] = useState(true)
  const [waitingForInteraction, setWaitingForInteraction] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trackId: GAME_MUSIC_TRACKS[indexRef.current].id, volume: volumeRef.current, musicOn: musicOnRef.current }))
    } catch { /* Music remains usable when storage is unavailable. */ }
  }, [])

  const suspend = useCallback(() => {
    requestRef.current++
    blockedRef.current = false
    setWaitingForInteraction(false)
    if (audio.current?.hasAttribute('src')) audio.current.pause()
    setPlaying(false)
  }, [])

  const pause = useCallback(() => {
    musicOnRef.current = false
    setMusicOn(false)
    persist()
    suspend()
  }, [persist, suspend])

  useEffect(() => {
    const element = audio.current
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved && typeof saved === 'object') {
        const preferences = saved as Record<string, unknown>
        if (typeof preferences.musicOn === 'boolean') {
          musicOnRef.current = preferences.musicOn
          setMusicOn(preferences.musicOn)
        }
        const savedIndex = GAME_MUSIC_TRACKS.findIndex(track => track.id === preferences.trackId)
        if (savedIndex >= 0) { indexRef.current = savedIndex; setIndex(savedIndex) }
        if (typeof preferences.volume === 'number' && Number.isFinite(preferences.volume) && preferences.volume >= 0 && preferences.volume <= 1) {
          volumeRef.current = preferences.volume
          updateVolume(preferences.volume)
        }
      }
    } catch { /* Invalid preferences use the default-on setting and quiet volume. */ }
    if (element) element.volume = volumeRef.current
    setReady(true)
    return () => {
      requestRef.current++
      if (element?.hasAttribute('src')) {
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
    }
  }, [])

  const start = useCallback((next: number, automatic = false) => {
    const element = audio.current
    if (!element || !enabled || !ready || document.hidden || automatic && !musicOnRef.current) return
    if (!automatic) { musicOnRef.current = true; setMusicOn(true) }
    blockedRef.current = false
    setWaitingForInteraction(false)
    const selected = (next + GAME_MUSIC_TRACKS.length) % GAME_MUSIC_TRACKS.length
    const request = ++requestRef.current
    const url = GAME_MUSIC_TRACKS[selected].url
    indexRef.current = selected
    setIndex(selected)
    setError('')
    if (element.getAttribute('src') !== url) {
      element.src = url
      element.load()
    }
    element.volume = volumeRef.current
    persist()
    void element.play().catch((failure: unknown) => {
      if (request !== requestRef.current) return
      setPlaying(false)
      if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'NotAllowedError') {
        blockedRef.current = true
        setWaitingForInteraction(true)
        return
      }
      setError('Music could not start. Press Play to retry, or try the next track.')
    })
  }, [enabled, ready, persist])

  useEffect(() => {
    if (!enabled || !ready) { suspend(); return }
    const resume = () => { if (!document.hidden && musicOnRef.current) start(indexRef.current, true) }
    const unlock = (event: Event) => {
      // Music controls own their explicit Play/Pause actions, including turning
      // music off before the browser has allowed the first playback.
      if (event.target instanceof Element && event.target.closest('[data-music-controls]')) return
      if (blockedRef.current) resume()
    }
    const onVisibility = () => { if (document.hidden) suspend(); else resume() }
    resume()
    document.addEventListener('click', unlock, true)
    document.addEventListener('keydown', unlock, true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('click', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, ready, start, suspend])

  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return
    const next = Math.max(0, Math.min(1, value))
    volumeRef.current = next
    updateVolume(next)
    if (audio.current) audio.current.volume = next
    persist()
  }, [persist])

  return <MusicContext.Provider value={{
    track: GAME_MUSIC_TRACKS[index], playing, musicOn, waitingForInteraction, volume, ready: ready && enabled, error,
    play: () => start(indexRef.current), pause,
    next: () => start(indexRef.current + 1), previous: () => start(indexRef.current - 1),
    select: id => {
      const selected = GAME_MUSIC_TRACKS.findIndex(track => track.id === id)
      if (selected >= 0) start(selected)
    },
    setVolume,
  }}>
    <audio ref={audio} preload="none" aria-hidden="true" data-testid="game-music-audio"
      onPlay={() => {
        if (!musicOnRef.current) { suspend(); return }
        blockedRef.current = false
        setWaitingForInteraction(false)
        setPlaying(true)
      }} onPause={() => setPlaying(false)}
      onEnded={() => start(indexRef.current + 1, true)}
      onError={() => { setPlaying(false); setError('This track could not load. Try the next track or retry Play.') }} />
    {children}
  </MusicContext.Provider>
}

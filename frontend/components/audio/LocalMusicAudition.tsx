'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Textarea } from '@/components/catalyst/textarea'
import tracks from '../../public/audio/ambient-round-03/sources.json'
import styles from './ambient-audition.module.css'

const STORAGE_KEY = 'hexaverse:ambient-round-03:notes'

export function LocalMusicAudition() {
  const audio = useRef<HTMLAudioElement>(null)
  const playRequest = useRef(0)
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [repeat, setRepeat] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [storageReady, setStorageReady] = useState(false)
  const [storageMessage, setStorageMessage] = useState('Notes stay in this browser. Send your favorites in chat to choose the soundtrack.')
  const [error, setError] = useState('')

  useEffect(() => {
    const element = audio.current
    if (element) {
      element.volume = 0.35
      element.src = `audio/ambient-round-03/${tracks[0].file}`
    }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      if (saved && typeof saved === 'object') {
        const recovered: Record<string, string> = {}
        for (const { id } of tracks) {
          const value = (saved as Record<string, unknown>)[id]
          if (typeof value === 'string') recovered[id] = value
        }
        setNotes(recovered)
      }
    } catch {
      setStorageMessage('Saved notes could not be loaded. Copy your feedback into chat to keep it.')
    }
    setStorageReady(true)
    const pauseWhenHidden = () => { if (document.hidden) element?.pause() }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      playRequest.current++
      element?.pause()
      element?.removeAttribute('src')
      element?.load()
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    } catch {
      setStorageMessage('Browser storage is unavailable. Copy your feedback into chat to keep it.')
    }
  }, [notes, storageReady])

  function select(index: number) {
    const element = audio.current
    if (!element) return
    const next = (index + tracks.length) % tracks.length
    const request = ++playRequest.current
    setActive(next)
    setError('')
    element.src = `audio/ambient-round-03/${tracks[next].file}`
    element.load()
    void element.play().catch(() => {
      if (request === playRequest.current) setError('Playback did not start. Try the player’s Play control again.')
    })
  }

  function stop() {
    playRequest.current++
    audio.current?.pause()
    if (audio.current) audio.current.currentTime = 0
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p className={styles.round}>Music &amp; ambience / Round 03</p>
          <h1 className={styles.title}>Five tracks. Just press play.</h1>
          <p className={styles.intro}>A downloadable shortlist for the game, served locally. Try a track on its own,
            or let the five play in sequence. These are candidates for your review.</p>
          <p className={styles.detail}>Descriptions follow the composer’s notes. Listen for mood, distracting melodies,
            big swells and how the endings feel when repeated.</p>
        </header>
        <section className={styles.localPlayer} aria-label="Music player">
          <p className={styles.candidateTitle}>{tracks[active].title}</p>
          <p role="status" className={styles.detail}>{playing ? 'Playing' : 'Paused'} · Scott Buckley</p>
          <audio ref={audio} controls preload="none" aria-label="Music playback" className={styles.audioControl}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onError={() => setError('This audio file could not load. Try another track or reload the page.')}
            onEnded={() => {
              setPlaying(false)
              if (active < tracks.length - 1 || repeat) select(active + 1)
            }} />
          <div className={styles.playerActions}>
            <Button outline onClick={() => select(active - 1)}>Previous</Button>
            <Button outline onClick={() => select(active)}>Play from start</Button>
            <Button outline onClick={() => select(active + 1)}>Next</Button>
            <Button outline onClick={stop}>Stop audio</Button>
            <label className={styles.volume}><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} /> Repeat playlist</label>
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </section>
        <div className={styles.grid}>
          {tracks.map((track, index) => <section key={track.id} className={styles.candidate}
            data-active={active === index} aria-labelledby={`${track.id}-local-title`}>
            <div className={styles.candidateHeader}>
              <h2 className={styles.candidateTitle} id={`${track.id}-local-title`}>{String.fromCharCode(65 + index)}. {track.title}</h2>
              <Button outline aria-label={`Play ${String.fromCharCode(65 + index)}`} onClick={() => select(index)}>Play</Button>
            </div>
            <p className={styles.description}>{track.description}</p>
            <p className={styles.detail}><a href={track.source} className={styles.sourceLink} target="_blank" rel="noreferrer">Source &amp; download</a></p>
            <label className={styles.notesLabel} htmlFor={`${track.id}-local-notes`}>Your notes on {String.fromCharCode(65 + index)}</label>
            <Textarea id={`${track.id}-local-notes`} rows={3} disabled={!storageReady} value={notes[track.id] ?? ''}
              placeholder="Keep… Too busy… Good background…"
              onChange={event => setNotes(previous => ({ ...previous, [track.id]: event.target.value }))} />
          </section>)}
        </div>
        <footer className={styles.footer}>
          <p>Music by <a className={styles.sourceLink} href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">Scott Buckley</a>,
            released under <a className={styles.sourceLink} href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
            Original MP3s, unmodified. Signal to Noise uses the composer’s No Piano Melody mix.</p>
          <p>{storageMessage}</p>
          <p>Repeat playback uses the original endings and beginnings. Seamless loop edits and volume matching await selection.
            Playback pauses when you hide the tab or leave the story.</p>
        </footer>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './ambient-audition.module.css'
import { Button } from '@/components/catalyst/button'
import { Textarea } from '@/components/catalyst/textarea'
import { AMBIENT_SKETCHES, playAmbient, type AmbientId, type AmbientSession } from './ambient-sketches'

const STORAGE_KEY = 'hexaverse:ambient-round-01:notes'
type Notes = Partial<Record<AmbientId, string>>

export function AmbientAudition() {
  const session = useRef<AmbientSession | null>(null)
  const [active, setActive] = useState<AmbientId | null>(null)
  const [loading, setLoading] = useState(false)
  const [volume, setVolume] = useState(0.35)
  const [notes, setNotes] = useState<Notes>({})
  const [storageReady, setStorageReady] = useState(false)
  const [storageMessage, setStorageMessage] = useState('Notes stay in this browser. Copy them into chat when you want another round.')
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      if (saved && typeof saved === 'object') {
        const recovered: Notes = {}
        for (const { id } of AMBIENT_SKETCHES) {
          const value = (saved as Record<string, unknown>)[id]
          if (typeof value === 'string') recovered[id] = value
        }
        setNotes(recovered)
      }
    } catch {
      setStorageMessage('Saved notes could not be loaded. Copy your feedback into chat to keep it.')
    }
    setStorageReady(true)
    return () => { session.current?.close() }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    } catch {
      setStorageMessage('Browser storage is unavailable. Copy your feedback into chat to keep it.')
    }
  }, [notes, storageReady])

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) {
        session.current?.close()
        session.current = null
        setActive(null)
        setLoading(false)
      }
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [])

  function stop() {
    session.current?.close()
    session.current = null
    setActive(null)
    setLoading(false)
  }

  async function play(id: AmbientId) {
    stop()
    setError('')
    setActive(id)
    setLoading(true)
    let next: AmbientSession | undefined
    try {
      next = playAmbient(id, volume)
      session.current = next
      await next.ready
      if (session.current === next) setLoading(false)
    } catch {
      if (!next || session.current === next) {
        stop()
        setError('Audio could not start. Try Play again in a browser with Web Audio support.')
      }
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p className={styles.round}>Ambience / Round 01</p>
          <h1 className={styles.title}>What does the quiet sound like?</h1>
          <p className={styles.intro}>
            Imagine watching your fleet in a quiet system. Try each direction for 20–30 seconds.
            Keep a texture, reject a mood, or ask for something much stranger.
          </p>
          <p className={styles.detail}>Four synthesized sketches. No music or game effects. Nothing is selected yet.</p>
        </header>

        <div className={styles.toolbar}>
          <Button outline onClick={stop} disabled={!active}>Stop audio</Button>
          <label className={styles.volume}>
            Volume
            <input aria-label="Volume" className={styles.slider} type="range" min="0" max="1" step="0.01" value={volume}
              onChange={event => {
                const value = Number(event.target.value)
                setVolume(value)
                session.current?.setVolume(value)
              }} />
            <span className={styles.percent}>{Math.round(volume * 100)}%</span>
          </label>
          <p role="status" className={styles.status}>
            {active ? `${loading ? 'Preparing' : 'Playing'} ${AMBIENT_SKETCHES.find(item => item.id === active)?.letter}` : 'Silent'}
          </p>
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        <div className={styles.grid}>
          {AMBIENT_SKETCHES.map(sketch => (
            <section key={sketch.id} aria-labelledby={`${sketch.id}-title`}
              className={styles.candidate} data-active={active === sketch.id}>
              <div className={styles.candidateHeader}>
                <h2 id={`${sketch.id}-title`} className={styles.candidateTitle}>{sketch.letter}. {sketch.name}</h2>
                <Button outline aria-label={`${active === sketch.id ? 'Stop' : 'Play'} ${sketch.letter}`} aria-pressed={active === sketch.id}
                  onClick={() => active === sketch.id ? stop() : void play(sketch.id)}>
                  {active === sketch.id ? 'Stop' : 'Play'}
                </Button>
              </div>
              <p className={styles.description}>{sketch.description}</p>
              <p className={styles.question}>{sketch.question}</p>
              <label htmlFor={`${sketch.id}-notes`} className={styles.notesLabel}>Your notes on {sketch.letter}</label>
              <Textarea id={`${sketch.id}-notes`} rows={3} disabled={!storageReady} value={notes[sketch.id] ?? ''}
                placeholder="Keep… Change… Too much…"
                onChange={event => setNotes(previous => ({ ...previous, [sketch.id]: event.target.value }))} />
            </section>
          ))}
        </div>
        <footer className={styles.footer}>
          <p>{storageMessage}</p>
          <p>One sketch plays at a time. Each loops after 24 seconds; playback stops when you leave this page or hide the tab.</p>
          <p>Levels are approximately matched. Start quietly; adjust to taste. Silence is a valid preference too.</p>
        </footer>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Textarea } from '@/components/catalyst/textarea'
import styles from './ambient-audition.module.css'

// Official artist album and embeddable track IDs:
// https://futurescapes-scifiambience.bandcamp.com/album/space-vol-1
export const MUSIC_REFERENCES = [
  { id: 'equinox', letter: 'A', name: 'The Equinox', track: 1086145634, slug: 'the-equinox', description: 'The track behind your reference, in its original album version.', question: 'What makes this feel right for the game?' },
  { id: 'rift', letter: 'B', name: 'Rift', track: 1450823058, slug: 'rift', description: 'A different track from the same space-music collection.', question: 'Would you keep this alongside A, or stick with A?' },
  { id: 'galactic', letter: 'C', name: 'Galactic', track: 3780879338, slug: 'galactic', description: 'Another direction within the same artist’s musical world.', question: 'Better for ordinary exploration, or less of a fit?' },
  { id: 'arrival', letter: 'D', name: 'Arrival', track: 974820152, slug: 'arrival', description: 'A fourth track to test how broad this direction should be.', question: 'Does this belong in the same background-music family?' },
] as const

type ReferenceId = typeof MUSIC_REFERENCES[number]['id']
type Notes = Partial<Record<ReferenceId, string>>
const STORAGE_KEY = 'hexaverse:ambient-round-02:notes'

export function AmbientMusicReferences() {
  const [active, setActive] = useState<ReferenceId | null>(null)
  const [notes, setNotes] = useState<Notes>({})
  const [storageReady, setStorageReady] = useState(false)
  const [storageMessage, setStorageMessage] = useState('Notes stay in this browser. Send your feedback in chat to shape the next round.')
  const selected = MUSIC_REFERENCES.find(reference => reference.id === active)

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      if (saved && typeof saved === 'object') {
        const recovered: Notes = {}
        for (const { id } of MUSIC_REFERENCES) {
          const value = (saved as Record<string, unknown>)[id]
          if (typeof value === 'string') recovered[id] = value
        }
        setNotes(recovered)
      }
    } catch {
      setStorageMessage('Saved notes could not be loaded. Copy your feedback into chat to keep it.')
    }
    setStorageReady(true)
    const stopWhenHidden = () => { if (document.hidden) setActive(null) }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    } catch {
      setStorageMessage('Browser storage is unavailable. Copy your feedback into chat to keep it.')
    }
  }, [notes, storageReady])

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p className={styles.round}>Music &amp; ambience / Round 02</p>
          <h1 className={styles.title}>Find the music behind the world.</h1>
          <p className={styles.intro}>Your Futurescapes reference track, plus three other tracks from the same collection.
            Compare each for about a minute. We’re choosing a musical direction together.</p>
          <p className={styles.detail}>Select a track, then press Play in the artist’s player. A starts at the beginning of the original track; B–D are new candidates.</p>
          <p className={styles.detail}><a className={styles.sourceLink} href="https://www.youtube.com/watch?v=rzgR40IceRM&t=2248s" target="_blank" rel="noreferrer">Your exact reference: 37:28 in the mix</a></p>
        </header>

        <div className={styles.toolbar}>
          <Button outline onClick={() => setActive(null)} disabled={!selected}>Stop audio</Button>
          <p role="status" className={styles.status}>{selected ? `Selected ${selected.letter}: ${selected.name}` : 'Choose a reference below'}</p>
        </div>

        {selected && <section className={styles.player} aria-label="Reference player">
          <iframe key={selected.id} className={styles.musicPlayer}
            title={`${selected.letter}. ${selected.name} — Futurescapes`}
            src={`https://bandcamp.com/EmbeddedPlayer/album=2324684801/size=large/bgcol=333333/linkcol=93c5fd/tracklist=false/artwork=small/track=${selected.track}/transparent=true/`}
            allow="autoplay"
            referrerPolicy="strict-origin-when-cross-origin" />
          <p className={styles.detail}>Artist-hosted album preview. If the player is blocked, <a className={styles.sourceLink} href={`https://futurescapes-scifiambience.bandcamp.com/track/${selected.slug}`} target="_blank" rel="noreferrer">listen to {selected.name} on Bandcamp</a>.</p>
        </section>}

        <div className={styles.grid}>
          {MUSIC_REFERENCES.map(reference => <section key={reference.id} className={styles.candidate}
            data-active={active === reference.id} aria-labelledby={`${reference.id}-title`}>
            <div className={styles.candidateHeader}>
              <h2 className={styles.candidateTitle} id={`${reference.id}-title`}>{reference.letter}. {reference.name}</h2>
              <Button outline aria-label={`Listen to ${reference.letter}`} aria-pressed={active === reference.id}
                onClick={() => setActive(reference.id)}>Listen</Button>
            </div>
            <p className={styles.description}>{reference.description}</p>
            <a className={styles.sourceLink} href={`https://futurescapes-scifiambience.bandcamp.com/track/${reference.slug}`} target="_blank" rel="noreferrer">Futurescapes · Space Vol. 1</a>
            <p className={styles.question}>{reference.question}</p>
            <label className={styles.notesLabel} htmlFor={`${reference.id}-notes`}>Your notes on {reference.letter}</label>
            <Textarea id={`${reference.id}-notes`} rows={3} disabled={!storageReady} value={notes[reference.id] ?? ''}
              placeholder="Closer… Less of… Keep this part…"
              onChange={event => setNotes(previous => ({ ...previous, [reference.id]: event.target.value }))} />
          </section>)}
        </div>
        <footer className={styles.footer}>
          <p>{storageMessage}</p>
          <p>Reference listening via the artist’s Bandcamp player, not game assets. One player at a time; switching references replaces it.
            Playback stops when you hide the tab or leave the story.</p>
        </footer>
      </div>
    </main>
  )
}

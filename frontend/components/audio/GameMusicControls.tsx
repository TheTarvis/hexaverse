'use client'

import { useId } from 'react'
import { HudButton } from '@/components/hud/HudControls'
import { Select } from '@/components/catalyst/select'
import { HudSection } from '@/components/hud/HudCardShell'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { GAME_MUSIC_TRACKS, useGameMusic } from './GameMusicProvider'
import styles from './game-music-controls.module.css'

export function GameMusicControls() {
  const music = useGameMusic()
  const id = useId()
  if (!music) return null
  return <HudSection aria-label="Music settings" className={styles.settings} data-music-controls>
    <HudHeading variant="section" level={3}>Music</HudHeading>
    <label className={styles.enable}>
      <input type="checkbox" checked={music.musicOn} disabled={!music.ready} onChange={event => event.target.checked ? music.play() : music.pause()} />
      <span className="hud-type-label">Music enabled</span>
    </label>
    <HudText variant="secondary">{music.playing ? 'Now playing' : 'Paused'}: {music.track.title}</HudText>
    <label htmlFor={`${id}-track`} className="hud-type-label">Track</label>
    <Select id={`${id}-track`} value={music.track.id} disabled={!music.ready} onChange={event => music.select(event.target.value)}>
      {GAME_MUSIC_TRACKS.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}
    </Select>
    <div className={styles.actions}>
      <HudButton disabled={!music.ready} onClick={music.previous}>Previous</HudButton>
      <HudButton disabled={!music.ready} onClick={music.playing ? music.pause : music.play} aria-label={music.playing ? 'Pause music' : 'Play music'}>{music.playing ? 'Pause' : 'Play'}</HudButton>
      <HudButton disabled={!music.ready} onClick={music.next}>Next</HudButton>
    </div>
    <label className={styles.volume} htmlFor={`${id}-volume`}>
      <span className="hud-type-label">Music volume</span>
      <input id={`${id}-volume`} type="range" min="0" max="1" step="0.01" disabled={!music.ready} value={music.volume} onChange={event => music.setVolume(Number(event.target.value))} />
      <output htmlFor={`${id}-volume`} className="hud-type-value">{Math.round(music.volume * 100)}%</output>
    </label>
    {music.error && <HudText role="alert">{music.error}</HudText>}
    {music.waitingForInteraction && <HudText role="status" variant="caption">Music will start after your first game interaction, or press Play.</HudText>}
    <HudText variant="caption">Five tracks repeat in order. Music starts automatically when allowed. Your on/off choice is saved in this browser.</HudText>
    <details className={styles.credits}>
      <summary className="hud-type-label">Music credits</summary>
      <HudText variant="caption">Music by <a href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">Scott Buckley</a>, released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Original recordings, unmodified.</HudText>
      <ul>{GAME_MUSIC_TRACKS.map(track => <li key={track.id}><HudText variant="caption"><a href={track.source} target="_blank" rel="noreferrer">{track.title}</a></HudText></li>)}</ul>
    </details>
  </HudSection>
}

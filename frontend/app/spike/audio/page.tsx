'use client'

// SPIKE (throwaway) — playground for the code-only audio layer in ./synth.ts.
// Left: the SFX palette, one button per game verb. Right: the generative
// ambient engine — pick a system id + character, press play, and the same
// seeded music that system would always have starts breathing. Volume faders
// for the master/sfx/music buses, and a running log of what the engine plays.
// Route: /spike/audio

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Text } from '@/components/catalyst/text'
import type { Character } from '../hex-board/mock-system'
import { AmbientEngine, SFX_PALETTE, setMasterVolume, setMusicVolume, setSfxVolume } from './synth'

const CHARACTERS: Character[] = ['star_rich', 'normal', 'dead', 'barrier']

function Fader({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId: string }) {
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="w-16">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="w-40 accent-zinc-600 dark:accent-zinc-300"
      />
    </label>
  )
}

export default function AudioSpikePage() {
  const engineRef = useRef<AmbientEngine | null>(null)
  const [seed, setSeed] = useState('Veyara-042')
  const [character, setCharacter] = useState<Character>('normal')
  const [playing, setPlaying] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [master, setMaster] = useState(0.9)
  const [sfx, setSfx] = useState(0.6)
  const [music, setMusic] = useState(0.55)

  // stop the engine when leaving the page
  useEffect(() => () => engineRef.current?.stop(), [])

  const stopEngine = () => {
    engineRef.current?.stop()
    engineRef.current = null
    setPlaying(false)
  }

  const startEngine = () => {
    engineRef.current?.stop()
    const engine = new AmbientEngine(seed, character)
    engine.onEvent = (msg) => setLog((prev) => [msg, ...prev].slice(0, 8))
    engine.start()
    engineRef.current = engine
    setPlaying(true)
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-8 dark:bg-zinc-700">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <Heading>Audio spike — sound as code</Heading>
          <Text>
            No asset files. Every sound below is synthesized on the spot by <code>synth.ts</code>; the music is seeded, so a
            system id always plays the same score.
          </Text>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* SFX palette */}
          <section className="space-y-4 rounded-lg bg-zinc-50 p-6 dark:bg-white/[0.12]">
            <Subheading>SFX palette</Subheading>
            <div className="grid grid-cols-3 gap-2">
              {SFX_PALETTE.map(({ name, desc, fn }) => (
                <Button key={name} outline onClick={fn} title={desc} data-testid={`sfx-${name}`}>
                  {name}
                </Button>
              ))}
            </div>
            <Text className="text-xs">Hover a button for the game verb it stands in for.</Text>
          </section>

          {/* Generative music */}
          <section className="space-y-4 rounded-lg bg-zinc-50 p-6 dark:bg-white/[0.12]">
            <Subheading>Ambient engine</Subheading>
            <div className="flex gap-3">
              <Field className="flex-1">
                <Label>System id (seed)</Label>
                <Input value={seed} onChange={(e) => setSeed(e.target.value)} data-testid="music-seed" />
              </Field>
              <Field>
                <Label>Character</Label>
                <Select value={character} onChange={(e) => setCharacter(e.target.value as Character)} data-testid="music-character">
                  {CHARACTERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={playing ? stopEngine : startEngine} data-testid="music-toggle">
                {playing ? 'Stop' : 'Play'}
              </Button>
              {playing && (
                <Button plain onClick={startEngine} data-testid="music-restart">
                  Restart with settings
                </Button>
              )}
            </div>
            <div className="h-40 overflow-hidden rounded bg-zinc-100 p-3 font-mono text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
              {log.length === 0 ? '· engine idle ·' : log.map((line, i) => <div key={`${i}-${line}`}>{line}</div>)}
            </div>
          </section>
        </div>

        {/* Buses */}
        <section className="space-y-3 rounded-lg bg-zinc-50 p-6 dark:bg-white/[0.12]">
          <Subheading>Buses</Subheading>
          <div className="flex flex-wrap gap-8">
            <Fader label="master" value={master} testId="vol-master" onChange={(v) => { setMaster(v); setMasterVolume(v) }} />
            <Fader label="sfx" value={sfx} testId="vol-sfx" onChange={(v) => { setSfx(v); setSfxVolume(v) }} />
            <Fader label="music" value={music} testId="vol-music" onChange={(v) => { setMusic(v); setMusicVolume(v) }} />
          </div>
        </section>
      </div>
    </div>
  )
}

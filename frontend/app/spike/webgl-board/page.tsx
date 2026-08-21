'use client'

// SPIKE — the WebGL board tuning bench. Route: /spike/webgl-board
//
// The production board renderer (components/board/webgl/*) on a fixture,
// packed through the SAME pure pack functions the live board uses
// (createPackedScene, packFleetInstance, createFramePacker). What the bench
// adds is knobs — bloom/instrument/tilt/speed sliders — so the tuned
// production constants can be revisited against known content without
// touching production. The SVG comparator half retired with the SVG board
// (port-board-to-webgl-renderer task 6.3).

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import { buildMockSystemBoard } from './mock-board'
import { FOG_TREATMENT, VOID } from '@/components/board/board-palette'
import { createPackedScene, packFleetInstance } from '@/components/board/board-pack'
import { createFramePacker } from '@/components/board/board-frame'
import { useBoardProjection } from '@/components/board/use-board-projection'
import type { Character } from '../hex-board/mock-system'

// three needs a GL context, so the renderer stays off the SSR path entirely.
const WebGLBoard = dynamic(() => import('@/components/board/webgl/WebGLBoard').then((m) => m.WebGLBoard), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">initialising GL…</div>,
})

const CHARACTERS: Character[] = ['star_rich', 'normal', 'dead', 'barrier']

// --- small instrument-styled control primitives ------------------------------

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 py-2 dark:border-white/10">
      <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      {value !== undefined && (
        <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
          {value}
        </span>
      )}
    </div>
  )
}

function Slider({
  min,
  max,
  step,
  value,
  onChange,
  testId,
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  testId: string
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-sky-500"
    />
  )
}

export default function WebGLBoardSpikePage() {
  const [character, setCharacter] = useState<Character>('normal')
  const [seedTick, setSeedTick] = useState(0)

  // Travis's tuned look (2026-08-11) — the PRODUCTION constants; the bench
  // opens at them and lets you stray.
  const [bloom, setBloom] = useState(0.25)
  const [starfield, setStarfield] = useState(true)
  const [instrument, setInstrument] = useState(0.15)
  const [tiltDeg, setTiltDeg] = useState(14)
  const [speed, setSpeed] = useState(0.5)

  const seed = 0x51a2c0de + seedTick * 7919

  const fixture = useMemo(() => buildMockSystemBoard(seed, character, 16), [seed, character])
  const scene = useMemo(() => createPackedScene(fixture.board), [fixture])
  const packedFleets = useMemo(() => fixture.fleets.map(packFleetInstance), [fixture])

  // Bench clock: world time runs from the mount instant at the speed slider.
  // Production always runs scale 1 off the server anchor; the multiplier is a
  // bench-only affordance.
  const mountWall = useMemo(() => performance.now(), [])
  const anchor = useMemo(() => ({ world: 0, wall: mountWall }), [mountWall])
  const packer = useMemo(
    () =>
      createFramePacker({
        features: fixture.board.features,
        fleets: fixture.fleets,
        anchor,
        timeScale: speed,
        fxEpochWall: mountWall,
        reducedMotion: false,
        getSelectedId: () => null,
      }),
    [fixture, anchor, speed, mountWall],
  )
  const packerRef = useRef(packer)
  packerRef.current = packer
  const getFrame = useCallback((now: number) => packerRef.current(now), [])

  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const projection = useBoardProjection(stageEl, 16, { tiltDeg })

  const settings = useMemo(() => ({ bloom, instrument, starfield }), [bloom, instrument, starfield])

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Board renderer bench</Heading>
          <Text className="max-w-2xl">
            The production WebGL board (<span className="font-mono text-xs">components/board/webgl</span>) on a
            fixture, packed through the same pure pack functions the live board uses. Every effect below is an
            independent knob, so you can find out which one is doing the work.
          </Text>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* --- the stage ------------------------------------------------------ */}
        <div
          ref={setStageEl}
          data-testid="board-stage"
          className="relative aspect-[4/3] w-full overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-white/10"
          style={{ backgroundColor: VOID }}
        >
          <canvas
            ref={setCanvasEl}
            className="absolute inset-0 block h-full w-full"
            style={{ touchAction: 'none' }}
          />
          {canvasEl && projection.ready && (
            <WebGLBoard
              canvas={canvasEl}
              scene={scene}
              fleets={packedFleets}
              camera={projection.camera}
              getFrame={getFrame}
              settings={settings}
            />
          )}
        </div>

        {/* --- controls ------------------------------------------------------- */}
        <aside className="flex flex-col gap-5">
          <section>
            <Subheading>Contributors</Subheading>
            <Text className="mb-1 text-xs">Turn each off to see what it was worth.</Text>

            <Row label="Bloom" value={bloom.toFixed(2)}>
              <Slider min={0} max={2} step={0.05} value={bloom} onChange={setBloom} testId="ctl-bloom" />
            </Row>
            <Row label="Starfield" value={starfield ? 'on' : 'off'}>
              <Button plain onClick={() => setStarfield((v) => !v)} data-testid="ctl-starfield">
                {starfield ? 'Disable' : 'Enable'}
              </Button>
            </Row>
            <Row label="Instrument" value={instrument.toFixed(2)}>
              <Slider min={0} max={1} step={0.05} value={instrument} onChange={setInstrument} testId="ctl-instrument" />
            </Row>
            <Row label="Tilt" value={`${tiltDeg}°`}>
              <Slider min={0} max={26} step={1} value={tiltDeg} onChange={setTiltDeg} testId="ctl-tilt" />
            </Row>
            <Row label="Speed" value={`${speed}×`}>
              <Slider min={0} max={8} step={0.5} value={speed} onChange={setSpeed} testId="ctl-speed" />
            </Row>
            <p className="border-t border-zinc-200 pt-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Opens at the production constants (bloom 0.25, instrument 0.15, tilt 14°). The speed multiplier is
              bench-only — production world time always runs at scale 1 off the server anchor.
            </p>
          </section>

          <section>
            <Subheading>System</Subheading>
            <Row label="Character">
              <Select
                value={character}
                onChange={(e) => setCharacter(e.target.value as Character)}
                data-testid="ctl-character"
              >
                {CHARACTERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Seed">
              <Button plain onClick={() => setSeedTick((n) => n + 1)} data-testid="ctl-reseed">
                Regenerate
              </Button>
            </Row>
            <Row label="Bodies" value={String(fixture.board.features.length)}>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{fixture.name}</span>
            </Row>
          </section>

          <section>
            <Subheading>Fog treatments</Subheading>
            <Text className="mb-1 text-xs">
              The merged fog record (board-palette FOG_TREATMENT): opacity-era values for visible/remembered,
              outline-only for astronomical — the port&apos;s one deliberate visual change.
            </Text>
            <ul className="flex flex-col gap-1.5">
              {(['visible', 'remembered', 'astronomical'] as const).map((band) => (
                <li key={band} className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: FOG_TREATMENT[band].accent }}
                    aria-hidden
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-mono text-[10px] tracking-wider">{FOG_TREATMENT[band].label}</span>
                    {' — '}
                    {band === 'visible' && 'full radiance, crisp terminator, blooms.'}
                    {band === 'remembered' && 'dimmed; detail frozen at its asOf.'}
                    {band === 'astronomical' && 'no surface at all — a predicted outline only.'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

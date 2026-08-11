'use client'

// SPIKE (throwaway) — SVG board vs WebGL board, same data, same instant.
// Route: /spike/webgl-board
//
// The question this page exists to answer is NOT "does WebGL look better" — of
// course it can. It is "which specific effect is doing the work, and is any of
// it out of reach of the browser?" So every contributor is an independent
// toggle: turn bloom off and the WebGL board collapses most of the way back
// toward the SVG one, which tells you bloom was the delta, not the engine.
//
// The comparator is a wipe rather than two panes: same screen area, same frame,
// same instant, one renderer either side of the line. Side-by-side panes let
// scale and position differences do the persuading; a wipe does not.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import { SvgBoard } from './SvgBoard'
import { buildSpikeBoard } from './mock-board'
import { FOG, VOID } from './spike-palette'
import type { BoardSettings, SpikeClock } from './WebGLBoard'
import type { Character } from '../hex-board/mock-system'

// three needs a GL context, so the renderer stays off the SSR path entirely —
// the same treatment GalaxyView gives GalaxyGraph.
const WebGLBoard = dynamic(() => import('./WebGLBoard').then((m) => m.WebGLBoard), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">initialising GL…</div>,
})

type Mode = 'wipe' | 'webgl' | 'svg'

const MODES: { id: Mode; label: string }[] = [
  { id: 'svg', label: 'SVG' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'webgl', label: 'WebGL' },
]

const CHARACTERS: Character[] = ['star_rich', 'normal', 'dead', 'barrier']

// --- small instrument-styled control primitives ------------------------------
// Monospace, hairline-ruled, tabular numerals: the chrome reads as a readout
// rather than a settings form, which is what the subject calls for.

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
  const [mode, setMode] = useState<Mode>('wipe')
  const [wipe, setWipe] = useState(50)
  const [character, setCharacter] = useState<Character>('normal')
  const [seedTick, setSeedTick] = useState(0)

  // Travis's tuned look (2026-08-11), kept as the opening state: bloom and grain
  // dialled well back from where the spike first landed, a little camera tilt,
  // and half speed. The short version of the taste this encodes — the effects
  // should make the board legible, not announce themselves.
  const [bloom, setBloom] = useState(0.25)
  const [starfield, setStarfield] = useState(true)
  const [instrument, setInstrument] = useState(0.15)
  const [tiltDeg, setTiltDeg] = useState(14)
  const [speed, setSpeed] = useState(0.5)

  const board = useMemo(
    () => buildSpikeBoard(0x51a2c0de + seedTick * 7919, character, 16),
    [character, seedTick],
  )

  const settings = useMemo<BoardSettings>(
    () => ({ bloom, starfield, instrument, tiltDeg, speed, interactive: mode === 'webgl' }),
    [bloom, starfield, instrument, tiltDeg, speed, mode],
  )

  // One clock, advanced by one rAF, read by both renderers — so the wipe shows
  // the same instant on both sides rather than two independent simulations.
  const clock = useRef<SpikeClock>({ elapsed: 0, worldTime: 0 })
  const speedRef = useRef(speed)
  speedRef.current = speed
  const svgVisible = mode !== 'webgl'
  const [, forceTick] = useState(0)

  // The SVG board is animation-driven, so its server render and its first client
  // render disagree on float formatting. Mount it client-side only.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      clock.current.elapsed += dt
      clock.current.worldTime += dt * 1000 * speedRef.current
      // Only pay for a React render when an SVG pane is actually on screen; the
      // WebGL board reads the clock ref directly from its own loop.
      if (svgVisible) forceTick((n) => (n + 1) % 1_000_000)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [svgVisible])

  // --- wipe divider drag ------------------------------------------------------
  const stageRef = useRef<HTMLDivElement | null>(null)
  const draggingWipe = useRef(false)

  const moveWipe = useCallback((clientX: number) => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setWipe(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingWipe.current) moveWipe(e.clientX)
    }
    const onUp = () => {
      draggingWipe.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [moveWipe])

  const showSvg = mode === 'svg' || mode === 'wipe'
  const showGl = mode === 'webgl' || mode === 'wipe'
  const svgClip = mode === 'wipe' ? `inset(0 ${100 - wipe}% 0 0)` : undefined

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Board renderer spike</Heading>
          <Text className="max-w-2xl">
            The same system, the same fleet, the same instant — drawn twice. Left of the line is{' '}
            <span className="font-mono text-xs">components/board</span> exactly as it ships today (real{' '}
            <span className="font-mono text-xs">HexLattice</span>,{' '}
            <span className="font-mono text-xs">FeatureGlyph</span>,{' '}
            <span className="font-mono text-xs">FleetGlyph</span>). Right of it is the WebGL renderer. Every effect
            below is an independent toggle, so you can find out which one is actually doing the work.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {MODES.map(({ id, label }) =>
            mode === id ? (
              <Button key={id} color="zinc" onClick={() => setMode(id)} data-testid={`mode-${id}`}>
                {label}
              </Button>
            ) : (
              <Button key={id} plain onClick={() => setMode(id)} data-testid={`mode-${id}`}>
                {label}
              </Button>
            ),
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* --- the stage ------------------------------------------------------ */}
        <div
          ref={stageRef}
          data-testid="board-stage"
          className="relative aspect-[4/3] w-full overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-white/10"
          style={{ backgroundColor: VOID }}
        >
          {showGl && <WebGLBoard board={board} settings={settings} clock={clock} />}

          {/* The SVG pane sits ON TOP of the GL canvas and is clipped to the wipe.
              It needs its own opaque ground, or the WebGL board shows through the
              SVG's transparent background and the comparison is a lie. */}
          {showSvg && mounted && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: VOID, ...(svgClip ? { clipPath: svgClip } : {}) }}
            >
              <SvgBoard board={board} elapsed={clock.current.elapsed} worldTime={clock.current.worldTime} />
            </div>
          )}

          {mode === 'wipe' && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
                style={{ left: `${wipe}%` }}
                aria-hidden
              />
              <div
                role="slider"
                tabIndex={0}
                aria-label="Comparison wipe position"
                aria-valuenow={Math.round(wipe)}
                aria-valuemin={0}
                aria-valuemax={100}
                data-testid="wipe-handle"
                className="absolute inset-y-0 -ml-3 w-6 cursor-ew-resize"
                style={{ left: `${wipe}%` }}
                onPointerDown={(e) => {
                  draggingWipe.current = true
                  moveWipe(e.clientX)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setWipe((w) => Math.max(0, w - 2))
                  if (e.key === 'ArrowRight') setWipe((w) => Math.min(100, w + 2))
                }}
              >
                <div className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-lg" />
              </div>
              <span className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-widest text-white/50">
                SVG — shipping today
              </span>
              <span className="pointer-events-none absolute right-3 bottom-2 font-mono text-[10px] uppercase tracking-widest text-white/50">
                WebGL — spike
              </span>
            </>
          )}

          {mode === 'webgl' && (
            <span className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-widest text-white/40">
              drag to pan · scroll to zoom
            </span>
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
              Opens at the tuned viewing angle. The SVG board has no camera to tilt, so drop tilt to 0° for a
              pixel-exact wipe.
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
            <Row label="Bodies" value={String(board.bodies.length)}>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{board.name}</span>
            </Row>
          </section>

          <section>
            <Subheading>Fog as signal quality</Subheading>
            <Text className="mb-1 text-xs">
              The spike&apos;s one real design proposal: express the three fog bands as how well the picture
              resolves, not as how transparent it is.
            </Text>
            <ul className="flex flex-col gap-1.5">
              {(['visible', 'remembered', 'astronomical'] as const).map((band) => (
                <li key={band} className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: FOG[band].accent }}
                    aria-hidden
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-mono text-[10px] tracking-wider">{FOG[band].label}</span>
                    {' — '}
                    {band === 'visible' && 'full radiance, crisp terminator, blooms.'}
                    {band === 'remembered' && 'channel registration drifts, scanlines break up.'}
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

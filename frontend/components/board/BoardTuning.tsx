'use client'

// BoardTuning — the dev-only look-tuning panel on the LIVE system board: the
// bench's knobs (/spike/webgl-board) carried onto real content. It owns no
// rendering; it emits a BoardLook the view threads into BoardStage's
// settings/tiltDeg overrides. Tweaks persist in localStorage so they survive
// the dev reload loop; Reset returns to the tuned production constants
// (TUNED_LOOK / BOARD_TILT_DEG) and clears the store. SystemBoardView gates
// the mount to development builds — this module carries no gate of its own.

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/catalyst/button'
import { BOARD_TILT_DEG } from './use-board-projection'
import { TUNED_LOOK } from './webgl/contract'

export interface BoardLook {
  bloom: number
  instrument: number
  starfield: boolean
  tiltDeg: number
  // Scene-look knobs: star photosphere scale, an sRGB hex tint overriding the
  // starClass colour (null = per-class default; linearised at the settings
  // seam, not here), and a size multiplier for every non-star body.
  starScale: number
  starTint: string | null
  bodyScale: number
}

export const DEFAULT_LOOK: BoardLook = { ...TUNED_LOOK, tiltDeg: BOARD_TILT_DEG, starTint: null }

// What the colour input shows while the tint is on 'auto' — the class-G
// fallback from board-palette, purely a starting point for the picker.
const TINT_PLACEHOLDER = '#ffd27d'

const STORAGE_KEY = 'hexaverse.boardLook'

// readStoredLook merges whatever survived in storage over the defaults — a
// stale shape from an older build degrades field-by-field, never throws.
export function readStoredLook(): BoardLook | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p: unknown = JSON.parse(raw)
    if (typeof p !== 'object' || p === null) return null
    const o = p as Record<string, unknown>
    return {
      bloom: typeof o.bloom === 'number' ? o.bloom : DEFAULT_LOOK.bloom,
      instrument: typeof o.instrument === 'number' ? o.instrument : DEFAULT_LOOK.instrument,
      starfield: typeof o.starfield === 'boolean' ? o.starfield : DEFAULT_LOOK.starfield,
      tiltDeg: typeof o.tiltDeg === 'number' ? o.tiltDeg : DEFAULT_LOOK.tiltDeg,
      starScale: typeof o.starScale === 'number' ? o.starScale : DEFAULT_LOOK.starScale,
      starTint: typeof o.starTint === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.starTint) ? o.starTint : null,
      bodyScale: typeof o.bodyScale === 'number' ? o.bodyScale : DEFAULT_LOOK.bodyScale,
    }
  } catch {
    return null
  }
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/10 py-1.5 first:border-t-0">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-400">{label}</span>
      <div className="flex flex-1 items-center">{children}</div>
      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-300">{value}</span>
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

export interface BoardTuningProps {
  // null means "no override" — the renderer's tuned constants apply.
  onChange: (look: BoardLook | null) => void
}

export function BoardTuning({ onChange }: BoardTuningProps) {
  const [open, setOpen] = useState(false)
  const [look, setLook] = useState<BoardLook | null>(null)

  // A stored look loads after mount (server and first client render agree —
  // the SCAN_FX_KEY treatment) and re-applies itself to the board.
  useEffect(() => {
    const stored = readStoredLook()
    if (stored) {
      setLook(stored)
      onChange(stored)
    }
    // onChange is a parent setState — stable; running this once is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = look ?? DEFAULT_LOOK

  const update = (patch: Partial<BoardLook>) => {
    const next = { ...shown, ...patch }
    setLook(next)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    onChange(next)
  }

  const reset = () => {
    setLook(null)
    window.localStorage.removeItem(STORAGE_KEY)
    onChange(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="board-tuning-toggle"
        title="Board look tuning — bloom, instrument, tilt, starfield"
        onClick={() => setOpen(true)}
        className="pointer-events-auto rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300 backdrop-blur hover:bg-white/[0.16] hover:text-white"
      >
        ⚙ tune fx{look ? ' *' : ''}
      </button>
    )
  }

  return (
    <div
      data-testid="board-tuning-panel"
      className="pointer-events-auto w-72 rounded-xl border border-white/10 bg-black/70 p-3 shadow-lg backdrop-blur"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Board look — dev</span>
        <button
          type="button"
          data-testid="board-tuning-close"
          onClick={() => setOpen(false)}
          className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          close
        </button>
      </div>

      <Row label="Bloom" value={shown.bloom.toFixed(2)}>
        <Slider min={0} max={2} step={0.05} value={shown.bloom} onChange={(v) => update({ bloom: v })} testId="board-tuning-bloom" />
      </Row>
      <Row label="Instrument" value={shown.instrument.toFixed(2)}>
        <Slider min={0} max={1} step={0.05} value={shown.instrument} onChange={(v) => update({ instrument: v })} testId="board-tuning-instrument" />
      </Row>
      <Row label="Tilt" value={`${shown.tiltDeg}°`}>
        <Slider min={0} max={26} step={1} value={shown.tiltDeg} onChange={(v) => update({ tiltDeg: v })} testId="board-tuning-tilt" />
      </Row>
      <Row label="Starfield" value={shown.starfield ? 'on' : 'off'}>
        <Button plain onClick={() => update({ starfield: !shown.starfield })} data-testid="board-tuning-starfield">
          {shown.starfield ? 'Disable' : 'Enable'}
        </Button>
      </Row>
      <Row label="Star size" value={`${shown.starScale.toFixed(2)}×`}>
        <Slider min={0.3} max={2.5} step={0.05} value={shown.starScale} onChange={(v) => update({ starScale: v })} testId="board-tuning-star-scale" />
      </Row>
      <Row label="Star color" value={shown.starTint ?? 'auto'}>
        <input
          type="color"
          value={shown.starTint ?? TINT_PLACEHOLDER}
          data-testid="board-tuning-star-color"
          onChange={(e) => update({ starTint: e.target.value })}
          className="h-6 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
        />
        {shown.starTint && (
          <button
            type="button"
            data-testid="board-tuning-star-color-auto"
            onClick={() => update({ starTint: null })}
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            auto
          </button>
        )}
      </Row>
      <Row label="Bodies" value={`${shown.bodyScale.toFixed(2)}×`}>
        <Slider min={0.4} max={2.5} step={0.05} value={shown.bodyScale} onChange={(v) => update({ bodyScale: v })} testId="board-tuning-body-scale" />
      </Row>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
        <span className="font-mono text-[10px] text-zinc-500">
          {look ? 'overriding tuned constants' : 'at tuned constants'}
        </span>
        <Button plain onClick={reset} disabled={!look} data-testid="board-tuning-reset">
          Reset
        </Button>
      </div>
    </div>
  )
}

export default BoardTuning

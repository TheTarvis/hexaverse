'use client'

// The client's live simulation clock — a CLOCK OBJECT, not clock state
// (openspec change `fix-world-time-render-loop`, design.md Decision 1).
// `createWorldClock()` returns `{ anchor(world, scale), now(), hasReading(),
// reading() }`. `now()` is `projectWorldTime` (moved here verbatim from the
// deleted per-frame world-time hook, with its tests) evaluated ON DEMAND
// against `wallClock()`. There is no timer, no rAF and no subscription
// list — a frame loop PULLS the time; nothing here ever pushes it.
//
// NOT `lib/world-clock/`, DELIBERATELY. `world-clock` is the name of a
// Go-sole-authority capability (`openspec/specs/world-clock/spec.md`), and
// this module evaluates the same `world + elapsed × scale` formula in
// TypeScript — permitted only as a PROJECTION of a served reading, never as
// a second authority. Naming the directory after the Go capability invites
// exactly the mirror the name forbids.
//
// `now()` before the first `anchor()` call returns `0` rather than
// projecting against an uninitialized anchor — the clock has no reading to
// project from, and this state is reached for at least one frame after
// mount, before the first server read lands. `hasReading()` distinguishes
// that state for a caller that needs to skip work rather than render at `0`
// (`GalaxyView`'s unserved-scale hold is the named caller).
//
// `anchor()` replaces the reading with a NEW object in one assignment; the
// previous reading's fields are never mutated in place. A non-finite
// `world` or `scale` is a no-op — an anchor call is meaningless without both.

import { useLayoutEffect, useRef, useState, useEffect } from 'react'

/** A locked correspondence between a world instant and the wall instant it
 * was observed at. World time = world + (wallNow − wall) × scale. Moved
 * verbatim from the deleted per-frame hook. */
export interface WorldAnchor {
  world: number
  wall: number
}

/** A `WorldAnchor` plus the scale it was served at — the clock's one
 * mutable reading, replaced wholesale on every `anchor()` call. */
export interface WorldReading extends WorldAnchor {
  readonly scale: number
}

export interface WorldClock {
  /**
   * Replace the reading. ONE assignment of a NEW object — the previous
   * reading object is never mutated. A non-finite `world` or `scale` is a
   * no-op.
   */
  anchor(world: number, scale: number): void
  /**
   * `projectWorldTime(reading, wall(), reading.scale)`. Returns `0` before
   * the first `anchor()`, and never throws.
   */
  now(): number
  /** True once `anchor()` has been called with finite values. */
  hasReading(): boolean
  /** The current reading object, or `null`. Its identity changes only when
   * `anchor()` runs. */
  reading(): Readonly<WorldReading> | null
}

/**
 * Extrapolate the live world time from an anchor at a wall instant — the
 * pure core of the clock, so drift math is unit-testable without a rAF
 * loop. Moved verbatim from the deleted hook.
 */
export function projectWorldTime(anchor: WorldAnchor, wallNow: number, scale: number): number {
  return anchor.world + (wallNow - anchor.wall) * scale
}

/** Monotonic wall clock in ms (`performance.now` if present, else
 * `Date.now`). Only deltas are used, so the origin is irrelevant. Moved
 * verbatim from the deleted hook. */
export function wallClock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** How often `useCoarseWorldTime` ticks — once per wall second (design.md
 * Decision 2). */
export const COARSE_TICK_MS = 1000

/**
 * The WALL milliseconds to wait until a WORLD instant arrives — what a
 * `setTimeout` scheduling a refetch against a served eta actually needs.
 *
 * The distinction is the whole point of this helper. An eta, a burn's
 * `ArriveMs` and a jump's `arriveMs` are all world time; `setTimeout` counts
 * wall time. `eta − clock.now()` mixes the two, and the two are only
 * interchangeable at scale 1 — the scale prod happens to run at, which is why
 * a caller can get this wrong and never see it. On a world served at scale s,
 * a world-time remaining of `d` elapses in `d / s` wall ms, so scheduling `d`
 * directly fires late by a factor of s (at s=5, a burn that lands in 4s is
 * refetched at 20s, and the UI sits on a stale row until the baseline poll
 * rescues it).
 *
 * Never negative — a world instant already past schedules immediately. Before
 * the clock has a reading, or on a non-finite scale, it falls back to treating
 * the delta as wall ms, which is exactly right at scale 1 and no worse than
 * the arithmetic it replaces anywhere else.
 */
export function wallMsUntil(clock: WorldClock, worldInstant: number): number {
  const scale = clock.reading()?.scale
  const remaining = worldInstant - clock.now()
  const s = Number.isFinite(scale) && (scale as number) > 0 ? (scale as number) : 1
  return Math.max(0, remaining / s)
}

export function createWorldClock(wall: () => number = wallClock): WorldClock {
  let reading: WorldReading | null = null
  return {
    anchor(world, scale) {
      if (!Number.isFinite(world) || !Number.isFinite(scale)) return
      reading = { world, wall: wall(), scale }
    },
    now() {
      if (!reading) return 0
      return projectWorldTime(reading, wall(), reading.scale)
    },
    hasReading() {
      return reading !== null
    },
    reading() {
      return reading
    },
  }
}

/**
 * One clock per mount, anchored immediately when both a served world time
 * and a served scale are finite — the render in which a child (e.g.
 * `ScanSweepWatcher`) first reads it, whose effects run BEFORE the parent's.
 * Re-anchors in a `useLayoutEffect` only when a fresh, finite pair arrives
 * (never on a reading alone — design m18); a layout effect is used rather
 * than a passive one so every passive effect in the tree, children
 * included, sees the fresh anchor. The return is referentially stable for
 * the whole mount.
 */
export function useWorldClock(
  serverWorldTime: number | undefined,
  scale: number | undefined,
): WorldClock {
  const [clock] = useState<WorldClock>(() => {
    const c = createWorldClock()
    if (Number.isFinite(serverWorldTime) && Number.isFinite(scale)) {
      c.anchor(serverWorldTime as number, scale as number)
    }
    return c
  })

  // Tracks the last pair this hook itself anchored, so the layout effect
  // below — which always runs at least once, on mount — never re-anchors
  // with the identical pair the lazy initializer above already anchored.
  const lastRef = useRef<{ t: number; s: number } | null>(
    Number.isFinite(serverWorldTime) && Number.isFinite(scale)
      ? { t: serverWorldTime as number, s: scale as number }
      : null,
  )

  useLayoutEffect(() => {
    if (!Number.isFinite(serverWorldTime) || !Number.isFinite(scale)) return
    const last = lastRef.current
    if (last && last.t === serverWorldTime && last.s === scale) return
    lastRef.current = { t: serverWorldTime as number, s: scale as number }
    clock.anchor(serverWorldTime as number, scale as number)
  }, [clock, serverWorldTime, scale])

  return clock
}

/**
 * The ONE coarse tick for everything React shows (design.md Decision 2):
 * `setInterval` at `COARSE_TICK_MS`, plus an immediate update on re-anchor
 * (detected by the reading object's IDENTITY changing — there is no
 * subscription list, so this is the only signal available) and an
 * immediate resync when the tab regains visibility. Returns unrounded
 * world-ms; callers round it themselves.
 *
 * MUST be called after `useWorldClock`, in the same component: the
 * re-anchor-detection layout effect relies on layout effects in one
 * component running in declaration order.
 */
export function useCoarseWorldTime(clock: WorldClock): number {
  const [value, setValue] = useState<number>(() => clock.now())
  const lastReadingRef = useRef(clock.reading())

  // No deps, DELIBERATELY: compares the clock's reading by identity on
  // EVERY render, so a re-anchor that landed via a sibling/ancestor's own
  // layout effect is picked up "immediately", with no wait for the next 1
  // Hz tick. This cannot loop: the guard below only calls `setValue` when
  // the reading's IDENTITY changed since the last time this effect ran, and
  // `setValue` never changes that identity itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const current = clock.reading()
    if (current !== lastReadingRef.current) {
      lastReadingRef.current = current
      setValue(clock.now())
    }
  })

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    const tick = () => {
      if (clock.hasReading()) setValue(clock.now())
    }
    const start = () => {
      interval = setInterval(tick, COARSE_TICK_MS)
    }
    start()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      tick()
      clearInterval(interval)
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clock])

  return value
}

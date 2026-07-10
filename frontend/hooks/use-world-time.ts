'use client'

import { useEffect, useRef, useState } from 'react'

// useWorldTime — the client's live simulation clock, the animation source for the
// hex board (#0005/#0007). Given the server `worldTime` from a read, it anchors an
// offset to the wall clock and extrapolates forward every animation frame, so
// bodies and coasting fleets glide from `(elements, worldTime)` WITHOUT any
// position refetch — a paused network still animates correctly between reads. Each
// fresh server reading re-anchors, correcting any accumulated drift.
//
// "Quantize the simulation, interpolate the picture": this hook only produces the
// continuous world time; lib/hex quantizes it to the integer logical hex and the
// pixel layer glides between cells. Every read returns worldTime, so re-anchoring
// is free.

export interface UseWorldTimeOptions {
  // World-ms advanced per wall-ms. Every world today runs at 1 (dev included); a
  // future time-warped world would ship its scale in the read and pass it here.
  scale?: number
  // Drive a requestAnimationFrame loop (default true). false freezes the clock at
  // the last server reading — for reduced-motion and deterministic tests.
  animate?: boolean
}

// A locked correspondence between a world instant and the wall instant it was
// observed at. world time = world + (wallNow − wall) × scale.
export interface WorldAnchor {
  world: number
  wall: number
}

// projectWorldTime extrapolates the live world time from an anchor at a wall
// instant — the pure core of the clock, so drift math is unit-testable without a
// rAF loop.
export function projectWorldTime(anchor: WorldAnchor, wallNow: number, scale: number): number {
  return anchor.world + (wallNow - anchor.wall) * scale
}

// Monotonic wall clock in ms (performance.now if present, else Date.now). Only
// deltas are used, so the origin is irrelevant.
function wallClock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function useWorldTime(
  serverWorldTime: number | undefined,
  options?: UseWorldTimeOptions,
): number {
  const scale = options?.scale ?? 1
  const animate = options?.animate ?? true

  const anchor = useRef<WorldAnchor | null>(null)
  const [worldTime, setWorldTime] = useState<number>(serverWorldTime ?? 0)

  // Re-anchor to each fresh server reading (correcting drift) and snap the clock.
  useEffect(() => {
    if (serverWorldTime === undefined) return
    anchor.current = { world: serverWorldTime, wall: wallClock() }
    setWorldTime(serverWorldTime)
  }, [serverWorldTime])

  useEffect(() => {
    if (!animate) return
    let raf = 0
    const tick = () => {
      if (anchor.current) setWorldTime(projectWorldTime(anchor.current, wallClock(), scale))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate, scale])

  return worldTime
}

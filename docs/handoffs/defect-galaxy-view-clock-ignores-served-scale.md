# Defect — the galaxy view projects world time at scale 1 while formatting at the served scale

**Status:** OPEN, confirmed 2026-09-19 by the orchestrator. **Pre-existing —
not introduced by `fix-world-time-render-loop`.** Whose call: Travis's, as
open question OQ4 in `fix-world-time-render-loop-rulings.md`.

**Found by:** `openspec-reliability` (finding 12) during the Phase-1 panel on
`fix-world-time-render-loop`; the architect independently noted the same
mismatch inside `A-F3`. Verified by the orchestrator before filing.

## The mismatch

`frontend/components/galaxy/GalaxyView.tsx:181-182`:

```
  // Live clock (for the roster's countdowns) anchored to the fleet read.
  const worldTime = useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)
```

No options argument, so `scale` defaults to 1 inside the hook
(`frontend/hooks/use-world-time.ts:53`, `const scale = options?.scale ?? 1`).

Twelve lines of JSX later, the same component hands the roster the **served**
scale for formatting — `GalaxyView.tsx:473-474`:

```
            worldTime={worldTime}
            scale={myFleets?.[0]?.scale}
```

So the *projection* advances at 1 world-ms per wall-ms while the *formatter*
divides by the served scale. The two disagree for any world whose scale is
not 1.

For contrast, the system view gets this right —
`frontend/components/space/SystemSpaceView.tsx:426`:

```
  const worldTime = useWorldTime(serverWorldTime, { scale: clockScale })
```

## The requirement it bears on

`openspec/specs/system-space-view/spec.md:272-273`, inside *Own-Fleet
Position, Burn Curve, and Arrival Ghost Render Continuously*:

> **The current world time** SHALL be extrapolated from the most recent served
> reading at the **served world-clock scale**, never at an assumed scale of 1.

and its stated reason (`:277-280`):

> a client projecting at the wrong rate draws every orbit and every burn mark
> progressively further from truth the longer it goes between polls — and
> reaches a burn's `u = 1` at the wrong wall instant, so a ship appears to
> arrive early or never.

That requirement lives in `system-space-view` and so does not literally bind
`galaxy-view` today — which is part of why this survived. `galaxy-view` has no
requirement naming the clock at all (the architect grepped all 14; the
orchestrator confirmed the capability has no cadence or scale clause).

## Why nobody has seen it

`frontend/hooks/use-world-time.ts:18-19` says so outright:

> World-ms advanced per wall-ms. Every world today runs at 1 (dev included); a
> future time-warped world would ship its scale in the read and pass it here.

Every world runs at scale 1, so the bug is currently invisible. It becomes a
wrong countdown on every galaxy-view roster row the first time a world runs
time-warped.

## Blast radius

Only the galaxy view's roster countdowns and gates — `worldTime` has exactly
one consumer in this component (`:473`), and the GL graph
(`GalaxyGraph.tsx`) runs its own rAF loop and does not take it. The system
view is unaffected.

## Why it is filed rather than fixed

`fix-world-time-render-loop` rewires this exact call site (its task 3.4) and
is gaining a `galaxy-view` delta anyway (panel finding `A-F3`), so the
marginal cost of fixing it there is close to zero — the change's new
`useWorldClock(serverWorldTime, scale)` signature takes a scale where the old
call passed none. That makes it tempting, and it is still scope creep on a
change whose whole discipline this run has been keeping narrow.

Recorded as OQ4 with a weak lean toward fixing it in-flight. Not acted on:
this run carries no authorization to widen the change's scope, and
`--full-auto` is not in force.

**Whichever way it goes, it goes through the pipeline.** Nobody edits
`GalaxyView.tsx:182` as a drive-by.

# Defect — the galaxy view's clock projects at an assumed scale of 1

**Status:** open. **Found:** 2026-09-08, by `openspec-design-analyst` while
decomposing `add-figure-formatting` (chain link 1, `docs/plans/system-hud/chain.md`).
**Deliberately not fixed in that change** — see FULL-AUTO RULING 7 in
`add-figure-formatting-rulings.md`.

## What

`frontend/components/galaxy/GalaxyView.tsx:182` projects world time with no scale:

```
useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)
```

No `scale` option is passed, so the projection advances one world-millisecond per
real millisecond. In any world where the served scale is not 1, every duration the
galaxy view derives from that clock is wrong by a factor of the scale.

## Why it is a defect and not a choice

`openspec/specs/system-space-view/spec.md` carries the standing doctrine that the
served scale is **never** assumed to be 1 — it is why `SystemSpaceView` threads
`interior.scale ?? fleet.scale` (`SystemSpaceView.tsx:405`) rather than defaulting.
The galaxy view was never brought onto that rule. `frontend/lib/eta.ts:1-4` records
the same assumption in its own header comment ("world time runs at scale 1 today,
so world-ms are real ms"), which is how the assumption survived unnoticed: the one
shared duration formatter agreed with it.

`add-figure-formatting` retires `lib/eta.ts` and makes the scale an explicit,
required argument, which is what exposed this.

## Blast radius

Anything on the galaxy view derived from the projected clock. The roster's ETA
column is the visible one; `GalaxyView.test.tsx:424` asserts it
(`fleet-row-eta-fleet_1` → `'11m'`).

## Why it is not fixed in `add-figure-formatting`

That change may pass a `scale` prop to `FleetRoster` at its `GalaxyView` mount
site — a shared component's prop, not the galaxy view's own chrome — but fixing
the view's clock is a `galaxy-view` behaviour change with no delta in that change
and no design input behind it. The chain doc's "What every link must not do"
forbids touching the galaxy view; RULING 7 reads that prohibition as covering the
view's own chrome and clock, which this is.

## Whose call

Travis's, as a scoping question: whether the galaxy view gets its scale from
`myFleets?.[0]?.scale` (matching what the roster mount will already do) or from a
galaxy-level served field. Either way it wants its own change against
`galaxy-view`, through the normal pipeline.

---

## Addendum 2026-09-08 — there is a second site, and it is on the system view

Found by `openspec-architect` during `add-figure-formatting`'s panel review
(finding A13, `add-figure-formatting-panel-architect.md`). Recorded here rather
than filed separately, because it is the same defect with the same cause.

`frontend/components/space/SystemSpaceView.tsx:405` carries its own `?? 1`:

```
interior.scale ?? fleet.scale ?? 1
```

So the system view — the one place documented as threading the served scale
properly, and the view this whole chain is about — also falls back to an assumed
scale of 1 when neither read has supplied one. The pattern is identical to
`GalaxyView.tsx:182`; only the fallback's position in the expression differs.

**Why this matters to `add-figure-formatting` specifically.** RULING 8 of that
change says a duration with no served scale renders as explicitly absent, never
at an assumed 1. A live `?? 1` sitting at the value's source silently defeats
that ruling: the formatter is handed `1`, never `undefined`, so the absent branch
is unreachable and no test can observe it. The change handles this by splitting
the two consumers — `design.md` makes the figure-facing `servedScale` an
un-defaulted `number | undefined` while `useWorldTime` keeps its `?? 1` at one
anchor line — so the clock's projection is unaffected while figures can tell
"not served" from "scale 1".

That split makes the ruling observable on the system view. It does **not** make
the galaxy-mounted countdown correct under a scale ≠ 1 — the galaxy view still
has no scale to thread beyond `myFleets?.[0]?.scale`, and its clock still
projects at 1. The defect above stands unchanged; this addendum only records
that the same `?? 1` exists in a second place, and that one of the two is being
worked around (not fixed) inside `add-figure-formatting`.

**Consequence for whoever fixes this:** there are two sites, not one, and the
system-view site will by then have a deliberate, documented `?? 1` on the clock
path that must be left alone. Grep for `?? 1` near a scale, not for the file
name.

# Defect — a seeded sighting's ghost mark is intermittently not drawn

**Status:** open, **intermittent, two occurrences in two consecutive runs**.
**Found:** 2026-09-09, in `add-vitals-strip`'s archive-gate runs 3c and 3d.
**Not this change's:** `add-vitals-strip` touches no sighting or ghost-layer
code; the two specs are pre-existing and untouched by it (its own diff is the
vitals strip, the camera cluster and the panels the strip empties).

## What happens

A sighting record seeded through the API before the page loads does not render
its ghost mark on the space view. The assertion waits the full 20 s and finds
no element.

**Occurrence 1 — run 3c, `frontend/e2e/tests/scan-journey.spec.ts:260`:**

```
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('sighting-mark-77dd23eaa8f671f8dea60aca7186c09b')
Expected: visible   Timeout: 20000ms   Error: element(s) not found
  at scan-journey.spec.ts:291
```

**Occurrence 2 — run 3d, `frontend/e2e/tests/scan-journey.spec.ts:42`:**

```
Error: the seeded ghost is drawn on first render
expect(locator).toBeVisible() failed
Locator: getByTestId('sighting-mark-8152ad54c1c71ac81b35dbc222963b90')
Expected: visible   Timeout: 20000ms   Error: element(s) not found
  at scan-journey.spec.ts:249
```

Different tests, different seeded record ids, **same symptom**: the ghost for a
record that exists on the wire is not on the canvas. In each run the *other*
test passed — `:260` passed in run 3d, `:42` passed in run 3c — which is why
this is filed as intermittent rather than as a regression in either spec.

## Why it is filed now rather than waved through

One occurrence is noise; two in two runs, on the same symptom in the same
surface, is a pattern. It was explicitly held open after run 3c precisely so
that a second occurrence would be filed rather than re-explained.

## What it is probably not

Not the emulator deaths that voided runs 3a–3c: run 3d ran to completion with
the emulators alive throughout (zero `Received SIGTERM` in
`backend/emulator.log`), and this failure sits 20 minutes before anything else
went wrong in run 3c.

## Where to look

The seeded record reaches the client through the sightings read; the mark is
drawn by the ghost layer in `frontend/components/space/`. Two candidate shapes,
neither confirmed: the sightings read resolving *after* the scene's first draw
and no redraw being triggered for late-arriving records (a mount-ordering race
of the kind `SystemSpaceView.sighting-log-mount-ordering.test.tsx` already
guards at unit level), or the seeded record being filtered by fog/LOS for a
spawn whose geometry puts it behind the star.

## What would make this stale

A run on a quiet machine that either reproduces it with the sightings read and
the draw call both instrumented, or ten consecutive green runs of both specs.

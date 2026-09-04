# Link 8b `add-scan-and-sightings-surface` — archive-gate journey record

**Status: ARCHIVED** as `3088748`, after a **second, user-authorized revision round**.

The run first halted here with the tier-4 journey red on one leg, its one batched round
already spent — per `docs/testing-tiers.md` ("it runs once … then it runs once more. Never a
revision loop per red leg"). Travis reviewed the halt and authorized one more round. The
final section records what that round found; everything above it is the record as it stood
at the halt, left unedited.

Implementation commit: **`1bc5e46`** (113 files, +11138/−362). Tiers 0 and 1 green before it.

## Tier 3 — full backend emulator suite: PASS for 8b

`npm run test:backend:all` — **2040 tests, 1 skipped, 1 failure, 5118s (85m)**, inside the
90m budget but close enough to record: the budget line is worth watching at link 9.

The one failure is **not 8b's**:
`TestDiscardRefund_Scenario_CuttingImmediatelyAfterCommitRefundsNearlyFullCost`
(`backend/fuel_discard_refund_e2e_test.go:70`, link 7 `add-fuel-as-cargo`). It asserts ≥90%
fuel refunded when a burn is cut "within milliseconds of commit". On a machine 85 minutes
into the suite the commit round trip took 2.5s and the cut 2.4s, so real elapsed burn time
consumed 10.4% of the cost — 89.6% refunded, 0.4 points under the threshold. **Passes alone
in 29s.** A wall-clock-sensitive threshold, not an assertion about wrong behaviour.

## Tier 4 — Playwright journey

### Run 1 (full suite, straight after tier 3): 5 failed / 17 passed, 32.6m — INVALID

Run on the same `hexaverse-emulator` project tier 3 had just filled with 2040 tests' data.
Four of the five failures were `wakeNewCorp` → `page.waitForURL` timing out at 60s, i.e. the
already-recorded open defect `defect-spawn-lock-timeout.md` (spawn contends on a transaction
lock; healthy spawns take 5-7s, failing ones 23-32s; the wake UI then silently resets),
aggravated by the data volume.

`docs/testing-tiers.md` forbids running tiers 3 and 4 *concurrently*; it does not say to
reset the emulator between them. **It should.** Running them back to back on one project is
how this run was wasted.

### Run 2 (the sanctioned rerun, on freshly restarted emulators): 8 passed / 4 failed

Restarting the emulators clean changed the picture completely:

- **all four `scan-journey` tests passed**, including the clean-sweep journey that had failed;
- `slice.spec.ts` passed;
- `space-double-submit.spec.ts` — 3 failed, but on a *different* error than in run 1: `no
  interior read for sys_X was captured off the wire`. This is the helper weakness this chain
  has already catalogued ("a helper that could not tell 'never captured' from 'captured
  empty'"). Test `:217` **passed in run 1 and failed in run 2**, so it flakes in both
  directions. Not 8b's spec, not 8b's assertions;
- `scan-lane-transit-fizzle.spec.ts` failed again, burning the full 900s at one assertion.

### The batched revision round — `scan-lane-transit-fizzle.spec.ts`

**Root cause: a test-side false premise, confirmed by the SDET; no product defect.**

The spec waited for `fleet-row-eta-{fleetId}` to read `now`, and the element never existed at
all. Step 6's comment asserted that the galaxy page "mounts the same corp-wide `FleetRoster`
… so no further navigation is needed". The list membership was never the problem — the
browser's data was simply never refreshed after the jump:

- step 4 commits the jump via a raw `page.request.post`, deliberately bypassing the UI;
- the galaxy page's `FleetRoster` reads `useMyFleets()` (`frontend/hooks/use-fleets.ts:19-27`),
  fetched once on mount, before the jump existed;
- nothing refetches it: `frontend/lib/query-client.ts:16-21` sets `staleTime: 60_000` and
  `refetchOnWindowFocus: false`, `useMyFleets` sets no `refetchInterval`, and the galaxy view
  subscribes to no SSE channel (`EventSource` appears only in `SystemSpaceView.tsx`);
- so the cached fleet kept rendering its pre-jump snapshot (`Docked`, `fleet.jump` undefined);
  `roster-status.ts:82-97`'s docked branch never sets `remainingMs`, and
  `FleetRoster.tsx:194-201` renders the testid only when `remainingMs !== undefined`.

Fix: a `page.reload()` between steps 5 and 6, forcing `useMyFleets` to refetch — the same
technique `scan-journey.spec.ts:216` already uses in this suite for an out-of-band state
change — plus a corrected comment carrying the real mechanism. **No assertion weakened.**
Verified: `2 passed (4.8m)`, down from 15-16m of timeout burn.

### Run 3 (the "once more" run, 8b's two journey specs): 5 passed / 1 failed — STILL RED

```
✓ scan-journey.spec.ts:42   clean sweep                                   33.4s
✓ scan-journey.spec.ts:260  seeded ghost cross-highlights with its row     1.7s
✓ scan-journey.spec.ts:307  burn to the home station still docks normally 23.3s
✘ scan-journey.spec.ts:332  mid-burn "no host in range" -> docked host     21.3s
✓ scan-lane-transit-fizzle.spec.ts:99  laneTransit/leftSystem fizzle        2.8m
```

**The remaining red is test-side, and the product is behaving correctly.** The assertion is
`expect(getByText('No host is in range to sweep.')).toBeVisible()` at
`scan-journey.spec.ts:361`, mid-burn. The captured error context shows the control rendered
the **"Sweep" button and the emission warning** — i.e. the served target list was *not*
empty, so withholding that copy is exactly right.

The test assumes nothing is in focused-scan range while the fleet is still travelling. That
is a race against the burn's own progress: partway along the burn to the home station the
fleet is already within range of it. This is the mirror image of the open finding already
recorded for Travis — *a freshly spawned fleet has nothing in focused-scan range, so its
first scan needs a burn first* (design.md OQ 12) — and it makes the same range dial the
subject.

This test passed in run 1 (42.8s) and run 2 (21.8s) with production code identical to run 3's,
which is what a race looks like.

**It was not fixed here because the one batched revision round had already been spent on the
fizzle spec.** The likely fix is test-side: assert the mid-burn state at a pinned point early
in the burn rather than "some time before it lands", or arrange a burn whose whole path stays
out of range. That is the SDET's call, not this record's.

## What the next orchestrator inherits

1. `scan-journey.spec.ts:332`'s mid-burn range race — one SDET fix, then a rerun of the two
   scan specs, then archive. Nothing else in the change is outstanding.
2. Tasks: **118 of 119 checked.** Only 10.9 (the pre-archive `validate --strict` +
   `openspec-reconcile.py` rerun) is open, and it is the archive step itself.
   `openspec validate --strict` → valid and `openspec-reconcile.py` → OK as of this record.
3. Link 9's nine paths are deliberately **unstaged and still in the tree**:
   `backend/system/generator_continuous_test.go` (its diff is purely link 9's task 2.10b,
   dropping lattice-side assertions), `backend/action/commit_params_validator_continuous_test.go`,
   `backend/fleet/jump_parked_at_target_gate_not_attached_test.go`,
   `backend/refuel/parked_at_station_not_attached_test.go`,
   `backend/system/phase_reachability_test.go`, `link9-acceptance-greps.sh`,
   `link9-red-coverage.md`, `link9-task7.4-falsification-proof.sh`,
   `red-manifest-delete-the-lattice.txt`. All five of its red tests pass green against the
   emulator — they are characterization tests, "NO CODE CHANGE EXPECTED" by design — so they
   did not redden 8b's tier 3.

## Three pre-existing flakes this gate surfaced, none fixed here

- **`P1b`** (`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx`) — green 5/5 in
  isolation, flakes under full-suite load. Its window depends on `Date.now()` beating a query's
  `dataUpdatedAt`.
- **`lib/realtime.test.ts`** — races the `__anti_mirror_probe__` directory that the
  mirror-map test creates and deletes, and dies on `ENOENT` mid-glob. Failed once, passed on
  the next full run.
- **`space-double-submit.spec.ts`** — the "captured off the wire" helper, flaking in both
  directions across runs.

None is 8b's, and none was patched: this change's scope is the scan and sightings surface.


---

## The second round (user-authorized) — and the first diagnosis was wrong

Travis authorized one round beyond the cap. It was worth having, because the halt's
diagnosis was wrong.

The halt reasoned: the control rendered the Sweep button, so the served list was not empty,
so withholding the copy was correct, so the fleet must already be in range partway along the
burn to the station — the mirror of design.md OQ 12. Plausible, and wrong.

**The real cause: the assertion's 20-second timeout was exactly `BOARD_POLL_MS`**
(`frontend/lib/realtime.ts`). The served scan-target list refetches only on a closed set of
triggers — mount, attachment change, landed burn/jump, acting-fleet change, SSE reconnect,
and the 20s baseline poll. **Committing a burn is not one of them** (`useOrder`'s `onSuccess`
invalidates the fleet reads only), so the empty page legitimately stands until the next poll.
A wait as wide as the poll's own cycle can therefore span a tick that replaces the
still-correct empty page with a fresh, already-in-range one — flipping the awaited text from
about-to-appear to never-appearing. Two passes and one failure on byte-identical production
code is exactly that signature.

Fix (`frontend/e2e/tests/scan-journey.spec.ts`, mid-burn leg only): prove the empty state
from the **already-resolved** first `GET /scan-targets` response captured at mount — a
synchronous check with no wait, so no timing risk — and leave the DOM check a quarter of a
poll cycle rather than a whole one. The "docked host appears with no user action once the
burn lands" half is untouched; it was never at risk, since the attachment-change trigger
forces a fresh read at landing.

**The lesson, and it generalises past this suite: a timeout equal to a refresh interval is
not a timeout, it is a race.**

### Final gate result

Emulators reset to a clean project first, then:

```
✓ scan-journey.spec.ts:42   clean sweep                                   37.8s
✓ scan-journey.spec.ts:260  seeded ghost cross-highlights with its row     2.6s
✓ scan-journey.spec.ts:307  burn to the home station still docks normally 22.4s
✓ scan-journey.spec.ts:332  mid-burn "no host in range" -> docked host    23.4s
✓ scan-lane-transit-fizzle.spec.ts:99  laneTransit/leftSystem fizzle        4.8m
✓ slice.spec.ts:80          the vertical slice                             1.8m
7 passed (8.2m)
```

`openspec validate --strict` valid, `openspec-reconcile.py` OK, red manifest 33/33 unchanged.
Archive rehearsed on a scratch copy (`+28, ~6, -0`) before the real run — every scenario
heading preserved. All 119 tasks checked.

The three flakes and the open findings listed above are unchanged and still open.

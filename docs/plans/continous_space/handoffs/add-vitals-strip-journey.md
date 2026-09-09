# `add-vitals-strip` — journey record (archive gate)

Link 2a of `docs/plans/system-hud/chain.md`. Journey spec:
`frontend/e2e/tests/vitals-strip-journey.spec.ts`, written against the built UI
(implementation commit `b6e83a1`), walking RULING 9's four-step journey:
dock at a station and read all five cells → switch the acting fleet by the
chevron (same-system, then cross-system) → commit a burn and watch the pill
flip and count down → the 1280×720 viewport check with all three relocated
floating surfaces present, closing QA's two BLOCKED rows.

Per `docs/testing-tiers.md` and the workflow skill: tier 4 and tier 3 each run
**once**, sequentially, never concurrently, against the shared
`hexaverse-emulator` test project — one batched revision round after a red
run, then one confirming rerun, never a loop per red leg. **This gate used
both: Run 1 (red, 3 findings) → one batched round → the confirming rerun
(still red, 3 findings — two new).** Per the chain rules, the confirming
rerun is the last run this gate gets; it does not close green, and archiving
is blocked pending a decision from Travis (see *What Travis must decide*).

## Outcome: BLOCKED. Two of QA's rows are not both green after both runs.

## Run 1 — RED (3 of 23 tier-4 specs)

**Tier 4** (`cd frontend && npm run e2e`): 20 passed, 3 failed, **29.8m
(1788s)**.

| Spec | Verdict | What happened |
|---|---|---|
| `vitals-strip-journey.spec.ts` (this change's own journey) | RED | `vitals-fleet-chevron` click retried the full 900s against `<div data-testid="floating-nav" … fixed bottom-4 left-4 z-50 …>` intercepting pointer events |
| `refuel-commit.spec.ts` (inherited-testid, contract §3.3) | RED | Burn-to-station never left `On station` |
| `slice.spec.ts` (inherited-testid, contract §3.3) | RED | Post-reload `holdKindTons` read `0`, expected `+5` |

**Tier 3** (`npm run test:backend:all`): all green, **1875 tests, 1 skipped
(an opt-in fixture-regen guard, `UPDATE_FIXTURES=1`), 0 failed, 1130.471s
(~18.84m)**. Every package `✓`; root package `.` (the wiping `TestMain` +
router-level e2e suite) took 1036.9s of that. No backend files are in this
change's diff (impl contract §0: "Frontend only … no wire change"), so this
was the expected outcome and **tier 3 did not need to rerun** at any point in
this gate.

## The batched round — what each of Run 1's three findings turned out to be

### 1. `FloatingNav` — PRODUCT DEFECT, fixed and verified

`FloatingNav` (`frontend/components/floating-nav.tsx`, mounted for every
authenticated route by `frontend/components/layout-wrapper.tsx:108`) is a
pre-existing, always-present, app-wide floating surface — the cross-view nav
+ sign-out card — fixed at `bottom-4 left-4 z-50`. It was not part of this
change's diff and was not named in impl contract §9's bottom-band survey,
which enumerated exactly three occupants to relocate: the command column,
`sightings-unavailable`, and the camera cluster. It missed a fourth, because
`FloatingNav` lives outside `SystemSpaceView` entirely (in the shared app
shell) and nothing in that survey looked beyond the space-view component
tree. `system-console`'s own requirement text is broader than the impl
contract's three-surface list — *No other floating surface covers a strip
cell* says "every floating surface **the view mounts**"
(`openspec/changes/add-vitals-strip/specs/system-console/spec.md:704`), and
`FloatingNav` is mounted on every route the view renders under, so it was in
scope whether or not the impl contract named it.

**Fixed** by `openspec-nextjs-dev`: `frontend/components/floating-nav.tsx:33`
now reads `fixed bottom-[4.5rem] left-4 z-50` — the same offset its three
`system-console`-clearanced siblings already use, `z-50` deliberately
untouched so the fix is a real clearance, not a z-order race. A mechanical
grep for other bottom-anchored `fixed` elements found no further offender —
every remaining `fixed` component in the tree is a modal/drawer/sidebar
anchored `inset-0`/`inset-y-0`. Developer's tier 1 green (1605 tests), no
test file and no backend file touched.

**Verified, not assumed:** the confirming rerun's failure in this same spec
moved from `vitals-strip-journey.spec.ts:222` (the first chevron open, at
home, docked) to `:257` (the *second* chevron open, after the cross-system
navigation leg) — i.e. the first chevron interaction that Run 1 could never
reach now succeeds cleanly. The fix works for what it targeted.

### 2. `refuel-commit.spec.ts` — KNOWN RESIDUE, confirmed by signature, did not recur

**Confirmed, not inferred:** `frontend/playwright/.auth/backend.log`, fleet
`fleet_cd3dccca-2ee0-455f-bceb-beb3e96e91ab`, `06:13:01`:

```
ERR fleet operation failed error="fleet: solving burn: space: endpoint at or inside the star-clearance radius"
POST /v1/fleets/fleet_cd3dccca…/orders/preview  ->  500
POST /v1/fleets/fleet_cd3dccca…/orders          ->  500
```

The exact error string `defect-station-order-500.md` names
(`space.ErrEndpointInsideClearance`, a bodyless 500 from both the preview and
commit endpoint for a burn ordered to the home station), open since
2026-09-02, ~2% of spawns land on an "unlucky" arrival-phase geometry.
Pre-existing, unrelated to this change (zero backend files touched;
`refuel-commit.spec.ts` itself untouched). Recorded as residue, not chased.

**One correction on the record, made explicit because it nearly cost the
gate a wrong conclusion.** A first-pass attribution on this run concluded "no
known-defect signature present" from `grep -cE 'status = 500|status 500|409'`
over the Playwright-side log/report — **zero**, because that signature exists
**only** in `frontend/playwright/.auth/backend.log` (the spawned test
backend's own log), never in the Playwright report, stdout, or
`test-results/**`. `defect-station-order-500.md` now carries an explicit
**"Where to look"** section recording this, plus this occurrence, so the next
person does not repeat the same wrong grep.

**Did not recur on the confirming rerun** — `refuel-commit.spec.ts` passed.
Consistent with the defect's own ~2%-per-spawn, arrival-phase-dependent rate:
a green rerun is not evidence it is fixed, only that this particular spawn
did not land on the unlucky geometry.

### 3. `slice.spec.ts` — CONTRACT-BREAKING REGRESSION, adjudicated in the developer's favor, fixed and verified

**Diagnosis (source-verified).** `hold-readout` used to live inside
`FleetActionsPanel`, which early-returns before rendering anything
data-dependent when `fleet` is `null` (`FleetActionsPanel.tsx:317-323`, still
present today, just without the readout) — so `hold-readout`'s visibility
used to be a reliable proxy for "the fleets read has resolved with a truthy
acting fleet," an implicit guarantee `slice.spec.ts` leaned on for one
un-polled post-reload read. `hold-readout` now lives inside `VitalsStrip` →
`HoldCell`, mounted **unconditionally** per `system-console`'s own *Always
Present* requirement (R1) — its visibility is now decoupled from "the fleet
read has landed" entirely. This is intentional, spec-required behavior on the
strip's side, not a bug; the break is that a spec impl contract §3.3 promised
would "need no edit" had a timing assumption baked in that only ever held
because of the *old* component's gating.

**Adjudicated in the developer's favor:** the fix is test-side.
`slice.spec.ts:138-154`'s post-reload check now uses `expect.poll`, matching
the pattern the same file already uses for the pre-reload mine assertion. The
assertion's substance is unchanged — the tons must still reach `before + 5`,
and a wrong implementation still fails it — only its synchrony now matches an
async condition. `tsc --noEmit` and `eslint` both clean on the edit. No
production code touched.

**Verified:** `slice.spec.ts` passed on the confirming rerun.

**Taught — recorded because it is more general than one poll call.** Impl
contract §3.3 promised the five inherited-testid specs would need no edits,
reasoning entirely about testid *names and DOM shape*. It never considered
that re-homing an element can change its **mount timing** — a testid that
previously appeared only after a read resolved can appear immediately once it
lives on an always-present surface. **Inheriting a testid preserves the
selector, not the precondition.** Any later link that re-homes a readout into
an always-present surface inherits this risk — `add-burn-cost-overlay`
(link 2a-ii) lifts a preview into the mounting view, and **link 2b re-homes
far more than this one did**, so its own inherited-testid list (if any)
should be checked against this same question before being trusted unedited.

## The confirming rerun — still RED, three findings, two of them new

**Tier 4:** 20 passed, 3 failed, **28.5m (1710s)**. Tier 3 did not rerun —
already green, and neither fix in the batched round touched a backend file.

| Spec | Run 1 | Rerun | What changed |
|---|---|---|---|
| `vitals-strip-journey.spec.ts` | RED (`:222`) | **RED** (`:257`) | The `FloatingNav` fix worked — progressed past the first chevron open to the second; a *different* interceptor now blocks that one |
| `refuel-commit.spec.ts` | RED | **GREEN** | `defect-station-order-500` did not recur (expected, ~2% rate) |
| `slice.spec.ts` | RED | **GREEN** | The poll fix holds |
| `space-double-submit.spec.ts:185` ("burn order" guard) | GREEN | **RED** | New — see Finding B below |
| `space-double-submit.spec.ts:242` ("sale" guard) | GREEN | **RED** | New — see Finding B below |

### Finding A — Next.js's own dev-mode overlay is a SECOND, previously-masked occupant of the same corner

**Where:** `vitals-strip-journey.spec.ts:257`, the second
`vitals-fleet-chevron` click (after the cross-system navigation leg), retried
900s against:

```
<nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script>
  subtree intercepts pointer events
```

The failure screenshot (`test-results/tests-vitals-strip-journey-…/test-failed-1.png`)
shows exactly what is doing the intercepting: a red **`N  2 Issues ✕`** badge,
bottom-left, directly over the strip's leftmost cell — Next.js 15's dev-mode
build-activity/issues indicator. `npm run e2e`'s `webServer` boots the
frontend via `npm run dev` (`playwright.config.ts:14-19` — real `next dev`,
not a production build), so this indicator is present in the e2e stack by
construction. **It never ships**: `next build && next start` strips this
overlay entirely, so no real player in production ever sees it. It is a
test-environment artifact, not a product defect in the sense Finding 1 was.

**Same class of collision as `FloatingNav`, different occupant, and it was
never visible until `FloatingNav` moved.** Before the fix, `FloatingNav` (a
larger box, same corner) was the topmost element Playwright's actionability
check found and reported — Playwright reports only the topmost intercepting
element, so a second, smaller occupant underneath had no way to surface. Once
`FloatingNav` cleared the corner, this badge became the new topmost occupant
of the exact same bottom-left real estate the strip's fleet cell also claims.
**The bottom-left corner is more contested than any hand survey — including
this gate's own — found on the first pass.**

**Open question I could not close with the artifacts on hand, and said so
rather than guessing.** The badge read "2 Issues," meaning something is
genuinely registered, not merely an idle icon — but whether those two issues
are (a) new client-side warnings/errors this change's code introduces, or (b)
baseline noise present on any sufficiently long dev-mode session regardless
of this change, I could not determine from the Playwright artifacts alone:
`playwright.config.ts`'s `webServer` does not set `stdout: 'pipe'`, so the
`next dev` process's own console — which would show exactly what the two
issues are — was not captured anywhere this run wrote to. The one piece of
circumstantial evidence: this exact account's session ran ~15 minutes with
many navigations, a forced-500 route interception planned for later in the
spec (never reached this run), burns, docks, and a hard `page.reload()` —
plenty of surface for baseline warnings to accumulate with or without this
change's code. I flag this as genuinely uncertain rather than asserting
either direction.

**Not fixed here** — SDET does not edit production code, and this specific
surface (Next.js framework chrome) is not this change's file at all.
Candidate remedies, for whoever picks this up: (1) read the two issues
directly (`next dev` locally, open the same route, click the badge — the
fastest way to close the open question above); (2) if they are real and
this-change-caused, fix them; (3) either way, Next.js's `devIndicators`
config (`next.config.js`) can reposition or disable this indicator for local/e2e
dev servers without touching production, which would also resolve the
corner-contention problem at its root rather than per-corner-occupant.

### Finding B — a second burn-button click, after an already-completed first cycle, reaches the server zero times

**Where:** two specs, same shape, both new this run:

- `space-double-submit.spec.ts:185` ("Two activations in one tick submit one
  burn order") — `expect.poll(() => orders.length).toBe(2)` timed out at
  **1**, after `selectBody(page, bodyIds[1])` + a single `burn-button` click
  following an already-completed first burn+dock cycle.
- `space-double-submit.spec.ts:242` ("… submit one sale and mint one key") —
  `burnToBodyAndDock(page, fleetId, 'feat-station')`'s wait for `Under way`
  timed out; the row stayed `Docked at belt feat-belt-0` — again, a single
  `burn-button` click, following an already-completed mine.

**Confirmed by backend log, not inferred — zero server-side evidence of a
second burn in either case.** `grep -n "Fleet ordered to burn"` across the
entire rerun's backend log shows every fleet that ever committed a burn, and
how many times: fleet `fleet_616cfd35…` (the sale test) shows **exactly one**
burn commit, the first one (to the mineable body) — no second entry for the
station burn ever appears. Fleet `fleet_de16ebab…` (the burn-order test,
identified by its single `orders/preview` + `orders` pair at `07:23:02`, the
only burn-order-shaped account active in that window) likewise shows
**exactly one** burn commit total, not two. Neither `POST …/orders` nor
`POST …/orders/preview` fired again for either fleet after their respective
first cycle completed — this is not a rejected request (no 500, no 409 for
either fleet at any point after their first burn); it is a request that never
left the browser.

**What the failure screenshot rules out.** The sale test's failure screenshot
(`test-results/tests-space-double-submit--f21a3-…/test-failed-1.png`) shows
the Course panel with a fully-populated, valid quote — `Target feat-station`,
`Arrival in 0m 3s`, `Delta-v 99 m/s`, `Affordable`, `Burn` button rendered
enabled (not greyed, unlike a genuinely `disabled`-styled state) — so
selection and preview both worked. It also shows an amber
`commit-drift-notice`: *"Committed at delta-v … arriving now — no quote had
been shown."* That notice is driven by the panel's own `commit` state from a
**previous** successful order response; whether it is showing stale state
left over from the first (mineable-body) burn, or is otherwise implicated,
is not established by this artifact alone.

**Diagnosis: uncertain, and I am stating that rather than guessing further.**
What is established: the click reaches an enabled button (Playwright reports
no interception for this click, unlike Finding A), and no request reaches the
network. What is not established: why. Two observations bear on it without
resolving it:

- **Neither known backend residue matches.** `defect-station-order-500`
  requires a *server* response (a bodyless 500) — there is none here, no
  request was even sent. `defect-burn-cancels-running-mine.md` and
  `defect-post-sale-departure-burn-409s.md` both describe the server
  *accepting or rejecting* a request (a 200 that silently cancels a mine, or
  a 409) — neither describes the client never sending one. This is not a
  restatement of either open defect.
- **The general shape both open defects hypothesize — "a legitimate
  follow-on order shortly after a resolved action, refused or dropped by a
  stale channel/guard state" — recurs here for a third time, with a third
  concrete manifestation** (client-side non-submission, rather than a
  server-side 200-that-silently-cancels or a 409). Whether this is the same
  underlying mechanism wearing a different face, or an unrelated third issue,
  needs a developer with a live browser console to answer — something this
  SDET pass, working from post-hoc logs and screenshots alone, could not
  settle.
- **Neither test was edited, and neither is on the inherited-testid list**
  this change's own contract governs — these are ordinary, previously-green,
  pre-existing specs this change does not own. They are reported as findings
  against the tree, not against this change's test files.

**Not fixed here.** Reported for developer investigation with a browser
console attached to reproduce; the two fleet ids and timestamps above are the
starting point.

## QA's two BLOCKED rows — final state, neither closed green

Both under *The Strip Is Laptop-First and Never Overflows the View*:

| Row | State |
|---|---|
| **Every cell is inside the viewport at 1280×720** | **Still BLOCKED — never reached, in either run.** The journey's step 4 (the viewport/overlap check) sits after the chevron step; Run 1 stalled at the first chevron open, the rerun stalled at the second. Zero evidence either way. |
| **No other floating surface covers a strip cell** | **Still open, one layer deeper.** Run 1 caught `FloatingNav` (a product surface) covering the strip's fleet cell — fixed and verified gone. The rerun immediately caught a **second, distinct occupant of the same corner** — Next.js's dev-mode issues indicator (a test-environment surface, not a product one). The scenario itself — "no other floating surface covers a strip cell" — has now failed for two different reasons in two different runs. That the same corner produced two independent occupants on two consecutive passes is itself the finding: nothing yet confirms there is not a third. |

## The suite budget line

| Tier | Command | Run 1 | Rerun | Verdict |
|---|---|---|---|---|
| 4 | `cd frontend && npm run e2e` | 29.8m (1788s) | 28.5m (1710s) | Run 1: 20 passed/3 failed. Rerun: 20 passed/3 failed (2 of 3 new). |
| 3 | `npm run test:backend:all` | 1130.471s (~18.84m) | *(not rerun)* | All green — 1875 tests, 1 skipped, 0 failed |

Tier 3 vs. link 1's own figure: **1130.471s vs. 972s**, ~16% higher, well
inside the 90-minute (5400s) budget with substantial headroom. Neither tier
had any timeout raised or approached in either run. Tier 4's two runs are
within 5% of each other (1788s vs. 1710s) — no growth signal.

## What Travis must decide to unblock this gate

The chain's two-run budget is spent. Archiving is blocked on QA's two
BLOCKED rows, neither of which is closed green. The options, with their
costs:

1. **Fix Finding A (dev-overlay corner contention) and Finding B (silent
   second-burn non-submission), then spend a THIRD tier-4 run** outside this
   gate's normal budget — an explicit exception, not a default. Cost: at
   least one more `openspec-nextjs-dev` investigation cycle (Finding B in
   particular needs a live browser console, which no artifact-based pass can
   substitute for) plus this SDET's time to write and run the next
   confirming rerun. Benefit: both BLOCKED rows get a real, exercised
   verdict — this is the only option that actually proves the two scenarios
   QA flagged.
2. **Archive with the two rows still BLOCKED**, explicitly recorded as
   accepted risk with a follow-up change tracked to close them later — viable
   only if Travis judges the viewport/overlap guarantee non-critical for the
   near term. Cost: `system-console`'s own spec scenarios ship unverified
   against the real UI; if either is actually false in production (not just
   in the dev-mode e2e stack, for Finding A), nothing catches it until a
   player or a later change does. Finding B is the sharper risk here — it is
   a real product-facing burn-submission failure with no confirmed
   dev-only exemption, unlike Finding A.
3. **Narrow the journey's step 4 to skip past the two blocking legs and
   assert the viewport/overlap scenarios in isolation** (e.g. seed a fleet
   already parked in a foreign system via the API rather than driving the
   chevron to get there, or drop the cross-system chevron leg from this
   spec's path to the viewport check). This would let the two BLOCKED rows
   get a real verdict without waiting on Finding A/B's root cause. Cost: it
   is a test-shape change, not a production fix — Finding A and Finding B
   remain live, unfixed, and unverified-against by the journey; this option
   buys QA's two rows a verdict while leaving two open findings unresolved
   in the tree. Would need the same adjudication process Finding 3 got
   before this SDET touches the spec again.

This SDET's recommendation, stated as a lean and not a decision: option 1 for
Finding B (it looks product-facing and the mechanism is genuinely unknown —
worth a real fix before shipping), paired with the cheap first step of option
1's Finding A remedy (open the dev overlay locally and read the two issues,
~1 minute) before deciding whether Finding A needs a code change or is
already environment-only noise safe to leave.

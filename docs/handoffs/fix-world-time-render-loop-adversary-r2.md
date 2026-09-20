# Adversary round 2 — `fix-world-time-render-loop`

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer:
`openspec-adversary` (opus), read-only. **Round 2 of a maximum 3**, counted
across the whole change.

**Verdict: FINDINGS — 0 BLOCKER, 6 MAJOR, 6 MINOR. NEEDS REVISION.**

**Convergence: YES, and stated explicitly by the adversary.** All twelve
findings are residue of the round-1 repairs; none comes from re-attacking
untouched text; none is a BLOCKER. Eighteen of twenty round-1 findings are
cleanly FIXED, two PARTIALLY (M13 → N5, m16 → N6). This is the convergence
pattern the workflow skill describes: verify the residue, repair it, and do
**not** mount a third full attack.

**Verdict commit: NONE** — same as round 1. This run is not a chain link and
not `--full-auto`, and the orchestrator was not authorized to commit. The
change folder remains untracked, so neither verdict can be currency-checked by
diff later. Committing the change folder plus this directory's
`fix-world-time-render-loop-*` files is the one step that would pin them.

## Orchestrator rulings

**All twelve findings ACCEPTED.** One verified independently before ruling:

- **N2 — CONFIRMED, and it is the sharpest finding of the round.** The delta
  was about to write a client plumbing gap into a capability spec as though it
  were a fact about served data. Verified:
  - `openspec/specs/fleet-movement/spec.md:2598-2607` — "The scale SHALL be
    served **unconditionally**, on a world running at any scale, so a client
    never has to distinguish 'scale 1' from 'scale absent'."
  - `backend/fleet/handler.go:103-105` — the empty-list branch serves it too:
    `{"fleets": []fleetDTO{}, "worldTime": h.clock.Now(), "scale": h.clock.Scale()}`,
    with a comment citing that very requirement.
  - `frontend/lib/services/fleet-service.ts:41` — `return response.data.fleets ?? []`.
    The envelope's `scale` is discarded by the client. That, and only that, is
    why `myFleets?.[0]?.scale` is `undefined` for a fleetless requester.

  So "for a requester with no fleets [no scale has been served]" is false
  against a live backend requirement. Apply N2's narrowing **and** its task
  amendment (read the scale from the fleet-list envelope), which dissolves the
  fleetless branch rather than specifying it.

  Noted, not filed as separate drift: the dropped envelope field is a client
  gap this change's own task 3.4 now closes. It does not need its own record
  because it is being fixed here, in a change that already specifies the
  behaviour.

Two rulings on findings that touch this run's own decisions:

- **n1 — ACCEPTED, delete the sentence.** The adversary is right that naming
  OQ3 as "open at the time of writing" inside delta text is wrong: that text
  merges into `openspec/specs/system-space-view/spec.md` and would permanently
  assert an open question that will be closed, cite `design.md` from a
  capability spec, and re-import the HOW that B3's repair just removed. This
  was my instruction to the writer, and it over-reached — B3 asked for the
  *proposal* to name OQ3, which it does (`proposal.md:21-25`). The requirement
  binds either branch without naming them. Writer: delete that sentence from
  the delta only; leave the proposal's treatment intact.
- **n3 — ACCEPTED as a wording refinement, not a reversal of B2.** The
  adversary was asked to assess my B2 override and concluded the override was
  correct — a spec saying "SHALL commit" with no bound is unfalsifiable, and
  20 s is the only measured number. Its refinement stands: mark 20 s as a
  **ceiling taken from the journey budget, not a product target**, and drop
  "to obtain a green" (harness jargon that binds authors rather than
  implementations, in text that outlives the harness).

**Round 3 is a verification round only.** After the repair the adversary
re-checks these twelve and the clauses they touch — not a third full attack.
If round 3 finds only residue again, the change is presented with that residue
listed; any MAJOR still open at the cap becomes a follow-up change, and no
BLOCKER may ride forward.

---

# Adversary round 2 — `fix-world-time-render-loop`

Read this round: the round-1 report with rulings, all four change artifacts at their current revision, both deltas, the live `system-space-view` / `galaxy-view` / `fleet-roster` / `fleet-movement` specs, `add-vitals-strip`'s `system-console` clock-cell requirement, the defect record, and the code the repairs newly assert things about (`SpaceStage.tsx`, `SpaceCanvas.tsx`, `webgl/SpaceWorld.tsx`, `SystemSpaceView.tsx`, `GalaxyView.tsx`, `lib/services/fleet-service.ts`, `lib/types/fleet.ts`, `backend/fleet/handler.go`).

---

## 1. Verification of the twenty round-1 findings

| # | Status | Evidence (current text) |
|---|---|---|
| **B1** | **FIXED** | `specs/galaxy-view/spec.md:19-24` now names "the roster's burn redirect, which sends a fleet's burn command to that fleet's system view (`fleet-roster`'s *The Roster Row Is the Fleet Command Surface Where the Mounting View Provides None, Jump Gated by Attachment Alone*)" — title verified byte-exact at `openspec/specs/fleet-roster/spec.md:230`. The non-navigation lock is in at `:34-35`: "A roster row's *selection* on this view SHALL continue to select and reframe without navigating." `tasks.md:20` now says "a roster burn command on a fleet in another system". (Coverage gap for the new clause → **n5** below.) |
| **B2** | **FIXED as ruled** | Both deltas state the bound directly: `specs/system-space-view/spec.md:61-63` "SHALL commit, and SHALL arrive within 20 seconds of the action that requested it, a budget this capability SHALL NOT raise to obtain a green (provenance: `defect-cross-system-chevron-nav-stall.md`)"; identical at `specs/galaxy-view/spec.md:24-26`. All four navigation scenarios carry "within 20 seconds" (`system:120`, `galaxy:62-63, 68-69`). No reference to `docs/testing-tiers.md` survives in either delta. Assessment of the ruling → **n4**. |
| **B3** | **FIXED (marking), residue at one task** | `proposal.md:21-25` names OQ3 as open and lets Travis decide; `specs/system-space-view/spec.md:6` is now "from an animation-frame loop alone"; `design.md:323-326` opens Decision 7 with "**Conditional on OQ3.**"; branch notes present on tasks 4.2 (`tasks.md:31`), 4.3 (`:32`), 4.8 (`:39`), 4.9 (`:40`), plus 2.1 (`:8`), 4.3a (`:33`), 4.3b (`:34`). **One branch-dependent task was missed: 4.6** → **N3**. |
| **B4** | **FIXED** | All three artifacts now agree the state/effect/guard stay: `proposal.md:36-40` "the state, the effect and its `if (!available) return` guard all stay, React-written, now keyed on the coarse tick"; `tasks.md:36` "Re-key the `SpaceStage.tsx:200` effect … `drawWorldTime` state, `setDrawWorldTime`, and the `if (!available) return` guard all stay"; `design.md:281-288` unchanged. |
| **B5** | **FIXED, with a false parenthetical** | Hold rule at `specs/galaxy-view/spec.md:41-44`; scenario *The projected clock holds when no scale has been served* at `:77-80`; `tasks.md:19` now sources the scale from `myFleets?.[0]?.scale` alone and states "`Galaxy` has no `scale` field" (verified). But the clause's own enumeration of the unserved states is wrong → **N2**. |
| **M6** | **FIXED** | `specs/system-space-view/spec.md:83-84`: "**THEN** the position the loop writes to that mark's hit target has changed between those frames". |
| **M7** | **FIXED** | Both deltas now prohibit the third mechanism verbatim: `system:11-16` / `galaxy:4-10` — "in component state, in a React external store, or in any other value a component subscribes to per frame … A frame-rate subscription in a leaf is the same default-priority update at a smaller scope, and is equally prohibited." |
| **M8** | **FIXED** | Scenario `system:124` "left idle for at least five wall-clock seconds"; `tasks.md:10` "across at least 120 rAF frames (React's nested-update diagnostic needs ~50 consecutive nested commits …); record the test failing on the pre-fix tree". |
| **M9** | **FIXED** | `tasks.md:26` (3.7) is now a mechanism: "subscribes to `visibilitychange` and, when `document.visibilityState` becomes `visible`, recomputes from `clock.now()` immediately and restarts its interval … Test: with fake timers **not** advanced, dispatch `visibilitychange` …". |
| **M10** | **FIXED** | `system:90-91` "that figure's raw span (`data-raw`) has decreased by the elapsed world-millisecond span"; `galaxy:55-56` same shape. (Dangling pronoun introduced → **n6**.) |
| **M11** | **FIXED textually** | `design.md:340-343` "**Coarse membership reads the same basis (M11)**… Before the first frame publishes one, no mark is classified off-screen and no chip is offered"; `tasks.md:37` (4.6) carries the same sentence. The addendum's interaction with OQ3 (A) is **N3**. |
| **M12** | **FIXED for four of five; one new task cannot fail** | New tasks: 3.4b (`tasks.md:21`, roster countdown), 3.4c (`:22`, served scale), 3.4d (`:23`, hold), 4.3b (`:34`, hit target tracks its mark), 5.3a (`:47`, tier-4 galaxy navs or a recorded gap); 3.4a amended to "a call-site regression guard, not evidence about starvation … (design.md Decision 5)". Every scenario in both deltas now maps to a task. **3.4c is tautological** → **N4**. |
| **M13** | **PARTIALLY FIXED** | `design.md:492-497` now amends tasks as well as the spec. But the repair is stale against B5's own repair, and following it produces a worse state than either OQ4 branch → **N5**. |
| **M14** | **FIXED; adapted wording holds** | `system:64-69` — "A route transition renders at a lower priority than an ordinary state update. Measured on this view: … 4 of 6 solo repeats; with it silenced, 0 of 6 … Why React's own starved-lane expiry did not rescue the stalled case is not established." Matches the defect record (`:19`, `:42`). "can interrupt it indefinitely" is gone from both. The galaxy adaptation (`galaxy:26-33`) attributes the measurement to `system-space-view`, calls the shared mechanism "by construction", and states "this view's own navigations have not been separately measured" — **neither over- nor under-claims**; it is exactly what `defect-…-stall.md:53-56` and `proposal.md:110-113` support, and the galaxy requirement's basis survives independently of the measurement (the rewire in task 3.4 plus `proposal.md:63-70`'s load-bearing-call-site argument). One citation error in that sentence → **n7**. |
| **m15** | **FIXED** | `system:22-27` carries the "*at the scales this game runs*" qualifier and the "above a served scale of 60 … deliberate, accepted coarsening" sentence. |
| **m16** | **PARTIALLY FIXED** | `tasks.md:3` now lists `SpaceStage.sighting-ghost-selection-guard.test.tsx` ✓. The threshold restatement is ambiguous in its new position → **N6**. Task count is 35 (2+4+12+10+7), within the 40 cap. |
| **m17** | **FIXED** | `proposal.md:97-100`: "`SpaceStage.test.tsx` and `SpaceStage.renderer.test.tsx` assert `data-draw-world-time`; `data-world-time` has no assertion today, so the coarse value needs a new one (task 3.3)." |
| **m18** | **FIXED, but the wiring contradicts itself** | `design.md:102-110` "**Named caller (m18):** `GalaxyView`'s unserved-scale hold …"; `tasks.md:25` (3.6) "`hasReading()`'s named caller is `GalaxyView`'s unserved-scale hold (task 3.4, B5)". The hook contract this wiring depends on is stated two ways in one Decision → **N1**. |
| **m19** | **FIXED** | `proposal.md:101-104`: "**Also corrects a pre-existing defect** … point picks after a window resize currently unproject through a stale basis (`SpaceStage.tsx:172-176`, `[host]`-keyed and never updated on resize)". |
| **m20** | **FIXED** | `design.md:199-204` "**Which marks the one-writer rule binds (m20).** Contacts and sighting ghosts keep their React-written `left`/`top` … binds only the marks the loop positions … bodies, lane gates and own fleets." |

Nothing regressed a panel finding: `A-F1` (B4), `A-F7` (m20), `R-15` (M9), `R-9` (M14) all still hold, and the MODIFIED block is untouched.

---

## 2. New findings — all six MAJORs and all six MINORs are residue of the round-1 repairs

**Every finding below is in text the repairs introduced or rewrote.** There is nothing here from the untouched remainder. That is the convergence signal.

### MAJOR

#### N1 — The new `useWorldClock` anchoring precondition is stated two ways inside one Decision, and inside one task group; `hasReading()`'s caller works under only one reading

`design.md:104-106` (the m18/B5 repair): "`useWorldClock` re-anchors only when **both** a served world time and a served scale are available". `design.md:115-118`, eleven lines later, unchanged from the pre-repair draft: "`useWorldClock(serverWorldTime, scale)` holds one clock in a ref … and re-anchors it in an effect **whenever a fresh served reading or scale arrives**." Same split in tasks: `tasks.md:16` (3.2) "re-anchor on fresh reading **or** scale"; `tasks.md:19` (3.4) and `:25` (3.6) "only when both … have anchored the clock".

**What it permits.** An implementer building the hook from 3.2 and `design.md:115` ships a hook that anchors as soon as a world time arrives, with `scale` `undefined`. Then `hasReading()` is `true` on first mount, the hold branch never executes, and `projectWorldTime` runs with `scale: undefined` — the galaxy delta's hold clause (`specs/galaxy-view/spec.md:41-44`) is unsatisfied and the round-1 B5 hole is back, now with a `NaN` failure mode instead of an `?? 1` one. Task 3.6's assertion would fail against a hook the design also sanctions.

There is a second edge the repair did not close: `tasks.md:17` (3.3) tells the system view to "replace `useWorldTime` with the pair" without saying **which** scale it passes. `SystemSpaceView.tsx:423-424` holds two: `clockScale` (`… ?? 1`) and the un-defaulted `servedScale`. Under the both-required reading, an implementer symmetrising with the galaxy view and passing `servedScale` gets a clock that never anchors whenever the interior read serves no scale — `clock.now()` returns `0` (Decision 1) and the whole picture draws at world-time zero.

**Smallest fix.** Replace `design.md:115-118`'s clause with "…re-anchors it in an effect whenever a fresh served reading arrives **and a served scale is available** (see the named-caller paragraph above)", and `tasks.md:16` with "re-anchor when a fresh reading arrives and a scale is served; never anchor on a reading alone". Append to `tasks.md:17`: "pass `clockScale` (today's `?? 1` chain), not `servedScale` — this view's figures take `servedScale` separately and its clock must never fail to anchor."

#### N2 — The hold clause's "or for a requester with no fleets" contradicts `fleet-movement`'s unconditional-scale guarantee; the change writes a client plumbing gap into a capability spec as a served-data fact

`specs/galaxy-view/spec.md:41-44`: "WHILE no world-clock scale has been served — before the own-fleets read lands, **or for a requester with no fleets** — the view SHALL hold the last served world instant…"

The server serves the scale in that state. `openspec/specs/fleet-movement/spec.md:2599-2607` (*Fleet Reads Serve the Simulation Clock's Scale Alongside Their World Time*): "on `GET /v1/fleets/:fleetId` and on **every list form** of the fleet read … The scale SHALL be served **unconditionally** … so a client **never has to distinguish 'scale 1' from 'scale absent'**." The code matches, including the empty case — `backend/fleet/handler.go:104` returns `{"fleets": []fleetDTO{}, "worldTime": …, "scale": h.clock.Scale()}`, and every `fleetDTO` carries `Scale float64` unconditionally (`handler.go:639`). The client's blindness is self-inflicted: `frontend/lib/services/fleet-service.ts:41` is `return response.data.fleets ?? []` — the envelope's `scale` is discarded, which is the only reason `myFleets?.[0]?.scale` is `undefined` for a fleetless requester.

**What it permits.** The delta states as a durable fact ("no world-clock scale has been served") something the backend spec guarantees is false, and prescribes a permanent clock hold for a state where the correct fix is three lines in the service layer. It also forecloses that fix: an implementer reading the requirement builds the branch rather than reading the envelope, and the next author inherits a `galaxy-view` requirement that contradicts `fleet-movement`'s "never has to distinguish" sentence — the very branch that requirement was written to eliminate.

**Smallest fix.** Narrow the clause to the one genuinely unserved window and point at the real source: "WHILE no world-clock scale has been served — the own-fleets read has not yet landed, so the only served world time is the galaxy read's, which carries no scale — the view SHALL hold…". Amend `tasks.md:19` to take the scale from the fleet-list **envelope** (`fleet-movement`'s *Fleet Reads Serve the Simulation Clock's Scale…* serves it unconditionally, including on an empty list — `fleet-service.ts:41` currently drops it), falling back to the first fleet's `scale`; the fleetless branch then does not exist.

#### N3 — Task 4.6 is the branch-dependent assertion B3's repair missed, and the M11 addendum turns a transient state into a permanent one on the fail-soft path

`tasks.md:37` (4.6, rewritten for M11) carries no OQ3 note, unlike 4.2/4.3/4.3a/4.3b/4.8/4.9: "reading the same published basis the frame loop writes … before the first frame publishes one, no mark is classified off-screen and no chip is offered. **Test** that a mark crossing the viewport edge in either direction … gains or loses its off-screen affordance within one coarse tick."

Under OQ3 **(A)** the publisher is the GL `draw()`, which `design.md:224-232` establishes "never executes under any current vitest test" — so under (A) no basis is ever published under jsdom, no mark is ever classified off-screen, and 4.6's test can only ever observe "no chip", passing or failing for reasons unrelated to the behaviour. Worse in a real browser: `webgl/SpaceWorld.tsx:224-229` fails soft when `new THREE.WebGLRenderer` throws ("a driver that refused … this module simply does not draw"), while `SpaceCanvas.tsx:136` mounts the DOM layers on the **probe's** verdict (`{available && children}`, `available = guard.status === 'live'`). In that state under (A) the layers are mounted, no frame ever publishes a basis, and the addendum's "no chip is offered" becomes permanent — plus, with `SpaceStage.tsx:172-176`'s memos deleted (`tasks.md:39`), every hit target sits untransformed at the layer origin. Today React's own memo positions them.

**What it permits.** If Travis picks (A), the change as written ships a view that, on a GL-refusing driver, has stacked hit targets and no off-screen affordances at all — a regression against *Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch* and *Space View Picking Resolves…*, with no task that would catch it.

**Smallest fix.** Append to `tasks.md:37`: "— under OQ3 (B) the transform loop publishes the basis and this test runs under jsdom; under OQ3 (A) `draw()` is the publisher, so (a) this test has no unit-level surface and must be recorded as a tier-4-only assertion, and (b) the loop-less fail-soft path (`SpaceWorld.tsx:224-229` — probe live, renderer threw) must keep a React-computed basis for membership and target placement, since `SpaceCanvas` keeps the DOM layers mounted through it." Mirror the second half in `design.md:323-326`.

#### N4 — Task 3.4c cannot fail against the implementation its scenario exists to forbid

`tasks.md:22` (3.4c, added for M12): "with a served scale other than 1, `GalaxyView`'s projected world time between reads **matches the value the roster's own formatter is given at the same instant**."

The view passes one value to the roster (`GalaxyView.tsx:473`, `worldTime={worldTime}`). "The projected time matches the value handed to the roster" is true by construction of a single variable — it holds identically for a clock projecting at an assumed scale of 1, which is exactly `defect-galaxy-view-clock-ignores-served-scale.md` and exactly what scenario *The projected clock runs at the served scale* (`specs/galaxy-view/spec.md:71-75`) forbids. This is the M12 quality bar (a scenario whose task cannot go red) re-created by M12's own repair.

**Smallest fix.** `tasks.md:22` → "Unit test: with a served scale of `S ≠ 1` and no read landing, advance N wall-clock seconds with fake timers and assert `GalaxyView`'s projected world time advanced by `N × 1000 × S` world-milliseconds, not by `N × 1000` — and that the same value reaches the roster (*The projected clock runs at the served scale*)."

#### N5 — The OQ4 reversal instruction is stale against B5's repair: taken literally it now produces a galaxy clock frozen at epoch and re-opens B5 and m18

`design.md:492-497`: "drop the fourth paragraph and **its scenario** from `specs/galaxy-view/spec.md`'s ADDED requirement … and amend tasks.md 3.4 (and 3.4c/3.4d …) to **pass the scale the call site passes today — none, i.e. the projection keeps its assumed 1**".

Three problems, all created by the B5/m18 repairs landing after M13's:
1. The fourth paragraph now has **two** scenarios (`:71-75` and `:77-80`); "its scenario" is undecidable, and dropping only one leaves an orphan scenario asserting behaviour no requirement text states.
2. "Pass no scale … keeps its assumed 1" is no longer true of the hook this change now specifies: per `design.md:104-106` / `tasks.md:25` it anchors only when a scale is served, so passing none means the galaxy clock **never anchors**, `hasReading()` stays `false` forever, and `clock.now()` returns `0` (Decision 1) — every roster countdown reads from world-time zero. That is worse than both OQ4 branches and worse than today.
3. The reversal silently deletes `hasReading()`'s only named caller, re-opening m18, and deletes the hold rule, re-opening B5 — neither is acknowledged.

**Smallest fix.** Rewrite the reversal clause: "…drop the fourth paragraph **and both its scenarios** (*The projected clock runs at the served scale*, *The projected clock holds when no scale has been served*), amend tasks 3.4/3.4c/3.4d to pass a literal `1` as the scale (not *no* scale — `useWorldClock` anchors only on a served scale, so omitting it freezes the clock at 0), and note that under this branch `hasReading()` loses its named caller and should be dropped from Decision 1 (m18) while `defect-galaxy-view-clock-ignores-served-scale.md` stays open."

#### N6 — Task 1.1's restated stop-threshold has two readings, one of which halts the change immediately

`tasks.md:3` (the m16 repair): "**Count the assertions** in [six test files] that assert **membership** … **Record the count** in `…-rulings.md`. **If the total would exceed 40, stop and report** before writing code…"

The nearest antecedent of "the total" is the assertion count just recorded; the intended referent (per `design.md:381` and the rulings' cap) is this change's task count, currently 35. Membership assertions across six `SpaceStage`/`SystemSpaceView` suites will plausibly exceed 40 on their own, so a literal implementer stops and reports before writing a line — while an implementer taking the other reading never applies the gate the sizing task exists for. My round-1 wording caused this; it reads differently in position than it did in the finding.

**Smallest fix.** `tasks.md:3` → "Record the count … **If this change's task count would exceed 40** (it is 35 as written), stop and report before writing code…".

### MINOR

- **n1 — OQ3 is named inside durable spec text.** `specs/system-space-view/spec.md:8-10`: "Which loop that is — the existing GL draw loop, or a separate transform-writing loop extracted alongside it — is `design.md`'s OQ3, **open at the time of writing**; the requirement binds either way." This merges verbatim into `openspec/specs/system-space-view/spec.md`, where it will permanently assert a resolved question is open, cite an unqualified `design.md`, and re-import the HOW (`openspec-conventions`: "Requirements state WHAT, never HOW") that the B3 repair removed from the sentence above it. I am deliberately *not* calling this MAJOR — it permits no wrong implementation. **Fix:** delete the sentence from the delta; `proposal.md:21-25` already carries the OQ3 branch for the reader who needs it, which is what B3's fix asked for.
- **n2 — The galaxy delta cites a section that does not exist.** `specs/galaxy-view/spec.md:31-32`: "(design.md's Impact section, 'Unmeasured, stated')". `design.md` has no Impact section — the quoted text is `proposal.md:110-113`. Same class as the two factual errors RULING 4 corrected, in the M14 repair itself. **Fix:** "(this change's proposal, 'Unmeasured, stated')", or drop the parenthetical — the sentence is self-contained.
- **n3 — The 20-second bound is right to state; its wrapper is not spec text.** "a budget this capability SHALL NOT raise to obtain a green" (`system:62-63`, `galaxy:25-26`) binds future *authors*, not implementations, and "a green" is harness jargon in a requirement that outlives its harness. My assessment of the ruling, since it was asked: stating the bound directly was correct — it is the only measured number, and a capability spec that says "SHALL commit" with no bound is unfalsifiable. But 20 s is a *test ceiling*, not a product target, and the specs should say so or a future reader will treat a 19-second navigation as conforming quality. **Fix:** "…SHALL arrive within 20 seconds of the action that requested it — a ceiling taken from the journey budget this defect was measured against (`defect-cross-system-chevron-nav-stall.md`), not a target, and not to be relaxed."
- **n4 — Dangling pronoun in the M10-repaired scenario.** `specs/system-space-view/spec.md:87-91`: the GIVEN no longer names a figure ("the acting fleet is burning with a served arrival in the future"), but the THEN says "**that figure's** raw span". **Fix:** GIVEN → "…in the future, so a figure counts down to it"; or THEN → "the figure counting down to that arrival has a raw span (`data-raw`) that has decreased by…". The galaxy twin (`galaxy:52-57`) has no such gap.
- **n5 — B1's new non-navigation clause has no scenario and no task.** `specs/galaxy-view/spec.md:34-35` ("SHALL continue to select and reframe without navigating") is the one clause standing between an implementer and the behaviour change B1 was raised to prevent, and nothing verifies it. **Fix:** append to `tasks.md:20` (3.4a): "— and a roster **row selection** for a fleet in another system issues **no** `router.push`, only `setSelectedId` + `focusSystem` (`GalaxyView.tsx:248-253`)."
- **n6 — Task 3.4b's fixture will red against correct code unless it serves a scale.** `tasks.md:21` says only "with a burning own fleet". Under the hold rule the repair added, a fixture fleet without `scale` freezes the countdown, so `data-raw` does not decrease and 3.4b fails against a correct implementation — the repo's named "red against right code" trap. **Fix:** "…with a burning own fleet **whose read served a scale** (the hold branch, task 3.4d, covers the unserved case)". Worth naming 3.4d's observable surface in the same pass (the roster row's `data-raw`).

---

## 3. Verdict

**FINDINGS — 0 BLOCKER, 6 MAJOR, 6 MINOR.** NEEDS REVISION.

**Convergence statement, explicitly:** every one of the twelve findings above is residue of a round-1 repair — none comes from re-attacking untouched text, and none is a BLOCKER. Eighteen of twenty round-1 findings are cleanly fixed; M13 is partially fixed (N5) and m16 is partially fixed (N6). The two repairs the brief flagged for scrutiny both held: the B2 override is coherent and the number is defensible (n3 is a wording refinement, not a reversal), and M14's adapted galaxy wording neither over- nor under-claims. The change is implementable under either OQ3 branch **except** for task 4.6 (N3), which is the one branch-dependent assertion the B3 repair missed.

If only three are fixed before round 3: **N1** (the hook contract disagrees with itself, and the system view's scale argument is unpinned), **N3** (branch (A) plus the fail-soft path ships stacked hit targets and no chips), **N2** (the delta asserts something `fleet-movement` guarantees is false). N4 and N5 are single-sentence rewrites; every MINOR is one line.

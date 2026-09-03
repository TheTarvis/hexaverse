# Link 8b `add-scan-and-sightings-surface` — adversary round 4 + orchestrator rulings

**Why a fourth round.** Rounds 1–3 (commits `88008cf`, `924b5d1`, `864611e`) were
followed by an edit (`655ef4c`, the ETA-cushion relocation) and by 8a-2's archive,
which created the live `system-space-view` and `docked-fleet-actions` specs this
change's ADDED deltas extend. A verdict expires when the content it judged changes.
This round re-verified all sixteen prior repairs present, then attacked the current
text against the now-live specs. Verdict: **NOT CLEAR** — 1 blocker, 6 majors, 6 minors.

The architect's implementation-kickoff flags (`link8b-impl-contract.md` §6) are
routed here too so the writer gets ONE pass.

## Orchestrator rulings — binding, all findings ACCEPTED unless noted

| # | Finding | Ruling |
| --- | --- | --- |
| B1 | inbox + ghost-pile reads have no failure model | ACCEPT the ADDED requirement as pasted |
| M2 | "the action inbox" is two status-filtered reads | ACCEPT wording + scenario |
| M3 | sweeping your own docked host mints a sighting of yourself | ACCEPT the **preferred** fix (scanner excluded from minted records; clean-sweep if it was the only ship). This is a resolver change in `backend/disclosure/sighting.go`/`fleet/resolver.go` — add the Go task and the red test. Do NOT keep the behaviour. |
| M4 | settled report reads a type-agnostic bounded page | ACCEPT option (a): optional `type` filter on *Inbox by Actor Query Param*; the report reads `type=scan&status=done`. The done-path ordering/bound applies with or without `type`. Name BOTH composite indexes Travis owes: `(actor, status, resolvedAt desc)` and `(actor, type, status, resolvedAt desc)` on `actions`. |
| M5 | "after the interior refetch has completed" has no failure reading | ACCEPT wording + scenario |
| M6 | scan surface sits on the `docked-fleet-actions` panel but is specced under `system-space-view` | ACCEPT the **smallest** fix: requirements stay in `system-space-view`; pin the mount to "the `docked-fleet-actions` fleet panel — the same panel *Renderer Unavailability Is an Explicit State* already requires to stay mounted"; proposal Impact names `docked-fleet-actions` as a mount host with no delta. The architect's sibling `ScanControl.tsx` component is fine provided it renders inside that panel region. |
| M7 | no a11y / live-region requirement for the sweep | ACCEPT the ADDED requirement as pasted |
| m8 | `reasonCode` IS persisted now (7b) | ACCEPT: past-tense proposal/design; 3.11 becomes verify-only; 1.12/3.10 already say "check first" |
| m9 | "no host in range" is wrong copy for transit/running | ACCEPT |
| m10 | countdown time base has no scale | ACCEPT |
| m11 | guard must name `useSubmitGuard` | ACCEPT (task 5.10) |
| m12 | filed-vs-fizzled discriminator unnamed | ACCEPT: "no served reasonCode ⇒ filed; any reasonCode ⇒ fizzle; never parse `outcome`". AND: every resolver path that mints nothing SHALL carry a reason code — check `fleet/resolver.go`'s "scan already settled" path and add a Go task giving it one if it lacks one (name it, e.g. `alreadySettled`), so the client rule holds on every path. |
| m13 | citation drift + un-carved general rule | ACCEPT: fix citations; add the one-line MODIFIED on live `focused-scan` *A Focused Sweep Commits On the Sensor Channel* — reproduce EVERY existing scenario heading verbatim |
| PW | 10.2's ghost leg is unreachable for a single corporation once M3 closes | ACCEPT the split: 10.2a = the full UI journey ending in a **clean-sweep** record in the log with its report (commit → countdown → settle → report → row); 10.2b = a ghost leg whose target-naming record is **seeded directly into the test corporation's pile through the Firestore emulator** (declared test fixture, using the new digest doc id), asserting the ghost in the scene, its `asOf` label, and row↔ghost highlight both ways. Record as an open question for Travis whether a two-corporation journey is wanted later. |
| A1 | scene `'ghost'` kind already means the burn arrival ghost | Implementation uses mark kind `'sighting'`; spec prose unchanged except ONE parenthetical in *A Sighting Ghost Renders at Its Frozen Position*: "(a sighting ghost is a distinct mark from the burn's arrival ghost 8a-2 draws)". |
| A2 | task 10.5's range fizzle is not arrangeable at real-time scale | AMEND 10.5 to the lane-transit fizzle exactly as `link8b-impl-contract.md` §4.2 describes (dock at gate → commit sweep → commit jump; accept `laneTransit` or `leftSystem` copy; no record filed; not the generic fallback). State that the other three codes are unit-tested only. |
| A3 | rejection copy keys on server error strings | Out of scope; record in design.md Open Questions as a future `reasonCode`-on-rejection change. |
| A4 | belt member is mineable/dockable but unscannable, unstated | Orchestrator records in `decisions.md` at chain update; writer adds one sentence to Decision 17 acknowledging the asymmetry is intended. |
| A6 | scan-target GET performs a settling read, unlicensed | ACCEPT: add to *Eligible Scan Targets Are Served Per Fleet* one sentence licensing the read to settle the fleet's due actions through the same opportunistic fold `sighting-records` licenses for the interior read, so eligibility is computed against settled state. |
| A5, A7 | notes | no action |

## The adversary's report, verbatim

Gate output first: `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface` → `add-scan-and-sightings-surface: OK` (exit 0). `openspec validate add-scan-and-sightings-surface --strict` → `Change 'add-scan-and-sightings-surface' is valid` (exit 0).

Rounds 1–3 re-verified in the current text: all sixteen repairs are present, not merely claimed (inbox refetch requirement + scenarios; server-side `systemId` filter and the ghost layer sourced from it; the ≥128-bit unseeded digest with its cross-process scenario; refetch re-anchored to any own fleet in the open system; self-sweep excluded on both sides; the served world time deleted and its absence audited in 9.2b; the `action-dispatch` reasonCode delta; belt-member exclusion on both sides; ordering **and** bound on the `done` path plus the `(actor, status, resolvedAt desc)` index; host label as raw id with Decision 20's rejected alternatives; the derived orphan audit 9.2/9.2a; the ghost-with-no-loaded-row rule; the "check first whether already green" clauses in 1.12/3.10).

---

## BLOCKER

**1. Three new reads are added to a view whose live fan-in requirement enumerates four and mandates a per-read failure model — and the action-inbox read has no failure behavior at all.**

`openspec/specs/system-space-view/spec.md:33-36` (live, unmodified): *"The system SHALL render `/systems/:systemId` from **four reads this view issues itself**, plus the corporation session read"* and `:68-69`: *"**Every** offer and readout this view mounts SHALL be driven by the results of those reads"*, followed by `:84-117`, *"The reads SHALL fail independently, and no read's failure SHALL disable another read's surface"* with a bullet per read.

This change issues three more from the same view: the scan-target read (`specs/system-space-view/spec.md:3-14`), one action-inbox read per own fleet in the system (`tasks.md:278`, 4.10), and the system-filtered pile read (`specs/system-space-view/spec.md:339-343`). Failure is specified for the scan-target read (`:22-24`) and for the log's pile read (`specs/sighting-log/spec.md:151-157`) — **and for neither the inbox read nor the ghost layer's pile read**. Design Decision 10 (`design.md:369-400`) enumerates the four live requirements this change extends by addition; *System Space View Route and Data Fan-In* is not among them.

Exploit: an inbox read that 500s or times out yields "no running scan" to the client, which is indistinguishable from "no sweep". The implementer then re-offers the commit control — directly violating this change's own *"WHILE a sweep is running the commit control SHALL NOT be offered"* (`specs/system-space-view/spec.md:169-170`) — the player commits, and the server rejects the second sweep. Every scenario in the change still passes. The ghost layer's failed read likewise degrades to "this system has no sightings", the exact silent-omission failure Decision 14 exists to prevent.

Smallest fix — add one ADDED requirement to `specs/system-space-view/spec.md`:

```markdown
### Requirement: The Sweep Surface's Reads Fail Independently, Like Every Other Read This View Issues
The scan-target read, the action-inbox read, and the system-filtered sighting-pile
read are reads this view issues itself, and SHALL obey *System Space View Route and
Data Fan-In*'s independence rule: no one of them failing SHALL disable another's
surface, and each absence SHALL be attributed to its failed read rather than
presented as a fact about the world.

IF the action-inbox read for a fleet fails, THEN the system SHALL NOT present that
fleet as having no running sweep: it SHALL show that the sweep's state could not be
read, offer a retry, and SHALL NOT offer the scan commit control for that fleet
while its sweep state is unknown — a commit offered on an unread inbox is a commit
the server rejects for a sweep already running.

IF the ghost layer's pile read fails, THEN the system SHALL show that this system's
sightings could not be read, with a retry, and SHALL NOT render an empty scene as
"no sightings here".

#### Scenario: A failed inbox read withholds the commit control rather than re-offering it
- **GIVEN** the acting fleet has a running sweep and its action-inbox read fails
- **WHEN** the scan control is shown
- **THEN** it states that the sweep's state could not be read and offers a retry
- **AND** no scan commit control is offered for that fleet

#### Scenario: A failed ghost pile read is not an empty system
- **WHEN** the system-filtered pile read fails
- **THEN** the view states that this system's sightings could not be read and offers
  a retry, and no ghost absence is presented as "no sightings in this system"
```

---

## MAJOR

**2. "The action inbox" is one name for two status-filtered reads; refetching one of them re-creates the round-1 defect.**

`specs/system-space-view/spec.md:220-223`: *"the system SHALL refetch both the corporation's sighting pile for the open system and the **action inbox for the fleet whose sweep was due**"* (singular), and `tasks.md:339-342` (6.7) repeats it.

`GET /v1/actions` is status-filtered (`backend/action/handler.go:150-153`); the running window comes from `?status=running` (`frontend/lib/services/action-service.ts` `listRunning`) and the outcome from a new `?status=done` read (`tasks.md:262-265`, 4.6) — two queries, two cache keys, and an unfiltered read is neither ordered nor bounded (`backend/action/dao.go:148-177`), so one read cannot serve both. An implementer refetching only the running query ships "settles forever, no report"; refetching only the settled query ships "the countdown never clears". Both are precisely the failure commit 88008cf was written to close, and both pass every scenario here.

Fix — `specs/system-space-view/spec.md:220-223`, replace "the **action inbox for the fleet whose sweep was due**" with:

> **both of that fleet's action-inbox reads — the running-status read that carries the sweep's window and cancel id, and the settled-status read that carries its outcome, reason code, and acknowledged state**. Refetching one and not the other leaves the sweep counting down forever or its outcome unreported, indistinguishably from not refetching at all.

and add a scenario:

```markdown
#### Scenario: Both inbox reads are refetched, not one
- **GIVEN** a sweep whose ETA has just passed
- **WHEN** the post-settle refetches run
- **THEN** both the running-status and the settled-status inbox reads for that
  fleet are re-issued, and the sweep is neither still presented as running nor
  left without its outcome report
```

**3. The first sweep an ordinary player commits mints a sighting of their own fleet — and draws its ghost.**

`specs/focused-scan/spec.md:170-176` closes only `hostId == own fleet id`. It does not close *sweeping the body you are docked to*. `backend/disclosure/sighting.go:170-191` mints one record per id in `chainBeneath(w.Attachments, hostId)`, and `backend/disclosure/mask.go:70-97` walks attachments with **no owner filter and no masking test** — so a fleet docked at belt B that sweeps B is in its own result set. Range passes (distance ≈ 0), occlusion cannot fire (zero-length segment, `disclosure/occlusion.go:33-36`). A corporation has exactly one fleet (spawn is the only fleet-minter), so this is not a corner: it is the canonical mining position this change itself calls *"the ordinary case rather than a corner of one"* (`specs/focused-scan/spec.md:93-96`).

Consequences inside this change: a log row showing the player their own hull count and hull types (`specs/sighting-log/spec.md:26-28`), and a ghost drawn on top of their own live fleet mark, which *A Sighting Ghost Renders at Its Frozen Position* requires be *"visually distinct … from an own fleet"* (`specs/system-space-view/spec.md:344-346`) without saying what it means for the two to be the same fleet. It also spends the sensor channel and unmasks the scanner to learn nothing — verbatim Decision 13's rationale (`design.md:427-445`), reached by the route Decision 13 does not close. Secondarily, this is the *only* way a single corporation can produce a ghost at all, which bears on finding 7 below and on task 10.2.

Note the shipped behavior also contradicts the live rule it implements: `openspec/specs/focused-scan/spec.md:192-194` says *"mint one sighting record per ship **masked** at the target host"*, and a sweeping fleet is unmasked for its whole sweep (`:166-177`) — yet `chainBeneath` never consults masking.

Fix — either close it (preferred, symmetric with Decisions 13/17) by adding to `specs/focused-scan/spec.md`:

```markdown
### Requirement: A Sweep Never Files a Claim Against Its Own Scanner
The system SHALL exclude the scanning fleet from the set of ships a resolving
sweep mints records for, whatever host it swept — including the host the scanner
is itself attached to. A fleet docked at a body that sweeps that body would
otherwise file a sighting naming itself, at its own position, with its own
composition: a claim about a fleet whose every field its owner already reads in
full, drawn in that owner's own scene as a ghost of itself. If the scanner is the
only ship beneath the host, the sweep SHALL mint a clean-sweep record.

#### Scenario: A fleet sweeping the body it is docked to files no record of itself
- **GIVEN** a fleet docked at a belt, with no other ship attached beneath it
- **WHEN** it commits a focused scan against that belt and the sweep resolves
- **THEN** no sighting record names the scanning fleet
- **AND** a single clean-sweep record is minted for that host
```

…or, if Travis prefers to keep it, record it as an accepted behavior in design.md and add a `sighting-log`/ghost rule for a record naming an own fleet. Silence is the one option that ships a confusing surface.

**4. The settled-sweep report quantifies over all of a fleet's settled scans, but reads a bounded page of its settled actions of every type.**

`specs/system-space-view/spec.md:279-282`: *"the one with the greatest resolved-at world time **among that fleet's settled, unacknowledged scans**"*. Its only source is `GET /v1/actions?actor=&status=done`, which this change bounds to *"a named maximum"* (`specs/action-dispatch/spec.md:71-73`) and which has **no type filter** (`backend/action/handler.go:138-158` accepts `actor` and `status` only). Mines, burns, jumps, holds and releases all land in that same page.

Exploit: an implementer picks a bound of 20; a fleet that mines twenty times after a sweep pushes the unacknowledged scan off the page, and its report — the change's headline half — never appears, with no error and nothing to retry. The requirement as written is not satisfiable by the read the change specifies.

Fix — one of: (a) add a `type` filter to *Inbox by Actor Query Param* in the `action-dispatch` delta and require the report to read `type=scan&status=done`; or (b) if the bound is to stay type-agnostic, restate `specs/system-space-view/spec.md:279-282` as:

> The system SHALL report the acting fleet's most recently settled, unacknowledged focused scan **among the settled actions the bounded inbox read served** — the one with the greatest resolved-at world time, its ETA breaking a tie — and the bound SHALL be large enough that a scan settled while this view was last open cannot be displaced by the fleet's other settled actions before it is reported.

(a) is the smaller fix and removes the coupling entirely.

**5. "After the interior refetch has completed" has no reading for a failed refetch, and none for a successful read whose resolve fold failed.**

`specs/system-space-view/spec.md:220-221`: *"After the interior refetch that follows a sweep's ETA has **completed**, and only then …"*.

Two holes. (i) A failed interior refetch: chained-on-success, the followers never run and the sweep reads as settling with nothing scheduled to correct it (the ETA is past); chained-on-settle, the followers run against unsettled state and report a running sweep, again with nothing scheduled. (ii) The interior read's fold is *opportunistic* — `backend/system/handler.go:96-100` logs and continues when `ResolveDue` errors — so a `200` interior response does not mean the sweep settled. In both cases the only specified inbox trigger is this one chain.

Fix — append to that paragraph:

> IF that interior refetch fails, or completes without the sweep having settled, THEN the system SHALL re-attempt the interior refetch on the view's baseline refetch cadence and SHALL re-issue the follower reads after each such attempt, until the sweep is served as settled — the sweep's ETA is already past, so no further ETA-scheduled trigger exists to correct it.

plus a scenario asserting that a failed post-ETA interior refetch still lands the outcome report without user action.

**6. The scan surface meets `docked-fleet-actions`' stated boundary criterion verbatim, yet is specified under `system-space-view` — and the change names no `docked-fleet-actions` delta.**

Live `openspec/specs/system-space-view/spec.md:17-20`: *"The line between this capability and `docked-fleet-actions` is the canvas: anything a fleet can be commanded to do **from its own served state, with no scene and no selection**, lives there and stays usable when the canvas does not."* Live `openspec/specs/docked-fleet-actions/spec.md:4-13` repeats it and explicitly disclaims attachment as the criterion (`:15-24`: hold/release act on an orbiting fleet, the credit readout is corporation-scoped).

This change's own `specs/system-space-view/spec.md:531-535` says the scan surface *"is anchored to the acting fleet's own served state and to a server-served target list rather than to a canvas selection, and SHALL therefore remain invokable through **the fleet panel**"* — the criterion and the panel both belong to the other capability. `design.md:19-23` justifies the placement with *"a sweep requires no attachment"*, which is the one criterion `docked-fleet-actions` says is not the line. `proposal.md:136-138` lists no `docked-fleet-actions` delta, and Decision 10's "cannot MODIFY what does not exist" does not apply — that spec is live.

Exploit: "the fleet panel" resolves to `frontend/components/space/FleetActionsPanel.tsx` (a `docked-fleet-actions` component by its own header) for one implementer and to `SpaceCommandPanel.tsx` (`system-space-view`'s canvas-side command panel, whose burn control is selection-driven) for another; the canvas-unavailability behavior then differs by placement, and `system-space-view:976-978`'s "a control whose only effect is on the unavailable canvas SHALL be disabled or hidden" is adjacent to the wrong one.

Fix — smallest is to keep the requirements where they are and pin the mount: in `specs/system-space-view/spec.md:531-535` replace "the fleet panel" with "the `docked-fleet-actions` fleet panel — the same panel *Renderer Unavailability Is an Explicit State* already requires to stay mounted and usable", and add one line to `proposal.md`'s Impact naming `docked-fleet-actions` as a capability this change mounts a control onto. If Travis prefers the boundary rule to govern, the scan control's four requirements move to a `docked-fleet-actions` ADDED delta instead.

**7. The change adds an unattended state transition and four interactive controls with no accessibility requirement, in a capability that has three.**

Live `openspec/specs/system-space-view/spec.md:1714-1723`, *A Landed Resolution Is Announced to Assistive Technology*: *"WHEN a refetch lands a state transition the player was waiting on — an own fleet's burn arrival …, a jump arrival, or a mine run's completion — the system SHALL announce that transition through a polite live region"*, justified by *"These transitions arrive without user action … a purely visual change to a canvas mark and a panel's enabled state is invisible to assistive technology."*

A settled sweep is exactly that class (`specs/system-space-view/spec.md:252-258`: *"the sweep is no longer presented as settling, and its settled outcome is reported — **AND** none of this requires navigation, reload, or manual refresh"*), and it is absent from that enumeration — which Decision 10's list of extended-by-addition enumerations does not include. Nor does anything require the scan control, its target list, its cancel, the report's dismiss, or the log affordance to be keyboard-operable, in a view where every hit target, the camera, the recenter and the retry affordances all are (`:1198-1282`, `:1486-1568`).

Fix — one ADDED requirement:

```markdown
### Requirement: A Settled Sweep and the Scan Controls Are Reachable and Announced
WHEN a refetch lands the acting fleet's sweep as settled, the system SHALL announce
the outcome through a polite live region, naming whether records were filed or the
sweep returned nothing — the same treatment *A Landed Resolution Is Announced to
Assistive Technology* gives a burn arrival, a jump arrival, and a mine completion,
and for the same reason: the sweep settles without user action.

The scan control's target list, its commit, its cancel, the report's dismiss
affordance, and the affordance that opens the sighting log SHALL each be reachable
via Tab and activatable via Enter or Space, showing a visible focus indicator.

#### Scenario: A settled sweep is announced
- **WHEN** a refetch lands a settled sweep for the acting fleet
- **THEN** a polite live-region announcement names its outcome

#### Scenario: The sweep can be commanded and cancelled from the keyboard alone
- **WHEN** a keyboard-only player tabs through the fleet panel
- **THEN** the target list, the commit control, the cancel affordance, and the
  sighting-log affordance are each reachable and activatable with Enter or Space
```

---

## MINOR

**8. Two present-tense claims are now false: `reasonCode` is persisted.** `proposal.md:107` — *"**It does not today**: `ResolveOne`'s single `tx.Update` writes `status`, `outcome`, and `resolvedAt` and nothing else"* — and `design.md:538-554` (Decision 18). `add-stationkeep-hold-verb` landed it: `backend/action/dao.go:335-339` now writes `{Path: "reasonCode", Value: res.ReasonCode}` and the in-memory mirror `a.ReasonCode = res.ReasonCode` sits at the status flip, so `action/model.go:200-206`'s comment is now true and task 3.11's correction is moot. Tasks 1.12 and 3.10 already carry the "check first whether this is already green/done" clause, so implementation is safe; the prose is what is stale. Fix: past-tense both ("was not persisted until `add-stationkeep-hold-verb` landed it; this delta makes it a requirement rather than an accident"), and mark 3.11 as "verify the comment now matches; no edit if it does".

**9. "No host is in range" is served as copy for two states where it is untrue.** `specs/system-space-view/spec.md:21-22`: *"IF the served target set is empty, THEN the control SHALL state that no host is in range"*. The server also answers empty for a scanner in lane transit and for one with a running sweep (`specs/focused-scan/spec.md:15-23`). Fix: qualify — "…SHALL state that no host is in range, **except while the acting fleet's own served state explains the empty set — in lane transit, or already sweeping — in which case the control SHALL state that instead**."

**10. The countdown's time base is a read that serves no clock scale.** `specs/system-space-view/spec.md:162`: *"measured against the world time the read served"*. `GET /v1/actions` serves `worldTime` and no `scale` (`backend/action/handler.go:55-62`), while the interior and fleet reads serve both (`system/handler.go:193`, `fleet/handler.go:133`) — and `system-space-view:273-282` requires live world time be projected *"at the served world-clock scale, never at an assumed scale of 1"*. A ticking countdown anchored to the inbox alone runs at scale 1. Fix: "measured against **this view's projected world time (*Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously*'s scale-correct projection)**, the inbox supplying the ETA and the committed time only."

**11. The double-submit guard names no reuse of the shipped shared guard.** `specs/system-space-view/spec.md:127-134` and `tasks.md:316-321` (5.10/5.11) restate the synchronous-guard shape in full but never name `frontend/hooks/use-submit-guard.ts` — shipped by 8a-2 as *"the ONE shared synchronous double-submit guard … Consumed by sell, mine, refuel, burn and jump"*, with its own test file. Task 9.1 forbids a second running-scan hook; nothing forbids a second guard. Fix: append to 5.10 — "**adopt `useSubmitGuard` rather than writing a second guard**; a second implementation of this shape is the duplication 9.1 forbids for `useRunningScan`."

**12. Nothing names the field that distinguishes "filed records" from "fizzled".** `specs/system-space-view/spec.md:282-284` requires a filed-records report and a per-reason fizzle report, but no served field carries "this sweep minted N records": the action carries `outcome` (prose the spec forbids displaying) and `reasonCode`. The implicit rule is "reasonCode absent ⇒ filed", and it is wrong for one shipped path — `backend/fleet/resolver.go:145-147` returns `Outcome: "scan already settled"` with no reason code and no records, which would report as "records filed" over an empty log. Fix: state the rule — "A settled scan carrying **no** served reason code SHALL be reported as having filed records; one carrying any reason code SHALL be reported as a fizzle. The client SHALL NOT parse the action's `outcome` text to make this decision."

**13. Citation drift and one un-carved general rule.** Line citations predate 8a-2 (`design.md:600-606` cites `backend/system/fog.go:28-56` / `:78-89`; the DTO now sits at ~26-50 and `projectUnfogged` at ~104 — content still correct; `design.md:541` cites `action/dao.go:334-339`, now 335-339). Separately, the belt-member and self-sweep exclusions narrow live `focused-scan`'s *A Focused Sweep Commits On the Sensor Channel* (`openspec/specs/focused-scan/spec.md:11-13`: *"The scan's `hostId` SHALL name either a body, or a fleet owned by the scanning fleet's own corporation, present in the scanning fleet's own system"*) without a MODIFIED delta. They are logically compatible (that rule constrains the hostId, it does not promise acceptance), but after archive the general rule reads as if a belt member and the scanner were acceptable hosts. Fix: a one-line MODIFIED adding "— excluding a derived belt member and the scanning fleet itself (*A Fleet Is Never a Host For Its Own Sweep*)" to that sentence.

---

**Playwright mandate (10.2), answered directly:** the journey is *mountable* — `FleetActionsPanel` renders for any acting fleet, docked or not (`frontend/components/space/FleetActionsPanel.tsx:310-320` returns a panel for a null fleet and the full panel otherwise), and `SystemSpaceView.tsx:365-374` mounts it unconditionally, so a scan control hung there is reachable for an undocked fleet. But `tasks.md:486-488` requires the journey to end *"see the record appear in the log and **its ghost in the scene**"*, and a ghost requires a target-naming record — i.e. a ship masked beneath the swept host. A corporation gets exactly one fleet (spawn is the only minter) and spawn separation guarantees no second corporation in the same system, so the **only** single-corporation route to a ghost is finding 3's self-sighting. Either 10.2 is silently relying on a behavior finding 3 proposes to close, or it needs a fixture no task provisions. Add a task that either stages a second corporation's fleet into the system (a second signup plus a multi-lane transit — expensive) or splits 10.2 into a clean-sweep leg (log row, no ghost) plus a seeded-fixture ghost leg, and say which.

---

**Verdict: NOT CLEAR** — 1 blocker, 6 majors, 6 minors.
# Analysis — `clear-burn-preview-on-commit` (system-HUD chain, link 2a-iii)

Read-only analysis at `b695eeb`. No stack booted and no test run: every code claim below is from reading source, not from execution. Root: `/Users/travis/Projects/hexaverse`. `openspec list` reports no active changes, so nothing in flight conflicts.

**Headlines**

- Both drift records are **confirmed**. The stranding drift is wider than recorded: the stop command's response carries the same warning and is also unrendered.
- The wire **can** distinguish every end-of-life path with no backend field. The order's identity is the pair of integers `state.Burn.DepartMs` / `state.Burn.ArriveMs`, present on both the commit response and the own-fleets read. No action id is served.
- The chain doc undercounts again. It names one MODIFIED requirement plus "likely" one more; the change needs 2 ADDED and 3 MODIFIED in `system-space-view`, plus one recorded reading.
- Estimate is **39–41 tasks before the panel**, so a seam is proposed (section 7).
- Two adjacent defects found by the figure sweep, neither filed: the commit response carries **no delta-v**, so the drift notice renders after every real commit; and a point-target burn serves `BodyId: ""`, not `null`.

---

## 1. Verification of the two drift records

### 1a. `drift-preview-does-not-clear-on-commit.md` — CONFIRMED

- **Spec.** `openspec/specs/system-space-view/spec.md:560-564`: "The preview SHALL refresh … while it remains shown and the selection is uncommitted … and SHALL clear when the selection is cleared or replaced, or when an order commits." None of the requirement's 20 scenarios exercises the last clause; `:590` covers only "cleared or replaced".
- **Code.** `frontend/components/space/SystemSpaceView.tsx:740-748`: the flag is `previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget`. There is no commit term.
- `frontend/components/space/SpaceCommandPanel.tsx:138-155`: the success callback releases the guard, sets the panel-local `commit` figures and toasts. It touches neither the selection nor the preview, and makes no callback to the view.
- `frontend/hooks/use-fleets.ts:43-47,72`: a successful order invalidates `fleets.mine`, `fleets.detail` and `systemSpace.detail`, not the `burn-preview` key. The preview keeps polling every `PREVIEW_REFRESH_MS` (10 s, `frontend/lib/realtime.ts`) as a re-target quote to the target already being flown to.
- **Tests.** Nothing in `SystemSpaceView.burn-preview.test.tsx` (19 tests) or `SpaceCommandPanel.test.tsx` (36 tests) asserts a clear on commit.

### 1b. `drift-commit-stranding-warning-not-rendered.md` — CONFIRMED, with three corrections

**Does the served commit response carry it? Yes.**

- `backend/fleet/handler.go:233`: `Order` answers through `respondWithStrandingWarning`.
- `backend/fleet/handler.go:445-448`: `orderStrandingWarningDTO { fleetDTO; StrandingWarning bool \`json:"strandingWarning,omitempty"\` }`. The field is present only when true.
- `backend/fleet/service.go:892`: set in `OrderTo`. `backend/fleet/model.go:157`: `json:"-" firestore:"-"`, so it is never on an ordinary read.
- `frontend/lib/types/fleet.ts:178`: `strandingWarning?: boolean` on `Fleet`. `frontend/lib/services/fleet-service.ts:62-65` returns `response.data` unchanged.

**Does anything on the system space view render it? No.**

- A grep of non-test `frontend/{components,hooks,lib,app}` for `stranding` finds two type declarations (`fleet.ts:178`, `:210`) and one read: `SpaceCommandPanel.tsx:280-284`, which is `preview?.strandingWarning`, the preview's field.
- The commit success callback (`SpaceCommandPanel.tsx:138-155`) reads only `settled.state.Burn.ArriveMs` and `.DeltaV`.
- `useOrder` has exactly one caller, `SpaceCommandPanel.tsx:115`. No vitest or e2e test asserts a commit-time stranding notice.

**Corrections to the record.**

1. The line reference `SpaceCommandPanel.tsx:275` is stale; the read is at `:280-284`.
2. **Stop carries the same field and is equally unrendered.** `backend/fleet/handler.go:351` answers `Stop` through `respondWithStrandingWarning`, and `service.go:1436` sets it on the above-the-floor branch. `FleetActionsPanel.tsx:583` and `GalaxyView.tsx:304` call `stop.mutate` and discard the response. The live `fleet-movement` text ("on an otherwise-accepted burn commit", `spec.md:1145`) arguably covers a stop's nulling burn. The chain row's "`fleet-roster` drift closed" would therefore be only partly true (see Q6).
3. The existing preview copy says "unable to reach a station" (`SpaceCommandPanel.tsx:282`). The served condition is "a station **or lane-gate body**" (`fleet-movement/spec.md:1145`). Any new notice copy should not repeat that inaccuracy.

Per this change's RULING 2, the stranding clause is in scope for the burn command's commit.

---

## 2. What the wire lets the client observe

### The two sources

| Source | Shape | Notes |
| --- | --- | --- |
| Commit response, `POST /v1/fleets/:id/orders` 200 | `fleetDTO` (`handler.go:610-644`) plus `strandingWarning` when true | `state.Mode: 0`; `state.Burn` with `Target{BodyId, Point}`, `DepartMs`, `ArriveMs`; `attachedTo` cleared (`service.go:900`); `worldTime`, `scale`, `roster` |
| Own-fleets read, `GET /v1/fleets?mine=true` | `{fleets, worldTime, scale}`, each fleet the same DTO without `strandingWarning` | `ListForCorp` settles a due arrival on read (`service.go:404-452`) and returns the fleet **unsettled** if the body table or the settle fails |

**What identifies the running order.**

- **No action id is served.** `fleetDTO` has no `activeActionId`; that field exists only on the stored model (`model.go:107`).
- The commit response and the read carry the same stored burn. `DepartMs` is the server's world instant at the solve (`service.go` `solveOrder`, `now := s.clock.Now()`, passed to `space.SolveBurn`). `ArriveMs` is quantized to an integer.
- So **`(DepartMs, ArriveMs)` is an exact-equality identity** available at both ends. `Target` is also on both.
- The running-action inbox could supply an id, but the commit response gives no id to match it against, and using it would add a read to this view.

**When the read refreshes.** Only three triggers exist:

- A mutation's invalidation from this tab (`use-fleets.ts:43-47`; `invalidateQueries` cancels an in-flight fetch by default).
- The ETA-scheduled refetch (`SystemSpaceView.tsx:542-565`).
- The 20 s baseline poll (`BOARD_POLL_MS`, `:578-582`).

I found no non-test code that dispatches `sse-reconnect`, so there is no event-driven refresh.

### Each end-of-life path

| Path | What the read shows | Lag before the view knows | Distinguishable? |
| --- | --- | --- | --- |
| Order running | `Mode 0`, `Burn.DepartMs/ArriveMs` equal to the commit response's | — | Yes |
| Gap after commit success | Cached pre-commit state (parked, or the earlier burn) | One round trip (the invalidated read) | Only by ordering: has a read answered since the acceptance? The read itself looks like "not this burn" |
| Cut drive from this view | `Mode 2`, `Drift` set, `Burn` null (`service.go:1153-1233`) | One round trip after the cut-drive response (`use-fleets.ts:78-87`) | Yes |
| Stop, above the speed floor | `Mode 0`, a **new** burn: `Target.Point` (a lead point), new `DepartMs` and `ArriveMs` (`service.go:1340-1440`) | One round trip | Yes, by `DepartMs`, and by `Target` |
| Stop, at or below the floor | `Mode 1`, `Park.Kind 2` (point), no attachment (`service.go:1296-1335`) | One round trip | Yes |
| Arrival at a body | `Mode 1`, park, `attachedTo` = the body id | ETA-scheduled refetch: `ArriveMs` plus `ETA_CUSHION_MS` (400 ms wall) plus a round trip | Yes; the docked-at-target withheld state then takes over |
| Arrival at a point | `Mode 1`, `Park.Kind 2`, `attachedTo` absent | Same | Yes |
| Arrival not settled (degraded read) | Still `Mode 0` with `ArriveMs` in the past | Until a later read settles it | Only by comparing `ArriveMs` with the projected clock (see Q4) |
| Re-task from another tab or the agent, different target | `Mode 0`, different `DepartMs`, `ArriveMs`, `Target` | Up to `BOARD_POLL_MS` (20 s) plus a round trip | Yes |
| Re-task from outside, **same** target | `Mode 0`, same `Target`, different `DepartMs` | Same | By identity yes; by target no (see Q1) |
| Burn settles inside the commit round trip | First read after commit shows park or attachment, never the burn | One round trip | Yes, given the ordering rule |
| First post-commit read fails | React Query keeps the pre-commit `data`; `fleets.isError` true | Until a retry succeeds | The failure is observable (`errorUpdatedAt`); the order's state is not (see Q3) |
| Reload or remount mid-burn | Read shows the burn; no commit response is in hand | — | By target yes; by identity no (see Q1) |

### Three things to say plainly

1. **No case needs a backend field.** The wire distinguishes every path B1 names.
2. **The point-arrival path ends in a pre-existing dead end.** A fleet parked at its selected point has no withheld state: "A selected point is never a fleet's host" (`spec.md:516`). When the committed state ends there, the preview resumes for a zero-length solve and the server answers 500 (`defect-zero-length-burn-returns-500.md`), giving "No quote" and Retry each interval. This is today's behaviour, it is the filed follow-up's territory, and this link neither worsens nor fixes it. The spec for this link must not promise a quote after a point arrival.
3. **During the gap two surfaces disagree by construction.** The command panel knows the commit from its response; the roster row, the strip pill and the canvas read the own-fleets cache and still show the pre-commit state for one round trip. The journey must key "quote gone" on the panel, not on the row's "under way" (the 2a-ii lesson).

---

## 3. Capabilities and every requirement touched

All deltas are to existing capabilities; no new capability. The verdicts below assume the recommendations in section 8 (Q1 identity, Q2 burn unavailable). Where another option changes a verdict it is noted.

### `system-space-view` (`openspec/specs/system-space-view/spec.md`)

| `### Requirement:` header (verbatim) | Line | Scenarios now | Verdict |
| --- | --- | --- | --- |
| `### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing` | 478 | 20 | **MODIFIED** |
| `### Requirement: A Failed or Stale Preview Is Never Presented as a Current Quote` | 716 | 9 | **MODIFIED** (the chain doc does not name it) |
| `### Requirement: Burn and Jump Commit Controls Guard Against Double-Submit` | 884 | 4 | **MODIFIED** under Q2 option A; no delta under option B |
| `### Requirement: Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly` | 963 | 6 | **No delta, reading recorded** (Q7) |
| `### Requirement: A Burn Commit Is Quote-Locked to the Preview the Player Agreed To` | 807 | 3 | No delta — verified |
| `### Requirement: Burn Commit Reports Its Outcome` | 847 | 3 | No delta — verified |
| `### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One` | 919 | 3 | No delta from this change; **already false in production** (section 6) |
| `### Requirement: System Space View Route and Data Fan-In` | 32 | 15 | No delta — verified |
| `### Requirement: A Landed Resolution Is Announced to Assistive Technology` | 2002 | 4 | No delta — verified |
| `### Requirement: Realtime Refetch Rules While the Space View Is Open` | 1164 | 5 | No delta — verified |
| `### Requirement: Animation Never Re-Renders the View, and Never Starves a Navigation` | 2911 | 7 | No delta; constrains the implementation |
| `### Requirement: Departure Hand-Off to the Galaxy View` | 1099 | 3 | No delta |
| (new) the committed state's definition and lifetime | — | — | **ADDED** |
| (new) the commit's stranding notice on this view | — | — | **ADDED** |

**Why each MODIFIED is unavoidable.**

*Burn Preview Reflects…* Four pieces of its text become false or dangling:

- `:496-497` "none of the **three** withheld states below holds" and `:504` "in any of **three** withheld states". A committed selection is a fourth.
- `:519-523` "The withheld states change what the view requests and shows, **not whether the burn command is available**". False for the fourth state under option A.
- `:560-564`, the commit clause. It must point at the new requirement and say which orders it means (Q8).
- Three scenario bodies enumerate "a running mine, … lane transit, or … own host" as the withheld set (`:686`, `:703`, and Failed-or-Stale's `:794`).

The requirement's generic rules already cover a fourth withheld state without edits, and the hook already implements them for any term of the flag (`use-burn-preview.ts:72-91`): resume at the transition, present nothing from before (`:544-550`); no retry or re-quote while withheld (`:552-556`); silence (`:557-558`).

Architect A2's contradiction is real against the current text. "In particular a preview SHALL be requested while the acting fleet is **burning**" (`:498`) must be read with the fourth state as an exception. The scenario *A burning fleet's re-target is previewed* (`:584`) says "a **different** body" and stays true verbatim.

*A Failed or Stale Preview…* The no-label list at `:745-748` is a deliberately closed enumeration of four unavailable states; the archived design's Decision 10 says it was enumerated rather than written as "unavailable for any reason". A fifth state has to join it, and the scenario at `:801` enumerates the same four. The paragraph at `:742-745` ("A preview that is not requested (the withheld states…) is not a failed preview") covers the new state as written.

*Burn and Jump Commit Controls Guard Against Double-Submit.* The scenario at `:914-917` says "the new attempt submits normally", with no qualifier. Under option A, after a **successful** burn commit the same control on the same selection cannot be activated. The smallest honest edit is the one 2a-ii made to *The burn stays committable…*: a GIVEN "no other requirement makes the command unavailable", plus one new scenario.

Warning for the writer: that requirement's first sentence ("SHALL each be disabled from the moment of commit") is not what the code renders. `SpaceCommandPanel.tsx:319` has no in-flight term; the guard is a ref (`use-submit-guard.ts`). This is recorded as possible drift in `followup-explain-withheld-burn-command.md` and is fenced out of this link. Carry the sentence verbatim and expect the adversary to raise it; the answer is that file.

**The "no delta" hypotheses, each checked.**

- *Quote-Locked.* The cap derives from `currentQuote`. In the committed state there is no quote and, under option A, no commit. A cap rejection happens on failure, which creates no committed state. The re-quote bound is already generic in the preview requirement (`:553-556`).
- *Burn Commit Reports Its Outcome.* The toast is untouched. The stranding notice is additive, and `fleet-roster` already forbids suppressing the success feedback.
- *A Commit's Actual Result…* The previewed figures are captured at click time into panel state (`SpaceCommandPanel.tsx:131,147`), so clearing the quote does not remove them. Architect A12's wording trap still applies (a stale shown quote yields "no quote had been shown").
- *Fan-In.* Its text names no preview, quote or command-panel prop (lines 32-248 grepped). No read is added, provided the mechanism does not add an inbox read.
- *Landed Resolution.* The committed state ending is not a landing. The existing landing announcements are unedited.
- *Realtime Refetch Rules.* No rule is added. The committed state's lag is stated in terms of the existing three triggers.

### `fleet-roster` (`openspec/specs/fleet-roster/spec.md`)

| Header (verbatim) | Line | Scenarios | Verdict |
| --- | --- | --- | --- |
| `### Requirement: A Burn Commit's Stranding Warning Is Surfaced to the Player` | 205 | 3 | **No delta** — the chain doc's hypothesis holds for the text |
| `### Requirement: The Roster Row Shows a Persistent Stranded Indication` | 174 | 3 | No delta |

The requirement is surface-neutral: "render it to the player as a visible, non-blocking notice distinct from an error toast". All three scenarios become true for the burn command with a notice on the command surface. It states no lifetime and no placement; those belong in the ADDED `system-space-view` requirement. The drift is only **partly** closed because of the stop command (Q6).

### Other capabilities checked — no delta

- **`system-console`.** No requirement mentions a quote or a commit state. *The Strip Issues No Read of Its Own* (`:651`) is unaffected because nothing is passed to the strip in this link. The pill reads the shared derivation.
- **`docked-fleet-actions`.** Cut drive and stop are not edited. They already invalidate the own-fleets read, which is what ends the committed state. *Running Mine Gates the Fleet Panel's Commands* (`:584`) is unaffected.
- **`fleet-movement`.** Backend contract; nothing changes.
- **`figure-formatting`.** No delta provided the change renders no new figure. I recommend it renders none (section 6).

---

## 4. Proposed requirements and scenarios

Bracketed `[Qn]` marks text that depends on an open question. INFERRED marks a scenario the design implies but does not state.

### ADDED (system-space-view) — suggested name: *A Committed Burn Withholds Its Quote and the Burn Command for That Selection Until the Order Ends*

Requirement text, in substance:

- WHEN a burn order for the current selection is accepted, the view SHALL remove that selection's preview figures, ceiling and cap, and SHALL request no preview for it. This is a fourth withheld state of *Burn Preview Reflects…*.
- The state is defined against reads: it holds for an acting fleet and a selection while **the order this view committed for that fleet and that selection is, as the own-fleets read last reported, still that fleet's running burn** [Q1].
- From the acceptance until the first own-fleets read answered after it, the order SHALL be taken to be running [Q3 for a failed read].
- The state SHALL end, with no user action and no selection change, at the first such read that does not report that order as the fleet's running burn. The cases: the drive was cut; a stop replaced it; it arrived; another order replaced it, from this view or elsewhere.
- The lag is named. A change made from this view is known one own-fleets round trip after its response. A change made elsewhere is known at the next read, at most one baseline poll interval later. Until then the view acts on its previous read.
- While the state holds the view SHALL state that an order is committed to the selected target, SHALL NOT show the uncapped-burn label, the no-quote state, a stale marking or a retry, and the burn command SHALL be unavailable for that selection [Q2].
- The state is keyed to the fleet and selection held when the command was invoked, not when the response landed.
- A rejected or failed commit enters no such state.
- Entering and leaving the state SHALL NOT be announced through a live region.

Scenarios:

1. *A committed order removes the quote and sends no further preview request.* GIVEN a current preview for the selection; WHEN the burn commits successfully; THEN no arrival, delta-v, fuel or ceiling figure is shown, the selection is unchanged, and no preview request is sent across several refresh intervals.
2. *The committed state holds before the own-fleets read reports the burn.* GIVEN the commit was accepted and the refreshed read has not answered; THEN the committed statement is shown, no preview request is sent, and the burn command is unavailable.
3. *A read begun before the commit and answered after it does not end the state.* (INFERRED; pins the ordering rule.)
4. *Cutting the drive ends it.* GIVEN the committed state for the kept selection; WHEN the drive is cut and the read reports the fleet drifting; THEN the statement is removed, a preview request is sent at that transition, and the burn command is available. Nothing from the pre-commit quote is shown while that request is pending.
5. *A stop ends it.* Two arrangements: the read reports a different burn (above the floor), or a point park (at or below it).
6. *Arrival at a body hands over to the docked-at-target state.* WHEN the read reports the fleet attached to the selected body; THEN the committed statement is removed and no preview request is sent.
7. *Arrival at a point ends it.* WHEN the read reports the fleet parked with no attachment; THEN the statement is removed and a preview request is sent for the kept point. The THEN must **not** assert that figures render (section 2, item 2).
8. *An order placed elsewhere ends it.* WHEN the read reports a running burn that is not the committed one; THEN the statement is removed and a preview request is sent for the kept selection.
9. *A different selection during the committed order is previewed.* The live *A burning fleet's re-target is previewed* stays true; this scenario adds that re-selecting the committed target while its order still runs returns to the committed state with no preview request. [Q1: holds under identity and under target-match.]
10. *A response that lands after the selection was replaced does not withhold the new selection's preview.* (Architect A4 item 2.)
11. *Switching the acting fleet and back.* GIVEN fleet A committed to the selection, then fleet B made acting, then A again while A's order still runs; THEN B's preview is requested while B is acting, and the committed state holds for A on return. (A4 items 1 and 3, restated for an identity record; needs a per-fleet record.)
12. *A rejected commit changes nothing.* WHEN the commit is rejected, including a cap rejection; THEN no committed statement is shown, the burn command stays available, and the cap rejection re-quotes as *Quote-Locked* requires.
13. *The first read after the commit fails.* [Q3]
14. *No second order leaves the client while the state holds.* WHEN the burn control is activated; THEN no order request is sent. [Q2 option A. Under option B this becomes "submitted with no `maxFuelTons`, labelled uncapped beforehand", which is UX F2's hazard.]
15. *The committed state is silent.* No live-region announcement on entry or exit; landing announcements unaffected, each firing once.
16. *A burn the view did not commit is not a committed selection.* GIVEN the view was opened with the acting fleet already burning toward a body and that body is selected; THEN a preview is requested. [Q1: true under identity; **inverted** under target-match.]

### ADDED (system-space-view) — suggested name: *A Burn Commit's Stranding Warning Stays on the Command Surface While That Order Runs*

Requirement text, in substance: WHEN a burn commit's response carries the stranding warning, the view SHALL show a notice distinct from error styling and from the preview's own stranding line, alongside the success feedback. The notice SHALL remain while that order is the fleet's running burn as last read (the same determination as above, including the gap) and SHALL be removed when it ends. It SHALL NOT depend on the preview being shown. The persistent indication after the order ends is `fleet-roster`'s served `stranded`. [Q5: form, whether it is tied to the selection, announcement.]

Scenarios:

1. *The warning is shown although the quote was cleared.* WHEN the response carries the warning; THEN the success feedback is shown, the notice is shown, and no preview figure is shown.
2. *No warning, no notice.* (Wire fact: the field is omitted, not false. Test with the key absent.)
3. *The notice ends with the order.* WHEN the read reports the order no longer running (cut drive); THEN the notice is removed.
4. *The notice survives a selection change.* [Q5]
5. *The notice belongs to the fleet that committed.* WHEN another own fleet becomes acting; THEN the notice is not shown for it. (INFERRED)
6. *The notice is not error-styled.* (Carries `fleet-roster`'s third scenario to this surface.)

### MODIFIED *Burn Preview Reflects the Server-Solved Order, Without Committing*

Carry all 20 scenario headings verbatim. Text edits: "three" becomes four (`:496`, `:504`); a fourth bullet pointing at the new requirement; the sentence at `:519-523` scoped to the three states it is still true of; the commit clause at `:560-564` reworded per Q8. Scenario body edits: add the committed state to the enumerations at `:686-689` and `:703-706`, or leave those bodies byte-identical and cover the new state only in the ADDED requirement. I recommend leaving them and covering it in the ADDED requirement: fewer edited bodies, fewer adversary targets. Tabulate every edited body, as 2a-ii's design did.

### MODIFIED *A Failed or Stale Preview Is Never Presented as a Current Quote*

Carry all 9 headings. Edits: the no-label enumeration at `:745-748` and the scenario body at `:801-805` gain the committed state.

### MODIFIED *Burn and Jump Commit Controls Guard Against Double-Submit* (option A only)

Carry all 4 headings. Edit the body of *The guard releases when the request settles or fails* with a GIVEN. Add one scenario: after a successful burn commit the guard is released, and the control's unavailability for that selection is the committed state's, not the guard's.

---

## 5. Candidate mechanisms for the committed state's lifetime

Facts all candidates share:

- The mutation lives in the panel (`SpaceCommandPanel.tsx:115`); the preview flag lives in the view (`SystemSpaceView.tsx:743`).
- The view already takes a commit notification from a child and bridges a commit-to-read gap by comparing a marker against a read's `dataUpdatedAt` and `errorUpdatedAt`: the scan's `committedPending` (`SystemSpaceView.tsx:339-358`, specified at `spec.md:2219-2252`).
- The hook already discards on disable and refetches on resume (`use-burn-preview.ts:80-91`), so any new term of the flag gets the resume rule for free.

| Mechanism | How | Ends with the order? | Gap | Reload / outside order | Risks |
| --- | --- | --- | --- | --- | --- |
| **M0. Stored `(fleet, selection)` pair** (RULING 7, withdrawn) | Compare the pair to the live acting fleet and selection | **No** — B1 | Trivially | No | Rejected; listed for the record |
| **M1. Order identity from the commit response** | The panel reports `{fleetId, selectionKey}` captured at click plus the response's `Burn.DepartMs`, `Burn.ArriveMs` and `strandingWarning`. The view keeps one record per fleet. Committed means: record matches the acting fleet and selection, and either no own-fleets read has answered since the acceptance or the read shows `Mode 0` with the same two integers | Yes, every path in section 2 | Marker against `dataUpdatedAt`, the in-file precedent | No. A burn the view did not commit is previewed as a re-target, as today and as `:498-502` requires | Two presentations of one world state depending on mount history (adversary bait). Must be per-fleet or the A→B→A case breaks. The record must live in the view, not the panel, or link 2b's tab remount loses it |
| **M2. Target match on the read** | No identity. Committed means the acting fleet's last-read running burn has `Target` equal to the selection, plus a pending marker for the gap | Yes | Still needs the marker | Yes — mount-independent | Point equality across a JSON, Firestore and JSON round trip is unverified. A point burn serves `BodyId: ""`, not `null` (section 6). Widens "an order commits" to "a burn to this target is running". The stranding notice still needs an identity record, so M2 does not remove M1's record |
| **M3. Write the commit response into the own-fleets cache** | `useOrder` writes the response fleet into `fleets.mine`; the gap disappears and M1 or M2 becomes a pure derivation | Yes | None | As M1 or M2 | Changes when the pill, roster row and canvas flip (sooner), touches `use-fleets` and its tests, must strip `strandingWarning` from the cached fleet, and edits a hook the galaxy view shares |
| **M4. Read the running burn action from the inbox** | Identify by action id | Yes | The commit response carries no id to match | — | Adds a read to this view (Fan-In delta). No advantage over M1 |

**Recommendation: M1.**

- It compares two served integers for equality: no float comparison and no empty-string trap.
- The same record carries the one-shot stranding warning, whose lifetime needs order identity under every candidate.
- It matches the live trigger ("when an order commits", an event on this view), B1's wording ("the order it names") and this change's RULING 1.
- It fails safe: any state it does not recognise resumes the preview, so a second Burn is capped again.
- It uses a pattern already in this file and already specified in this capability.

Implementation constraints the design should record:

- The record is written in the mutation callback and compared in render. No effect writes state, no timer, no clock term. That keeps *Animation Never Re-Renders…* true and builds nothing on the unspecced `wallMsUntil` edits (U1, U2).
- No render-time `setState` is needed. A stale record is inert and is replaced by the next commit, which removes the lint risk the architect flagged for the M0 design.

What M1 does not deliver, to be stated in the proposal: a burn the view did not commit (reload, remount, another tab, the agent) toward the selected target is not a committed selection. If the orchestrator wants mount-independence, M2 is the alternative. It inverts scenario 16 and needs the point round trip verified on a stack first.

---

## 6. Figure and string sweep against the served types

| Rendered by this change | Source | On the wire? |
| --- | --- | --- |
| Committed-order statement (new string) | The view's derivation | No figure is needed. Recommend it carries **no countdown and no target name**: the selection line already shows `Target {bodyId}` (`SpaceCommandPanel.tsx:216`), the strip pill already counts down, and a countdown here would add a figure and a `figure-formatting` delta |
| Stranding notice (new string) | `Fleet.strandingWarning` on the commit response | Yes, present-only-when-true (`handler.go:447`). Condition: no station **or lane gate** reachable at the acceleration floor (`fleet-movement/spec.md:1145`) |
| Success toast arrival (unchanged) | `state.Burn.ArriveMs` on the response | Yes |
| Removal of the quote figures, ceiling, affordability line and `preview-stranding` | — | Nothing rendered |
| Uncapped label | Hidden in the committed state | — |
| Order identity (internal, not rendered) | `Burn.DepartMs`, `Burn.ArriveMs` | Yes, on both the response and the read; integers |

**Findings from the sweep — neither is filed anywhere.**

1. **The commit response carries no delta-v.** `space.Burn` has no `DeltaV` field; it is a method (`backend/space/burn.go:151`). `fleetDTO.State` is the untagged `space.ShipState`, and I found no custom JSON marshaller. `frontend/lib/types/fleet.ts:43-53` agrees: no `DeltaV`. But `SpaceCommandPanel.tsx:140-146` reads `burn.DeltaV` through a cast, and `differs()` (`:96-99`) returns `true` when either side is not a number.
   - Consequence, by code reading: on the real wire `commit.deltaV` is always undefined, so `commit-drift-notice` renders after **every** successful commit with the actual delta-v in the absent form.
   - The live scenario *A commit matching the preview shows no drift notice* (`spec.md:941`) is therefore false in production. The panel tests pass because they fabricate `DeltaV` on the mocked response (`SpaceCommandPanel.test.tsx:391,443,457,490`). No e2e spec reads `commit-drift-*`.
   - Not verified on a running stack.
   - It matters here because this link clears the quote at commit, leaving that notice as the main thing in the panel. It is not this link's to fix (link 4 owns the commit-result surface, per `defect-command-panel-residual-presentation.md`). A true "actual delta-v" needs a served field or a client mirror of a `backend/space` rule, and both are forbidden in this chain. **It should be filed as a drift record, and Travis should know the requirement cannot be made true inside this chain's fences.**
2. **A point-target burn serves `Target.BodyId: ""`, not `null`.** `space.Target.BodyId` is a plain untagged `string` (`burn.go:14-17`). `fleet.ts:35-38` types it `string | null`, and `roster-status.ts:154` tests `target.BodyId == null`, so a real point burn would take the body branch and resolve an empty id. The fixture at `roster-status.test.ts:268` uses `null`. Unverified on a stack. It affects the strip pill's target label (out of scope; file it) and is a trap for mechanism M2.
3. The existing preview stranding copy omits the lane gate (section 1b, correction 3). It is not rendered by this change; note it, do not fix it here.

---

## 7. Test-file sizing and task estimate

**Where each added derivation is observed at its home.**

| Derivation | Home | Observing test |
| --- | --- | --- |
| Committed state (identity, gap, per-fleet) and the new term of `previewWanted` | `SystemSpaceView.tsx` | A **new** view-level file. It must render the real view, panel, `useBurnPreview`, `useOrder`, `useCutDrive` and `useStop`, and a **real `useMyFleets`** over a mocked `fleetService.listMine` |
| Click-time capture of fleet and selection, and the response fields reported | `SpaceCommandPanel.tsx` | Panel test for the callback arguments; view test for the late-response case |
| Stranding notice lifetime | View | Same new view file |
| Committed statement, unavailable Burn, no label, notice styling | Panel, from props | `SpaceCommandPanel.test.tsx` |
| Nothing moves | — | The static call-site guard (`use-burn-preview.call-site.test.ts`) stays as is |

**The cost is the harness, not the component.**

- `SystemSpaceView.burn-preview.test.tsx` (924 lines, 19 tests) mocks `useMyFleets` as a static return with no `dataUpdatedAt` and a no-op `refetch` (`:348-355`), and makes `useCutDrive` and `useStop` inert (`:74-97`).
- In that harness the invalidation after a commit reaches nothing. The gap, and every path that ends through a refreshed read, cannot be observed there.
- A test that hand-sets the fleets mock would observe an arrangement, not the ordering. That is the 2a-ii lesson about a mocked hook hiding the call site.
- The new file needs roughly 300 lines of harness before its first test.

**Existing tests that change.**

- `SystemSpaceView.burn-preview.test.tsx`: two tests drive a successful commit and keep asserting afterwards (`:709`, *A stale figure never becomes a cap*; `:844`, *A resumed preview…*). Their mocked response is `burningFleet()` with a `Target` of the host and no fresher read. Both need review; I expect one to two edits.
- `SpaceCommandPanel.test.tsx` (697 lines, 36 tests): one `panel()` helper gains defaults for the new props. No existing test should change behaviour.
- The seven other `SystemSpaceView*.test.tsx` files mock `useMyFleets` without `dataUpdatedAt`. They commit no burn, so they are unaffected. That needs one verifying run, not edits.
- `use-burn-preview.test.tsx`, `use-fleets` tests, `FleetActionsPanel.test.tsx`, `roster-status.test.ts`: no change under M1.

**Existing e2e.** I grepped every `burn-button` use: five specs and `helpers/space-view.ts:456`. None activates Burn a second time on an unchanged selection. `space-double-submit.spec.ts:292-296` selects a different body first, with a comment explaining why. None reads quote figures between a Burn click and the next selection. I expect no edits, but that is a selector-level check. 2a taught that re-homing preserves the selector, not the precondition, so the first gate run is the real check.

**Task estimate (one task per test arrangement group, the granularity 2a-ii's adversary asked for).**

| Group | Tasks |
| --- | --- |
| New view harness: real own-fleets read, real cut and stop, deferred control of each response | 2 |
| View tests, committed lifetime (ADDED scenarios 1-16) | 13 |
| View tests, stranding notice (scenarios 1-5) | 3 |
| Panel tests: statement, unavailable Burn, label, notice styling, callback arguments, callback absent on failure, guard released | 5 |
| Existing-test repairs and the helper default | 2 |
| Implementation: view record, flag term and props; panel callback; panel presentation; notice; copy constants | 5 |
| Records: update the two drift files; file the delta-v drift, the `BodyId` defect and the stop-stranding drift | 3 |
| Validation: reconcile, strict validate, QA matrix, security diff, journey spec, tier 4, tier 3, archive | 7 |
| **Total** | **40** (39-41) |

That sits on the cap before the panel, and the last three links' panels each added tasks. **Expect to pass 40.**

**Proposed seam, if it does.**

1. `surface-commit-stranding-warning` (about 15 tasks). The panel's commit callback, the view's per-fleet order record, the as-last-read lifetime with its gap rule, the new view harness, and the stranding notice as that record's first consumer. Shippable alone: the quote keeps polling as today, nothing becomes false, and the live `fleet-roster` requirement becomes true for the burn command.
2. `clear-burn-preview-on-commit` (about 26 tasks). The fourth withheld state, the burn command's availability, the three MODIFIED blocks, and the journey.

The seam is clean because the hard question (when a committed order stops being the running one) lands first, with a consumer whose failure mode is a notice shown too long rather than a blocked command. It also resolves M5's ordering objection: the notice exists before the clear removes `preview-stranding`. The alternative is one link with tasks bundled to stay under 40, which 2a-ii's adversary called out as dishonest counting (m5).

---

## 8. Open questions

**Q1. What makes a selection "committed": the order this view committed, or any running burn toward it?**

- (a) Order identity (M1). Mount-dependent; exact; matches "when an order commits".
- (b) Target match (M2). Mount-independent; needs the point round trip verified; widens the live sentence.
- Recorded lean: adversary B1, "the committed state must end when **the order it names** is no longer the acting fleet's running order, as observable from the served fleet read" (`lift-burn-preview-to-view-adversary-r1.md:40`). The same paragraph says the view reads burn presence "without opening `Burn.Target`, so this does not reintroduce the alternative Decision 5 rejected". The rejected alternative's own text is not in the archived design.md, so I could not read why it was rejected.
- Recommendation: (a).

**Q2. What does the burn command do for a committed selection?**

- (a) Unavailable, with a statement that an order is committed to that target. It returns when the state ends.
- (b) Available and labelled uncapped. No Double-Submit delta, but it is exactly UX F2's hazard: a repeat click is an uncapped re-order.
- (c) Clear and immediately re-quote, with no committed state at all. Ruled out by this change's RULING 1, which puts "the end condition of the committed state" in scope; listed for completeness.
- Recorded leans: UX F2 recommends (a), with paste-ready scenarios (`lift-burn-preview-to-view-panel-ux.md:46-69`). The chain doc's journey for this link reads "cut the drive and watch **the burn command and its quote come back**", which presumes (a). RULING 1's title says "the cap on a second Burn", which is ambiguous between (a) and a capped (b).
- Recommendation: (a). I found no dead end. Every path that ends the order releases the command, and a different target stays previewable and committable throughout.

**Q3. The first own-fleets read after the commit fails.**

- (a) The gap ends. The state is then judged against the last successful read, which predates the commit, so the preview resumes and a second Burn is capped. The view's existing fleets-error notice and retry are shown.
- (b) The state holds until a read succeeds.
- Recorded lean: the same capability's scan rule. "IF that read fails, THEN the pending presentation SHALL end … never an unbounded 'awaiting its window'" (`spec.md:2241-2246`). Against it, the preview requirement's "a later refresh of that read that fails leaves its earlier answer standing" (`:532-533`) is about a read that had already answered.
- Recommendation: (a). It matches the precedent and fails toward a capped command.

**Q4. Does the committed state end by the read alone, or also when the projected clock passes `ArriveMs`?**

- (a) Read only. If a read's settle degrades, the state persists until a later read settles it (bounded by the baseline poll), while the strip pill, which uses the clock (`roster-status.ts:148-149`), already reads idle.
- (b) Clock too. Then at every arrival with the selection kept, the state ends before the read reports the attachment. The resume rule sends a preview at that transition, and the server answers the zero-length solve with a 500, so "No quote" and Retry flash on the commonest flow in the game.
- No recorded lean. The view already holds both derivations (`:600` without the clock; `roster-status.ts` with it).
- Recommendation: (a), with the disagreement window stated in the spec's lag paragraph.

**Q5. The stranding notice: form, lifetime, selection, announcement.**

- Form: an inline notice on the command surface, a warning toast (`toast.warning` exists in `frontend/lib/toast.ts`), or both. A toast alone is gone in seconds and does not "leave a stranding warning on screen" (the chain doc's wording).
- Lifetime: the order's life, as recommended, or until dismissed.
- Selection: tied to the committed selection, or shown for the acting fleet whatever is selected.
- Announcement: static text, or announced once.
- Recorded lean: only `fleet-roster`'s "visible, non-blocking notice distinct from an error toast" and M5's "pin what stranding statement survives a commit". Nothing on form or announcement.
- Recommendation: inline, for the order's life, shown for the acting fleet regardless of selection, amber text as the panel already uses (no palette change), static. Announcement is a UX panel call.

**Q6. Is the stop command's stranding warning in this link?**

- (a) Yes, on the system space view. That edits `FleetActionsPanel` and its 917-line test file, adds about four tasks, and still leaves the galaxy view's half, which is fenced.
- (b) No. File it, and re-scope the drift record so it stays open for stop.
- No recorded lean; the fact was not known before this analysis.
- Recommendation: (b). The chain row should then say the `fleet-roster` drift is closed for the burn command only.

**Q7. *Burn Command Targets…*: MODIFIED, or a recorded reading?**

Its text says the system SHALL "allow the burn command to be invoked" for any selection. Under Q2(a) that is withdrawn for a committed selection.

- (a) A precedence sentence in the ADDED requirement and a recorded reading. None of its 6 scenarios is made false; each starts "WHEN the burn command is invoked". The running-mine gate already qualifies the same sentence without a delta, and RULING 17 chose "one sentence where the new rule lives" over a further MODIFIED block.
- (b) MODIFIED with a carve-out. 2a-ii's adversary m2 called a withdrawal of this guarantee BREAKING, and UX F2 said it "needs the same carve-out".
- Recommendation: (a), with the withdrawal flagged **BREAKING** in the proposal either way.

**Q8. Which orders does "when an order commits" mean?**

The live sentence is unqualified.

- Recorded lean: RULING 9 of the predecessor, "jump takes no clear of its own" (lane transit already withholds). A mine has its own withheld state. Cut drive and stop are not orders for the selection.
- Recommendation: reword to "when a burn order for that selection commits from this view", and say the other verbs are covered by the states that already exist.

**Q9. Copy for the committed statement and the stranding notice.**

Two new player-facing strings. No lean anywhere in the repo. Constraints: no raw wire text, no figure, and the stranding copy should name both stations and lane gates. This is for the UX reviewer.

**Needs information nobody in the repo has**

- **N1. Whether Travis wants a burn the view did not commit to read as committed** (Q1's product half). The repo records the principle but not this case.
- **N2. What the design canvas shows for the post-commit panel.** The mock is a claude.ai artifact (`docs/plans/system-hud.md` Pointers), not in the repo. I could not read it; the orchestrator can, and should before ruling Q2 and Q5.
- **N3. Whether a point's coordinates survive the request, storage and response round trip bit-exactly.** Needed only if Q1 goes to (b). It needs a stack run, not a person.
- **N4. What to do about the unserved actual delta-v** (section 6, finding 1). The live requirement cannot be made true inside this chain's no-backend fence. Not this link's decision, but it should not stay unrecorded.

---

## 9. Journey outline (one spec, tier 4, archive time)

Fixture: one fresh corporation, provisioned once. The spec records `POST …/orders/preview` and `POST …/orders` requests with timestamps, carries the `[journey-console]` capture with the update-depth assertion as a hard `afterEach`, and logs every snapshot index before asserting.

1. **Quote, then commit.** Select a body that is not the fleet's host; read the four figures by `data-raw`. Click Burn. Keyed on the **command panel**, not the roster row: the figures and ceiling are gone, the committed statement is present, the burn control is unavailable, no uncapped label.
2. **No request while committed.** Across at least two refresh intervals of wall time (a polled condition, not a sleep), zero preview requests for that selection. The window must fit inside the flight at world scale 5; otherwise the leg is a fixture precondition failure, not a finding.
3. **Second activation sends nothing.** The order request count stays at one.
4. **Re-target is still quoted.** Select a second body: a preview request goes out and figures render. Re-select the first: figures go and the statement returns with no request.
5. **Cut the drive.** Click the fleet panel's cut-drive control. The committed statement goes; a preview request for the kept selection is sent at that transition, not an interval later; the burn control is available. Do **not** assert that figures return without a no-quote state unless the vitest tier has shown this path free of 2a-ii's transient-refusal race.
6. **Commit again and arrive.** Burn to the same body and wait for the roster row to read docked. The committed statement is gone, no figures, no request (the docked-at-target state), and the burn control's availability is as that requirement leaves it.
7. **Stranding leg, conditional.** A deterministic stranding commit needs a fuel state the random spawn does not guarantee. Cover the notice in vitest and assert it in the journey only if a fixture can arrange it; record the skip as untested, never as passing.

Not in the journey: the outside re-task (needs a second client; covered at the view level), the failed-read case, and the point-arrival dead end.

---

## Change structure, design.md decisions, out of scope

**Structure.** One change, `clear-burn-preview-on-commit`, if the count holds at or under 40; otherwise the two-change seam in section 7, archived in that order.

**Decisions worth a design.md.**

- The mechanism (Q1) and why M0 failed.
- The record's home in the view and its per-fleet shape.
- The gap rule and its precedent.
- Read-versus-clock (Q4).
- The callback seam from panel to view, and why `useOrder` is not lifted.
- The burn command's availability (Q2), flagged BREAKING.
- The table of every live requirement checked with its verdict, and the table of edited carried bodies.
- The new harness's shape, and why the existing view harness cannot observe the gap.

**Out of scope, to record in the proposal.**

- Stating why Burn is unavailable in the three existing withheld states, and withholding it when docked at the target (`followup-explain-withheld-burn-command.md`).
- The fuel gauge overlay (2a-iv).
- The undrawn preview curve and the drift notice outliving its target (link 4).
- The loading-window uncapped label.
- The zero-length 500, including the point-arrival case.
- The stop command's stranding warning, and the galaxy view entirely.
- The unserved actual delta-v and the `BodyId` empty-string defect: file both, fix neither.
- Any backend change.
- U1–U10: neither reverted, retro-specced nor built on.

**Files read for this analysis (absolute).**

- `/Users/travis/Projects/hexaverse/docs/plans/system-hud/chain.md`
- `/Users/travis/Projects/hexaverse/docs/plans/system-hud.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/drift-preview-does-not-clear-on-commit.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/drift-commit-stranding-warning-not-rendered.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-adversary-r1.md` (B1, M5, m4)
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-panel-ux.md` (F2)
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-panel-architect.md` (1.1, 1.3, A1, A2, A4, A12)
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-rulings.md` (4, 7, 9, 13, 17, 20)
- `/Users/travis/Projects/hexaverse/docs/handoffs/clear-burn-preview-on-commit-rulings.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/followup-explain-withheld-burn-command.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/defect-command-panel-residual-presentation.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/archive/2026-10-04-lift-burn-preview-to-view/design.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/fleet-roster/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/system-console/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/fleet-movement/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/docked-fleet-actions/spec.md`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceCommandPanel.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/FleetActionsPanel.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.burn-preview.test.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceCommandPanel.test.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/fleet/roster-status.ts`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-burn-preview.ts`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-fleets.ts`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-actions.ts`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-submit-guard.ts`
- `/Users/travis/Projects/hexaverse/frontend/lib/types/fleet.ts`
- `/Users/travis/Projects/hexaverse/frontend/lib/services/fleet-service.ts`
- `/Users/travis/Projects/hexaverse/frontend/lib/realtime.ts`
- `/Users/travis/Projects/hexaverse/frontend/lib/toast.ts`
- `/Users/travis/Projects/hexaverse/frontend/e2e/tests/burn-preview-journey.spec.ts`
- `/Users/travis/Projects/hexaverse/frontend/e2e/tests/space-double-submit.spec.ts`
- `/Users/travis/Projects/hexaverse/backend/fleet/handler.go`
- `/Users/travis/Projects/hexaverse/backend/fleet/service.go`
- `/Users/travis/Projects/hexaverse/backend/fleet/model.go`
- `/Users/travis/Projects/hexaverse/backend/space/burn.go`
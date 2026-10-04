# Adversary round 1 — `lift-burn-preview-to-view` (change mode)

*Persisted by the orchestrator, verbatim, from the adversary's returned text
(2026-10-03); the adversary is read-only and does not write files. The
orchestrator's binding rulings follow the report, under "Orchestrator rulings".*

**Counts:** 1 BLOCKER, 5 MAJOR, 5 MINOR. **Verdict: NOT CLEAR.**

**Checked and holding:** the task count is 40 (11+1+13+8+7). The live-vs-delta diff matches design.md's edit table exactly (four carried bodies edited, no scenario missing). `invalidateFleet` does not touch the `burn-preview` key, so a commit causes no stray refetch. The U2 fence is covered by task 4.8. No task touches backend, palette, galaxy view, the strip or a mirror. I ran no tests and booted nothing.

One-line summary per BLOCKER/MAJOR:
- **B1** — the committed hold never ends when the order does (cut drive, stop, arrival at a point, outside re-task), so the spec mandates a false statement and blocks the re-burn.
- **M1** — "offered exactly where a preview is requested" is false with the canvas unavailable and during an in-flight commit, and the withheld states with no reason are undefined.
- **M2** — the lane-transit state is not reachable the way design.md says, and task 3.2's arrangement cannot be performed against the real view.
- **M3** — the mine and attachment holds are stated as world truth but known only through reads; a pending, cached or failed running-mine read sends the forbidden request and offers Burn over a mine.
- **M4** — "A burning fleet's re-target is previewed" has no view-level task; it is the mine drift's test shape again.
- **M5** — `fleet-roster`'s commit stranding-warning requirement is missing from the checked table, and the commit-clear removes the only stranding notice on this view.

Paths below are relative to `/Users/travis/Projects/hexaverse/`.

---

## BLOCKER

### B1 — The committed hold has no end tied to the order's own life

**Where.** `openspec/changes/lift-burn-preview-to-view/specs/system-space-view/spec.md`, preview requirement:
> "A preview cleared by a committed order SHALL stay cleared: the selection is kept, and no preview is requested for it, until the selection is cleared or replaced or the acting fleet changes. While it stays cleared the view SHALL state that an order is committed to that target"

design.md Decision 5 implements exactly that: the pair is dropped only on a selection or acting-fleet mismatch.

**Failure it requires.** The hold outlives the order in several reachable states:
- **Cut drive.** The player commits a burn to X, then cuts the drive on the `docked-fleet-actions` panel (*Fleet Roster Cross-Navigation* names that control on this screen). The fleet drifts, X is still selected, the pair still matches. The view must say "an order is committed to that target" and keep Burn unavailable. The statement is false, and resuming course to X is blocked until the player deselects and reselects.
- **Stop in place.** Same result; the stop replaces the burn with a different one.
- **Arrival at a point target.** There is no attachment, so the `attached` hold never takes over and the committed statement stays after the order has completed.
- **Re-task from outside this mount.** A second tab, or the claude-agent using the player's token, moves the fleet; the view still claims the old order.

**Why it is a ruling consequence, not just an edge.** RULING 8 exists to remove false labels and dead ends beside Burn. This creates one. I found no mention of cut drive, stop or cancel in design.md, the rulings or the consolidated panel report.

**Principle for the fix.** The committed state must end when the order it names is no longer the acting fleet's running order, as observable from the served fleet read. The view already reads burn presence (`state.Mode === 0 && state.Burn`) without opening `Burn.Target`, so this does not reintroduce the alternative Decision 5 rejected. The spec needs a scenario for "the committed burn is cut, stopped or completes while the selection is kept". The fix must also survive the gap between commit success and the fleet read first showing the burn. If Travis wants today's behaviour, the spec must say so explicitly and the statement's wording must stay true after a cancel.

---

## MAJOR

### M1 — "Offered exactly where a preview is requested" is false in states the change does not enumerate

**Where.** Delta: "The burn command SHALL be offered exactly where a preview is requested, or was requested and failed." design.md Decision 11: the panel "keeps ... its own disabled terms for no selection, no fleet and unavailable canvas, which are not holds".

**States that break the biconditional.**
- **Canvas unavailable with a held selection.** Live *Lost Rendering Context Recovers Without Navigation* keeps the selection through a context loss. Decision 3's `previewWanted` has no canvas term, so the preview is requested and refreshed. Burn is disabled by `!canvasAvailable` (`frontend/components/space/SpaceCommandPanel.tsx:314`). A preview is requested, Burn is not offered, and no reason is stated.
- **Commit in flight.** Live *Burn and Jump Commit Controls Guard Against Double-Submit* says the control "SHALL each be disabled from the moment of commit until that request settles". The preview is still requested for that selection.
- **No acting fleet, or no selection.** Burn is unavailable and no preview is requested, but these are not among "the four states". The spec is silent on the reason and the uncapped label. Decision 11 renders `burn-uncapped-label` whenever there is "no current quote and no hold", so "Uncapped: this burn will be committed…" still sits beside a disabled Burn. That is the falsity RULING 8 removed for the mine state only.

**Failure it permits.** One engineer follows the spec and removes the canvas term from `disabled`. Another follows design.md and keeps it. Both satisfy every scenario.

**Principle for the fix.** Either scope the rule ("given a selection, an acting fleet and an available canvas, and no commit in flight…") or enumerate every unavailable state with its presentation. "Exactly" must be true against the live Double-Submit and context-loss requirements.

### M2 — The lane-transit state is not reachable the way design.md says, and task 3.2 cannot be done as written

**Where.** design.md Decision 10: "A transit fleet is reachable as the acting fleet through the roster row or the canvas mark (`allFleets.find` is not filtered by `isInTransit`)." tasks.md 3.2: "acting fleet in lane transit (chosen through the roster row)".

**What the code does.**
- `selectFleet` navigates away for a transit fleet and never sets it acting (`frontend/components/space/SystemSpaceView.tsx:666-669`: `if (isInTransit(fleet)) { router.push('/'); return }`).
- The roster and the strip chevron both go through `selectFleet` (`:999`, `:1014`).
- Canvas marks are built from `here`, which excludes transit fleets (`:291-293`, `:462`).
- The only path is an explicitly chosen acting fleet that then jumps. The departure hand-off (`:651-660`) navigates to `/` at once.

**Consequences.**
- Task 3.2's arrangement is impossible against the real view. The test author must bypass `selectFleet`, which is the "green test that cannot observe" shape.
- The scenario "A fleet in lane transit requests no preview and cannot burn" has "WHEN several refresh intervals elapse". That is not inducible in production; it exists only inside the navigation window.
- The proposal's one flagged **BEHAVIOUR CHANGE** and the risk line "a player who selects a target as a transit fleet sees the reason" describe a state the player effectively never occupies.

**Principle for the fix.** The task must name an arrangement the unmocked view can reach: choose the fleet while present, then have the own-fleets read report `jump`, with the router mocked. The proposal and design must state the real reachability. The rule can stay; the premise cannot.

### M3 — The mine and attachment states are defined by world truth, but the client only knows them through reads

**Where.** Delta: "A preview SHALL NOT be requested … [while] the acting fleet's movement channel is claimed by a running mine". Decision 3 derives the mine term from `useRunningMine(acting?.id).data ?? null` (`SystemSpaceView.tsx:422`, `:739`).

**Failures it permits.**
- **Acting-fleet switch to a mining fleet with the selection kept.** The new key has no data, or stale cached "no mine" data, so `mineRunning` is false. One forbidden preview goes out and Burn is offered until the read lands.
- **Failed running-mine read.** The hold never appears. Burn is offered over a mine, and the server accepts it and silently cancels the run (`docs/handoffs/defect-burn-cancels-running-mine.md`).
- **Attachment read lag.** design.md's Risks concedes this window ("can send one preview") but not the mine window, and the spec's absolute SHALL NOT concedes neither.

No task switches the acting fleet to a mining fleet with a selection held; 3.1 selects only after the mine is known. The drift record's own closing condition ("observes the argument the real call site passes") therefore passes while the request still goes out on the switch path.

**Principle for the fix.** State each hold in terms of what the client has read, and say what holds while that read is pending or failed. Add a view-level test for the switch path. Otherwise the absolute SHALL NOT is unsatisfiable and untested.

### M4 — "A burning fleet's re-target is previewed" has no view-level task

**Where.** The delta keeps "a preview SHALL be requested while the acting fleet is **burning**" and its scenario. No task names the scenario. Its only test is `frontend/hooks/use-burn-preview.test.tsx:104`, which passes `commitWouldBeAccepted: true` into the hook by hand.

**Failure it permits.** This is the exact shape `docs/handoffs/drift-running-mine-preview-unsuppressed.md` documents. After the lift the flag is a new expression in the view. An implementer can add a "not burning" term, or have `burnHold` treat a running burn as `committed`, and every listed task passes. Task 3.8 only catches it if the test's fleet mock happens to report a burn after the commit, and nothing requires that.

**Principle for the fix.** Every term of the call-site flag, including the ones that must be absent, needs a test that observes the real call site. One view-level case (acting fleet with a served running burn, new selection, request sent, Burn available) can fold into 3.6 or 3.8.

### M5 — A live `fleet-roster` requirement is missing from the checked table, and the commit-clear removes the only stranding notice on this view

**Where.** Proposal Impact: "Every other live requirement that mentions the preview, the commit, the burn command or the selection was checked, in `system-space-view`, `docked-fleet-actions`, `system-console` and `fleet-movement`". `fleet-roster` is absent.

**What is live.** `openspec/specs/fleet-roster/spec.md:205`, *A Burn Commit's Stranding Warning Is Surfaced to the Player*, requires a visible notice when a commit response carries the warning.

**What the code does.** Nothing on this view renders the commit response's `strandingWarning`. The only stranding text is the preview's `preview-stranding` (`SpaceCommandPanel.tsx:275`). Today it stays on screen after a commit because the preview keeps polling.

**Failure it permits.** Under this change it disappears at the instant of the commit. A player who commits a stranding burn loses the only warning on screen at exactly the moment the live requirement says one must be shown. The pre-existing drift (commit warning never rendered) gets worse, unrecorded.

**Principle for the fix.** Add the table row and file the drift as a handoff record, or pin what stranding statement survives a commit. The "every requirement was checked" claim must cover every capability that mentions the commit.

---

## MINOR

- **m1 — "Carried verbatim" is claimed three times and is untrue.** Proposal: "each a complete replacement with every live scenario carried verbatim". design.md table rows for the Preview and Failed/Stale blocks say the same. Decision 10 says *The burn stays committable…* "is carried verbatim". design.md's own "Carried scenario bodies edited" table lists four edited bodies, including that scenario (a GIVEN was added). The diff confirms the four. A chain link verified "by diff" against these claims would be misled; the documents should agree with the edit table.
- **m2 — Behaviour changes are under-flagged.** Only lane transit is marked, and as "BEHAVIOUR CHANGE", not the convention's **BREAKING**. The attached and committed holds also withdraw a command that live *Burn Command Targets…* ("SHALL … allow the burn command to be invoked") and live *Failed or Stale* ("SHALL remain available") guaranteed. Those two are the ones players will actually meet.
- **m3 — One scenario's THEN does depend on hold precedence.** *The burn command's unavailability follows the acting fleet's state…* has "the same stated reason" for a body, a gate and a point, given only a running mine. A mining fleet is always attached, so when the body is its host two holds apply. An attached-first implementer satisfies Decision 11 ("precedence is the implementer's rule") and fails this THEN. design.md's claim that "no scenario's THEN depends on which reason is shown" is false here. Add "no other withheld state holds", or say the mine reason wins.
- **m4 — The Double-Submit "Unaffected" verdict rests on a scope the live text lacks.** *The guard releases when the request settles or fails* says "the player then initiates a new command … the new attempt submits normally" with no "on another selection". After a successful commit, the same control on the same selection is now unavailable. State the interaction in the delta, or record the reading.
- **m5 — Coverage and wording nits.**
  - "…SHALL return … when the mine ends" has a scenario and a task (3.1) only for ETA passing. Cancel-mine is the other way a mine ends and is untested.
  - *A fleet that has left its host…* uses "WHEN the selection is evaluated", which is not an inducible trigger.
  - The 40 is honest but sits on the cap by bundling: 3.1 carries four scenarios across three selection kinds, 3.8 three scenarios across three switch paths, 1.8 four scenarios. Each is one checkbox for work QA will have to split when naming closing assertions in 5.2.

---

## Verdict: NOT CLEAR

---

## Orchestrator rulings (binding; 2026-10-03)

All eleven findings are confirmed as real. Dispositions (full reasoning:
`lift-burn-preview-to-view-rulings.md` FULL-AUTO RULINGs 13–15):

| Finding | Disposition |
| --- | --- |
| B1 | **Removed with its cause** — RULING 13: the commit-clear leaves this change for its own link, `clear-burn-preview-on-commit`. No `committed` hold, no stored pair, no `onBurnCommitted` here. B1 is that link's primary design input. |
| M1 | ACCEPTED — RULING 14: the rule is scoped (a selection, an acting fleet, an available canvas, no commit in flight); the uncapped label is shown only where the burn command is available. |
| M2 | ACCEPTED — the lane-transit premise in design.md and the proposal is corrected to the real reachability; the test names an arrangement the unmocked view reaches (fleet chosen while present, then the own-fleets read reports `jump`, router mocked); the scenario's WHEN stops depending on elapsed intervals. |
| M3 | ACCEPTED — RULING 15: each hold is stated against what the view has read, with the pending and failed cases specified; a view-level switch-path test is added. |
| M4 | ACCEPTED — a view-level test for the burning re-target observes the real call site. |
| M5 | **Dissolved for this change by RULING 13** (the preview keeps refreshing after a commit, as today, so nothing is removed). The pre-existing drift is filed: `drift-commit-stranding-warning-not-rendered.md`; `fleet-roster` joins the checked table. |
| m1 | ACCEPTED — proposal and design.md agree with the edit table. |
| m2 | ACCEPTED — the attached hold and lane transit are flagged **BREAKING** in the proposal. |
| m3 | ACCEPTED — the scenario gains the "no other withheld state holds" precondition (or the mine reason is stated to win; writer's choice, one of the two). |
| m4 | Dissolved by RULING 13. |
| m5 | ACCEPTED — cancel-mine case added; the non-inducible WHEN reworded; tasks unbundled where one checkbox hides several closing assertions, and the count reported honestly. |

**Verdict commit:** none — round 1 was NOT CLEAR.

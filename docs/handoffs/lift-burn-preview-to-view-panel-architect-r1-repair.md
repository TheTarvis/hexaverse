# `lift-burn-preview-to-view` — architect repair addendum, adversary round 1

Architect, 2026-10-03. For the spec writer. Source of every decision cited:
`openspec/changes/lift-burn-preview-to-view/design.md` (rewritten this round;
Decisions 1-14). Rulings: `lift-burn-preview-to-view-rulings-index.md` 13, 14, 15.
I edited design.md only. Everything below is paste-ready text for the delta,
proposal.md and tasks.md, which are yours.

Three things in design.md go beyond what the dispositions spelled out. Read
these first, because the text below depends on them.

1. **A failed running-action read withholds Burn; it does not offer it**
   (Decision 12). RULING 15 left the choice to me and its risk note assumed the
   opposite. Live *The Sweep Surface's Reads Fail Independently, Like Every Other
   Read This View Issues* already rules on this exact read: a failed
   running-status read is never presented as "nothing running" and its commit
   control is withheld, with a retry. Burn follows it, and states a reason.
2. **`FleetActionsPanel` joins the change** (Decision 12). RULING 15's "one
   value" cannot be met otherwise: the fleet panel derives its own gate from its
   own read plus a local `committedEta` that is never cleared. The view becomes
   the only reader and passes `activeMine` down.
3. **The count is 49, not 40.** Section "Count" below.

---

## B1 (removal) and m4 — the commit clause leaves

**Delta, preview requirement.** Delete the final paragraph ("A preview cleared
by a committed order SHALL stay cleared ... leaves the burn command
available."). Keep the live sentence "and SHALL clear when the selection is
cleared or replaced, or when an order commits" exactly as live: it is carried
text and is recorded drift (`drift-preview-does-not-clear-on-commit.md`).

Delete these seven scenarios outright:

- A committed order clears the preview and none is requested for that selection
- A committed target is not re-committable uncapped
- A re-target after a commit is previewed
- Selecting the committed target again after clearing the selection is previewed
- Switching the acting fleet ends the post-commit clear
- A rejected commit leaves the preview shown
- The committed order's own figures outlive the cleared preview

Remove every "or an order is committed to the selection" / "an order committed
to the selection" / "or committed state" phrase from: the accessible-description
scenario, the not-announced scenario, the no-path scenario, the *Burn Command*
second paragraph, and *Failed or Stale*'s "A withheld preview is never presented
as a failed one". "Four states" becomes "three" everywhere.

**Proposal.** Delete the "A successfully committed burn clears the preview ..."
bullet. Add to "Not in this change":

> clearing the preview when an order commits, and rendering a commit's stranding
> warning (`docs/handoffs/drift-preview-does-not-clear-on-commit.md`,
> `docs/handoffs/drift-commit-stranding-warning-not-rendered.md`; link 2a-iii
> `clear-burn-preview-on-commit`). After a commit the preview keeps refreshing
> exactly as it does today.

m4 needs no delta text. design.md's Double-Submit row is re-verdicted
"Unaffected" with the reading recorded.

## M1 — the rule's scope (RULING 14)

Replace the preview requirement's second paragraph ("The burn command SHALL be
offered exactly where a preview is requested ... the decision that most needs
one.") with:

> WHILE there is a current selection, an acting fleet, an available canvas and
> no burn commit in flight, the burn command SHALL be offered exactly where a
> preview is requested, or was requested and failed (*A Failed or Stale Preview
> Is Never Presented as a Current Quote*), and a preview SHALL be requested
> unless one of the withheld states below holds or the mine state is unknown
> (below). In particular a preview SHALL be requested while the acting fleet is
> **burning**: re-targeting mid-flight is an ordinary commit against the fleet's
> live tangent, it is the most consequential order in the game, and offering the
> commit while withholding the quote would remove the preview from the decision
> that most needs one.
>
> Outside that scope this rule does not apply, and the burn command's
> availability is governed, unchanged, by the requirement that already covers
> each case: with no selection, by *Burn Command Targets Any Selected Body, Lane
> Gate, or Point Uniformly*; with the canvas unavailable, by *Renderer
> Unavailability Is an Explicit State* and *Lost Rendering Context Recovers
> Without Navigation*, under which the preview for a held selection continues to
> be requested and refreshed; with a commit in flight, by *Burn and Jump Commit
> Controls Guard Against Double-Submit*. The uncapped-burn label SHALL NOT be
> shown where the burn command is unavailable: with no selection, with no acting
> fleet, with the canvas unavailable, in a withheld state, or while the mine
> state is unknown.

Add two scenarios to the preview requirement:

```
#### Scenario: The uncapped-burn label is shown only beside an available burn command
- **WHEN** there is no current selection, or no acting fleet, or the canvas is
  unavailable
- **THEN** the burn command is unavailable and no uncapped-burn label is shown

#### Scenario: An unavailable canvas does not stop the preview for a held selection
- **GIVEN** a preview is shown for the current selection and no withheld state
  holds
- **WHEN** the canvas becomes unavailable and the selection is kept
- **THEN** the preview continues to refresh, one request per elapsed interval
- **AND** the burn command is unavailable, no uncapped-burn label is shown, and
  no withheld-state reason is stated
```

How the panel's own disabled terms relate is design.md Decision 10 (a table);
nothing more is needed in the delta.

## M3 — holds against what the view has read (RULING 15)

Replace the paragraph that begins "A preview SHALL NOT be requested, and the
burn command SHALL be unavailable, in each of four states" with the three
paragraphs below. The sentences from "The mine and lane-transit suppressions are
client request-suppression rules only" onward are kept as they are, except as
marked under m5.

> A preview SHALL NOT be requested, and the burn command SHALL be unavailable,
> in each of three withheld states, each taken as the view last read it rather
> than as the world may since have become: the acting fleet's running-action
> read last reported a running mine whose ETA has not passed, or a mine
> committed from this view has succeeded and no later read has yet answered;
> the own-fleets read last reported the acting fleet in lane transit; or the
> selected target is the body the own-fleets read last reported the acting fleet
> attached to. In each of them the view SHALL state a reason the burn command is
> unavailable, that statement SHALL be the burn control's accessible
> description, and the view SHALL show no preview figure, no no-quote state, no
> stale marking, no retry affordance and no uncapped-burn label: the preview is
> withheld, not failed. The scenarios below that speak of a running mine, of
> lane transit or of attachment speak of those states as last read by the view.
> Between a change in the world and the read that reports it the view acts on
> its previous read, and nothing is withheld merely because a refresh of a read
> that has already answered is in flight.
>
> The mine state is unknown until the acting fleet's running-action read has
> answered at least once. WHILE it is unknown, a preview SHALL NOT be requested
> and the burn command SHALL be unavailable, with no no-quote state, stale
> marking, retry affordance or uncapped-burn label. WHILE that read is in
> flight the view need state no reason. IF that read has failed and the view
> holds no earlier answer for that fleet, THEN the view SHALL state that the
> fleet's running orders could not be read, as the burn control's accessible
> description, and SHALL NOT present the fleet as having no running mine (*The
> Sweep Surface's Reads Fail Independently, Like Every Other Read This View
> Issues*, whose retry for that read restores the burn command when it
> succeeds). IF a later refresh of that read fails after it has answered, THEN
> its last answer SHALL stand.
>
> The burn command's mine hold and the mine gating of `docked-fleet-actions`'
> *Running Mine Gates the Fleet Panel's Commands* SHALL be one determination: on
> this view the burn command SHALL NOT be offered while that panel shows a
> running mine's countdown, and SHALL NOT be withheld for a mine while it shows
> none.

Replace "A mine that starts while a preview is shown withdraws it" (a scenario
this change added, not a carried one) and add five:

```
#### Scenario: A mine that starts while a preview is shown withdraws it
- **GIVEN** a preview is shown for the current selection and no other withheld
  state holds
- **WHEN** a mine run for the acting fleet is committed from this view
- **THEN** the preview figures are removed without waiting for a further read,
  no further preview request is sent while the mine holds the channel, and the
  selection is unchanged
- **AND** the view states that burning is unavailable while the mining run
  holds the drive, the burn command is unavailable, and no uncapped-burn label,
  no-quote state or retry affordance is shown

#### Scenario: Cancelling the mine restores the quote and the burn command
- **GIVEN** the view is showing the mine-holds-the-drive state for a selection
  and no other withheld state holds
- **WHEN** the mine is cancelled and the running-action read answers that no
  mine is running
- **THEN** the burn command is available again and a preview request is sent
  for the held selection

#### Scenario: The burn command and the fleet panel never disagree about a running mine
- **WHEN** the fleet panel shows a running mine's countdown for the acting
  fleet, or stops showing one
- **THEN** the burn command is unavailable with the mine's reason exactly while
  that countdown is shown

#### Scenario: Until the running-action read answers, no preview is requested and the burn command waits
- **GIVEN** a body is the current selection
- **WHEN** a different own fleet becomes the acting fleet and its
  running-action read has not yet answered
- **THEN** no preview request is sent from that fleet and the burn command is
  unavailable, with no uncapped-burn label, no-quote state or retry affordance
- **AND** when the read answers that a mine is running, the mine's reason is
  stated and still no preview request has been sent from that fleet

#### Scenario: An answer of no running mine releases the preview and the burn command
- **GIVEN** a body is the current selection, the acting fleet's running-action
  read has not yet answered, and no withheld state holds
- **WHEN** that read answers that no mine is running
- **THEN** a preview request is sent for the selection and the burn command is
  available

#### Scenario: A failed running-action read withholds the burn command and says why
- **GIVEN** a body is the current selection and the view holds no earlier
  answer from the acting fleet's running-action read
- **WHEN** that read fails
- **THEN** no preview request is sent, the burn command is unavailable, and the
  view states that the fleet's running orders could not be read
- **AND** no uncapped-burn label, no-quote state or preview retry affordance is
  shown
```

Add one for the attachment read, next to "A fleet that has left its host":

```
#### Scenario: A fleet that arrives at its selected target stops being previewed
- **GIVEN** a preview is shown for a selected body and no withheld state holds
- **WHEN** the own-fleets read reports the acting fleet attached to that body
- **THEN** the preview figures are removed and no further preview request is
  sent for that selection
- **AND** the view states that the fleet is already attached to the selected
  target and the burn command is unavailable
```

In the accessible-description scenario the WHEN becomes: "the burn command is
unavailable because a mine holds the movement channel, the fleet is in lane
transit, the fleet is attached to the selected target, or the fleet's running
orders could not be read".

**Proposal, Impact.** Affected code gains
`frontend/components/space/FleetActionsPanel.tsx` and its test (the running mine
arrives by prop; its own read and its local committed-ETA state are deleted).
No `docked-fleet-actions` delta: *Running Mine Gates the Fleet Panel's Commands*
stays true as written.

## M2 — lane transit

Replace the scenario body (heading unchanged; this is a scenario this change
added):

```
#### Scenario: A fleet in lane transit requests no preview and cannot burn
- **GIVEN** an own fleet was chosen as the acting fleet while present in this
  system, a body is the current selection with its preview shown, and no other
  withheld state holds
- **WHEN** the own-fleets read reports that fleet in lane transit
- **THEN** the preview figures are removed and no further preview request is
  sent for that selection
- **AND** the view states that burning is unavailable while the fleet is in
  lane transit, the burn command is unavailable, and no no-quote state, stale
  marking, retry affordance or uncapped-burn label is shown
```

**Proposal**, replacing the "BEHAVIOUR CHANGE" sentence:

> **BREAKING:** the burn command is unavailable while the acting fleet is in
> lane transit, where today it is enabled and the server refuses it. The state
> is narrow: a fleet in transit cannot be chosen as the acting fleet on this
> view (the roster and the strip navigate away instead, and it has no canvas
> mark), so it arises only for a fleet chosen while present that then jumps,
> and lasts from the fleet read that reports the jump until the departure
> hand-off's navigation leaves the view.

## M4 — the burning re-target at the real call site

No delta text changes; "A burning fleet's re-target is previewed" stays
byte-identical. The fix is a task (3.18 below) and design.md Decision 14, whose
first table row is the arrangement and the observation.

## M5 — `fleet-roster`

No delta. **Proposal, Impact**, replace the "Every other live requirement ...
was checked, in ..." clause with:

> Every other live requirement that mentions the preview, the commit, the burn
> command, the selection or the running mine was checked, in
> `system-space-view`, `docked-fleet-actions`, `system-console`,
> `fleet-movement` and `fleet-roster`; the list and reasons are in design.md.
> `fleet-roster`'s *A Burn Commit's Stranding Warning Is Surfaced to the Player*
> is live drift this change neither worsens nor fixes
> (`docs/handoffs/drift-commit-stranding-warning-not-rendered.md`).

## m1 — "verbatim"

**Proposal**, replace "each a complete replacement with every live scenario
carried verbatim" with:

> each a complete replacement that carries every live scenario under its
> unchanged heading; four carried scenario bodies are edited and every other is
> byte-identical to live (design.md, "Carried scenario bodies edited")

The four are unchanged from the current delta. Your repair must not edit any
other carried body; if it does, tell me the row to add.

## m2 — BREAKING flags

**Proposal, What Changes**, replace the rule bullet with:

> One rule (RULINGs 8, 14): given a selection, an acting fleet, an available
> canvas and no commit in flight, the burn command is offered exactly where a
> preview is requested, or was requested and failed. In each of three withheld
> states, as the view last read them - a running mine holds the movement
> channel, the fleet is in lane transit, the selected target is the acting
> fleet's own host - and while the running-action read has not answered or has
> failed, the burn command is unavailable; the reason is stated and is the
> control's accessible description; and no uncapped label, no-quote state,
> stale marking or retry is shown. **BREAKING:** the burn command is unavailable
> while the acting fleet is attached to the selected target, where live *Burn
> Command Targets...* allowed it to be invoked and live *A Failed or Stale
> Preview...* required it to remain available. Closes
> `drift-running-mine-preview-unsuppressed.md` and
> `defect-docked-selection-polls-zero-length-preview.md`.

followed by the lane-transit **BREAKING** sentence under M2.

## m3 — hold precedence

Replace the GIVEN of *The burn command's unavailability follows the acting
fleet's state, not the selection's kind*:

```
- **GIVEN** the acting fleet's movement channel is claimed by a running mine
  and no other withheld state holds
```

(So the body in that scenario is not the fleet's host. design.md Decision 11
keeps precedence out of the requirements.)

## m5 — coverage and wording

- "...SHALL return, with the burn command, when the mine ends" becomes "when
  the mine ends, by its ETA passing or by its cancellation,". The cancel
  scenario is under M3.
- "No retry or re-quote invoked in any of the four states SHALL send a preview
  request" becomes "No retry or re-quote invoked while a preview is withheld
  SHALL send a preview request."
- *A fleet that has left its host previews that host like any other target*:

```
- **GIVEN** the acting fleet is attached to a station, that station's body is
  the current selection, and no other withheld state holds
- **WHEN** the own-fleets read reports the acting fleet no longer attached to
  that station
- **THEN** a preview request is sent for the station's body and its figures
  are rendered
- **AND** the attached-to-target statement is removed and the burn command is
  available
```

- "Quote changes and reason statements are not announced": the WHEN's list
  becomes "the mine-held, lane-transit or attached state".

---

## Replacement tasks.md

```markdown
Tiers are as defined in `docs/testing-tiers.md`; every test task below is tier 1 unless the gate section says otherwise. Red tasks precede the implementation tasks they gate. Sections 1 and 3 go red together and turn green across section 4; because the per-commit gate runs the whole tier-1 suite, sections 1-4 land in one commit.

## 1. Panel contracts, hook and guard (red)

- [ ] 1.1 Static guard test (new file, the `lib/realtime.test.ts` walk idiom): exactly one non-test module under `app`, `components`, `hooks`, `lib` imports `use-burn-preview` by any path; it is `components/space/SystemSpaceView.tsx`; that source contains exactly one `useBurnPreview(` (design decision 7)
- [ ] 1.2 Command panel test file: delete the `vi.mock('@/hooks/use-burn-preview')` and the mutable `previewState`; the `panel()` helper supplies `preview`, `currentQuote`, `previewStale`, `previewNoQuote`, `onRequote`, `burnHold` with defaults
- [ ] 1.3 Migrate the arrange steps of the quote-display and failed/stale describes to props (scenarios "Selecting a target shows a preview curve and its figures", "An unaffordable preview is shown as such", the six live failed/stale scenarios); a requested-but-failed preview keeps Burn enabled, labelled uncapped, with retry
- [ ] 1.4 Migrate the arrange steps of the quote-lock and commit-outcome describes to props; the cap-rejection test asserts `onRequote` is invoked and no second order is sent (scenarios "A commit with a current preview carries a cap", "The ceiling the player agrees to is the one displayed", "A cap rejection re-quotes in flow instead of failing the interaction", "A commit matching the preview shows no drift notice", "A commit differing from the preview surfaces both figures", "An uncapped commit still surfaces its actual figures")
- [ ] 1.5 Command panel test, parametrised over the four reasoned holds (mine, transit, attached, unread): Burn is disabled, that hold's reason line is shown, and no figure, no-quote line, stale line, retry or uncapped label is shown (scenario "A withheld preview is never presented as a failed one")
- [ ] 1.6 Command panel test, parametrised over the same four: the reason line is the Burn control's accessible description (scenario "The reason a burn is unavailable is the control's accessible description")
- [ ] 1.7 Command panel test, `burnHold` pending: Burn is disabled with no reason line and no uncapped label, no-quote line, stale line or retry (presentation half of scenario "Until the running-action read answers, no preview is requested and the burn command waits")
- [ ] 1.8 Command panel test, parametrised over no selection, no acting fleet and an unavailable canvas: no uncapped label; with Burn available and no current quote the label is shown (scenario "The uncapped-burn label is shown only beside an available burn command")
- [ ] 1.9 Command panel test: `preview` supplied with `currentQuote` null and `previewStale` false shows no ceiling, shows the uncapped label, and commits with no `maxFuelTons` - the panel does not derive currency itself (design decision 2)
- [ ] 1.10 Hook test (`use-burn-preview.test.tsx`, added describe): `retry()` sends no request while `commitWouldBeAccepted` is false, and sends one when it is true (scenario "No path sends a preview request while one is suppressed"; design decision 6)
- [ ] 1.11 Fleet panel test file: delete the `useRunningMine` mock; the `panel()` helper supplies `activeMine` and `onMineCommitted`; the mine-gating describes arrange by prop (`FleetActionsPanel.test.tsx`, 45 tests; design decision 12)
- [ ] 1.12 Fleet panel test: a successful mine commit calls `onMineCommitted` once with the fleet id and the returned action id and ETA; a failed commit does not call it

## 2. View test harness (hygiene, not red)

- [ ] 2.1 Correct the wrong-shape `useBurnPreview` mock to `{ preview: null, stale: false, noQuote: false, retry }` in the seven view test files: `SystemSpaceView.test.tsx` and `.render-loop`, `.scan-refetch`, `.scan-settle-announcement`, `.scan-targets-refetch-on-arrival`, `.sighting-log-mount-ordering`, `.sighting-log-no-ghost-reasons` (one line each; they pass before and after, and their `useRunningMine` mock of `{ data: null }` reads as answered)

## 3. View-level behaviour (red)

New file `SystemSpaceView.burn-preview.test.tsx` renders the real view, both real panels and the real hooks; mocks `fleetService.preview`, `actionService.listRunning`, the own-fleets read, the router and the stage (exposing body, gate-body, point and fleet-mark triggers); and makes a selection in every test (design decision 14).

- [ ] 3.1 A mine known to be running, then a body other than the host selected: no preview request across several intervals (scenario "No preview is requested while a mine holds the movement channel")
- [ ] 3.2 The same mine, with a non-host body, a gate body and a point selected in turn: Burn is unavailable each time with the same mine reason (scenario "The burn command's unavailability follows the acting fleet's state, not the selection's kind")
- [ ] 3.3 A preview shown, then a mine committed through the real fleet panel: the figures go at the commit response, before the running-action read answers again; no further request; the mine reason; the selection unchanged (scenario "A mine that starts while a preview is shown withdraws it")
- [ ] 3.4 The mine's ETA passes: Burn is available and a request is sent for the held selection (scenario "A mine's completion restores the quote and the burn command")
- [ ] 3.5 A run committed in this mount is cancelled through the real cancel control and the read answers no mine: Burn is available and a request is sent (scenario "Cancelling the mine restores the quote and the burn command")
- [ ] 3.6 Across the states of 3.3-3.5, the mine reason is shown exactly while the fleet panel's countdown is shown, and cut drive and stop are disabled exactly then (scenario "The burn command and the fleet panel never disagree about a running mine")
- [ ] 3.7 Selection kept, acting fleet switched by the roster row to a fleet whose running-action read is deferred: no request from that fleet, Burn unavailable, no reason, no uncapped label; the read then answers a running mine: the mine reason, and still no request from that fleet (scenario "Until the running-action read answers, no preview is requested and the burn command waits")
- [ ] 3.8 The same switch, the read answering no mine: one request is sent and Burn is available (scenario "An answer of no running mine releases the preview and the burn command")
- [ ] 3.9 The same switch, the read failing: no request, Burn unavailable with the could-not-be-read reason; the scan control's retry then answering no mine sends the request (scenario "A failed running-action read withholds the burn command and says why")
- [ ] 3.10 A fleet chosen by the roster row while present, a body selected and previewed, then the own-fleets read reporting that fleet in lane transit (router mocked): the figures go, no further request, the lane-transit reason, Burn unavailable, one hand-off navigation (scenario "A fleet in lane transit requests no preview and cannot burn")
- [ ] 3.11 Acting fleet attached to the selected body, parametrised over a station host and a lane-gate host: no request across several intervals and the selection unchanged (scenario "A fleet docked at its selected target requests no preview")
- [ ] 3.12 The same arrangement: the attached statement is shown, Burn is unavailable, and no figure, no-quote line, stale line, retry or uncapped label is shown (scenario "A fleet docked at its selected target is told so and cannot burn to it")
- [ ] 3.13 Acting fleet docked, a different body and then a point selected: each is previewed and Burn is available (scenario "Another body is previewed while the fleet is docked")
- [ ] 3.14 Docked at the selected station, then the own-fleets read reports no attachment: the station is previewed, the statement is removed, Burn is available (scenario "A fleet that has left its host previews that host like any other target")
- [ ] 3.15 A preview shown for a body, then the own-fleets read reports the fleet attached to it: the figures go, no further request, the attached statement (scenario "A fleet that arrives at its selected target stops being previewed")
- [ ] 3.16 Acting fleet parked and attached to nothing: a selected body and a selected point are each previewed and the figures render (scenario "Selecting a target shows a preview curve and its figures"; the point case guards the absent-equals-absent comparison of design decision 4)
- [ ] 3.17 The same fleet and selection across several intervals: exactly one request per elapsed interval (scenario "The preview refreshes on exactly one named interval while shown"; the constant stays the single `PREVIEW_REFRESH_MS`)
- [ ] 3.18 Own-fleets read serving the acting fleet with a running burn toward one body, a different body selected: the preview service is called with that fleet and that body, the figures render, Burn is enabled with no hold reason, and one further call follows per interval (scenario "A burning fleet's re-target is previewed"; design decision 14)
- [ ] 3.19 A cap rejection through the real panel sends the re-quote request and leaves Burn available (scenario "A cap rejection re-quotes in flow instead of failing the interaction", at the lifted call site)
- [ ] 3.20 A cap rejection that lands after the selection moved to the acting fleet's own host sends no preview request (scenario "No path sends a preview request while one is suppressed")
- [ ] 3.21 A preview shown, then the canvas reported unavailable with the selection kept: the preview keeps refreshing one per interval, Burn is unavailable, and there is no uncapped label and no hold reason (scenario "An unavailable canvas does not stop the preview for a held selection")
- [ ] 3.22 A preview appearing, refreshing and being withdrawn, and the view entering and leaving each of the three withheld states, make no change to the view's live region; the landing announcements still fire once (scenario "Quote changes and reason statements are not announced")

## 4. Implementation

- [ ] 4.1 Call `useBurnPreview` once in `SystemSpaceView`, derive `currentQuote` once there, pass the quote props to `SpaceCommandPanel`, delete the panel's hook call, import, currency derivation and stale header comments (gates 1.1-1.4, 1.9, 3.16, 3.17, 3.19)
- [ ] 4.2 In the view, make the running mine one value: one `useRunningMine` read, the commit bridge set from `onMineCommitted`, the answered/pending/failed status, and `activeMine` passed to both panels and to the view's existing consumers; no effect, no timer (design decision 12; gates 3.3-3.6)
- [ ] 4.3 In `FleetActionsPanel`, take `activeMine` and `onMineCommitted` as props and delete its own running-mine read, its `mineRunning` derivation and `committedEta` (gates 1.11, 1.12, 3.5, 3.6)
- [ ] 4.4 Derive `burnHold` once in the view (transit, pending, unread, mine, attached with both ids required present) and pass its absence as the hook's flag, leaving the selection untouched (design decisions 3, 4, 11; gates 3.1, 3.2, 3.7-3.15, 3.18)
- [ ] 4.5 In the command panel, map `burnHold` to the reason line, disable Burn under any hold, associate the line as the control's description, and show the uncapped label only where Burn is available and there is no current quote; no live region (design decision 10; gates 1.5-1.8, 3.21, 3.22)
- [ ] 4.6 Make the hook's `retry` a no-op while the preview is suppressed; signature unchanged (gates 1.10, 3.20)
- [ ] 4.7 Confirm by diff that the U2 hunks in `SystemSpaceView.tsx` are byte-identical, that no new text cites `wallMsUntil`, that `selectFleet` and the departure hand-off effect are unedited, and that `PREVIEW_REFRESH_MS` and `BURN_FUEL_ALLOWANCE` are not redeclared

## 5. Validation and gate

- [ ] 5.1 Per-commit gate green (tiers 0-1 per `docs/testing-tiers.md`), including `use-burn-preview.test.tsx` (its existing tests unedited), `SystemSpaceView.render-loop.test.tsx` and the rest of the `SystemSpaceView*` family
- [ ] 5.2 Before the run, QA names the closing assertion for each scenario row in the delta
- [ ] 5.3 Journey at the archive gate (tier 4): select a target and read the quote in the panel; count `orders/preview` POSTs to prove one per interval; select the docked fleet's own host and see the attached statement, an unavailable Burn, no request and no console error; start a mine with another body selected and see the quote go, the mine reason and the fleet panel's countdown together; hard `[journey-console]` assertion carried forward; existing panel testids unchanged so the e2e helpers need no edit
- [ ] 5.4 Tier 3 at the archive gate, with the tree locked
- [ ] 5.5 The OpenSpec reconcile check, strict validation, and an archive rehearsal on a copy
- [ ] 5.6 Close `docs/handoffs/drift-running-mine-preview-unsuppressed.md` and `docs/handoffs/defect-docked-selection-polls-zero-length-preview.md` with the closing test and commit; leave `drift-preview-does-not-clear-on-commit.md`, `drift-commit-stranding-warning-not-rendered.md`, `defect-zero-length-burn-returns-500.md`, `defect-command-panel-residual-presentation.md`, `drift-preview-curve-never-drawn.md`, `defect-burn-cancels-running-mine.md` and `defect-post-dock-burn-cost-drift.md` untouched
- [ ] 5.7 Update `docs/plans/system-hud/chain.md`: link 2a-ii status, its three MODIFIED blocks and scenario count, and its Taught record
```

## Count

**49 tasks: 12 + 1 + 22 + 7 + 7. That is 9 over the cap of 40.** I did not
bundle to fit.

Where the growth came from, against the round-1 file's 40:

| Cause | Tasks | Net |
| --- | --- | --- |
| Commit-clear removed (RULING 13) | old 1.6, 1.7, 3.7, 3.8, 3.10, 3.11, 4.4 | -7 |
| One mine value, pending and failed reads (RULING 15) | 1.7, 1.11, 1.12, 3.5, 3.6, 3.7, 3.8, 3.9, 4.2, 4.3 | +10 |
| Rule scope and label clause (RULING 14) | 1.8, 3.21 | +2 |
| Burning re-target at the call site (M4) | 3.18 | +1 |
| Arrival-attachment read (M3) | 3.15 | +1 |
| Unbundling (m5): old 3.1 to 3.1-3.4, old 3.3 to 3.11-3.12, old 3.6 to 3.16-3.17 | | +5 |
| Old 3.2's no-acting-fleet half moved to panel level (1.8); old 1.5 folded into 1.4 as a migrated assertion; old 4.2/4.3/4.5 are one derivation (4.4) | | -3 |

If the orchestrator splits again, two seams are clean, and it takes both to
get under the cap:

- **The running-mine value** as its own link ahead of this one, in
  `docked-fleet-actions` (a MODIFIED *Running Mine Gates the Fleet Panel's
  Commands*: one determination for both panels, the gate lifts on cancel, the
  read's pending and failed cases). Takes 1.11, 1.12, 3.5, 3.6, 4.2, 4.3: this
  change falls to 43.
- **The attached and lane-transit holds** as a link after this one. Takes
  3.10-3.15: 37 with the first seam, 43 without.

## Findings for the orchestrator

1. **New defect, not in the adversary's report.** `FleetActionsPanel.tsx:148-151,166`:
   `committedEta` is set on a mine commit's success and never cleared, and the
   gate is `running ?? committedEta`. Cancel a run committed in the same mount
   and the read answers "no mine", the fallback revives, and cut drive, stop,
   mine and the countdown stay gated until the original ETA, with a cancel
   control carrying an empty action id. Decision 12 removes the state. Not
   filed; I write no handoff but this one.
2. **The stranding drift is wider than its record says.** The commit response's
   `strandingWarning` is read by no production code at all, including
   `FleetRoster` on the galaxy view. The record names only the system space view.
3. **Unverified, pre-existing:** the Burn control's rendered `disabled` has no
   in-flight term (`SpaceCommandPanel.tsx:314`); the double-submit guard is a
   synchronous claim. Live Double-Submit says the control "SHALL each be
   disabled from the moment of commit". I did not check whether that is drift
   or the guard is the accepted reading. RULING 14's scope leaves it alone.
4. **`docked-fleet-actions` carries the same world-truth wording** M3 objected
   to ("while the acting fleet has a running mine"). It is not modified here.
5. **Reason copy for the failed read** is new player-facing text and should
   point at the scan control's retry. UX has not seen it.

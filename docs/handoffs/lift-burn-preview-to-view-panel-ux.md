# lift-burn-preview-to-view — UX panel review (spec stage)

Reviewer: UX. Read-only. Surface: `SpaceCommandPanel` (Course panel). Method: five states + flow walk.
Evidence base: panel source (`frontend/components/space/SpaceCommandPanel.tsx`), `use-burn-preview.ts`,
`lib/rejection-copy.ts`, live `system-space-view` and `docked-fleet-actions` specs.

## Facts the findings rest on

- Burn is already `disabled` when `mineRunning` (`disabled={!selection || !canvasAvailable || !fleet || mineRunning}`), per live *Running Mine Gates the Fleet Panel's Commands*. The mine countdown and cancel control live in `FleetActionsPanel`, not in this panel.
- Today a mine-time quote request is refused, so the panel shows "No quote — the preview could not be solved." plus **Retry quote**, a retry that can never succeed. After the lift neither shows (`noQuote`/`stale` false).
- `burn-uncapped-label` renders on `!currentQuote` regardless of whether Burn is enabled: "Uncapped: this burn will be committed with no fuel ceiling."
- The server's zero-length refusal (`curve length below the configured minimum`) matches **no** entry in `BURN_COPY`; it falls to `GENERIC_COMMAND_FAILURE`: "That command could not be completed. Please try again."
- `useBurnPreview` already returns `preview = enabled ? data : null`, so any suppression withdraws a shown quote by construction. `retry` is `query.refetch()`, which TanStack fires even when `enabled` is false.
- The burn guard releases in `onSuccess`; a click after success is a fresh commit. The panel has no live region of its own; arrival/dock landings are announced by the view's shared polite `role="status"` region.
- `setCommit` is only ever set, never cleared, so the drift notice persists across selection changes.

## Findings

### F1 — MAJOR — Docked at the selected target: an enabled Burn that can only fail with "try again"
Attaches to: *Burn Preview Reflects the Server-Solved Order* (new clause) and *Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly*.
Evidence: design.md OQ2 "the draft leaves it enabled"; Decision 7 "reuses the panel's no-selection-like presentation without new copy". In that state the panel shows `Target <id>`, the uncapped label, and an enabled Burn. Click -> server refuses zero-length -> generic "Please try again" toast. That is a dead-end loop: the invitation to retry cannot succeed, and nothing says why. The silent panel is not itself a dead end (the player can pick another target), but it is an unexplained one on "the most common state in the game" (defect file).
Recommendation: disable Burn in this state and say why, in intent form. The uniform requirement's point is "no kind-specific branch" (body/gate/point); a host-attachment precondition is not a selection kind, and `docked-fleet-actions` already sets the precedent of a disabled Burn with a reason. This does need a MODIFIED block on *Burn Command Targets...* (carve-out sentence; the six scenarios carried verbatim). Reusable vocabulary: the existing arrival announcement "Burn complete — arrived and attached to <id>." and "Target <id>"; the explanation can name "attached here" without new design language. For a gate host, the existing gate-facts line stays and the Jump control is the exit.
Paste (add to the MODIFIED preview requirement, replacing the last two sentences of the docked paragraph):
```
The selection itself is left as it is. While the selected target is the acting
fleet's own host the panel SHALL state that the fleet is already attached to
that target, SHALL present no preview figure, no no-quote state, no stale
marking, no retry affordance and no uncapped-burn label, and SHALL leave the
burn command unavailable; the player can select another target. A selected
point is never a fleet's host.
```
```
#### Scenario: A fleet docked at its selected target is told so and cannot burn to it
- **GIVEN** the acting fleet is attached to a station and that station's body is the current selection
- **THEN** the panel states that the fleet is already attached to the selected target
- **AND** no preview figure, no-quote state, stale marking, retry affordance or uncapped label is shown
- **AND** the burn command is unavailable and the selection is unchanged

#### Scenario: Leaving the host restores the burn command and its quote
- **GIVEN** the panel is showing the attached-to-target state
- **WHEN** the acting fleet is no longer attached to the selected target
- **THEN** the attached-to-target statement is removed, the burn command is available, and a preview request is sent
```
Add to *Burn Command Targets...* (MODIFIED; carry all six live scenarios verbatim): "...allow the burn command to be invoked ... except where the selected target is the acting fleet's own host (*Burn Preview Reflects...*) ...". Fallback if the architect refuses the MODIFIED: keep Burn enabled and add a `BURN_COPY` mapping for the zero-length reason (intent: "already there"), plus a scenario pinning that copy; the panel then still offers a doomed action. Not preferred.

### F2 — MAJOR — After a commit-clear a second Burn is an uncapped re-order, and no live requirement stops it
Attaches to: the new "A preview cleared by a committed order SHALL stay cleared" paragraph; OQ4.
Evidence: design Risks "A second Burn on the same selection is therefore an uncapped re-target"; panel `onSuccess` releases the guard. *Burn and Jump Commit Controls Guard Against Double-Submit* covers only "until that request settles"; its own rationale ("the second commit cancels the first ... charging fuel twice") applies to a click one second later. *Quote-Locked* cap exists only "while a successful, current preview is shown", so the clear removes the cap. Net: the lift turns a capped, re-quoted re-click (today the quote keeps polling) into an uncapped one. Also, success is only a transient toast; the panel afterwards looks identical to "nothing happened yet" plus a false-looking "Uncapped: this burn will be committed" invitation. Dangerous, not merely confusing.
Recommendation (OQ4): disable Burn while the (fleet, selection) clear matches, and show a persistent committed-to-this-target line. This re-enables on every path the clear already ends on (new selection, deselect/reselect, other acting fleet), so nothing is stranded. It needs the same carve-out in *Burn Command Targets...* as F1.
Paste:
```
A preview cleared by a committed order SHALL stay cleared ... [unchanged], and
while it stays cleared the panel SHALL state that an order is committed to
that target, SHALL NOT show the uncapped-burn label, and SHALL leave the burn
command unavailable, so a second order to the same target cannot be committed
uncapped by repeat activation.
```
```
#### Scenario: A committed target is not re-committable uncapped
- **GIVEN** a burn order for the current selection has committed and its preview was cleared
- **THEN** the panel states that an order is committed to that target and the burn command is unavailable
- **AND** the uncapped-burn label is not shown

#### Scenario: A rejected commit leaves the burn command available
- **WHEN** a burn commit for the selection is rejected
- **THEN** the burn command remains available (the post-commit state is entered on success only)
```
The committed-vs-previewed drift notice is untouched by this (see F6).

### F3 — MAJOR — Mine holds the channel: withdraw-vs-keep is unspecified, and the panel shows a false label beside a disabled Burn
Attaches to: the live scenario "No preview is requested while a mine holds the movement channel"; OQ3.
Evidence: scenario is "for a newly made selection" only. A mine starting with a quote shown is reachable (select, preview, then mine from the fleet panel). By construction the hook withdraws the quote, which is the right answer: a quote beside a disabled Burn is an offer of a commit the panel refuses. But then the panel shows `Uncapped: this burn will be committed with no fuel ceiling` next to a disabled Burn, which is false. The no-quote/Retry state that disappears here is correct to lose (unsatisfiable retry). The blank is real but explained elsewhere on screen (mine countdown in the fleet panel); the Burn control itself carries no reason.
Recommendation: withdraw on mine start (spec it); suppress the uncapped label whenever Burn is unavailable; state the reason in-panel in intent form, associated with the control.
Paste:
```
#### Scenario: A mine that starts while a preview is shown withdraws it
- **GIVEN** a preview is shown for the current selection
- **WHEN** the acting fleet's movement channel becomes claimed by a running mine
- **THEN** the preview figures are removed, no further preview request is sent, and the selection is unchanged
- **AND** the panel states that burning is unavailable while the mining run holds the drive, and shows no uncapped-burn label, no no-quote state and no retry affordance

#### Scenario: A mine's completion restores the quote
- **GIVEN** the panel is showing the mine-holds-the-drive state for a selection
- **WHEN** the mine's ETA passes
- **THEN** the burn command is available again and a preview request is sent for the held selection
```
SHALL (a11y): "The reason a burn is unavailable SHALL be programmatically associated with the burn control." Scenario: WHEN the burn command is unavailable for any of the three reasons THEN its stated reason is exposed as its accessible description.

### F4 — MINOR — Announcements: pin that quote appearance, refresh and clearing are silent
Attaches to: the preview requirement. The panel has no live region; quote refresh every interval must not become one, and the new state lines (F1-F3) are static text. Landing events (burn arrival and docking, mine completion) are already announced once by the shared region; the quote disappearing at dock adds no second announcement, so no double-announce risk exists today. Pin it so an implementer does not "helpfully" add a live region to the state lines.
```
#### Scenario: Quote changes and panel state lines are not announced
- **WHEN** a preview appears, refreshes, or is withdrawn, or the panel enters the attached, committed or mine-held state
- **THEN** no live-region announcement is made for the change; the existing landing announcements are unaffected and each fires once
```

### F5 — MINOR — Loading: "Uncapped" with an enabled Burn while the first quote is in flight
Evidence: no `isLoading` is surfaced by the hook; between enabling and the first response `currentQuote` is null, so the uncapped label shows and Burn is enabled. This change adds three more entries to that window (mine ends, fleet leaves host, reselect after clear). Pre-existing, not introduced here; the live scenario "committable without a quote" is deliberate. Recommendation: do not fix here; file it for 2a-iii/overlay, noting a click in the window commits uncapped. No delta now.

### F6 — MINOR — Drift notice outlives its target
Evidence: `setCommit` is never cleared; new scenario says figures are "last shown for that target" but nothing removes the notice on re-target. After commit to X, selecting Y leaves "Committed at delta-v ... previewed ..." under Y. Scope the notice.
```
#### Scenario: The drift notice is scoped to the committed target
- **GIVEN** a drift notice is shown for a committed order
- **WHEN** the selection is cleared or replaced, or the acting fleet changes
- **THEN** the drift notice is removed
```

### F7 — MINOR — Retry must not fire a suppressed request
Evidence: `retry` = `query.refetch()` ignores `enabled`. The cap-rejection path calls `retry()` unguarded. Not reachable in the three states with the F2 carve-out (a cap implies a quote was shown), but the live scenario "no preview request is sent" should hold absolutely.
```
#### Scenario: No path sends a preview request while one is suppressed
- **WHEN** the preview is suppressed (mine, lane transit, attached to the target, committed-cleared) and any retry or re-quote is invoked
- **THEN** no preview request is sent
```

## Answers to the review questions

1. Docked: show an attached-to-target statement, disable Burn, MODIFIED carve-out on *Burn Command Targets...* (F1). A silent enabled panel leads to a generic "try again" failure, which is a dead end.
2. Commit-clear: dangerous, not just confusing (F2). Live guards cover only the in-flight window; quote-lock covers only shown quotes. Disable Burn for the committed pair and show a committed line.
3. Mine: withdraw the quote (the hook does by construction); drop the unsatisfiable Retry (correct); add an in-panel reason and hide the uncapped label (F3).
4. Announcements: none needed; pin silence; no double-announce today (F4).
5. Testability: new scenarios are concretely observable (testid absence/presence), but the "presents" half of the docked scenario states only absences. Missing: mine-start-while-shown, mine-end resume, attached-state positive THEN, drift-notice scoping, loading (F5, deferred).

OQ5 (jump needs own clear): agree with draft, no. Lane transit suppresses. OQ1(a): `setSelection` has one definition and two call sites in `SystemSpaceView` (canvas `onSelect`, plus `selectFleet`), so a clear can piggyback; architect to confirm roster/chevron/URL paths.

## Verdict
NEEDS SCENARIOS. Counts: BLOCKER 0, MAJOR 3 (F1-F3), MINOR 4 (F4-F7).

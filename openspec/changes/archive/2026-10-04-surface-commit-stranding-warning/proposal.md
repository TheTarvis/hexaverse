## Why

A burn commit's response carries a one-shot stranding warning (`backend/fleet/handler.go:445-448`), and `fleet-roster` already requires it to be rendered as a visible, non-blocking notice. Nothing on the system space view renders it: the commit success callback reads only the burn's arrival (`SpaceCommandPanel.tsx:138-155`), and the only stranding text is the preview's own line, which survives a commit only because the preview keeps polling (`docs/handoffs/drift-commit-stranding-warning-not-rendered.md`). This is link 2a-iii of the system-HUD chain, the first half of the split of `clear-burn-preview-on-commit` (that change's FULL-AUTO RULING 3). It lands first because the hard question, when a committed order stops being the fleet's running one as the own-fleets read reports it, then has a consumer whose failure is a notice shown too long, not a blocked command.

## What Changes

- The command panel reports an accepted burn commit to the mounting view: the fleet the command was invoked for (captured at click, not at response), the response's two burn instants, and whether the response carried the stranding warning.
- The view keeps, per fleet, a record of the last order it committed whose response carried the warning, identified by the response's departure and arrival instants compared for equality with the own-fleets read (FULL-AUTO RULING 2). An accepted commit without the warning removes that fleet's record. The record is written in the commit callback and compared in render; no effect, timer or clock term is added.
- A stranding notice is shown on the system space view while that order is the acting fleet's running burn as the own-fleets read last reported it: an inline, non-dismissible line below the burn command control in the command panel, shown for the acting fleet whatever is selected, with fixed player-facing copy that names stations and lane gates and carries no figure (RULINGs 8, 9; the strings are in design.md). One advisory (warning, not error) toast conveys the warning once per accepted warned response, at that acceptance, in addition to the success feedback and whichever fleet is acting when the response lands; nothing later causes a toast, and the notice adds nothing to the view's live-region text and causes no announcement of its own. The requirement states the gap between the acceptance and the first read requested after it (including a read begun before the commit and answered after it), a failed read changing nothing (RULING 5), each way the order ends (the projected clock is not one, RULING 6), the lag, per-fleet ownership, the cases that show no notice, and what a reload shows.
- The quote is untouched: it keeps refreshing after a commit exactly as today, and the preview's own stranding line is unchanged.
- Test work: a new view-level test file that renders the real view, the real command panel and a real own-fleets hook over a mocked service, because the existing view harness mocks `useMyFleets` as a static return and cannot observe the gap.
- **BREAKING:** none. The change adds a notice and withholds nothing that any live requirement guarantees.

### Out of scope

- Clearing or withholding the quote when an order commits, the fourth withheld state, the burn command's availability for a committed selection, the uncapped label, and every MODIFIED of "Burn Preview Reflects the Server-Solved Order, Without Committing", "A Failed or Stale Preview Is Never Presented as a Current Quote" and "Burn and Jump Commit Controls Guard Against Double-Submit": link 2a-iii-b, `clear-burn-preview-on-commit`.
- The stop command's stranding warning, on either view: `docs/handoffs/drift-stop-stranding-warning-not-rendered.md`. The `fleet-roster` drift is closed here for the burn command only. A stop therefore removes the burn order's notice and shows nothing in its place, even when the stop's own response carries the warning.
- The commit response carrying no actual delta-v, so the commit drift notice renders after every real commit (by code reading): `docs/handoffs/drift-commit-response-carries-no-delta-v.md`. Not made worse, not fixed; the requirement cannot be made true inside this chain's no-backend fence.
- A point burn serving an empty-string body id: `docs/handoffs/defect-point-burn-serves-empty-bodyid.md`. This change compares no target.
- Explaining why the burn command is unavailable: `docs/handoffs/followup-explain-withheld-burn-command.md`.
- The preview's own stranding copy ("unable to reach a station") omitting lane gates. Noted, not edited.
- Any backend field, endpoint or query; the galaxy view; any palette, type or panel-fill change; any client-side affordability or shortfall arithmetic; any new figure (so no `figure-formatting` delta); the fuel gauge overlay; a selection key in the record (it has no consumer here).
- A warned commit response lacking either burn instant: unspecified here, filed as `docs/handoffs/followup-warned-commit-without-burn-instants.md`.
- U1-U10 of `docs/handoffs/add-vitals-strip-qa-reverify.md`: neither reverted, retro-specced nor built on.

## Impact

- Affected specs: `system-space-view` (one ADDED requirement, 25 scenarios). No MODIFIED, REMOVED or RENAMED block: no live sentence is made false (table below). `fleet-roster`'s *A Burn Commit's Stranding Warning Is Surfaced to the Player* becomes true for the burn command with no delta.
- Affected code: `frontend/components/space/SpaceCommandPanel.tsx` (the commit callback, the advisory toast, the notice element), `frontend/components/space/SystemSpaceView.tsx` (the record, the derivation, the callback and boolean passed to the panel), a new `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` and additions to `SpaceCommandPanel.test.tsx`. No hook, service, type or backend file changes.
- Records: `docs/handoffs/drift-commit-stranding-warning-not-rendered.md` is updated at close; `docs/plans/system-hud/chain.md` is updated for the link.

### Live requirements checked

| Requirement (capability) | Verdict | Why |
| --- | --- | --- |
| A Burn Commit's Stranding Warning Is Surfaced to the Player (`fleet-roster`) | No delta | Surface-neutral. Its scenario "A commit with no warning shows no stranding notice" is read as "no notice for that commit": an unwarned response landing while another fleet's notice is on screen leaves that notice, which belongs to the other commit. States a notice distinct from an error toast and no suppression of success feedback, no lifetime or placement. The ADDED requirement supplies those for the system space view, and its advisory toast is a second, non-error toast beside the success one, which this requirement permits |
| The Roster Row Shows a Persistent Stranded Indication (`fleet-roster`) | No delta | Read fresh from the own-fleets read; the ADDED requirement points at it for the reload case and computes nothing |
| A Burn Commit Warns, But Does Not Block, When It Would Leave the Fleet Unable to Reach a Station or Gate (`fleet-movement`) | No delta | The served condition; backend unchanged. The notice's copy names stations and lane gates to match it |
| A Fleet's Read Reports a Persistent Stranded Indication (`fleet-movement`) | No delta | Served as is |
| Burn Preview Reflects the Server-Solved Order, Without Committing (`system-space-view`) | No delta | Its sentence "SHALL clear ... when an order commits" stays as is and stays unimplemented (`drift-preview-does-not-clear-on-commit.md`, link 2a-iii-b). Nothing here edits the quote, the three withheld states, or the preview's stranding line |
| A Failed or Stale Preview Is Never Presented as a Current Quote | No delta | The quote and its failure states are untouched |
| A Burn Commit Is Quote-Locked to the Preview the Player Agreed To | No delta | The cap still derives from the current quote, which is unchanged |
| Burn Commit Reports Its Outcome | No delta | The success toast is untouched and still shown exactly once. The warning toast is a separate advisory toast beside it, and the requirement's "success feedback is a toast" sentence concerns the success feedback only |
| A Commit's Actual Result Is Never Silently Swapped for the Previewed One | No delta | Unchanged; already false in production by code reading (`drift-commit-response-carries-no-delta-v.md`) |
| Burn and Jump Commit Controls Guard Against Double-Submit | No delta | The burn command's availability is unchanged here |
| Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly | No delta | The command stays invokable for every selection |
| System Space View Route and Data Fan-In | No delta | No read is added. "Every offer and readout this view mounts SHALL be driven by the results of those reads" introduces the enumerated read-anchored offers; a command's own response already drives the success feedback and the commit drift notice under it, and the notice's lifetime is driven by the own-fleets read |
| Realtime Refetch Rules While the Space View Is Open | No delta | No trigger is added; the lag is stated in terms of the existing ones |
| Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously | No delta | Its "a stranding warning SHALL come from a served field" is satisfied: the notice is driven by the served field |
| A Landed Resolution Is Announced to Assistive Technology | No delta | The view's announcer and its landing announcements are not edited: the notice adds no text to the announcer and causes no announcement of its own, so a landed arrival that removes it still announces its landing. The advisory toast is announced by the toast region at the acceptance, not by that announcer, and announces a warning at a commit, not a landed resolution: the requirement's list of announced transitions is not touched and does not forbid another surface announcing something else |
| A Focused Scan Commits Against a Listed Target and Reports Its Rejection in Player Copy (`system-space-view`) | No delta | Precedent for a gap between an accepted commit and the read that reflects it. Its failed-read rule is not carried: that rule keeps a committed sweep reportable and retriable behind a presentation that hides both; this notice hides neither |
| Animation Never Re-Renders the View, and Never Starves a Navigation | No delta | Constrains the implementation: the notice is derived in render from a record, with no per-frame state |
| The Strip Issues No Read of Its Own (`system-console`) | No delta | Nothing is passed to the strip |
| Cut drive and stop (`docked-fleet-actions`) | No delta | Not edited; their existing invalidation of the own-fleets read is what ends the notice |
| Figure and string rules (`figure-formatting`) | No delta | The change renders no figure |

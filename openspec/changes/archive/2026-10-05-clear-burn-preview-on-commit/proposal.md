## Why

The live clause of *Burn Preview Reflects the Server-Solved Order, Without Committing* says the preview "SHALL clear ... when an order commits", but no scenario exercises it and nothing implements it: after a successful burn commit the selection is kept and the preview keeps polling as a re-target quote for the target the fleet is already flying to (`docs/handoffs/drift-preview-does-not-clear-on-commit.md`). This is link 2a-iii-b of the system-HUD chain, the second half of the split of `clear-burn-preview-on-commit`; the predecessor `surface-commit-stranding-warning` (archived `3218d9d`) landed the order identity, the gap rule and the read-only end this link builds on.

## What Changes

- One ADDED requirement in `system-space-view`: the **committed selection**. When a burn order for the current selection is accepted from this view, that selection (for the fleet the command was invoked for) loses its preview and has none requested, its burn command is unavailable, and the command panel states that an order is committed to the selected target. The state is a fourth withheld state whose life is the order's own life as the own-fleets read last reported it, reusing the predecessor's identity (the response's two burn instants), gap, read-only end and lag. It covers the gap before the first read after the acceptance, is per fleet with one committed selection per fleet, compares the view's own selection and never the target, and ends on cut drive, a stop above, at or below the floor, arrival at a body or a point, and a different order from this view or elsewhere including one toward the same target.
- The state is only for orders this view committed (RULING 4). A burn the view holds no accepted response for (a reload, a remount, another tab, the agent) is previewed and committable as a re-target, as today.
- The rule for a failed own-fleets read is stated per consumer (ruled, RULING 8, option b): a failed read changes nothing for the notice, the quote or the burn command, each staying as it was until a read answers.
- MODIFIED `Burn Preview Reflects the Server-Solved Order, Without Committing`: three withheld states become four; the scope sentence for the burn command's availability is limited to the first three; the commit clause is reworded to a burn order the acting fleet committed for that selection, accepted from this view; "uncommitted" gains its definition in the ADDED requirement. All 20 scenario bodies are carried byte-identical.
- MODIFIED `A Failed or Stale Preview Is Never Presented as a Current Quote`: the closed list of states in which the uncapped-burn label is never shown gains the committed selection, and the burn command's availability there is attributed to the new requirement. All 9 scenario bodies are carried byte-identical.
- MODIFIED `Burn and Jump Commit Controls Guard Against Double-Submit`: the release of the guard is stated not to be the control's return to availability for a just-committed selection; one scenario body gains a GIVEN (the other three are byte-identical).
- **BREAKING:** the burn command is withdrawn for a committed selection. Today a second Burn on the same selection is available and capped by the continuing quote; after this change it is unavailable until the order's life ends as last read (RULING 5). `Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly` takes no delta (RULING 6, confirmed): the withdrawal is one precedence sentence in the ADDED requirement. The statement names why the control is unavailable and the exit, is the control's accessible description while shown, is not a live region, and keyboard focus survives the control becoming unavailable.
- Test work is frontend only: panel and view-level tests; seven view-level arrangements in the predecessor's own view test file re-arranged because they click Burn twice on one selection or assert a quote state on the committed selection; and two panel payload assertions in `SpaceCommandPanel.test.tsx` gaining the `selectionKey` field (their scenarios stay true).

### What the narrowing costs

- A reload or remount mid-burn returns the quote and an enabled Burn for the flown-to target: the record is the open view's, not the world's (RULING 4).
- After arrival at the selected body the panel goes from "an order is committed, Burn unavailable" to today's docked-at-target state: an enabled Burn under the uncapped label, which ends in the zero-length 500. The end state is today's; the contrast is new. Explaining or withholding it is `docs/handoffs/followup-explain-withheld-burn-command.md`, deliberately out of the chain.
- The panel does not become figure-free after a commit: the commit's drift notice renders after every real commit by code reading, because the commit response carries no delta-v (`docs/handoffs/drift-commit-response-carries-no-delta-v.md`), and shows arrival and delta-v figures until the next commit. Every scenario names the quote's own elements and never asserts "no figure is shown". The statement itself carries none.
- While reads keep failing, the command stays withheld for one selection even if the order has ended. Retry stays on screen and any other target stays committable.

### Rulings applied (panel revision pass 1; see `docs/handoffs/clear-burn-preview-on-commit-writer-notes.md`)

- The failed-own-fleets-read rule for the command and the quote is option (b), ruled (RULING 8).
- The committed statement's copy is design.md's constant (UX F1's two-sentence copy); the requirement binds intent, placement immediately before the burn control, the accessible description, no live region and one text for every selection kind (RULING 10).

### Out of scope

- Stating why the burn command is unavailable in the three earlier withheld states, and withholding it when docked at the target: `docs/handoffs/followup-explain-withheld-burn-command.md` (cause: it took `lift-burn-preview-to-view` from 32 to 49 tasks; the committed statement is this link's own and sets no precedent claimed here).
- Any backend field, endpoint or query (chain doc, "What every link must not do": every needed value is served; the selection never leaves the client).
- The galaxy view (`useOrder` has one caller; `use-fleets.ts` and `use-burn-preview.ts` are not edited).
- Any palette or type change (the statement reuses the panel's existing line treatment) and any client-side affordability or shortfall arithmetic (this link removes figures and computes none).
- The fuel gauge's cost overlay (link 2a-iv); the drift notice, its lifetime and the unserved actual delta-v (link 4; the drift record above); the stop command's stranding warning (`docs/handoffs/drift-stop-stranding-warning-not-rendered.md`); the empty `BodyId` on a point burn (`docs/handoffs/defect-point-burn-serves-empty-bodyid.md`; this change compares no target); the zero-length 500.
- A response lacking a burn instant: unspecified, filed as `docs/handoffs/followup-warned-commit-without-burn-instants.md`, which gains this link as its second consumer.
- U1-U10 of `docs/handoffs/add-vitals-strip-qa-reverify.md`: neither reverted, retro-specced nor built on.

## Impact

- Affected specs: `system-space-view` (1 ADDED requirement, 21 scenarios; 3 MODIFIED requirements: 20, 9 and 4 scenarios, with one carried scenario body edited, the guard-release GIVEN, and requirement-text edits in the three, as listed in the notes file). No REMOVED or RENAMED block. No delta in any other capability.
- Affected code: `frontend/components/space/SpaceCommandPanel.tsx` (the callback carries the click-time selection; the statement element, a disabled term and the label term from one prop), `frontend/components/space/SystemSpaceView.tsx` (the order record widened to every accepted commit with the selection and a warned flag; one derivation with two readers; a term in the preview-wanted flag), the existing view-level stranding-notice test file and its harness, `SpaceCommandPanel.test.tsx`. No hook, service, type or backend file changes.
- Records: `docs/handoffs/drift-preview-does-not-clear-on-commit.md` closed; `docs/handoffs/followup-warned-commit-without-burn-instants.md` gains the second consumer; `docs/handoffs/followup-explain-withheld-burn-command.md` gains a dated note that the arrival contrast is new; `docs/plans/system-hud/chain.md` updated for the link.

### Live requirements checked

| Requirement (capability) | Verdict | Why |
| --- | --- | --- |
| Burn Preview Reflects the Server-Solved Order, Without Committing (`system-space-view`) | MODIFIED | Names three withheld states; says the withheld states do not change the burn command's availability; clears "when an order commits" with no scenario |
| A Failed or Stale Preview Is Never Presented as a Current Quote | MODIFIED | A closed list of four unavailable states for the uncapped label; "unchanged" is false for a fifth |
| Burn and Jump Commit Controls Guard Against Double-Submit | MODIFIED | A new attempt after the guard releases "submits normally" is uninducible on a just-committed selection |
| Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly | No delta (RULING 6, confirmed) | Each of its six scenarios begins "WHEN the burn command is invoked"; the precedence sentence lives in the ADDED requirement |
| A Burn Commit's Stranding Warning Stays Visible While That Order Is the Fleet's Running Burn, as Last Read | No delta | No sentence becomes false: a fleet's later accepted commit ends the earlier notice at acceptance, which one per-fleet record replaced at each acceptance keeps true. Its clause that the notice does not disable the burn control is read as what the notice itself contributes; the ADDED requirement says so. Seven of its view-level tests are re-arranged and two of its panel payload assertions gain `selectionKey`, their scenarios unchanged |
| A Burn Commit Is Quote-Locked to the Preview the Player Agreed To | No delta | The cap still derives from the current quote; a cap rejection on another selection re-quotes as before |
| Burn Commit Reports Its Outcome | No delta | Success and failure feedback untouched |
| A Commit's Actual Result Is Never Silently Swapped for the Previewed One | No delta | Already false in production by code reading; not made worse, not fixed |
| System Space View Route and Data Fan-In | No delta | No read is added |
| A Landed Resolution Is Announced to Assistive Technology | No delta | The ADDED requirement adds no text to the announcer, so an arrival that ends the state still announces its landing |
| Realtime Refetch Rules While the Space View Is Open | No delta | No trigger is added |
| Animation Never Re-Renders the View, and Never Starves a Navigation | No delta | Constrains the build: no clock term and no effect-written state |
| `fleet-roster`, `docked-fleet-actions`, `system-console`, `figure-formatting` | No delta | Surface-neutral or untouched; the statement renders no figure, cut drive and stop are not edited (their invalidation ends the state) and nothing is passed to the strip |

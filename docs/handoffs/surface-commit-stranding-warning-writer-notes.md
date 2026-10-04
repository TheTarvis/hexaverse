# `surface-commit-stranding-warning` — the spec writer's hand-back (first authoring pass)

*Persisted by the orchestrator, verbatim, from the writer's returned text
(2026-10-04). History, not state: the change folder is the state.*

## Pending panel

All four are authored as the analyst's recommendation, with the marker `[pending panel: Qn]` in the requirement text, the scenario names below, and the task numbers.

- **Q3**, first read after the commit fails. The gap ends and the notice is judged against the last answered read, so it is removed. Where it lives: the "The gap" paragraph, the scenario "A failed first read ends the gap and removes the notice", and task 3.8. See the architect note on the same-instants return below.
- **Q4**, read-only end, with no clock term. Where it lives: the "The end" paragraph, the scenario "The projected clock passing the arrival does not end the notice", and task 3.3.
- **Q5**, form and selection. The notice is inline, in amber text, static and not announced, and shown for the acting fleet whatever is selected. Where it lives: the "Whose notice" paragraph ("whatever is selected"), the "What the notice is" paragraph, the scenario "The notice is advisory and distinct from the preview's stranding line" (live-region text unchanged), the scenario "The notice follows the acting fleet and returns on the switch back", and tasks 3.3 and 3.14. I did not fix placement beyond "on the view's command column" (task 4.3).
- **Q9**, copy. Only the constraint is stated: names both stations and lane gates, no raw wire text, no figure. A placeholder constant is mentioned in task 4.3 and the testable form is "contains no digit". Where it lives: the scenario "The notice's copy names stations and lane gates and carries no wire text" and tasks 3.14 and 4.3.

## Notes for the architect

1. **Gap against `dataUpdatedAt`.** The requirement says "the first own-fleets read requested at or after the acceptance." A plain `dataUpdatedAt` marker, as the scan's `committedPending` uses, treats any read answered after the acceptance as that read. `useOrder`'s own invalidation cancels an in-flight read by default, which should discard the earlier answer, but that must be verified. Scenario 3.2 pins it: an earlier read held pending, answered after the commit. If cancellation does not discard it, the mechanism needs request-time ordering.
2. **Q3 and the return of the notice.** Because the rule is a function of the last answered read, a notice removed by a failed first read returns when a later read answers with the same instants. I wrote that into the Q3 scenario as working text. If the panel wants a removed notice to stay removed, the record needs a memory and the scenario flips.
3. **Cut drive, stop and a newer commit by the same fleet.** The first two invalidate the own-fleets read, so the notice ends at the next read. A newer accepted commit replaces the record at its acceptance, with no read needed.
4. **Commit response without both burn instants.** The notice cannot be tied to an order. I deliberately left this out of the delta, so it is unspecified. Task 1.2 covers only the field omitted or false. Please rule on it. The fail-safe options are no notice, or a notice for the gap only.
5. **Where the record lives.** It should live in the view, not the panel. The scan precedent keeps its marker in the query cache so it survives a remount of a child. This change makes a view remount lose the record by design.
6. **Panel prop.** `onCommitAccepted` is my placeholder name and the prop is optional, so existing panel tests need no edits. The seven other `SystemSpaceView*` test files and `SystemSpaceView.burn-preview.test.tsx` should be unaffected, and task 6.1 is a verifying run.
7. **Warning from the commit response only.** `strandingWarning` is on the commit response alone, not on any read, so a notice can only come from a record made at the commit.
8. **Lag clause.** It names the existing triggers (the mutation's invalidation, the ETA-scheduled refetch, the baseline poll) and says any further trigger only shortens the bound. It does not state the 20 s figure.

## Live sentences made false

None. I read the preview requirement's stranding and live-region sentences, "Burn Commit Reports Its Outcome", "A Commit's Actual Result Is Never Silently Swapped for the Previewed One", "Realtime Refetch Rules While the Space View Is Open" and the fleet-roster pair. ADDED is right.

## Disagreements and discrepancies in the inputs

- The analysis (`clear-burn-preview-on-commit-analysis.md:72`) says there is no event-driven refresh. The live spec `openspec/specs/system-space-view/spec.md:1164-1170` lists a subscription trigger (3). `SystemSpaceView.tsx:572-573` listens for `sse-reconnect`, so a handler exists. Only the part that nothing non-test dispatches the event is unverified. My lag clause is a no-later-than bound, so it holds either way.
- The commit-response test at `SpaceCommandPanel.tsx:138-155` captures the quote at click, but `fleet` is a prop. The `fleet.id` capture the analysis calls "click-time" has to be taken in `commitBurn` before `mutate`. Task 1.1 covers this with a re-render before the response lands.
- The drift record `drift-commit-stranding-warning-not-rendered.md:23` still cites `SpaceCommandPanel.tsx:275`. It should be `:280-284`. Task 5.1 corrects it.
- The preview's own stranding copy ("unable to reach a station", `SpaceCommandPanel.tsx:282`) omits lane gates. I left it as the brief says and noted it in the proposal's out-of-scope list.

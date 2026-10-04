# clear-burn-preview-on-commit — records draft (tasks 6.1-6.3)

Drafted by the nextjs-dev, 2026-10-04, for the orchestrator to apply. Nothing
here has been written into the target files. `<commit>` is for the orchestrator
to fill. Build state when drafted: sections 5 and 7.1 done, uncommitted; tier 0
green (8 files), tier 1 green (128 files, 1830 tests), `components/space` +
`hooks` 50 files, 770 tests.

## 6.1 — `docs/handoffs/drift-preview-does-not-clear-on-commit.md`

Replace the status line with `closed` and append:

> **Closed 2026-10-04 by `clear-burn-preview-on-commit` (`<commit>`).** The
> live clause "the preview SHALL clear … when an order commits" now has
> scenarios and an implementation: the committed selection is a fourth withheld
> state, derived in render in `SystemSpaceView.tsx` from a per-fleet record of
> every accepted burn commit (`CommittedOrder`) against the own-fleets read, and
> the burn command is withdrawn for that selection with a static statement
> (`selection-committed-statement`). Closing tests, all in
> `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` unless
> noted: 3.1 (commit removes the quote, withholds Burn), 3.2-3.4 (the gap, the
> pre-acceptance read, no clock term), 3.5-3.9 (cut drive, stop, order gone,
> arrival hand-over, order settled in the round trip), 3.10 (failed reads), 3.11
> -3.14 (other targets, second commit, late response, per-fleet), 3.16, 3.19;
> panel half in `SpaceCommandPanel.test.tsx` (2.1-2.3). Regression guards 3.15,
> 3.17, 3.18 stay green. UX F2 (an uncapped re-order after the clear) is closed
> by construction: the second Burn is unavailable, not uncapped.

## 6.2 — `docs/plans/system-hud/chain.md`

Row state: link 2a-iii-b built, awaiting archive gate (tiers 3 and 4). Counts:
one ADDED requirement (21 scenarios); three MODIFIED requirements (20, 9 and 4
scenarios; the 33 carried scenarios keep their headings).

Taught record (append):

- **One determination, two readers.** The predecessor's "is the acting fleet's
  recorded order still its running burn, gap included" became the committed
  selection's liveness too. Widening the record from warned orders to every
  accepted commit, deleting the unwarned-delete branch, and reading the same
  `orderLive` twice (notice via `warned`, committed selection via key equality)
  was smaller and safer than a second map or a stored (fleet, selection) pair.
  The handler stays branch-free and `[qc]`-only; the derivation stays above
  `previewWanted`, un-memoised, with no clock term.
- **The mocked-harness trap.** A harness that mocks `useMyFleets` (as
  `SystemSpaceView.burn-preview.test.tsx` does) never answers a read after an
  accepted commit, so the committed state holds until unmount: a quote or a
  second Burn asserted on the committed selection after a commit there fails by
  construction, not by defect. The absent-query case stays `undefined`, never
  `null` (RULING 9). Section-3 tests therefore run over a real own-fleets hook
  with a mocked service; a test that hand-sets the committed prop or mocks
  `useMyFleets` observes an arrangement, not the derivation.
- **Link 2b mount warning.** React Query drops mutate-level callbacks for an
  unmounted observer. The record is written from the panel's mutate-level
  `onSuccess` (it must run after `useOrder`'s hook-level invalidation). Link 2b
  must keep `SpaceCommandPanel` mounted across tab changes, or lift `useOrder`;
  otherwise a commit whose response lands after the panel unmounts enters no
  committed state (and no stranding notice either).
- **Callback order is load-bearing and unguarded by types.** It lives in
  `use-fleets.ts`, which this change does not edit; test 3.3 is its only guard.
- **Focus.** The scenario "Keyboard focus survives the burn command becoming
  unavailable" has no tier-1 test (jsdom cannot judge it); it rests on the
  journey keyboard leg. If Chromium disagrees, the fallback (`aria-disabled` for
  this state only) is a batched-revision-round finding.

## 6.3a — `docs/handoffs/followup-warned-commit-without-burn-instants.md`

Append a dated note:

> **2026-10-04 (`clear-burn-preview-on-commit`, `<commit>`).** The order record
> now has a second consumer: the committed selection reads the same
> `orderLive` as the stranding notice. A response lacking a burn instant stores
> `null` for it, so `stillRunning` is false and the record holds only through
> the gap (`awaitingRead`); after the first answered read the committed
> selection ends. That hold-for-the-gap-only behaviour is by construction, not
> by decision, and this follow-up remains open for both consumers.

## 6.3b — `docs/handoffs/followup-explain-withheld-burn-command.md`

Append a dated note (records, does not absorb):

> **2026-10-04 (`clear-burn-preview-on-commit`, `<commit>`).** One withheld
> state now explains itself: the committed selection shows a static statement
> that is also the Burn control's `aria-describedby`. The arrival contrast is
> new: at arrival at the selected body the statement is removed and the
> docked-at-target state shows an enabled Burn under the uncapped label (which
> ends in the zero-length 500), so Burn visibly re-enables at arrival. This note
> records the contrast; it does not absorb this follow-up, which still covers
> the three earlier withheld states and docked-at-target, and its mechanism
> choice stays open.

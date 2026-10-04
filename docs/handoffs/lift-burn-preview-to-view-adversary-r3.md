# Adversary round 3 — `lift-burn-preview-to-view` (change mode)

*Persisted by the orchestrator, verbatim, from the adversary's returned text
(2026-10-03). The orchestrator's binding rulings and the verdict commit follow
the report.*

**Counts:** 0 BLOCKER, 1 MAJOR, 5 MINOR. **Verdict: NOT CLEAR.**

The one MAJOR is a tasks-only gap: no spec text changes, and it folds into existing tasks without passing 40. The five MINORs alone would not have prevented CLEAR.

All ten round-2 findings are fixed in the current files. Decision 13's mechanism does what the requirement says in every same-key case I could construct.

I ran no repo tests and booted nothing. I ran two throwaway vitest probes in the scratchpad against the repo's installed `@tanstack/react-query` 5.90.11 (no repo file touched): a copy of the hook plus Decision 13's effect (`cancelQueries` and `removeQueries` on `!enabled`).

Paths are under `/Users/travis/Projects/hexaverse/`.

---

## (a) Round-2 findings

| R2 | Status | Evidence |
| --- | --- | --- |
| M1 | Fixed | Delta `specs/system-space-view/spec.md:69-74` (request at the transition, nothing from before, no `maxFuelTons`), scenario `:210-218`, the first-preview paragraph `:262-264` and scenario `:310-316`; design.md Decision 13; tasks 1.9, 1.10, 3.16, 4.6. Probe results are below the table. |
| M2 | Fixed | Delta `:76-81` states the bound on *Quote-Locked* and that the obligation resumes with the preview; scenario `:220-225`; design.md table row now reads "Unmodified, bounded by the withheld states"; task 3.14 names both scenarios. |
| m1 | Fixed | `:137-140` carries "as the view last read it". A mechanical diff of live against delta shows exactly three edited bodies, the three design.md lists, and ten byte-identical. |
| m2 | Fixed | `:186` and `:194` carry "the burn command's availability is unchanged". |
| m3 | Fixed | design.md Risks states the lost no-quote line; `docs/handoffs/followup-explain-withheld-burn-command.md:40` already records it. |
| m4 | Fixed | `docs/handoffs/defect-zero-length-burn-returns-500.md:13` now says "removes only the UI's…"; `defect-command-panel-residual-presentation.md:14` names link 2a-iv. |
| m5 | Fixed | Scenario `:163-169` and task 3.4 are pinned to the ETA passing while the read still reports the mine. |
| m6 | Fixed | The *A Landed Resolution Is Announced…* row is in the checked table. |
| m7 | Fixed | All five: regression-guard labels (3.6, 3.8–3.13, 3.15), the preamble's mock list, 2.1's parenthetical, 3.7's plain body host, 4.4's header comments. |
| m8 | Fixed | `:322` adds the WHEN. |

**Probe results for Decision 13 (all as the design claims):**
- Cached answer, withheld for 30 s, then resumed: a request goes out at once; `preview` is null, `stale` and `noQuote` false.
- Cached answer, withheld for 2 s (under `staleTime`): same.
- Disabled and re-enabled in consecutive renders with no tick between: same.
- A refresh in flight when the withholding began, landing during it: not presented on resume, and a new request is sent.
- The same, landing after the resume: not presented.
- A first request in flight with no data, landing during the withholding: not presented.
- Restoring request rejected: `noQuote` true, `stale` false.
- After the restoring request, the next request falls one interval after the transition, with none between.

---

## Questions the orchestrator asked

- **"At the transition" against "exactly one per elapsed interval, and none between": no collision.** The live clause is scoped "while a preview is shown". The restoring request is sent while none is shown, the same standing as the first request for a new selection. The interval restarts from the restoring request.
- **Decision 13 for a late in-flight response and a same-pass re-enable: holds.** See the probe results. One cross-key case does not hold (m1 below).
- **"No `maxFuelTons`" in the restore window: consistent.** *Quote-Locked* sends a cap only "while a successful, current preview is shown". The uncapped-label bullet plus the new "is a first preview for this purpose" paragraph give the label beside an available Burn in that window. Decision 10's `burnAvailable && !currentQuote` renders it.
- **Is 40 honest: yes.** 10 + 1 + 16 + 6 + 7 = 40, which is round 2's 36 plus 1.9, 1.10, 3.16 and 4.6. Nothing was merged away and no scenario lost its task. The m7 fixes were folded into existing tasks: 3.7 gained a parameter and 4.4 gained the comment correction, which is unlike its retry no-op but harmless.
- **Do the new tasks fail at the right level: 1.9, 1.10 and 3.16 are each red against today's hook.** The exception is M1.

---

## MAJOR

### M1 — The view's failed and stale wiring, and its one derivation of "current quote", are observed by no task

*Partly residue: the new scenario "A failed restoring request is a no-quote state, not a stale one" is tasked only at the hook. Mostly older: the lift moves the currency derivation out from under its only test, and rounds 1 and 2 missed it.*

**Where.**
- tasks.md 1.10 is the new scenario's only task. It asserts the hook's flags (`noQuote` true, `stale` false, `preview` null). The scenario's THEN is presentation: "the no-quote state is shown … AND a retry affordance is offered".
- tasks.md 1.3 and 1.7 migrate the panel's failed and stale tests to props. After that the test itself supplies `currentQuote`, `previewStale` and `previewNoQuote`.
- tasks.md 4.1: "derive `currentQuote` once there" (in the view).
- No section-3 task makes a preview request fail. 3.1, 3.6 and 3.7 assert only the absence of the no-quote and stale lines. 3.13 and 3.14 cover `onRequote`. 3.16 covers the pending window, where `preview` is null.

**What the code does today.** `SpaceCommandPanel.tsx:119` derives `currentQuote = preview && !stale ? preview : null`. `SpaceCommandPanel.test.tsx:257` ("A stale figure never becomes a cap") exercises that line by mocking the hook with `stale: true` and asserting the order body has no `maxFuelTons`. No view test or e2e file references `preview-stale`, `preview-no-quote` or `preview-retry`.

**Failure it permits.** An implementer can ship any of these in `SystemSpaceView` with all 40 tasks green:
- `currentQuote={preview}`, dropping `!stale`.
- `previewStale` and `previewNoQuote` swapped.
- `previewNoQuote={false}`.

The first sends a cap derived from a figure marked stale, which the live requirement forbids ("a cap SHALL never be derived from a figure the view has already marked stale"). Link 2a-iv will draw the gauge from this same `currentQuote`. At 5.2, QA would name the panel test as the closing assertion, and it passes regardless.

This is the failure Decision 8 exists to prevent: "the flag's only tests passed it into the hook by hand". Here the derivation's only tests pass it into the panel by hand.

**Principle for the fix.** Tasks only; no spec edit. Observe the three quote-state props and the derivation once at the real call site, in `SystemSpaceView.burn-preview.test.tsx`:
- **A refresh that fails over shown figures:** `preview-stale` and `preview-retry` render, `preview-fuel-ceiling` does not, and a Burn click sends no `maxFuelTons`. This is a regression guard and fits as an added arrangement on 3.11.
- **A rejected restoring request:** `preview-no-quote` and `preview-retry` render, with no `preview-stale` and no figure. This fits as a fourth outcome on 3.16 and gives the new scenario a view-level observation.

Then add 3.11 and 3.16 to 4.1's gate list. The count stays at 40.

---

## MINOR

- **m1 — "When any withheld state ends" is wider than Decision 13's same-key mechanism (residue).** Delta `:69-72` says "When any withheld state ends … SHALL send that request at the transition … SHALL present no figure … from a response received before the withholding began". Decision 13 discards only the key the hook holds when it is disabled.
  - *Case:* fleet F1 is previewed with a refresh in flight; the acting fleet switches to mining fleet F2 (withheld); it switches back before that refresh lands.
  - *Probe result:* F1's earlier answer is presented as current and no request is sent at the transition (2 calls in total; the in-flight one then lands).
  - *Size:* the window is one request's latency, and the figure is no older than an ordinary current quote. It is the same behaviour as today's A, B, A reselection.
  - *Fix:* scope the paragraph to "for the same acting fleet and selection", since a changed fleet or selection is already governed by the replace rule. Decision 13's "holds for every term of the flag at once" should carry the same qualifier.
- **m2 — The requirement says "received before the withholding began"; the task and design also exclude a response received during it (residue).** Task 1.9 says "its response landing during the withholding is not presented on resume". Read literally, the SHALL at `:71-72` permits presenting it. The mechanism and test are right; the spec text is narrower than both. Fix: "from any request sent before the withheld state ended".
- **m3 — Decision 6's "one line" hides a stale-closure trap that M2's repair rests on (older; advisory).** `SpaceCommandPanel.tsx:156` calls `retry()` from a mutate-level `onError` captured at click time. In the 3.14 arrangement the preview was enabled at that render. A no-op written as `if (!enabled) return` inside `useCallback([query, enabled])` therefore still calls `refetch()`, and the disabled observer sends the zero-length request. Task 3.14 catches this at the view. Task 1.8 cannot, because it calls a fresh `result.current.retry`. Design.md should say the no-op reads the live enabled state (a ref or the observer's current options), and 4.4's gate should lead with 3.14.
- **m4 — Task 3.16's mine arms do not say how the mine comes to be reported after the preview is shown (residue).** Decision 8 says the cancel arrangement's mine is "one the running-action read reports, not one committed in this mount". For a shown-then-withheld arrangement the read must change after mount, which needs an invalidation or refetch the task does not name. It is buildable: the test holds the query client. One clause would stop two engineers arranging it differently.
- **m5 — Task 5.6 says to "add to `followup-explain-withheld-burn-command.md` the line that docked-at-target loses the 'No quote' hint" (residue).** That line is already at `:40` of the file. Reword to "confirm".

---

## (b) Checked and holding

- Strict format of the added scenarios is sound (WHEN and THEN present). Headings are unique: 20 and 9 scenarios in the two blocks.
- The quote-lock bounding clause and its scenario are reachable: the fleet is attached to H, a capped commit toward B is in flight, and the selection moves to H. A rejected commit leaves the attachment in place.
- A cap rejection landing in the restore-pending window sends nothing extra: `refetch()` on a query with no data joins the in-flight request.
- Decision 13's effect writes no component state. A transition causes at most one observer notification, so *Animation Never Re-Renders the View* is not engaged.
- The hook's existing tests survive Decision 13 unedited. Their only disabled cases start disabled or disable by clearing the selection.
- "Clearing the selection clears the preview" and "The refresh interval is defined in exactly one place" have no named task, but they are carried live and covered by existing unedited tests under 5.1. That is older and not a finding.
- The proposal's wording matches the delta: three edited bodies, the resumed-preview bullet, and the hook in affected code.

## Verdict: NOT CLEAR

M1 is the only material finding, and its repair touches tasks.md only (two added arrangements and one gate list). m1–m5 are wording and advisory and would not by themselves have prevented CLEAR.

---

## Orchestrator rulings (binding; 2026-10-03)

Round 3 is the cap. No BLOCKER; the residue is one tasks-only MAJOR and five
MINORs, each with the adversary's own stated fix. All six are ACCEPTED and
**applied as stated**, inside the verdict commit, under
`lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 18 — the cap governs
adversary rounds, not repairs (the `add-vitals-strip` round-3 precedent). The
orchestrator verified the repair by diff: the only files changed are tasks.md
(M1's two arrangements and 4.1's gate list; m3's gate order; m4's clause; m5's
"confirm"), the two scoping phrases in the delta (m1, m2), and design.md
Decisions 6 and 13 (m1, m3). **These six repairs have not themselves been
adversarially reviewed — the recorded, accepted residual risk.**

**Phase 1 closes here.** No BLOCKER rides forward and no residue is deferred
from this round. What *was* deferred earlier in the run is listed in RULINGs 12,
13 and 16.

## Verdict commit

**`e3fd54c`** — `docs(openspec): author lift-burn-preview-to-view, link 2a-ii of the system HUD chain`.

The verdict is current while this is empty:

```bash
git diff e3fd54c -- openspec/specs/system-space-view openspec/changes/lift-burn-preview-to-view
```

When it is not empty the re-attack scope is that diff, not the whole change.
The six round-3 residue repairs are inside this commit and were not themselves
adversarially reviewed (RULING 18).

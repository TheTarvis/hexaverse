# Adversary round 2 — `lift-burn-preview-to-view` (change mode)

*Persisted by the orchestrator, verbatim, from the adversary's returned text
(2026-10-03). The orchestrator's binding rulings follow the report.*

**Counts:** 0 BLOCKER, 2 MAJOR, 8 MINOR. **Verdict: NOT CLEAR.**

Both MAJORs are small: each needs one sentence of spec text plus one test arrangement, and neither needs a new MODIFIED block or pushes the count past 40. The MINORs alone would not have prevented CLEAR.

I ran no tests and booted nothing. The only thing I executed was a throwaway `@tanstack/query-core` probe (no repo files touched) to confirm M1's mechanism.

Paths are relative to `/Users/travis/Projects/hexaverse/`.

---

## (a) Round-1 findings

| R1 | Status | Evidence |
| --- | --- | --- |
| B1 | Resolved by removal, legitimately | No `committed` hold, stored pair or commit callback remains (design.md Decision 5). The commit path is not touched, so after a commit the preview keeps polling as today. Drift is filed (`drift-preview-does-not-clear-on-commit.md`) and link 2a-iii is in the chain doc. |
| M1 | Resolved | The "offered exactly where" biconditional is gone. The label clause enumerates four states that match `SpaceCommandPanel.tsx:314` term for term (`!selection \|\| !canvasAvailable \|\| !fleet \|\| mineRunning`). |
| M2 | Resolved | design.md Context states the real reachability; task 3.6 uses the one reachable arrangement; the scenario's WHEN is now the own-fleets read. |
| M3 | Resolved in the requirement text, not in one carried scenario | See m1 below. The switch-path test exists (3.5). |
| M4 | Resolved | Task 3.12 and Decision 8's "Burning (no term)" row. |
| M5 | Resolved | `fleet-roster` row is in the checked table; drift filed. Nothing is removed at commit. |
| m1 | Resolved | My diff of live against delta shows exactly the two edited bodies design.md lists; every other carried scenario is byte-identical. |
| m2, m3, m4 | Dissolved with the removed rule | Confirmed; see "Nothing BREAKING" below. |
| m5 | Resolved | Cancel scenario and task 3.3 added; the non-inducible WHEN is reworded; the count is 36 (8+1+15+5+7), honest. |

---

## MAJOR

### M1 — "SHALL return when the mine ends" does not say what is shown, and the natural implementation re-presents the pre-mine quote as current

*Present in round 1 (RULING 9's sentence) and missed there.*

**Where.** Delta, preview requirement:
> "A preview that is withdrawn because a mine starts while it is shown SHALL return when the mine ends, whether its ETA passes or it is cancelled, and the same selection is still current."

Scenarios "A mine's completion restores the quote" and "A cancelled mine restores the quote" both end at "THEN a preview request is sent for the held selection". Neither says what the panel shows meanwhile.

**What the code does.** `frontend/hooks/use-burn-preview.ts:76` is `preview = enabled ? (query.data ?? null) : null`. A disabled observer stays subscribed, so `gcTime: 0` does not drop the data. My probe confirmed two cases when `enabled` flips back to true:
- **Withheld longer than `staleTime` (10 s).** The observer returns the old data at once with `isFetching: true` and no error. The hook reports `stale: false`, so the view's `currentQuote` is the pre-mine quote. The panel shows its figures and ceiling as current, and a click sends `maxFuelTons` from it, until the new response lands. The quote's age is the mine's length, so `preview.arriveMs - worldTime` can be negative.
- **Withheld less than 10 s (a prompt cancel).** No request is sent on resume. The old quote is current until the next interval, so a "current" quote can be up to about 20 s old rather than 10 s.

**Why it is this change's.** Today the only term that toggles is lane transit, and it never toggles back while the view is mounted. This change makes withheld-then-requested reachable on the core loop: select the next target, start a mine, wait for it to finish.

**Failure it permits.** Engineer A drops the cached answer on withhold, so the quote returns empty and then fresh. Engineer B does nothing, so the old quote reappears as current. Both satisfy every scenario and task.

Task 3.3 cannot tell them apart. It starts from "a mine known to the read", so the query never ran and holds no data. Task 3.2 stops at the withdrawal. No task runs shown, then withheld, then restored, which is the arrangement the SHALL sentence describes. Link 2a-iv will draw the gauge overlay from this same `currentQuote`.

**Principle for the fix.** State one behaviour for a withheld-to-requested transition, for all three terms:
- Either no figure, ceiling or cap is presented from a response received before the withholding began, and a failure of the restoring request is a no-quote rather than a stale marking.
- Or the earlier figures may reappear, with a stated bound.

Also state when the restoring request is sent: at the transition, or within one interval. Then add one arrangement to 3.3: preview shown, mine reported, mine ends with the restoring request held pending; assert what the panel shows and that a click in that window carries no stale cap.

### M2 — "No path sends a preview request while one is withheld" contradicts the unmodified *Quote-Locked* re-quote

*The rule is RULING 10's; the "Unaffected" verdict was not tested against it. Likely present and missed in round 1.*

**Where.**
- Delta: "No retry or re-quote invoked while a preview is withheld SHALL send a preview request", with scenario "WHEN a retry or a re-quote after a cap rejection is invoked THEN no preview request is sent".
- Live and unmodified, `openspec/specs/system-space-view/spec.md:632`: "IF the commit is rejected for exceeding its cap, THEN the system SHALL request a fresh preview and present the new figures for re-confirmation", with scenario "A cap rejection re-quotes in flow… THEN a fresh preview is requested".
- design.md's table marks *Quote-Locked* "Unaffected: a cap rejection re-quotes through `onRequote`".

**Failure it permits.** Task 3.14 induces exactly the overlapping state: a cap rejection that lands after the selection moved to the fleet's host. After archive, two live scenarios give opposite THENs for it. QA naming closing assertions at 5.2 has no stated precedence. A later link reading *Quote-Locked* alone would restore the request.

**Principle for the fix.** One clause in the modified preview requirement saying the withheld states bound *Quote-Locked*'s re-quote: a cap rejection that lands while the preview is withheld requests nothing and presents nothing for re-confirmation. Change the table row from "Unaffected" to say so. No third MODIFIED block is needed if the precedence is stated where the new rule lives.

---

## MINOR

- **m1 — One carried scenario still asserts a world-truth absolute (residue of R1 M3).** "No preview is requested while a mine holds the movement channel" is byte-identical to live: "WHEN the acting fleet has a running mine claiming its movement channel, or is in lane transit THEN no preview request is sent for a newly made selection". The new lag paragraph and "A mine not yet read costs at most…" say a request is sent in exactly that state while the read is pending. design.md argues the requirement prose governs. That is a defensible reading, but the scenario is literally false in a window the same requirement documents. Two body edits were already accepted; "…as the view last read it" would be a third.
- **m2 — Burn staying enabled where the preview is withheld is asserted by tasks, not by any scenario (residue).** Tasks 3.6 and 3.7 assert "`burn-button` enabled as before". The scenarios "A fleet in lane transit requests no preview" and "A fleet docked at its selected target requests no preview" have no such THEN. The carve-out "SHALL NOT of itself make the burn command unavailable" does not forbid disabling Burn for a different stated reason; only the prose sentence and unmodified *Burn Command Targets…* do. An `AND the burn command's availability is unchanged` on those two scenarios closes it. As written the carve-out does not license disabling Burn; I found no state where it does.
- **m3 — RULING 16's "does not worsen" is true of requests and errors, and slightly untrue of presentation (attack on the ruling; not blocking).** Docked at the selected target is the ordinary state after every arrival. Today the panel shows "No quote — the preview could not be solved", Retry, the uncapped label and an enabled Burn. Afterwards it shows only "Uncapped: this burn will be committed with no fuel ceiling" and an enabled Burn that ends in a 500. The one line hinting the burn cannot be solved is gone, and the state now looks like the loading window (`defect-command-panel-residual-presentation.md` item 1), permanently. Deferring the fix to the follow-up is legitimate residue. design.md Risks should say the no-quote line is lost there, instead of only "removes the 500 polling and the unsatisfiable Retry".
- **m4 — A record this change leaves "untouched" now misdescribes it (residue).** `docs/handoffs/defect-zero-length-burn-returns-500.md` says: "`lift-burn-preview-to-view` removes the UI's trigger (no preview is requested, and the burn command is unavailable, while the selected target is the acting fleet's own host)". After the narrowing Burn stays available and a click still sends the order that 500s. Task 5.6 lists this file as untouched. Also `defect-command-panel-residual-presentation.md` names its owner "link 2a-iii (`add-burn-cost-overlay`)", which is now 2a-iv.
- **m5 — "Change together… in the same render" is not observable as worded (residue).** A request is not sent in render, and task 3.4 does not say what distinguishes one value from two. A flag built on `!!runningMine` with no ETA term, or on `clock.now()`, passes 3.1–3.3 if the mocked read stops reporting the mine at ETA. Pin 3.4 to the case that separates them: the ETA passes while the running-action read still reports the mine, `burn-button` is enabled and a preview request is sent.
- **m6 — The checked table omits *A Landed Resolution Is Announced to Assistive Technology*.** The delta's "Quote changes are not announced" scenario rests on it ("the existing landing announcements are unaffected and each fires once"). The verdict is "Unaffected", but the row is missing.
- **m7 — Task wording.**
  - Section 3 is headed "(red)". Tasks 3.6, 3.8–3.13 and 3.15 pass against today's code, since the real panel already calls the real hook with the transit term; they are regression guards. Say so, so a strict-TDD crew does not contort them to go red.
  - The section-3 preamble's mock list omits reads the real view issues (interior, station, board, session, galaxy, scan targets, settled scan, sightings). "The real hooks" should read as: `useBurnPreview`, `useRunningMine` and the mine and cancel mutations are real; the rest is mocked as in the existing family.
  - Task 2.1's parenthetical about a `{ data: null }` `useRunningMine` mock is false for `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx`, which does not mock `use-actions`. The one-line preview-mock fix is still correct for all seven files.
  - Task 3.7 parametrises station and gate hosts. Add a plain body host (the mining host), which the requirement text also names.
  - The hook's own comments (`use-burn-preview.ts:26-30`, `:35`) still give the "commit would be REFUSED" rationale that the spec now corrects. Task 4.1 fixes the panel's comments only.
- **m8 — Format.** "A withheld preview is never presented as a failed one" has GIVEN and THEN with no WHEN. Strict validation passes, but the conventions skill requires WHEN/THEN.

---

## (b) Checked and holding

- **The two body edits** are necessary and sufficient for what they claim. Without the GIVEN on "The burn stays committable…", its THEN is false under a running mine.
- **"As the view last read it"** is testable as written (tasks 3.5, 3.2, 3.9). The "at most" bound cannot be met by a silent fail-closed implementation, because the positive SHALL plus "takes no mine to be running" and Decision 8's "the switch's read answers no mine: calls continue" require the requests.
- **The uncapped-label states** are complete against the rendered `disabled` expression. They are consistent with Burn staying enabled when docked at the target and in lane transit, where the bullet still requires the label. Task 1.6 covers that shape at panel level (`preview` null, `previewNoQuote` false).
- **Nothing BREAKING: agreed.** The live second paragraph ("whenever a commit… would be accepted, and only then") already excluded the zero-length request. The live label guarantee is "before it is submitted", which a disabled control cannot do. I do not read the first sentence as unconditional.
- **Call-site flag.** Every term is observed in both directions at the real call site by a task that fails against its bug:
  - 3.1 fails against the mine drift.
  - 3.7 fails against the docked polling.
  - 3.10 fails against absent-equals-absent.
  - 3.12 fails against an added burning term.
  - 3.6 fails against a dropped transit term.

  I could not build an implementation that ships either closed defect and passes section 3.
- **Harness shapes exist.**
  - Panel test: `vi.mock('@/hooks/use-burn-preview')`, the mutable `previewState` and `panel()` are at `SpaceCommandPanel.test.tsx:44-55` and `:107`.
  - View tests: exactly seven files carry the wrong-shape `{ data, isLoading, isError, isFetching }` mock.
  - Guard idiom: the walk exists in `lib/realtime.test.ts`.
  - Guard 1.1 is red today.
  - Decision 6's premise is true: the probe showed `refetch()` on a disabled query does send.
- **Code facts in design.md** verified: `:295-296`, `:422`, `:651-677`, `:739`, `:821`, `:827`, `:901`; panel `:109-119`, `:301-314`. There is no early return before `:742`. Mine commit and cancel both invalidate `actions.running`. `AttachedTo` clears at burn commit (`backend/fleet/service.go:883`), so a fleet burning away from its host is never withheld from previewing a return to it.
- **Fences.** No backend, palette, galaxy view, strip, mirror or `FleetActionsPanel` edit; U2 covered by 4.5; e2e helpers read no testid this change removes.

## Verdict: NOT CLEAR

M1 and M2 are the only material findings.

---

## Orchestrator rulings (binding; 2026-10-03)

All ten findings confirmed and ACCEPTED. Reasoning for the two MAJORs:
`lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 17.

| Finding | Disposition |
| --- | --- |
| M1 | ACCEPTED — RULING 17: on any withheld-to-requested transition no figure, ceiling or cap from a response received before the withholding began is presented; the restoring request is sent at the transition; if it fails the state is no-quote, not stale. One shown → withheld → restored arrangement is added to the tests, asserting the presentation and the absence of a stale cap while the restoring request is pending. |
| M2 | ACCEPTED — RULING 17: the modified preview requirement states that the withheld states bound *Quote-Locked*'s re-quote; the checked-table row says so. No third MODIFIED block. |
| m1 | ACCEPTED — third carried-body edit ("as the view last read it"), listed in the edit table. |
| m2 | ACCEPTED — both scenarios gain the unchanged-availability AND. |
| m3 | ACCEPTED — design.md Risks states the lost no-quote line when docked at the target; the follow-up file records it. |
| m4 | ACCEPTED — the orchestrator corrects both handoff records (done alongside this ruling); task 5.6's list updated by the writer. |
| m5 | ACCEPTED — the scenario and task 3.4 are pinned to the separating case. |
| m6 | ACCEPTED — row added. |
| m7 | ACCEPTED — all five wording fixes; regression-guard tasks are labelled as such (the SDET's coverage table will record them `already-green`); the hook's comment correction joins the implementation task and the proposal's affected code already names the hook. |
| m8 | ACCEPTED — the scenario gains a WHEN. |

**Verdict commit:** none — round 2 was NOT CLEAR.

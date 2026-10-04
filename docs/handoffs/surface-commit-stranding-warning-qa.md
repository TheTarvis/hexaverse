# surface-commit-stranding-warning — QA verify (no stack)

QA, 2026-10-04. Verdict: **SHIP-PENDING-JOURNEY**. Tier 1 re-run by QA:
`cd frontend && npx vitest run components/space/SpaceCommandPanel.test.tsx components/space/SystemSpaceView.stranding-notice.test.tsx`
-> 2 files, 86 tests passed (54 + 32). Assertions read in `SystemSpaceView.stranding-notice.test.tsx` (every `expect` listed and
checked against the quoted THEN) and the coverage table's section 1 mapping. Production diff read: two files only
(`SpaceCommandPanel.tsx` +~30, `SystemSpaceView.tsx` +~50); nothing outside the stated Impact (no hook, service, type, backend edit).
Foreign edits (not-found.tsx, firebase.ts, firebase.emulator-config.test.ts) ignored.

Test abbreviations: V = `SystemSpaceView.stranding-notice.test.tsx` describe `3.n`; P = `SpaceCommandPanel.test.tsx` section 1 (1.n).
The view tests use real hooks over a mocked service with reads held until answered, and log answer order (`settled`) before asserting, so
they observe the ordering the gap rule is about (not a hand-set mock).

## Matrix A — system-space-view scenarios (25)

| # | Scenario | Closing test(s) | Assertion establishes THEN? | Verdict |
|---|---|---|---|---|
| 1 | A warned commit shows the notice with the success feedback | V 3.1; P 1.1, 1.5 | yes: notice non-null, toast.success x1, toast.error not called; panel callback carries warning true | PASS |
| 2 | Notice shown before any read has answered | V 3.1 | yes: asserts cached read still parked (no ETA row), listMine#1 unanswered, notice present | PASS |
| 3 | Read begun before commit does not end the gap | V 3.2 | yes: new listMine call at acceptance, body innerHTML unchanged when held read answers parked, notice present after confirming read | PASS |
| 4 | Same burn keeps the notice | V 3.3 | yes: two same-instant answers, three selections (target/other/none) | PASS |
| 5 | Projected clock passing arrival | V 3.4 | yes: GIVEN data-world-time > 61000 asserted, reads requested but unanswered, notice present | PASS |
| 6 | Cutting the drive ends the notice | V 3.5 | yes: present until refreshed read answers, removed; selection unchanged; warning toast still x1 | PASS |
| 7 | A stop ends the notice | V 3.6 (it.each: 70000/90000 burn; point park) | yes both arms | PASS |
| 8 | Arrival at a body | V 3.7 row 1 | yes | PASS |
| 9 | Arrival at a point | V 3.7 row 2 | yes | PASS |
| 10 | Different order elsewhere | V 3.8 (5000/80000; same target 5000/61000) + SDET boundary probe (arrival-only difference) | yes, each after a confirming read | PASS |
| 11 | Settled inside the round trip | V 3.9 | yes: present until read answers, removed on answer | PASS |
| 12 | A failed read never removes the notice | V 3.10 | yes: 4 steps incl. fleets-error + retry testids, final parked removes | PASS |
| 13 | Follows acting fleet, returns on switch back | V 3.11 row 1 | yes: no notice under B, back under A, toast.warning x1 total | PASS |
| 14 | Late response belongs to committing fleet | V 3.11 row 2; P 1.1 (callback fleetId) | yes: order mock called with fleet_a, toast shown under B, no notice under B, notice after switch | PASS |
| 15 | Each fleet keeps its own notice | V 3.12 | yes | PASS |
| 16 | Later unwarned commit replaces notice | V 3.13 | yes: absent at acceptance and after read with earlier instants | PASS |
| 17 | Second warned commit | V 3.14 | yes: toast.warning x2, notice at acceptance, kept on 2nd-order read, removed on no-burn read | PASS |
| 18 | Rejected/failed commit | V 3.15 (cap; unmapped), P 1.3 | yes: toast.error x1, exactly one notice (the earlier), no new warning toast, no new read | PASS |
| 19 | No stranding field | V 3.16 (absent; false), P 1.2 | yes, with control leg proving the arrangement can show a notice | PASS |
| 20 | Success feedback not suppressed | P 1.5; V 3.1, 3.14 | yes: success toast x1, plus one separate warning toast | PASS |
| 21 | Conveyed once, at acceptance | P 1.5 (literal copy equals constant: station + lane gate, no digit, no "strand"); V 3.5/3.11 (no further toasts) | yes | PASS |
| 22 | Advisory, distinct from preview line | V 3.17, P 1.4 | yes: distinct elements, no role, no live-region ancestor, no button, no red/rose class, Burn precedes, announcer text identical before/with/after removal | PASS |
| 23 | Independent of preview | V 3.18 (no-quote, stale, not requested) | yes, each asserts its preview state first | PASS |
| 24 | Copy | V 3.19 (body; point + different read worldTime) | yes: equals constant, regexes for station / lane gate / place a different order / no digit / no strand | PASS |
| 25 | Reload shows no notice | V 3.20 (stranded true/false) | yes: notice present before remount, absent after; `fleet-stranded-fleet_a` tracks the read | PASS |

## Matrix B — normative clauses no scenario states outright

| Clause | Evidence | Verdict |
|---|---|---|
| Appearing/removal SHALL NOT remove, disable or re-order the Burn control | Control present and preceding the notice (V 3.17, P 1.4). REVISED (ruling 16): P it.each `...the notice does not change the burn control's disabled state` (available / unavailable arms) asserts `disabled` equal without the notice, with it, and after removal; re-run green (56 tests in the file) | PASS (was INSPECTED) |
| Adds no text to the live region / no announcement | V 3.17 announcer text compared at 3 points (removal path = cut drive). The removal-by-arrival-with-landing path is not exercised, but the notice is not in any live region (asserted) and diff adds no announcer write | PASS (arrival-landing leg now closed by V 3.7 body row: announcer `''` before the landing read, exactly `Burn complete — arrived and attached to feat-body-1.` after, notice removed) |
| Warning toast independent of acting fleet | V 3.11 row 2, P 1.5 | PASS |
| No further toast on removal / return / refresh | V 3.5, 3.11, 3.12 toast counts | PASS |
| Toast and notice copy: no raw server text, no figure | constants in the diff; P 1.5, V 3.19 | PASS |
| Order identity = both instants equal, no target compare | diff `stillRunning`; V 3.8 incl. boundary probe | PASS |
| Failed read after gap ended leaves notice standing | V 3.10 step 3 | PASS |
| Read requested after acceptance, error continues gap | V 3.10 step 1 | PASS |
| The notice's end needs no user action / selection change | V 3.5 selection unchanged; derived at render, no effect/timer | PASS |
| Roster indication neither computed nor duplicated | diff adds nothing roster-side; V 3.20 | INSPECTED + PASS |
| Wire: served field omitted (not sent false) when not stranding | needs real response | PASS (was BLOCKED): journey spec step 1 asserts `'strandingWarning' in body` is false on the real POST /v1/fleets/:id/orders response, which the record says ran green (tier 4, 26 passed) |

## Matrix C — live `fleet-roster` "A Burn Commit's Stranding Warning Is Surfaced to the Player" on the burn command, system space view

| Scenario | Closing test(s) | Verdict |
|---|---|---|
| A stranding warning renders alongside a successful commit | V 3.1 + P 1.5 (success toast x1, notice, separate warning toast, not error) | PASS (mocked wire) |
| A commit with no warning shows no stranding notice | V 3.16, P 1.2 | PASS (mocked wire) and PASS on the real wire (journey step 1: key absent, notice count 0 in `preview-panel` and on the page, success toast 1, warning toast 0) |
| The warning is never rendered as an error | V 3.17, P 1.4/1.5: toast.warning not toast.error, no role/red class | PASS |

The burn command on the system view now satisfies this requirement. The stop command is out of scope (drift file `drift-stop-stranding-warning-not-rendered.md`).

## Totals

Matrix A 25 PASS. Matrix B 8 PASS, 2 INSPECTED (1 mixed), 1 BLOCKED. Matrix C 3 PASS (2 with a BLOCKED real-wire leg).
**PASS 36 / FAIL 0 / BLOCKED 1 (clause) + 1 real-wire leg of a Matrix C row / INSPECTED 2.**

## BLOCKED rows and the journey assertion that closes each (task 6.3)

1. Real wire omits the field on a non-stranding commit (Matrix B last row; Matrix C row 2, real-wire half). Journey, on a fixture that does not strand:
   commit a burn from the system view's command panel, intercepting/observing the POST `/v1/fleets/:id/orders` response body; assert
   `strandingWarning` is `undefined` in the parsed body (key absent), that `[data-testid=commit-stranding-notice]` has count 0 in the command panel, and
   that no warning toast appears (success toast shown once).
2. End-to-end notice lifecycle against real reads and the real order response (instants served by the backend equal those in the later own-fleets read):
   stranding leg: after a warned commit assert `commit-stranding-notice` visible in the command panel (not the roster row) and the warning toast shown once;
   cut the drive via the fleet panel control and assert the notice count goes 0 with no selection change and no second toast; reload and assert notice count 0
   while `fleet-stranded-<id>` is visible on the roster row. This also closes the real-wire instants-equality assumption: the response's `Burn.DepartMs/ArriveMs`
   equal the own-fleets read's for the same order (a mismatch would make the notice vanish at the first read; assert it is still visible after the first post-commit read).
3. `[journey-console]` update-depth check carried forward as a hard assertion.

If no fixture can arrange a stranding commit: the real-wire instants-equality (item 2's visible-after-first-read leg), the notice's removal on cut drive against
real reads, and the reload/roster-indication leg stay unclosable at the journey; they remain closed at tier 1 on mocked wire only and must be recorded untested, never passing.
Item 1 (non-stranding omission) is closable regardless.

## Findings: none blocking. Tasks check

Tasks 1-4 `[x]` match reality (86 green; diff matches 4.1-4.3; 4.4 diff scope confirmed by QA). Tasks 5.1, 5.2, 6.1-6.7 unchecked, correct for this phase.
6.2 (QA names a closing assertion per scenario) is satisfied by the matrices above.

## Exploratory observations (code reading; none a SHALL violation)

- Commit while own-fleets read in error: acceptance triggers `useOrder` invalidation; state is not `success+idle`, so the record stores the read count and the gap
  holds (notice shown), beside the fleets-error notice, until a read answers (this is the 3.10 path).
- Three fleets: record is `Record<fleetId, WarnedOrder>`; notices are independent per fleet; only the acting fleet's is shown. No cap or cleanup, records are small and live for the view's life.
- Rapid double commit: the panel's burn guard blocks a second in-flight commit; two sequential warned commits replace the record (3.14). No race observed.
- Record is never deleted when an order ends, only by an unwarned acceptance or a new warned one. Safe because display requires both-instants equality or an unanswered gap; a later order with identical instants for the same fleet would re-show it (unreachable: instants are served times of a distinct commit).
- A warned response missing either burn instant shows the notice for the gap only (ruling 10/13; filed follow-up, not spec'd).
- `awaitingRead` relies on `dataUpdateCount` read in render via `qc.getQueryState`; re-render comes from the view's own `useMyFleets` subscription. If a read answers with data structurally identical to the cache and no tracked prop changes, a re-render might not occur until the next render; real answers carry a new `worldTime` so this is not expected. Journey item 2 would catch it.
- Panel unmount mid-flight drops the response's toast, callback and notice (the Taught record in task 5.2 already names this).
- Notice uses the same amber class as the drift notice (`text-[11px] text-amber-400`), distinct from error red; there is no `role`, so assistive tech gets only the one warning toast, per spec.
- `Mode === 0` literal matches the file's existing convention (not `SHIP_MODE_BURN`).

## Spec gaps

- No scenario asserts Burn's `disabled` state unchanged while the notice appears; the clause rests on inspection.
- The announcer-unchanged clause is tested on the cut-drive removal only; the arrival-landing removal path is not exercised.

**SHIP-PENDING-JOURNEY**

---

# Post-journey update (archive gate) — final verdict

Inputs: `surface-commit-stranding-warning-journey.md`; spec `frontend/e2e/tests/commit-stranding-notice-journey.spec.ts` (assertions read); rulings 16-18.
QA re-ran tier 1: `SpaceCommandPanel.test.tsx` + `SystemSpaceView.stranding-notice.test.tsx` -> 88 passed (56 + 32). I ran no stack; the tier 4 and tier 3 results are taken from the record.

## Rows re-judged

| Row | Closing evidence (existing in a test body or spec assertion) | Verdict |
|---|---|---|
| Burn control not disabled by the notice (was INSPECTED) | P it.each, two arms (available, unavailable): `disabled` equals expected before, with `commitStrandingNotice: true` (notice asserted present), and after removal. A `disabled={... || commitStrandingNotice}` mutant would fail it | PASS |
| Announcer unchanged / arrival-landing removal (leg was INSPECTED) | V 3.7 body row: GIVEN announcer is `''`, after the landing read the notice is null and the announcer is exactly the landed-resolution text. The point row asserts only notice removal (no announcement is claimed) | PASS |
| Real wire omits the field on a non-stranding commit (was BLOCKED) | journey spec: `expect('strandingWarning' in body).toBe(false)` on the real response after `res.ok()` | PASS |
| Matrix C no-warning row, real-wire half | same assertion plus `commit-stranding-notice` count 0 in `preview-panel` and on page, `Burn committed` toast count 1, warning-toast text count 0 | PASS |
| Cut drive on the command surface, no warning toast, Burn enabled | journey step 2 (corroboration only: the commit was unwarned, so there was no notice to remove) | PASS as stated; NOT evidence for the notice's removal |
| `[journey-console]` update-depth | hard `afterEach` `toEqual([])`; record: 0 lines, 2 entries captured | PASS |
| Roster indication neither computed nor duplicated | diff adds nothing roster-side; V 3.20 | INSPECTED (stays; no spec scenario can fail it) |

## Not closed at tier 4 (the stranding leg, UNTESTED per ruling 17; not marked closed)

No journey assertion exists for any of these; each is closed at tier 1 on a mocked wire only (V 3.1-3.20):
1. Notice visible with exactly one warning toast after a real warned commit (real response carries `strandingWarning: true`).
2. Real-wire instants equality: the real order response's `Burn.DepartMs/ArriveMs` equal the later real own-fleets read's for the same order (notice still visible after the first post-commit read). If these differed on the real backend the notice would vanish at the first read; this is unverified against a real backend.
3. Notice removal on cut drive (and on arrival/stop) against real reads.
4. Reload shows no notice while `fleet-stranded-<id>` shows on the roster row, against the real backend.
Also unverified on a real wire: that the backend ever serves `strandingWarning` set true to this view at all.

## Tier 3

One red, `TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel`, attributed by the journey record to the filed OPEN `defect-station-order-500` and ruled residue (ruling 18). It is backend, in a file this frontend-only change does not touch; QA did not re-run it and takes the attribution as the SDET's. It does not bear on any scenario here.

## Final counts

PASS 38 (25 Matrix A + 10 Matrix B + 3 Matrix C), FAIL 0, BLOCKED 0, INSPECTED 1 (roster clause). Stranding-leg sub-clauses (items 1-4 above): closed at tier 1 on a mocked wire only, open at tier 4.

**SHIP** — with the stranding-leg real-wire clauses recorded as untested at tier 4 (a known, ruled residual risk, chiefly instants equality on the real wire), not as passing.

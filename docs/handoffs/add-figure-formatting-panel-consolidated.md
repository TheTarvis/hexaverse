<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/plans/system-hud/chain.md sha256=99b0cfb0a2bafeebd30fd7827184df76f779235d276be8dd50aa43ce1ede1210 bytes=41464 lines=637
source=docs/handoffs/add-figure-formatting-panel-architect.md sha256=f01f95174b83585deb760a8af417946baa573c5f3be68ba0dcfc6a5e55228129 bytes=35831 lines=654
source=docs/handoffs/add-figure-formatting-panel-ux.md sha256=eb5889c8eefc2ecc30c8e6669333c649c96d56e8b33853fbf0130cbaf5c9027b bytes=29789 lines=570
source=docs/handoffs/add-figure-formatting-panel-security.md sha256=9e3b5de9b6c8b80277e861aac80960118efa2c793d5cd4431efc9f4690a10045 bytes=6584 lines=115
source=docs/handoffs/defect-galaxy-clock-assumes-scale-1.md sha256=8676b1a7b8b6fe1bf543c073c49cc051d93792b5c50cef8456ea2abe4adecb42 bytes=4546 lines=95
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# add-figure-formatting — consolidated panel findings

Orchestrator's consolidation of the three-reviewer panel, 2026-09-08.
Link 1 of `docs/plans/system-hud/chain.md`, `/team --chain --full-auto`.

**Each reviewer's own report is persisted in full** — this file records
dispositions, dedupes and tie-breaks, and points at the reports for the
paste-ready delta text. Per `README.md` lesson three, nothing here is a summary
standing in place of a finding: every finding's full text, evidence and proposed
delta is in its reviewer's file, and the writer is handed all three paths.

| Reviewer | Report | Verdict |
|---|---|---|
| architect | `add-figure-formatting-panel-architect.md` | 4 BLOCKER, 5 MAJOR, 4 MINOR; also revised `design.md` (it owns that file) |
| ux | `add-figure-formatting-panel-ux.md` | NEEDS SCENARIOS — 7 MAJOR, 3 MINOR |
| security | `add-figure-formatting-panel-security.md` | SECURITY-CLEAR — no findings; one referred observation |

Panel selection: reliability was **skipped** (the matrix skips it for a pure UI
copy/logic change — no external dependency, no cross-service call, no
availability-relevant behaviour) and dba was **skipped** (nothing persistent is
touched: no schema, no query, no retention). Recorded so a later reader knows the
omission was a decision, not an oversight.

---

## Dispositions

All findings **ACCEPTED** except where noted. Severity is the reviewer's.

### Architect

| # | Sev | Finding | Disposition |
|---|---|---|---|
| A1 | BLOCKER | R9's "largest unit in which the magnitude is at least 1" reads as *always* `t/h` (2 t/s = 7,200 t/h clears 1), contradicting its own `2.4 t/min` scenario. Needs the second→minute→hour **walk**. | ACCEPT. Paste-ready requirement sentence + scenario replacement in the report §1. |
| A2 | BLOCKER | The rate conversion's direction is unpinned — every R9 scenario is at scale 1, where `×scale` and `÷scale` are indistinguishable, for the one conversion RULING 3 newly introduces. Correct direction is `× scale`. | ACCEPT. Report §2's scale-60 scenario is also the only `t/s` rung coverage, so it is what gives A1's walk a positive test. |
| A3 | BLOCKER | R11 is unsatisfiable inside `<option>` (`ScanControl.tsx:288-292`) — the content model forbids a nested figure element, so task 7.1 is not implementable as written. | ACCEPT. Resolution: the pair goes on the `<option>` itself, which holds exactly one figure. Report §3. |
| A4 | BLOCKER | `data-raw` presence is bound to the rendered *text*, not the *value*, so a due figure (span ≤ 0) or a scale-starved one may legally lose its attribute — which makes task 10.2's `data-raw <= 0` migration unimplementable and **leaves the 900-second-timeout trap alive inside the change that claims to remove it**. | ACCEPT. The sharpest finding of the panel. Report §4's replacement + addition. |
| A5 | MAJOR | The originally-designed `/check` validator rejects this change's own files: `SpaceStage.tsx` (whose five `toFixed` RULING 10 *requires*, and which task 8.1 edits) and `webgl/SpaceWorld.tsx:195` (a memo key). | ACCEPT. Architect already corrected `design.md`; tasks.md 11.1 rewrite is in report §5. |
| A6 | MAJOR | RULING 8 has no acceptance test anywhere, and `SystemSpaceView.tsx:405`'s live `?? 1` will silently defeat it. | ACCEPT — **merged with UX F5**, see *Dedupes*. |
| A7 | MAJOR | "carries its raw served value" is factually wrong on all four countdown sites — those raws are client-derived spans, and `mine-eta-preview`'s is never served at all. An implementer will put the served ETA stamp in `data-raw`, breaking A4's assertion. | ACCEPT. |
| A8 | MAJOR | `data-unit` has no closed vocabulary, and the analysis's own suggested tokens give a duration *span* and an absolute *instant* the same `world-ms` token — re-importing the exact confusion RULING 1 exists to prevent. | ACCEPT. A closed exported union is now in `design.md`; the spec needs the requirement text. |
| A9 | MAJOR | Task 10.1's "single point of change" is false: `hold-capacity` is two figures in one element and `hold-{kind}` is label+figure, so neither testid carries `data-raw` after the R11 split. | ACCEPT — routed with **UX F6**, same surface. |
| A10 | MINOR | R4 puts `×N` on every absolute stamp, so a sighting log reads the same suffix on every row and a screen reader hears it on every ghost. | ACCEPT as flagged — **merged with UX F8**, see *Dedupes* and RULING 16. |
| A11 | MINOR | R1's type-level scenario and R13's "two separate processes" scenario are unobservable as written; mechanisms (`@ts-expect-error` + `tsc --noEmit`; a static ambient-source guard) now recorded in `design.md`. | ACCEPT. Spec text must make both observable. |
| A12 | MINOR | `toLocaleString`/`Intl` is the reflex implementation of R7/R8's thousands separator and is locale/ICU-dependent — it would break R13's purity per environment. | ACCEPT. |
| A13 | MINOR | `SystemSpaceView.tsx:405`'s `?? 1` is the same defect as `GalaxyView.tsx:182` — append to the existing defect file rather than re-filing. | ACCEPT. **Done by the orchestrator** — appended to `defect-galaxy-clock-assumes-scale-1.md`. Not writer work. |

### UX

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | MAJOR | `system-space-view` › *A Sighting Ghost Renders at Its Frozen Position…* is not a delta target, and its **visible** `sighting-facts` hover line (`SpaceStage.tsx:709`) renders a raw world-ms `asOf` on screen — the change's own fault-#1 example — with no task, no delta, and no recorded exception. It falls through both buckets. | ACCEPT. A 5th `system-space-view` MODIFIED block, **plus a task** for the visible line. |
| F2 | MAJOR | `system-space-view` › *Burn Commit Reports Its Outcome* — R12's own canonical worked example (`SpaceCommandPanel.tsx:135`'s toast) — is missing from the delta list although task 4.2 plans the fix. | ACCEPT. 6th `system-space-view` block. Spec-first: a task with no requirement behind it. |
| F3 | MAJOR | `docked-fleet-actions` › *Sell Commit*'s price-changed copy renders **two credit figures in one line** (R11's exact target problem) and task 5.4 plans the fix, but the requirement is untouched. | ACCEPT. 7th `docked-fleet-actions` block. |
| F4 | MAJOR | The `sighting-log` delta omits RULING 9's binding mandate to **state the minute-resolution collision in the spec text**. | ACCEPT. RULING 9 said "states the resolution loss explicitly"; the delta does not. |
| F5 | MAJOR | RULING 8's absent-scale behaviour has no testable scenario anywhere — only a `design.md` note — and it is reachable on every galaxy-view first paint. | ACCEPT — **merged with A6**, see *Dedupes*. |
| F6 | MAJOR | `docked-fleet-actions` › *Fleet Panel Cargo Hold Readout* keeps the identical `?? 0` lie RULING 13 fixed for the roster (`FleetActionsPanel.tsx:98, 318, 356, 365`), so the change would ship `— t fuel` on the roster row and `0 / 0 t` for the **same fleet** one panel over. | ACCEPT. Independently verified by the orchestrator at those four lines. This is RULING 2's cross-surface divergence reintroduced one requirement away. |
| F7 | MAJOR | *Credit Balance Readout*'s live region renders empty text on a transition to/from "Unavailable" (`FleetActionsPanel.tsx:344-346`), so AT announces nothing while a sighted player sees the readout flip. | ACCEPT. In scope: this requirement is directly amended here and the absent-value vocabulary is this link's own subject. |
| F8 | MINOR | The `×N` suffix has no accessible explanation, and its per-row repetition on `sighting-log` risks reading as a per-observation varying scale. | ACCEPT — **merged with A10**, see RULING 16. |
| F9 | MINOR | R9's one-decimal rounding can render a genuinely positive small rate identically to a true zero (`0.0 t/h`), unguarded — unlike every sibling quantity's zero-vs-absent boundary. | ACCEPT. The same species as the tonnage `0.0 t` vs `—` distinction the change already makes elsewhere. |
| F10 | MINOR | The roster's bare magnitude-suffixed range depends on an un-pinned component-local word ("range") for its meaning. | ACCEPT. Consequence of RULING 14's no-unit-name; cheap to pin. |

### Security

SECURITY-CLEAR, no findings. One observation **referred and accepted as a panel
finding** (S1, below) rather than deferred to the adversary — routing a finding
the panel already made to a later gate is how findings get lost.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| S1 | MAJOR | `<Figure>`'s `text` prop takes an arbitrary string, so a call site can interpolate a raw number into a template and hand it over as pre-formatted — satisfying R12's guard while violating R12 itself. The guard greps for `.toFixed(` and local `countdown`/`formatEta`; neither catches `text={\`${raw} t\`}`. | ACCEPT. See RULING 17. |

---

## Dedupes and tie-breaks

1. **A6 ≡ F5** — both find RULING 8 has no acceptance test. Merged into one
   finding. UX supplies the `fleet-roster` scenario text; architect supplies the
   mechanism detail that matters most (`SystemSpaceView.tsx:405`'s live `?? 1`
   would silently defeat it, and `design.md` now splits `servedScale` as
   un-defaulted `number | undefined` while `useWorldTime` keeps its `?? 1` at one
   anchor line). Both credited; the writer authors from both texts.
2. **A10 ≡ F8** — both flag `×N` repetition. Merged; ruled at RULING 16.
3. **A9 + F6** — adjacent, not duplicate: A9 is the *test-migration* consequence
   of splitting the hold readout, F6 is the *absent-value* behaviour of the same
   readout. Routed together so the writer treats the hold readout once.
4. **No inter-reviewer conflicts.** The standing tie-breaks (architect on
   technical shape, security on controls, ux on user-observable behaviour) were
   not needed — the three reviewers' findings are disjoint or complementary
   throughout. The one place they touch the same text (the hold readout) they
   agree on direction.
5. **Architect's `design.md` edits stand.** It owns that file and its
   corrections — the enforcement mechanism, the file layout, the `<Figure>`
   fencing, the `× scale` identity — are technical shape, its call by tie-break.
   Its replacement of the `/check` validator with a whole-tree `guards.test.ts`
   supersedes the writer's original decision.

---

## FULL-AUTO RULING 16 — `×N` stays on every stamp; the fix is a label, not a carve-out (A10 / F8)

**Ruling.** R4's rule stays universal: every absolute `T+` stamp renders its
`×N` suffix, including `×1` and including every `sighting-log` row. The
readability problem both reviewers raise is fixed by **UX F8's accessible-label
scenario** (the element carries a label stating the world clock is running at N
times real time), not by a per-surface carve-out. The per-row repetition is
recorded in `design.md` as a named, deliberate consequence rather than left to be
discovered on screen.

**Basis.** Precedence level 1 — RULING 2's whole rationale is that formatting
rules are cross-surface and must not be reopened by each placement; a
`sighting-log`-only suffix rule is exactly the per-surface variant it forbids.
Level 3 supports the remedy: UX proposed the label and explicitly declined to
recommend reopening R4, and the architect flagged rather than authored around it.

**Alternatives rejected.** *Suppress `×N` when the scale is 1* — rejected: R4's
own scenario requires the suffix at scale 1 so a reader never has to infer it,
and suppression would make the absent suffix ambiguous between "scale 1" and "not
served". *Suppress on list surfaces* — rejected as the forbidden carve-out.
*Render the scale once per list as a header* — rejected: that is placement, which
is links 2a–4's business, not this link's.

**Reversal cost.** One scenario and one label attribute.

## FULL-AUTO RULING 17 — `<Figure>`'s pre-formatted text is a bypass the guard must close (S1)

**Ruling.** R12's enforcement must catch a raw number interpolated into a
template and passed to `<Figure>` as `text`, not only a `.toFixed(` call or a
local `countdown`/`formatEta` definition. The architect's whole-tree
`guards.test.ts` is the right mechanism (it replaced the changed-file validator
per A5); its assertion set must include template-literal interpolation of a
numeric expression into a figure's text, and R12's requirement text must state
the rule in terms of *what produced the string*, not *which functions were
called* — a requirement phrased as a list of banned function names is a
requirement any new spelling evades.

**Basis.** Precedence level 3, the panel's own finding (security, referred), and
level 2: the repo has already been bitten by exactly this shape. `README.md`
lesson two records `hooks/use-refuel.test.tsx` asserting a double-submit guard
and passing against code that had no guard, because the test was shaped so it
could not observe the failure. A guard that greps for two function names while
the requirement says "the only place a wire number becomes text" is the same
shape: green, and blind to the case that matters.

**Alternatives rejected.** *Accept the bypass as theoretical* — rejected: this
change converts ~25 call sites by hand, so the bypass is not hypothetical, it is
the path of least resistance for a tired implementer at site 20. *Make `<Figure>`
take the formatter function and its arguments instead of a string* — appealing,
and it would close the hole by construction, but it is a `design.md` change the
architect considered and rejected reasons of fixture-table shape (R13 pins
`(raw, expected)` *string* pairs); routing it back would reopen a decision the
owning reviewer already made. The guard is the cheaper close.

**Reversal cost.** One assertion in `guards.test.ts`.

---

## Size

`tasks.md` is at **exactly 40**, the hard cap. The architect's own findings are
net **−2 to 0** (A5 folds tasks 2.3 and 2.4 into 11.1; the rest are spec text or
wording inside existing tasks) and it recommends **not** splitting — but it did
not see the UX findings, which add work the architect's folding does not offset:
F1 needs a task for the visible `sighting-facts` line, F6 a hold-readout
fallback change, F7 a live-region fix, and the merged A6/F5 an absent-scale
conditional.

**The writer is instructed to apply everything and report the resulting count
without compressing to fit.** If it exceeds 40 the orchestrator splits at the
pre-identified seam (analysis §9: the `lib/eta.ts` dependency boundary), not the
writer. Padding down to 40 to dodge a split would be the worst outcome — it hides
the size instead of managing it.

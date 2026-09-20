# Adversary round 3 (cap) — `fix-world-time-render-loop`

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer:
`openspec-adversary` (opus), read-only. **Round 3 of 3 — the cap.**
Verification round, not a new attack.

**Verdict: FINDINGS — 0 BLOCKER, 0 MAJOR, 4 MINOR. IMPLEMENTATION-READY.**

## Orchestrator rulings

**The repair loop has converged and is closed.** Three rounds, 36 findings
total (20 + 12 + 4), zero BLOCKERs and zero MAJORs surviving. Round 2's twelve
are twelve-for-twelve fixed, round 1's twenty stayed fixed, and its two
partials (M13, m16) are now whole.

**All four MINORs ACCEPTED and applied**, rather than carried as residue. The
workflow's rule is that MAJOR/MINOR residue at the cap becomes a follow-up
change — but that rule exists for findings needing judgement or new text.
These four are each a **one-sentence amendment for which the adversary supplied
the exact wording**, and two of them (MINOR-1, MINOR-2) concern the change's
description of its own footprint, which Travis reads. Applying an adversary's
own prescribed text is the repair the finding asked for; it is not a fourth
attack and does not need one to validate.

**Verdict currency:** this round-3 verdict was issued **before** those four
edits. The re-attack scope is therefore exactly those four amendments, and it
is nil in substance because each is the adversary's own text applied verbatim.
No new requirement, scenario, or task was created by them.

**Verdict commit: NONE**, as in rounds 1 and 2. This run is not a chain link
and not `--full-auto`; the orchestrator was not authorized to commit. The
change folder remains untracked, so none of the three verdicts can be
currency-checked by `git diff <sha>` later. Committing
`openspec/changes/fix-world-time-render-loop/` plus this directory's
`fix-world-time-render-loop-*` files is the one step that would pin them, and
it is Travis's to make.

**Standing judgements from this round, carried into the final report:**
- No BLOCKER at the cap — the run does not stop.
- No MAJOR open — nothing needs to seed a follow-up change.
- The change is implementable under **either** OQ3 branch; the adversary
  walked both.

---

# Adversary round 3 (cap) — `fix-world-time-render-loop` — VERIFICATION ONLY

Read this round: `-adversary-r2.md` (findings + rulings), `-adversary-r1.md`, all four change artifacts at their current revision, both deltas, the live `system-space-view` / `galaxy-view` specs (heading and name-collision checks), and — only where a round-2 repair newly asserts something about code — `frontend/lib/services/fleet-service.ts`, `frontend/hooks/use-fleets.ts` and the three `useMyFleets` call sites. No third attack was mounted; untouched text was not re-read for new findings.

---

## 1. Round-2 verification table (N1–N6, n1–n6)

| # | Status | Current text |
|---|---|---|
| **N1** — hook contract stated two ways | **FIXED** | `design.md:119-122` now reads "re-anchors it in an effect whenever a fresh served reading **arrives and a served scale is available** (see the named-caller paragraph above)", matching `design.md:104-106` ("only when **both** a served world time and a served scale are available"). `tasks.md:16` (3.2): "re-anchor when a fresh reading arrives and a scale is served; **never anchor on a reading alone**". `tasks.md:19` (3.4) and `tasks.md:25` (3.6) carry the same both-required phrasing. The second edge is closed too: `tasks.md:17` (3.3) now ends "Pass `clockScale` (today's `?? 1` chain) as `useWorldClock`'s scale argument, **not `servedScale`** — this view's figures take `servedScale` separately and its clock must never fail to anchor." Since `clockScale` is always defined, the system view's clock cannot freeze at 0 under the both-required contract. All four statements agree. |
| **N2** — fleetless branch contradicted `fleet-movement` | **FIXED, both halves** | Hold clause narrowed, `specs/galaxy-view/spec.md:41-45`: "WHILE no world-clock scale has been served — **the own-fleets read has not yet landed, so the only served world time is the galaxy read's, which carries no scale** — the view SHALL hold…". `grep` confirms zero occurrences of "no fleets" in the galaxy delta. `tasks.md:19` now sources the scale "read from the fleet-list envelope's `scale` field — served unconditionally on every list form, including an empty list, per `fleet-movement`'s *Fleet Reads Serve the Simulation Clock's Scale Alongside Their World Time*", and names the client gap **as a task**: "This requires amending `frontend/lib/services/fleet-service.ts`'s fleet-list call…". `design.md:104-114` mirrors it. **No production code was touched**: `git status --porcelain` shows only `.claude/skills/code-quality-checks/skill.md` and the defect handoff modified plus untracked docs; `frontend/lib/services/fleet-service.ts:41` is still `return response.data.fleets ?? []`. (One residue in the task's wording → MINOR-1.) |
| **N3** — task 4.6 branch note + fail-soft path | **FIXED** | `tasks.md:37` (4.6) now ends "— under OQ3 (B) the transform loop publishes the basis and this test runs under jsdom; under OQ3 (A) `draw()` is the publisher, so (a) this test has no unit-level surface and must be recorded as a tier-4-only assertion, and (b) the loop-less fail-soft path (`SpaceWorld.tsx:224-229` — probe live, renderer threw) must keep a React-computed basis for membership and target placement, since `SpaceCanvas` keeps the DOM layers mounted through it." Mirrored in `design.md:328-335`. (Wording tension with the memo deletion → MINOR-4.) |
| **N4** — 3.4c could not fail | **FIXED** | `tasks.md:22`: "with a served scale of `S ≠ 1` and no read landing, advance N wall-clock seconds with fake timers and assert `GalaxyView`'s projected world time advanced by `N × 1000 × S` world-milliseconds, **not by `N × 1000`** — and that the same value reaches the roster". This can now go red against a scale-1 projection, which is the defect it exists to forbid. |
| **N5** — stale OQ4 reversal | **FIXED** | `design.md:501-509`: "drop the fourth paragraph **and both its scenarios** (*The projected clock runs at the served scale*, *The projected clock holds when no scale has been served*) … amend tasks 3.4/3.4c/3.4d to pass **a literal `1`** as the scale (not *no* scale — `useWorldClock` anchors only on a served scale, so omitting it freezes the clock at 0), and note that under this branch `hasReading()` loses its named caller and should be dropped from Decision 1 (m18) while `defect-galaxy-view-clock-ignores-served-scale.md` stays open." All three defects named in N5 are addressed; the literal `1` is present, so the clock-frozen-at-0 trap is gone. (One residual undecidable → MINOR-3.) |
| **N6** — 1.1's stop threshold | **FIXED** | `tasks.md:3`: "Record the count in `docs/plans/…-rulings.md`. **If this change's task count would exceed 40 (it is 35 as written)**, stop and report before writing code". The dangling "the total" is gone; only one reading survives. Task count independently recounted: 2 + 4 + 12 + 10 + 7 = **35**. |
| **n1** — OQ3 named in durable spec text | **FIXED** | `grep -rn "OQ3\|design.md" openspec/changes/fix-world-time-render-loop/specs/` returns **nothing**. `specs/system-space-view/spec.md:4-8` now reads "SHALL advance the space view's picture … **from an animation-frame loop alone**, reading the current world time from the view's clock at the instant of each frame" — binds under (A) and (B) without naming either. The reader still gets the branch: `proposal.md:21-25` — "**Which loop is design.md's OQ3, open** — either the draw loop that already exists … (option A) or a separate transform-writing loop extracted alongside it (option B, the recorded lean); Travis decides before group 4's tasks are implemented." Carried adequately. |
| **n2** — nonexistent `design.md` Impact section | **FIXED** | `specs/galaxy-view/spec.md:31-33`: "this view's own navigations have not been separately measured (**this change's proposal**, \"Unmeasured, stated\")" — and `proposal.md:110-113` is indeed headed "**Unmeasured, stated:**". |
| **n3** — 20 s wrapper | **FIXED** | Both deltas: "SHALL arrive within 20 seconds of the action that requested it — **a ceiling taken from the journey budget this defect was measured against** (`defect-cross-system-chevron-nav-stall.md`), **not a target, and not to be relaxed**" (`specs/system-space-view/spec.md:59-62`, `specs/galaxy-view/spec.md:24-27`). `grep` confirms zero "obtain a green" in either delta; the anti-tuning guard survives without the harness jargon. |
| **n4** — dangling pronoun | **FIXED** | `specs/system-space-view/spec.md:87-91`: GIVEN "the acting fleet is burning with a served arrival in the future, **so a figure counts down to it**" / THEN "**that figure's** raw span (`data-raw`) has decreased by the elapsed world-millisecond span". Antecedent now present. |
| **n5** — non-navigation clause uncovered | **FIXED** | `tasks.md:20` (3.4a) ends "— and a roster row **selection** for a fleet in another system issues **no** `router.push`, only `setSelectedId` + `focusSystem` (`GalaxyView.tsx:248-253`)", covering `specs/galaxy-view/spec.md:34-35`. |
| **n6** — 3.4b red against right code | **FIXED** | `tasks.md:21`: "with a burning own fleet **whose read served a scale** (the hold branch, task 3.4d, covers the unserved case)". And 3.4d gained its observable: `tasks.md:23` ends "observable on the roster row's `data-raw`". |

**Twelve of twelve FIXED.** None is words-changed-hole-open: in every case I checked the concrete failure the finding named and it is now excluded by the text.

---

## 2. Round-1 regression spot-check (20 findings)

No regressions. Spot-checked every finding whose text the round-2 repairs sat next to:

- **B1** — `specs/galaxy-view/spec.md:19-24` still names the burn redirect with the byte-exact `fleet-roster` title; the non-navigation lock survives at `:34-35`; `tasks.md:20` still says "a roster burn command on a fleet in another system" (and now also covers the lock — n5).
- **B2** — bound intact in both deltas; all four navigation scenarios still carry "within 20 seconds" (`system:120`, `galaxy:63-64`, `galaxy:69-70`). The n3 rewording kept the number and the anti-relaxation guard.
- **B3** — **now whole and unchanged in substance.** Branch notes present on `tasks.md` 2.1, 4.2, 4.3, 4.3a, 4.3b, 4.6, 4.8, 4.9; `design.md:328` "**Conditional on OQ3.**"; `design.md:229` still "OPEN — OQ3"; `design.md:484-491` records the lean as B, not picked. The n1 deletion moved OQ3's naming out of durable spec text without losing it (proposal carries it).
- **B4** — `proposal.md:36-40`, `tasks.md:36` (4.5) and `design.md:287-294` (Decision 6) all still say the state, effect and `if (!available) return` guard stay, React-written, re-keyed on the coarse tick. Untouched this pass.
- **B5** — hold rule and its scenario both survive (`galaxy:41-45`, `:78-82`); N2's narrowing tightened the WHILE without removing the obligation; `tasks.md:19` still states `Galaxy` has no `scale` field.
- **M6** (`system:82-84`), **M7** (both deltas' three-mechanism prohibition), **M8** (`system:124` five seconds / `tasks.md:10` ≥120 frames + "record the test failing on the pre-fix tree"), **M9** (`tasks.md:26` visibilitychange mechanism), **M10** (`system:90-91`, `galaxy:56-57`), **M11** (`design.md:347-352` + `tasks.md:37`), **M12** (3.4b/3.4c/3.4d/4.3b/5.3a all present; 3.4a still carries "a call-site regression guard, not evidence about starvation"), **M14** (`system:62-68`, `galaxy:27-33` — measurement wording intact, citation corrected), **m15**, **m17**, **m18** (`design.md:102-114` + `tasks.md:25`), **m19**, **m20** (`design.md:204`) — all still fixed.
- **The two round-2 partials are now whole:** **M13 → N5 FIXED**; **m16 → N6 FIXED** (file list still carries `SpaceStage.sighting-ghost-selection-guard.test.tsx`, threshold now unambiguous, count 35 ≤ 40).
- Independent re-verification of the MODIFIED block: all six scenario headings under *Body, Lane-Gate, and Point Selection Is Keyboard-Operable* are byte-identical to `openspec/specs/system-space-view/spec.md:26-52`. Neither ADDED requirement name collides with an existing requirement in its live capability.

---

## 3. New residue introduced by the round-2 repairs

Four items, all MINOR, all in text the round-2 repairs wrote. **This is a residue-only round** — nothing here comes from re-attacking untouched text, and nothing here is a BLOCKER or a MAJOR.

- **MINOR-1 — `tasks.md:19` leaves the shape of the `listMine` change open, and the two offered shapes have different blast radii.** Text: "change it to also surface the envelope's `scale` (**or return the envelope itself**) so the fleetless branch does not exist." `fleetService.listMine()` is typed `Promise<Fleet[]>` (`frontend/lib/services/fleet-service.ts:39-42`) and reaches three components through `useMyFleets` (`frontend/hooks/use-fleets.ts:19-24` → `GalaxyView.tsx:179`, `FleetRoster.tsx:116`, `SystemSpaceView.tsx:233`). "Return the envelope itself" changes the hook's data shape for all three; no task covers that ripple, in a change that stops at 40 tasks and spends task 1.1 on sizing. The other reading an implementer may take — stamp `scale` onto each `Fleet` — satisfies the phrase literally but not the purpose clause, and leaves `myFleets?.[0]?.scale` `undefined` for a requester with an empty list. The purpose clause ("so the fleetless branch does not exist") and `npm run lint`/`tsc` at task 5.1 both bound the damage, and a living corp with zero fleets is near-unreachable (the death invariant), which is why this is MINOR and not MAJOR. **Smallest fix:** "expose the envelope's `scale` on `useMyFleets`' result (not per fleet); update its three consumers' types if the shape changes."
- **MINOR-2 — `proposal.md:79-92` (Impact › Rewired) does not list the files task 3.4 now changes.** The Rewired list names `SystemSpaceView.tsx`, `SpaceStage.tsx`, `webgl/SpaceWorld.tsx`, `GalaxyView.tsx`. The N2 repair added `frontend/lib/services/fleet-service.ts` (and, on one branch, `frontend/hooks/use-fleets.ts`) to the work; the proposal — untouched this pass, by design — no longer describes the change's own footprint. Attack surface 8 (impact section missing code the deltas/tasks clearly touch). **Smallest fix:** one bullet under Rewired naming `fleet-service.ts`'s list call and why (the envelope's `scale` is dropped today).
- **MINOR-3 — `design.md:505` tells OQ4's reversal branch to "amend tasks 3.4/3.4c/3.4d", but 3.4c and 3.4d are the tests for the two scenarios the same sentence deletes.** Under branch B, 3.4d (*hold when no scale has been served*) cannot be "amended to pass a literal `1`" — with a literal 1 always present there is no unserved state to hold through, so the task has no subject. **Smallest fix:** "…amend task 3.4 to pass a literal `1`, and **drop** tasks 3.4c and 3.4d with their scenarios." (This wording came from my own N5 fix text; the writer applied it faithfully.)
- **MINOR-4 — under OQ3 (A), "the memos are deleted" and "must keep a React-computed basis" sit five lines apart.** `design.md:331-335` says the fail-soft path "must **keep** a React-computed basis for coarse membership and target placement", while `design.md:343-345` says "`SpaceStage`'s `basis`/`viewport` memos **are deleted** rather than left beside them", and `design.md:331` asserts "the memo deletion below still holds either way". The deleted memo is the `[host]`-keyed one (the m19 defect); what branch (A) needs is a *resize-aware* React-computed basis, which is not the thing being deleted. An implementer under (A) reading "deleted" first could take the fail-soft clause as unreachable. Mirrored at `tasks.md:37`. **Smallest fix:** "…must compute a React-side basis **recomputed on resize** (not the deleted `[host]`-keyed memo)".

Considered and **not** filed, so the orchestrator knows it was looked at: the tension between the galaxy requirement's "Every figure … SHALL update within one wall-clock second" (`galaxy:14-17`) and the hold clause (`galaxy:41-45`) during the pre-fleet-read window. It resolves the same way `add-vitals-strip`'s live `system-console` clock-cell requirement resolves it (no honest rate exists to advance at), the window is bounded by one read, and this is round-1 repair text round 2 already passed. Not a finding.

---

## 4. The three judgements

- **BLOCKER? No.** There is no BLOCKER at the cap. Nothing in the change permits an implementation that contradicts the design document or drops designed behaviour, and no requirement invents behaviour the defect record does not sanction.
- **MAJOR still open? None.** All six of round 2's MAJORs are fixed and no new MAJOR was introduced, so there is nothing that needs to seed a follow-up change. The four MINORs above are each a one-sentence amendment; if Travis wants exactly one applied before implementation, apply **MINOR-1** (it is the only one whose worst case is a shipped behaviour rather than a reader's confusion).
- **Implementable under either OQ3 branch? Yes.** I walked both. Under **(B)** — the recorded lean — every group-4 task names the transform loop explicitly (2.1, 4.2, 4.3, 4.3a, 4.3b, 4.6, 4.8, 4.9), the picture assertions run under jsdom, and the basis authority is unambiguous. Under **(A)** every branch-dependent task now says so, the unit-level gaps are named as tier-4-only rather than silently dropped, and the fail-soft path is specified (N3's repair) — the only friction is MINOR-4's wording, which states the obligation clearly enough to build against. The clock contract (both-required anchoring) is now stated identically in design and in tasks 3.2/3.3/3.4/3.6, so neither branch hits a contradiction there. OQ4's reversal, if Travis takes it, is executable apart from MINOR-3's undecidable task instruction.

---

## 5. Verdict

**FINDINGS — 0 BLOCKER, 0 MAJOR, 4 MINOR. IMPLEMENTATION-READY.**

Round 2's twelve are twelve-for-twelve fixed; round 1's twenty stayed fixed and its two partials (M13, m16) are now whole; the only new material is four MINOR wording residues of the round-2 repairs themselves. This is a clean round in the sense the brief asked about — the convergence held, and I am not manufacturing a third attack to extend it. The change can go to Travis with the four MINORs listed as residue.

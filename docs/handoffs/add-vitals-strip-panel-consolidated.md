<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/handoffs/add-vitals-strip-panel-architect.md sha256=d4c4dbdc70caf6f79d4829e0901e4dc3970c691ba893eac23a566c5124a2e89d bytes=55533 lines=1222
source=docs/handoffs/add-vitals-strip-panel-ux.md sha256=9eb79fa16493911e63bd8090638acf0fe4c91b93fcd28fa4032bd5ea0f368b31 bytes=38583 lines=744
source=docs/handoffs/add-vitals-strip-panel-reliability.md sha256=a7e19cfb2f258b442f3a606ed13c124ae24359017a202669d699991b2f01f950 bytes=26672 lines=509
source=docs/handoffs/add-vitals-strip-panel-security.md sha256=51a2b48b2bb578ce47d74e35fe8cb6af2b4dff3e773e5435fc7eaade785bb6a5 bytes=7773 lines=146
source=docs/handoffs/defect-touch-pan-lost-with-camera-cluster.md sha256=726a1fecde2514e77c12fee194b5c3916c2094a88d28e1056730fedf1627c617 bytes=3068 lines=63
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# `add-vitals-strip` — panel consolidation and orchestrator adjudication

Four reviewers ran in parallel against the authored change. **Each persisted its
own report**, which is what makes this file an adjudication rather than a
summary — `docs/plans/continous_space/handoffs/README.md` lesson three permits
consolidation only when either every accepted finding is restated in full **or**
each reviewer's own report survives on disk. Here the second condition holds, so
the writer reads all four files for finding text and this file for what to do
with each.

| Reviewer | Report | Verdict | Findings |
| --- | --- | --- | --- |
| architect | `add-vitals-strip-panel-architect.md` (1221 lines) | ruled both routed questions; rewrote `design.md` in place | 4 BLOCKER, 12 MAJOR, 5 MINOR |
| ux | `add-vitals-strip-panel-ux.md` (743 lines) | NEEDS SCENARIOS | 9 MAJOR, 2 MINOR, 1 routed |
| reliability | `add-vitals-strip-panel-reliability.md` (508 lines) | NEEDS FAILURE SPECS | 1 BLOCKER, 2 MAJOR, 1 MINOR |
| security | `add-vitals-strip-panel-security.md` (145 lines) | SECURITY-CLEAR | 2 MINOR |

**The writer must read all four files.** This file does not restate finding text
and is not a substitute for them; paraphrase drops the quoted evidence the fix
depends on.

---

## 1. The two routed questions, now ruled

### FULL-AUTO RULING 22 — the fuel gauge's denominator is the served `roster.cargoCapacity`

**Ruled by:** architect (routed question 1), accepted without amendment.

The analyst recommended `fuel + freeHold` ("how full could I top up") and I had
recorded it as the leading candidate. **The architect's counter-argument is
decisive and reverses it:** that denominator *shrinks as ore is loaded*, so
mining makes the fuel gauge read fuller with no fuel added. A hauler with 12 t
of fuel and a hold packed with metals would render a **full** fuel gauge one
burn before it strands — and stranding is a modelled, surfaced state in this
game, with its own live `fleet-roster` requirement.

That is not a cosmetic objection. This link's whole adversary target is *does
the strip lie about state*, and an instrument whose needle rises when the
quantity it measures did not change is the purest form of that lie. Both gauges
are drawn on one tons-to-pixels scale, which additionally makes the fuel fill
and the hold's free space comparable by eye — the exact comparison
`add-burn-cost-overlay`'s cost segment will draw. "How full could I top up"
survives as the `hold-free` figure, which is served and already rendered.

**Basis.** Precedence 3 (the panel's recommendation), on an argument from a
reachable pathological state rather than from taste. **Alternatives rejected:**
`fuel + freeHold` (the pathology above); a client high-water mark (stateful,
unserved, already rejected). **Reversal cost:** one expression — but note the
denominator is also `add-burn-cost-overlay`'s overlay scale, so reversing it
later reopens that link too. The architect recorded the forward constraint
(`fuelCostTons > cargoCapacity` needs a clamp rule) in `design.md` so 2a-ii does
not re-litigate it.

### FULL-AUTO RULING 23 — keyboard pan is `Shift`+arrow on the surviving orbit cell; the at-limit state is a directional attribute, not the live region

**Ruled by:** architect (routed question 2). **Conflicts with UX**, which
recommended routing at-limit to the existing `camera-limit-status` live region
with a directional caveat. **Architect wins** — standing tie-break, technical
shape.

Both reviewers independently found the same hazard from different angles, which
is itself worth recording: UX found that today's aggregate `atPanLimit` is
*radial* ("at max distance from bound in any direction") while the deleted
buttons used a *directional* `panAtLimit(dir)` closure, so a naive reuse would
satisfy "route it to the live region" while silently failing the live
requirement's explicitly directional scenario. The architect found the deeper
reason the live region cannot host it at all: `camera-limit-status`
(`SpaceStage.tsx:552-558`) is a **single-slot priority chain** — zoom > pan >
orbit — so a camera simultaneously at the zoom and pan clamps reports only zoom.
Moving pan's at-limit onto it would make a live SHALL false for a reachable
state.

So: `Shift`+arrow on the surviving `camera-orbit` cell (matching the live
requirement's own "per key press" wording, adding no tab stop), and a
**directional** `data-pan-at-limit` attribute on that same element.
`select-pan-target-point` keeps a movable target, which is the whole point of
the paragraph the live requirement spends on it.

**UX's discoverability finding is additive and also accepted:** deleting four
labelled buttons removes the only place a keyboard or screen-reader user ever
learned the mechanism exists, and the group's `aria-label="System camera"` says
nothing about pan. The camera group's accessible name or description must state
the pan binding. This is user-observable behaviour, where UX wins by the same
standing tie-break, and it does not conflict with the architect's mechanism.

**Reversal cost:** one binding and one attribute.

### FULL-AUTO RULING 24 — the touch pan loss is filed as a deliberate recorded gap, not built and not ignored

**Raised by:** UX, severity deliberately left to me.

Deleting the four `camera-pan-*` buttons removes what appears to be the **only
touch-accessible pan path**: secondary-button drag-to-pan is mouse-only, and the
live, untouched *Space View Camera Touch Pinch-Zoom* defines only pinch-zoom and
single-finger orbit. A touch-only player could still tap bodies and gates
directly, but could never move `select-pan-target-point`'s target off the star.

**Ruling.** File it; do not build a gesture in this link; do not let it pass
silently.

- **Not built:** a two-finger drag collides with pinch-zoom's own two-finger
  claim. That is real interaction design with its own spec surface, not a task
  this change can absorb at its cap.
- **Not ignored:** it is recorded as
  `docs/plans/continous_space/handoffs/defect-touch-pan-lost-with-camera-cluster.md`
  and as a Risks/Trade-offs entry in `design.md`, so it is a deliberate gap with
  an owner rather than a silent regression.
- **Not a blocker:** no live requirement is falsified. *Space View Camera Touch
  Pinch-Zoom* never promised pan; the buttons were an implementation nobody
  specified as touch-reachable. What is lost is capability, not conformance.

**Basis.** Precedence 4 (most reversible) plus the chain's stated scope: the
system HUD is laptop-first, the chain forbids a mobile layout, and this repo's
own driving notes (`MEMORY.md`, "Driving the dev stack in Chrome") describe a
pointer-and-keyboard workflow. **Reversal cost:** a future change adding a
gesture, which needs its own spec surface either way.

---

## 2. BLOCKERs — all four accepted, plus reliability's

### B1 (architect) — `openspec archive` discards a delta's `## Purpose`. ACCEPTED, and it is worse than reported.

The architect proved it on one capability. **I verified it repo-wide: 14 of the
34 live specs under `openspec/specs/` carry the placeholder
`TBD - created by archiving change <id>. Update Purpose after archive.`**
`focused-scan` is the cited case — its archived delta carried an eleven-line
Purpose and the live spec reads TBD.

This matters here specifically because RULING 1 made `system-console`'s
capability boundary load-bearing for links 2b and 4 — and that boundary lives
in the Purpose paragraph, which would evaporate at the moment of archive. Fold
the restore into task 10.3 as the architect specifies.

Out of scope, recorded for whoever wants it: the other 13 specs' Purposes were
lost the same way and are not this change's to repair.

### B2 (architect) — the "dry fleet reads zero" scenario is unimplementable. ACCEPTED, and it corrects me.

The wire omits cargo kinds held at zero, so a dry fleet's fuel is *absent* on
the read, not `0`. Synthesising `0.0 t` would put the strip in contradiction
with a live `fleet-roster` scenario for the same fleet on the same screen —
i.e. it would break RULING 4's own agreement rule to satisfy a scenario written
in its name.

**This supersedes my framing in the writer's brief.** I carried link 1's Taught
record forward ("the roster's `?? 0` read `0t fuel` for an unavailable roster —
indistinguishable from a dry fleet") and asked for a served-zero-versus-absent
distinction on fuel. That defect was about an **unavailable roster**, and the
fix there was to stop fabricating a figure. It does not follow that a **dry
fleet** has a distinct served zero to render, and on this wire it does not.
Apply the architect's replacement text; the strip renders fuel exactly as the
roster row does for the same fleet.

### B3 (architect) + security MINOR 2 — the REMOVED hold readout loses its mine-resolution clause and its third scenario while claiming it does not. ACCEPTED at BLOCKER.

**Merged; both reviewers credited.** Security found the false "all three travel"
claim and supplied a paste-ready replacement scenario; the architect found the
same loss and additionally that the requirement's mine-resolution *clause* goes
with it, and graded it BLOCKER.

I take the higher grading. This is `docs/plans/continous_space/handoffs/README.md`
**lesson four** firing exactly as written: a re-expressed requirement is invisible
to the archiver's scenario check, `--strict` passes, and
`openspec-reconcile.py` passes — I ran both, and both were green over this loss.
The only thing that caught it was two reviewers reading the removed requirement
against its replacement, which is the mechanical diff lesson four prescribes.

### B4 (architect) — "exactly four cells" is unreachable from `tasks.md`, and the orbit axis's at-limit state is unscoped. ACCEPTED.

12 − 4 pan = 8, not 4, and the orbit at-limit state lives on buttons being
deleted. Fold into tasks 9.1 and 9.3.

### B5 (reliability) — the credits cell's "unavailable" branch can only fire before first load. ACCEPTED.

`corporation-provider.tsx` retains resolved data across a failed refetch and
exposes `isError` separately **by documented policy**
(`layout-wrapper.tsx:70-74`), and `SystemSpaceView.tsx:657` never consults it.
So R9's `IF the session balance is unavailable` describes a branch reachable
once per session, while the common case — resolved once, erroring since — renders
a stale balance formatted identically to a fresh one, feeding an affordability
decision.

This is the same species as link 5's precondition that could never pass and
lesson two's test shaped so it cannot observe the failure: **a clause that is
true of no reachable state is not a specification.** Reliability's fix is a
data-flow correction inside existing wiring tasks, no new UI.

---

## 3. Deduplication — findings raised by more than one reviewer

Merged, both credited, one fix each:

| Finding | Raised by | Disposition |
| --- | --- | --- |
| The REMOVED hold readout drops its third scenario / mine-resolution clause | architect B3, security MINOR 2 | merged at BLOCKER (§ 2) |
| No scenario pins the strip when the **own-fleets** read fails | ux F1, reliability MAJOR | merged; take UX's scenario text plus reliability's clause for the fan-in delta |
| The fleet cell must survive "no acting fleet" without losing its chevron | architect MAJOR 12, ux F2 | merged; take the architect's requirement text and UX's scenario |
| The pill's burn target has no rule for a point target or an unresolvable body | architect MAJOR 6, ux F5 | merged; UX's "no raw X/Y/Z coordinate figures" phrasing is the testable half |
| The credits cell drops clauses of the requirement it re-homes | architect MAJOR 5, security "adjacent, not security" | merged; the architect's list is the superset |

---

## 4. Everything else — accepted as written

Apply from each reviewer's own file. No amendment, no re-grading.

- **architect** MAJOR 1, 2 (the two boundary leaks 2b would otherwise have to
  rewrite — a requirement that must be rewritten one link later was mis-drawn
  here, which is the test I asked for), 3, 4, 7, 8, 9, 10, 11; MINOR 1–5.
- **ux** F3, F4, F6, F7, F8, F9, F10.
- **reliability** MAJOR (clock `?? 0`), MINOR (interior read missing from the
  fan-in inventory).
- **security** MINOR 1 (the owner-only qualifier the re-homed hold requirement
  drops — not exploitable today, but link 2b's selected-entity tab inherits this
  wording while pointing at an arbitrary selected entity).

Three deserve a note on *why* they are accepted rather than merely listed:

**architect MAJOR 9 — the pill's one-derivation rule becomes a signature, not a
prohibition.** "SHALL NOT branch on `Fleet.state`, `attachedTo`, a park kind, or
an action ETA inside the strip" is four prohibitions and a review opinion;
nothing in the per-commit gate can decide it. Making the pill's props exactly
`RosterRowStatus` + `stranded` makes the branch a **type error**, and pairs it
with a property assertion (equal derivation output ⇒ identical pill text). This
is link 1's hardest-won lesson — *enumerating prohibitions never closed the
invariant; a computable check did* — applied to state instead of text. It is the
single most valuable finding in the panel.

**architect MAJOR 8 is MAJOR 9's necessary companion.** The invariant only holds
if the `roster-status.ts` extension is **additive-only**, because
`FleetRoster.tsx:197` renders `status.activity` verbatim — a non-additive
extension changes the roster row's copy underneath it. This also retires
ambiguity A-5 for good, in the direction RULING 14 already took.

**architect MAJOR 10 — the gauge is decorative, so it needs no `data-unit`
token.** A gauge that *speaks* its fill would be read text and would need a
token the closed vocabulary does not have, which RULING 6 would then force us to
add. Making the gauge decorative dissolves that rather than paying it. Note the
interaction the writer must hold: RULING 20 requires each hold segment's kind
and tonnage to be available as text **or** an accessible name — with a decorative
gauge, that obligation lands on **text**. And it does not conflict with UX F3,
which asks for a DOM-observable *state* attribute (absent / empty / filled), not
a spoken figure.

---

## 5. Sizing

`tasks.md` is at exactly 40. The architect maps every one of its findings onto
an existing task and adds **zero** net tasks; reliability reports its fixes as
one- or two-line data-flow corrections inside existing wiring; UX's are
scenarios plus one new requirement (the chevron's keyboard operability).

**Authorised ceiling: 46 tasks.** Growth beyond 40 is authorised only for
findings this panel raised, and the writer reports if it exceeds 46 rather than
absorbing it silently.

**On the relief valve.** The architect nominates the camera-cluster shrink (§ 9,
5 tasks) as the cut if the change goes over. **I am ruling that valve closed**,
because the architect's own MAJOR 7 found that the strip's bottom edge already
has three occupants — one carrying a live retry affordance. Deferring the shrink
would ship a strip landing on top of twelve buttons it was meant to replace,
which is a collision, not a deferral. If 46 is breached, the answer is a second
seam, not this one. The panel-readout deletions (§ 8) were never a candidate:
RULING 7 forbids coexistence and they are what this change is for.

---

## 6. Nothing was reversed

No FULL-AUTO RULING 1–21 is overturned by this panel. RULING 17 (inherited
testids) and RULING 10 (four cells) are **extended** — both were right about what
they decided and silent about a case that turned out to be load-bearing. RULING
6's "extend the vocabulary, never invent at the call site" is honoured by *not
needing* a token (architect MAJOR 10), which is the better outcome. The one
correction to my own brief is B2, recorded in full above.

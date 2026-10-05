# `add-burn-cost-overlay` — open questions and rulings

Link 2a-ii of the system-HUD chain (`docs/plans/system-hud/chain.md`) as it was
handed to the full-auto orchestrator on 2026-10-03; **link 2a-iii after RULING 1
below**. Every user gate is lifted; every open question is ruled in-run by the
precedence in `harness/skills/openspec-team-workflow/SKILL.md` § "Full-auto
chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision. A choice without one is a guess,
and guesses are forbidden.

Input: `docs/handoffs/add-burn-cost-overlay-analysis.md` (index:
`add-burn-cost-overlay-analysis-index.md`), whose § 8 lists Q1–Q17.

---

## Rulings made at orchestration open (before authoring)

### FULL-AUTO RULING 1 — the link splits at the preview lift: `lift-burn-preview-to-view` is built first as link 2a-ii, and `add-burn-cost-overlay` follows as link 2a-iii, `not authored`

**Question.** The analyst's floor is 37 tasks (range 34–40) *before* the two
carried defects are counted and before the panel. Split, or run as one link?

**Ruling.** Split at the analyst's pre-identified seam (analysis § 7):

- **`lift-burn-preview-to-view`** (link 2a-ii, authored and built in this run) —
  the `useBurnPreview` call lifted from `SpaceCommandPanel` to
  `SystemSpaceView`; the panel converted to props and its harness migrated; the
  six wrong-shape view-test mocks; the running-mine suppression drift fix; the
  docked-at-target precondition (RULING 36 of `add-vitals-strip`); the
  preview-clears-on-commit clause made true. Delta: MODIFIED `system-space-view`
  "Burn Preview Reflects the Server-Solved Order, Without Committing".
- **`add-burn-cost-overlay`** (link 2a-iii) — the `Gauge` overlay, the strip
  wiring, the overlay's lifetime, two ADDED `system-console` requirements, and
  the `system-space-view` MODIFIED blocks for "A Failed or Stale Preview Is Never
  Presented as a Current Quote" and (if its panel rules the strip-driver list
  enumerated, Q16) "System Space View Route and Data Fan-In".

**Basis for splitting.** Precedence 2 — `openspec-team-workflow` § Chains: links
are sized 20–40 tasks and split past that. The arithmetic: 37 floor + 2 (the
docked-at-target defect, ruled in below by its recorded lean) + 1–2 (the
commit-clear clause the chain doc itself requires) = 40–41 **pre-panel**, and
both predecessors grew ≥ 30 % under panel review (link 1: ~30 → 55; link 2a: 57
before its own split). Ruling the two carried items *out* to stay under the cap
would be choosing scope by its size, against a recorded lean.

**Basis for this seam.** Analysis § 7: the first half is behaviour-preserving
for the panel apart from the precondition fixes; the second is purely additive
on state the first already lifted; the module boundary is the hook call site
versus `Gauge`/`VitalsStrip`; the only shared file is `SystemSpaceView.tsx`. The
seam is available because the first half now carries a real delta (the two
precondition scenarios) — the analyst's stated condition. The halves' MODIFIED
headers are disjoint.

**Why `not authored` for the second half** (the same deliberate deviation as
`add-vitals-strip` RULING 9, same reason). The second half's design.md and
scenarios are written against the lifted quote's shape, which does not exist
until the first half is built, and its adversary verdict would expire by diff
the moment the first half archives into `system-space-view`. The full-auto rule
authors each link after its predecessor archives.

**Alternatives rejected.** (a) One link at 45–50 tasks — the cap exists because
every adversary round and dev pass re-reads the whole change. (b) Drop the
docked-at-target defect to stay under 40 — against RULING 36's lean, and the
defect is a hazard to this very surface's journey. (c) Author both halves now —
buys a verdict with a known expiry.

**Reversal cost.** One chain-doc row and one change folder; nothing built.

### FULL-AUTO RULING 2 — the strip prints no cost or shortfall text; the overlay is the gauge segment only

**Question (Q1).** Does the strip print any cost/shortfall text?

**Ruling.** Segment only. No figure, no `data-raw`, no new `data-unit` token, no
accessible value on the gauge. `▲ short 6.6 t` belongs to link 4.

**Basis.** Precedence 1 — chain doc, Link 2a-ii: "The chain doc's 2a scope said
segment-only, with `▲ short 6.6 t` belonging to link 4." Reinforced by the
figure-vs-wire sweep (analysis § 3): a shortfall text has no served raw at all.

**Alternatives rejected.** Cost text in the fuel cell — widens the cell at the
1280 px floor and reopens `figure-formatting`.

**Reversal cost.** Adding text later is one requirement; removing it would be a
spec change, which is why the lean runs this way.

### FULL-AUTO RULING 3 — the overlay is one start-anchored cost extent on the gauge's own scale with its state copied from the served `affordable` flag; no shortfall is ever computed or named as a quantity

**Question (Q2, Q3 — the analyst's two hard-stop candidates).** Is the overhang
a "shortfall", and from which end is the cost drawn?

**Ruling.** The overlay is `fuelCostTons / cargoCapacity`, anchored at the
gauge's start like the fill, drawn so it is visible over the fill; whatever part
of it lies beyond the fill's end is a visual consequence of two honest extents.
The overlay's affordability state is the served `affordable` flag verbatim and
is never decided by comparing the extent with the fill. The spec never calls
the overhang a shortfall quantity and no client code subtracts fuel from cost.
Where flag and picture disagree (a burning fleet's refunded re-target; an open
station-keeping hold's upkeep — analysis § 3), the flag wins the state and the
spec carries a scenario for each.

**Basis.** Precedence 1, three recorded statements that agree:
- chain doc, Link 1 anti-mirror: `lib/format/` "must not compute anything Go
  decides (no affordability, no shortfall arithmetic — those arrive on the
  wire)"; and "A link that finds itself wanting a new field is mis-scoped".
- chain doc, Link 2a-ii **Journey**: "select a target, watch the fuel gauge grow
  a cost segment; pick an unaffordable target and watch the segment extend past
  the fill". One segment that is present when affordable and *extends past the
  fill* when not is a start-anchored extent; a segment drawn backward from the
  fill's end cannot extend past it.
- the design canvas (read 2026-10-03 through the Artifact tool; the analyst
  could not reach it): the fuel rail draws the fill at `left:0; width:24%` and a
  second segment at `left:24%; width:3.5%` in the unaffordable tone — i.e. the
  *visible* result is "a tone past the fill's end". A start-anchored 26.9 %
  cost extent behind/over a 24 % fill paints exactly that picture in the mock's
  own example (53.8 t against 47.2 t on a 200 t scale) without a subtraction.

So neither is a hard stop: the geometry is fixed by the journey text and the
mock, and "a true shortfall" is excluded by the fence rather than left open.

**Alternatives rejected.** (a) Client `cost − fuel` — a mirror of
`backend/fleet/service.go`'s predicate minus its refund and upkeep terms; wrong
in two reachable states. (b) A served shortfall field — breaks the chain's
no-backend fence; only Travis can trade it. (c) Cost drawn backward from the
fill's end ("what the burn will consume") — needs `fuel − cost`.

**Reversal cost.** One component's geometry. **Flag for Travis:** the mock's red
segment's *width* is the shortfall; this ruling reproduces its picture in the
ordinary case and deliberately lets the served flag, not the picture, carry
affordability in the two edge states. A true shortfall needs a wire field.

### FULL-AUTO RULING 4 — the unaffordable state uses the existing amber vocabulary; no red or blue enters the palette

**Question (Q5).** The scoping doc and the mock say red (and blue for
affordable); the code's unaffordable vocabulary is amber and the tree has
neither red nor blue under `components/space` or `components/fleet`.

**Ruling.** The overlay's unaffordable state uses the tone family the command
panel already uses for an unaffordable quote (amber); the affordable state uses
a tone already present on the strip's gauges. Exact classes are the UX
reviewer's and the colour-compliance validator's call inside that constraint.

**Basis.** Precedence 1 — chain doc "What every link must not do": "Change the
palette, type scale or panel fill … Placement and weight change; vocabulary does
not." The chain doc is the later, sequencing document and states this as a
prohibition; the scoping doc's "red" is a mock colour, and its own "What this
does NOT do" says "No theming rework".

**Alternatives rejected.** Introduce red-400 for the overlay — a palette change,
and it would make the gauge and the panel disagree about the same quote's colour.

**Reversal cost.** One class.

### FULL-AUTO RULING 5 — a stale or failed quote withdraws the overlay; it is never marked-and-kept

**Question (Q8).** Stale: withdraw or mark?

**Ruling.** Withdraw. The overlay is drawn only for a current, successful quote
for the current selection and acting fleet. Whether the stale clause also
reaches the command panel's own unaffordable styling under a stale quote
(`SpaceCommandPanel.tsx:183`) is left to this link's panel — it is a question
about the MODIFIED text's scope, with no recorded lean.

**Basis.** Precedence 1 — chain doc Link 2a-ii: "drawn only while the quote is
current, withdrawn when the selection clears, when a refresh fails, or when an
order commits"; `add-vitals-strip` RULING 5: "A failed or stale preview shows no
overlay".

**Alternatives rejected.** A stale-marked overlay — a graphical mark has no room
for the "stale" label the panel's figures carry.

**Reversal cost.** One conditional.

### FULL-AUTO RULING 6 — the overlay draws the quote's point cost `fuelCostTons`, not the commit ceiling

**Question (Q9).** Point cost or ceiling (`cost × BURN_FUEL_ALLOWANCE`)?

**Ruling.** `fuelCostTons`. The ceiling stays on the command panel.

**Basis.** Precedence 1 — chain doc Link 2a "Sizing risk": "It still reads
`BurnPreview.fuelCostTons` and `affordable` off the preview the command panel
already holds"; scoping doc Surface 1 names `BurnPreview.fuelCostTons` as the
fuel cell's source. The served `affordable` flag is decided against the point
cost, so a ceiling extent would disagree with its own state.

**Alternatives rejected.** The ceiling — a client-derived figure drawn against a
server flag computed from a different number.

**Reversal cost.** One expression.

### FULL-AUTO RULING 7 — the undrawn preview curve is filed as drift and routed to link 4; it is not fixed in 2a-ii or 2a-iii

**Question (Q12).** `BurnPreview.controlPoints` has no production consumer,
though "Burn Preview Reflects the Server-Solved Order, Without Committing" says
the solved curve SHALL be rendered as a preview overlay.

**Ruling.** Adjudicated **code wrong**; filed as
`docs/handoffs/drift-preview-curve-never-drawn.md`; owner link 4
(`add-arc-figures-and-entity-tab`), whose label rides "the drawn curve". Not
fixed here: it touches `space-scene.ts`, `SpaceStage.tsx`, `webgl/SpaceWorld.tsx`
and the line-anchored guard list — none of which either half otherwise opens.

**Basis.** Precedence 2 — workflow skill, spec-first invariant and "Dev's diff
exceeds the change's stated Impact"; drift is adjudicated and routed, never
patched in passing. Orchestrator verified: `space-scene.ts` and `SpaceStage.tsx`
contain no preview input.

**Alternatives rejected.** Fix in the lift (it is what makes the fix possible) —
adds a renderer change to a link already split for size.

**Reversal cost.** None; a filing.

---

## Left open for this link's own panel (no recorded lean; rule after the panel reports)

Not rulings. Analysis § 8 numbering: **Q4** the clamp rule for cost above
capacity and how a clamped overlay differs from an exact fit; **Q6** the overlay
when fuel or capacity is unserved; **Q11** whether the strip shows
`strandingWarning`; **Q13** the overlay while Burn is unreachable; **Q14**
whether the panel's `preview-affordable` text suffices as the non-colour cue;
**Q15** legibility on a 40 px rail; **Q16** whether the Fan-In strip-driver list
is enumerated (delta) or illustrative; **Q17** whether the journey can reach an
unaffordable quote deterministically. Q7 and Q10 moved to
`lift-burn-preview-to-view` with RULING 1.

---

## Rulings made on resume as link 2a-iv, 2026-10-05, at `d965f5d` (before authoring)

Input: the refreshed analysis `docs/handoffs/add-burn-cost-overlay-analysis.md`
(index beside it), § 7 Q1–Q11. The link is now 2a-iv (two further splits since
RULING 1). RULINGs 2–7 were re-checked against the tree by the analyst (§ 0, § 3)
and against the design canvas by the orchestrator (fill `left:0; width:24%`, a
second segment `left:24%; width:3.5%` in a red tone, rail `overflow:hidden`, no
strip cost text, no affordable-state overlay drawn): none is contradicted.
RULING 5's line reference `SpaceCommandPanel.tsx:183` is `:224` at this commit.

Q2 (no-data gauge), Q4 (painting and the non-colour cue), Q5 (canvas
unavailable) and Q7 (the panel's styling under a stale quote) carry no recorded
lean and are **left for the panel** (precedence 3); the writer drafts them per
the analyst's recommendation, marked provisional.

### FULL-AUTO RULING 8 — no `system-space-view` requirement takes a delta; the overlay's content and lifetime are two ADDED `system-console` requirements that name the owning requirements instead of restating them

**Question (Q1).** Do "A Failed or Stale Preview Is Never Presented as a Current
Quote" (9 scenarios), "System Space View Route and Data Fan-In" (15) or the
committed-selection requirement (21) take a MODIFIED block?

**Ruling.** None. The chain table's row for this link over-counts.

**Basis.** Precedence 1 — chain doc, Link 2a-iii Taught: "A clause about a new
surface may only say what that surface contributes." The chain table itself
conditions the Fan-In delta on "if ruled enumerated", and the list is already
non-exhaustive at HEAD (analysis § 6 D2: the running-mine read feeds the pill
and is not listed), so it is illustrative. Precedence 4 agrees: adding a
MODIFIED block later is one block; an over-broad clause in the stale-preview
requirement would newly bind the command panel's styling.

**Alternatives rejected.** A "every graphical projection SHALL be withdrawn"
clause on the stale-preview requirement — binds the panel (Q7) through a
strip change; enumerating the overlay in the 21-scenario committed-selection
requirement — the archiver trap at its largest for two words.

**Reversal cost.** One MODIFIED block.

### FULL-AUTO RULING 9 — a cost above capacity is limited to the rail with no clamped marker; a zero cost is a drawn overlay of zero extent; a non-finite or negative cost draws none

**Question (Q3).** The clamp rule and degenerate costs.

**Basis.** Precedence 1 — `add-vitals-strip` design.md recorded that the overlay
"needs its own clamp rule"; RULING 2 forbids the text a clamped marker would
need; the mock's rail is `overflow:hidden`. The atom already clamps segments
(`Gauge.tsx:90-93`). The spec SHALL NOT assert that a clamped cost is
unaffordable — that is the server's flag to say.

**Alternatives rejected.** A distinct "over capacity" state — a third state the
served flag does not carry. **Reversal cost.** One conditional.

### FULL-AUTO RULING 10 — the strip shows no stranding advisory for a quote

**Question (Q6).** **Basis.** Precedence 1 — RULING 2 (segment only, no text),
itself from the chain doc; both design docs are silent for the strip, and a
silent design is not a requirement. **Alternatives rejected.** A fourth
stranding surface. **Reversal cost.** One requirement, additive.

### FULL-AUTO RULING 11 — the strip's retained fuel and hold figures after a failed own-fleets refetch are adjudicated code-wrong, filed as drift, and not fixed in this link; the overlay gets no rule of its own for that state

**Question (Q8).** Analysis § 6 D1, verified by the orchestrator:
`SystemSpaceView.tsx:1072` passes `acting` (built from retained `fleets.data`)
unconditionally and `VitalsStrip.tsx:242,264-265` feeds `acting?.roster` to the
fuel and hold cells with no `fleetsFailed` term, against Fan-In's "never
presenting a figure served by an earlier successful read as current once that
read's most recent attempt has failed" (`system-space-view` spec lines 112–116).

**Ruling.** Code wrong. Filed as
`docs/handoffs/drift-strip-cells-retain-figures-after-failed-fleets-read.md`,
out of this chain link, Travis's to schedule. This link writes no overlay
clause for that state.

**Basis.** Precedence 2 — workflow skill, drift handling and "no opportunistic
edits" (the same basis as RULING 7); the fix is on the fill, which this link
does not otherwise edit. **Alternatives rejected.** Fix here (+2 tasks against a
cap with no slack). **Reversal cost.** None; a filing.

### FULL-AUTO RULING 12 — the overlay's DOM contract is a separate two-valued state attribute, absent when no overlay is drawn; `data-gauge-state` keeps its three values; no numeric extent attribute, no `data-raw`, no `data-unit`

**Question (Q9).** **Basis.** Precedence 2 (live spec as settled decision) —
`system-console` "The Hold Cell…": "the gauge itself SHALL expose no figure, no
fill percentage and no accessible value", on the atom both gauges share;
RULING 2; chain doc Link 1 Taught (a new figure kind needs a token — so the
overlay must provably not be a figure). The attribute's name is the architect's.
**Alternatives rejected.** A numeric extent attribute — a figure without a
token, and a breach of the hold-gauge clause. **Reversal cost.** One attribute.

### FULL-AUTO RULING 13 — the overlay's state may lag a fuel change by at most one preview refresh interval; the bound is stated and no invalidation is added

**Question (Q10).** **Basis.** Precedence 2 — live `system-space-view` text:
"Exactly one fresh preview request SHALL be sent per elapsed interval while a
preview is shown, and none between"; chain doc 2a-ii Taught ("state the lag as
a bound"). **Alternatives rejected.** Invalidate the preview on refuel/sell —
contradicts the live sentence. **Reversal cost.** One clause.

### FULL-AUTO RULING 14 — the journey asserts the unaffordable overlay only if the stack can arrange one inside a bounded probe; otherwise the leg is logged UNTESTED with tier 1 named as its cover

**Question (Q11).** **Basis.** Precedence 1 — chain doc Link 2a-iii-b Taught:
"let a leg the fixture cannot contain log UNTESTED rather than fail or pass";
2a-iii: "recorded untested, never passing". The legs that must PASS are
no-selection, the affordable overlay (gauge state equal to the panel's served
flag for the same quote), and withdrawal on clear. **Alternatives rejected.** A
fuel-setting fixture — a backend/dev-route addition the chain forbids.
**Reversal cost.** One journey leg.

---

## Rulings made after the panel reported, 2026-10-05

Panel reports: `add-burn-cost-overlay-panel-architect.md` (1 BLOCKER, 5 MAJOR,
7 MINOR), `-panel-ux.md` (5 MAJOR, 3 MINOR), `-panel-security.md` (1 MINOR).
Per-finding dispositions: `add-burn-cost-overlay-panel-dispositions.md`.

### FULL-AUTO RULING 15 — a gauge with no data draws no overlay; the live fuel-cell requirement takes no delta

**Question (Q2).** **Basis.** Precedence 3 — all three reviewers recommend it
(architect: one validity predicate gates fill and extent, and it composes with
RULING 11's later fix; UX: a cost drawn on a rail that declares no data measures
against a scale the cell says it lacks). Precedence 4 agrees (adding it later is
additive; the other answer forces a MODIFIED block).
**Cost, stated:** a dry fleet sees no overlay; only the panel's text carries its
verdict. **Alternatives rejected.** Cost on an empty rail. **Reversal cost.**
One MODIFIED block of four scenarios.

### FULL-AUTO RULING 16 — the extent is a partial-height band drawn separately from the fill, and the unaffordable state adds one fixed-size full-height mark whose presence follows the served flag; hue is never the only difference between the two states

**Question (Q4).** **Ruling.** UX U1/U2 adopted with architect A9's shape: the
extent leaves the fill's length unchanged and occupies part of the rail's
height; while (and only while) the state is unaffordable a mark of
cost-independent size is drawn, separately from extent and fill, wholly inside
the rail at every cost; the mark is keyed to the flag, never to geometry. No
minimum extent width, no rail change, no animation or transition. Tones stay
inside RULING 4 (amber family; zinc family); the exact classes are design.md's.
Paint legibility is judged at the journey as a measurement (the sampled colours
of fill, extent and rail differ pairwise in the scheme rendered; the contrast
ratios are recorded, not gated), plus a tier-1 class-family assertion; the
extent-past-fill arrangement is judged only if the journey arranges one.

**Basis.** Precedence 3 — UX wins on user-observable behaviour (a sub-pixel
unaffordable extent is invisible; amber-versus-zinc alone fails colour-vision
and forced-colour displays), architect wins on technical shape (the mark cannot
be a child of the extent under the rail's `overflow-hidden`). Inside RULING 2:
the mark is not text and not a figure. A 3:1 contrast gate is not adopted
because the reviewer's ratios are hand-computed and the architect found no zinc
shade that meets both surfaces in the dark scheme — gating on an unverified
number inside a fixed palette would be a guess.
**Alternatives rejected.** Hue only; translucency/stripes/under-fill (UX and
architect both: unreadable or unimplementable on 6 px); a minimum drawn width
(breaks "length is cost over capacity"). **Reversal cost.** One element and its
clause.

### FULL-AUTO RULING 17 — the overlay is drawn while the canvas is unavailable by construction, and this link carries no scenario or test for that state; it is recorded on the existing follow-up

**Question (Q5).** **Basis.** Precedence 3 — architect and UX agree it is
drawn (one determination, two readers); architect A4: no harness that runs the
real hook can switch the canvas, and no code implements the state, so a
scenario here would be untestable as tasked; UX named it the first item to
shed. Noted on `followup-explain-withheld-burn-command.md` (F3 owns the state).
**Alternatives rejected.** A scenario with a new harness (+1–2 tasks at the
cap). **Reversal cost.** One scenario.

### FULL-AUTO RULING 18 — this link does not touch the command panel's styling or affordability line under a stale quote; the panel marks, the gauge withdraws, and design.md records the asymmetry

**Question (Q7).** **Basis.** Precedence 3 — all reviewers; the live text asks
only that figures be marked stale; link 4 retires the panel.
**Reversal cost.** None.

### FULL-AUTO RULING 19 — the "present exactly together" biconditional becomes one-way, the affordability-text clause becomes a condition on what the view may supply to the strip, and the task list is brought to the cap by the architect's sheds S1–S8 rather than by a split

**Question.** A1/S1 (the overlay-and-ceiling biconditional is false on a
no-data gauge and puts a SHALL on a ceiling `system-space-view` owns); A2
versus U5/U6 (who may bind the command panel's text); A7 (46 honest tasks).

**Ruling.** (a) A1's one-way text: the overlay is never drawn without the
determination the ceiling reads; the overlay's absence is never a reason to
withhold anything another requirement presents for that quote (S1's
protection, stated as what this surface contributes). (b) A2's shape wins over
U5's and U6's: `system-console` conditions what the view supplies; it places no
rule on the panel. U6's panel-line clause and U8 (a refused commit) are not
adopted — each restates a `system-space-view` rule a reader of the one
determination cannot fail. (c) Sheds S1–S8 are taken (46 → 38); RULING 16's
mark adds one arrangement group (39); UX U4 (a refresh in flight never blanks
the overlay) is adopted and rides the existing refresh walk. The non-boolean
flag clause is dropped (A5). No split: the atom/strip and wiring halves are not
separately shippable (analysis § 5).

**Basis.** Precedence 2 — the workflow skill's standing tie-breaks (architect
on technical shape and boundaries, security on controls, UX on user-observable
behaviour) and the 40-task cap; precedence 1 — chain doc 2a-iii Taught ("a
clause about a new surface may only say what that surface contributes") and
2a-ii Taught ("ship the fix and file the principle").
**Alternatives rejected.** A fifth split of this sub-chain. **Reversal cost.**
Each shed is one scenario or task.

---

## Ruling at adversary clearance, 2026-10-05

### FULL-AUTO RULING 20 — the change is cleared at round 3 of 3 with one MINOR residue (n1) carried unedited: two summary sentences still describe the mark-versus-band paint check at token level while the binding task text is shade-level

**Question.** Round 3 (a spot-check of the round-2-to-round-3 diff) returned
CLEAR with one non-material MINOR, n1: `design.md:528` and `proposal.md:32`
say "the mark's colour tokens differ from the unaffordable band's" beside the
repaired per-scheme shade criterion in tasks 1.4 and design Decisions 5–6.
Edit it, or carry it?

**Ruling.** Carry it, unedited. Any edit to the change folder after the last
round would leave the edited lines without a verdict and no round to give one.
Tasks 1.4 is the binding text for the SDET; the strict form entails the loose
one, so no wrong build passes because of it. The SDET's brief names n1 so the
loose sentence is not read as the criterion. If the archive leaves it stale it
dies with the change folder (design.md and proposal.md are not merged into
`openspec/specs/`).

**Basis.** Precedence 2 — the orchestrator role's round rule ("Rounds are
counted across the whole change … MAJOR and MINOR residue at the cap becomes a
follow-up") and "prior verdicts expire when the spec is edited".
**Alternatives rejected.** A fourth round; an unreviewed edit.
**Reversal cost.** Two sentences.

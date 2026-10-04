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

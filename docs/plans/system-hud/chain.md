# The change chain — system HUD

The ordered set of OpenSpec changes that rebuilds the system view's chrome
around the three surfaces Travis picked on 2026-09-08: the **in-system list**,
**figures on the arc**, and the **console dock whose collapsed state is the
vitals strip**. The scoping doc `../system-hud.md` is the model and carries
the DECIDED / RECOMMENDED rulings; this document is the sequencing.

**Status (2026-10-05): links 1, 2a, 2a-ii, 2a-iii and 2a-iii-b archived
(2a-iii-b `clear-burn-preview-on-commit` at `51944af`, its gate passed over
three unrelated tier-4 reds by Travis's ruling —
`../../handoffs/clear-burn-preview-on-commit-rulings-index.md` USER RULING 20);
2a-iv (`add-burn-cost-overlay`) is next, `not authored`.** The out-of-chain
corrective change `fix-burn-order-geometry-refusals` archived at `d52eab1`
between the two. 2a-iii was split in-run:
the order record and the stranding notice went first, the commit-clear follows. The link handed to
the 2026-10-03 run as 2a-ii, `add-burn-cost-overlay`, was split twice in-run and
is now 2a-iv: the preview lift went first as `lift-burn-preview-to-view`
(archived, this run), and the commit-clear its review could not get right inside
the cap became 2a-iii. Earlier history: `add-figure-formatting` archived at
`a4471a3`; `add-vitals-strip` archived on 2026-10-03 at `e01b310`, with the
out-of-chain `fix-world-time-render-loop` that unblocked it at `438923c`
(`../../handoffs/defect-cross-system-chevron-nav-stall.md`, CLOSED;
`../../handoffs/add-vitals-strip-journey.md`,
`../../handoffs/fix-world-time-render-loop-journey.md`). The full-auto rule
authors each remaining link only after its predecessor archives.

**No backend work anywhere in this chain.** Every figure the HUD shows is
served today — burn preview, roster, credits, market board, scan targets,
action inbox, sighting pile. A link that finds itself wanting a new field is
mis-scoped, not under-served; stop and re-read `../system-hud.md` "What this
does NOT do".

**Ground rules carried over from `../continous_space/README.md`:** solo toy,
burn the boats. No coexistence period for the old right column, no flag
guarding it, no "legacy layout" toggle. Each link deletes what it replaces
in the same change.

**Handoffs.** The team tooling (`.claude/commands/team.md`,
`.claude/workflows/openspec-team.js`) writes every per-change record —
panel reports, adversary rounds, rulings, journey — to
`docs/handoffs/` by a hardcoded path. This chain's
records land there too until that path is parameterised; the file names
carry the change-id, so nothing collides.
Where this document still writes `../continous_space/handoffs/<file>`, read
`docs/handoffs/<file>`: the directory moved in `f179757` and the old path is a
symlink to it.

---

## The chain

| # | Change | Delivers | Capabilities | State |
| --- | --- | --- | --- | --- |
| 1 | `add-figure-formatting` | `lib/format/` — every player-facing figure has a unit; applied to today's panels; `lib/eta.ts` retired | ADDED `figure-formatting`; MODIFIED `system-space-view` (7), `docked-fleet-actions` (7), `fleet-roster` (2), `sighting-log` (1) | ✅ archived `a4471a3` |
| 2a | `add-vitals-strip` | The 56px bottom strip: fleet + state pill, fuel gauge, hold gauge, credits, clock; camera cluster shrinks to four | ADDED `system-console` (strip half); MODIFIED `system-space-view` (3), `docked-fleet-actions` (2 MODIFIED, 2 REMOVED, 1 ADDED), `figure-formatting` (1) | ✅ archived `e01b310` (2026-10-03); `fix-world-time-render-loop`, the out-of-chain fix for its gate blocker, archived alongside at `438923c` |
| 2a-ii | `lift-burn-preview-to-view` | The burn preview lifted to the mounting view, `SpaceCommandPanel` converted to props; two unenforced preview-request preconditions made true (running mine, docked at the target) | MODIFIED `system-space-view` (2: the burn preview, the failed-or-stale preview) | ✅ archived `0f2ad5d` (2026-10-04); authored r3 `e3fd54c`, built `3802b92`, gate `c773e26` |
| 2a-iii | `surface-commit-stranding-warning` | The commit's stranding warning shown on the system space view for the order's life; the view's per-fleet record of the last order it committed **whose response carried the warning** (no record is kept for an ordinary commit), with an end tied to the order's own life as the own-fleets read reports it | ADDED `system-space-view` (1); `fleet-roster` drift closed for the burn command (no delta) | ✅ archived `3218d9d` (2026-10-04); authored r2 `af747be`, built `808420d`, gate `6494f35` |
| 2a-iii-b | `clear-burn-preview-on-commit` | The preview clears when a burn order commits from this view and stays cleared for that order's life; the burn command for a committed selection | ADDED `system-space-view` (1); MODIFIED `system-space-view` (3: "Burn Preview Reflects…", "A Failed or Stale Preview…", "Burn and Jump Commit Controls Guard Against Double-Submit") | ✅ archived `51944af` (2026-10-05); authored r2 `29f0a6b`, built `62c8f15`, gate `c3fcfcf` + USER RULING 20 |
| 2a-iv | `add-burn-cost-overlay` | The fuel gauge's cost overlay on the lifted quote: one start-anchored cost extent, its state from the served `affordable` flag | ADDED `system-console` (the overlay's content and lifetime); MODIFIED `system-space-view` (stale-preview presentation; the fan-in's strip-driver list if ruled enumerated) — *as authored: 2 ADDED `system-console`, no `system-space-view` delta (RULING 8)* | 🟡 authored r3 `65f2aef` |
| 2b | `add-console-dock` | The dock beneath the strip with **Acting fleet**, **Scan**, **Log**, **Fleets** tabs; the right column, the floating log panel and its toggle retired | MODIFIED `system-console`, `system-space-view`, `docked-fleet-actions`, `fleet-roster`, `sighting-log` (mounted-in-the-console deltas) | ⬜ not authored |
| 3 | `add-in-system-list` | Top-left list of every known entity with its discovery subtitle; click = select + reframe; off-screen reach chips retired | MODIFIED `system-space-view` | ⬜ not authored |
| 4 | `add-arc-figures-and-entity-tab` | Course label + Burn on the drawn curve, progress while burning; the **Selected entity** dock tab; `SpaceCommandPanel` retired last | MODIFIED `system-console`, `system-space-view`, `market-board-panel` (mounted as a station's tab) | ⬜ not authored |

**The archive order is the row order.** 2a and 2b are the scoping doc's step
2 pre-split (see *Why 2 is two links*); 4 carries a pre-identified seam in
case its panel finds it past the 40-task cap.

**2a-ii was split off 2a in-run on 2026-09-09**, by the full-auto orchestrator,
after its analyst sized 2a at ≈57 tasks against the 40-task cap — see
`../continous_space/handoffs/add-vitals-strip-rulings.md` FULL-AUTO RULING 9 for
the seam and why it is clean. The row is `not authored` rather than `authored`
because `add-burn-cost-overlay` adds a requirement to `system-console`, a
capability that does not exist in `openspec/specs/` until 2a archives; the
full-auto rule authors an unauthored link *after its predecessor archived*, so
its deltas target specs that exist and its adversary verdict is not born
expired.

Out of the chain, deliberately: `explain-withheld-burn-command` (a filed follow-up from link 2a-ii's review — `../../handoffs/followup-explain-withheld-burn-command.md`; link 4 should read it), the galaxy-view strip (open question, ruled
*no* for now), a mobile layout, a theming pass, a resizable dock. None gates
any link.

---

## Link 1 — `add-figure-formatting`

**Why first.** Fault #1 in the scoping doc — raw wire values reach the eye —
is the only fault that is not layout, and every later surface renders the
same figures. Landing the formatter alone gives links 2–4 their copy and
proves the test-migration pattern with zero layout risk.

**Delivers.** One pure module `frontend/lib/format/` with a function per
quantity in `../system-hud.md` "Formatting", fixture-tested against a table
of (raw, expected) pairs:

| Quantity | Rule | Example |
| --- | --- | --- |
| Duration to/since an ETA | `Nm Ss` under an hour, `Nh Mm` under a day, `Nd Hh` beyond; relative, `in` / `left` / `ago` | `in 4m 12s` |
| World time absolute | `T+ Dd HH:MM` from the epoch, served scale after | `T+ 2d 04:13 ×60` |
| Tons | one decimal under 100, none above, thin space before `t` | `47.2 t`, `153 t` |
| Range / distance | three significant figures + magnitude suffix | `13.9k` |
| Δv | integer m/s | `269 m/s` |
| Credits | thousands separator, `₡` glyph | `₡ 1,000` |
| Rates | per the unit the player waits in | `2.4 t/min`, `0.4 t/h` |

Applied in the same change to every figure the current panels show —
`SpaceCommandPanel` (arrival, Δv, fuel, ceiling, the committed-vs-previewed
line), `FleetActionsPanel` (hold, credits, mine ETA), `FleetRoster` (fuel,
range, ETA), `SightingLog` (`asOf` stamps), `ScanControl` (sweep time) — and
`lib/eta.ts` deleted, its one caller-set moved onto the module.

**The contract that must survive review.** The raw served value stays on a
`data-*` attribute of the formatted element (`data-raw`, or per-figure names —
the writer picks one and the spec pins it) so tests keep asserting on wire
figures, never on copy. The formatter is the *only* place a wire number
becomes text; a component that calls `toFixed` or template-interpolates a
number is a defect.

**The hidden cost is the tests.** Every existing assertion on rendered
figures — `preview-arrival`, `preview-fuel`, `fleet-fuel-*`, `fleet-row-eta-*`
and their kin — reads the text today and must read the attribute after.
Size the tasks against the test files, not the components.

- **Touches:** ADDED `figure-formatting` (the rules table as requirements,
  one scenario per row plus the rounding edges — 99.95 t, 0 s, negative
  durations, scale ≠ 1); MODIFIED `system-space-view` "Burn Preview Reflects
  the Server-Solved Order…" and "A Commit's Actual Result Is Never Silently
  Swapped…" (the copy clauses only), `docked-fleet-actions` "Fleet Panel
  Cargo Hold Readout" / "Credit Balance Readout" / "Mine ETA Preview…",
  `fleet-roster` "The Roster Row Shows Held Fuel and an Estimated Range",
  `sighting-log` row stamps.
- **Must rule (see *Open decisions*):** what clock a relative duration counts
  in. `lib/eta.ts` assumes scale 1 in its own header comment while
  `SystemSpace.scale` is documented "never assumed to be 1"; the formatter
  must take the served scale and the spec must say which way it divides.
- **Anti-mirror:** `lib/format/` is presentation, not rules. It does not
  join the market mirror pair and must not compute anything Go decides
  (no affordability, no shortfall arithmetic — those arrive on the wire).
- **Journey:** the existing burn-preview walk with the arrival read as a
  relative duration and the fuel as tons; one assertion per formatted
  figure via its `data-*` attribute.
- **Source:** `../system-hud.md` "The problem" fault #1 and "Formatting";
  `frontend/lib/eta.ts`; the five components above.

**Taught.** Landed 2026-09-09. 55 tasks, not the ~30 the doc implied — the sizing
input really was the test files, and the panel found three more.

- **The doc undercounted the link.** It named three `docked-fleet-actions`
  requirements; seven carry figures. It named one `fleet-roster` requirement; the
  roster's ETA lives under a different one. It named `lib/eta.ts` as the thing
  retired; `countdown()` was duplicated verbatim in two more components, so there
  were **three** duration formatters. And `lib/eta.ts` had **two** callers, not one
  — the second, `SpaceStage`, is on a surface with no covering requirement in any
  spec at all. Links 2a–4 should expect the same: the doc names the *placements*
  accurately and the *requirement counts* optimistically.
- **A cross-surface invariant cannot be split.** R12 ("only the formatter produces
  figure text") is whole-tree, so no seam halves it without shipping it false behind
  an exception list. That is why this link ran to 55 tasks instead of splitting
  (RULING 18) — and it is a property of any later link that states a
  vocabulary-wide rule.
- **Enumerating prohibitions never closed the invariant; a computable check did.**
  Five formulations failed — ban `toFixed`, ban local formatters, ban template
  literals, an undecidable byte-identity check, a containment clause that was
  simultaneously too strict and too loose. What held (RULINGs 23, 25) was making an
  element's text a **total function of its own attributes** — `(raw, scale, token) →
  expected text` — and checking it. The fifth bypass was found in `range`, whose
  no-unit output is a decimal *prefix* of its own raw (`833.25` renders `833`).
  Any later link adding a figure kind inherits this: give it a token that
  determines its form, or the check goes undecidable again.
- **`data-unit` is a kind vocabulary, not a unit one**, and it changed twice under
  review. It is now closed and exported; links 2a–4 extend it rather than inventing
  tokens at call sites.
- **Two figure defects were found by review, not by tests.** The roster's `?? 0`
  read `0t fuel` for an unavailable roster — indistinguishable from a dry fleet. And
  the sell price-changed notice compared a flat `tons × price` estimate against a
  fold, so on a split fill it showed a number the player never saw; its test asserted
  only that the two figures *differed*, which both the wrong and right
  implementations satisfy. Assert the *value*, not the difference.
- **The archive gate cost two runs and the second was clean.** Tier 4 went 19/22 →
  **22/22**; the only genuine fix was an e2e helper that could not tell "never
  served" from "served, not yet parsed" — a weakness that had now stalled **two
  consecutive** chains' gates. Everything else red was `defect-station-order-500`
  (arrival-phase intermittent, open since 2026-09-02) and a post-sale 409, both
  backend, both filed, neither touchable here.
- **Tier 3 came in at 972s against the prior chain's 5118s**, which had closed
  predicting a third timeout raise. The raise was not needed.

## Link 2a — `add-vitals-strip`

**Why before the dock.** The strip is the dock's collapsed state, and
"default is collapsed" (DECIDED) means the strip alone must carry the common
case. Build the thing that is always on screen first; the dock then has a
top row to hang from.

**Delivers.** A single 56px bar along the bottom edge, always present,
full-width, **no verbs** — the instrument panel. Cells left to right per
`../system-hud.md` "Surface 1":

- **Fleet** — acting fleet's name; a chevron that is the roster's
  *switch acting fleet* affordance; beneath, one state pill derived from
  `Fleet.state`, `attachedTo`, the active action's ETA and
  `roster.stranded` — `Docked · Gate sys_2_0`, `Burning · feat-extra-0 · 2m
  40s`, `Holding · 0.4 t/h`, `Mining · 1h 23m`, `Stranded`.
- **Fuel** — `47.2 t · range 13.9k` over a gauge; a **cost overlay** whenever
  a preview resolves (the segment past the fill is the shortfall, in the
  affordability colour) — *moved to 2a-ii by the split* — and a **drain** while
  burning. "Drain" is re-scoped (RULING 8): nothing on the wire carries fuel
  consumed so far on a running burn, and fuel-per-Δv is a `backend/space` rule
  the client may not mirror, so it is a visual state on the cell plus step-wise
  updates as reads land, never an interpolated animation.
- **Hold** — `47 / 200 t · 153 free` over a gauge segmented by kind (fuel is
  a kind).
- **Credits** — `₡ 1,000`.
- **Clock** — `T+ 2d 04:13 ×60`, right-aligned.

In the same change: credits and the hold readout leave `FleetActionsPanel`
(the panel keeps its verbs until 2b), fuel/range leave the roster row's
prime position (the row keeps them — the roster stays a complete surface —
but the strip is now their home), and the twelve-button camera cluster
becomes four (orbit, zoom in, zoom out, recenter) in the bottom-right corner
above the strip. Orbit up/down/left/right and pan stay keyboard and pointer;
"Space View Camera Is Keyboard-Operable" is unaffected.

**What the state pill is not.** It is a projection of served state through
`roster-status.ts`'s existing derivation, never a second state machine. If
the pill and the roster row can disagree, one of them is wrong.

- **Touches:** *(the draft's guesses, and what reading the specs found.)* ADDED
  `system-console` (the strip's cells, the no-verbs invariant, the state-pill
  derivation, the width floor as a MUST — stated as **1280 × 720 px**, since
  `85vw` is 85 % of an unknown and the repo's only exercised laptop viewport is
  Playwright's `Desktop Chrome`, RULING 12). Then, corrected:
  - `system-space-view` **"System Space View Route and Data Fan-In"** (15
    scenarios) is "the layout requirement the column lives under" — there is no
    separate layout requirement.
  - The cluster shrink lands in **"Space View Camera Is Keyboard-Operable"**,
    not "Space View Camera Orbit, Pan, and Zoom" (which names no button and
    stays true). ⚠️ **This doc's claim that the keyboard requirement "is
    unaffected" is wrong** — the four `camera-pan-*` buttons are the app's only
    keyboard pan path, and the twelfth button is `select-pan-target-point`, a
    *selection* control this change must not delete. RULING 10.
  - **"Toggle-to-Deselect Single Selection…"** is MODIFIED too: it claims the
    acting fleet "is instead set by the fleet roster's row selection", which is
    already false — `SpaceStage.tsx:754`'s fleet mark is a second setter, and
    the chevron is a third.
  - `docked-fleet-actions` is 2 REMOVED + 2 MODIFIED + **1 ADDED**: `Credit
    Balance Readout`'s seventh scenario is a *panel* announcement with nothing
    to do with credits, and removing the requirement wholesale would leave it
    unspecced (RULING 11). `Sell Commit` and `Refuel Commit` assert the readouts
    this change empties.
  - `figure-formatting` **"An Absent, Non-Finite, or Unsupplied Figure…"** is
    MODIFIED — this doc never mentioned it; its last scenario cross-references
    the credits readout being removed.
  - `fleet-roster` takes **no delta** (RULING 15). Its row-selection requirement
    claims no exclusivity and is scoped to a row click; the chevron is not a
    roster element. The exclusivity claim that goes stale is in
    `system-space-view`, above.
- **Sizing risk:** *(measured, and it was not the gauges.)* The analyst sized
  2a at ≈57 tasks. The cost was the **test files**, exactly as link 1 was
  taught: `FleetActionsPanel.test.tsx` (53 tests, 9 move and 2 rewrite),
  `SpaceCommandPanel.test.tsx` (34 tests, 23 `previewState` references become
  props), `SpaceStage.interaction.test.tsx` (4 camera tests break). The
  preview lift was the seam; see 2a-ii. It still reads
  `BurnPreview.fuelCostTons` and `affordable` off the preview the command panel
  already holds — lift that state to the view, do not re-query.
- **Journey:** ~~dock at a station, read the strip's four cells, select a
  target and watch the fuel gauge grow a cost segment, commit and watch the
  pill flip to `Burning · … · Nm Ss`.~~ **Revised by the 2a-ii split:** dock at
  a station, read the strip's five cells, switch the acting fleet by the
  chevron, commit a burn, watch the pill flip to the burning state and count
  down. The cost-segment leg is 2a-ii's journey.
- **Source:** `../system-hud.md` "Surface 1" and "What leaves"; the design
  canvas (two states); `SpaceStage.tsx` camera cluster;
  `components/fleet/roster-status.ts`.

**Taught.** Archived 2026-10-03, twenty-four days after it was built. The
2026-09-09 record follows as written — it was accurate when the gate was red —
and what the unblocking and the final gate taught is the list under *Taught at
the archive (2026-10-03)* below it.

*As recorded 2026-09-09 (gate red on one leg):* Authored and built in one
full-auto run; 42 tasks, 39 built, tier 1 and tier 3 green. Tier 4 has been
executed **six** times: runs 1 and 2 (the budgeted pair) were red with real
findings, all diagnosed and fixed or filed; the run Travis authorised was
destroyed three times by another project's `pkill -f "emulators:exec"`; and the
sixth **completed** — 53.1m, 18 passed, 5 failed, no emulator death. Four of
those reds are attributed to filed defects (`defect-wake-roster-row-flake`,
`defect-seeded-sighting-ghost-not-drawn`, `defect-spawn-system-single-body`).
The fifth is this change's own journey, on the chevron's cross-system
navigation — a leg no earlier run had ever reached — and it is unattributed:
`../continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`. **Not
archived**, and the chain is stalled behind it. Full record:
`../continous_space/handoffs/add-vitals-strip-journey.md`.

- **The chain doc under-counted again, and asserted a non-effect it had not
  checked.** It named two of six touched requirements, put a delta on
  `fleet-roster` that belonged in `system-space-view`, and stated the keyboard
  camera requirement "is unaffected" when the buttons being deleted were the
  app's *only* keyboard pan path. Link 1 taught that the doc names placements
  accurately and counts optimistically; add to that: **treat every "X is
  unaffected" as a hypothesis to check against the spec text.**
- **The pill took seven edits across four review passes** and both round-1
  blockers landed on it. That is the process locating the change's single
  load-bearing claim — *does the strip lie about state* — and refusing it until
  it was true. Expect the same concentration wherever a link makes one central
  claim.
- **Four figures the wire does not carry were found one at a time** (fleet name,
  fuel drain, docked-host name, burn-target name). Each was re-scoped correctly,
  but they should have been found by **one systematic sweep of every figure a
  surface renders against the served types**, not by four separate rounds.
- **`openspec archive` discards a delta's `## Purpose`** — verified: 14 of 34
  live specs carry the `TBD - created by archiving` placeholder. A new
  capability's boundary paragraph needs an explicit post-archive restore step,
  and this doc's Link 2b section carries a copy of `system-console`'s.
- **Inheriting a testid preserves the selector, not the precondition.** The impl
  contract promised five tier-4 specs would need no edits, reasoning entirely
  about names and DOM shape. Re-homing `hold-readout` into an always-present
  surface changed its *mount timing*: its visibility no longer implies the fleet
  read landed. **Link 2b re-homes far more than this link did.**
- **The bottom-left corner is contested by more surfaces than any hand survey
  finds.** The impl contract enumerated three occupants of the bottom band and
  missed `FloatingNav`, mounted app-wide from the layout rather than from the
  space view. The rerun then found a fourth: Next.js's own dev-mode issues
  badge, which renders in that same corner and exists in the e2e stack by
  construction. **Enumerate by grepping for fixed + bottom-anchored elements,
  and remember the framework itself is an occupant.** Placing the strip's only
  interactive affordance in that corner is what made both collisions fatal
  rather than cosmetic.
- **A gate rerun's value is partly in what it clears.** The rerun proved the
  `FloatingNav` fix worked (the failure moved from `:222` to `:257`) and that
  the `slice.spec.ts` mount-timing fix held — which is how the two new findings
  were isolated as new rather than unresolved.
- **The most dangerous failure shape is a stack death that prints test names.**
  Each killed run reported a plausible pile of reds — 13, then 9, then 10 — in
  specs any reader would attribute to product defects. What separated "ten
  reds" from "one dead emulator" was reading `backend.log` and the emulator's
  own `Received SIGTERM` line. **Check the stack's health before attributing a
  single test**, and treat a uniform ~22s failure time across unrelated specs
  as an environment signature, not a coincidence.
- **"One emulator project, one suite at a time" is a rule about the machine,
  not about your own session.** Moving the emulators out of the run's process
  tree (detached, via `ensure-test-emulators.sh`) did not save them: a
  `pkill -f firebase.test.json` — which is exactly what `backend/make
  stop-emulators` and `/spinup` do — matches them wherever they live. Later
  links should expect to need an announced quiet window for tier 4.
- **A mechanism that fits one observation is not a diagnosis.** The first
  post-mortem named a 600-second tool timeout; it fit the first killed run
  exactly and was refuted by the next one dying in three minutes. Corrected on
  the record (RULING 49) rather than quietly replaced — the same discipline
  RULING 42 demanded after four analyses of a single red.
- **Capture beats inference, and it pays on the first outing.** Instrumentation
  added only to read the dev-overlay badge's "2 Issues" immediately caught its
  own sibling's bug (`document.head` is null inside `addInitScript`), then gave
  the browser-side face of the emulator death, and finally produced the gate's
  single most valuable line — `GET /systems/sys_9_7 200 in 546ms`, which is what
  separates "the click did nothing" from "the app asked and the transition never
  committed". **Link 2b should carry both the `[journey-console]` capture and
  the webServer `stdout: 'pipe'` into its own journey.**
- **Record the suite's wall time on every gate run, and read the reds against
  it.** Run 3d took 53.1m against the same spec list's usual ~28 because another
  project was running CPU-load diagnostics; three of its five reds are
  "the app did not get there in 20 s". Without the wall-time control those three
  read as regressions. **A shared machine is part of the test environment.**
- **A journey only tests the legs it reaches.** Five runs died before step 2's
  final leg, so five runs said nothing about it — and the moment one got there,
  it found something. Read a partial journey as *untested*, never as *passing*,
  and expect the first run that reaches a new leg to find what is waiting there.

**Taught at the archive (2026-10-03).** Archived at `e01b310`;
`fix-world-time-render-loop` archived alongside at `438923c`, second, as its own design required (its ADDED requirement names the
strip's fleet switcher, which lived only in this link's deltas until this link
archived). Gate: the journey 20/20 in a dedicated run, tier 4 23/24 in ~5 min,
tier 3 green in ~17 min; rulings 51–54 in `add-vitals-strip-rulings.md` and 1–3
in `fix-world-time-render-loop-rulings.md`.

- **The "unattributed" red was a product defect two months older than the
  link, and the evidence had been in the log since run 1.** Thirty-one React
  `Maximum update depth exceeded` lines sat in the `[journey-console]` capture
  while four analyses blamed load. The strip did not cause the stall; its
  journey was simply the first tier-4 walk to do an in-app cross-system
  `router.push` out of a mounted system view. **When a journey reaches a leg no
  earlier run reached, read the whole console capture before theorising** — and
  expect links 3 and 4, which add more in-app navigation, to exercise paths no
  spec has walked.
- **A fix for a gate blocker is its own change, and the two archive in the
  order the specs depend on, not the order they were built.** Reconcile was run
  before, between and after; the two changes' MODIFIED headers were disjoint, so
  the second verdict survived the first archive by diff.
- **A checked box is not a record.** Tasks 5.3 and 5.3a of the fix were flipped
  `[x]` in a commit with no run behind them and no journey file. The resuming
  orchestrator found no numbers anywhere, unchecked both, and ran the task. A
  gate task is complete when its handoff file exists, not when its box is
  ticked — **a later link's orchestrator should grep for the record before
  trusting any section-10 checkbox it inherits.**
- **An observational capture closes nothing.** QA's update-depth row could not
  be closed by the vitals journey because the capture only printed; a
  regression would have left the run green. It is a hard `afterEach` assertion
  now. Same for two half-asserted THEN clauses of the width-floor requirement
  ("non-empty", "activatable itself"). **Before a gate run, have QA name the
  line that closes each BLOCKED row** — it found all three gaps in four minutes,
  before the run rather than after it.
- **The warped test stack changed the gate's economics.** `1424a77` boots the
  e2e backend at world scale 5 with a cheaper lane: tier 4 fell from ~28 minutes
  to ~5, and twenty repeats of the journey cost five minutes. A repeat-N closing
  run is now affordable for any navigation or timing defect. The price: the
  journeys now prove behaviour at scale 5 only, and that commit carried
  unspecced production edits (`wallMsUntil`, a backend `LANE_MS_PER_DISTANCE`
  knob) that no change stands behind — listed in
  `add-vitals-strip-qa-reverify.md` (U1–U10) for Travis to adjudicate.
- **Verify evidence expires like an adversary verdict does.** Twenty-four days
  and seven commits passed between QA's matrix and the gate. Re-verifying only
  the production diff since the verified commit (QA, security, the red-manifest
  check) took three short parallel delegations and is what surfaced the two
  findings above. **A link resumed after other work landed should diff
  production code against its QA commit before locking the tree.**
- **The suite's most frequent red is now a fixture that asserts on a random
  spawn.** `defect-spawn-system-single-body` has fired in three of four
  completed gate runs. It is residue by rule (RULING 54), but every later link's
  gate will meet it until the tier-4 random-spawn fixture policy that it and
  `defect-station-order-500` both wait on is chosen.
- **The quiet window was achievable without announcing one.** No SIGTERM, no
  stack death; each run waited for load under 3.5 before starting. The
  name-matched-`pkill` hazard remains real — checking the emulator log before
  attributing any red stays mandatory.

## Link 2a-ii — `lift-burn-preview-to-view`

**Split off `add-burn-cost-overlay` in-run on 2026-10-03** by the full-auto
orchestrator, after its analyst put the unsplit link at 37 tasks before two
carried defects and before the panel — see
`../../handoffs/add-burn-cost-overlay-rulings.md` FULL-AUTO RULING 1 for the
seam, and `../../handoffs/lift-burn-preview-to-view-rulings.md` for this link's
own rulings.

**Delivers.** `useBurnPreview` called once, in `SystemSpaceView`, and passed to
`SpaceCommandPanel` by props; the panel's hook call deleted and its test harness
migrated. Two preconditions the code never enforced: no preview while a mine
holds the movement channel (`drift-running-mine-preview-unsuppressed.md`,
view-level test) and none while the selected target is the acting fleet's own
host (`defect-docked-selection-polls-zero-length-preview.md`). The burn
command's availability is unchanged; stating *why* it is unavailable, and making
it unavailable when docked at the target, is the filed follow-up
`../../handoffs/followup-explain-withheld-burn-command.md` (RULING 16).

- **Touches:** MODIFIED `system-space-view` "Burn Preview Reflects the
  Server-Solved Order, Without Committing" and "A Failed or Stale Preview Is
  Never Presented as a Current Quote".
- **Journey:** select a target and read the quote in the panel; one preview
  request per interval; re-target mid-burn; select the docked fleet's own host
  and see no preview request and no 500; start a mine and see the quote go.

**Taught.** Authored, built and archived (`0f2ad5d`) in one full-auto run, 2026-10-03/04.
40 tasks; two MODIFIED blocks (20 and 9 scenarios, 16 of them new; three carried
bodies edited); three adversary rounds, cap reached with no blocker; QA 29/29;
tier 4 red once on the journey's own step 5 (a test misreading), green on the
one rerun (25/25, 388 s); tier 3 once, 1042 s, one red = the filed
`defect-station-order-500`. Records: `../../handoffs/lift-burn-preview-to-view-*`.

- **The link was three links, and review found the seams the analyst could
  not.** The analyst's seam (lift vs overlay) held. The second seam — the
  commit-clear — only appeared when the adversary showed the stored-pair design
  outlives the order (cut drive, stop, arrival at a point). **A clause the live
  spec states in one sentence with no scenario ("SHALL clear when an order
  commits") is not a small fix; it is an unspecified feature.** Expect the same
  of every unscenarioed SHALL a later link is told to "make true".
- **A rule that sounds like a tidy-up can be the whole change.** "The burn
  command is offered exactly where a preview is requested" took the link from
  32 tasks to 49 across two reviews — two more MODIFIED blocks, reason copy, a
  single-reader refactor of `FleetActionsPanel`. It is filed, whole, as
  `../../handoffs/followup-explain-withheld-burn-command.md`. **When the panel
  wants a principle and the link wants a fix, ship the fix and file the
  principle** — but say out loud what the narrowing costs: here, a fleet docked
  at its selected target lost its "No quote" hint and now shows only an
  uncapped label over a Burn that 500s. That is the ordinary state after every
  arrival, and the best reason to author the follow-up soon.
- **"As last read" beats "while".** Every precondition was first written as
  world truth ("while a mine holds the channel") and every one was unsatisfiable
  as written, because the client knows the world only through reads. The text
  that survived says *as the view last read it*, states the lag as a bound, and
  names which two things share one value. Links 2a-iv and 4 project the same
  quote; write their lifetimes the same way.
- **Withholding a query is not clearing it.** A disabled React Query observer
  keeps its data; re-enabling re-presents the old answer as current. The
  resumed-preview rule (starts empty, requested at the transition) exists
  because of that and was missed for two rounds. **Any link that gates a read on
  a state that can toggle back needs the same question asked: what is shown at
  the moment it resumes?**
- **Lifting state moves a derivation out from under its only test.** The panel
  test had been the only observer of `preview && !stale`; after the lift the
  test supplies that value by hand. The round-3 MAJOR was exactly this, and it
  is lesson two of the handoffs README again. Link 4 lifts and re-homes far more
  — for each derivation that moves, name the test that observes it at its new
  home.
- **The doc's "what the harness migration costs" was wrong in the cheap
  direction this time.** 34 tests, 23 `previewState` references, as stated — but
  no post-render mutation anywhere, one `panel()` helper, 11 arrange steps. The
  cost had moved to view-level tests that did not exist. Sizing against the test
  files still held; the files were just not the ones named.
- **Two surfaces, one fact, two readers — and the journey found it in 109 ms.**
  The fleet panel's mine countdown runs off a commit-local ETA; the view's
  preview flag runs off the running-action read. The journey's first step-5
  assertion keyed on the countdown and went red on one snapshot in 22. The
  product was right and the test had read the wrong surface. **Key a journey's
  window on the surface the requirement binds, and log every snapshot's index
  before asserting on any of them.**
- **The design canvas is reachable.** The mock both docs cite lives in a
  claude.ai artifact, not the repo; the analyst listed two hard-stop candidates
  because it could not read it. The orchestrator can (Artifact read). 2a-iv's
  geometry ruling was settled that way — its orchestrator should re-read the
  mock rather than trust the recorded reading.
- **Gate economics held.** Tier 4 ~6 min, tier 3 ~17 min, quiet windows found by
  waiting for the one-minute load to fall under 4; no SIGTERM. The
  random-spawn fixture red (`defect-spawn-system-single-body`) fired on run 1
  and not on run 2, as a random draw would.

## Link 2a-iii — `surface-commit-stranding-warning`

**Split off `clear-burn-preview-on-commit` in-run on 2026-10-04** by the
full-auto orchestrator, after its analyst sized the unsplit link at 40 tasks
before the panel — see `../../handoffs/clear-burn-preview-on-commit-rulings.md`
FULL-AUTO RULING 3 for the seam, and
`../../handoffs/surface-commit-stranding-warning-rulings.md` for this link's
own rulings.

**Delivers.** `SpaceCommandPanel` reports an accepted burn commit to the view;
the view keeps, per fleet, a record of the last order it committed whose
response carried the warning — and none for an ordinary commit (identity = the
commit response's burn instants) and decides, against the own-fleets read as
last reported, whether that order is still the fleet's running burn; the commit
response's stranding warning is shown as a notice for that order's life
(`../../handoffs/drift-commit-stranding-warning-not-rendered.md`). The quote
keeps refreshing after a commit, as today.

- **Touches:** ADDED `system-space-view` (the notice and the order's life);
  `fleet-roster` "A Burn Commit's Stranding Warning Is Surfaced to the Player"
  made true for the burn command, no delta.
- **Read first:** `../../handoffs/clear-burn-preview-on-commit-analysis.md`
  (§ 1b, § 2, § 5 M1), via its index.
- **Journey:** commit a burn; the notice leg is conditional on a fixture that
  can arrange a stranding commit — otherwise recorded untested, never passing.

**Taught.** Authored, built and archived (`3218d9d`) in one full-auto run, 2026-10-04. 40 tasks;
one ADDED requirement, 25 scenarios; two adversary rounds (round 2 CLEAR); QA
SHIP; tier 4 26/26 in 387 s, tier 3 once in 959 s with one red = the filed
`defect-station-order-500`. Records: `../../handoffs/surface-commit-stranding-warning-*`.

- **The doc under-counted a third time, and a split that looks like the small
  half was not small.** The row named one MODIFIED and one "likely"; the analyst
  found 2 ADDED and 3 MODIFIED and sized the whole at 40 before the panel. The
  half split off as "about 15 tasks" was 33 at first authoring, 39 by the
  architect's honest count and 43 counted one task per scenario. **A notice
  whose lifetime is an order's life is as many scenarios as the order has ways
  to end** — eight here, before fleets, failures and reloads.
- **The cap was met by shedding, twice, and the number has no slack in it.**
  The no-instants case (a warned response lacking a burn instant) left as
  `../../handoffs/followup-warned-commit-without-burn-instants.md`; the task
  unit was ruled to be the test arrangement group, so three parametrised pairs
  are one task each (RULINGs 11–13). Read 40 as "43 scenarios' worth", not as
  headroom.
- **The record this link lands exists for warned orders only.** The view stores
  nothing for an ordinary accepted commit (architect A12: no consumer). 2a-iii-b
  wants "the order this view committed" for *every* commit — it must widen the
  record, not assume it. The identity (the commit response's `DepartMs` and
  `ArriveMs`, equal on the own-fleets read) and the gap rule carry over as built.
- **A commit-to-read gap cannot be measured with timestamps.** The in-file scan
  precedent (`marker > dataUpdatedAt`) ties under fake timers and inside one
  millisecond; the architect measured 200 ties in 200. The gap is the own-fleets
  query's answer count at acceptance. And a read begun before the acceptance
  never answers after it: `useOrder`'s own invalidation cancels it before the
  panel's callback runs — which means the notice depends on that invalidation
  staying where it is.
- **"Fails toward the safe side" has a different sign for a warning than for a
  command.** The analyst recommended ending the gap on a failed read because
  that caps a second Burn; for a warning that removes it on the strength of
  stale data. Both reviewers reversed it (RULING 5). 2a-iii-b inherits both
  consumers on one derivation and must state the failed-read rule per consumer.
- **A clause about a new surface may only say what that surface contributes.**
  "The notice SHALL NOT change the live-region announcement" was false on the
  commonest way a notice ends — arrival at a body, where a live requirement
  makes the same read announce the landing (adversary M2). Written as "adds no
  text and causes no announcement of its own" it is true and testable.
- **Every "whether or not", "both" and "exactly once" needs a row a one-sided
  build fails.** The second warned commit by the same fleet, the comparison of
  both instants and the once-per-response toast each had a wrong implementation
  that passed all 25 scenarios until the adversary named it; the SDET's mutation
  pass then found one the spec's own rows still let through (departure-only).
- **2b must keep `SpaceCommandPanel` mounted across tab changes or lift
  `useOrder`.** React Query drops mutate-level callbacks for an unmounted
  observer: a commit whose response lands after the panel unmounts shows
  neither its success toast, its warning toast nor its notice (architect A11).
- **The notice's positive path has never been seen against a real backend.** No
  deterministic stranding fixture exists on the e2e stack — the warning depends
  on fuel against a random system's geometry and nothing sets a fleet's fuel —
  so the journey proves only the negative (a non-stranding commit's real
  response omits the field). The instants equality the lifetime rests on is
  closed at tier 1 and by reading one DTO at both ends:
  `../../handoffs/followup-stranding-notice-untested-on-real-wire.md`. It waits
  on the same random-spawn fixture policy two filed defects wait on.
- **The figure sweep found three things nobody had filed**, all by code reading:
  the commit response carries no delta-v, so the drift notice would show after
  every real commit and a live scenario is false in production
  (`drift-commit-response-carries-no-delta-v.md` — cannot be made true inside
  this chain's no-backend fence); a point burn serves `BodyId: ""` where the
  client tests `== null` (`defect-point-burn-serves-empty-bodyid.md`); and a
  stop's stranding warning is unrendered on both views
  (`drift-stop-stranding-warning-not-rendered.md`). Link 4 owns the
  commit-result surface and should read the first before touching it.
- **The filed tier-3 defect moves between tests.** `defect-station-order-500`
  fired in a different test of the same file from the previous gate. Attribute
  it by its request, status and backend sentinel, and by an empty backend diff —
  not by a test name carried from the last link (RULING 18).
- **Another session committed to this branch mid-run** (`6efc86f`, `223b246`,
  between the build and the gate commit) and its edits were in the tree under
  the gate, unchanged throughout by mtime. Stage by explicit path, and record
  foreign files' mtimes around each tier.

## Link 2a-iii-b — `clear-burn-preview-on-commit`

**Split off `lift-burn-preview-to-view` on 2026-10-03** by its adversary round 1
(`../../handoffs/lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 13);
**halved on 2026-10-04**, the order record and the stranding notice going first
as 2a-iii above.

**Delivers.** The live clause "the preview SHALL clear … when an order commits"
made true — it has no scenario and no implementation today
(`../../handoffs/drift-preview-does-not-clear-on-commit.md`) — as a fourth
withheld state built on the order-identity derivation 2a-iii lands — note that
2a-iii stores a record for *warned* orders only, so this link must widen it to
every accepted commit rather than assume it exists.

**Why it is its own link.** The first attempt (a stored fleet-and-selection pair)
was a BLOCKER: the committed state outlived the order through cut drive, stop,
arrival at a point and outside re-tasks. The central question is *when does a
committed selection stop being committed*, and the answer must come from the
served fleet read, survive the gap before that read shows the burn, and keep a
second Burn from going out uncapped.

- **Touches:** *(as the 2026-10-04 analysis found, not as first drafted.)* ADDED
  `system-space-view` (the committed state); MODIFIED "Burn Preview Reflects…"
  (three → four withheld states, the commit clause), "A Failed or Stale Preview
  Is Never Presented as a Current Quote" (the closed no-label enumeration),
  and "Burn and Jump Commit Controls Guard Against Double-Submit" if the burn
  command is ruled unavailable for a committed selection.
- **Read first:** `../../handoffs/clear-burn-preview-on-commit-analysis.md`
  (whole, via its index — §§ 3–5 and 8 are this link's; its open questions Q1's
  product half, Q2, Q7 and Q8 are **unruled**) and
  `../../handoffs/clear-burn-preview-on-commit-rulings-index.md`;
  `../../handoffs/lift-burn-preview-to-view-adversary-r1.md` B1, M5, m4;
  `lift-burn-preview-to-view-panel-ux.md` F2; `-panel-architect.md` A1, A4.
  Re-check the analysis against 2a-iii's archived spec and code before trusting
  it — it was written before 2a-iii was built.
- **Journey:** commit a burn and watch the quote go; cut the drive and watch the
  burn command and its quote come back for the same selection.

**Taught.** Authored and built in one full-auto run on 2026-10-04, archived (`51944af`) on 2026-10-05 after a user ruling. Records: `../../handoffs/clear-burn-preview-on-commit-*`. One ADDED requirement (21
scenarios) and three MODIFIED (20, 9 and 4 scenarios, the 33 carried scenarios
keeping their headings; one carried body edited); 40 tasks by this link's count
and 45 in the predecessor's strict unit (`../../handoffs/clear-burn-preview-on-commit-rulings-index.md`
RULING 13); two adversary rounds, round 2 CLEAR. QA SHIP; security audit clear.
Gate: first run tier 4 red on the journey's own fixture precondition and tier 3
void; the one rerun had the journey and tier 3 green (1875 tests, 1054 s) and
tier 4 at 24/27 in 7.5 min, the three reds unrelated; passed by USER RULING 20.

- **The gate stopped the link, and the cause was the run's own orchestration.**
  A delegate that handed back a one-word report while its background run was
  still alive was treated as abandoned and replaced; it then resumed, and two
  delegates ran tier 3 on one emulator project. One run was voided at once and
  the other was left an orphan that outlived its emulators by hours — the
  suite's 90-minute timeout is per test binary — and blocked the only rerun the
  rules allow. **Gate tiers are started by the orchestrator itself, in the
  background, one at a time; a delegate diagnoses and records, it does not
  launch.** And a hand-back that arrives while its author's process is alive is
  an interim report, not an abandonment.
- **A journey leg sized against a number nobody measured fails before it
  starts.** The first journey demanded a 50 s flight; a spawn home at world
  scale 5 offers about 4.4 s. The analysis had said "the window must fit inside
  the flight" and nobody read a flight time off a previous run's log. Size a
  journey's waits from the last gate's log, and let a leg the fixture cannot
  contain log UNTESTED rather than fail or pass.
- **The rerun proved the change and still did not pass the gate.** The journey
  walked commit, hold, second activation, another target and back, cut and
  arrival on the real stack; the commit response's burn instants equalled the
  own-fleets read's — the first real-wire observation of the identity two links
  rest on. Tier 3 was fully green. Tier 4 then went red in three other specs
  that had passed three hours earlier on the same code: a random spawn in scan
  range of a gate, a sell whose price moved, and a post-dock burn 409. **A
  residue rule keyed to filed signatures cannot absorb a red nobody has filed
  yet, and a 409 whose body was not captured matches nothing.** The e2e backend
  log holds no response bodies; until it does, every 4xx red costs a gate.
- **The drift notice does render after every real commit** (logged in the
  journey, twice) — `drift-commit-response-carries-no-delta-v.md` is now
  verified on a stack. After acceptance, focus sits on the document body and
  one Tab reaches the next control: the focus scenario passes, thinly.
- **The unrelated reds were passed by Travis, not by the run — and one of their
  causes was removed rather than tolerated.** USER RULING 20 archived the link.
  In between, `fix-burn-order-geometry-refusals` (out of chain, archived
  `d52eab1`) made the burn solve refuse with a named reason and stopped homing
  a corporation where its station reaches the star clearance — the
  `defect-station-order-500` half of the random-spawn fixture family, fixed at
  its cause. Its own gate, on a tree containing this link, was 28/28 at tier 4
  and 1979/0 at tier 3, with this link's three red specs all passing. The other
  half of the family (a spawn that happens to sit in scan range of a gate, a
  single-body spawn system, a sell whose price steps under warp) is still
  random and still filed.
- **A checkbox count is read from the file, not remembered.** The orchestrator
  reported 35 and then 38 of 40 tasks checked; the file had 13. The SDET's
  delegations forbade editing `openspec/`, so nobody ticked sections 1–4, and
  the orchestrator never grepped. Travis's ruling made the reconciliation a
  condition of the archive: `../../handoffs/clear-burn-preview-on-commit-task-reconciliation.md`
  maps all 25 test tasks to their tests at HEAD (six under recorded contract
  settlements). **Say in the SDET's red-phase brief who checks its boxes, and
  grep `- \[ \]` before reporting a count** — link 2a's "a checked box is not a
  record" has a mirror image.
- **For link 4:** `use-burn-preview.ts`'s header comment counts the withheld
  states and is stale by one (architect A10); the file was fenced here.
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

## Link 2a-iv — `add-burn-cost-overlay`

**Renumbered from 2a-ii by the two 2026-10-03 splits.** Everything below about the
lift, the prop conversion, the harness migration and the carried drift now
belongs to `lift-burn-preview-to-view` above; this link is the overlay alone.
Its opening rulings (segment-only, start-anchored geometry with no computed
shortfall, amber, withdraw-on-stale, point cost) and the questions left for its
own panel are already recorded in
`../../handoffs/add-burn-cost-overlay-rulings.md`; its analysis is
`../../handoffs/add-burn-cost-overlay-analysis.md`.

**Split off 2a in-run on 2026-09-09** (RULING 9). 2a delivers the strip with a
plain fuel gauge; this link gives that gauge its cost overlay, which is the
part that requires a cross-component refactor.

**Delivers.** The burn-preview state `SpaceCommandPanel` holds today lifted to
`SystemSpaceView` and passed to both consumers; `SpaceCommandPanel` converted
from a hook call to props; the fuel gauge's cost overlay — the segment past the
fill is the shortfall, in the affordability colour — drawn only while the quote
is current, withdrawn when the selection clears, when a refresh fails, or when
an order commits.

**Why it is the expensive half.** `SpaceCommandPanel.test.tsx` is 630 lines and
34 tests built on `vi.mock('@/hooks/use-burn-preview')` plus a mutable
`previewState`; 23 references become props, and mutations that happen after
render today must become re-renders. That harness migration, not the overlay, is
the cost.

**Carries a filed defect.** `drift-running-mine-preview-unsuppressed.md` — the
only production preview call site omits `mineRunning` from
`commitWouldBeAccepted`, so the running-mine suppression that
`system-space-view` mandates is specified, tested at the hook, and never wired.
This link lifts that call site and **must not carry the bug up**. It needs no
delta (the fix makes a live scenario true); it needs a **view-level** test, since
a test that mocks the hook cannot observe it.

- **Touches:** MODIFIED `system-console` (the overlay requirement);
  `system-space-view` "A Failed or Stale Preview Is Never Presented as a Current
  Quote" — a graphical projection of a quote is a presentation of that quote,
  and the live text binds only "figures".
- **Open question inherited from 2a:** whether the strip prints any cost or
  shortfall *text*, or only the gauge segment. The chain doc's 2a scope said
  segment-only, with `▲ short 6.6 t` belonging to link 4.
- **Journey:** select a target, watch the fuel gauge grow a cost segment; pick an
  unaffordable target and watch the segment extend past the fill in the
  unaffordable state; clear the selection and watch it go.

## Link 2b — `add-console-dock`

**Carved out of the scoping doc's step 2** — see *Why 2 is two links*.

**Inherits `system-console`'s capability boundary.** `openspec archive`
discards a delta's `## Purpose` section (proof:
`openspec/specs/focused-scan/spec.md` reads the archiver's generated `TBD`
placeholder to this day), so link 2a's `add-vitals-strip` pastes its
boundary paragraph here, verbatim, as this link's copy of record — read
this before touching `system-console`, rather than re-deriving the
boundary from the strip's shipped code:

> The console: everything that floats over the system space view as
> instrumentation rather than as scene. `system-space-view` owns what the
> canvas draws and how you pick — the renderer, the camera, and the selection
> among a body, a lane gate, or a point. `system-console` owns the always-on
> vitals strip along the bottom of that view — the acting fleet and its state,
> its fuel and range, its hold, the corporation's balance, and the world clock
> — and the per-entity detail dock the strip is the collapsed state of. The
> strip reads; it does not command. It renders only figures the mounting view
> supplies, issues no read of its own, carries no verb but the affordance to
> switch which fleet is acting, and never changes the space view's selection.

This is the paragraph **as of link 2a**; where it and
`openspec/specs/system-console/spec.md` disagree, the spec wins, and this copy
exists only because the archiver discards the original.

**Delivers.** The dock beneath the strip: a tab bar and a ~164px detail
area (220px total with the strip), default collapsed, four tabs that always
exist:

| Tab | Content | Moves from |
| --- | --- | --- |
| **Acting fleet** (by name) | state, park mode, hold/release, cut drive, and the docked verbs when attached — refuel/sell at a station, jump at a gate, mine at a feature | `FleetActionsPanel`; the jump control out of `SpaceCommandPanel` |
| **Scan** | the focused-scan target list, sweep cost as time-and-exposure, commit, running window, cancel | `ScanControl`, whole |
| **Log · N** | the sighting log | `SightingLog`, whole; the floating panel and its toggle retire |
| **Fleets · N** | the roster, `commandOwner="view"` | `FleetRoster` |

The right column (`inset-y-4 right-4 … w-72`) is deleted. `Esc` collapses
the dock (the second-press rule lands with selection in link 4). The
`SpaceCommandPanel` loses its jump half to the Acting-fleet tab here and
keeps its course half — mounted in that same tab as an interim home — until
link 4 retires it. That is the one piece of chrome that survives two links,
and it is because the arc label does not exist yet.

**The requirements move, not change.** Every `docked-fleet-actions`,
`sighting-log`, and scan requirement keeps its scenarios verbatim; the delta
is a "mounted in the console" clause on each. The adversary's job on this
link is to catch a behavioural change smuggled in as a placement change —
the double-submit guards, the running-mine gating, the inbox-driven cancel
and the log's mount-ordering rule are the ones most likely to break when
their host component is remounted inside a tab.

**Inherited from 2a's security audit — assert it, do not inherit it.**
`VitalsStripProps.acting: Fleet | null` is not own-ness-constrained at the type
level. In 2a the fog contract holds only because the caller is disciplined and
the server omits `roster` for `own: false` (`backend/fleet/handler.go:697`).
This link mounts that component against an *arbitrary selected entity*, so the
property needs its own scenario: WHEN the selected entity is a fleet the
requester does not own THEN the hold and fuel cells render the absent form and
no gauge segments. See `../continous_space/handoffs/add-vitals-strip-security-audit.md`.

**Tab remount is the trap.** `SystemSpaceView.tsx` already computes the
running-sweep marker *outside* `ScanControl` because the control must
survive a remount while the window is open. A tabbed dock remounts every
tab's content on switch unless the spec says otherwise. Rule it: tab
content stays mounted and hidden, or the spec names the state that must
survive a switch and the tests prove it.

- **Touches:** MODIFIED `system-console` (the dock, tabs, collapse, Esc);
  `system-space-view` (the column retired; the log-reachable, scan-surface
  and roster cross-navigation requirements re-pointed at the dock);
  `docked-fleet-actions`, `fleet-roster`, `sighting-log` (mounted-in-the-
  console deltas, scenarios verbatim).
- **Journey:** dock, open the Acting-fleet tab, refuel; switch to Scan and
  commit a sweep; switch to Log while it runs; switch back and cancel; the
  log row count is unchanged by the tab dance.
- **Source:** `../system-hud.md` "Surface 4" (all but the selected-entity
  tab), "What leaves"; `SystemSpaceView.tsx:779–890`.

## Link 3 — `add-in-system-list`

**Why after the dock.** The list drives selection and, in link 4, selection
drives the dock. Landing the list before the dock exists would give a click
nothing to open.

**Delivers.** Top-left, under the breadcrumb, headed `In system · N known`.
One pill per entity the canvas draws: star, features, lane gates, stations,
foreign contacts, sighting ghosts. Each pill: the canvas's own mark colour
as a dot, the name, a discovery subtitle —

- `surveyed` / `remembered` — the band the entity is read in
- `docked here` — the acting fleet is attached to it
- `uncharted` — a gate whose lane the corp has not charted (dimmed)
- `ghost · T+ 1d 22:40` — a frozen sighting, at its `asOf`
- a contact's subtitle per the *Open decisions* ruling

Clicking a pill selects the entity — the **same** selection as clicking its
mark ("Toggle-to-Deselect Single Selection…", unchanged) — and reframes the
camera on it. The off-screen reach chips (`offscreen-*` in `SpaceStage.tsx`)
are deleted in the same change; "Off-Screen Bodies and Lane Gates Are
Reachable by Pointer and Touch" is rewritten to be satisfied by the list.

**The list is the fog's output made legible.** It draws from the same
`space-scene` marks the canvas draws, so it can never list something the
scene does not show or miss something it does. A ghost is listed but is
"Not a Member of the Space View's Selection" — clicking its pill reframes
without selecting, exactly as clicking its mark does today.

- **Touches:** MODIFIED `system-space-view` — the off-screen reach
  requirement (chips → list), "Body, Lane-Gate, and Point Selection Is
  Keyboard-Operable" (the list is a second keyboard path and must not
  double-announce), the ghost non-selection requirement (a pill case).
- **Journey:** a system with a body off-screen at the default framing; click
  its pill; the camera lands on it and the burn preview resolves against it;
  a ghost pill reframes and selects nothing.
- **Source:** `../system-hud.md` "Surface 2"; `SpaceStage.tsx` chips;
  `space-scene.ts`, `space-selection.ts`.

## Link 4 — `add-arc-figures-and-entity-tab`

**Why last.** The course panel is the last right-column occupant standing,
and it can only retire once *both* of its replacements render the preview —
the label on the arc and the dock's course column. This link lands both and
deletes `SpaceCommandPanel`.

**Delivers, half one — figures on the arc.** When a target is selected and
the preview resolves, a two-line mono label near the curve's midpoint with a
short leader:

```
4m 12s · Δv 269
53.8 t  ▲ short 6.6 t
```

Border and text in the affordability colour. The **Burn** button at the
destination end of the curve. While burning the label flips to progress —
`2m 40s left · Δv 269` / `burned 21.3 t · 32.5 t to go` — and the curve
draws its travelled portion solid, the remainder dashed. The label is a
projection of the existing preview, never a second quote; quote-lock, stale-
preview and double-submit apply to the Burn button wherever it sits.

**Delivers, half two — the Selected entity tab.** Appears when something is
selected; selecting opens the dock on it if collapsed; `Esc` clears
selection, a second `Esc` collapses. Columns for an asteroid field:
Identity (kind, id, orbit `r 62 · 14d period`, seen when and in which band,
distance from the acting fleet), Lodes · remaining (the #0005 fold the board
read serves; unobserved kinds read `— not seen`; your rate and time-to-full-
hold from `roster.miningRate`), Course (the arc's figures plus the ceiling),
Actions (every applicable verb, **dimmed rather than hidden** with the
reason — `Refuel 7 t · 28 ₡`, `Burn` dimmed unaffordable, `Mine · after
arrival`). For a station: the market board as the tab content
(`market-board-panel` mounts here), fuel price, Sell/Refuel. For a gate: the
far system, charted or not, Jump. For a ghost: the record and its age. For a
contact: what the fog serves and nothing more.

**Selection drives the dock; the acting fleet's state does not.** Planning a
burn while docked and reading dock actions while burning are both just tabs.

**Pre-identified seam, if the panel finds this past 40 tasks:** half one
ships as `add-arc-figures` (label, Burn on the arc, progress, the command
panel's course figures moved to the Acting-fleet tab's course column,
`SpaceCommandPanel` retired); half two follows as `add-selected-entity-tab`
(the tab, `market-board-panel` mounted, the Esc two-press rule). Half one
is self-contained: the course panel can retire once the arc label and the
Acting-fleet tab's course column both render the preview.

- **Touches:** MODIFIED `system-space-view` "Burn Preview Reflects the
  Server-Solved Order…", "Burn Commit Reports Its Outcome", "Burn and Jump
  Commit Controls Guard Against Double-Submit" (one handler, two placements
  is a scenario, not an assumption), "Own-Fleet Position, Burn Curve, and
  Arrival Ghost Render Continuously" (solid/dashed split), "A Landed
  Resolution Is Announced…" (the label's flip is a second announcer — must
  not double-announce); `system-console` (the selected-entity tab, open-on-
  select, Esc); `market-board-panel` "Row Selection Delegated to the
  Mounting View" (the tab is the mounting view).
- **Must rule (see *Open decisions*):** where Burn lives.
- **Journey:** the M11 slice through the new chrome — dock at home, mine
  from the entity tab, sell from the station's tab, pick a premium from
  the board, select the far gate from the list, commit the burn from the
  arc, watch the label count down, jump.
- **Source:** `../system-hud.md` "Surface 3" and "Surface 4" (the
  selected-entity tab); `SpaceCommandPanel.tsx`; `space-scene.wire-curve`.

---

## Why 2 is two links

The scoping doc's step 2 moves five things at once: four persistent readouts
to a new strip, the actions panel and the roster into a new dock, and the
camera cluster. The previous chain's link 8a claimed 47 tasks and was 131;
its 8b, a "surface" change like these, was 119. `docked-fleet-actions` alone
carries fifteen requirements whose scenarios must survive a remount verbatim.
A single step-2 change would be authored past the cap and split by its own
panel anyway — better to split it here, at the seam the doc already names
(strip = instruments, dock = verbs), so each half has one journey and one
adversary target: 2a's is *does the strip lie about state*, 2b's is *did a
remount change a behaviour*.

## Why this order and not the doc's

The order is the scoping doc's own (formatting → strip → list → arc), with
the one split above. The alternative worth naming — arc figures before the
list, because the burn decision is the motivating problem — was rejected:
the arc label projects a preview that needs a selection, and until the list
lands, selection is canvas-only, so the label's journey could not walk from
"see it in the list" to "commit on the arc". Link 4's journey is the whole
loop; it needs everything before it.

## Open decisions gating the chain

Each row carries a recorded lean so a `--full-auto` run can rule with a
basis (`chain-doc`); a ruling Travis makes here before the run overrides
the lean. Rulings land as `FULL-AUTO RULING` entries in the link's
`-rulings.md` handoff.

| Decision | Gates | Lean |
| --- | --- | --- |
| **What clock a relative duration counts in.** `lib/eta.ts` assumes scale 1; `SystemSpace.scale` says never assume that. | link 1 | **Wall-clock.** A relative duration (`in 4m 12s`, `2m 40s left`) is the real time the player will wait: world-ms ÷ served scale. The absolute `T+` stamp is world time, with `×scale` shown so the two are never confused. Reversal: one function. |
| **Does the formatter earn its own capability?** | link 1 | **Yes** — `figure-formatting`. The rules are cross-surface and fixture-pinned; hanging them off `system-space-view` would make every later placement change reopen them. |
| **Who owns the strip and dock — a new capability or `system-space-view`?** | links 2a–4 | **New: `system-console`.** Collapse, tabs, open-on-select and Esc are behaviours that outlive any placement. `system-space-view` keeps *what the canvas draws and how you pick*; `system-console` is *what floats over it*. |
| **Do tabs stay mounted when hidden?** | link 2b | **Yes, mounted and hidden** (`hidden` attribute), so the running-sweep marker, the log's cursor and any in-flight commit survive a tab switch without a lifted-state refactor. Reversal: one prop. |
| **Where Burn lives.** Arc only, console only, or both. | link 4 | **Both, one handler** — the arc button is the primary path, the tab's is the same control in a wider frame; the double-submit guard is shared by construction. The scoping doc's stated lean. |
| **Does selecting from the list reframe the camera, or only highlight?** | link 3 | **Reframe on click.** It is what the chips do today, what the mock assumes, and what makes the list satisfy the off-screen reach requirement. Keyboard focus moving through the list highlights only; `Enter` selects and reframes. Reversal: one handler. |
| **Foreign contacts in the list.** | link 3 | **Listed — the list shows every mark the scene draws, one rule.** A contact the fog serves is already on the canvas; a list that omits it would be the second visibility filter this project has repeatedly refused to build. Subtitle `contact`. |
| **Dock height.** 220px fixed vs a drag handle. | link 2b | **Fixed 220px, no handle.** One less thing to test; the number is the mock's. Reversal: one change adding the handle. |
| **Persistent strip across views** (galaxy view). | none | **No, not in this chain.** The scoping doc lists it under "does NOT do"; the departure hand-off question is a later chain. |

Nothing else in `../system-hud.md` is open: the three placements and the
dock-as-home-of-detail are **DECIDED**; everything marked RECOMMENDED there
is the design input the writer authors from.

## What every link must not do

- Add a backend field, endpoint or query. The board read, preview, roster,
  inbox and pile already carry every figure.
- Touch the galaxy view.
- Produce a mobile layout. The `85vw` cap the column had is the floor.
- Change the palette, type scale or panel fill. Same zinc, same 11px mono
  labels, same `white/[0.12]`. Placement and weight change; vocabulary
  does not.
- Keep the thing it replaces. Column, chips, floating log, twelve-button
  cluster, `lib/eta.ts`, `SpaceCommandPanel` — each is deleted by the link
  that supersedes it, in the same change.

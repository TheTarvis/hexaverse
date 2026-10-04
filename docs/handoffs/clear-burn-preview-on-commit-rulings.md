# `clear-burn-preview-on-commit` — open questions and rulings

Link 2a-iii of the system-HUD chain (`docs/plans/system-hud/chain.md`), split
off `lift-burn-preview-to-view` by that change's FULL-AUTO RULING 13
(`docs/handoffs/lift-burn-preview-to-view-rulings-index.md`). Run under
`/team … --full-auto`: every user gate is lifted; every open question is ruled
in-run by the precedence in `harness/skills/openspec-team-workflow/SKILL.md`
§ "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision; a choice without one is a guess,
and guesses are forbidden.

Design analysis: `docs/handoffs/clear-burn-preview-on-commit-analysis.md`.

---

## Rulings made at orchestration open (before authoring)

### FULL-AUTO RULING 1 — this change is the commit-clear with an end tied to the order's own life, the cap on a second Burn, and the commit's stranding warning; nothing of the withheld-burn follow-up, the overlay, or the backend is in it

**Question.** What is in scope?

**Ruling.** In: making the live clause "the preview SHALL clear … when an order
commits" true with scenarios; the end condition of the committed state, read
from the served fleet read and holding across the gap before that read first
shows the burn; what a second Burn does while the quote is cleared; the commit
response's stranding warning rendered on the system space view. Out: stating
why the burn command is unavailable in the three precondition states and
withholding it when docked at the target
(`docs/handoffs/followup-explain-withheld-burn-command.md`, deliberately out of
the chain); the fuel gauge's cost overlay (link 2a-iv); the undrawn preview
curve (link 4); any backend field, endpoint or query; the galaxy view; palette
or type changes; client-side affordability or shortfall arithmetic.

**Basis.** Precedence 1 — chain doc, the link's row and section ("Delivers",
"Why it is its own link"), "What every link must not do", and the "Out of the
chain, deliberately" paragraph.

**Alternatives rejected.** Absorbing the withheld-burn follow-up because it
touches the same control — the predecessor took that from 32 tasks to 49 and
filed it whole for that reason (chain doc, link 2a-ii Taught).

**Reversal cost.** None; scope statement.

### FULL-AUTO RULING 2 — the stranding-warning drift is specced only as far as the analyst confirms it against the code; the drift record's own claim is not evidence

**Question.** `drift-commit-stranding-warning-not-rendered.md` was reported by
an adversary and never independently re-verified. May the change be authored
on it?

**Ruling.** Not on the record alone. The analyst verifies, with file:line,
whether anything on the system space view renders the commit response's
`strandingWarning`, and whether the response carries it at all on the served
type. Confirmed → it is in scope per RULING 1. Refuted → the drift record is
corrected and the clause is dropped from this change.

**Basis.** Precedence 1 — the drift record's own status line ("not yet
independently re-verified — the owning link's analyst should confirm before
specifying"); handoffs README, the 2026-09-02 note that a confident empirical
claim from a specialist is still a claim.

**Alternatives rejected.** Speccing from the record — a requirement written
against an unverified code claim.

**Reversal cost.** None.

---

## Ruling made after the analysis (2026-10-04)

### FULL-AUTO RULING 3 — the link splits at the order record: `surface-commit-stranding-warning` is built first as link 2a-iii, and `clear-burn-preview-on-commit` follows as link 2a-iii-b, `not authored`

**Question.** The analyst sizes the unsplit link at 40 tasks (39–41) before the
panel, with 2 ADDED and 3 MODIFIED requirements where the chain doc named one
MODIFIED and one "likely"
(`docs/handoffs/clear-burn-preview-on-commit-analysis.md` §§ 3, 7). The cap is
40 and each of the last three links' panels added tasks. Split now, or author
whole and split under review?

**Ruling.** Split now, at the analyst's seam (§ 7):

1. **`surface-commit-stranding-warning`** — link 2a-iii, authored and built in
   this run. The panel's commit callback to the view; the view's per-fleet
   record of the order it committed (identity from the commit response); the
   "still that fleet's running burn, as the own-fleets read last reported"
   determination with its gap rule; the view-level test harness over a real
   own-fleets read; and the commit's stranding notice as that record's first
   consumer. The quote keeps refreshing after a commit exactly as it does
   today; nothing live becomes false.
2. **`clear-burn-preview-on-commit`** — link 2a-iii-b, `not authored`, picked
   up by a fresh orchestrator after the first half archives. The fourth
   withheld state, the burn command's availability for a committed selection,
   the three MODIFIED blocks, and the journey the chain doc gives this link.
   Its questions (analysis § 8: Q1's product half N1, Q2, Q7, Q8) are **not
   ruled here**; the analysis and this ledger are its design input.

RULINGs 1 and 2 above carry to both halves. The first half's own rulings are in
`docs/handoffs/surface-commit-stranding-warning-rulings.md`.

**Basis.** Precedence 2 — workflow skill § Chains ("links are sized to 20–40
tasks; a link that grows past that under panel review is split before authoring
continues") and § Full-auto chains item 5 (split at the pre-identified or the
architect's seam; the second half's row goes in right after the first). The
chain's own precedent is `add-burn-cost-overlay` FULL-AUTO RULING 1, which split
at 37 before the panel for the same reason. The seam is clean for the reason
the analyst gives: the hard question B1 raised — when does a committed order
stop being the running one — lands first with a consumer whose failure mode is
a notice shown too long, not a blocked command; and adversary M5's ordering
objection is met, because the commit's own stranding notice exists before the
second half removes `preview-stranding` by clearing the quote. The second
half's state is `not authored` rather than the skill's `authored` for the
reason the chain doc records for 2a-ii: its deltas target `system-space-view`
text the first half's archive changes, so authoring it now would give it a
verdict born expired.

**Alternatives rejected.** (a) Author whole and bundle tasks to stay at 40 —
the counting the predecessor's adversary called out (m5). (b) Author whole and
split if the panel pushes it over — the round cap is counted across the whole
change, and the predecessor spent a round discovering its seam. (c) The clear
first, the notice second — ships a window in which a commit removes the only
stranding text on the view (M5).

**Reversal cost.** Two chain-doc rows; nothing built.

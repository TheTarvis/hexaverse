# Link 9 `delete-the-lattice` — orchestrator rulings on the five open questions

Ruled 2026-09-04 by the link-9 orchestrator, at HEAD `c74766f`, before the GO/TS
tracks start. The questions are stated in
`openspec/changes/delete-the-lattice/design.md:443-500` (§ *Open Questions*),
and the implementation contract's §4 *Preconditions* lists ruling them as an
orchestrator precondition.

Three of the five (OQ-3, OQ-4, OQ-5) are ruled **conservatively** — the branch
that neither expands this change's blast radius nor deletes an artifact of
Travis's. Each is surfaced in the final report as a decision Travis may
override in a follow-up; none of them blocks the deletion goal.

---

## OQ-1 — re-recording `fixtures/system/cases.json` on arm64

**Ruling: RECORD, under task 7.5's four-leg byte-identity matrix, with the
stop-and-report rule binding. The standing "never regenerate `backend/system`
fixtures on arm64" prohibition is DISSOLVED for this change.**

The prohibition named its cause: a 1-ULP FMA contraction divergence in
`backend/system/generator.go`. That cause is recorded as closed —
`docs/defects/2026-08-25-remaining-fma-sites.md` § *1.
`backend/system/generator.go:129,131,247,308` — feature richness — **RESOLVED
2026-08-29**`: the four fusible products carry explicit `float64(...)`
conversions, `backend/system` now emits zero arm64 `FMADDD`/`FMSUBD`, and the
generator's full output is already byte-identical between `GOARCH=arm64` and
`GOARCH=amd64 GOAMD64=v1`. An inherited rule is never re-derived by the agent
following it; this one is checked and it no longer holds.

The ruling is *record defensively*, not *record on trust*. Run all four legs
in `link9-impl-contract.md` §5 exactly as written — record on arm64, assert on
arm64, assert on `GOARCH=amd64 GOAMD64=v1`, then **re-record on amd64 and
`diff` the two `shasum`s**. Leg 4 is the one that matters and the one a
"record then run the suite twice" reading skips.

**Binding stop rule.** If leg 4's `diff` reports a difference, or either assert
leg fails: STOP, do not commit `fixtures/system/cases.json`, and report both
hashes and the failing case name to the orchestrator. Do not fall back to the
compile-only differential (contract §5 fallback 2) without reporting first —
that fallback is weaker than byte-identity and, if it is ever used, the commit
message and `_meta` must both say so in as many words.

Task 7.6's `_meta.generatedOn` / `_meta.serialization` must name **both**
targets the byte-for-byte check ran against.

## OQ-2 — the new name for `common.GameTuning.BoardRadius`

**Ruling: `MaxOrbitalIndex`, as the implementation contract §1.1 pins it.
CONFIRMED, not overridden.**

It satisfies Decision 5's constraint (no "board", no "ring"), it is the name
the contract's blast-radius analysis and task 4.1's site list were both written
against, and the value (16) does not change. Renaming it now would invalidate
a site list that four adversary rounds verified.

## OQ-3 — rename the three residual lattice-vocabulary requirement titles?

**Ruling: NO. Leave all three to a follow-up change. Decision 1's deferral
stands.**

The three are `Shared Board Math Is Pinned By a Cross-Language Golden Fixture`
(`cross-stack-determinism`), `Successful Spawn Hands Off to the Home Board`
(`session-wakeup`) and `Drill-In Navigation to the System Board`
(`galaxy-view`).

The mechanical blocker is genuinely gone — `6edb831` taught
`.claude/scripts/openspec-reconcile.py` to resolve `RENAMED` — so this is a
scope judgement, not a capability judgement, and it goes the conservative way
for two reasons. First, the titles are cosmetic: each requirement's *behaviour*
is already continuous-space correct, and the word "board" in a heading is not
a lattice dependency. Second, and decisively, a rename obliges repointing every
citation task 12.5b's repo-wide `grep -F -f /tmp/retired-titles.txt` sweep
finds — the sweep that already carries six confirmed repairs and whose whole
purpose is to catch citations nothing else surfaces. Growing that sweep's input
set at the end of a 100-task deletion, on titles that break nothing, trades a
real regression risk for a vocabulary preference.

Recorded as a follow-up in the final report. `galaxy-view` is not otherwise
touched by this change at all, which is a third reason to keep it out.

## OQ-4 — `docs/specs/0004-movement-board.md` and `0007-hex-board-view.md`

**Ruling: RECORD, DO NOT DECIDE. Task 9.4 stands exactly as written — it
records the state of both documents and asks; it does not mark either
`superseded`.**

The `docs/specs/` numbered series is Travis's own artifact and its supersession
policy is his to set, not the spec team's. `0004`'s two scenarios (S1, S2) are
additionally still *true* in continuous space and still cited by surviving
`backend/fleet` tests, so a `superseded` stamp would be actively wrong on the
document that most looks like it deserves one.

The developer executing 9.4 writes the record and stops. The question goes to
Travis in the final report.

## OQ-5 — the two lattice tethers under `frontend/app/spike/`

**Ruling: BOTH STAY, as a named and recorded exception under
`frontend/app/spike/`. Delete neither spike; migrate neither importer.
Task 6.3b's citation fixes proceed unchanged.**

This is the third branch design.md itself offers, and it is the right one:
deleting an experiment of Travis's is not an agent's call, and no change in
this chain owns `audio/`, `intel/` or `stealth/`. Verified at HEAD — both
tethers are live:

- `frontend/app/spike/hex-board/mock-system.ts` is imported by
  `frontend/app/spike/audio/synth.ts:20` (`hashSeed`, `type Character`) and
  `frontend/app/spike/audio/page.tsx:17` (`type Character`) — two non-lattice
  names in a lattice file.
- `frontend/app/spike/space-3d/` is imported from `frontend/lib/space/draw.ts`
  and `draw.contract.test.ts` as well as from within the spike tree, and it is
  the continuous-space PoC this whole chain came from — it is not lattice at
  all, only a lattice-era artifact the sweeps happen to reach.

Consequences the tracks must honour, all of which are the *already-written*
branch of their task:

- **Task 6.3b**: its unconditional half runs (the six comment rewrites in
  `spike/space-3d/` and `spike/hex-board/mock-system.ts:235`, plus
  `space-3d/sim.ts`'s citation of `backend/polar` / `frontend/lib/polar`, which
  fails the sweeps regardless of this ruling). Its conditional second half —
  the one gated on a "delete `space-3d`" ruling — **does not run**.
- **Task 8.9**: the site-18 clause takes its not-deleted branch.
- **Task 13.1**: the `space-kinematics` `## Purpose` edit removes the sentences
  naming `board-tactical-math`, `backend/board`, `backend/polar`,
  `frontend/lib/board` and `frontend/lib/polar` — and **leaves the `space-3d`
  carve-out sentence alone**, because *Every Rule-Bearing Value of This
  Capability Is Computed Only in the Authoritative Implementation* requires the
  exemption to name a surviving path, and after this ruling that path survives.
- **The whole-tree sweeps (§10)**: `frontend/app/spike/hex-board/` remains a
  standing, named exception to the lattice-deletion goal. It must be recorded
  as such wherever the sweep's allow-list lives, not silently tolerated — a
  tolerated hit and an accepted exception look identical in a grep and only one
  of them is a decision.

Surfaced to Travis in the final report as the one place link 9 does not
achieve total lattice deletion, with the two-line migration that would close it
(inline `hashSeed` and `type Character` into `audio/`, then delete
`hex-board/`) offered as a follow-up.

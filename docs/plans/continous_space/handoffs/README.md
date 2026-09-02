# Handoff notes — the continuous-space chain

Working records from the agent runs that authored and implemented the chain. Each
file is the *reasoning* behind a decision, preserved because the decision itself is
terse in `chain.md` and the spec, and because several of these findings cost real
investigation to reach.

They are dated working documents, not living specification. Where one disagrees with
`openspec/specs/`, the spec wins.

| File | What it holds |
| --- | --- |
| `link5-adversary-round1.md` | Link 5's first adversarial pass on the resumed change — 3 blockers, 7 majors, 4 minors — each with the orchestrator's binding ruling. The fail-closed jump ruling lives here. |
| `link5-adversary-round2.md` | Link 5's second pass: the findings the round-1 repairs themselves introduced. |
| `link6-rulings.md` | Link 6's seven original open questions (Q1–Q7) and their rulings, **plus the reversal of Q2** with its full reasoning. Read the reversal before anything else about belts. |
| `link6-panel-consolidated.md` | The four-reviewer panel (architect, DBA, security, UX) deduped into rulings R0–R8, with the list of findings the Q2 reversal dissolved outright. |
| `link6-adversary-r1.md` | Link 6's first adversarial pass — 3 blockers, 9 majors, 5 minors. BLOCKER 1 (seven vacuously-satisfied validation scenarios) is the one worth reading. |
| `link6-adversary-r2.md` | Link 6's second pass: 1 blocker, 3 majors, 2 minors, all inside the round-1 repairs. |
| `link7-rulings.md` | Link 7's ten adjudicated open questions, and the three structural findings that reshaped it — including two false premises in `decisions.md`. |
| `link7-panel-consolidated.md` | Link 7's reviewer panel, deduped. |
| `link7-adversary-r1.md` / `-r2.md` | Link 7's two adversarial passes. A4 (the refuel double-submit) is the one that turned out to be real in production, not just on paper. |
| `link7-impl-contract.md` | The implementation contract handed to link 7's developers. |
| `link8-rulings.md` | Link 8's twelve open questions and their rulings, **including the 8a/8b split** — read this before touching link 8's naming. |
| `link8a-panel-consolidated.md` | 8a's panel, deduped into H1–H7 with rulings. Its "Architect M1–M7 and L1–L5 accepted" line is the cautionary case in *Lesson three* below. |
| `drift-sell-double-submit.md` | Confirmed drift: the shipped sell control never had the guard its live requirement demands. Routed into 8a-2. |

## The one lesson these keep re-teaching

Five times now this chain has shipped a derivation that was built, unit-tested against
its own determinism, and **never called**: `fleet.GraphSource`, `EnsureLaneHorizon`,
`StationContinuousOrbit`, `disclosure.ScanMints`, and the focused scan's client half.
A sixth was nearly added by an orchestrator ruling (link 6's per-member belt lodes,
reversed for exactly this reason) and a seventh is pending (`stationkeep`'s upkeep, whose
verb does not exist).

The tell is always the same: a green suite proves the unit correct while nothing in
production reaches it. `openspec validate --strict` does not catch it, and neither does
an end-to-end test that constructs its own request.

## Lesson two — a green test is not evidence a requirement holds

The sibling of *built and never called* is **written and never really verified**: a
requirement exists, a test for it exists and passes, and the behaviour is still broken,
because the test is shaped so it cannot observe the failure. Three instances, all found
on 2026-09-02:

- `hooks/use-refuel.test.tsx` asserted the double-submit guard and passed against code
  that had no guard at all. Its harness held the mutation promise open by hand and
  waited for the disabled state *between* the two clicks — stepping around the render
  race that was the entire defect. The Playwright equivalent failed 4/4, never once
  passing. `commitSell` has the same hole and no such e2e, which is the only reason it
  is not also red.
- Link 7b's SDET found `A foreign fleet is indistinguishable from a nonexistent one
  (hold)` passing green against a route that **does not exist** — an unwired Gin route
  and a genuine foreign-corp rejection both return the same generic 404, so the
  assertion could never fail. Fixed with a `requireRouteImplemented` guard.
- The same SDET caught two tautological tests in its *own* red suite (one asserted the
  struct literal it had just built) only because it verified red-for-the-right-reason
  in a scratch copy with the missing symbols stubbed in.

The rule that falls out: when a requirement turns on real timing or real wiring, only a
test running against real timing or real wiring counts as coverage. And a test that has
never been observed to fail has not been shown to test anything.

## Lesson three — consolidation silently discards findings

`link8a-panel-consolidated.md` records "Architect M1–M7 and L1–L5" as accepted but spells
out only M3, M4 and M5. The individual reviewer reports were never written to disk, so
**nine findings were lost outright** — noticed only because the spec writer refused to
guess at them and said so.

A summary that names findings it does not restate is not a record of them. Either persist
each reviewer's own report, or restate every accepted finding in full. The recovery, when
this happens, is to re-run the reviewer against the *current* artifact rather than try to
reconstruct what was said about an artifact that has since changed.


## Measured 2026-09-02 — what the archiver actually does with a dropped scenario

The standing belief in this project's notes is that a MODIFIED block missing a live
scenario heading gets **silently dropped**, and that `--strict` does not catch it. Half
of that is right. Measured on a scratch copy, with `build-production-space-view`'s
`system-interior` block deliberately omitting two live scenarios:

```
$ openspec validate build-production-space-view --strict
Change 'build-production-space-view' is valid

$ openspec archive build-production-space-view --yes
system-interior MODIFIED failed for header "### Requirement: Interior Read Endpoint"
 - current spec contains scenario(s) not present in the modified block:
   "Pre-existing wire fields are unchanged", "The lattice orbit key keeps its
   lattice meaning". Refresh the change spec before archiving to avoid dropping
   scenarios.
Aborted. No files were changed.
```

So: **`--strict` does not catch it, but the archiver does, and it fails loudly and
safely** — it names both scenarios and changes nothing. This is not a silent-corruption
trap; it is a late-firing gate. The practical consequences:

1. A change can sit `--strict`-valid for days and still be unarchivable. Validation is
   not evidence a change can land.
2. The failure surfaces at the worst moment — archive time, at the end of implementation
   — so it is worth detecting early. `.claude/scripts/openspec-reconcile.py` (written this run) parses
   MODIFIED blocks and reports exactly what the archiver will refuse, at any time.
   Run it with no arguments to check every active change; it exits non-zero.
3. Because the archiver aborts atomically, a failed archive costs nothing. **Rehearsing
   on a copy is still the right habit**, but for the *other* traps — a capability that
   cannot be retired via REMOVED deltas, and dangling cross-references — not for this one.

An architect review this same day reported this as "fails `--strict`" and quoted a
validator error that does not reproduce. The conclusion was right and the mechanism was
invented. Both halves are worth remembering: a confident empirical claim from a
specialist is still a claim, and the fix it proposes can be correct even when its
reasoning is not.

## Lesson four — retiring a capability trades a hard gate for a manual one

To make `build-production-space-view` archivable, its `system-interior` block was
restructured from `MODIFIED` to `REMOVED` + `ADDED`. That was the right fix — the archiver
refuses a MODIFIED block that omits a live scenario — but it has a cost nobody stated at
the time:

**The archiver's scenario check only protects MODIFIED blocks.** A requirement re-ADDed
under a *new* capability is invisible to it, and `.claude/scripts/openspec-reconcile.py`
inherits the same blind spot. So the moment a capability is retired and its requirements
re-expressed elsewhere, the guarantee that nothing is silently dropped stops being
mechanical and becomes a promise in a proposal.

The promise did not hold. A mechanical diff of all 31 requirements 8a-2 re-ADDs from
retired `board-view`, against their live originals, found **six** load-bearing losses:

- a selected point's visible mark (found by review; a point in vacuum, unlike a lattice
  cell, has no intrinsic outline, so an implementer could ship an invisible selection and
  satisfy every scenario)
- the camera's pan clamp — a SHALL whose only scenario was dropped
- keyboard pan entirely, while two other requirements still cited an "orbit/pan/zoom"
  affordance, and the keyboard point-selection control reads the pan target
- pinch zoom keeping the centred point fixed
- the tap/pan threshold's exactly-at-boundary case
- **a carve-out no reviewer flagged**: `board-view`'s "a gate-aware lookup used only to
  present a selected gate's facts is not a kind-specific branch". Without it the re-ADDed
  requirement forbids what the same requirement mandates.

Five of the six were found by adversarial review; the sixth only by the diff.

**The rule:** whenever a capability is retired and re-expressed, diff every re-ADDed
requirement's body and scenario list against its live original, mechanically, and re-run
that diff before archive whenever a re-ADDed requirement is edited. `--strict` passing,
`reconcile` passing, and an archive rehearsal succeeding all remain true while substance
is quietly missing. **Link 9 (`delete-the-lattice`) retires capabilities too — this
applies there.**

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

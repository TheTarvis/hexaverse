# Link 9 `delete-the-lattice` — archive rehearsal (section 12)

Run 2026-09-04 by the orchestrator at `a8affca`, on a scratch copy of `openspec/`.
This is the rehearsal this repo's *Lesson four* exists for: `openspec archive`
refuses a MODIFIED block missing a live scenario heading, and a capability cannot
be retired through `REMOVED` deltas at all. `--strict` catches neither.

## Result: the archive is safe to run for real

| Task | Result |
| --- | --- |
| 12.1 | All five predecessors already archived; `openspec/changes/` holds only `archive/` and this change; `openspec/specs/board-view/` absent. The copy needed no pre-archiving — the live tree is the tree this change meets. |
| 12.2 | `openspec archive delete-the-lattice --yes` **succeeded** with no `board-tactical-math` delta directory present. Totals: **+6, ~17, -11**. No refusal, no dropped-heading error. |
| 12.3 | All three content checks pass. `system-interior` carries *Interior Generation Is Lazy and Deterministic* and **not** *Lazy, Deterministic Interior Generation*; zero occurrences of `slot count`, `clampRing`, ``lattice `Dir` ``. `trading-station` carries *Station Is a Dockable, Non-Mineable Body*, zero *Board Feature*. `cross-stack-determinism` carries *Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family*, zero *Square Roots In Rules Are Pinned, Not Assumed*. |
| 12.4 | After `rm -rf openspec/specs/board-tactical-math`, exactly **one** citation remains: `openspec/specs/space-kinematics/spec.md:15`. **This is task 13.1's target** — the Purpose sentence naming `board-tactical-math` as "the lattice every shipped consumer actually uses". The rehearsal proves 13.1 is both necessary and sufficient, and that its ordering (Purpose edits *before* the directory grep) is right. |
| 12.5a | One hit, and it is a **false positive**: `system-interior/spec.md:946` `### Requirement: Continuous Orbital Radii Ascend With the Skeleton Ordinal and Are Separated`. The retired title *Orbital Radii Ascend With the Skeleton Ordinal and Are Separated* is a strict **substring** of its own live successor, so `grep -F` matches the successor's heading. Not a dangling citation. No repair. |
| — | `openspec validate --specs --strict` on the rebuilt tree: **31 passed, 0 failed**. `openspec list --specs` no longer lists `board-tactical-math`. |

## 12.5b — deliberately left unchecked until after the real archive

Measured against the real repo at `a8affca`: **zero** code or test citations of any
retired title. Every remaining hit is in one of two places, both of which the archive
itself clears:

- `openspec/specs/**` (44 lines) — the live specs the archive rewrites, plus
  `board-tactical-math`'s own spec, which task 13.3 hand-deletes.
- `openspec/changes/delete-the-lattice/**` — the change's own `design.md`
  supersession map and `tasks.md`, which **must** quote retired titles to do their
  job, and which move under the already-excluded `openspec/changes/archive/` on
  archive.

So 12.5b cannot pass before the archive, by construction. Task 13.3 re-runs it against
the real tree, which is where it is a real gate. Left unchecked here rather than ticked
on a technicality — the same discipline the developers applied to tasks 2.3 and 4.3,
whose verification greps only cleared at a later step.

## The one thing a future link should copy

The rehearsal is cheap (a `cp -R`, four commands) and it converted two would-be
archive-time surprises into known, sequenced work before anything irreversible ran.
Both "failures" the acceptance harness reports at this point — leg 10.1 and leg 12.5b —
are pre-archive states with a documented mechanism, not residue; each was measured to
confirm the remainder lives only where the archive reaches.

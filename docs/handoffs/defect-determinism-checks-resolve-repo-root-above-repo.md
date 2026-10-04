# Defect — two tier-0 determinism checks resolve the repo root one directory too high, so they fail (and their anti-mirror legs pass vacuously)

**Status:** OPEN, harness, pre-existing. **Found:** 2026-10-04 during
`fix-burn-order-geometry-refusals`' integrity check; reproduced by the orchestrator outside any
sandbox. **Not fixed there:** `harness/` is outside that change's Impact. **Whose call:** Travis's
(the `harness/` move is his in-flight branch work).

## Evidence

`python3 .claude/skills/code-quality-checks/check.py --files-only` reports:

```
FAIL: deviation register not found at fixtures/determinism-register.json     (Determinism Cross-Target: FMA-contraction)
FAIL: market mirror map not found at fixtures/market/mirror-map.json         (Determinism Mirror Map)
space (anti-mirror): frontend/lib/space does not exist — ... passes trivially.
```

Both files exist and are tracked. `harness/check-mirror-map.sh:59` computes
`REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, which was right when the
script lived at `.claude/scripts/` and is one level too high now that the real directory is
`harness/` (it resolves to the PARENT of the repo). `harness/check-fma-contraction.sh` fails the
same way.

## Consequences

- `/check` cannot be fully green on any tree, whatever the change under gate.
- Worse than the red: every `anti_mirror` leg tests `frontend/lib/<pkg>` under the wrong root,
  finds no directory, and "passes trivially" — so the rule that `backend/space` has no
  TypeScript mirror is currently unenforced by this gate.
- The native and amd64 space/system/galaxy fixture suites in the same run DO execute and pass;
  only the two script legs are affected.

## What would make this stale

`REPO_ROOT` in both scripts resolving to the repository (one `..`, or `git rev-parse
--show-toplevel`), and a `/check` run in which the anti-mirror legs name real directories.

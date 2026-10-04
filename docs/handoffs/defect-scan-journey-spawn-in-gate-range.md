# Defect — `scan-journey.spec.ts` asserts a fresh spawn has no focused-scan target in range, and a random spawn can land in range of a lane gate

**Status:** open, unfiled before 2026-10-04. Test-fixture assumption on a random spawn — the same family as `defect-spawn-system-single-body.md`, a different signature.
**Found:** 2026-10-04, `clear-burn-preview-on-commit`'s archive-gate rerun (tier 4, 16:55–17:03 EDT). Evidence and attribution: `clear-burn-preview-on-commit-journey.md`, section "Gate rerun — tier 4".
**Whose call:** Travis — it waits on the same tier-4 random-spawn fixture policy as `defect-spawn-system-single-body.md` and `defect-station-order-500.md`.

## Signature

`frontend/e2e/tests/scan-journey.spec.ts:332`, failing at `:401`:

```
expect(received).toHaveLength(expected)
Expected length: 0
Received length: 1
Received array:  [{"durationMs": 4742, "hostId": "gate-sys_7_-10", "kind": "body"}]
```

`GET …/scan-targets` answered 200 with that one target for a freshly spawned
fleet (`fleet_7a8cf365`) that had made **zero** POST requests — before any
burn, mine or scan. The spawn site happened to lie in focused-scan range of a
lane gate.

## Why it is not the change under the gate

Backend diff empty (`git diff 987ba60 -- backend`); the change's frontend diff
is inert with no committed order; the spec passed in the same gate's first run
(13:43) on the same production code.

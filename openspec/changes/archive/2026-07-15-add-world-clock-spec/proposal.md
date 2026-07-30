## Why

A prior OpenSpec retrofit pass baselined 11 capabilities from the running
code, but `backend/common/worldtime.go` — the injectable simulation clock
every kinematic capability cites ("frozen ETA", "at world time",
`WorldMillis` stamps) — was never itself baselined. It is small but
foundational: every domain that stores a timestamp (`action-dispatch`,
`fleet-movement`, `observation-fog-and-scan`) depends on its contract
holding, so the contract belongs in its own capability rather than being
re-described piecemeal by its consumers.

## What Changes

- Add a new `world-clock` capability documenting the current, as-built
  behavior of `backend/common/worldtime.go`: the scaled world-time formula,
  the `WorldMillis` type, the process-wide singleton, and the injectable
  interface tests use.
- No code changes — this is a documentation-only baseline (retrofit), like
  the 11 capabilities already in `openspec/specs/`.

## Impact

- Affected specs: `world-clock` (new)
- Affected code: `backend/common/worldtime.go` (read-only; no changes)

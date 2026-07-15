## 1. Spec authoring

- [x] 1.1 Confirm `backend/common/worldtime.go` behavior against each
      requirement below (scaled formula, non-positive-scale guard, fixed
      epoch, singleton, injectability) — no code changes expected. Confirmed
      against source (`worldtime.go`, `worldtime_test.go`,
      `config/config.go`) during specialist-panel review.
- [x] 1.2 Cross-check `action-dispatch`, `board-tactical-math`, `fleet-movement`,
      `fleet-roster`, `galaxy-generation`, `system-interior`,
      `hex-board-view`, and `observation-fog-and-scan` specs' references to
      "world time" / `WorldMillis` are consistent with this baseline; file a
      follow-up if any drift is found. Grepped all `openspec/specs/*/spec.md`
      during review — no drift found, no follow-up needed.
- [x] 1.3 Grep the galaxy, system, board, fleet, action, observation, and
      corporations domains for bare `time.Now()` to verify the "Simulation
      domains read only the world clock" scenario (Scaled World Time). Zero
      bare `time.Now()` found in those domains; the only non-test
      `time.Now()` sites are account audit, Pub/Sub event envelope,
      secret_manager, rate limiter, and SSE heartbeat — all covered by the
      "Administrative timestamps are wall-clock by design" scenario.
- [x] 1.4 Confirm design.md's cross-references into `specs/world-clock/spec.md`
      (the rolling-deploy / concurrent-instance scale scenario) resolve to
      an actual scenario, not a dangling reference.

## 2. Validation

- [x] 2.1 `openspec validate add-world-clock-spec --strict` — passes.

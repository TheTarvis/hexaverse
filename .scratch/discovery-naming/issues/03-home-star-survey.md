# 03: Survey the home star to unlock naming eligibility

**What to build:** A corporation can command a fleet to survey its home star, follow progress, and earn a durable naming entitlement after a valid completion. The fleet may move while surveying, provided it stays in range throughout the attempt.

**Blocked by:** 02: Establish home ownership and protected-place rules.

**Status:** resolved

- [x] Survey is a distinct action using the existing commit/resolver infrastructure, not a reinterpretation of focused Scan or the reserved chart-survey tier. Authenticated ownership, current system, target eligibility, and valid geometry are checked authoritatively.
- [x] Survey initially uses the existing focused-scan range of 48 continuous-space units and a configurable duration of 30,000 world milliseconds. Docking and new equipment are unnecessary; star approach respects collision and clearance geometry.
- [x] Survey occupies the sensor channel, contends with Scan, and leaves the movement channel available. Every terminal outcome releases the sensor slot.
- [x] Canonical Go geometry and existing trajectory/action transitions enforce range for the entire committed interval. Movement within range succeeds; departure and return before ETA cancels. Transit, system departure, and an unresolvable target cannot yield successful completion. No per-tick accumulation or single midpoint substitute is introduced.
- [x] Successful owner completion unlocks the existing home-star naming entitlement without changing ownership. Entitlement persists independently of fleet presence; completion does not force an immediate naming interruption.
- [x] Controls preserve the distinction between command fleet and inspected object and show prerequisites, range, duration, ETA/progress, completion, cancellation reasons, and unlocked eligibility.
- [x] Existing router/emulator and frontend interaction seams cover boundary geometry, full-interval departure/return, channel independence and contention, terminal slot release, offline settlement, and idempotent retries. Use injected world time or established time-skip fixtures, never a real 30-second sleep.

## Comments

Implemented in `80a2a4b`, with review fixes in `c1f51ed` and `a2227f3`. Added a sensor-channel survey with configurable world-time duration, canonical full-interval range checks, movement independence, durable eligibility, and progress/outcome controls. Router journeys cover range boundaries, departure/return, curved excursions, and valid movement; focused UI checks pass.

Standards and spec reviews are clear. Go vet, TypeScript, and ESLint checks pass.

Final verification: the full backend suite passed (2,031 tests, one expected fixture-regeneration skip). The full frontend run passed 2,220 tests and failed only the formatting guard for pre-existing HUD prototype `.toFixed` calls. A separate full run encountered an intermittent scan timing assertion; all 11 tests in that file passed on isolated rerun. Discovery-focused UI checks pass.

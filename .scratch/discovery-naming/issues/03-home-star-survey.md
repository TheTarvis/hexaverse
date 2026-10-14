# 03: Survey the home star to unlock naming eligibility

**What to build:** A corporation can command a fleet to survey its home star, follow progress, and earn a durable naming entitlement after a valid completion. The fleet may move while surveying, provided it stays in range throughout the attempt.

**Blocked by:** 02: Establish home ownership and protected-place rules.

**Status:** ready-for-agent

- [ ] Survey is a distinct action using the existing commit/resolver infrastructure, not a reinterpretation of focused Scan or the reserved chart-survey tier. Authenticated ownership, current system, target eligibility, and valid geometry are checked authoritatively.
- [ ] Survey initially uses the existing focused-scan range of 48 continuous-space units and a configurable duration of 30,000 world milliseconds. Docking and new equipment are unnecessary; star approach respects collision and clearance geometry.
- [ ] Survey occupies the sensor channel, contends with Scan, and leaves the movement channel available. Every terminal outcome releases the sensor slot.
- [ ] Canonical Go geometry and existing trajectory/action transitions enforce range for the entire committed interval. Movement within range succeeds; departure and return before ETA cancels. Transit, system departure, and an unresolvable target cannot yield successful completion. No per-tick accumulation or single midpoint substitute is introduced.
- [ ] Successful owner completion unlocks the existing home-star naming entitlement without changing ownership. Entitlement persists independently of fleet presence; completion does not force an immediate naming interruption.
- [ ] Controls preserve the distinction between command fleet and inspected object and show prerequisites, range, duration, ETA/progress, completion, cancellation reasons, and unlocked eligibility.
- [ ] Existing router/emulator and frontend interaction seams cover boundary geometry, full-interval departure/return, channel independence and contention, terminal slot release, offline settlement, and idempotent retries. Use injected world time or established time-skip fixtures, never a real 30-second sleep.

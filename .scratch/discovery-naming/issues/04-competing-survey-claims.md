# 04: Award independent claims through competing surveys

**What to build:** Explorers can survey eligible unowned stars, planets, and moons to win independent corporate claims and lasting first-survey credit. Competing attempts produce an authoritative, understandable result even when actions settle after players have been offline.

**Blocked by:** 03: Survey the home star to unlock naming eligibility.

**Status:** resolved

- [x] Survey targets include stars, rocky planets, gas giants, ice planets, and moons. Stations, belts and belt members, gates, anomalies, hazards, and other excluded feature kinds receive no new claim or player-naming mechanics.
- [x] First valid completion atomically awards an unclaimed eligible target, records corporation identity and world time, and grants a durable naming entitlement. A planet or moon survey records first-survey discovery without implying it was previously invisible.
- [x] Earlier valid completion wins regardless of action read/settlement order after an offline interval. Exact completion ties use a stable deterministic ordering; concurrent attempts yield one winner.
- [x] Cancelled or invalid earlier attempts cannot win. Repeated settlement and retries cannot duplicate or overwrite ownership, discovery credit, or entitlement.
- [x] Later surveys preserve existing claims and original attribution, grant no foreign naming rights, and report an understandable already-owned or losing outcome. The existing home-star owner can still unlock its own entitlement.
- [x] Star, planet, and moon claims are independent. A corporation can claim a planet within another corporation's star claim; ownership introduces no exclusion or economic permissions.
- [x] Existing inspection and Survey controls show claim outcomes, owner, first-survey attribution, and viewer naming eligibility while preserving visibility and command-fleet behavior.
- [x] Production-router/emulator tests race corporations, vary overdue resolution order, exercise exact ties and cancelled contenders, and verify idempotency, protected targets, home ownership, and independent body claims using existing fixtures and cleanup.

## Comments

Implemented in `80a2a4b`, with review fixes in `c1f51ed` and `a2227f3`. Survey settlement atomically awards independent claims using completion time and a stable action tie-break, including overdue contenders. Router journeys cover reversed resolution order, exact ties, cancelled contenders, repeated settlement, and independent ownership.

Standards and spec reviews are clear. Go vet, TypeScript, and ESLint checks pass.

Final verification: the full backend suite passed (2,031 tests, one expected fixture-regeneration skip). The full frontend run passed 2,220 tests and failed only the formatting guard for pre-existing HUD prototype `.toFixed` calls. A separate full run encountered an intermittent scan timing assertion; all 11 tests in that file passed on isolated rerun. Discovery-focused UI checks pass.

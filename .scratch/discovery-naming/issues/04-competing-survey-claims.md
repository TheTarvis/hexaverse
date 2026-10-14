# 04: Award independent claims through competing surveys

**What to build:** Explorers can survey eligible unowned stars, planets, and moons to win independent corporate claims and lasting first-survey credit. Competing attempts produce an authoritative, understandable result even when actions settle after players have been offline.

**Blocked by:** 03: Survey the home star to unlock naming eligibility.

**Status:** ready-for-agent

- [ ] Survey targets include stars, rocky planets, gas giants, ice planets, and moons. Stations, belts and belt members, gates, anomalies, hazards, and other excluded feature kinds receive no new claim or player-naming mechanics.
- [ ] First valid completion atomically awards an unclaimed eligible target, records corporation identity and world time, and grants a durable naming entitlement. A planet or moon survey records first-survey discovery without implying it was previously invisible.
- [ ] Earlier valid completion wins regardless of action read/settlement order after an offline interval. Exact completion ties use a stable deterministic ordering; concurrent attempts yield one winner.
- [ ] Cancelled or invalid earlier attempts cannot win. Repeated settlement and retries cannot duplicate or overwrite ownership, discovery credit, or entitlement.
- [ ] Later surveys preserve existing claims and original attribution, grant no foreign naming rights, and report an understandable already-owned or losing outcome. The existing home-star owner can still unlock its own entitlement.
- [ ] Star, planet, and moon claims are independent. A corporation can claim a planet within another corporation's star claim; ownership introduces no exclusion or economic permissions.
- [ ] Existing inspection and Survey controls show claim outcomes, owner, first-survey attribution, and viewer naming eligibility while preserving visibility and command-fleet behavior.
- [ ] Production-router/emulator tests race corporations, vary overdue resolution order, exercise exact ties and cancelled contenders, and verify idempotency, protected targets, home ownership, and independent body claims using existing fixtures and cleanup.

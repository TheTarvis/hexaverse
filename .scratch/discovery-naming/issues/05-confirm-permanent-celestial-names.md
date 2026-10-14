# 05: Preview and confirm a permanent celestial name remotely

**What to build:** An entitled corporation can choose a surveyed star, planet, or moon's public name from anywhere, preview it, and explicitly confirm the permanent choice. Validation failures leave the earned right available, and everyone sees the same successful result.

**Blocked by:** 04: Award independent claims through competing surveys.

**Status:** ready-for-agent

- [ ] Authenticated submission binds the corporation to immutable target identity and checks its earned entitlement. Fleet or station presence is unnecessary; unauthorized callers cannot supply ownership or discovery authority.
- [ ] UI requires preview and explicit confirmation, provides actionable validation/conflict feedback, and presents the locked state after success. Generated names remain visible until confirmation succeeds; unused rights never expire.
- [ ] Server validation permits 3–40 characters using Latin letters, numbers, spaces, apostrophes, and hyphens, normalizes surrounding/repeated spacing, and applies case-insensitive uniqueness with conservative canonicalization.
- [ ] A curated local prohibited-term list conservatively rejects obvious profanity, slurs, and impersonation of reserved game labels. Innocent substring examples remain accepted; routine LLM checks and moderation tooling are outside scope.
- [ ] Star names are atomically unique across the live galaxy; body names are atomically unique within a system, accounting for generated and station names. Identical body names remain legal in different systems. Concurrent conflicts preserve the losing corporation's entitlement.
- [ ] First successful confirmation locks further voluntary renaming. Identical request retries can acknowledge the committed result without reopening naming; competing requests for the same target cannot produce two successful choices.
- [ ] Renaming a star updates galaxy and system projections as one shared name, preserves identity and catalogue reference, and does not regenerate planet or moon names. Original generated names, discovery credit, first-player-name provenance, and current owner remain separately preserved.
- [ ] Existing router/emulator journeys cover remote authorization, confirmation, locks, rejected-name retries, identical retries, target/name races, and reads by different corporations. Focused validation and frontend interaction tests cover rules, preview, errors, and locked presentation; reuse existing browser infrastructure if a smoke check is needed.

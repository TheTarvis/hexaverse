# 06: Record first system arrival separately from survey claims

**What to build:** Players can inspect lasting credit for the corporation that first reached a system, independently of who later claims its star or chooses its name.

**Blocked by:** 01: Persist readable astronomical names and catalogue references.

**Status:** resolved

- [x] Actual fleet arrival authoritatively records the first corporation and server world time against stable system identity through existing arrival/spawn responsibilities, including initial home placement where applicable.
- [x] Opening a map, reading an interior, or materializing procedural objects never creates arrival attribution.
- [x] Repeated arrival resolution, retries, reconnects, and later visitors preserve the original attribution. Competing arrivals produce one stable authoritative first-arrival record.
- [x] Existing inspection projections and UI show first-arrival attribution as a historical fact. It grants neither ownership nor naming entitlement and never serves as live fleet disclosure authority.
- [x] Attribution remains independent of survey and naming state, so a later survey winner cannot replace the corporation that arrived first. This ticket does not require the claim flow to exist before arrival credit can be demonstrated.
- [x] Existing authenticated router/emulator fixtures verify actual arrival versus read-only materialization, first-credit preservation, retry safety, and public inspection without revealing foreign fleets. Register and clean up new state through the existing lifecycle.

## Comments

Implemented in `80a2a4b`, with review fixes in `c1f51ed` and `a2227f3`. Recorded first arrival through the discovery authority from actual spawn/jump transactions, separately from survey claims and naming rights. Public projections preserve historical credit; the cross-corporation arrival/claim router journey passes.

Standards and spec reviews are clear. Go vet, TypeScript, and ESLint checks pass.

Final verification: the full backend suite passed (2,031 tests, one expected fixture-regeneration skip). The full frontend run passed 2,220 tests and failed only the formatting guard for pre-existing HUD prototype `.toFixed` calls. A separate full run encountered an intermittent scan timing assertion; all 11 tests in that file passed on isolated rerun. Discovery-focused UI checks pass.

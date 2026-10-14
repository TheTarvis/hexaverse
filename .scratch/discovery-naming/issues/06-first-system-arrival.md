# 06: Record first system arrival separately from survey claims

**What to build:** Players can inspect lasting credit for the corporation that first reached a system, independently of who later claims its star or chooses its name.

**Blocked by:** 01: Persist readable astronomical names and catalogue references.

**Status:** ready-for-agent

- [ ] Actual fleet arrival authoritatively records the first corporation and server world time against stable system identity through existing arrival/spawn responsibilities, including initial home placement where applicable.
- [ ] Opening a map, reading an interior, or materializing procedural objects never creates arrival attribution.
- [ ] Repeated arrival resolution, retries, reconnects, and later visitors preserve the original attribution. Competing arrivals produce one stable authoritative first-arrival record.
- [ ] Existing inspection projections and UI show first-arrival attribution as a historical fact. It grants neither ownership nor naming entitlement and never serves as live fleet disclosure authority.
- [ ] Attribution remains independent of survey and naming state, so a later survey winner cannot replace the corporation that arrived first. This ticket does not require the claim flow to exist before arrival credit can be demonstrated.
- [ ] Existing authenticated router/emulator fixtures verify actual arrival versus read-only materialization, first-credit preservation, retry safety, and public inspection without revealing foreign fleets. Register and clean up new state through the existing lifecycle.

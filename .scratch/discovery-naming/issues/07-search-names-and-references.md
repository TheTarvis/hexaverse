# 07: Search places by current name or permanent reference

**What to build:** Players can find destinations through existing object-search surfaces using either the current public name or a permanent catalogue reference, with enough context to distinguish repeated body names across systems.

**Blocked by:** 05: Preview and confirm a permanent celestial name remotely.

**Status:** resolved

- [x] Existing available object-search surfaces accept current display names and permanent catalogue references using authoritative server names and stable identity-based selection/navigation.
- [x] A renamed destination remains findable by its unchanged catalogue reference. Search results use the new public name consistently with map and interior projections; no generated-name alias search is required.
- [x] Body results include their enclosing star and catalogue reference so identical body names in different systems remain distinguishable. A star rename updates that enclosing-star context consistently.
- [x] Search respects existing read visibility and corporation filtering and does not broaden celestial disclosure or expose foreign fleets through historical claim/discovery records.
- [x] Existing backend and frontend seams verify reference lookup after naming, shared results across authorized viewers, repeated body names in different systems, and selection/navigation to the correct immutable target.

## Comments

Implemented in `80a2a4b`, with review fixes in `c1f51ed` and `a2227f3`. Object search matches authoritative current names and permanent catalogue references while selection retains immutable identity. Body results include the enclosing star and reference; focused object-index tests pass.

Standards and spec reviews are clear. Go vet, TypeScript, and ESLint checks pass.

Final verification: the full backend suite passed (2,031 tests, one expected fixture-regeneration skip). The full frontend run passed 2,220 tests and failed only the formatting guard for pre-existing HUD prototype `.toFixed` calls. A separate full run encountered an intermittent scan timing assertion; all 11 tests in that file passed on isolated rerun. Discovery-focused UI checks pass.

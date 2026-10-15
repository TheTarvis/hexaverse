# 01: Persist readable astronomical names and catalogue references

**What to build:** Players see memorable, stable names for places throughout the galaxy and system views, with permanent readable catalogue references that survive later naming. Use the approved discovery-naming spec as the behavioral contract; no migrations or legacy fallbacks are required.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Stars receive pronounceable invented names, planets receive evocative names from a system theme, and moons draw from their parent's theme. Other object kinds receive readable labels or catalogue designations rather than primary raw-ID labels.
- [x] Generated names are persisted at creation, preserve their original provenance, and remain unchanged by later generator improvements. Generation uses curated families and constrained syllables without an LLM.
- [x] The same seed and stable identity produce the same initial names regardless of materialization order. Star names are unique across the lazily materialized galaxy using stable identity-derived disambiguation; body names are unique within a system.
- [x] Permanent catalogue references derive from durable galaxy/system/body identities and stable relationships, independently of mutable names or UI ordering. IDs, persistence keys, action targets, and routes remain identity-based.
- [x] The star supplies the single authoritative system display name. Galaxy map, system object list, selected-object panel, scene labels, navigation destinations, and existing search-result labels use shared server names. Inspection exposes catalogue references.
- [x] Existing visibility and corporation filtering remain effective; public celestial names do not disclose foreign fleets or create new celestial visibility rules.
- [x] Representative generator tests verify determinism, order independence, persistence, theme relationships, and disambiguation without pinning exact word dictionaries. Public-read and focused UI checks verify names and references through existing seams.

## Comments

Implemented in `80a2a4b`, with review fixes in `c1f51ed` and `a2227f3`. Persisted deterministic readable names and permanent catalogue references, with shared display names across galaxy, system, navigation, scene, and inspection projections. Generator, public-router, scene-label, and object-index checks pass.

Standards and spec reviews are clear. Go vet, TypeScript, and ESLint checks pass.

Final verification: the full backend suite passed (2,031 tests, one expected fixture-regeneration skip). The full frontend run passed 2,220 tests and failed only the formatting guard for pre-existing HUD prototype `.toFixed` calls. A separate full run encountered an intermittent scan timing assertion; all 11 tests in that file passed on isolated rerun. Discovery-focused UI checks pass.

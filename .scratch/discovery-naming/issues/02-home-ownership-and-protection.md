# 02: Establish home ownership and protected-place rules

**What to build:** A corporation begins with an owned home star and station, can inspect that ownership, and understands why its star still requires a survey before naming. Home planets and moons remain available for individual exploration claims.

**Blocked by:** 01: Persist readable astronomical names and catalogue references.

**Status:** ready-for-agent

- [ ] Authenticated spawn assigns the home star/system and station to the corporation without claiming planets or moons. The star claim confers display and naming authority only, with no new movement, docking, mining, market, or territorial restrictions.
- [ ] The station receives the fixed label `<Corp Name> Station`. There is no station-name submission control, and the celestial 3–40 character submission limit does not constrain this constructed label.
- [ ] If a generated celestial name conflicts with the required station label, the generated name is disambiguated before publishing the home state. The assigned station label remains fixed after spawn.
- [ ] Spawn retries preserve ownership, station naming, and previously chosen celestial names rather than issuing competing grants.
- [ ] Explicit server-owned protection preserves established inhabited-place names and prevents first-survey naming there. Protection is not inferred from name spelling, and no new populated-place generation is introduced.
- [ ] Ownership, original generated name, discovery attribution, and naming entitlement are distinct authoritative facts exposed through existing authenticated read projections. The home star's naming entitlement stays locked pending its owner's survey; foreign surveys cannot acquire it.
- [ ] Claims and naming use one cohesive authority through existing services and service-owned DAOs. New persistence/index registration and test-data cleanup are included as ordinary implementation work.
- [ ] Production-router/emulator coverage verifies spawn, retry safety, protection, unclaimed home bodies, and read projections. Inspection shows ownership and the remaining survey requirement without offering station editing.

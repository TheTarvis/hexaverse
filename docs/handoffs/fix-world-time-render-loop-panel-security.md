# Panel report — security (`fix-world-time-render-loop`)

**Verdict: SECURITY-CLEAR.** No findings at any severity. The orchestrator's assessment holds: this change has no security surface.

## What I checked, and why each is clean

**1. The disclosure-relocation question (Decision 3) — clean, with evidence.**
The concern was whether splitting rendered marks between a coarse React render (membership) and the per-frame loop (position) moves a fog-of-war decision client-side. It does not, for three independent reasons:

- `buildSceneModel` performs no visibility filtering at all today, and the contract says so explicitly. `/Users/travis/Projects/hexaverse/frontend/components/space/space-scene.ts:196-202` documents `SceneInput.sightings` as *"ALREADY filtered server-side to the open system … This function performs NO systemId filtering of its own — it draws whatever it is handed, exactly as it does for every other mark class"*, and `space-scene.ts:455` repeats it at the sighting loop (*"NO filtering here (the caller's job)"*). There is no client-side fog predicate to relocate — the server-filtered read *is* the scene input, both before and after this change.
- The change moves the **call site** of a pure function, not its inputs. Per design.md Decision 3, `SystemSpaceView` hands the stage the same inputs (interior, fleets here, selection, sightings) by ref; `draw()` calls `buildSceneModel({...inputs, worldTimeMs: clock.now()})`. Identical inputs, identical function, identical projected time value (`projectWorldTime` moves verbatim per task 3.1). Nothing new reaches the client.
- The split is asymmetric in the safe direction. Membership is computed at the **coarse** (1 Hz, strictly staler) cadence; the per-frame path only re-solves positions of marks already in the server-disclosed set. A stale membership set can lag a disclosure, never anticipate one.

**2. Per-frame extrapolation of foreign entities — checked, unchanged and already bounded.**
The one shape that could over-disclose is animating another corp's position forward from a frozen record. It does not happen: sighting ghosts draw at `record.position` with *"NO velocity integration (the stored velocity is carried on the mark for DISPLAY only)"* (`space-scene.ts:451-454`), and contact marks likewise take `contact.position` as given — `worldTimeMs` is threaded only through body orbital elements and own-fleet burn/drift solves (`space-scene.ts:248-625`, all thirteen uses reviewed). The live-coverage geometry the server chooses to serve live is server-side policy (`observation` fog filter), untouched here.

**3. Token / session / server-only values through the deleted and new modules — none.**
`/Users/travis/Projects/hexaverse/frontend/hooks/use-world-time.ts` (78 lines, the file being deleted) carries only `WorldAnchor {world, wall}`, `projectWorldTime`, `wallClock` and a rAF `setState` — no credential, no header, no `NEXT_PUBLIC_*`. Grep for `token|secret|apiKey|NEXT_PUBLIC` across the hook, `space-scene.ts`, `SpaceStage.tsx` and `webgl/SpaceWorld.tsx` returns nothing. Every `worldTime` use in the two rewired views (`SystemSpaceView.tsx:182,425-443,512-515,595,667-707,772-971`; `GalaxyView.tsx:182,473`) is display formatting or ETA-refetch scheduling. Nothing auth-bearing is keyed on the clock, so removing the per-frame render cannot stall a token refresh (refresh is request-driven in `apiClient`, not render-driven).

**4. No new trust boundary.** No endpoint, no server action, no wire field, no request body, no persistence, no free-text input, no new dependency. The four non-negotiable checks (actor-per-requirement, deny paths, input validation, secrets lifecycle) have nothing to attach to: the ADDED requirement *Animation Never Re-Renders the View, and Never Starves a Navigation* and the MODIFIED *Body, Lane-Gate, and Point Selection Is Keyboard-Operable* both specify render cadence and focus retention only, with no actor and no data exposure.

## Noted, explicitly not a finding

The client clock projects world time forward from an anchor against `performance.now()`, so a player who fakes their local clock can draw bodies at future orbital positions. This is pre-existing (identical `projectWorldTime` in the hook being deleted), confers no authority (space is Go-sole-authority; every mutation commits through `action.Commit` with a server-computed ETA), and the data involved — orbital element sets — is astronomical/free disclosure by the fog model. This change neither introduces nor widens it. Recording it so a later reviewer does not re-derive it as new.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR.**

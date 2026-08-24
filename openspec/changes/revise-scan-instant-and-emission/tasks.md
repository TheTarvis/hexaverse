# Tasks — Revise Scan: Instant Mint + Emission Cost

## 1. Tuning & Params

- [ ] 1.1 Remove `ScanDuration` from `common.GameTuning` (struct, default,
      doc comment); set `AmbientRadius` 3→2 in `DefaultTuning`
- [ ] 1.2 Dissolve `observation.ScanParams`/`DefaultScanParams` (nothing
      left to tune server-side); fix `params_test.go`

## 2. Backend — Observation (mint, contacts, coverage)

- [ ] 2.1 Add the contact record to `observation/model.go` (`systemId`,
      `hex`, `at`, `via: emission|sighted`, no identity) and DAO support:
      append-only writes under the corp's observation store, list by
      corp + system
- [ ] 2.2 Add a fleets-in-system (all corps, board presence, live hex)
      method to the `FleetSource` interface; implement in
      `fleet.Service`; regenerate observation mocks
- [ ] 2.3 Implement the instant mint service method (design Decision 1/2):
      sweep from the given hex at now (features LOS-filtered, all incident
      lanes `scanned`, far endpoints rumored, no graph tier) + `emission`
      contacts for every other corp present + `sighted` contacts for
      LOS-clear foreign fleets, in one transactional path
- [ ] 2.4 Remove `echoDisc` and the running-scan disc from `Coverage`
      (ambient bubbles only); delete `echo_test.go` cases with it
- [ ] 2.5 Replace `ScanResolver` with the tombstone resolver (completes
      legacy running scan actions, mints nothing); keep registration so
      the sweep/`ResolveDue` never sees an unknown type
- [ ] 2.6 Unit + emulator integration tests: instant mint scenarios,
      emission heard through occlusion, occluded fleet not sighted, no
      self-contact, corp-absent hears nothing, contacts append-only
      (rewrite `scan_integration_test.go`); add the contacts collection
      to `CleanupFirestoreTestData()`

## 3. Backend — Fleet (synchronous verb, ownership)

- [ ] 3.1 Rewrite `fleet.Service.Scan`: board-presence check, live
      position, direct call to the injected observation mint (no action
      commit); inject the observation interface at construction and in
      `router.go` wiring
- [ ] 3.2 Remove `ActiveScanId` from the fleet model, `FleetPos`, and all
      call sites (ignore-on-read for stored docs); drop
      `action.SlotSensor` usage
- [ ] 3.3 Add ownership enforcement to orders, cancel, and scan
      (`common.ActorCorp` vs `corporationId`, `ErrForbidden` → 403 in the
      handler) per design Decision 5
- [ ] 3.4 `make generate` (fleet + observation mocks); update
      fleet unit tests: synchronous scan, back-to-back scans, mid-burn
      scan from live position, 403 for foreign callers on all three verbs

## 4. Backend — Read Path

- [ ] 4.1 Expose the viewer's contacts for the open system in the fogged
      system read payload (handler → observation contact list), with a
      vitest-visible shape documented in the response type
- [ ] 4.2 Verify fleet audience fog is ambient-only after 2.4 (foreign
      fleet inside the old echo disc no longer visible; `sighted` contact
      does not leak the live fleet) — integration test

## 5. Frontend — Services, Hooks, Types

- [ ] 5.1 Add the contact shape to the system-interior type; keep
      `fleetService.scan` as-is (endpoint unchanged); remove
      running-scan usage from `action-service` consumers
- [ ] 5.2 Scan mutation: on success, invalidate/refetch board interior +
      fleet queries immediately and trigger the bloom; remove the
      scan-ETA self-schedule and scan-tightened polling from the board
      refetch hook
- [ ] 5.3 Update hook/service tests for the new refetch rules

## 6. Frontend — Board FX & Controls

- [ ] 6.1 Repurpose ScanPing as the commit-time bloom: client-clocked
      window (`BLOOM_MS ≈ 2000` theater dial in `scan-ping.ts`), anchored
      at the fleet's commit hex, blips nearest-first, LOS shadows
      honored; remove the running-scan sweep rendering path
      (pinned-origin wiring, stop-at-ETA) from `BoardOverlay`/`BoardStage`
- [ ] 6.2 Scan control: disabled only while the request is in flight; no
      countdown; remove the running-scan disable state from `FactsPanel`
- [ ] 6.3 Contact markers: minimal fading marker at each contact hex
      (age-based recency treatment, no identity), rendered from the
      system payload's contacts
- [ ] 6.4 Component tests: bloom plays once and never masks refetched
      data; scan re-enables on response; contact marker renders with age

## 7. Docs & Gate

- [ ] 7.1 Append the decision record to `docs/specs/0006-scan-and-fog.md`
      (instant mint at commit, emission contact + sighting model, ambient
      radius 2, sensor channel retired, ownership fix; decided
      2026-08-24)
- [ ] 7.2 Update root `CLAUDE.md` domain quick-reference (observation +
      fleet bullets: no sensor channel, instant scan, contacts) and
      `backend/observation` inline docs that describe the echo disc
- [ ] 7.3 Run the quality gate
      (`python3 .claude/skills/code-quality-checks/check.py`) and fix
      fallout

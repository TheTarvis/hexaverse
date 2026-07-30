# Tasks — add-mine-ui

Work test-first per group where practical; the vitest suites mock at the
service layer (`frontend/CLAUDE.md`), the e2e runs the real isolated stack.
Every new interactive element needs a `data-testid` (the `/check` validator
enforces it), and every new source file needs a test file.

## 1. Backend: served mining rate

- [x] 1.1 Add `MiningRate` to `rosterDTO` in `backend/fleet/handler.go`,
      derived in `rosterFieldsFor` via the same `DefaultClassStats()` path
      as `CargoCapacity`/`FreeHold` (fleet-movement delta: "Fleet Read
      Surfaces Roster, Cargo, and Derived Capacity").
- [x] 1.2 Extend the fleet handler/roster tests: an owner read includes
      `miningRate` (the roster's summed extraction rate); a foreign fleet's
      redacted snapshot still omits the whole roster block.
- [x] 1.3 `cd backend && go test ./fleet/... -short` green.

## 2. Frontend contract: types, service, hooks

- [x] 2.1 Add the owner-only `roster` field to `Fleet` in
      `frontend/lib/types/fleet.ts` (`ships`, `cargo`, `cargoCapacity`,
      `freeHold`, `miningRate`), optional — absent on foreign fleets,
      mirroring the wire shape.
- [x] 2.2 Add `fleetService.mine(fleetId, {featureId, kind, tons})` posting
      `POST /v1/fleets/:fleetId/mine`, returning the action id + ETA
      response; service test covers the call shape and error passthrough
      (the server's distinguishable rejection reasons).
- [x] 2.3 Add `useMine(systemId)` to `frontend/hooks/use-fleets.ts` modeled
      on `useScan`: mutation → invalidate the system's fleet reads and
      `actions.running(fleetId)`; hook test.
- [x] 2.4 Add `useRunningMine(fleetId)` to `frontend/hooks/use-actions.ts`
      beside `useRunningScan` (`type === 'mine' && status === 'running'`);
      hook test including the past-ETA case.

## 3. Board: offer, preview, commit

- [x] 3.1 FactsPanel offers Mine on the FLEET CARD whenever the acting
      fleet's effective state is `docked` to a feature with visible
      `resources` and the movement channel is free — no board selection
      (hex-board-view delta "Mine Offer on the Docked Fleet"). Tests:
      offered while docked at a lode with no selection; not offered co-hex
      undocked; not offered on a resourceless dock parent; not offered
      while a mine runs. *(Revised per design Decision 3: the first cut
      anchored on selecting the docked-at feature — the slice e2e exposed
      that gesture as unclickable under the docked fleet's own glyph.)*
- [x] 3.2 Kind picker over the feature's visible resource kinds (default:
      richest) and tonnage input (default: free hold, clamped to
      `(0, freeHold]`). Test the clamp and the defaults.
- [x] 3.3 Live ETA preview `tons ÷ roster.miningRate`, recomputed as the
      tonnage/kind change ("Mine ETA Preview From the Served Mining Rate").
      Test that the preview tracks the input.
- [x] 3.4 Commit wiring against the fleet's dock parent: success toast +
      arms the ETA refetch; failure toasts the server's rejection reason,
      offer stays put ("Mine Commit"; selection uninvolved per Decision 3).
      Tests for both paths.

## 4. Board: running-mine state and hold readout

- [x] 4.1 While `useRunningMine` reports a future-ETA run: mine + move
      disabled with a countdown from the action's frozen ETA (world time),
      scan stays enabled ("Running Mine Gates the Movement Channel").
      Tests: move disabled, scan enabled, gating lifts past ETA.
- [x] 4.2 Cancel-mine control wired to the generic action cancel
      (`action-service`); on success the movement channel frees. Test.
- [x] 4.3 Fleet panel hold readout from `fleet.roster`: cargo tons by kind
      and used/total capacity ("Fleet Panel Hold Readout"). Tests: readout
      renders; updated fleet read shows credited cargo without navigation.
- [x] 4.4 `use-board-realtime.ts` adds the running mine's ETA to the
      self-scheduled refetch set (hex-board-view delta "Realtime Refetch
      Rules"). Test: a running mine schedules a refetch shortly after its
      ETA covering the fleet read and the actions read.

## 5. Roster panel: honest mining label

- [x] 5.1 The roster derives fleet→running-mine from the cached
      running-actions query (one actor-scoped read, mapped by fleet id — no
      per-row fetching, per design Decision 5).
- [x] 5.2 A docked fleet with a future-ETA running mine shows "Mining" +
      countdown; a past-ETA action falls back to the movement-state label
      (fleet-roster delta). Tests for both scenarios, plus the untouched
      coast/burn/transit labels still passing.

## 6. Slice e2e

- [x] 6.1 `frontend/e2e/tests/slice.spec.ts`: spawn fresh corp → scan home
      → select a revealed mineable feature → move + dock → commit a
      minimum-size mine run → wait out the ETA → assert the hold readout
      filled and the run's outcome landed.
- [x] 6.2 Extend the journey: persistence via reload (a fresh Firestore
      read), a second run against the same lode accumulating in the hold
      (5+5=10 — the ledger, exactly-once), and departure through a charted
      gate asserted to its galaxy hand-off. *(Revised per design Decision
      6's scope call: the full return trip is 5+ minutes at world scale 1 —
      lane legs are 104–300s — so the round trip is not ridden.)*
- [x] 6.3 Keep the ETA waits bounded: nearest lode, minimum-run tonnage
      (5t = 5s at seed rate), scan 15s, generous-but-finite expect
      timeouts, 240s test budget (design "Risks").

## 7. Validation

- [x] 7.1 `cd frontend && npm run lint && npx vitest run` green;
      `cd backend && make test` green.
- [x] 7.2 `python3 .claude/skills/code-quality-checks/check.py` (data-testid,
      test-file coverage, raw-fetch, color validators) green; e2e suite
      green.
- [x] 7.3 `openspec validate add-mine-ui --strict` passes.

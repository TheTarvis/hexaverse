## 0. `action-dispatch` surface (contract-first)

This group is a prerequisite for group 2 (it changes the surface group 2's
commit/resolve code calls) but is independent of group 1 (fleet roster/
cargo) — the two can proceed in parallel. Sequence this before any
`backend/mine/` implementation so the SDET can write the failing
acceptance suite against the surface, not the mine endpoint, first.

- [ ] 0.1 Add a ledger key, distinct from `scope`, to the commit spec /
      delta path in `backend/action/`; default it to `scope` when omitted
      so every existing verb (burn, lane travel) is unaffected.
- [ ] 0.2 Add a public read on `action.Service` that folds a ledger key's
      delta entries at a given world time (e.g. `Remaining(ctx, ledgerKey,
      t)`), returning the same total the resolver's internal fold computes
      for that key.
- [ ] 0.3 Update `action.Action`'s `Scope` doc comment to note that a
      composite ledger key (when named distinct from `Scope`) must never
      contain `/` — Firestore document ids cannot hold it, and `Scope`/the
      ledger key default doubles as a delta ledger's parent document id.
- [ ] 0.4 Unit tests: an omitted ledger key preserves prior fold/append
      behavior (keyed on `scope`); a named ledger key folds and appends
      under that key, independent of `scope`; the public commit-time fold
      matches the resolver's `Remaining` for the same key and time.

## 1. Fleet entity: roster and cargo

- [ ] 1.1 Add `Ships []ShipEntry` and `Cargo map[ResourceKind]float64` (or
      equivalent) fields to `backend/fleet/model.go`'s `Fleet` struct.
- [ ] 1.2 Add `MineParams`-driven per-class stats table (mining rate, hold
      capacity, burn rate, lane rate) alongside `fleet-movement`'s
      existing movement params, per class (`seed` to start) — burn rate
      and lane rate are independent true-rate axes (board hexes / lane-
      length units per unit world-time, respectively), never a single
      scalar, per "Derived Fleet Speed".
- [ ] 1.3 Add derived-capacity and derived-mining-rate helpers that sum the
      roster's per-class stats — never a stored total field.
- [ ] 1.4 Update `SeedFleet` to write a default one-ship (`seed`-class)
      roster and empty cargo pool on every newly seeded fleet.
- [ ] 1.5 Unit tests: capacity/rate aggregation over a multi-ship roster
      (even though the slice spawns one); empty-cargo default; free-hold
      computation across multiple held kinds.
- [ ] 1.6 Unit test: reading a fleet document written before this change
      (no stored `ships` field, e.g. today's dev-emulator `SeedFleet`
      output) derives capacity/rate/roster as a single default `seed`-class
      hull, never as zero.
- [ ] 1.7 Add derived-burn-rate and derived-lane-rate helpers (each the
      minimum, not sum, of the roster's per-class rates on that axis)
      alongside the capacity/rate helpers, and wire them everywhere burn
      ETA and lane-routing computations currently read a single global
      drive-speed constant (`backend/fleet/params.go`'s `MsPerTile`/
      `LaneMsPerDistance`, consumed from `backend/fleet/service.go`,
      `backend/fleet/travel.go`, and `backend/fleet/routing.go`): burn ETA
      inverts the derived burn rate into a per-tile world-ms cost, and
      lane routing/travel inverts the derived lane rate into a per-lane-
      unit world-ms cost — never a stored total field, per "Derived Fleet
      Speed". Configure the `seed` class's burn rate as the inverse of
      today's `MsPerTile` and its lane rate as the inverse of today's
      `LaneMsPerDistance`, so a single-`seed`-class fleet's ETAs are
      unchanged (value-preservation, per "Derived Fleet Speed"'s
      corresponding scenario).
- [ ] 1.8 Unit tests: derived burn rate and derived lane rate each equal
      the slowest ship's class rate on that axis, independently, across a
      multi-class roster (even though the slice spawns one); a single
      `seed`-class roster's derived burn/lane rates equal the `seed`
      class's configured rates; a single `seed`-class fleet's computed
      burn ETA and lane-leg ETAs exactly match what today's global
      `MsPerTile`/`LaneMsPerDistance` constants would yield
      (value-preservation regression guard, per "Derived Fleet Speed").
- [ ] 1.9 Add `Ships`, `Cargo`, derived total cargo capacity, and derived
      free hold to `backend/fleet/handler.go`'s `fleetDTO` (the whitelist
      the `Get`/`List` handlers serialize through `toDTO`), populated only
      when `dtoFor`'s existing `own` branch is true — mirroring the same
      redaction branch that already strips `state` to a mode-only snapshot
      for a foreign fleet — so a fleet read surfaces the roster/cargo
      model added by 1.1–1.3 for the owner, per "Fleet Read Surfaces
      Roster, Cargo, and Derived Capacity", while a foreign fleet's
      response omits these fields entirely (not merely zeroed): adding the
      fields to `Fleet` (1.1) alone does not expose them, since `toDTO`
      whitelists response fields independently of the stored struct.
- [ ] 1.10 Handler test: `GET /v1/fleets/:fleetId` for an owning
      corporation's fleet returns `ships`, `cargo`, derived total cargo
      capacity, and derived free hold in the JSON response.
- [ ] 1.10a Handler test: a foreign fleet currently inside the requester's
      live sensor coverage, read via `GET /v1/fleets/:fleetId` or the
      system-list endpoint, omits `ships`, `cargo`, derived total cargo
      capacity, and derived free hold from the JSON response, per "Fleet
      Read Surfaces Roster, Cargo, and Derived Capacity"'s foreign-viewer
      scenario.

## 2. `backend/mine/` package (handler → service, per `backend/CLAUDE.md`)

- [ ] 2.1 Scaffold `backend/mine/` (model.go, service.go, handler.go) per
      the standard domain shape; service reads/writes fleets and features
      through their services, never DAOs directly.
- [ ] 2.2 Implement commit, in order: (a) resolve the requester's corp via
      `common.ActorCorp` and reject with `404` if it does not own the
      fleet, `401` if unauthenticated; (b) reject `tons` that is not a
      finite number `> 0`, and reject `tons < MineParams.MinRunTons`; (c)
      validate the remaining preconditions (docked to feature, feature
      carries `kind`, feature's ledger-folded remaining tonnage of `kind`
      — read via the public commit-time fold added in 0.2, on this run's
      ledger key — is not already at or below zero, fleet's derived mining rate `> 0`,
      `tons` ≤ free hold, movement slot free), reporting a distinguishing
      reason per failed precondition (`gin.H{"error": "<reason>"}`,
      matching `backend/fleet/handler.go`'s convention — a busy-slot
      rejection additionally names which action kind currently holds the
      slot); (d) freeze `{featureId, kind, tons, rate, startTons}` into
      `action.params`, where `startTons` is derived from the feature's
      `resources[kind].richness` under commit-time `MineParams`; (e)
      compute `eta = tons ÷ fleetMineRate`; (f) commit through
      `action.Service.Commit` on the fleet's movement channel with
      `Scope = systemId` and a distinct ledger key
      `systemId + "::" + featureId + "::" + kind` (never `/`-joined —
      Firestore document ids cannot contain `/` — and never omitting the
      `kind` segment; see design.md Decisions 12/14).
- [ ] 2.2a Add a per-feature-type `MineParams` ceiling relating
      `MinRunTons` to that feature type's typical starting lode tonnage
      (e.g. a configured max delta count, or an equivalent bound), per
      "Minimum Mine Run Size Is Bounded By Lode Tonnage" — pick the actual
      numbers at this step (tuning-time, per design.md Open Questions);
      the requirement only constrains that a named ceiling exists and is
      honored.
- [ ] 2.3 Implement the mine resolver (`action.ResolveFunc` for
      `type: "mine"`): fold the feature's system-and-kind-qualified
      ledger key's deltas with `effectAt ≤ eta` via the resolver's
      `Remaining`, compute `remainingAtEta = max(0, startTons +
      fold(deltas))` (deltas are negative tonnage, so the fold reduces
      remaining; floored at zero), compute `take = max(0, min(params.tons,
      remainingAtEta, freeHoldAtResolve))` (also floored, so a resolve can
      never append a positive tonnage-restoring delta or credit negative
      cargo). When `take > 0`, append the delta (`docId = actionId`, amount
      `-take`) under the ledger key and credit `fleet.cargo[kind] += take`
      via a merge patch that leaves other cargo kinds untouched; when
      `take == 0`, append no delta document at all (not a zero-amount one)
      and credit no cargo — the action still flips to `done`, its slot is
      still released, and its `outcome`/reason code are still set, exactly
      as in the `take > 0` case, so the only difference on a zero-take
      resolve is that no ledger entry is written (keeps the ledger's
      per-key delta count bounded by `⌈startTons / MinRunTons⌉`, not by the
      number of contesting runs — see "Exactly-Once Lode Delta"). In both
      cases, set both an honest `outcome` string ("mined Nt" / "lode ran
      dry at Nt" / "hold full at Nt" — each reliably distinguishable by a
      caller, e.g. via a stable substring or prefix) and a structured
      reason code (`clean` | `lodeDry` | `holdFull`) alongside it. Log the
      ledger key's resulting delta-entry count on both this resolve and the
      commit-time fold in 2.2(c) (per "Mine Ledger Depth Is Observable").
- [ ] 2.4 Wire `POST /v1/fleets/:fleetId/mine` in `handler.go`, following
      the existing fleet-orders handler's request/response shape.
- [ ] 2.5 Register the mine service and its resolver in `backend/router.go`
      (after the fleet/fog/travel/spawn wiring already present, matching
      the existing wiring order and comments).
- [ ] 2.6 In `backend/fleet/service.go`, add a no-op branch for
      `board.ModeDocked` to `haltState` (called from `Cancel`), so
      cancelling a mine run through `POST /v1/fleets/:fleetId/cancel`
      leaves the fleet `docked` instead of forcing it to `coast` (see
      design.md Decision 16; `fleet-movement`'s "Cancel Halts in Place").

## 3. Contested-lode and exactly-once correctness

- [ ] 3.1 Integration test (Firestore emulator): a single mine action
      commits, resolves, appends its delta under its `systemId::featureId::
      kind` ledger key, and credits the fleet's cargo, end-to-end against
      the live emulator — proves the `::`-joined ledger key is a valid
      Firestore document id and the write path succeeds at all, before the
      collision regression guard (3.5) that assumes it does.
- [ ] 3.2 Integration test (Firestore emulator): two mine runs against one
      feature/kind with different ETAs resolve independently, in ETA
      order, the later clamping against the earlier's already-applied
      delta.
- [ ] 3.3 Integration test: concurrent resolve attempts for the same mine
      action produce exactly one delta document and exactly one cargo
      credit.
- [ ] 3.4 Test the `action-dispatch` acceptance criterion this verb is the
      reference implementation of: "scan at T1 + mine at T2 resolved
      together at T3" (both resolve correctly regardless of read order).
- [ ] 3.5 Integration test (Firestore emulator): two fleets each mine a
      feature with the same feature id (e.g. `feat-belt-0`) in two
      different systems — each run's delta and remaining-tonnage fold
      touch only that run's own system-and-kind-qualified ledger key,
      never the other system's identically-id'd feature (regression guard
      on design.md Decisions 12/14 / "Ledger Key Is System-And-Kind-
      Qualified, Channel Scope Is Per-System").
- [ ] 3.6 Integration test (Firestore emulator): two mine runs target the
      same feature but different resource kinds (e.g. `metals` and
      `volatiles`) — each kind's ledger key folds and depletes
      independently; mining one kind to exhaustion does not block or
      clamp the other's commit or resolve (regression guard on design.md
      Decision 14's kind-conflation fix).

## 4. Preconditions and clamping

- [ ] 4.1 Unit tests: not-docked rejection, unknown-kind rejection,
      over-free-hold rejection at commit, busy-movement-slot rejection —
      each asserting a distinguishing `error` reason in the response body
      (no two rejection cases share the same reason text), and the
      busy-slot case asserting the reason names which of burn/lane-transit/
      mine currently holds the slot.
- [ ] 4.2 Unit tests: clean-run full yield (`clean` reason code), dry-lode
      clamp with correct `outcome` text and `lodeDry` reason code,
      full-hold clamp (fixture the fleet's stored cargo directly to leave
      free hold below the requested `tons` — not "another action filled it
      in the meantime," which no verb in this change can induce; see
      "Resolve Clamps Yield to Reality"'s defensive-only note) with correct
      `outcome` text and `holdFull` reason code; a resolve against an
      already-fully-depleted ledger key yields
      `take = 0` with no delta appended at all (not merely no positive
      delta) and no negative cargo credit, while still resolving `done`
      with its honest outcome/reason code (floor-at-zero regression guard,
      design.md Decision 15); a contested-loser zero-take resolve — a
      second run's ETA lands after an earlier-ETA run against the same
      ledger key already took the lode to zero — asserts no delta document
      is written for the losing action's id, yet that action still resolves
      `done` with an honest `outcome`/`lodeDry` reason code and its
      movement slot released (ledger-growth-bound regression guard, per
      "Exactly-Once Lode Delta").
- [ ] 4.3 Unit test: no-scan-required — committing against an unscanned
      feature the fleet is docked to succeeds when the feature actually
      carries the requested kind.
- [ ] 4.4 Unit/integration test: mining kind B on a fleet that already
      holds cargo of kind A leaves kind A's tonnage untouched (regression
      guard on the resolver's nested `cargo` map patch — `firestore.MergeAll`
      deep-merges to leaf field paths, but every prior `ActorState` use has
      replaced a whole top-level field, not a nested map key, so this needs
      its own coverage).
- [ ] 4.5 Handler tests: unauthenticated mine request rejected `401`;
      foreign-corp mine request rejected `404` with no action/delta/cargo
      change; owning-corp request commits normally.
- [ ] 4.6 Unit tests: `tons` of `0`, a negative value, `NaN`, and `+Inf`
      are all rejected at commit with no action created; `tons` below
      `MineParams.MinRunTons` is rejected.
- [ ] 4.7 Unit test: a fleet whose derived mining rate is zero (no
      mining-capable ship in roster) is rejected at commit, not allowed to
      produce a `+Inf` ETA.
- [ ] 4.8 Unit tests: a commit against a feature/kind whose ledger-folded
      remaining tonnage is already at or below zero (both the exact-zero
      case and a fixtured below-zero float-drift case) is rejected
      ("Already-Depleted Lode Rejected At Commit"); a commit against a lode
      with positive as-of-now remaining tonnage still succeeds even when
      another in-flight run may deplete it before this run's own ETA.

## 5. Cancel/acknowledge and endpoint contract

- [ ] 5.1 Verify (or add a thin passthrough test) that a running mine
      action cancels via `POST /v1/actions/:actionId/cancel` with no delta
      and no cargo credit, releasing the movement slot.
- [ ] 5.2 Handler test: a committed run's response includes the action id
      and frozen ETA.
- [ ] 5.3 Handler test: retrying an identical `POST
      /v1/fleets/:fleetId/mine` after the first commit already succeeded
      fails with the active-action conflict, not a second action.
- [ ] 5.4 Integration test: a mine run cancelled via the owning fleet's
      `POST /v1/fleets/:fleetId/cancel` endpoint (not the generic action
      endpoint) leaves the fleet `docked`, not `coast` (see design.md
      Decision 16; `fleet-movement`'s "Cancel Halts in Place" MODIFIED
      scenario "Cancelling via the fleet endpoint while mining leaves the
      fleet docked").

## 6. Validation

- [ ] 6.1 `go test ./mine/... ./fleet/... ./action/... -short`
- [ ] 6.2 `openspec validate add-mine-extraction --strict`

## Out of scope (tracked, not tasked here)

- Frontend wiring (`useMine()`, select→preview→commit UI, hold readout) is
  `hex-board-view`'s remit per `docs/specs/0010-mine.md` — a follow-up
  change against that capability, not this one.

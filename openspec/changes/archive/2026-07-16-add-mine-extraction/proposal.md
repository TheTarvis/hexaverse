## Why

Mine is the last unspec'd verb of the first vertical slice (drill in → move
→ scan → mine → depart → arrive → reveal → return). Its design is fully
worked out and accepted (`docs/specs/0010-mine.md`) and everything it
depends on already exists — `system-interior` generates the minable bodies
and their `resources [{kind, richness}]`, `action-dispatch` provides the
async spine and already sketches the delta schema, `fleet-movement` owns
docking — but `backend/mine/` does not exist yet (`CLAUDE.md`: "Next: M10
mine"). This is real forward work, not a retrofit: it adds a new mutating
verb to the action spine and gives the fleet its cargo model.

## What Changes

- Add a new `mine-extraction` capability: commit (validate preconditions,
  freeze params, compute a tonnage-derived ETA, claim the action slot) and
  resolve (fold the feature's ledger, clamp the take to reality, append an
  exactly-once delta, credit the fleet's hold) for a `POST
  /v1/fleets/:fleetId/mine {featureId, kind, tons}` command, riding the
  `action-dispatch` spine as its first mutating resolver.
- **ADD** to `fleet-movement`: the fleet's ship roster (`ships[]`) and
  cargo pool (`cargo[kind]`), with hold capacity and mining rate always
  derived from the roster (never stored) — the entity-shape half of the
  mine verb, per `docs/specs/0010-mine.md`'s "ships compose, the fleet
  acts" decision.
- Backend only. Frontend wiring (`useMine()`, the select→preview→commit UI,
  the hold readout) is explicitly `hex-board-view`'s remit per the source
  design doc and is deliberately **out of scope** for this change — a
  follow-up change should extend `hex-board-view` once this backend slice
  lands.
- **Scope caveat:** this change writes the depletion ledger but adds no
  read that surfaces a lode's *remaining* tonnage — no `system`/board read
  folds the ledger today (`FoldDeltas` runs only inside `action` resolve),
  so a re-read after mining still returns the original static `richness`.
  "Lodes visibly deplete" (design.md Decision 7) is *recorded* here and
  *made visible* by the same `hex-board-view` follow-up (or a small
  preceding backend read change) that folds `remaining = startTons +
  ledger` into the fog-filtered feature read. This change must not be read
  as delivering visible depletion.

## Impact

- Affected specs: `mine-extraction` (new), `fleet-movement` (ADDED
  requirements: ship composition/roster, cargo pool, derived
  capacity/rate, derived burn/lane speed — two independent true-rate axes,
  each value-preserving for a single-`seed`-class fleet against today's
  `MsPerTile`/`LaneMsPerDistance` constants, foreign-viewer redaction on
  the roster/cargo read; MODIFIED: "Cancel Halts in Place" gains a no-op
  branch for a docked fleet whose released slot held a non-movement verb;
  "In-System Burn Order" and "Graph-Tier Travel Order" restate their ETA
  input as the fleet's roster-derived burn/lane rate in place of the
  single global drive-speed constant), and
  `action-dispatch` (ADDED: a per-verb ledger key nameable distinct from
  the action's channel scope, and a public commit-time ledger-fold surface
  on the action service — see design.md Decisions 12–13; both additive and
  default-preserving for every existing verb; MODIFIED: "Exactly-Once
  Resolution" and "Additive Ledger Fold, No Materialized Total" are
  reworded from scope-as-ledger to ledger-key terms — the ledger a resolve
  appends to and folds is now the action's ledger key, defaulting to
  `scope` when none was committed — so the base pair no longer contradicts
  the decoupled ledger key added alongside them)
- Affected code: new `backend/mine/` package (handler → service, per
  `backend/CLAUDE.md`'s domain shape); `backend/fleet/model.go` (add
  `Ships`/`Cargo` fields); `backend/fleet/params.go` (derived-capacity,
  derived-mining-rate, derived-burn-rate, and derived-lane-rate helpers
  over the roster — two independent true-rate axes, not one scalar);
  `backend/fleet/service.go` and `backend/fleet/travel.go` (burn ETA and
  lane-transit computations invert the roster-derived burn/lane rate
  instead of reading the existing single global `MsPerTile`/
  `LaneMsPerDistance` constants directly, configured value-preserving for
  a single-`seed`-class fleet — `haltState` also gains a no-op branch for
  `board.ModeDocked`, so cancelling a mine run through the fleet's own
  cancel endpoint doesn't force an undock — see design.md Decision 15);
  `backend/fleet/routing.go` (lane-routing weight uses the roster-derived
  lane rate); `backend/fleet/handler.go` (`fleetDTO` gains `ships`,
  `cargo`, derived total cargo capacity, and derived free hold — populated
  only for the owning corporation's own fleet, redacted like `state` for a
  foreign fleet inside coverage — so the roster/cargo model is actually
  observable on a fleet read, not only internal to the mine verb);
  `backend/action/` (add a ledger key distinct from `Scope` to the commit
  spec / delta path, and a public `Remaining`/fold method on
  `action.Service` — design.md Decisions 12–13); `backend/router.go` (wire
  the mine service and its resolver registration, following the existing
  wiring order for fog/travel/spawn); `backend/common/pubsub.go` unaffected
  (mine reuses `action-dispatch`'s existing `ActionCompleted` envelope, on
  the system-scoped channel — no new Pub/Sub constants).

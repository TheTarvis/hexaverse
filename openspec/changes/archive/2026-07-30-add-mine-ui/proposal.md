# Add Mine UI

## Why

M10 (`add-mine-extraction`, archived 2026-07-16) shipped the mine verb's
entire backend — `POST /v1/fleets/{fleetId}/mine`, the exactly-once lode
ledger, honest clamped outcomes, and the fleet roster/cargo surface on fleet
reads — but deliberately left the frontend out of scope (its tasks.md tracks
it to `hex-board-view` per `docs/specs/0010-mine.md`). Today a player parked
at a mineable body has no way to invoke the verb: the board's facts panel
offers Scan and movement, nothing else. This change closes the first vertical
slice — *drill in → move → scan → mine → depart → return* — by giving the
verb its UI and the slice its end-to-end proof.

## What Changes

- The board's fleet panel offers **Mine** whenever the acting fleet is
  docked to a feature carrying resources — anchored to the docked state, no
  board selection needed (a fleet can only mine what it's docked to): a
  resource-kind picker, a tonnage input clamped to the fleet's free hold
  (default: fill the hold), and a live ETA preview
  (`eta = tons ÷ fleet mining rate`).
- A **`useMine()` mutation** → mine service → `apiClient` commits the run
  against `POST /v1/fleets/{fleetId}/mine`; success clears the selection and
  arms the ETA refetch, failure surfaces the server's distinguishable
  rejection reason (not docked, unknown kind, over free hold, busy slot,
  depleted lode) as an error toast.
- The fleet panel gains a **hold readout**: cargo contents by kind and
  used/total capacity, from the owner-only roster fields the fleet read
  already returns (`ships`, `cargo`, `cargoCapacity`, `freeHold`). The
  frontend `Fleet` type learns these fields.
- The roster read gains one field: the fleet's **derived mining rate**
  joins the owner-only roster DTO (backend, additive). The ETA preview is
  `tons ÷ rate`; serving the server-derived rate keeps the class-stats
  table out of the client (no tuning-mirror duplication à la
  `ORBIT_BASE_PERIOD`, which needs a golden-fixture guard to stay honest).
- A **running mine** renders as the board's busy state on the movement
  channel: mine and move controls disabled with a countdown to the run's
  ETA, cancellable via the generic action endpoint, and the board's
  realtime refetch rules treat the mine ETA like any own-fleet ETA.
- The **fleet roster panel** shows a docked fleet with a running mine as
  "Mining" with a countdown, instead of the movement-state-only
  "On station" — the panel's one job is honest activity labels.
- The **slice e2e** lands in `frontend/e2e/`: spawn → scan home → move →
  dock → mine → watch the hold fill at ETA → depart → return → the cargo
  and the depleted lode persisted.

Out of scope, tracked: surfacing a lode's *remaining* tonnage through the
fogged interior read (the "lode-as-known" clamp half). The board read does
not carry remaining today; adding it is a backend/fog change against
`system-interior`/`observation-fog-and-scan`. Until then the tonnage input
clamps to free hold only, and the server's honest outcome ("lode ran dry at
22t") plus the depleted-lode commit rejection carry the truth — consistent
with the backend's "no scan required, prospect by doing" stance.

## Capabilities

### New Capabilities

*(none — the mine UI is new surface inside existing capabilities)*

### Modified Capabilities

- `hex-board-view`: adds the mine verb to the board — mine offer/preview on
  a docked-at resource feature selection, mine commit semantics
  (clear-selection / error-toast / refetch-arming), running-mine gating and
  countdown on the movement channel, and the fleet panel's hold readout.
- `fleet-roster`: a fleet whose movement slot is occupied by a running mine
  action shows a "Mining" activity with a countdown to its ETA (movement
  state alone no longer fully determines the activity label).
- `fleet-movement`: the owner-only roster surface on fleet reads
  ("Fleet Read Surfaces Roster, Cargo, and Derived Capacity") additionally
  carries the fleet's derived mining rate, under the same audience-fog
  redaction as the existing roster fields.

## Impact

- **Frontend, plus one additive backend DTO field** (derived mining rate on
  the owner-only roster read, `backend/fleet/handler.go`). Everything else
  this consumes (`POST /v1/fleets/{fleetId}/mine`, roster fields on fleet
  reads, the actions inbox, `ActionCompleted` SSE) shipped with
  `add-mine-extraction`.
- `frontend/lib/types/fleet.ts` — roster/cargo/capacity fields join `Fleet`.
- `frontend/lib/services/` — a mine service (or fleet-service addition) for
  the commit call; `lib/query-keys.ts` if a new key family is needed.
- `frontend/hooks/` — `use-mine.ts`; `use-board-realtime.ts` picks up the
  running mine's ETA (it already watches scan ETAs and own arrivals).
- `frontend/components/board/` — facts panel (mine offer, kind picker,
  tonnage input, ETA preview), fleet panel (hold readout, busy state).
- `frontend/components/` fleet roster panel — the "Mining" activity row.
- `frontend/e2e/tests/` — the new slice spec, plus whatever seed-data
  helpers it needs.
- Validators: `data-testid` coverage and test-file coverage per `/check`.

## Why

This is link 4 of the continuous-space chain (`docs/plans/continous_space/chain.md`).
Links 1–3 landed `backend/space` (`a05dddf`), `backend/disclosure` (`fca73ef`), and
orbital system bodies + lane gates (`e00e79e`), plus the `pin-system-generation-
determinism` insert (`b64be39`) — three packages with zero production consumers.
`fleet` is load-bearing for eight other capabilities and cannot be half-migrated
off the lattice, which is why this link is the heaviest in the chain: it is where
`space` and `disclosure` get their first real caller, and where the lattice
(`board.MovementState`, `board.Cell`) leaves the fleet document for good.

## What Changes

> **BREAKING and most user-visible, stated first on purpose:** the board view
> loses its fleet layer and every geometry-dependent verb (move preview/commit,
> scan preview/commit, cancel, lane-gate departure, foreign-fleet contact marks,
> fog-band treatment). **The game is visually unplayable for links 4 through 7** —
> no fleet renders on the board, no move can be ordered from it. The roster panel
> becomes the command surface instead: burns, cut-drive, stop, and jump are all
> ordered by naming a target body id from a fleet row. Recorded this prominently,
> per design.md Decision 12, so it can be vetoed on sight rather than discovered
> at demo time.

- **BREAKING** — `fleet.Fleet.State` changes from a `board.MovementState` (five
  lattice shapes: coast/burn/docked/laneTransit/laneHold) to a `space.ShipState`
  (burn/park/drift), plus fleet-owned `attachedTo` (dock relationship) and `jump`
  (lane transit) fields. Nothing about a fleet is expressed in ring/slot after
  this change. `BurnResolver` settles curved burns by folding `space.StateAt`;
  the action spine's channel split (`activeActionId`/`activeScanId`) and the
  exactly-once delta ledger carry over **unchanged** — the fold contract is
  identical, only what gets folded changes.
- **BREAKING** — cancel becomes two distinct verbs instead of one halt-in-place
  behavior: **cut drive** (free, instant, converts the active burn to a drift at
  its live position/velocity, goes dark the same instant — no Δv, no action) and
  **stop in place** (a velocity-nulling burn — costs Δv, takes time, emits the
  whole way; converts instantly and freely to a point park only below a named
  speed floor). The one non-movement clause of the old cancel behavior — a
  released co-resident verb's slot (e.g. a cancelled `mine`) never forces a
  docked fleet off its dock — survives verbatim in substance.
- **BREAKING** — lane travel becomes a **single-hop `jump`** from a fleet already
  attached to a gate body, with **no dwell** (jump-eligible the same world
  millisecond it attaches). Multi-hop routing is deleted outright:
  `Service.PreviewRoute`, `planRoute`, `reconstruct`, `buildTrip`, `ErrNoRoute`,
  `ErrSameSystem`, `RoutePreview`, and `GET /v1/fleets/:fleetId/route` all go,
  along with the board's route-preview gesture and the galaxy view's transit
  card. This follows directly from the settled ruling that "the lane is safe;
  the gate is where you are vulnerable… interception happens at gates or not at
  all" — a multi-hop trip with pass-through intermediates would never surface at
  an intermediate gate and would be uninterceptable end to end, contradicting
  that ruling outright.
- **BREAKING — the link 4/5 boundary moved.** This change deletes
  `observation`'s live half now, not at link 5: *Ambient Sensor Coverage From
  Own Units*, *Running Scan Echo Disc*, *Scan Resolution Mints the Reveal*,
  *Path-Swept Ambient Reveal on Move Resolution*, and *Fleet Audience
  Visibility* are removed with no successor, because there is no lattice
  geometry left to compute coverage or an echo disc from once a fleet has no
  board cell. The stored graph-tier ladder, arrival reveals, and charted-lane
  set survive untouched into link 5. Two deliberate, temporary consequences
  follow and are specced as such: **foreign fleets are not disclosed at all**
  between links 4 and 5 (omitted from list reads, `404` on direct fetch — more
  restrictive than today, so nothing leaks), and **`system-interior` reads are
  fully unfogged** (every feature served in full to every authenticated
  requester) until link 5 replaces both with a `disclosure`-projected read.
- The burn order gains an optional commanded acceleration, bounded above by the
  fleet's roster-derived acceleration ceiling and below by
  `disclosure.MinCommandedAccel`, converting `proximity-disclosure`'s
  already-shipped "reducing commanded acceleration shrinks the signature"
  scenario from vacuous to real. `ClassStats.BurnRate`/`LaneRate` (board-hex and
  lane-length units) are replaced by a per-class `Accel` and drive output.
- Free drift is added to `space` as a third `ShipMode` (not a fourth `ParkKind`)
  with its own fixture coverage, and the persistence codec is extended to cover
  burns (including the six curve control points, encoded as anything but
  `[][]float64`, which the action spine's parameter validator rejects), all
  three park kinds, and drifts.
- The star is excluded from burn targeting by geometry alone —
  `space.BuildCurve`'s endpoint-clearance guard already rejects every star size
  this generator emits, with margin — so `ErrCoreDestination` and its
  destination-identity special case are removed with no replacement rule.
  Spawn seeding is re-expressed the same way: a deterministic continuous-space
  park, rejecting only a position inside the star's clearance radius.
- The already-recorded fleet-endpoint no-ownership-check defect is restated,
  unfixed, over the new endpoint set (`/orders`, `/cancel`, `/cut-drive`,
  `/stop`, `/jump`) in place of the retired `/scan` endpoint.
- The three deferred `fixtures/system` fixture families (`keplerPeriodMs`,
  `gateOrbit`, `stationOrbit`) and two of four deferred `fixtures/space`
  families (the persistence codec, `minDistanceFromOriginOf`) come due and are
  recorded now, since this is the first change that gives `backend/space` a
  real consumer; the remaining two (`StationKeepRate`/`StationKeepUpkeep`,
  `ReleaseStationkeep`) are re-filed against `add-fuel-as-cargo` (link 7) with a
  fresh named owner rather than carried forward unchanged.

**Out of scope, deliberately** (named so the omission reads as intentional, not
forgotten):

- Fuel, Δv budgets, and commit-time affordability — link 7
  (`add-fuel-as-cargo`); no placeholders are left for it here.
- The persisted sighting store, wiring `disclosure` into any galaxy/system/fleet
  read, the focused-scan verb, and its sensor-channel pricing — link 5
  (`replace-observation-with-sightings`).
- Mine/sell/dock re-anchoring from cells to bodies beyond the one-line
  `DockedTo()` re-point — link 6 (`re-express-economy-positions`).
- The production space-view renderer — link 8 (`build-production-space-view`).
- Deleting `backend/board`, `backend/polar`, their mirrors, and fixtures —
  **not** link 9's problem to inherit early: `system`, `stations`, and
  `corporations` still consume them after this link, so they cannot be deleted
  here.
- Capture-if-slow and combat — deferred by `decisions.md`, off this chain
  entirely.

## Impact

- Affected specs, each carrying its own reason:
  - `fleet-movement` — the fleet's stored state, its burn/cut-drive/stop/jump
    verbs, and its movement command endpoints move from `board.MovementState`
    and lattice geometry to `space.ShipState` and `system.BodyTable`
    resolution (design.md Decision 4, 9, 10, 13, 14, 21).
  - `space-kinematics` — free drift (`ModeDrift`) is added as a third
    `ShipMode`, the cut-drive burn-to-drift conversion is specified, and the
    persistence codec is widened to burns, parks, and drifts (design.md
    Decision 5, 6, 9).
  - `observation-fog-and-scan` — the live half (ambient coverage, running-scan
    echo disc, scan reveal mint, ambient path-sweep reveal, fleet audience
    visibility) is removed outright, since a fleet has no board cell left for
    coverage to be computed from (design.md Decision 11).
  - `system-interior` — with `observation`'s live half gone, the three-band
    fog projection has no coverage source or memory writer to read from, so
    interior reads become a stated, temporary, fully-disclosed interim
    (design.md Decision 11).
  - `board-view` — the board loses its fleet layer and every
    geometry-dependent verb (move/scan/cancel/lane-gate departure); only
    mine/sell/credits/camera/accessibility and a reduced picking/refetch
    surface survive (design.md Decision 12).
  - `fleet-roster` — **two reasons, both live in this delta.** First, status
    is re-derived from kinematic state: the roster's requirement now names
    `coast`/`docked`/`laneTransit`/`laneHold` alongside `space.ShipState`'s
    burn/park/drift, and three of the five old `board.MovementState` shapes
    have no successor (design.md Decision 4, 10). Second, the roster row
    becomes the fleet's command surface — burn, cut-drive, stop, and jump are
    all ordered by naming a target from a fleet row, since the board no
    longer offers a move/cancel/jump control of its own (design.md
    Decision 12).
  - `corporation-spawn` — the starting hull's seed position moves from a
    rim-ring `board.Cell` to a deterministic continuous-space park that
    rejects only a position inside the home star's clearance radius (design.md
    Decision 14, 16).
  - `galaxy-view` — the route-preview gesture and the multi-hop transit card
    are removed along with multi-hop routing itself; bridge-lane rendering is
    re-expressed without the deleted travel interaction (design.md
    Decision 10).
  - `proximity-disclosure` — this change adds a third `ShipMode` (drift) that
    two of `proximity-disclosure`'s already-shipped requirements
    (`contactVelocity`, emission) switch on, and its *Whether a Plume Exists
    Is an Exact Integer Test* scenario set covers parked and burning but never
    drifting — so a drifting contact's velocity and emission state were
    undefined until this change's ADDED requirement closes the gap
    (design.md Decision 5).
- `action-dispatch` takes **no** delta, on purpose: `backend/action/
  params_validator.go`'s allowlist already accepts every shape the new codec
  emits (`float64`, `[]float64`, `int64`, `[]int64`, `map[string]any`,
  `[]any`), and the rule being added governs what the **codec emits**, not
  what the **validator accepts** — so it belongs in `space-kinematics`
  (design.md Decision 15). `docs/plans/continous_space/chain.md`'s link-4
  entry predicted an `action-dispatch` delta; that prediction was wrong and
  `chain.md` is corrected accordingly.
- Affected code: `backend/fleet`, `backend/space`, `backend/system`,
  `backend/observation`, `backend/disclosure`, `backend/mine`,
  `backend/market`, `backend/corporations`, `frontend/`

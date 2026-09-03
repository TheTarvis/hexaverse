## Why

The continuous-space PoC (`frontend/app/spike/space-3d/`) proved the feel —
real orbits, curved burns, a settle-on-read fold — and links 1–7 have since
given the backend everything the PoC only sketched: real bodies and lane
gates in `backend/space`, proximity disclosure, continuous-burn fleets,
sighting-backed knowledge, minable positions, and fuel as cargo. The only
playable tactical view left is still `board-view`'s polar ring-and-slot
lattice, which link 4 already stripped of its fleet layer and which cites
one requirement header that no longer exists. Graduating the PoC into a
production view and retiring the lattice view is the one thing standing
between the backend that exists today and `delete-the-lattice` (link 9),
which cannot remove `backend/board`/`backend/polar` while `system-interior`
still promises their wire fields to a caller.

## The split, and why neither half is a deferral

This change is the second of two, ruled by its own panel review (H7). The
first, **`serve-orbital-elements-and-burn-preview`**, carries the backend
half — orbital elements on the body and lane-gate DTOs, the burn-preview
endpoint, the quoted fuel cap, and the station-keeping upkeep rate. It is
**purely additive**, which is what makes the split safe: it removes no field,
so there is no coexistence period and no feature flag, and the lattice view
keeps working untouched while it is in flight.

**Neither half is a deferral.** This change cannot render a moving system or
price a burn without the first; the first is dead code until this change calls
it. They are one review's output with one successor each. The decisive reason
to sequence rather than merge them is that an SDET can write the failing
wire/preview contract suite **before either developer starts** — which this
change's atomic-swap risk profile demands, since the lattice view is deleted in
the same change that replaces it.

**Link 9 (`delete-the-lattice`) is blocked on BOTH this change and
`add-scan-and-sightings-surface` (8b) — not on this change alone.** 8b carries
the focused scan's entire player-facing half (the command surface and the
sightings display, together — the scan's client half has already been deferred
once, at link 5, where it became a dead derivation:
`frontend/hooks/use-actions.ts`'s `useRunningScan` exists today with zero
consumers). What must NOT happen is 8b's own two halves being separated from
each other, or the scan surface being deferred out of the chain a second time.

## What Changes

- **ADD `system-space-view`** (new capability): the continuous-R³ per-system
  route — data fan-in over four independently-failing reads, single selection
  among a body/lane-gate/point, own-fleet position/curve/ghost rendering,
  foreign-contact rendering, the server-solved burn preview and its failure
  states, the quote-locked burn commit and its outcome reporting, one unified
  burn-command path for a body, a lane gate, or a point, double-submit guards
  on burn and jump, jump commit, departure hand-off scoped to the acting
  fleet, roster cross-navigation, realtime refetch rules, live-region
  announcement of landed resolutions, the renderer-unavailability trio,
  keyboard/reduced-motion accessibility including a keyboard path to the point
  selection, pointer and touch reachability of off-screen bodies and gates,
  and an orbit/pan/zoom camera (all four camera requirements plus the
  inert-while-unavailable rule) — **keyboard pan included**, without which
  the point-selection control can only ever name the star, the one point
  every burn solve rejects by its endpoint-clearance guard. The camera's
  default framing, zoom clamps, pan bound and maximum pick radius are all
  multiples of the interior read's served continuous `extent`, never absolute
  constants and never the lattice `radius`. A foreign contact renders frozen
  at its served position and its served `velocity` is **displayed** rather
  than integrated — one named consumer for a field that would otherwise ship
  unread.
- **The fan-in is four reads, not two.** An earlier draft of this change
  listed the interior and the own-fleets reads and stopped there, while its
  own tasks 7.5/7.6 (sell offer, sell commit) and *Credit Balance Readout*
  cannot be satisfied without a **station**, a **market-board**, and a
  **corporation-balance** source. The developer implemented every task as
  written, so `SystemSpaceView.tsx` mounts the fleet panel with
  `station={null} stationQuotes={null} credits={null}`: the balance readout is
  a permanent em dash, `commitSell` returns early on `!station` — a sell
  control that renders and does nothing when clicked — and
  `sellOffered = docked && hasCargo` / `refuelOffered = docked` offer both
  verbs while docked to *any* body, contradicting this change's own
  requirement text, which scopes them to a station. Every panel-level test
  passes, because the panel is handed a station prop; only the composition can
  see it. The fan-in now names the station read
  (`GET /v1/systems/:systemId/station`) and the market price board
  (`GET /v1/market/board`) as this view's own reads, takes the balance from
  the ambient corporation session rather than a fifth read, and **widens the
  failure model from two reads to four plus the session**: a failed station
  read withdraws sell and refuel with an attributed retry (a station read that
  merely resolves to *no* station is not a failure and shows no error); a
  failed board read withdraws sell but not refuel, whose price comes from the
  fleet's own read; an unavailable balance withdraws a readout, never a verb.
  The sell and refuel offers are re-anchored on the station's board feature id
  rather than on bare attachment. The view consumes only the station's
  identity — never the station response's surviving lattice `orbit` object,
  which task 10.11's import grep would not have caught.
- **MODIFIED `fleet-roster`'s command-surface requirement, scoped by mounting
  view** (RENAMED to *The Roster Row Is the Fleet Command Surface Where the
  Mounting View Provides None, Jump Gated by Attachment Alone*). Two
  capabilities owned the same verbs: the roster's requirement is live and was
  unmodified by this change, while `system-space-view` and
  `docked-fleet-actions` put burn, cut drive, stop, and jump on their own
  panels. The code follows both, so `FleetRoster`, `FleetActionsPanel`, and
  `SpaceCommandPanel` all emit `fleet-cmd-cut-drive-{id}` and
  `fleet-cmd-stop-{id}` — a burning fleet renders **two live "Cut drive"
  buttons**, which is a hard error in Playwright's strict mode. The roster is
  **scoped, not retired**: the galaxy view mounts no command panel and keeps
  the roster's commands, the space view owns them and its roster rows render
  selection and status only, and within any one view each verb resolves to
  exactly one control. Retiring the surface outright would strand the galaxy
  view; distinct test ids alone would leave two live controls for one fleet on
  one screen. The same requirement now forbids a **dead** control:
  `rosterCommandVisibility` returns `burn: true` unconditionally while
  `SystemSpaceView` passes no `onBurn`, so the roster's "Burn" button is a
  no-op today. Consequently `docked-fleet-actions`'s *Running Mine Gates the
  Fleet Panel's Commands* now names the surfaces that actually hold the verbs
  rather than "the roster panel's", and the space view's `burn-button` and
  jump control join the gate.
- **Reworded one unsatisfiable scenario.** *A failed interior read leaves the
  fleet-state-anchored commands usable* read as demanding sell, refuel, hold,
  release, cut drive, stop **and** jump simultaneously for one fleet "attached
  to a body" — no fleet can be docked at a station and attached to a gate and
  burning at once, so no honest implementation satisfied it. It is now a
  **parity** claim: three fixtures (docked at a station, gate-attached,
  burning), each rendered twice — healthy versus failed interior read — with
  the offered command set identical across both and a per-fixture vacuity
  guard. That is strictly stronger than the presence list it replaces, because
  it fails against a command offered in neither state.
- **ADD `docked-fleet-actions`** (new capability): the fleet panel's
  own-state-anchored command surface — mine, sell, and refuel offers and
  commits, double-submit guards on all three, the station-keeping hold/release
  controls reading the **served** upkeep rate on **both** park modes it is
  served for, so the "Hold here" control prices the hold before the player
  pays for it rather than only after; a cargo-hold readout, the credit
  balance readout, rejection-copy mapping, and running-mine gating of the
  roster's movement commands. The hold rejection's copy names the
  station-keeping **reserve** as its boundary, matching where
  `add-stationkeep-hold-verb` actually rejects (at or below
  `FuelParams.StationKeepReserveTons`); an earlier draft described it as
  "zero held fuel", which would have shipped copy reading "no fuel" to a
  fleet holding 0.4 t against a 1 t reserve.
- **BREAKING: retire `board-view`.** Its surviving requirements are re-ADDED
  under the two capabilities above with their substance preserved — a claim
  that has now been **verified mechanically**, requirement by requirement and
  scenario by scenario, against the live `openspec/specs/board-view/spec.md`,
  rather than asserted. That audit was necessary because the
  retire-and-re-ADD structure **removes the archiver's protection**: the
  archiver verifies that a MODIFIED block reproduces every scenario the live
  requirement carries, and a re-ADD under a *new* capability is invisible to
  it, as it is to `openspec-reconcile.py`. Five clauses or scenarios had been
  silently dropped and are restored here: a selected bare point's **visible
  selected mark**; the camera's **pan clamp** scenario; **keyboard pan**;
  pinch zoom **keeping the centred point fixed**; and the touch threshold's
  **exactly-at-8px** case. A sixth — the carve-out saying a gate-aware lookup
  used only to present a gate's facts is not a forbidden kind-specific branch
  — is restored because the requirement still mandates that presentation.
  Four further scenarios were **merged** rather than dropped (zoom min/max
  into one clamp scenario, pinch in/out into one, camera-survives-selection
  and camera-survives-refetch into one, and the sale and refuel balance
  announcements into one) with their substance intact; and two — "A drag that
  pans the camera does not change the selection" and "Clicking outside the
  lattice still clears the selection after pan and zoom" — were redistributed
  into surviving scenarios, the latter now restored explicitly as a
  post-camera-movement clearing case. Its two
  requirements with no continuous-space equivalent — *The Board Renders on
  the Polar Lattice* and *Board Coordinates Are Ring-and-Slot Throughout* —
  are dropped outright, with no successor. Two further deliberate narrowings
  are recorded rather than silent: *Board Glyph Selection Is Keyboard-
  Operable* covered **fleet** hit targets, which have no successor because
  the space view draws no fleet selection affordance at all (stated in
  *Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a
  Point*); and *Board Respects Reduced-Motion Preference*'s "fog-band state"
  clause has no successor because there is no fog model. A capability cannot be retired
  via REMOVED deltas (the archiver rejects a spec left with zero
  requirements), so this change carries no `specs/board-view/` delta at
  all; `openspec/specs/board-view/` is hand-deleted after this change
  archives (`polar-lattice-math` and `observation-fog-and-scan` are both
  confirmed-absent precedents for this exact mechanic). The rehearsal of that
  mechanic on a copy of the tree is a task in this change, not an assertion in
  its design doc.
- **REMOVED `system-interior`'s *Interior Read Endpoint*, re-ADDED as *Interior
  Read Serves Continuous Bodies*: remove every polar-lattice field from the
  wire.** The additivity clause is withdrawn, and a body loses `footprint`, its
  lattice `orbit` object (`ring`/`angle0`/`period`/`dir`), its top-level
  `parentId`, `fixed`, `band`, `live`, and `asOf`; a lane-gate body loses
  `cell`; and the response itself loses the top-level lattice `radius`, whose
  successor is the continuous `extent`. The continuous `orbitElements` set,
  the `extent`, and the world-clock `scale` that
  `serve-orbital-elements-and-burn-preview` added all stay — and the `extent`
  is what lets this view's camera, pan bound and pick radius scale to a
  system without reading `radius`, which is why link 9's removal of
  `backend/board`/`backend/polar` stays a pure deletion. (Task 10.11's grep
  looks for `@/lib/board`/`@/lib/polar` **imports**, so a view scaling off a
  lattice-derived *wire field* would pass it silently.) **This is what
  unblocks link 9**: while this response promised lattice fields, a caller
  could still be reading them. It is a retirement-and-re-add rather than a
  MODIFIED block because two of the old requirement's scenarios assert the
  removed fields survive, and `openspec archive` refuses a MODIFIED block that
  sheds a scenario the current spec carries (design.md Decision 10).
- **ADDED `system-interior`'s *Lane-Gate Bodies Carry Their Body Id*: the
  lane-gate DTO gains `id`.** The one addition inside an otherwise subtractive
  wire edit. Once `cell` is gone the gate body has no identity on the wire,
  yet the burn command must name exactly the id `fleet.attachedTo` reports —
  a string built by an unexported server convention already hand-mirrored in
  three backend packages. Serving it stops a fourth copy landing on the
  client, where no Go test can reach it (design.md Decision 15). **MODIFIED
  `system-interior`'s *Lane-Gate Bodies Carry Their Lane Id*** in the same
  delta, because it names `cell` as `laneId`'s companion field and this
  change deletes `cell`; the companion becomes `id`.
- **MODIFIED `galaxy-view`'s *Jump Commit*** to cite `docked-fleet-actions`'s
  rejection-copy requirement instead of `board-view`'s. The citation sits
  inside a requirement body, so it is delta-reachable and is fixed now rather
  than left dangling at a retired capability. **MODIFIED `galaxy-view`'s
  *Drill-In Navigation to the System Board*** and **`fleet-roster`'s *Active
  and Here Highlighting*** to retire "hex board" / "board" wording that named
  the retired lattice concept.
- **Fix two live `board-view` defects during the move rather than carry
  them forward**: a requirement that cited a header that never existed
  (*Board Picking Resolves to the Entity Under the Pointer*, twice — the
  real title is *...Resolves to the Feature, Cell, or Lane Gate Under the
  Pointer*) is corrected by construction; and *Renderer Unavailability Is an
  Explicit State*'s enumeration of "today: scan" — a control the client has
  never had — is corrected to name the verbs that actually exist, **including
  cut drive and stop**, so a player whose graphics context drops mid-burn can
  still end the burn.
- **Fix a confirmed production defect against an already-live requirement.**
  `commitSell` (`frontend/components/board/SystemBoardView.tsx:356`) mints
  `newOperationKey()` and calls `sell.mutate(...)` unconditionally, with no
  synchronous guard; the only protection is `disabled={!committable}` driven by
  `sell.isPending`, an async React-Query flip that needs a render cycle. Two
  clicks in one tick both enter the handler and each mints its **own** key, so
  server-side idempotency-by-key structurally cannot dedup them — a double
  charge on this economy's first credit sink. The **refuel** twin had the
  identical defect and reproduced 4/4 in Playwright; it was fixed in
  `41e3c46` with a hand-rolled `refuelCommitRef`, so refuel is correct today
  and sell is the one still broken. That fix is the proof the guard shape
  works; task 8.4 migrates it onto the shared helper.
  `board-view`'s *Sell Control Guards Against Double-Submit* says "disabled
  **from the moment of commit**", and an earlier review of this change ruled
  the requirement "already correct and already live" and declined to
  strengthen it. **That ruling is overturned here.** `commitSell` was written
  against that exact sentence, and `disabled={!committable}` — driven by an
  async React-Query pending flip — is a defensible reading of it. A
  requirement a competent implementer can satisfy while shipping the defect
  is not already correct. Both the sell and the refuel guards therefore now
  carry the sibling sentence the mine and burn/jump guards already carried:
  the guard takes effect **synchronously, within the same invocation that
  submits the request — before any operation key is minted** — and never via
  a state flip that reaches `disabled` a render later. The code fix remains a
  task with a Playwright-level scenario; what changes is that the requirement
  now forbids the reading that produced the defect. Burn and mine get the
  same guard, from one shared helper.
- **Cut every remaining frontend tether to the lattice**, which is larger than
  the component tree: `frontend/lib/types/action.ts` imports `Cell` and
  `Target` from `@/lib/board` for `params.origin`/`params.target`, both already
  dead against the live wire; the two lattice e2e suites (`board.spec.ts`,
  `board-camera.spec.ts`); and `frontend/app/spike/webgl-board/`, which is a
  bench for the renderer being deleted.
- **Delete `frontend/app/spike/space-3d/`** — its production successor now
  exists in `frontend/components/space/` and `frontend/lib/space/`; keeping
  the spike leaves a second, divergent implementation of production
  kinematics with its own passing test suite, the artifact most likely to
  mislead the next agent.
- **Close the anti-mirror check's case-sensitivity hole.**
  `check-mirror-map.sh` compares Go and TypeScript function names with
  `comm -12`, case-sensitively, so Go's `ArcParam`/`Speed`/`StateAt` against an
  idiomatic TypeScript `arcParam`/`speed`/`stateAt` collide zero times and the
  check passes. Since this change is the first to put any TypeScript under
  `frontend/lib/space`, it is the change that must make that guard real. The
  fix comes in two halves: **MODIFIED `cross-stack-determinism`'s *Shared
  Board Math Is Pinned By a Cross-Language Golden Fixture*** to say the
  comparison and the `sharedNames` match are case-insensitive and that a
  collision is resolved by renaming the TypeScript, and then the script change
  itself. Widening the requirement first is deliberate: a check stricter than
  the requirement it enforces is one a future agent can "fix" back while
  following the spec. **Two further holes in the same check close with it**:
  its TypeScript scan globs `"$TS_DIR"/*.ts` — one directory level, `.tsx`
  excluded — so a mirror one folder down or in a `.tsx` file is a silent
  pass; and its Go side is `grep -hE '^func '`, which enumerates
  **unexported** functions too, so `resolvePosition`, `bernsteinPoint`,
  `flightSeconds`, `coveredLength`, `octantOf`, `floorMod` and their siblings
  are reserved names an implementer will otherwise reach for. Both are stated
  in the requirement and fixed in the script, and the regression twin is
  placed in a subdirectory so the recursion is what proves it.

## Impact

- **Affected specs**: `system-space-view` (new), `docked-fleet-actions`
  (new), `board-view` (retired — no delta in this change; hand-deleted
  post-archive), `system-interior` (*Interior Read Endpoint* REMOVED, re-ADDED
  as *Interior Read Serves Continuous Bodies*), `galaxy-view`, `fleet-roster`
  (two requirements MODIFIED, one of them RENAMED),
  `cross-stack-determinism`.
- **Affected code**: `frontend/components/board/*` is replaced by new
  `frontend/components/space/*` + `frontend/lib/space/*` (render math lives
  under `lib/space` specifically so `check-mirror-map.sh`'s anti-mirror pass
  can see it — that check scans `frontend/lib/space` only, so a rule-bearing
  function placed instead in `frontend/components/space/` would pass every
  gate unseen; this is a stated, reviewed exception, not a guarantee);
  `frontend/lib/types/system-board.ts`, `frontend/lib/types/action.ts`'s
  lattice imports, `frontend/app/spike/webgl-board/` and
  `frontend/app/spike/space-3d/` are deleted; `frontend/e2e/tests/board.spec.ts`
  and `board-camera.spec.ts` are deleted and the four remaining suites that
  use board test ids are rewritten; `backend/system` loses the lattice fields
  from the interior read DTO, including the top-level `radius`; `.claude/scripts/check-mirror-map.sh` gains a
  case-insensitive collision comparison and a recursive, `.tsx`-inclusive
  TypeScript scan; `frontend/lib/services/fleet-service.ts`
  gains `preview`, `hold` and `release` with hooks over them;
  `frontend/components/fleet/FleetRoster.tsx` and
  `frontend/components/fleet/roster-commands.ts` gain the command-surface
  scoping and lose the unconditionally-offered dead Burn control, with
  `frontend/components/galaxy/GalaxyView.tsx` declaring roster ownership and
  `frontend/components/space/SystemSpaceView.tsx` declaring its own; and
  `frontend/hooks/use-board-realtime.ts` is deleted.
- **Sequencing**: archives after `serve-orbital-elements-and-burn-preview`
  (this change's `system-interior` re-ADDED body is authored against that
  change's post-archive text, including the `orbitElements` set and the
  world-clock scale) and before `delete-the-lattice`.

## Exit criterion

A human can spawn, see their home system rendered in continuous space, burn
to a body, dock, mine, sell, refuel, fly to a lane gate, and jump — entirely
through the new view — proven by a Playwright journey against the real
stack. A green unit/component suite and an end-to-end test through the real
router are not, by themselves, evidence of this: link 5's own record shows
a green suite surviving four consecutive states in which a human player was
stuck, and the sell double-submit defect this change fixes survived a green
unit test written in a shape that could not observe the failure.

# Design — add-mine-ui

## Context

The mine verb's backend is complete and archived (`add-mine-extraction`):
`POST /v1/fleets/{fleetId}/mine {featureId, kind, tons}` commits through the
action spine, rejections carry distinguishable reasons, resolution appends the
exactly-once lode delta and credits `fleet.cargo`, and fleet reads serve an
owner-only `roster` DTO (`ships`, `cargo`, `cargoCapacity`, `freeHold`). The
board (`hex-board-view`) already runs the select→preview→commit shape for
move, scan, and depart, and `use-actions.ts` already surfaces a fleet's
running action by type (the scan overlay reads it). What's missing is the
verb's UI: nothing on the board offers Mine, the hold is invisible, and the
slice loop has no e2e proof.

Relevant precedents this design follows rather than reinvents:

- Verb commits live in `fleet-service.ts` (`order`/`cancel`/`scan`/`travel`)
  with mutation hooks in `use-fleets.ts` (`useScan(systemId)` is the model).
- Running-action detection is `useRunningScan`'s pattern: query
  `queryKeys.actions.running(fleetId)`, select by `type` + `status`.
- The board's realtime rules (`use-board-realtime.ts`) already self-schedule
  refetches off own-fleet ETAs and the running scan's ETA.
- The client mirrors backend tuning only under golden-fixture guard
  (`ORBIT_BASE_PERIOD`); nothing else duplicates server params.

## Goals / Non-Goals

**Goals:**

- Offer, preview, and commit a mine run from the board's facts panel with
  the same interaction grammar as move/scan.
- Make the hold visible: cargo by kind, used/total capacity, on the board's
  fleet panel.
- Render a running mine honestly everywhere the fleet's activity shows: the
  board (busy movement channel, countdown, cancel) and the roster panel
  ("Mining", countdown).
- Close the slice with one e2e: move → scan → mine → hold fills → depart →
  return → cargo and depletion persisted.

**Non-Goals:**

- Surfacing lode *remaining* through the fogged interior read — a
  backend/fog change (`system-interior`/`observation-fog-and-scan`) deferred
  to its own change. The UI clamps to free hold only.
- Mining progress animation beyond a countdown (no ore-particle FX; the FX
  budget stays with scan's arc).
- Any change to mine's backend semantics (preconditions, clamps, ledger).
- Multi-kind runs, "mine everything" convenience, hold management (jettison,
  transfer) — later verbs.

## Decisions

### 1. The tonnage clamp is free hold only; the lode's truth stays server-side

The design doc sketches `min(freeHold, lode-as-known)`, but the interior read
does not carry a remaining-tonnage field, and inventing one is a fog-rules
change with real questions (whose observation? as-of when?). Rather than
grow this change into the fog layer, the input clamps to `freeHold` (which
the roster DTO already serves) and the server stays the authority on the
lode: a fully-depleted lode rejects at commit with its distinguishable
reason, and a partial lode clamps at resolve with an honest outcome ("lode
ran dry at 22t"). This is exactly the backend's "prospect by doing" stance —
scan-first is the smart play, not a gate. *Alternative considered:* adding
`remaining` to the interior read now — rejected as scope creep that would
pull `observation-fog-and-scan` and `system-interior` into a UI change.

### 2. The ETA preview divides by a server-served mining rate

`eta = tons ÷ fleetMiningRate` needs the rate client-side. The roster DTO
serves derived stats already (`cargoCapacity`, `freeHold`) but not the rate,
so the backend adds one field: `miningRate` on `rosterDTO`
(`backend/fleet/handler.go`, derived via the same `DefaultClassStats()`
path). *Alternative considered:* mirroring the seed-class stats table into
the client like `ORBIT_BASE_PERIOD` — rejected: that mirror exists only
because `stateAt` must fold orbits offline every frame; a preview divisor
has no such constraint, and a client stats table drifts as ship classes
grow. One additive DTO field keeps a single source of truth. The preview is
advisory; the server's commit-time ETA (returned on the action) is the one
the countdown uses.

### 3. Mine anchors to the docked fleet, not to a selection

The mine offer lives on the "Your fleet" card, shown whenever (a) the
acting fleet's effective state is `docked` to a feature carrying visible
`resources` and (b) the movement slot is free (no running mine, not
burning). No selection is involved: a fleet can only mine what it is
docked to, so a feature selection carries zero information the fleet's own
state doesn't already hold — and requiring one would mean clicking the
body directly underneath the docked fleet's glyph, a pixel-finicky gesture
for players and an offset-magic-number gesture for the e2e. (*Revised
during implementation — the first cut required selecting the docked
feature, and the slice e2e immediately exposed how hostile that gesture
is.*) The offer sits beside the hold readout it fills. Kind picker options
come from the docked feature's visible `resources[]`; default kind is the
richest; default tonnage is the free hold ("fill the hold" per #0010
Decision 6), clamped client-side only as far as "positive, ≤ freeHold" —
the server's distinguishable rejections are the real validator and surface
as error toasts, matching move's error contract.

### 4. Running-mine state reuses the scan plumbing, on the movement channel

A `useRunningMine(fleetId)` selector joins `use-actions.ts` beside
`useRunningScan` (`type === 'mine' && status === 'running'`). While it
exists: the mine and move controls disable with a countdown to the action's
ETA (the frozen server ETA, via world time — the same countdown math the
scan control uses); scan stays enabled (independent sensor channel, the
mirror image of "scan while burning"); a cancel-mine control appears,
wired to the generic action cancel endpoint (`action-service`), matching
the backend's "cancelling a running mine uses the generic endpoint". The
board's realtime refetch rules add the running mine's ETA to the set they
already self-schedule against — at resolution the fleet read (cargo) and
the actions read both refetch, so the hold visibly fills at ETA.

### 5. The roster panel reads actions once, per owner — not per fleet

"Mining" in the roster panel needs fleet→running-mine knowledge. The inbox
endpoint is actor-scoped, so the roster's mounting views (galaxy + board)
derive labels from the one running-actions query already cached by React
Query (`queryKeys.actions.running`), mapped by fleet id — no per-row
fetching, no new endpoint. A docked fleet with a running mine shows tone
`moving`-class activity "Mining" plus the countdown; when the mine
resolves, the existing invalidation restores "On station". The roster
requirement's "derived purely from movement state" language relaxes to
admit the running-action input — that is the spec-level change.

### 6. The slice e2e is one journey, not a scenario grid

`frontend/e2e/tests/slice.spec.ts`: spawn a fresh corp → scan home → pick
the nearest revealed lode → move + dock → mine a minimum-size run → the
hold fills at the ETA → reload (persistence: a fresh Firestore read) →
mine again (the ledger accumulates, 5+5=10) → depart through a charted
gate and assert the galaxy hand-off + the roster's trip row. Unit/vitest
coverage owns the per-state matrix (offer gating, clamp, disabled states,
error toasts); the e2e owns the loop.

**Scope call (implementation-time):** the test stack runs the world at
scale 1 — `useWorldTime` assumes scale 1 and no read ships a scale, so
warping `WORLD_TIME_SCALE` for tests would desync every client countdown
and self-scheduled refetch. A single lane leg is 104–300s at this scale,
which makes the original "depart → return → assert" round trip a 5+ minute
test. Persistence is therefore proven by the reload (the same fresh read a
returning fleet would issue) and the departure is asserted to its hand-off,
not its arrival. Riding the full round trip becomes cheap if/when the
world-scale plumbing (server-shipped scale) lands.

## Risks / Trade-offs

- **[ETA wall-clock in e2e]** Every ETA is real time on the test stack
  (scale 1): scan 15s, burn 2.5s/hex, mining 1s/ton → the journey picks the
  nearest lode and minimum-size runs (5t = 5s), and skips the lane-length
  waits (see Decision 6's scope call); the whole spec budgets 240s.
- **[Free-hold-only clamp under-informs]** A player can commit 200t at a
  20t lode and get 20t → the outcome reporting ("lode ran dry at 20t") is
  the honest feedback loop, and the commit rejection catches the
  fully-depleted case; remaining-through-fog is tracked as the follow-up.
- **[Roster label divergence]** Two activity sources (movement state +
  running actions) can disagree during cache staleness → the mine label
  wins only while the action's ETA is in the future by world time; past-ETA
  actions render as their movement state (the fold's own convention).
- **[Kind picker on stale intel]** A remembered feature's `resources` may
  omit kinds (fog) → the picker offers what the player sees; committing a
  kind the server knows is absent returns the distinguishable rejection and
  toasts — no client-side guessing.

## Migration Plan

Additive throughout: one new DTO field (backend), new frontend surface, new
tests. No data migration, no breaking API change; deploy backend first (the
field is `omitempty`-adjacent additive, old clients ignore it), frontend
after. Rollback is a straight revert.

## Open Questions

*None blocking.* Starting UX copy (tonnage input step, "fill hold" wording)
is implementation-time polish; the `data-testid` names follow the existing
board conventions checked by `/check`.

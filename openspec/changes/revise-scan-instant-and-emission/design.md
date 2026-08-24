# Design — Revise Scan: Instant Mint + Emission Cost

## Context

The scan verb today is a 15s action on the #0005 spine's sensor channel:
`fleet.Scan` commits with a frozen ETA and pinned emission hex,
`observation`'s registered resolver mints at resolve time from that hex,
and a growing echo disc joins live coverage while the scan runs
(`observation.echoDisc`). The duration implies a speed of light ~5× ship
speed — the semi-realism break that motivated this change (see
proposal.md). The agreed shape (Travis, 2026-08-24): scan is instant;
its cost is emission, not time; passive ambient shrinks to 2 hexes.

Current wiring that matters:

- `fleet` already imports `observation` (params, `FleetPos`); `observation`
  never imports `fleet` — it consumes fleets through its own `FleetSource`
  interface, which `fleet.Service.FleetsForCorp` implements. So fleet can
  call an observation service directly without a cycle.
- The only way a scan ever revealed a **foreign fleet** was the running
  echo disc counting as live coverage for the 15 seconds. Remove the disc
  naively and a ping can no longer detect ships at all — see Decision 4.
- `hex-board-view` paces its sweep FX and poll tightening off the running
  action's window; all of that wiring goes away.

## Goals / Non-Goals

**Goals:**

- Scan mints synchronously at commit, from the fleet's live hex, whole
  board, LOS-filtered — mechanics identical to today's resolve, minus the
  wait.
- Emission cost: every other corp with board presence in the system gets a
  contact marker (hex + time, no identity).
- A ping still detects ships: LOS-clear foreign fleets at ping instant
  become stored sightings for the scanning corp.
- Ambient radius 2; live coverage = ambient bubbles only.
- ~2s client-side bloom replaces the 15s sweep FX; ArcScan stays shelved.
- Ownership required to scan a fleet (closes the documented
  no-ownership-check wart, which emission turns into a griefing vector).

**Non-Goals:**

- No cooldown/energy cost on scan (revisit if spam becomes real; rate
  limiting middleware is the interim backstop).
- No contact/sighting identity, no fleet detail on either record — combat
  design decides later what a sensor return discloses.
- No SSE fan-out of contact minting (other corps learn on their next read;
  realtime push is a follow-up when combat needs it).
- No change to ambient-on-move, travel arrival, spawn reveal, graph tiers,
  lane charting — the sweep's mint semantics are preserved verbatim.
- No directional scan; ArcScan remains an unwired FX flavor.

## Decisions

### 1. Scan leaves the action spine (synchronous verb, like spawn)

`fleet.Scan` validates (board presence, ownership), resolves due movement
if needed, computes the live position, and calls the observation service
directly to mint — one round trip, no action doc, no sensor channel.
`ActiveScanId` and `action.SlotSensor` usage are removed; the observation
`ScanResolver` is replaced by a **tombstone resolver** that completes any
legacy running scan action without minting (so the sweep/`ResolveDue`
never trips over an unregistered type). Alternative considered: keep the
spine with a ~0 ETA — rejected, it keeps all the machinery (slots, fizzle,
resolve-on-read) for no gameplay and the spine exists for *waits*.

Wiring: `fleet.Service` gains an injected `observation` interface
(defined in fleet, implemented by `observation.Service`) with one method —
mint-scan-now — mirroring how observation consumes fleet via `FleetSource`.

### 2. Emission contacts and ping sightings are ONE record type

A `contact` observation: `{systemId, hex, at, via}` where `via` is
`emission` (someone else pinged — you hold their emission hex) or
`sighted` (you pinged and saw a foreign fleet). No identity either way.
Minting, in the scan transaction path:

- For every **other** corp with a fleet on the board at ping instant:
  write them an `emission` contact at the scanner's hex.
- For every LOS-clear foreign fleet on the board: write the **scanner** a
  `sighted` contact at that fleet's hex. (Occluded ships stay hidden —
  hiding behind a planet beats the ping, same law as features.)

Presence set comes from a new `FleetSource` method (fleets in system
across corps — the board read already lists these; reuse that query).
Storage: a `contacts` subcollection under the corp's observation store,
append-only; contacts are memory (never spoiled, never updated). Board
reads return the viewer's contacts for that system; rendering freshness
is a client dial. Alternative — ephemeral post-ping live-coverage window
instead of sightings: rejected; stored stale sightings are the combat
texture we want (fight on old data), and ephemeral coverage resurrects
the timing machinery we just deleted.

### 3. Realism knobs: instant mint, `ScanDuration` deleted, ambient 2

`GameTuning.ScanDuration` is removed (nothing in the world costs it);
the bloom's 2s lives in the frontend's theater dials
(`PING_TUNING`-style constant in `scan-ping.ts`). `AmbientRadius` 3→2 in
`tuning.go`. `observation.ScanParams` dissolves (nothing left to tune
server-side). The fiction is now literal: light is instant on ship
timescales; the bloom is your eye catching up.

### 4. Bloom is pure theater, client-clocked

On a successful scan response the board plays the radial ScanPing bloom
from the fleet's hex: `committedAt = now(client world clock)`,
`eta = committedAt + BLOOM_MS`, reusing `echoFrontHexes`/`echoReturns`
against the *post-refetch* feature set (the mutation invalidates
board/fog queries immediately; data lands well inside the bloom). Blips
still pop nearest-first — the reveal drama survives at 2s. The
countdown, scan-disabled-while-running, pinned-origin rendering, and
scan-tightened polling all come out. The scan button disables only while
the request is in flight.

### 5. Ownership check on all three command endpoints

Handler resolves `common.ActorCorp`; service rejects with `ErrForbidden`
(403) when the fleet's `corporationId` differs — on **orders, cancel, and
scan**. The existing spec documents all three as one "suspected
authorization defect" block; emission turns the scan half into a live
griefing vector (ping *someone else's* fleet to light them up), and
fixing scan alone would leave move/cancel griefable inside the same
rewritten requirement. Alternative considered — scan-only, deferring
move/cancel: rejected as perverse (the deferred halves are strictly
worse holes).

## Risks / Trade-offs

- [Deploy cuts over mid-scan: legacy running scan actions never mint] →
  tombstone resolver completes them cleanly; worst case one 15s scan is
  lost at deploy time (solo world, acceptable). Stale `activeScanId`
  values are ignored and dropped on next fleet write.
- [Scan is free → spam pressure on Firestore] → each ping is one bounded
  txn (features + ≤corps-present writes); rate-limit middleware is the
  backstop; a cooldown knob is the declared future fix if needed.
- [Foreign-fleet visibility tightens sharply (ambient 2, no echo disc):
  the game gets much stealthier, which could feel blind before pings are
  habitual] → intended (EMCON design); the first home scan is already the
  taught verb, and sightings give pings a visible payoff.
- [Old frontend against new backend] → endpoint shape unchanged (returns
  the fleet); an old client just sees no running scan and no countdown.
  Deploy backend first.
- [Contacts grow unboundedly] → append-only, tiny docs, one corp writes
  per ping per listener; pruning/TTL deferred until it matters.

## Migration Plan

Single deploy, backend first. No Firestore index changes (contacts are
read by systemId within one corp's subcollection — single-field). No data
migration: `activeScanId` becomes a dead field (ignore-on-read), legacy
scan actions tombstone-resolve on their next sweep/read.

## Open Questions

- Contact retention/rendering window (currently: store all, client fades
  by age) — revisit with combat.
- Whether sightings ever carry identity/class at higher sensor tiers —
  combat-era decision, the record shape leaves room (`via` today, more
  fields later).

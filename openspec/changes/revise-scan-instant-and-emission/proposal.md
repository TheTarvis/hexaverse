# Revise Scan: Instant Mint + Emission Cost

## Why

The 15-second scan breaks the game's semi-realism: its echo front implies a
speed of light only ~5× ship speed (a burning fleet crosses 6 of the board's
16 hexes while "waiting for light to return"). Scaling the ping to a
plausible light speed makes it effectively instantaneous — which also reads
better on the board (the ship hasn't left its hex) and simplifies the
mechanics. The time cost the duration was providing is replaced by the cost
that actually serves the upcoming combat design: **emission** — pinging
shows you the system, and shows the system you (active-ping vs
passive-listening, decided with Travis 2026-08-24).

## What Changes

- **Scan resolves instantly at commit.** The reveal mints synchronously in
  the scan order from the fleet's current hex (LOS-filtered, whole board —
  the sweep itself is unchanged). No ETA, no running state, no
  resolve-at-eta path.
- **Scan leaves the action spine.** The sensor channel (`activeScanId`) is
  retired; scan becomes a synchronous verb like spawn. The fizzle path
  (fleet left the system before eta) and the late-resolve `asOf: eta`
  semantics disappear with it — there is no window to leave in.
- **The running-scan echo disc is removed from live coverage.** Live
  coverage becomes ambient bubbles only; everything else is remembered
  memory between pings.
- **Emission cost (new):** a scan mints a **contact marker** — hex +
  world-time, no identity, no fleet detail — for every *other* corporation
  with a fleet on that system's board at ping time. Backend-complete in
  this change; the board renders known contacts as a minimal fading marker.
- **Ownership check on scan** — **BREAKING** (of a documented wart): scan
  currently commits for any authenticated caller on any fleet. With an
  emission cost this becomes a griefing vector (force an enemy to reveal
  itself), so scan now requires the acting corp to own the fleet, matching
  move/cancel.
- **The 15s sweep visual is replaced by a ~2s theatrical bloom** at the
  emission hex (the radial ScanPing look; blips pop nearest-first as the
  bloom front passes). Pure theater — the intel is already minted. ArcScan
  stays shelved for the future directional/lock verb.
- **Passive ambient radius 3 → 2 hexes** (tuning) — the always-on live
  bubble shrinks; upgrades raising it remain the deferred progression axis.
- **`ScanDuration` leaves `GameTuning`** — the bloom's pacing is a
  frontend theater dial, not world pacing.

## Capabilities

### New Capabilities

*(none — the contact marker is fog/intel and lands in
`observation-fog-and-scan`)*

### Modified Capabilities

- `observation-fog-and-scan`: scan resolution becomes mint-at-commit from
  the fleet's live hex (no frozen effect time, no fizzle); the Running Scan
  Echo Disc requirement is removed; a new Scan Emission Contact requirement
  is added; fleet audience visibility loses the echo-disc term.
- `fleet-movement`: the Sensor Scan Order requirement is rewritten —
  synchronous verb, no sensor channel, no single-slot gating, ownership
  required; the two-channel requirement collapses to the movement channel.
- `board-view`: running-scan rendering (pinned sweep, countdown,
  scan-disabled-while-running, tightened polling) is replaced by the
  commit-time bloom and a refetch-on-response; contact markers render.

## Impact

- **Backend**: `observation/` (mint path, coverage, contact records, params),
  `fleet/` (scan handler/service — synchronous now; drop `activeScanId`),
  `action/` (scan resolver unregistered; spine untouched otherwise),
  `common/tuning.go` (drop `ScanDuration`, `AmbientRadius` 3→2). Firestore:
  contact-marker records under the observation store; `activeScanId` field
  becomes dead (ignore-on-read, remove at leisure).
- **Frontend**: `components/board/` (ScanPing → bloom pacing from a local
  theater dial; remove countdown/disable/poll-tightening wiring; contact
  marker glyph), `lib/services/fleet-service.ts` response shape,
  `hooks/` scan mutation invalidation (instant refetch).
- **Specs**: the three deltas above; `docs/specs/0006` gains a decision
  record (instant scan, emission cost, radius 2).
- **No agent-service impact** (no scan tool exists).
- **SSE**: scan completion events no longer flow (nothing async to
  announce); contact minting MAY publish on the existing action-events
  channel later — out of scope here.

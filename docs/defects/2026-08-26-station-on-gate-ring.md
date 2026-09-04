# Defect: a station's placement span uses `boardRadius`, not `board.GateRing`, so it can still land on the real lane-gate ring

**Filed:** 2026-08-26, by the `migrate-consumers-to-polar-board` change
(tasks.md 2.8), while renaming `stations`' `gateRing` field/parameter to the
correct noun `boardRadius`.
**Status:** dissolved (openspec `delete-the-lattice`, 2026-09-04)
**Against:** `trading-station` ("never on the gate ring") and
`stations/placement.go`'s `DeriveOrbit`.
**Severity:** low — a station on the real lane-gate ring collides with a
lane's departure point, making "burn to the gate" and "burn to the station"
name the same cell for that one lane. No known live occurrence; the window is
three rings wide (13–15 under the current radius-16 default).

## Repro

`DeriveOrbit(galaxySeed, systemID, boardRadius)` places a station on a ring
drawn uniformly from `[1, boardRadius-1]` — i.e. `[1, 15]` when
`boardRadius = common.Tuning().BoardRadius = 16`. `board.GateRing(16)` is
`16 - 3 = 13`, so rings 13, 14, and 15 are all legal `DeriveOrbit` outputs
but are NOT all safely inside the lane-gate ring: ring 13 IS the lane-gate
ring itself.

```go
board.GateRing(16)              // → 13 (the actual lane-gate ring)
DeriveOrbit(seed, sysID, 16)    // → may return Ring: 13, 14, or 15
```

A station derived onto ring 13 sits exactly on the ring every lane from this
system departs from — violating `trading-station`'s "never on the gate ring"
requirement.

## Why this wasn't fixed as part of the rename

`migrate-consumers-to-polar-board` (tasks.md 2.8) renamed the misleading
`gateRing` field/parameter name to `boardRadius` — the value was always the
board radius, never `board.GateRing(boardRadius)` — but explicitly left the
*value* unchanged: the rename's job is to stop the code lying about what the
number is, not to change gameplay placement behavior inside a
compile-restoration sweep with a fixed, narrow stated impact. Fixing the
placement span requires a value change (`span := board.GateRing(boardRadius) - 1`
or similar) and a decision about what happens to systems that already
provisioned a station on ring 13–15 before the fix — both out of scope here.

## Recommended fix (separate change against `trading-station`)

Change `DeriveOrbit`'s span to draw from `[1, board.GateRing(boardRadius)-1]`
(strictly inside the gate ring, matching the existing "never the gate ring"
prose) rather than `[1, boardRadius-1]`. Confirm no already-provisioned NPC
station (there is one per spawn-home system) sits on rings 13–15 before
shipping; if any do, the fix needs a one-time re-derivation or an explicit
grandfather note, since `EnsureStation` is idempotent per system and will not
re-roll an existing station on its own.

## Dissolved, not repaired (2026-09-04)

`delete-the-lattice` did not fix this. It removed both sides of it.

`stations.DeriveOrbit` is gone with `stations/placement.go`, and so is the
ring-and-slot coordinate system it drew into. A station's orbit is now derived
by `system.StationContinuousOrbit` as a continuous element set — a radius, a
period, a phase, an inclination and a node — from (galaxy seed, system id,
skeleton), and is never persisted. There is no `boardRadius` span to draw from
and no lane-gate RING to collide with: a lane gate is itself a body with its
own continuous orbit, so "the station landed on the gate ring" no longer names
a possible state.

The recommended fix above is therefore moot, and so is the grandfathering
question it raised — no station's orbit was ever stored, so there is nothing
provisioned on a bad ring to re-derive.

What survives of the underlying concern is a different, weaker question: two
bodies can still be derived to nearly the same place in continuous space. That
is a placement-quality question about `StationContinuousOrbit`, not a
correctness violation of a "never on the gate ring" rule, and it is not filed
here. Confirmed at dissolution time: this defect carried no
`fixtures/determinism-register.json` entry, so there is none to remove.

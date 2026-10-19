> Historical numbered-spec snapshot, archived 2026-10-16. Original source:
> [docs/specs/0011-fleet-roster.md](../spec-redirects/0011-fleet-roster.md). Old status/scenarios are provenance,
> not current instructions or live implementation work. Current owners are in
> [canonical documentation](../../../README.md).
> Plain-text relative paths retain the original source context.

---
number: 0011
title: Fleet Roster (where is everything?)
status: implemented   # draft | accepted | implemented | superseded
created: 2026-07-13
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0011 — Fleet Roster (where is everything?)

> One panel, mounted on **both** canvases, that answers "where are my fleets and
> what are they doing?" — a row per fleet with its location (a system, or the
> lane it's on), its current activity, and a live countdown — and takes you to
> any of them in one click.

## Problem / motivation

Once a fleet can leave a system (#0008), the player can lose it. The galaxy
shows a presence pip on a star and the board shows a hull on a hex, but neither
view answers the question the player actually has — *where is everything?* —
because each only knows its own tier: the board can't see a fleet in another
system, and the galaxy's pip is keyed on `fleet.systemId`, which keeps naming
the system a travelling fleet **left** until arrival resolves.

The symptom that prompted this (2026-07-13): after departing, the hull vanished
from the board (correctly — it was on a lane) and there was no cue anywhere that
it was in flight. "I can't tell where my fleet(s) are."

This gets worse, not better: #0010's mine, and every fleet the player later
builds, multiply the number of things running unattended on a timer. A single
place to see them all is infrastructure, not polish.

## Goals

- **One answer, both canvases.** The same panel on the galaxy and on a board, so
  the answer never depends on which view you're standing in.
- **Location includes the lanes.** A fleet between stars reads as
  `Origin → Destination`, not as "in the system it left".
- **What it's doing, and when it's done.** The activity in the player's words,
  with a live countdown on any order that has an ETA.
- **One click to it.** A row takes you to the fleet: select it on the board it's
  on, glide the camera to it on the galaxy, drill into its system from elsewhere.
- **Derived, never stored.** The status comes from the same `(state, worldTime)`
  the views animate from, so the roster can't disagree with the picture.

## Non-goals

- **Fleet composition / cargo / ships.** #0010 adds `ships[]` + `cargo`; the row
  gains a line then. The roster is *where and what*, not *what's aboard*.
- **Commanding from the roster** (move / scan / cancel from a row). The verbs
  stay on the view that has the geometry; the roster only navigates.
- **Grouping, renaming, or ordering fleets.** One hull today; a flat list is
  honest until there are enough to organize.
- **Foreign fleets.** The roster is the player's own; what they can see of others
  is #0006's business, drawn on the board.

## Proposed approach

A `FleetRoster` component (`frontend/components/fleet/`) that **owns its reads**
— `useMyFleets` for every own fleet galaxy-wide (transit included; the endpoint
already returns exactly this), `useGalaxy` for system names — so a view mounts it
with one line. The **world clock comes in as a prop**, because both views already
run one and the countdown must tick in step with the picture beside it.

Each row is derived by a pure `fleetStatus(fleet, worldTime, nameOf)` that reads
the movement state as a sentence: *where* (a system name, or `A → B` on a lane),
*activity* (on station / under way / docking / departing / in transit / holding
mid-lane), a *remaining* ETA where one exists, and the *system to open* when the
row is clicked — `null` for a fleet on a lane, which belongs to no board.

Clicking a row hands the fleet back to the mounting view, which decides what
"go to it" means at its tier: the board selects it (or drills into its system, or
falls back to the galaxy for a fleet on a lane); the galaxy selects and glides to
its star, or glides to its computed point on the lane (`transitPoint`, #0008).

It **subsumes the transit banner** #0008 shipped: same information, one home.

## Design details

- **Where it lands:** `frontend/components/fleet/FleetRoster.tsx` (the panel) +
  `fleet-status.ts` (the pure derivation, unit-tested without a clock or a
  fetch). Mounted by `components/galaxy/GalaxyView.tsx` (left column, under the
  intel panel) and `components/board/SystemBoardView.tsx` (left column, opposite
  the facts panel). `lib/eta.ts` holds the shared countdown label, previously
  private to the galaxy view.
- **Layering** (`frontend/CLAUDE.md`): component → hook → service. The roster
  calls no service directly and holds no fetch of its own; `useMyFleets` is
  already the galaxy-wide fleet read.
- **The tone accent** encodes urgency, not mode: idle (nothing to watch), moving
  (an order is running), transit (out on a lane), held (parked mid-lane after a
  cancel — the one state that wants a decision, so it pulses amber).
- **Empty is silent.** No fleets (pre-spawn, or the logged-out start area) →
  the panel doesn't render at all, and the read is disabled.
- **Collapsible**, defaulting open; the header carries the count so a collapsed
  roster still says how many hulls you have.

## Scenarios

### S1 — Every fleet is listed with where it is and what it's doing

- **Given** a corporation with fleets in different states (one on station, one
  crossing a lane)
- **When** the roster is drawn at a world time
- **Then** each fleet has a row naming its location — the system it's in, or the
  `origin → destination` lane it's on — with its activity and, where the order
  has an ETA, a live countdown *(`FleetRoster > lists every fleet with where it
  is and what it is doing`, `fleetStatus > …`.)*

### S2 — A fleet that has left is not reported as being where it left from

- **Given** a fleet whose trip is past its gate ETA (its `systemId` still names
  the origin until arrival resolves)
- **When** its row is derived
- **Then** it reads as in transit on its lane, and the row does not offer to open
  the origin board as if the fleet were still there
  *(`fleetStatus > reads a trip past its gate as in transit, belonging to no
  board`.)*

### S3 — A row takes you to its fleet, whatever tier it's on

- **Given** the roster is open on a system board
- **When** a row for a fleet in another system is clicked
- **Then** that system's board opens *(`SystemBoardView > mounts the roster, and
  a row for a fleet elsewhere opens that board`.)*

## Acceptance criteria

- [x] The panel is mounted by **both** the galaxy view and the system board view,
      from one component — not two implementations that can drift.
- [x] The status is **derived** from `(state, worldTime)` by a pure function with
      no clock and no fetch of its own.
- [x] The roster renders **nothing** when the player has no fleets, and its read
      is disabled on the logged-out start area.
- [x] It replaces the #0008 transit banner (one home for a trip's route + ETA).
- [ ] The row carries the fleet's ships/cargo summary — **deferred to #0010**,
      which introduces them.

## Open questions

- **Naming fleets.** Rows are identified by location today, which reads fine for
  one hull and poorly for six. Player-named fleets (or generated call-signs) is
  the obvious next step — deferred until there's a second hull to confuse.
- **Alerting.** A fleet that finishes an order while you're looking elsewhere is
  silent; the roster is the natural place to surface "arrived" / "scan complete"
  without a toast the player may miss. Deferred with #0010's mining timers.

## References

- Related specs: #0008 (the trips the roster reports), #0002 (the galaxy canvas
  it mounts on), #0007 (the board canvas it mounts on), #0010 (ships + cargo,
  the row's next line)
- `../vision.md`

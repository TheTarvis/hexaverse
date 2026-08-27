## Why

`add-space-kinematics` flagged one risk forward deliberately: continuous
space turns `observation`'s exact integer-cell-set visibility tests into
knife-edge float predicates, and its Decision 1 (Go sole authority) was
recorded there as *necessary but not sufficient* for the sighting change,
with the predicate question "flagged forward, deliberately unresolved."
Its Migration Plan then lists step 2 — the sighting/fog model replacing
`observation` — as blocked on exactly that question.

Travis decided the model on 2026-08-27: **there is no fog model to preserve.**
Live visibility is proximity plus going loud on burn — no monotonic tier
ladder, no per-feature memory, nothing carried forward. That reframing
collapses most of the flagged risk rather than solving it, for two reasons
the original note did not anticipate:

- **Half the loud channel is not geometric at all.** Whether a plume exists
  at a world time is `departTime <= T < arriveTime` over
  `common.WorldMillis` integers — no float, no boundary to flip. Only its
  reach is geometric.
- **A flipped live boolean is no longer permanent.** The original hazard was
  that `observation` *mints* — a knife-edge flip wrote permanent, monotonic
  state. Recomputed per read and never stored, a flip costs one tick of
  flicker for a target sitting exactly at a detection boundary.

The README's intel model keeps one deliberate persisted artifact — the pile
of scan-minted sightings that the intel economy sells. That survives the
same argument for a different reason: a sighting is stamped `asOf` and stale
by construction, so a flip at the echo rim means a record was not minted for
something at the exact edge of a ping, indistinguishable from having pinged
a moment later. The narrow rule that keeps this safe is not "persist
nothing" but **no stored record may be consulted to decide live
disclosure**.

What remains is small enough to settle now, and settling it unblocks step 2
from the determinism side. This change records that resolution as spec
before the sighting model is designed on top of it, so the model inherits
the invariants rather than rediscovering them.

## What Changes

- Add a new capability `proximity-disclosure` holding the disclosure
  *mechanism* — the invariants every future sighting rule must satisfy —
  independent of the sighting *model* (what the ranges are, whether a
  contact carries identity, how plumes scale), which stays open.
- Fix the tie rule the kinematics design named but left unchosen:
  proximity comparison is **inclusive** (`distSq <= rangeSq`), so a target
  exactly at range is disclosed and the disclosed set is closed.
- Require squared comparisons on every disclosure path, forbidding `sqrt`
  there — the other candidate the kinematics design named.
- Require every disclosure predicate to read positions through the
  kinematics capability's canonical position entry point, closing the
  path-dependence hazard that pinning the turn table does *not* address.
- Split the loud channel: *whether* a plume exists at a world time is an
  exact integer interval test, while *whether it reaches* an observer is a
  geometric predicate over a radius derived from engine class and commanded
  acceleration, clamped to a floor so ignition is always an event.
- Preserve the README's sighting pile as a deliberately persisted artifact
  — stamped `asOf`, immutable, sellable — under the rule that no stored
  record may be consulted to decide live disclosure.
- Default the README's three open knobs (identity gating, plume scaling,
  focused-scan pricing) as named placeholder constants, calibrated against
  the PoC generator's actual scale. Identity gating starts **anonymous**,
  the restrictive direction, because loosening it later is additive and
  tightening it is an audit.
- Carry `observation`'s server-side-only disclosure discipline forward, and
  strengthen it: an undisclosed entity is absent, not masked.
- Permit client-side contact smoothing for flicker, fenced to presentation.
- Add `Vec3.DistSq` to `backend/space` — the one code affordance the
  squared-comparison rule needs. No existing `space-kinematics` requirement
  enumerates vector operations, so this needs no delta against it.

**This change adds no consumer.** Like `space` before it, the capability
sits unconsumed until the sighting model wires it up. `backend/observation`
is untouched and keeps running the live lattice game until step 7 deletes it.

## Impact

- Affected specs: `proximity-disclosure` (new capability, ADDED only)
- Affected code: `backend/space` (adds `Vec3.DistSq` and its tests). No
  other package is touched; no endpoint, no stored data, no migration.
- Explicitly NOT affected: `backend/observation` and the
  `observation-fog-and-scan` capability. Their replacement is step 2 of the
  kinematics migration plan and remains blocked on the README's open knobs
  (identity gating, plume scaling, focused-scan pricing) — this change
  removes only the determinism blocker.

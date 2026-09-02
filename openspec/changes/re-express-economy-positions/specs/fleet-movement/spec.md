## ADDED Requirements

### Requirement: Every Body In the System's Body Table Is a Valid Attachment Host
The system SHALL treat every body present in a system's `space.Bodies`
table — a planet, moon, belt member, belt feature, trading station, or lane
gate alike — as a valid attachment target: a burn order whose **target** is
a body id, and which resolves into a settled park at that target, SHALL
attach the fleet to that body (setting `attachedTo` to the body's id)
regardless of the body's type, per "Places are bodies" (`decisions.md`,
2026-08-27). No body class SHALL be excluded from attachment on the basis
of its type alone.

This is not a relaxation of the system's star already being unreachable as
a burn target: "In-System Burn Order to a Body or a Point" rejects any
order naming the star, by `space.BuildCurve`'s endpoint-clearance guard,
for kinematic reasons (the star's insertion standoff sits inside its own
clearance radius) — a burn ordered at the star never resolves into a
settled park at all, so it never reaches this requirement's attach step.
This requirement SHALL NOT be read as relaxing, overriding, or creating an
exception to that geometric rejection.

This restates `BurnResolver`'s existing behavior (`fleet/resolver.go`'s
attach-on-resolve write reads only the resolved burn's own target body id,
never a type, class, or the endpoint's incidental coincidence with some
other body's position), rather than changing it: attachment follows the
burn's **target**, never whether the burn's endpoint happens to land near a
body it was never ordered toward — a point-targeted burn that ends up
coincident with, or near, some body attaches to nothing, because that body
was never the target.

If a stored `attachedTo` names a body the current body table no longer
resolves — a derived id whose defining tuning constant was retuned after
attachment (a belt member index beyond a retuned `AsteroidsPerBelt`), or a
lane gate a degraded gate read omits — a read of that fleet SHALL still
succeed, returning the fleet with its stored `attachedTo` unchanged and
NO position, the same absent-position shape "Effective Position
Resolution" already defines for a jumping fleet, and SHALL record the
unresolved host id. It SHALL NOT panic, SHALL NOT omit the fleet from the
read, and SHALL NOT silently substitute a position derived from anything
other than the named host.

Because attachment is `proximity-disclosure`'s masking predicate's sole
input (its "A Docked Ship Is Masked and Registers Only As Its Host"),
declaring every body a valid attachment host means every body is a place a
fleet can mask itself at — including a belt member, an id distinct from
its parent belt feature's own id. A focused scan resolves only against the
exact host id it names (`proximity-disclosure`'s "A Focused Scan Reveals
the Ships Masked At Its Target"); it does **not** extend to that host's
siblings under a shared parent. A focused scan of a belt feature therefore
does not reveal a fleet masked at one of that belt's members, and a
focused scan of one member does not reveal a fleet masked at another —
finding a fleet hidden somewhere in a belt can require sweeping the
feature and each of its members in turn. This is a stated consequence of
the existing masking predicate, not a new disclosure rule invented here;
`proximity-disclosure` itself is unchanged by this change.

#### Scenario: A fleet may attach to any body class present in the system
- **WHEN** a fleet's burn order settles into a park at a planet, a moon, a
  trading station, or a lane gate
- **THEN** the fleet attaches to that body in every case, with no
  class-based rejection distinguishing one from another

#### Scenario: A fleet may attach to a belt member or the belt feature alike
- **WHEN** a fleet's burn order settles into a park at a belt member's
  position, or at the belt feature's own position
- **THEN** the fleet attaches successfully to whichever id it targeted

#### Scenario: Ordering the star is rejected before any attachment step is reached
- **WHEN** a fleet is ordered to burn to the system's star, naming its
  body id
- **THEN** the order is rejected by `space.BuildCurve`'s endpoint-clearance
  guard, per "In-System Burn Order to a Body or a Point," before any
  settled park — and therefore any attachment — is ever reached

#### Scenario: A point-targeted park coincident with a body does not attach
- **WHEN** a fleet's burn order targets an explicit point, not a body id,
  and the solved park's position happens to coincide with, or lie very
  near, some body's position
- **THEN** the fleet's `attachedTo` remains empty — attachment is decided
  by the burn's target, never by the endpoint's incidental position

#### Scenario: A sweep of a belt feature does not reveal a fleet masked at one of its members
- **GIVEN** a fleet attached to a belt member, masked at that member's id
- **WHEN** a focused scan resolves against the belt feature's own id
  rather than the member's
- **THEN** no sighting record is minted for the fleet masked at the
  member — the sweep reveals only what is masked at the exact host id it
  named

#### Scenario: A fleet attached to a body the table no longer resolves degrades, never panics
- **GIVEN** a fleet whose stored `attachedTo` names a derived body absent
  from the current body table (a belt member index beyond a retuned
  `AsteroidsPerBelt`, or a lane gate omitted by a degraded gate read)
- **WHEN** the fleet is read
- **THEN** the read succeeds, the fleet is present in the response with
  its stored `attachedTo` unchanged and no position reported (the same
  absent-position shape a jumping fleet reports), the unresolved host id
  is recorded, and no panic occurs

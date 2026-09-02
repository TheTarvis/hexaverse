## ADDED Requirements

### Requirement: The Fuel Resource-Kind Name Is Reserved From Generation
The system SHALL declare `fuel` as a reserved resource-kind name, distinct
from every `system.ResourceKind` value the generator can produce — `fuel`
is a reserved cargo kind (`fleet-movement`'s "Fleet Cargo Pool"), mined by
no verb and generated as no mineable resource, and a mineable body
generated with that name would silently collide with the cargo kind this
change introduces, corrupting either the mine-resolve credit path or the
cargo pool's own accounting depending on which one wins the collision.
This is a namespace-reservation guard, not a new gameplay rule: no
generation path today produces `fuel` as a resource kind, and this
requirement exists to keep it that way as a tested invariant rather than
an accidental absence.

#### Scenario: No declared mineable resource kind equals the reserved fuel name
- **WHEN** the set of declared `system.ResourceKind` values the generator
  can produce is compared against the reserved fuel resource-kind name
- **THEN** none of the declared values equals the reserved name

#### Scenario: The six existing resource kinds are unaffected
- **WHEN** the declared `system.ResourceKind` values are enumerated
  (metals, volatiles, water, organics, research, exotic)
- **THEN** all six are present and unchanged, since none of them collides
  with the reserved `fuel` name

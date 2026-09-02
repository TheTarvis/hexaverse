## ADDED Requirements

### Requirement: The Fuel Resource-Kind Name Is Reserved From Generation
The system SHALL reject, at generation time, a `system.ResourceKind` whose
value is `fuel` — `fuel` is a reserved cargo kind (`fleet-movement`'s
"Fleet Cargo Pool"), mined by no verb and generated as no mineable
resource, and a mineable body generated with that name would silently
collide with the cargo kind this change introduces, corrupting either the
mine-resolve credit path or the cargo pool's own accounting depending on
which one wins the collision. This is a namespace-reservation guard, not a
new gameplay rule: no generation path today produces `fuel` as a resource
kind, and this requirement exists to keep it that way as a tested
invariant rather than an accidental absence.

#### Scenario: Generation configured with a `fuel` resource kind fails
- **WHEN** system generation is invoked with a resource-kind configuration
  that includes `fuel` as a mineable kind
- **THEN** generation fails with a named, countable error, and no system
  interior is produced with `fuel` as a mineable resource

#### Scenario: The six existing resource kinds generate unaffected
- **WHEN** system generation runs with its existing configured resource
  kinds (metals, volatiles, water, organics, research, exotic)
- **THEN** generation succeeds exactly as it did before this requirement,
  since none of them collides with the reserved `fuel` name

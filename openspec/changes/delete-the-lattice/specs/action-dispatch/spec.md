## MODIFIED Requirements

### Requirement: Commit Rejects Non-Primitive Action Parameters
The system SHALL, on commit, reject any action whose `Params` map contains
a value outside the storage-native allowlist — `nil`, `string`, `bool`,
`int`, `int64`, `float64`, `[]string`, `[]int64`, `[]float64`, `[]any`, and
`map[string]any` (validated recursively through `[]any` and
`map[string]any`) — failing with the sentinel `ErrNonPrimitiveParam` and
persisting nothing, so that a domain struct can never reach storage through
the untyped parameter channel and decode back as an unrecognized shape.
This requirement governs `Params` only; `ActorState` values are merged onto
the actor document by the actor domain's own stored shapes and are NOT
subject to this allowlist.

#### Scenario: A domain struct in params is rejected at commit
- **WHEN** `Commit` is called with a `Params` value that is a domain struct
  (for example a `space.Vec3` position) rather than an allowlisted primitive
- **THEN** the commit fails with `ErrNonPrimitiveParam`, no action document
  is written, and no actor slot is claimed

#### Scenario: A nested non-primitive inside a map or slice is rejected
- **WHEN** `Commit` is called with a `Params` value that is a
  `map[string]any` or `[]any` containing a non-allowlisted value at any
  depth
- **THEN** the commit fails with `ErrNonPrimitiveParam`

#### Scenario: An encoded coordinate map commits normally
- **WHEN** `Commit` is called with a `Params` map whose coordinate value has
  been encoded through the position codec (`space.EncodeVec`) into an
  allowlisted primitive — a `[]float64` of three components
- **THEN** the commit succeeds and the stored params round-trip to a value
  that decodes back through `space.DecodeVec` to the original position

#### Scenario: Actor state carrying a domain struct still commits
- **WHEN** a commit spec's `ActorState` carries the actor's movement-state
  struct while its `Params` are all allowlisted
- **THEN** the commit succeeds

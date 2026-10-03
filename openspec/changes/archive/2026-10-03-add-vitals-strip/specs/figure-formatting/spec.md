## MODIFIED Requirements

### Requirement: An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number
The system SHALL present `undefined`, `null`, `NaN`, and any non-finite
value as a single explicit absent form, `—`, and SHALL NOT substitute zero,
an empty string, or a raw `NaN`. Zero SHALL always render as a zero figure
in its quantity's own format, distinguishable from the absent form.

#### Scenario: Undefined
- **WHEN** `undefined` is formatted as any quantity
- **THEN** the result is `—`

#### Scenario: NaN
- **WHEN** `NaN` is formatted as any quantity
- **THEN** the result is `—`, never the string `NaN`

#### Scenario: Infinity
- **WHEN** `Infinity` or `-Infinity` is formatted as any quantity
- **THEN** the result is `—`

#### Scenario: Zero is not absent
- **WHEN** 0 is formatted as a tonnage, a delta-v, or a range
- **THEN** it renders as that quantity's own zero figure, distinguishable
  from `—`

#### Scenario: The absent form does not override a capability's own unavailable copy
- **WHEN** a credit balance is supplied as `null` to a surface whose own
  requirement mandates an explicit unavailable indication (`system-console`'s
  *The Credits Cell Shows the Corporation's Served Balance and Announces Its
  Changes*)
- **THEN** that surface's own mandated unavailable copy is shown, not the
  generic `—`

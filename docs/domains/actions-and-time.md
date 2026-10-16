# Actions and world time

Purpose: asynchronous command commitment, channel exclusivity, resolution and
simulation time shared by gameplay domains. Canonical record, 2026-10-16.

## Settled contract

The server owns world time and command acceptance. A committed timed action has
an ETA and resolves through its registered domain resolver. Presentation clocks,
decoration and HUD preferences cannot change gameplay state or substitute for
server acceptance. Movement/economy/sensors pages own their verb-specific rules.

## Current implementation and gaps

- [World time](../../backend/common/worldtime.go) derives scaled elapsed
  milliseconds from an epoch. Gameplay timestamps use `WorldMillis`; account
  administration also has wall-clock timestamps, so not all persistence uses
  simulation time. Changing world scale reinterprets the time mapping.
- [Action model](../../backend/action/model.go) and [service](../../backend/action/service.go)
  implement running → done/cancelled, frozen ETA, channel claiming and registered
  resolution. `ResolveDue`/`ResolveActive` settle due work on reads; push/scheduler
  mechanisms support liveness rather than advancing independent per-tick physics.
- Movement and sensors have independent single slots: burn/mining share movement;
  focused scan/survey share sensors. A burning fleet can use sensors, but two
  sensor actions compete for the same slot. [Channel tests](../../backend/action/channel_test.go)
  pin coexistence/exclusivity.
- Mutating resolvers use exactly-once transaction ledgers. Instant verbs such as
  spawn and sale retain their transactional paths; “every operation is an action”
  would be inaccurate. [Commit tests](../../backend/action/service_test.go) pin
  the frozen spec/channel contract.
- [Effective kinematic state](../../backend/space/state.go) derives due arrival or
  station-keeping release from stored state/time without accumulated simulation
  ticks. Persistent action settlement and effective position are related but
  distinct responsibilities.

## Open questions

Future combat/sensing commands need explicit channel, commitment, cancellation
and resolution contracts. Do not infer their cadence from existing action ETA
machinery. Operational clock-scale changes need deliberate handling; they are
not player HUD settings.

## Related sources

[Travel](travel.md), [economy](economy.md), [sensors](sensors-and-stealth.md),
[discovery](discovery-and-identity.md), [combat](combat.md).
Historical provenance: [action spec](../specs/0005-action-timer.md),
[action plan](../plans/action-timer.md). Code/tests decide implemented behavior.

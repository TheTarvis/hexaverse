# Follow-up — a warned burn commit whose response lacks a burn instant is unspecified

**Status:** filed 2026-10-04 by `surface-commit-stranding-warning` FULL-AUTO
RULING 13 (shed at the 40-task cap). Out of the system-HUD chain; not gating
any link. Defensive: the backend sets the burn on every accepted order, so no
real response has this shape today.

## What is unspecified

`surface-commit-stranding-warning` ties its notice to an order identified by
the commit response's departure and arrival instants. The client type allows
`state.Burn` to be null. If an accepted response carried `strandingWarning`
without both instants, the order could not be identified.

## The ruled answer, when someone authors it

`surface-commit-stranding-warning-rulings.md` RULING 10 (architect A4, UX F5 —
`surface-commit-stranding-warning-panel-architect.md`, `-panel-ux.md`, with
paste-ready sentence, scenario and two tasks): the notice is shown for the gap
only — until the first own-fleets read requested at or after the acceptance
answers — and removed then, whatever that read reports. "No notice" would
discard a warning the server sent.

## What would make this stale

A scenario and its two tests (panel: the callback reports the missing instant
as null; view: the gap-only notice) in a later change — or a served contract
that guarantees the burn on every accepted order response.

**2026-10-04 (`clear-burn-preview-on-commit`, `62c8f15`).** The order record
now has a second consumer: the committed selection reads the same
`orderLive` as the stranding notice. A response lacking a burn instant stores
`null` for it, so `stillRunning` is false and the record holds only through
the gap (`awaitingRead`); after the first answered read the committed
selection ends. That hold-for-the-gap-only behaviour is by construction, not
by decision, and this follow-up remains open for both consumers.

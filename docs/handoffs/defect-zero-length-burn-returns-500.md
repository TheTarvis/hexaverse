# Defect — a burn or preview whose target is the fleet's own host answers 500, not a 4xx

**Status:** CLOSED 2026-10-04 by `fix-burn-order-geometry-refusals` (build `7020952`); see the
foot of this file. (Was: open, backend, pre-existing.) **Found:** 2026-09-09 (as the cause of
`defect-docked-selection-polls-zero-length-preview.md`); **filed separately**
2026-10-03 from the `lift-burn-preview-to-view` security review, advisory A
(`lift-burn-preview-to-view-panel-security.md`).
**Adjudicated:** `lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 11 —
not fixed in the system-HUD chain, which permits no backend work.

`space.ErrArcTooShort` (`backend/space/burn.go:174`, "curve length below the
configured minimum") has no mapping in the fleet handler, so
`POST /v1/fleets/:id/orders` and `orders/preview` return 500 for a burn from a
body to itself. `lift-burn-preview-to-view` (as narrowed by its RULING 16) removes only the UI's
*polling* trigger: no preview is requested while the selected target is the
acting fleet's own host. The burn command there stays available, so a click
still sends the order that answers 500, and an owner can also produce 500s with
a direct request or through the claude-agent's token passthrough. Making the
command unavailable there is `followup-explain-withheld-burn-command.md`.
Error-budget noise from a client-controllable input.

**Fix shape (whoever owns `fleet-movement` next):** map it to a 4xx with a named
reason on both routes; the security reviewer's proposed scenario is in the
report above.

**What would make this stale:** a handler mapping for `ErrArcTooShort` and a
`fleet-movement` scenario naming the own-host case.

## CLOSED — 2026-10-04, `fix-burn-order-geometry-refusals` (build `7020952`)

`space.ErrArcTooShort` is now classified in `backend/fleet` (`ErrBurnArcTooShort`, which still
unwraps to the `space` sentinel) and served on `orders` and `orders/preview` as `409` with the
fixed reason `fleet: burn curve is below the minimum arc length`, mapped in the frontend to
"Choose a target farther away"-style copy; no 500, no error-level log. Evidence:
`backend/fleet/solve_refusal_handler_test.go` (status and byte-equal body on both routes) and the
archive gate in `fix-burn-order-geometry-refusals-journey.md` (tier 3: 1979 tests, 0 failures;
tier 4: 28 passed, no 500 on any burn route).

**Correction to this record's own description.** "A burn from a body to itself" is NOT always
the short curve. An order to the fleet's own host is refused only when its solved curve is below
the minimum; because the host moves, at other phases the same order solves to a real curve and
is accepted and committed (adversary probe: short in 14.8% of arrangements at a ring-1 home
station). No own-host identity refusal was added; making Burn unavailable toward the own host
remains `followup-explain-withheld-burn-command.md`.

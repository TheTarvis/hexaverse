# Follow-up — the commit stranding notice has never been observed against a real backend

**Status:** filed 2026-10-04 by `surface-commit-stranding-warning` FULL-AUTO
RULING 17. Not a defect; a coverage gap with a known cause.

## What is untested at tier 4

The notice's whole positive path: a commit whose response carries
`strandingWarning`, the notice staying visible after the first own-fleets read
(which is what proves the served read's `Burn.DepartMs`/`ArriveMs` equal the
commit response's — the identity the notice's lifetime rests on), its removal
on cut drive against real reads, and its absence after a reload while the
roster row shows the stranded indication. All are closed at tier 1 over a real
own-fleets hook and a mocked service
(`frontend/components/space/SystemSpaceView.stranding-notice.test.tsx`), and the
instants equality by code reading of `backend/fleet/handler.go` (one DTO at
both ends).

## Why

No deterministic stranding fixture exists on the e2e stack: the warning depends
on fuel left after the debit against a randomly generated system's geometry,
and there is no route to set a fleet's fuel
(`frontend/e2e/tests/commit-stranding-notice-journey.spec.ts` header).

## What would close it

A test-stack way to put a fleet in a known fuel state — the same tier-4
random-spawn fixture policy `defect-spawn-system-single-body.md` and
`defect-station-order-500.md` wait on. Travis's call. Then one journey leg.

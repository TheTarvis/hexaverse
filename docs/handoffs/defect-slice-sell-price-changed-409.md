# Defect — `slice.spec.ts` does not re-click a sell whose offer was refreshed by a "price changed" 409, so its balance never moves

**Status:** open, unfiled before 2026-10-04. Not `defect-post-sale-departure-burn-409s.md` (that is a burn `…/orders` 409; this is a `…/sell` 409).
**Found:** 2026-10-04, `clear-burn-preview-on-commit`'s archive-gate rerun (tier 4). Evidence: `clear-burn-preview-on-commit-journey.md`, section "Gate rerun — tier 4".
**Whose call:** Travis — test-side (the spec should accept the refreshed offer and sell again) or product (should a price move between quote and sell under the e2e stack's warp at all?).

## Signature

`frontend/e2e/tests/slice.spec.ts:83`, failing at `:199` — `balance-value`
stayed 1000 for 30 s after the sell click. Backend log, 17:00:10:
`Sale rejected … reason="market: price changed since your quote"`, then one
409 on `POST …/sell`. The page showed "The price changed while you were
deciding. The offer has been updated." (expected ₡ 65, new offer ₡ 75). The
spec never clicks the refreshed offer.

The same second shows a 2.2 s `GET /v1/fleets` and a 3.0 s
`GET /v1/systems/…` — the machine's load rose from 2.8 to 9.2 across the run,
which may be how the quote aged past a price step.

## Why it is not the change under the gate

No burn is involved; backend diff empty; the sell path is untouched by the
change's diff; the spec passed in the same gate's first run.

## Occurrence — 2026-10-05, `add-console-dock` archive-gate rerun (tier 4)

Tree `75bac5a`; log `add-console-dock-tier4-run2.log`. `slice.spec.ts:83` failed
at `:199` (`Expected: > 1000 Received: 1000` after the 30 s poll). E2E backend
log, 02:48:00: `Credit mutation rejected … reason="market: price changed since
your quote"`, `Sale rejected … reason="market: price changed since your quote"`,
then `409 … POST "/v1/fleets/fleet_647271d0-d528-44a2-a35a-13eb15aeccbc/sell"`
— the run's only sell 409. The failure's DOM snapshot shows "The price changed
while you were deciding. The offer has been updated." Slow reads in the minute
before (2.2–2.6 s `GET /v1/fleets?mine=true`, `GET /v1/systems/…`); load 3.99 at
the start of the run and 8.57 at the end. The spec passed 28 minutes earlier in
the same gate's first run on the same production code. Ruled residue:
`add-console-dock-rulings.md` FULL-AUTO RULING 23. This is the second gate it
has cost a red in.

## Occurrence at a different spec — 2026-10-05, `keep-console-tab-content-mounted` archive-gate rerun (tier 4)

Tree `aa00b36`; log `keep-console-tab-content-mounted-tier4-run2.log`. NOT
`slice.spec.ts`: `frontend/e2e/tests/space-double-submit.spec.ts:340`
("Two activations in one tick submit one sale and mint one key") failed at
`:384` in `expectAllSettled2xx` (`:178`) — its one `/sell` request settled 409.
E2E backend log, 05:36:18: `Credit mutation rejected … reason="market: price
changed since your quote"`, `Sale rejected … reason="market: price changed since
your quote"`, then `409 … POST "/v1/fleets/fleet_29f63b50-561a-447c-9ded-cb774dc9b453/sell"`
— the run's only sell 409. The failure's DOM snapshot shows "The price changed
while you were deciding. The offer has been updated." `slice.spec.ts:83` itself
passed in that run. Load 3.90 at the start of the run and 8.76 at the end. The
spec passed 13 minutes earlier in the same gate's first run on the same
production code; that change's diff is empty for the backend and the sell path.

The refusal is this defect's, word for word; the spec and line are not the
recorded signature's, so that run did NOT rule it residue
(`keep-console-tab-content-mounted-rulings.md` FULL-AUTO RULING 21) and stopped
for Travis. This is the third gate the price step has cost a red in, and the
first at a second spec: any tier-4 spec that sells once and requires a 2xx is
exposed. A signature keyed to the backend sentinel rather than to
`slice.spec.ts` would cover both.

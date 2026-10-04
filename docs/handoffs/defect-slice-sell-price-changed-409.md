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

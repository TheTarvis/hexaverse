# DEFECT: spawn intermittently 500s, and the wake UI silently resets

**Found** 2026-09-03 by link 8a-2's SDET, as two Playwright flakes it refused to retry away.
**Status:** OPEN. Player-facing.

## What happens

`POST /v1/corporations` fails roughly **2 in 43** spawns with:

```
rpc error: code = Aborted desc = Transaction lock timeout
Credit mutation rejected … operationKey=spawn:corp_… reason="Transaction lock timeout"
Spawn failed
```

from the opening credit grant. Healthy spawns take **5–7 s**; failing ones take **23–32 s**
before giving up, so the transaction is contending for most of that window.

Evidence: `frontend/playwright/.auth/backend.log`, and both flakes in the e2e run that
passed on retry.

## The player-visible half is worse than the latency

On failure the wake form **returns to an idle "Wake" button with no persistent error**. The
only signal a player gets is that nothing happened. A 30-second wait followed by the
original form is indistinguishable from a mis-click, so the natural response is to press it
again — against a backend that may still be holding the contended transaction.

## Why it matters beyond the flake

This is a **first-run** failure. It is the very first thing a new player does, it fails
about 5% of the time, and it fails silently. Every other defect in this chain is reachable
only by someone already playing.

## What a corrective change needs to decide

1. **Why the credit grant contends at all.** Spawn is documented as idempotent per account
   and heals a partial spawn; the grant is one write in that sequence. Whether two
   concurrent spawns for *different* accounts should ever contend is the first question —
   if they do, the lock is broader than the data it protects.
2. **Retry, or surface?** A bounded server-side retry on `Aborted` is the usual answer for
   a transaction lock, and spawn's idempotency is what makes it safe. That is a design call.
3. **The UI must not silently reset**, whichever way (1) and (2) go. A failed wake needs a
   persistent, retryable error — this is the same class as the drift already catalogued in
   `README.md` Lesson two, where an absent signal reads as success.

## Test shape

Do not chase it with a retry — the SDET deliberately did not. The reproduction is volume:
spawn repeatedly and watch for a run exceeding ~20 s. Assert the **UI** contract too, not
only the status: a failed wake must leave a visible, retryable error rather than an idle
form.

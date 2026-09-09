## Why

`frontend/lib/query-client.ts:4-13` (the shared `shouldRetry` predicate) and
`:24-26` (the mutation default that wraps it) give the global **mutation**
retry policy an exception list of only 401/403/5xx — every other failure
status is resent once, with the unchanged payload. A 4xx response is a
deterministic refusal of the submitted payload: the same payload resent will
be refused identically, so the retry cannot succeed and only doubles the
rejected request against the server. This was captured verbatim during
`add-vitals-strip`'s archive gate:

```
HTTP 409
{"error":"fleet: solved fuel cost exceeds the requested maxFuelTons cap",
 "fuelCostTons":6.1296,
 "maxFuelTons":4.99488}
```

Two identical 409s appeared in the backend log for one user click, and four
separate analyses misread that doubling as "two user attempts, therefore
deterministic, not a race." It was one attempt and one invisible client
retry. Background: `docs/plans/continous_space/handoffs/defect-post-sale-departure-burn-409s.md`
(see *The answer* at its foot) and `add-vitals-strip-rulings.md` RULINGs
39–42.

The sharpest consequence: `frontend/e2e/tests/space-double-submit.spec.ts`
asserts the *server-side request count* to prove the double-submit guards
work. A retry the test cannot see corrupts exactly that count — so the
guard tests can be fooled by the retry policy they run underneath.

## What Changes

- Change the mutation retry predicate in `frontend/lib/query-client.ts` so a
  mutation that fails with any `4xx` status (including `409`, `408`, `429`,
  and `401`/`403` as today) is never automatically resent, and a mutation
  that fails with any `5xx` status remains excluded from automatic resend —
  matching, not reversing, today's shipped behavior for `5xx`.
- Leave the one retry that already exists and survives this fix untouched: a
  mutation failure that carries **no** response status at all continues to be
  resent exactly once. That class is defined by what the error exposes, not by
  its cause — a lost connection, a DNS failure, an abort (including the API
  client's own 120 s request timeout, which this app produces instead of a
  `408`), a response that could not be read or parsed, or a thrown value that
  is not an `Error` — because the observable absence of a status is the only
  thing the predicate can test. This is the transport-level retry that
  `docked-fleet-actions`' and `system-space-view`'s "retried after a lost
  response" scenarios depend on, so this change must specify it rather than
  leave it to survive by accident. Specifying it also makes plain what it is:
  at-least-once delivery whose safety comes from server-side duplicate
  handling owned by other capabilities, not from this one.
- Leave `api-client.ts`'s `401` credential-refresh-and-retry (force-refresh
  the Firebase token, re-issue the request once) untouched and explicitly
  out of this requirement's scope — it is a credential retry, not an
  automatic retry of a refused payload, and the new `4xx` rule must not be
  read as forbidding it.
- Leave query (read) retry policy untouched — this change scopes the new
  `4xx`/`5xx` exclusion to the mutation predicate only; `query-client.ts`'s
  single shared `shouldRetry` predicate must be split (or otherwise
  preserved) so queries keep retrying `408` and no-status failures up to 3
  times exactly as they do today.
- Update the retry-predicate unit test in `frontend/lib/query-client.test.ts`
  — its **mutation** block currently asserts, as passing, that a `408`
  mutation failure is retried once, the same class of bug as the captured
  `409` case; its **query** block's equivalent assertion is correct today
  and must keep passing untouched.
- Make `frontend/e2e/tests/space-double-submit.spec.ts` assert the
  server-observed response status of each recorded request, in addition to
  (never instead of) the request count, so a hidden retry is visible even
  when server-side idempotency happens to make it invisible in the UI. The
  existing counts — including the two deliberate `toBe(2)` guard-release
  assertions — stay exactly as they are, and requests keep being recorded at
  send time.
- Record the one automatic resend that survives this change: when the
  mutation retry policy authorizes a resend, the client writes a warning
  identifying it as an automatic transport-level resend, so the next reader
  of a doubled server-side request log can tell a retry from a second user
  attempt. This is the misreading that cost four analyses on the captured
  409 (RULING 45).

## Impact

- Affected specs: `mutation-retry-policy` (new — this is the frontend's
  single shared transport retry predicate, used by every mutation across
  every domain; it is not owned by any single domain capability, since
  `docked-fleet-actions` and `system-space-view` own per-surface
  double-submit guarding on top of it, not the shared retry policy
  underneath)
- Affected code: `frontend/lib/query-client.ts`,
  `frontend/lib/query-client.test.ts`,
  `frontend/lib/api-client.test.ts`,
  `frontend/e2e/tests/space-double-submit.spec.ts`
- **Known, not merely possible:** `frontend/lib/query-client.test.ts`
  currently contains a passing assertion, `'should retry mutations once on
  retryable errors'`, that submits a `408` and asserts it IS retried once —
  i.e. it codifies today's buggy predicate (anything outside 401/403/5xx
  retries) as correct behavior. That block must change under this change,
  by the SDET, alongside the production fix — not be discovered mid-build.

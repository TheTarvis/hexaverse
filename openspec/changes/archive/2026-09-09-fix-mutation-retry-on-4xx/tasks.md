## 1. Implementation

- [x] 1.1 Split `frontend/lib/query-client.ts`'s single `shouldRetry`
      predicate into a query predicate and a mutation predicate. The query
      predicate is unchanged (queries keep retrying `408` and no-status
      failures up to 3 times, exactly as today). The new mutation predicate
      SHALL exclude every `4xx` **and** `5xx` status from automatic resend
      (today only `401`/`403`/`5xx` are excluded — this widens the
      exclusion to all `4xx`, including `408`/`429`/`409`), and SHALL still
      resend exactly once a failure that carries no response status at all
      (no change from today for that case — do not let the `4xx`/`5xx`
      widening accidentally remove it). Classify by the observable key
      only: a failure is status-less when the error reaching the predicate
      exposes no response status, whatever the cause — so do not add a
      cause-specific test (`AbortError`, `TypeError`, `instanceof Error`)
      and do not narrow the arm to errors that are `Error` instances, since
      a thrown non-`Error` value must still take it
- [x] 1.1b In the mutation predicate, write one `console.warn` identifying
      an automatic transport-level resend, on the branch that authorizes the
      status-less resend and **only** on that branch, so the number of
      warnings equals the number of automatic resends (the predicate becomes
      side-effecting; this is accepted deliberately — RULING 45). Do not log
      on the `4xx`/`5xx` refusal branch and do not log from the query
      predicate
- [x] 1.2 Update `frontend/lib/query-client.test.ts`. Touch only the
      "mutation retry logic" block — the "retry logic" **query** block
      (including its `408` and no-status assertions) must keep passing
      unedited. In the mutation block, assert: a `409` failure is not
      retried; a `5xx` failure (e.g. `500`) is **not** retried (the block's
      existing `500` assertion already expects this — keep it passing, do
      not invert it); `401`/`403` failures are not retried; a `408` failure
      is **not** retried — this replaces the existing assertion that a `408`
      mutation failure IS retried once, which is the specific reversal this
      change makes and must not be lost by picking a different `4xx`
      example instead; another `4xx` (e.g. `422` or `429`) is not retried;
      and a failure with no response status is still retried exactly once —
      there is no such assertion in the mutation block today, add one
      (mirroring the query block's existing "should retry on errors without
      status" case); and a failure shaped exactly as `api-client.ts`'s
      timeout abort produces — `new Error('Request timeout')` with **no**
      `status` property — is still retried exactly once (this is the app's
      only real timeout path; the assertion exists so that a later narrowing
      of the predicate goes red — the `api-client` side of that prohibition
      is pinned by 1.2c); and a status-less failure whose cause is not a lost
      connection is retried exactly once too — an error carrying no `status`
      raised after a response was received (an unparseable body) and a
      thrown value that is not an `Error` at all — so a later cause-specific
      narrowing of the arm goes red
- [x] 1.2b In the mutation block, spy on the console warning channel and
      assert it is written exactly once when the predicate authorizes the
      status-less resend, and not written for a `409`, a `408`, a `500`, **or
      a status-less failure at `failureCount` 1, where no resend is
      authorized**; and assert the warning's message contains the fixed
      marker `automatic transport-level resend`, so the record is greppable
      in a captured console log
- [x] 1.2c In `frontend/lib/api-client.test.ts`'s existing "timeout handling"
      test (`:306-322`), assert the thrown error carries **no** `status`
      property —
      `await expect(slowClient.get('/test')).rejects.not.toHaveProperty('status')` —
      so attaching a `408` to the abort path goes red at the place that would
      attach it. The `query-client.test.ts` assertion in 1.2 pins the
      predicate only; it constructs its own error and cannot observe
      `api-client.ts`
- [x] 1.3 Change `frontend/e2e/tests/space-double-submit.spec.ts`'s
      `recordPosts` helper so each entry is still pushed **on the `request`
      event, at send time** (so the existing count assertions keep catching
      a second request the instant it leaves the browser), and additionally
      carries a `status` field filled in asynchronously from
      `req.response().then(r => r?.status())` — `.catch(() => null)` the
      promise so a page closed mid-flight records `status: null` rather than
      raising an unhandled rejection — plus a `requestfailed` listener that
      sets the **already-recorded** entry's `status` to `null` (it was pushed
      at `request` time and must not be pushed again — `requestfailed` fires
      *in addition to* `request`, so a second push would double-count one
      request), and treat `null` as not-`2xx` in the status assertion. Assert
      statuses only after the existing waits, via `expect.poll`, so a status
      that has not landed yet is awaited rather than read as a failure. Do
      **not** switch the helper to `requestfinished`: that fires only after
      the response body downloads (making the file's poll-then-read
      `toBe(1)` checks a race) and never fires at all for a transport-layer
      failure, which is exactly the class this change preserves
- [x] 1.3b Leave every existing count expectation in
      `frontend/e2e/tests/space-double-submit.spec.ts` exactly as it is —
      `toBe(1)` for the double-activation guards, `toBe(2)` for the
      guard-release checks at `:214` and `:310`, which are a second,
      deliberate user command and must not be reduced to one. Add, alongside
      each count expectation, an assertion that **every** entry recorded so
      far settled with a `2xx` status, failing with the observed status(es)
      in the message (a bare count assertion would read a retry as a phantom
      extra user request instead of the doubling it actually is). A recorded
      entry that settled `401` immediately followed by a `2xx` re-issue of
      the same route is the API client's credential retry
      (`api-client.ts:169-190`), not a doubling — assert against the final
      settled status; note the credential re-issue is a second `request`
      event and would also perturb the count, which is pre-existing and out
      of scope here. If the status assertion at `:214` goes red with a `409`
      carrying `"solved fuel cost exceeds the requested maxFuelTons cap"`,
      that is `defect-post-dock-burn-cost-drift.md` (RULING 41 — out of scope
      here, do **not** widen `BURN_FUEL_ALLOWANCE` and do **not** relax or
      scope down this assertion). Record it against that defect file and
      report the red; the assertion is correct and the command genuinely
      failed

## 2. Validation

- [x] 2.1 `npx vitest run frontend/lib/query-client.test.ts`
- [x] 2.1b Confirm the invariant the requirement states: **no `useMutation`
      call site passes a `retry` option**. List every production `retry:` in
      the frontend (`grep -rn 'retry:' frontend/hooks frontend/components
      frontend/app frontend/lib`, excluding tests) and check, for each hit,
      which hook the option sits on — the check is the hook, not the number
      of hits, which changes as query call sites come and go. Every hit
      outside `frontend/lib/query-client.ts`'s own defaults must be a
      `useQuery` (as of this change there are five, all `useQuery`:
      `hooks/use-auth.ts:159`, `hooks/use-market.ts:63`,
      `hooks/use-burn-preview.ts:61`, `hooks/use-account.ts:27`,
      `components/account-provider.tsx:74`; `use-burn-preview.ts:46` and
      `components/render-guard/use-render-guard.ts:39` are unrelated
      `retry: () => void` interface fields, not React Query options). A
      `retry` option on a `useMutation` would resend a `4xx` on that route
      no matter how the shared default is fixed. A `useMutation` passing
      `retry: false` (strictly narrower than the default) satisfies the
      requirement; anything that can return `true` for a status-carrying
      failure does not
- [x] 2.2 Per-commit gate green: `bash .claude/scripts/check.sh` and
      `python3 .claude/skills/code-quality-checks/check.py --files-only`
      (tiers 0-1, `docs/testing-tiers.md`)
- [x] 2.3 `frontend/e2e/tests/space-double-submit.spec.ts` rerun once, at
      archive time per `docs/testing-tiers.md` tier 4, confirming the
      strengthened status assertions pass against the fixed retry policy
      and that the two `toBe(2)` guard-release checks still expect two
- [x] 2.4 After `openspec archive`, confirm
      `openspec/specs/mutation-retry-policy/spec.md` carries the Purpose
      paragraph written into this change's spec delta, not the archiver's
      generated placeholder, with two checks (run separately — `grep -c`
      exits `1` on a zero count, so do not chain them with `&&`):
      `grep -c 'TBD - created by archiving' openspec/specs/mutation-retry-policy/spec.md`
      SHALL print `0`, AND
      `grep -c 'deterministic client rejection' openspec/specs/mutation-retry-policy/spec.md`
      SHALL print `1` or more (a positive check that the real Purpose text,
      not just the absence of the placeholder, survived archiving); if
      either check fails, paste the Purpose in by hand

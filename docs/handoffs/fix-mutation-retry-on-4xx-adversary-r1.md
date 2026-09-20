# Adversary R1 — `fix-mutation-retry-on-4xx`

**Reviewed** 2026-09-09. Artifacts: `openspec/changes/fix-mutation-retry-on-4xx/`
(proposal.md, tasks.md, specs/mutation-retry-policy/spec.md — no design.md).
Source of truth for the fidelity walk: the captured evidence in
`docs/plans/continous_space/handoffs/defect-post-sale-departure-burn-409s.md`
(*The answer*), FULL-AUTO RULINGs 39–42 in `add-vitals-strip-rulings.md`, and
the code under attack — `frontend/lib/query-client.ts`,
`frontend/lib/query-client.test.ts`, `frontend/lib/api-client.ts`,
`frontend/e2e/tests/space-double-submit.spec.ts`.

**Verdict: BLOCKED.** Two blockers, four majors, two minors. The 4xx half of the
change is right and lands where the evidence points. The 5xx half is invented,
inverts shipped behaviour, and would re-introduce the exact doubling this change
exists to remove — on the same route, in the same e2e suite.

---

## BLOCKER 1 — The "5xx is still retried once" clause is invented behaviour; today 5xx mutations are never retried, and mandating a retry re-creates the doubling defect

**Location.** `specs/mutation-retry-policy/spec.md:28-30` (requirement text):

> The system SHALL automatically resend a mutation request exactly once when
> it fails with a `5xx` response status, since a `5xx` failure may be
> transient.

and its scenario at `:37-40`:

> #### Scenario: A 5xx failure is still resent exactly once

echoed by `proposal.md:34-35` ("a mutation that fails with a `5xx` status
**continues** to be resent exactly once, **unchanged**") and `tasks.md:1.1`
("while a `5xx` status still resends exactly once, **unchanged**") and
`tasks.md:1.2` ("a `5xx` failure is retried exactly once").

**Why it is false.** `frontend/lib/query-client.ts:4-13`:

```ts
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && 'status' in error) {
    const status = (error as Error & { status: number }).status
    // Don't retry on auth errors (401/403) or server errors (5xx)
    if (status === 401 || status === 403 || status >= 500) {
      return false
    }
  }
  return failureCount < 3
}
```

The mutation predicate is `shouldRetry(...) && failureCount < 1`, so for a 5xx
it is `false && …` — **a 5xx mutation is not resent at all today, and never has
been.** Three independent sources agree with the code and against the delta:

- `frontend/lib/query-client.test.ts:96-101` — a *currently passing* assertion,
  `'should not retry mutations on 5xx server errors'` → `mutationRetryFn(0, err500)`
  is `false`.
- The change's own `proposal.md:3-6`: "an exception list of only 401/403/5xx —
  every other failure status is resent once." 5xx is *in the exception list*.
  Bullet 1 of *What Changes* contradicts the *Why* four lines above it.
- The evidence doc and RULING 39: "resends any **non-401/403/5xx** failure once".
  RULING 40 authorises exactly one behaviour change: "a mutation retry never
  resends a 4xx." Nothing anywhere sanctions adding a 5xx retry.

**Exploit.** This is not a dead clause: `tasks.md:1.2` instructs the SDET to
write the red test "a `5xx` failure is retried exactly once". That test goes red
against the correct minimal fix, and the developer makes it green by *adding*
an automatic resend of every mutation in the app on 5xx. Blast radius: only
`/sell` and `/refuel` carry operation keys (`operationKey` appears in
`frontend/hooks/use-market.ts` and `frontend/components/space/FleetActionsPanel.tsx`
and nowhere else) — `POST /v1/fleets/:id/orders`, `/mine`, `/jump`, `/scan` and
spawn would all gain an unkeyed automatic resend.

And the concrete harm is already on file: `defect-station-order-500.md` is an
OPEN defect in which a **deterministic geometry refusal**
(`space.ErrEndpointInsideClearance`) surfaces as a bodyless `500` on
`POST /v1/fleets/{id}/orders` — the exact route, in the exact Playwright suite
(`space-double-submit.spec.ts`), whose request counts this change exists to
protect. Under the new requirement that deterministic refusal is resent once,
producing two identical rejections for one click. That is bug-for-bug the defect
the change was written to kill, moved from the 4xx arm to the 5xx arm.

**Smallest fix.** Delete the invented sentence and scenario; state the real
current behaviour:

```markdown
The system SHALL NOT automatically resend a mutation request that fails with
any `4xx` or `5xx` response status.

#### Scenario: A 5xx failure is not resent
- **WHEN** a mutation request fails with a `500` response
- **THEN** no automatic resend is issued
```

and correct `proposal.md` bullet 1 and `tasks.md` 1.1/1.2 to match ("5xx remains
excluded, as today"). The regression guard this change actually needs is
BLOCKER 2's, not this one.

---

## BLOCKER 2 — The only retry that exists today is the one the spec never mentions: a transport failure with no response status. A literal implementation drops it, and a live `docked-fleet-actions` scenario depends on it

**Location.** `specs/mutation-retry-policy/spec.md:24-49` — all four scenarios
key on an HTTP status (`409`, `5xx`, `401`/`403`, other `4xx`). Nothing covers a
failure that carries **no** status.

**Why it matters.** In `shouldRetry`, the `'status' in error` guard is what makes
the status-based arms reachable; a fetch that never got a response (offline, DNS,
abort, lost response) throws an `Error` with no `status`, falls through to
`failureCount < 3`, and the mutation predicate resends it **once**. That — and
only that — is the retry that survives a correct fix of this defect. The spec
does not say it must survive.

**Exploit.** An implementer satisfying all four scenarios literally can write:

```ts
mutations: { retry: (failureCount, error) => statusOf(error) >= 500 && failureCount < 1 }
```

or, once BLOCKER 1 is fixed, simply `retry: false`. Both satisfy every scenario
in the delta and silently remove the resend-on-lost-response for **every**
mutation in the app. That is the wholesale availability regression the review
brief feared, and the delta's current safety scenario does not catch it because
it is aimed at 5xx — a class that is already not retried.

Worse, it would falsify live spec text. `openspec/specs/docked-fleet-actions/spec.md:324-328`:

> #### Scenario: A transport-level retry of the same attempt yields exactly one sale
> - **WHEN** the sell command's request is retried at the transport layer
>   **after a lost response**, without the player initiating a new attempt

and its refuel twin at `:466-470`. "After a lost response" *is* the no-status
case. Remove that retry and both scenarios become unreachable — a rule with two
homes shipping false in one of them.

**Smallest fix.** Add to the requirement text and one scenario:

```markdown
A failure that carries no response status (a request that never received one —
lost connection, DNS failure, abort) is not a refusal of the payload; the
system SHALL automatically resend such a mutation exactly once, carrying the
identical payload and the same operation key where the surface mints one.

#### Scenario: A transport failure with no response status is still resent exactly once
- **WHEN** a mutation request fails without any response status (no response
  was received)
- **THEN** exactly one automatic resend is issued, carrying the identical
  request payload
```

and add the matching vitest case to `tasks.md:1.2` (the mutation block has no
no-status test today — only the queries block does, at
`query-client.test.ts:60-67`).

---

## MAJOR 3 — "SHALL NOT automatically resend … any 4xx" contradicts `api-client.ts`'s 401 refresh-and-retry, and the only scoping lives in a `## Purpose` the archiver discards

**Location.** `specs/mutation-retry-policy/spec.md:25-27` and `:42-44`:

> The system SHALL NOT automatically resend a mutation request that fails
> with any `4xx` response status…
>
> #### Scenario: 401 and 403 failures are not resent
> - **WHEN** a mutation request fails with a `401` or `403` response
> - **THEN** no automatic resend is issued

**The contradiction.** `frontend/lib/api-client.ts:169-190` (and again at `:329`
for streams) does exactly what the requirement forbids: on a `401` with a live
Firebase user it force-refreshes the token, rewrites the `Authorization` header,
and **re-issues the same request**. At the wire — which is where `tasks.md:1.3`
is about to start asserting — a 401'd mutation produces two POSTs today, by
design.

Only the delta's `## Purpose` scopes the rule to "the frontend's single shared
`QueryClient`". The change's own `tasks.md:2.4` concedes that `openspec archive`
discards that Purpose (14 of 34 live specs carry the
`TBD - created by archiving …` placeholder). Even with task 2.4 executed
perfectly, normative text must stand on its own: the requirement, read alone,
prohibits a shipped and deliberate auth behaviour, and leaves "mutation" — a
React Query term of art — defined nowhere in normative text.

**Exploit.** Two paths. (a) The SDET's new wire-level status assertions
(task 1.3) see two POSTs for one 401'd command and read it as a guard failure.
(b) A later reader repairing the "violation" deletes the token-refresh retry,
and every mutation issued across a token expiry boundary starts hard-failing.

**Smallest fix.** Move the scope into the requirement and carve out the refresh:

```markdown
The shared client-side query client SHALL NOT automatically resend a mutation
request that fails with any `4xx` response status. A single re-issue of a
`401`ed request with a freshly refreshed credential is a credential retry, not
an automatic retry of a refused payload, and is out of this requirement's
scope.
```

---

## MAJOR 4 — Query retry policy is unspecified, but one shared predicate makes it impossible not to touch; the tasks authorise a test edit that leaves a query test red

**Location.** `tasks.md:1.1` ("Change the mutation retry predicate in
`frontend/lib/query-client.ts` so any `4xx` status … is excluded") and
`tasks.md:1.2` (edit scoped to "`query-client.test.ts`'s **'mutation retry
logic'** block").

**The problem.** There is no separate mutation predicate. `query-client.ts:20`
and `:25` both route through the one `shouldRetry`. If the developer edits the
shared function — the smallest change, and what 1.1 literally names — then
`query-client.test.ts:50-58`, `'should retry up to 3 times on retryable errors'`
(a `408` query, asserted retried three times) goes red. That block is outside the
edit task 1.2 authorises, and **no requirement in this change says what query
retry behaviour ought to be.** Note also that BLOCKER 1's 5xx clause, if kept,
*forces* the predicate to fork (queries must not retry 5xx; mutations must),
which no task mentions at all.

**Exploit.** The developer hits a red test with no requirement and no task
covering it, and resolves it by whichever route is cheapest — most likely
weakening or deleting an assertion, which is the one thing this pipeline exists
to prevent. Or forks the predicate, silently splitting query and mutation policy
with no spec covering the query half.

**Smallest fix.** One sentence in the requirement — "Query (read) retry policy is
outside this capability and is unchanged by this requirement" — plus an explicit
task line: whether the shared `shouldRetry` is split, and exactly what
`query-client.test.ts`'s **queries** `'retry logic'` block must assert afterward.

---

## MAJOR 5 — The requirement's stated reason is false for `408` and `429`, the two contested 4xx; the reversal of the live `408` assertion is asserted, never argued, and the scenario set never pins it

**Location.** `specs/mutation-retry-policy/spec.md:25-27`:

> …because a `4xx` status is a deterministic refusal of the submitted payload
> and an identical resend cannot succeed.

That reason is simply untrue for `408 Request Timeout`, `429 Too Many Requests`
and `425 Too Early`: an identical resend of those *can* succeed, which is the
entire point of `Retry-After`. Sweeping them into the blanket rule may well be
the right call for this app (a visible failure beats an invisible resend of an
unkeyed mutation), but the change never says so. `429` is not mentioned in any
artifact. `408` is mentioned only as the test to delete
(`proposal.md:36-38`, `tasks.md:1.2`) — the reversal of a
currently-specified-in-test behaviour, asserted, never argued.

The scenarios make it worse rather than better: `spec.md:46-49` names
"for example `400`, `404`, or `422`" — the three that genuinely *are*
deterministic — so the contested cases are pinned by no scenario, and
`tasks.md:1.2` offers "another `4xx` (e.g. `408` **or** `422`)". An SDET picking
`422` ships the 408/429 reversal with zero test coverage.

**Exploit.** The behaviour change with the most surprise in it — a rate-limited
or timed-out mutation now failing straight to the user — arrives untested, and
the requirement's own causal clause hands the next reader the argument for
reverting it ("408 isn't deterministic; the reason doesn't apply").

**Smallest fix.** Replace the causal clause and pin the case:

```markdown
…including statuses that may be transient (`408`, `429`): an unkeyed mutation
resent invisibly is worse for this app than a refusal the player can see and
re-issue deliberately.

#### Scenario: A 408 request timeout is not resent
- **WHEN** a mutation request fails with a `408` response
- **THEN** no automatic resend is issued
```

and change `tasks.md:1.2`'s "e.g. `408` or `422`" to require the `408` case
specifically — it is the assertion being reversed.

---

## MAJOR 6 — Task 1.3 has no acceptance criterion; "assert the response status" is satisfiable by an assertion that proves nothing

**Location.** `tasks.md:1.3` — "capture and assert the response status of every
recorded request, not request count alone".

Assert it *equals what*? `expect(r.status).toBeDefined()` satisfies the sentence
and detects nothing. No requirement or scenario in the delta backs this task, so
nothing else pins it, and it is the half of RULING 40 that is supposed to make
this whole class visible next time.

Two concrete gaps the task should close: (a) `recordPosts` currently listens on
`page.on('request')` (`space-double-submit.spec.ts:79-93`), which carries no
status — the status needs `requestfinished`/`await req.response()`, and a
never-answered request must not hang the helper; (b) the intended assertion is
"the recorded list has exactly one entry **and** that entry settled `2xx`", since
a retry inflates the count and would otherwise present as a phantom extra user
request — precisely the misreading that cost four analyses.

**Smallest fix.** Rewrite 1.3 to name the assertion: *"…so each scenario asserts
both the recorded count and that every recorded POST settled with a 2xx status,
failing with the observed statuses in the message."*

---

## MINOR 7 — Task 2.4's Purpose check works for the known failure mode but is weak in two ways

`grep -c 'TBD - created by archiving' openspec/specs/mutation-retry-policy/spec.md`
SHALL return `0`. Confirmed checkable: the archiver writes exactly
`TBD - created by archiving change <id>. Update Purpose after archive.`
(`openspec/specs/account-identity/spec.md:4` and 13 others), so if the Purpose is
dropped, the grep returns `1` and the check fails. It would not pass silently.

Two weaknesses: `grep -c` **exits 1** when the count is zero, so under `set -e`
or a `&&` chain the passing case aborts the script; and the check returns `0` for
a file with *no* Purpose at all, if a future archiver stops writing that string.
Add a positive assertion beside it, e.g. `grep -c 'deterministic client
rejection' openspec/specs/mutation-retry-policy/spec.md` ≥ 1.

---

## MINOR 8 — Dangling reference: `proposal.md` cites a report that does not exist

`proposal.md:45-46`: "Affected specs: `mutation-retry-policy` (new — see **this
change's report** for why no existing capability owns this cross-cutting frontend
policy)". No such file exists in the change folder or in
`docs/plans/continous_space/handoffs/` (`find` for `*mutation-retry*` returns only
the change folder itself). Either write the justification into the proposal
inline — it is two sentences — or drop the pointer.

---

## What holds up

- The 4xx diagnosis is correct and lands where the evidence points. The captured
  409 body, `query-client.ts:8`, and the doubling mechanism all agree; the
  requirement's 4xx half removes the second request for the captured case and
  for every other deterministic refusal.
- Scenarios 1, 3, 4 are decidable, inducible, and directly testable against the
  exported default options — no weasel words, no undefined thresholds.
- The capability boundary is drawn correctly in prose: nothing in the delta
  contradicts `docked-fleet-actions`' or `system-space-view`'s double-submit
  guards, *provided* BLOCKER 2 is fixed — those specs' "transport-level retry
  after a lost response" scenarios depend on the no-status retry this delta
  currently leaves unprotected.
- `tasks.md` 2.1–2.3 correctly place the tiers per `docs/testing-tiers.md`.

**Verdict: BLOCKED.**

# Panel — Reliability review, `fix-mutation-retry-on-4xx`

**Reviewed** 2026-09-09, single-reviewer fast-track panel (the change *is* a
retry policy). Artifacts read at revision-after-adversary-R1:
`openspec/changes/fix-mutation-retry-on-4xx/{proposal,tasks}.md` and
`specs/mutation-retry-policy/spec.md`; authority read: `add-vitals-strip-rulings.md`
RULINGs 39–42; adversary read: `fix-mutation-retry-on-4xx-adversary-r1.md`.
Code read: `frontend/lib/query-client.ts`, `frontend/lib/query-client.test.ts`,
`frontend/lib/api-client.ts`, `frontend/hooks/use-market.ts`,
`frontend/hooks/use-fleets.ts`, `frontend/hooks/use-actions.ts`,
`frontend/hooks/use-scan.ts`, `frontend/components/space/FleetActionsPanel.tsx`,
`frontend/e2e/tests/space-double-submit.spec.ts`,
`backend/middlewares/{rate_limiter,corp_write_quota}.go`, `backend/router.go`,
`backend/account/handler.go`. Live specs checked for falsification:
`openspec/specs/docked-fleet-actions/spec.md:300-340,455-480`,
`openspec/specs/mine-extraction/spec.md:508-520`,
`openspec/specs/system-space-view/spec.md`. `openspec validate --strict` passes.

**Verdict: NEEDS FAILURE SPECS.** Two MAJORs, three MINORs, no blockers. Every
MAJOR is a one-sentence-plus-one-scenario fix inside the existing delta. All of
adversary R1's blockers are genuinely closed — the 5xx invention is gone, the
no-status retry is now normative, the `api-client` 401 carve-out is in normative
text rather than only in `## Purpose`, the query half is scoped out, and `408`
is pinned by its own scenario.

---

## Answers to the five questions

### 1. Availability regression from dropping the `4xx` retry — none. The `429` argument is not a judgement call; the code settles it against retrying.

**`408`.** No backend route emits `http.StatusRequestTimeout` — `grep -rn
StatusRequestTimeout backend/**/*.go` (non-test) returns zero hits. The app's
*actual* timeout path is not a 408 at all: `api-client.ts:140-141,219-221` arms
a 120 s `AbortController` and converts the abort into `new Error('Request
timeout')` **with no `status` property**, which lands in the status-less arm
that Requirement 2 preserves. So deleting the `408` mutation retry removes a
retry for a status this stack cannot currently produce, and does not touch the
timeout behaviour that actually fires. This also means the currently-passing
test `'should retry mutations once on retryable errors'` (`query-client.test.ts:103-109`)
guards nothing real, which is the right thing to reverse.

**`429`.** Two emitters, both reachable from mutations:

- `middlewares/rate_limiter.go:38-68` — per-IP fixed window, wired at
  `router.go:82-83` as `strictLimit` (20/min) and `generalLimit` (600/min).
  It sets **no `Retry-After` header at all**.
- `middlewares/corp_write_quota.go:61-89` — 60/min per corporation on the
  credit-mutating routes (`router.go:211`). It *does* set `Retry-After`, at up
  to the full remaining window (`retryAfter := time.Until(entry.resetAt)`).

Now the client side: `query-client.ts` sets `retryDelay` **only on queries**
(`:21`). Mutations inherit React Query's default (`1000 * 2**attempt`, so
~1 s for the single mutation retry). Nothing in this app reads `Retry-After`.
So today's `429` mutation retry fires ~1 s into a window with up to 59 s left —
it is refused again in the overwhelming majority of cases. Worse, both limiters
increment their counter *before* testing the limit (`rate_limiter.go:56-57`,
`corp_write_quota.go:76-77`), so the automatic resend consumes another slot and
**prolongs the refusal it was issued against**. That is a small self-DoS, not an
availability mechanism.

A `Retry-After`-honouring retry is a thing this app could want one day; it is
not a thing it has, and the naive retry standing in for it is net-negative. The
change's argument — visible failure beats invisible resend — holds on evidence,
not on taste. **No finding.**

**Which mutations are keyed.** Enumerated from the seven `useMutation` call
sites (`use-fleets.ts`, `use-actions.ts`, `use-scan.ts`, `use-market.ts`,
`use-account.ts`, `account-provider.tsx`, `wake-up-flow.tsx`):

| Mutation | Guard against a duplicate reaching the server |
| --- | --- |
| `POST /v1/fleets/:id/sell`, `/refuel` | per-attempt `operationKey` → corp ledger doc id |
| `/orders`, `/mine`, `/jump`, `/scan`, `/cut-drive`, `/stop`, `/hold`, `/release` | action spine single-slot claim → duplicate gets `409` (`mine-extraction` spec:508-520, "fails closed") |
| `POST /v1/corporations` (spawn) | idempotent per account (`corpByAccount` uniqueness anchor) |
| `POST /v1/actions/:id/cancel`, `/acknowledge` | already-settled → `409`/no-op (`action/handler.go:200`) |
| `POST /v1/accounts` (create) | `firestoreUid` lookup → `400 "Account already created"` (`account/handler.go:180-197`) |

Every mutation in the app is keyed, slot-claimed, or uniqueness-anchored. That
is the fact that makes the surviving retry tolerable — and it is also finding
MAJOR-2, because the spec doesn't say the safety comes from there.

### 2. Blast radius of the surviving no-status retry — real, currently contained, and the spec text is *not* honest about why.

The delta says a status-less failure "is not a refusal of the submitted payload"
and glosses it as "no response was ever received". Both true. What it lets a
reader infer — that the server did not act — is false, and the highest-frequency
trigger makes that concrete: the client's own 120 s abort (`api-client.ts:141`)
produces a status-less error, and the resend goes out ~1 s later with a fresh
120 s budget while the original may still be executing server-side. Two
identical in-flight mutations, one user click.

Today nothing double-executes, per the table above. But that is a property of
`docked-fleet-actions`, `action-dispatch` and `corporations` — capabilities this
one explicitly disclaims owning. Writing "no response was received, so a resend
is fine" into normative text hands the next unkeyed money mutation a
ready-made, wrong safety argument. **In scope for this change** (it is one
sentence in the requirement this change is adding, and the change is what makes
this retry normative rather than accidental) → MAJOR-2. The *degradation*
question (a resent action-spine verb surfacing a `409` toast when the command
actually succeeded — `mine-extraction` says callers SHALL read that as "already
committed, re-fetch") is pre-existing, unaffected by this change, and belongs in
a follow-up → FOLLOW-UP B.

### 3. Observability — one cheap, testable requirement is worth adding; the e2e status assertion does not cover it.

Task 1.3 makes a *doubled* request visible in `space-double-submit.spec.ts` when
it happens under that spec's scenarios — but those scenarios never induce
transport loss, so they will never observe the retry that survives. After this
change the app has exactly one automatic resend left, and it is the invisible
kind: nothing logs it, nothing counts it, and invisibility is precisely what
cost four analyses (RULING 42). There is precedent for the cheapest possible fix
in the very file that owns the *other* invisible retry: `api-client.ts:171`
`console.error('401 received, attempting token refresh...')`. MINOR-4 proposes
the same treatment, testable with a console spy in the existing vitest file.
Take-it-or-leave-it; it is not what gates this change.

### 4. Adjectives — one, in normative text.

"for this app's **largely-unkeyed** mutations" (`spec.md:34-35`). `largely` is
unquantifiable and, per the table above, arguably wrong (everything has *some*
guard; only two carry an operation key). MINOR-3 replaces it with a conditional
that does not date. Everything else in the delta is decidable: "exactly once",
enumerated statuses, "no automatic resend is issued". One open question on a
number I decline to invent: MINOR-5.

### 5. Rollout — frontend-only, no flag is correct; reversal is one Vercel redeploy.

No schema, no backfill, no server change, no persisted state touched. The change
only ever *removes* requests, so there is no partial-rollout hazard: clients
running old and new policy simultaneously (an open tab during deploy) differ
only in whether a refused mutation is resent once. Reversal cost is a Vercel
rollback to the previous build, seconds, with no data to unwind. No design.md is
right for this fast-track, and it is better than one here: the archiver keeps
requirement prose and discards `## Purpose`-adjacent commentary, so the `408`/
`429` decision belongs exactly where the writer put it — inside the requirement.
No migration-plan finding.

---

## Findings

### MAJOR-1 — The app's own request timeout is a status-less failure, not a `408`; nothing says so, and the new rule invites the wrong repair
**Attaches to:** `specs/mutation-retry-policy/spec.md`, Requirement *A Transport
Failure Without A Response Status Is Still Resent*; plus `tasks.md:1.2`.

`api-client.ts:216-221`:

```ts
if (error instanceof Error && error.name === 'AbortError') {
  throw new Error('Request timeout')
}
```

That error carries no `status`, so it is the status-less arm — and since the
backend emits no `408` anywhere, it is the *only* way this app produces a
timeout at all. The change is about to make "no `4xx` is ever resent" normative
while leaving an error whose message literally reads `Request timeout`
unclassified. The obvious future "tidy-up" — attach `status = 408` to it, which
looks like a correctness improvement — silently deletes the one retry this
change deliberately preserves and falsifies `docked-fleet-actions:324-328` and
`:466-470`. Nothing in any artifact would catch it: the unit test would still
pass (a `408` is asserted *not* retried), and the e2e never induces transport
loss.

Cost to close: one clause, one scenario testable in the same vitest block with
no 120 s wait.

**Proposed delta text** (replaces the requirement wholesale; combines MAJOR-1
and MAJOR-2 — the heading is unchanged):

```markdown
### Requirement: A Transport Failure Without A Response Status Is Still Resent
A mutation request that fails without ever receiving a response status (a
lost connection, DNS failure, or an aborted request — including the API
client's own request timeout, which surfaces as a status-less error and
SHALL NOT be reclassified as a `408`) is not a refusal of the submitted
payload. The shared client-side query client SHALL automatically resend
such a mutation request exactly once, carrying the identical request
payload and the same operation key on any surface that mints one.

The absence of a response status means no response was received; it does
NOT mean the request failed to reach the server or failed to take effect.
This resend is therefore an at-least-once delivery of the mutation, and its
safety rests on server-side duplicate handling owned by other capabilities
— a per-attempt operation key on the surfaces that mint one, the action
spine's single-slot claim on the command verbs, or an equivalent
uniqueness anchor. A mutation with no such guard is not made safe by this
requirement.

#### Scenario: A transport failure with no response status is still resent exactly once
- **WHEN** a mutation request fails without any response status (no
  response was ever received)
- **THEN** exactly one automatic resend is issued, carrying the identical
  request payload

#### Scenario: A client-side request timeout is a status-less failure, not a 408
- **WHEN** a mutation request is aborted by the API client's own request
  timeout, producing a failure that carries no response status
- **THEN** the failure is treated as a transport failure and exactly one
  automatic resend is issued — the `4xx` rule does not apply, because the
  failure carries no response status
```

**Proposed `tasks.md:1.2` addition** (append to the existing enumeration):

```markdown
      ; and a failure shaped exactly as `api-client.ts`'s timeout abort
      produces — `new Error('Request timeout')` with **no** `status`
      property — is still retried exactly once (this is the app's only
      real timeout path; the assertion exists so that attaching a `408`
      to that error later goes red instead of silently deleting the one
      surviving retry)
```

### MAJOR-2 — Requirement 2 implies "no response received" means "the server did not act"; the resend is at-least-once delivery and the spec should say what makes it safe
**Attaches to:** same requirement — covered by the second paragraph of the
MAJOR-1 replacement text above.

Mechanism, for the record: `api-client.ts:141` aborts at 120 s → status-less
error → React Query resends after ~1 s (mutations inherit the library's default
`retryDelay`; `query-client.ts:21` sets one only for queries) → two identical
requests in flight, each with its own 120 s budget. Contained today by the
guards in the §1 table — `sell`/`refuel` collapse on `operationKey` (and two
concurrent same-key settlements contend inside one Firestore transaction, so one
wins and the other fails closed), the command verbs collapse on the single-slot
claim, spawn on `corpByAccount`, account-create on `firestoreUid`. None of that
is this capability's property, which is exactly why the requirement must name it
as a dependency instead of implying the resend is intrinsically safe.

### MINOR-3 — "largely-unkeyed" is the delta's one unquantified adjective
**Attaches to:** `specs/mutation-retry-policy/spec.md:34-35`.

**Proposed edit** — in Requirement *Mutation Retry Never Resends a Deterministic
Client Rejection*, replace:

> and for this app's largely-unkeyed mutations, an invisible automatic resend is
> worse than a refusal the player can see and re-issue deliberately

with:

```markdown
and for a mutation that carries no per-attempt operation key, an invisible
automatic resend is worse than a refusal the player can see and re-issue
deliberately
```

Same argument, no adjective, and it stays true as more surfaces mint keys.

### MINOR-4 — The surviving resend is the last invisible one; recording it is cheap and testable (optional)
**Attaches to:** `specs/mutation-retry-policy/spec.md` as a third requirement,
plus one `tasks.md` line. Precedent: `api-client.ts:171` already `console.error`s
the *other* invisible retry (the 401 refresh).

Honest caveat: this makes the retry predicate side-effecting. React Query
invokes it once per failure decision, so the log count equals the resend count,
but if the writer would rather keep the predicate pure, dropping this finding
costs nothing that gates the change.

**Proposed delta text:**

```markdown
### Requirement: An Automatic Resend Is Recorded
The one automatic resend this policy still issues is invisible to the player
and invisible in the UI, and an unrecorded resend is indistinguishable from a
second user attempt in a server-side request log — the misreading this
capability exists to prevent. When the mutation retry policy authorizes an
automatic resend, the client SHALL record that fact, identifying it as an
automatic transport-level resend, so a doubled server-side request is
attributable to the retry policy rather than to the player.

#### Scenario: An automatic resend records that it happened
- **WHEN** the mutation retry policy authorizes an automatic resend of a
  status-less failure
- **THEN** a client-side warning is recorded identifying it as an automatic
  transport-level resend

#### Scenario: A refused mutation records nothing
- **WHEN** a mutation fails with a `4xx` or `5xx` response and no automatic
  resend is authorized
- **THEN** no automatic-resend warning is recorded
```

**Proposed `tasks.md` line 1.2b:**

```markdown
- [ ] 1.2b In the mutation block, spy on the console warning channel and
      assert it is written exactly once when the predicate authorizes the
      status-less resend, and not written for a `409`, a `408`, or a `500`
```

### MINOR-5 — Open question, not an invented number: the resend delay is unpinned
`query-client.ts:21` sets `retryDelay` for queries and nothing for mutations, so
the surviving resend's timing is whatever React Query defaults to (~1 s today).
That delay interacts with the 120 s client abort — a resend at +1 s means the
two attempts overlap for essentially the whole original request. No artifact
states an intended value and I will not invent one. Recommendation: leave the
behaviour alone for this fast-track and record the question. If the writer wants
it pinned, the smallest form is an explicit `retryDelay` on the mutations
defaults mirroring the queries' line — a code-only change, no requirement, since
"exactly once" is what the spec cares about.

---

## Follow-ups (NOT in scope for this fast-track)

### FOLLOW-UP A (would be MAJOR if in scope) — `useRefuel`'s `{ tons }` branch mints its operation key *inside* `mutationFn`, so a resend on that path mints a **new** key
`frontend/hooks/use-market.ts:105-113`:

```ts
    mutationFn: (vars) => {
      if ('request' in vars) {
        return marketService.refuel(vars.fleetId, vars.request)
      }
      return marketService.refuel(fleetId, { tons: vars.tons, operationKey: newOperationKey() })
    },
```

React Query re-invokes `mutationFn` for each retry attempt, so on that branch
the automatic resend carries a *different* `operationKey` — server-side dedupe
does not fire, and `docked-fleet-actions:466-470` ("the retry reuses the same
operation key … the settlement remains a single refuel") would be false. The
hook's own comment at `:99-103` asserts the opposite ("never per underlying
transport-retry attempt"), and `hooks/use-refuel.test.tsx:123-127` only proves
that two *separate* `.mutate()` calls differ — it never re-invokes one
`mutationFn`.

Why it is not a blocker here: the branch is unreachable from the UI. The only
production caller is `components/space/FleetActionsPanel.tsx:279`, which mints
the key in the handler and passes `{ fleetId, request }`. So this change does
not create the hole and does not widen it — but it does make the retry that
would exploit it normative. Recommend a filed defect: delete the dead branch, or
hoist the key out of `mutationFn`, plus a vitest that calls the returned
`mutationFn` twice with the same variables and asserts one key.

### FOLLOW-UP B (MINOR) — a resent command verb reports "conflict" for a command that succeeded
`mine-extraction:508-520` specifies that a retried commit after a lost response
gets the active-action `409`, and that "callers SHALL treat this conflict as
'already committed, re-fetch the fleet's active action,' not as a failed mine
attempt". After this change that `409` correctly stops there — but the frontend
surfaces it as an ordinary rejection toast. Pre-existing, unchanged by this
change, and fixing it here would pull `docked-fleet-actions`/`system-space-view`
copy into a fast-track that RULING 40 scoped to the predicate.

### Explicitly not findings against this change
- `defect-station-order-500` (a deterministic geometry refusal surfacing as a
  bodyless `500` on `/orders`): unaffected. `5xx` is not resent today
  (`query-client.ts:8`) and is not resent after this change. Adversary R1's
  BLOCKER 1 was the only thing that would have armed it, and it is gone.
- `BURN_FUEL_ALLOWANCE` / post-dock quote drift: out of scope per RULING 41.
- `defect-wake-roster-row-flake`: out of scope per RULING 42.
- Backend: nothing changes, per RULING 39's withdrawal of the exception. Nothing
  in this review requires a backend change to be safe.

---

## Summary

| Severity | Finding | In scope |
| --- | --- | --- |
| MAJOR-1 | Client timeout is status-less, not `408`; unnamed, and the new rule invites a repair that deletes the surviving retry | Yes |
| MAJOR-2 | "No response received" ≠ "server did not act"; the resend is at-least-once and its safety is borrowed | Yes |
| MINOR-3 | "largely-unkeyed" — unquantified adjective in normative text | Yes |
| MINOR-4 | The surviving resend is unrecorded; e2e status assertions never induce it | Yes, optional |
| MINOR-5 | Resend delay unpinned (open question — no invented number) | Note only |
| — | FOLLOW-UP A: `useRefuel`'s `{ tons }` branch re-mints the key per retry attempt | Follow-up |
| — | FOLLOW-UP B: resent command verb's `409` surfaces as a failure toast | Follow-up |

**Verdict: NEEDS FAILURE SPECS.** Both MAJORs close with the single replacement
requirement block and the one `tasks.md:1.2` addition given above. The `4xx`
decision itself, including the contested `408`/`429`, is correct on the
evidence and should ship.

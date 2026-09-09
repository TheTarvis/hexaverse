# Adversary R2 — `fix-mutation-retry-on-4xx`

**Reviewed** 2026-09-09, branch `main` @ `f706fad`. Artifacts (revised after R1,
previously unreviewed): `openspec/changes/fix-mutation-retry-on-4xx/`
(proposal.md, tasks.md, specs/mutation-retry-policy/spec.md — still no
design.md, correctly: every decision in this change is a one-line predicate
change and the reasoning fits in the requirement text. Not a finding.)

Sources re-derived, not taken on trust: `frontend/lib/query-client.ts`,
`frontend/lib/query-client.test.ts`, `frontend/lib/api-client.ts`,
`frontend/e2e/tests/space-double-submit.spec.ts`,
`openspec/specs/docked-fleet-actions/spec.md`,
`openspec/specs/system-space-view/spec.md`, the captured 409 in
`defect-post-sale-departure-burn-409s.md` (*The answer*), RULINGs 39–42, and
`defect-station-order-500.md`. `openspec validate fix-mutation-retry-on-4xx
--strict` passes.

**Verdict: BLOCKED.** One blocker, three majors, four minors. R1's substantive
kills are all closed — the 5xx inversion is gone, the no-status retry is
specified, the 408 reversal is pinned, the query half is fenced. The spec deltas
are now close to right. **The blocker is entirely in `tasks.md` 1.3**: the
repair R1 asked for was implemented with a Playwright mechanism that makes the
double-submit suite's counting *strictly weaker* than it is today — which is the
opposite of RULING 40's second half.

---

## Task A — verification of R1's findings

| R1 finding | Ruling | Evidence |
|---|---|---|
| **BLOCKER 1** — invented "5xx still retried once" | **CLOSED** | `spec.md:34-37`: "SHALL NOT automatically resend a mutation request that fails with any `5xx` response status, **unchanged from current behavior**"; scenario `spec.md:49-52` "A 5xx failure is not resent"; `proposal.md:32-36` "remains excluded … matching, not reversing, today's shipped behavior"; `tasks.md:1.2` "the block's existing `500` assertion already expects this — keep it passing, do not invert it". Re-derived against `query-client.ts:8` (`status >= 500 → false`) and the passing test at `query-client.test.ts:96-101`. The invented retry is gone from all three artifacts. |
| **BLOCKER 2** — no-status transport retry unspecified | **CLOSED** (new residual filed as MAJOR 2) | New `spec.md:68-80` *A Transport Failure Without A Response Status Is Still Resent*, plus `tasks.md:1.1` "SHALL still resend exactly once a failure that carries no response status at all … do not let the `4xx`/`5xx` widening accidentally remove it" and `tasks.md:1.2`'s added mutation-block assertion. `retry: false` and `status >= 500 && n < 1` are both now excluded. The two live scenarios it protects (`docked-fleet-actions/spec.md:324-328`, `:466-470`) survive. |
| **MAJOR 3** — 4xx rule vs `api-client.ts`'s 401 refresh-and-retry; scoping only in a discarded Purpose | **CLOSED for the normative half; MINOR residual** | The requirement now names its own actor in normative text — `spec.md:29` "The shared client-side query client's mutation retry policy" — and carries the carve-out at `:37-40`: "A single re-issue of a `401`ed request after the caller's credential has been force-refreshed is a credential retry, not an automatic retry of a refused payload, and is out of this requirement's scope." That survives archiving without the Purpose. Residual: the **scenario** at `:54-56` carries no carve-out and `tasks.md:1.3` asserts at the wire — see MINOR 5. |
| **MAJOR 4** — query policy unspecified but unavoidably touched | **CLOSED** | `spec.md:40-42` "This requirement governs mutation retry only; query (read) retry policy is a separate, unaffected concern"; `tasks.md:1.1` mandates the split and pins the query predicate as unchanged; `tasks.md:1.2` "the 'retry logic' **query** block (including its `408` and no-status assertions) must keep passing unedited". The red-test-with-no-owner trap at `query-client.test.ts:50-58` is closed. |
| **MAJOR 5** — false causal clause for `408`/`429`; the reversal unargued and unpinned | **CLOSED** | `spec.md:31-34` replaces the false reason: "including statuses that may look transient (`408`, `429`) … for this app's largely-unkeyed mutations, an invisible automatic resend is worse than a refusal the player can see and re-issue deliberately." Dedicated scenario `:58-61` pins `408`; `429` named in requirement text and in `:63-66`. `tasks.md:1.2` forbids the substitution R1 feared: "a `408` failure is **not** retried — this replaces the existing assertion … and must not be lost by picking a different `4xx` example instead". |
| **MAJOR 6** — task 1.3 had no acceptance criterion | **PARTIALLY CLOSED** | The criterion is now named (`tasks.md:1.3`: "exactly one entry for the action, AND that entry settled with a `2xx` status — failing with the observed status(es) in the assertion message"). But the mechanism prescribed to obtain it introduces **BLOCKER 1**, and the count half collides with two live assertions — **MAJOR 4** below. |
| **MINOR 7** — `grep -c` exit code / no positive assertion | **CLOSED** | `tasks.md:2.4` carries both: the exit-code warning ("run separately — `grep -c` exits `1` on a zero count, so do not chain them with `&&`") and the positive check `grep -c 'deterministic client rejection'`. Verified the phrase exists on a single unwrapped line at `spec.md:7`, so the grep will match. |
| **MINOR 8** — dangling "this change's report" reference | **CLOSED** | `proposal.md:66-71` now inlines the justification; `grep -rn report openspec/changes/fix-mutation-retry-on-4xx/` returns only two unrelated scenario lines. |

---

## BLOCKER 1 — Task 1.3's `requestfinished` switch makes the double-submit counter strictly weaker than today's, and totally blind to the one retry class this change preserves

**Location.** `tasks.md:28-31`:

> Change `frontend/e2e/tests/space-double-submit.spec.ts`'s `recordPosts`
> helper to listen on `requestfinished` (via `await req.response()`) **instead
> of `request`**, so each recorded entry carries a settled response status
> without hanging on a request that never gets a response.

**Why it is wrong.** `recordPosts` today (`space-double-submit.spec.ts:84-96`)
pushes on `page.on('request')` — i.e. **at send time**, synchronously, in the
same tick as the click. Every count assertion in the file is calibrated to that:

- `:204-207` `expect(orders.length).toBe(1)` — a bare, non-polled read.
- `:281-285` `expect.poll(() => sales.length).toBeGreaterThan(0)` followed
  immediately by a non-polled `expect(sales.length).toBe(1)`.
- `:329-333` and `:363-367` — the same poll-then-read-exactly-once shape for
  refuel and jump.

Playwright's `requestfinished` fires only "after downloading the response body",
and `await req.response()` inside the handler pushes the entry a further
microtask later. Two consequences, one probabilistic and one certain:

1. **The poll-then-assert shape becomes a race.** In the sell/refuel/jump
   scenarios the poll returns the instant the *first* request finishes; the
   synchronous `.toBe(1)` then runs while a genuine second, guard-defeating
   request may still be in flight and therefore unrecorded. Today both requests
   are recorded in the click's own tick, so `toBe(1)` cannot miss the second
   one. This is the primary guard of the file, and the change converts it from
   deterministic to timing-dependent.
2. **`requestfinished` never fires for a request that fails at the transport
   layer** — Playwright emits `requestfailed` for those. That is precisely the
   class this change now elevates to a SHALL (`spec.md:68-74`: a failure with
   no response status "SHALL … resend … exactly once"). Under 1.3 as written,
   a lost-connection original and its resend contribute **zero** recorded
   entries, so the suite can never observe the one retry the change preserves.

**Exploit.** The SDET follows 1.3 literally. `space-double-submit.spec.ts` still
goes green, and a future regression that re-mints a second request on a
double-activation — the exact defect `commitSell` shipped, quoted in the file's
own comment at `:244-246` — passes the guard whenever the second request settles
a few milliseconds after the first. RULING 40 commissioned this task to make a
class *more* visible; as written it makes the suite's headline assertion less
reliable than the one it replaces.

**Smallest fix.** Keep send-time recording; attach the status asynchronously.
Replace the first sentence of 1.3 with:

```markdown
- [ ] 1.3 Change `frontend/e2e/tests/space-double-submit.spec.ts`'s
      `recordPosts` helper so each entry is still pushed **on the `request`
      event, at send time** (so the existing count assertions keep catching a
      second request the instant it leaves the browser), and additionally
      carries a `status` field filled in asynchronously from
      `req.response().then(r => r?.status())` — plus a `requestfailed`
      listener that records the same entry with `status: null`, so a request
      that never receives a response is counted rather than dropped. Assert
      statuses only after the existing waits, via `expect.poll`, so a status
      that has not landed yet is awaited rather than read as a failure.
```

---

## MAJOR 2 — The no-status class is defined by a cause the client cannot observe, and on a real `api-client.ts` path the two requirements give opposite answers with no precedence rule

**Location.** `spec.md:68-72`:

> A mutation request that fails **without ever receiving a response status** (a
> lost connection, DNS failure, or an aborted request — **no response was ever
> received**) is not a refusal of the submitted payload.

versus `spec.md:34-37`: "SHALL NOT automatically resend a mutation request that
fails with any `5xx` response status".

**Why it is wrong.** The only discriminator available to the predicate is
whether the error object carries a `status` property (`query-client.ts:5`,
`'status' in error`). "Whether a response was ever received" is *not* the same
set. `api-client.ts:162-163` parses the body **inside** the try block:

```ts
const text = await response.text()
data = text ? JSON.parse(text) : undefined
```

A response that arrives with `content-type: application/json` and a truncated or
non-JSON body throws a `SyntaxError`; a connection dropped mid-body makes
`response.text()` throw a `TypeError`. Both are rethrown at `:223` as plain
`Error`s with **no `status`**, even though the response — including its status
line — *was* received. `createApiError` (`:109-113`) is the only place `status`
is attached, and it is never reached on that path.

So for a 5xx whose body fails to parse: Requirement 1's trigger ("fails with a
`5xx` response status") does not fire, because the failure carries no status;
Requirement 2's trigger fires under the observable reading and does not fire
under the causal reading. The spec states no precedence.

**Exploit.** Two engineers build different products from this text and both pass
every scenario. Engineer A implements `!('status' in error) → resend once` — and
resends a mutation the server already received and refused with a 500, which is
the doubling class Requirement 1 exists to abolish. Engineer B implements a
narrow cause test (`error.name === 'AbortError' || error instanceof TypeError`)
— and drops the resend for every other status-less failure, including non-`Error`
thrown values, which `query-client.test.ts:69-73` shows are live in this
codebase. Neither can be called wrong against the current text.

**Smallest fix.** Define the class by the observable key and name the precedence,
in `spec.md`'s Requirement 2 opening:

```markdown
A mutation request whose failure carries no HTTP response status — the error
surfaced to the retry policy exposes no status, whether because no response was
received (lost connection, DNS failure, abort) or because the response could
not be read or parsed, and including a thrown value that is not an `Error` at
all — is not a refusal of the submitted payload. The shared client-side query
client SHALL automatically resend such a mutation request exactly once…
```

---

## MAJOR 3 — The rule binds only the shared client's default; a per-call-site `retry` option satisfies the whole spec while resending `4xx` on the exact route the defect was captured on

**Location.** `spec.md:29-31`:

> **The shared client-side query client's mutation retry policy** SHALL NOT
> automatically resend a mutation request that fails with any `4xx` response
> status…

and the Purpose's wider claim at `spec.md:4-6`: "the one rule that decides, **for
every mutation issued from anywhere in the app**, whether a failed request is
worth resending automatically".

**Why it is wrong.** In React Query a `retry` passed to `useMutation` overrides
the client default entirely. The requirement constrains the *default object*; the
Purpose asserts a property of *every mutation*. Today no production hook
overrides `retry` (verified: the only `retry:` overrides outside tests are
`hooks/use-account.ts:27` and `components/account-provider.tsx:74`, and both are
`useQuery`). Nothing in the change preserves that.

**Exploit.** An implementer fixes `query-client.ts` exactly as specced and then,
because a burn commit "sometimes fails transiently", adds
`retry: (n, e) => n < 1` to the burn-order mutation in `SpaceCommandPanel`. Every
scenario in this delta still passes, `query-client.test.ts` still passes, and
`POST /v1/fleets/:id/orders` still doubles every 409 — the captured defect,
unrepaired, on the captured route.

**Smallest fix.** One sentence at the end of Requirement 1's text:

```markdown
This policy is the app's only mutation retry policy: no mutation call site
SHALL override it to resend a failure carrying a `4xx` or `5xx` status.
```

---

## MAJOR 4 — Task 1.3's "exactly one entry" collides with two deliberate `toBe(2)` assertions; the literal repair deletes the guard-*release* coverage

**Location.** `tasks.md:31-34`:

> Change **each scenario's** assertions so they check both: the recorded list
> has **exactly one entry for the action**, AND that entry settled with a `2xx`
> status

**Why it is wrong.** Two of the file's assertions require the recorded list to
hold **two** entries, on purpose:

- `space-double-submit.spec.ts:209-214` — "Scenario: The guard releases when the
  request settles or fails — a later, genuinely new command goes through" →
  `await expect.poll(() => orders.length).toBe(2)`.
- `:293-312` — "Scenario: A fresh attempt after a completed sale is a second,
  independent sale" → `.toBe(2)`, then asserts the second body carries a *new*
  operation key.

Those are the wire-level proof of two live requirements — `docked-fleet-actions`
*A fresh attempt after a completed sale is a second, independent sale*
(`spec.md:330-334`) and its refuel twin. "Each scenario" is also ambiguous
between the file's five `test()` blocks and the commented sub-scenarios inside
them.

**Exploit.** The SDET applies "exactly one entry" uniformly, finds `:214` and
`:310` red, and resolves it the cheap way — rewriting `.toBe(2)` to `.toBe(1)`,
or scoping a second recorder and dropping the release check. A weakened
assertion, produced by a task written to strengthen assertions, in the file that
exists because a weakened assertion let a double-charge ship.

**Smallest fix.** Replace the "each scenario" sentence in 1.3 with:

```markdown
Leave every existing count expectation exactly as it is — `toBe(1)` for the
double-activation guards, `toBe(2)` for the guard-release checks at `:214` and
`:310`, which are a second, deliberate user command and must not be reduced to
one. Add, alongside each count expectation, an assertion that **every** entry
recorded so far settled with a `2xx` status, failing with the observed
status(es) in the message.
```

---

## MINOR 5 — The 401/403 scenario does not carry the carve-out its requirement text does, and task 1.3 asserts at a layer where the carve-out is visible

`spec.md:54-56` reads "**WHEN** a mutation request fails with a `401` … **THEN**
no automatic resend is issued", with no reference to the credential-retry
carve-out four lines above it. At the query-client layer the scenario is true;
at the wire — which is exactly where `tasks.md:1.3` now asserts — a 401'd
mutation legitimately produces two POSTs (`api-client.ts:169-190`), the first
`401` and the second `2xx`, which would fail 1.3's "exactly one entry that
settled `2xx`". Low frequency (emulator tokens outlive these runs), but the two
artifacts disagree about the same wire. Smallest fix: append to the scenario
`- **AND** any re-issue performed by the API client after force-refreshing the
credential is not an automatic retry for this purpose`, and add to 1.3: "a
recorded entry that settled `401` immediately followed by a `2xx` re-issue of
the same route is the API client's credential retry, not a doubling — assert
against the final settled status."

## MINOR 6 — Requirement 2 legislates operation-key reuse, which its own Purpose disclaims owning, and no task verifies it

`spec.md:73-74` mandates the resend carry "the same operation key on any surface
that mints one" — while `spec.md:15-20` says this capability "does **not** own …
the operation-key idempotency that lets a legitimate transport-level retry dedupe
once it reaches the server", assigning it to `docked-fleet-actions` /
`system-space-view`, where it is already normative
(`docked-fleet-actions/spec.md:315-318`, `:455-459`). A rule with two homes
drifts. No task in this change tests it either — `tasks.md:1.2` covers the
predicate only. Smallest fix: make it a reference, not a duplicate — "carrying
the identical request payload, including whatever operation key the issuing
surface minted for that attempt (owned by `docked-fleet-actions`)".

## MINOR 7 — `proposal.md`'s opening citation points at the queries block

`proposal.md:3`: "`frontend/lib/query-client.ts:9-23` gives the global
**mutation** retry policy an exception list…". Lines 9–23 are the tail of
`shouldRetry` plus the whole `queries` block; `shouldRetry` is `:4-13` and the
mutation predicate is `:24-26`. The line range was inherited verbatim from
RULING 39 and is wrong there too. In a change whose entire subject is a
four-line predicate, the citation should land on it: `:4-13` and `:24-26`.

## MINOR 8 — The no-status resend is promoted from accident to SHALL for unkeyed mutations without a word about what that means there

Requirement 1's own rationale is that "this app's largely-unkeyed mutations"
make an invisible resend worse than a visible refusal (`spec.md:32-34`).
Requirement 2 then mandates (`SHALL`) exactly such an invisible resend for every
mutation with no response status — including `/orders`, `/mine`, `/jump` and
`/scan`, none of which mint an operation key (`operationKey` appears only in
`hooks/use-market.ts` and `components/space/FleetActionsPanel.tsx`). Preserving
today's behaviour is right and the two live specs depend on it; canonising it as
`SHALL` without naming the gap invites a future reader to assume at-most-once
holds everywhere. Smallest fix: append to Requirement 2 — "On surfaces that mint
no operation key this resend is at-least-once; making those surfaces idempotent
is out of this capability's scope."

---

## Out of scope, noted as context only (RULINGs 39/41/42)

- `defect-post-dock-burn-cost-drift.md` (the +22.7% quote-cap drift) and
  `defect-station-order-500.md` (`ErrEndpointInsideClearance` as a bodyless 500
  on `POST /v1/fleets/:id/orders`) can both make `space-double-submit.spec.ts`
  red. Neither is this change's to fix, and neither is a hostage to the new
  status assertions: both fail the *earlier* UI waits (`toContainText(/under
  way/)`) before any count or status assertion runs, and the burn scenario's
  recorder is anchored `/orders$`, so the re-quote's
  `POST /v1/fleets/:id/orders/preview` never enters the count.
- Worth recording as corroboration, not as a finding: `system-space-view`'s
  live *A Burn Commit Is Quote-Locked…* already says the commit "SHALL NOT be
  retried automatically at the higher cost" (`spec.md:614`, scenario `:633`).
  Today's 4xx retry is the mechanism by which that live scenario is false at the
  wire; this change is what makes it true.

## What holds up

- Every substantive R1 kill is closed, and closed in normative text rather than
  in a Purpose the archiver discards. The 5xx half now matches
  `query-client.ts:8` and `query-client.test.ts:96-101` exactly.
- The delta is decidable and unit-testable end to end: each of the five
  Requirement-1 scenarios maps to a one-line assertion against
  `getDefaultOptions().mutations.retry`, and `tasks.md:1.2` names all six
  assertions including the one that reverses the existing `408` case.
- No weasel words in either requirement; no undefined thresholds; the actor is
  named in normative text.
- `tasks.md` 2.1–2.4 place the tiers correctly per `docs/testing-tiers.md`, and
  2.4's archiver check is now both correct and positively assertive.

**Verdict: BLOCKED.**

---

## Orchestrator's annotation, 2026-09-09 — MAJOR 3's conclusion holds; its evidence line does not

**MAJOR 3's finding and its fix are ACCEPTED and applied.** No production
`useMutation` overrides `retry`, so the new `SHALL` closes a real hole.

**Its evidence line is incomplete and must not be re-derived from.** MAJOR 3
states:

> the only `retry:` overrides outside tests are `hooks/use-account.ts:27` and
> `components/account-provider.tsx:74`, and both are `useQuery`

Re-derived against the code, there are **five** production React Query `retry:`
options, all `useQuery`:

| Call site | Value |
| --- | --- |
| `frontend/hooks/use-auth.ts:159` | `retry: 3` (the idToken query) |
| `frontend/hooks/use-market.ts:63` | `retry: false` (station) |
| `frontend/hooks/use-burn-preview.ts:61` | `retry: false` |
| `frontend/hooks/use-account.ts:27` | predicate |
| `frontend/components/account-provider.tsx:74` | predicate |

Plus two hits that are **not** React Query options at all and would otherwise
look like violations — `frontend/hooks/use-burn-preview.ts:46` and
`frontend/components/render-guard/use-render-guard.ts:39` are `retry: () => void`
interface fields — and `frontend/lib/query-client.ts`'s own two defaults.

**Why this annotation exists.** The incomplete list was inherited verbatim into
`tasks.md` 2.1b as an expected grep result, producing a check that could never
pass. Caught by the orchestrator re-running the grep, corrected under
FULL-AUTO RULING 49, and 2.1b now tests the invariant (*which hook the option
sits on*) rather than a hit count that rots.

This is `README.md`'s **Lesson six** happening inside the run that cites it, and
its **Lesson three** corollary: a confident empirical claim from a specialist is
still a claim, and the fix it proposes can be correct even when its evidence is
not. Both halves are true here — the requirement sentence stands; the file list
did not.

Anyone re-deriving from this report: use the table above, not MAJOR 3's line.

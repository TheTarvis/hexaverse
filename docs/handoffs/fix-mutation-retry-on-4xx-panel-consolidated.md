# Consolidated findings → spec writer — `fix-mutation-retry-on-4xx`

**Assembled** 2026-09-09 by the orchestrator, from two reports that ran in
parallel against the same (post-R1-revision) artifacts:

- `docs/plans/continous_space/handoffs/fix-mutation-retry-on-4xx-adversary-r2.md`
  — **Verdict BLOCKED.** 1 blocker, 3 majors, 4 minors, plus a Task-A table
  verifying every R1 finding.
- `docs/plans/continous_space/handoffs/fix-mutation-retry-on-4xx-panel-reliability.md`
  — **Verdict NEEDS FAILURE SPECS.** 2 majors, 3 minors, 2 follow-ups.

**Read both files in full.** They carry the paste-ready delta text and the
quoted code evidence; this file carries only the merge decisions, the
tie-breaks, and the orchestrator's binding rulings. Where this file and a
source report disagree on wording, the source report's paste-ready text wins
unless a ruling below says otherwise.

Both reports independently confirm **every substantive R1 finding is CLOSED**
(the 5xx invention removed, the no-status retry made normative, the api-client
401 carve-out moved into normative text, the query half fenced, the `408`
reversal pinned by its own scenario, MINOR 7's grep and MINOR 8's dangling
reference fixed). R1's MAJOR 6 is **partially closed** — the criterion was
named, but the mechanism prescribed to obtain it is adversary R2's blocker.

---

## Merges (one finding, two reporters — credit both, fix once)

**MERGE-1 — the definition of the "no response status" class.**
Adversary R2 MAJOR 2 + reliability MAJOR-1. Both attack the same sentence in
Requirement 2 from opposite ends, and the fix must satisfy both at once:

- Adversary: the class is defined by an **unobservable cause** ("no response
  was ever received"), while the only thing the predicate can test is whether
  the error carries a `status` property (`query-client.ts:5`). On
  `api-client.ts:162-163` a received-but-unparseable response body throws with
  no `status` — so the causal reading and the observable reading disagree, and
  no precedence rule is stated. Two engineers build different products and both
  pass every scenario.
- Reliability: the app emits **no `408` from any backend route**
  (`grep -rn StatusRequestTimeout backend` is empty); its only real timeout is
  `api-client.ts:219-220`'s `new Error('Request timeout')` with **no status**.
  So the new rule leaves an error whose message literally reads
  `Request timeout` unclassified, and the obvious future tidy-up — attaching
  `status = 408` to it, which looks like a correctness fix — silently deletes
  the one retry this change preserves and falsifies two live scenarios.

**Combined fix:** define the class by the observable key (**the error surfaced
to the retry policy exposes no HTTP response status**), enumerate the causes as
non-exhaustive examples *including* the API client's own request timeout and a
received-but-unreadable response, include a thrown value that is not an `Error`
at all (`query-client.test.ts:69-73` proves those are live), and add
reliability's explicit `SHALL NOT be reclassified as a 408` clause plus its
paired scenario. Use reliability's requirement block as the base and fold in
adversary MAJOR 2's opening sentence.

**MERGE-2 — at-least-once, and whose property the safety actually is.**
Adversary R2 MINOR 8 + MINOR 6 + reliability MAJOR-2. All three say the same
thing: Requirement 2 promotes an invisible resend from accident to `SHALL`
while implying "no response received" means "the server did not act" — which is
false — and while *duplicating* an operation-key rule that the delta's own
Purpose disclaims owning and that is already normative in
`docked-fleet-actions/spec.md:315-318` and `:455-459`.

**Combined fix:** (a) state plainly that the resend is **at-least-once**
delivery and that its safety rests on server-side duplicate handling owned by
other capabilities — a per-attempt operation key, the action spine's
single-slot claim, or an equivalent uniqueness anchor; (b) note that on
surfaces minting no operation key the resend is at-least-once and making them
idempotent is out of this capability's scope; (c) turn the key-reuse mandate
into a **reference, not a duplicate** — "carrying the identical request
payload, including whatever operation key the issuing surface minted for that
attempt (owned by `docked-fleet-actions`)". A rule with two homes drifts.

---

## Accepted findings, in the order the writer should apply them

### 1. BLOCKER (adversary R2 BLOCKER 1) — `tasks.md` 1.3's `requestfinished` switch makes the double-submit counter strictly weaker

`recordPosts` records at **send time** today (`page.on('request')`,
`space-double-submit.spec.ts:84-96`), and every count assertion in the file is
calibrated to that. Switching to `requestfinished` + `await req.response()`
does two things, one probabilistic and one certain:

1. The poll-then-assert shape (`:281-285`, `:329-333`, `:363-367` — an
   `expect.poll(...).toBeGreaterThan(0)` immediately followed by a
   **non-polled** `.toBe(1)`) becomes a race: the poll returns the instant the
   first request *finishes*, and the synchronous `.toBe(1)` then runs while a
   genuine second, guard-defeating request may still be in flight and therefore
   unrecorded. Today both requests land in the click's own tick and `.toBe(1)`
   cannot miss the second one.
2. `requestfinished` **never fires** for a transport-layer failure — Playwright
   emits `requestfailed`. That is exactly the class this change elevates to a
   `SHALL`, so the suite could never observe the one retry the change
   preserves.

RULING 40 commissioned this task to make a class **more** visible. As written
it makes the file's headline assertion less reliable than the one it replaces.
**Apply adversary R2 BLOCKER 1's paste-ready 1.3 replacement verbatim** (record
on `request` at send time; fill `status` asynchronously from
`req.response().then(r => r?.status())`; add a `requestfailed` listener
recording `status: null`; assert statuses via `expect.poll` after the existing
waits).

*Verified by the orchestrator against the file: the `toBe(2)` at `:214` and
`:310` and the poll-then-read shape at `:281-285` are exactly as reported.*

### 2. MAJOR (adversary R2 MAJOR 4) — task 1.3's "exactly one entry" collides with two deliberate `toBe(2)` assertions

`space-double-submit.spec.ts:214` ("the guard releases … a later, genuinely new
command goes through") and `:310` ("a fresh attempt after a completed sale is a
second, independent sale") both require **two** recorded entries on purpose.
They are the wire-level proof of two live requirements
(`docked-fleet-actions/spec.md:330-334` and its refuel twin). "Each scenario"
is also ambiguous between the file's five `test()` blocks and the commented
sub-scenarios inside them.

An SDET applying "exactly one entry" uniformly finds `:214` and `:310` red and
resolves it the cheap way — rewriting `.toBe(2)` to `.toBe(1)`. A weakened
assertion, produced by a task written to strengthen assertions, in the file
that exists because a weakened assertion let a double-charge ship. **Apply
adversary R2 MAJOR 4's paste-ready replacement**: leave every existing count
expectation exactly as it is, naming `:214` and `:310` explicitly as
deliberate; add the status assertion *alongside* each count expectation.

### 3. MAJOR (MERGE-1) — Requirement 2's class definition

See MERGE-1 above. Base text: reliability MAJOR-1's requirement block; opening
sentence: adversary R2 MAJOR 2's. Include reliability's second scenario
("A client-side request timeout is a status-less failure, not a 408") and its
`tasks.md` 1.2 addition asserting a `new Error('Request timeout')` with no
`status` property is still retried exactly once.

### 4. MAJOR (adversary R2 MAJOR 3) — a per-call-site `retry` override satisfies the whole spec while resending 4xx on the captured route

The requirement binds the shared client's **default**; the Purpose claims a
property of **every mutation**. In React Query a `retry` passed to
`useMutation` overrides the default entirely. Today no production hook does
(the only `retry:` overrides outside tests are `hooks/use-account.ts:27` and
`components/account-provider.tsx:74`, both `useQuery`) — and nothing in the
change preserves that. An implementer fixes `query-client.ts` exactly as
specced, then adds `retry: (n, e) => n < 1` to the burn-order mutation because
it "sometimes fails transiently", and `POST /v1/fleets/:id/orders` doubles
every 409 again — the captured defect, on the captured route, with every
scenario still green.

**Apply adversary R2 MAJOR 3's one sentence** at the end of Requirement 1.

### 5. MAJOR (MERGE-2) — at-least-once and borrowed safety

See MERGE-2 above.

### 6. MINOR (adversary R2 MINOR 5) — the 401/403 scenario lacks the carve-out its requirement text carries

The requirement text carves out the credential retry; the **scenario** at
`spec.md:54-56` does not, and `tasks.md` 1.3 now asserts at the wire, where a
401'd mutation legitimately produces two POSTs (`api-client.ts:169-190`) — the
first `401`, the second `2xx`. Apply adversary R2 MINOR 5's scenario `AND`
clause **and** its 1.3 addition (a recorded entry that settled `401`
immediately followed by a `2xx` re-issue of the same route is the API client's
credential retry, not a doubling — assert against the final settled status).

### 7. MINOR (reliability MINOR-3) — "largely-unkeyed" is the delta's one unquantified adjective

Replace with reliability MINOR-3's conditional: "for a mutation that carries no
per-attempt operation key…". Same argument, no adjective, stays true as more
surfaces mint keys.

### 8. MINOR (reliability MINOR-4, accepted per RULING 45 below) — the surviving resend is unrecorded

Add reliability MINOR-4's third requirement *An Automatic Resend Is Recorded*,
its two scenarios, and its `tasks.md` 1.2b line. Use `console.warn` (the
warning channel), and log **only when the predicate authorizes a resend**, so
log count equals resend count. See RULING 45 for the basis and the accepted
cost.

### 9. MINOR (adversary R2 MINOR 7) — `proposal.md`'s opening citation points at the queries block

`proposal.md:3` cites `query-client.ts:9-23`; `shouldRetry` is `:4-13` and the
mutation predicate is `:24-26`. Lines 9–23 are the tail of `shouldRetry` plus
the whole **queries** block. The range was inherited verbatim from RULING 39
and is wrong there too. Fix to `:4-13` and `:24-26`.

---

## Tie-breaks applied

No inter-reviewer conflict arose. The two reports overlap on three findings
(MERGE-1, MERGE-2) and agree on direction in every case. Where reliability
wanted the requirement to **name** the borrowed safety and the adversary wanted
the key-reuse mandate to become a **reference**, both resolve to the same
edit — state the dependency, do not re-legislate it — so no tie-break was
needed.

Standing tie-break, unused this round, recorded for the next: architect wins on
technical shape, security on controls, dba on data integrity, ux on
user-observable behavior. Reliability is the sole panel member on this
fast-track, so on a reliability-vs-adversary conflict the adversary's finding
is the one that must be *closed*, but reliability's proposed text is the one to
close it with when both are offered.

---

## Not accepted / not this change's

- **Reliability MINOR-5** — the mutation `retryDelay` is unpinned
  (`query-client.ts:21` sets one for queries only; mutations inherit React
  Query's ~1 s default, which means a resend overlaps the original for nearly
  the whole 120 s abort window). Ruled a **note, not a change** — see RULING 46.
- **Reliability FOLLOW-UP A** — `useRefuel`'s `{ tons }` branch mints its
  operation key **inside** `mutationFn` (`hooks/use-market.ts:111`), so a
  transport resend on that path carries a *new* key and server-side dedupe
  never fires. Filed as a defect, not fixed here — see RULING 47.
- **Reliability FOLLOW-UP B** — a resent command verb's `409` surfaces as an
  ordinary rejection toast, where `mine-extraction/spec.md:508-520` says
  callers SHALL read it as "already committed, re-fetch". Pre-existing,
  unchanged by this change — see RULING 48.
- **`defect-post-dock-burn-cost-drift`** (the +22.7% quote-cap drift) and
  **`defect-station-order-500`** — out of scope per RULINGs 39 and 41. Both
  reports independently confirm neither is a hostage to the new status
  assertions: both fail the *earlier* UI waits (`toContainText(/under way/)`)
  before any count or status assertion runs, and the burn recorder is anchored
  `/orders$`, so the re-quote's `/orders/preview` never enters the count.
- **`defect-wake-roster-row-flake`** — out of scope per RULING 42.
- **Backend anything** — RULING 39 withdrew the exception. Reliability states
  explicitly that nothing in its review requires a backend change to be safe.

## Corroboration worth keeping (not a finding)

`system-space-view`'s live requirement *A Burn Commit Is Quote-Locked to the
Preview the Player Agreed To* already says the commit "SHALL NOT be retried
automatically at the higher cost" (`spec.md:614`, scenario `:633`). **Today's
4xx mutation retry is the mechanism by which that live scenario is false at the
wire.** This change is what makes it true — which is independent confirmation
that the change is repairing real drift, not inventing policy.

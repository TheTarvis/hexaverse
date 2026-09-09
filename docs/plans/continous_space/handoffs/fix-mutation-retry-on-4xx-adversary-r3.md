# Adversary R3 (final round) — `fix-mutation-retry-on-4xx`

**Reviewed** 2026-09-09, branch `main` @ `f706fad`. Scope per the round-3 brief:
verification of R2's eight findings and reliability's five in-scope findings,
plus a residue spot-check **limited to the round-2 repairs**. No fresh full
attack — R1 and R2 walked the whole artifact set.

Artifacts: `/Users/travis/Projects/hexaverse/openspec/changes/fix-mutation-retry-on-4xx/{proposal.md,tasks.md,specs/mutation-retry-policy/spec.md}`
(3 requirements, 10 scenarios; `openspec validate fix-mutation-retry-on-4xx --strict`
passes; no design.md, correct for this fast-track).

Re-derived, not taken on trust: `/Users/travis/Projects/hexaverse/frontend/lib/query-client.ts`,
`query-client.test.ts`, `api-client.ts`, `api-client.test.ts`,
`/Users/travis/Projects/hexaverse/frontend/e2e/tests/space-double-submit.spec.ts`,
`openspec/specs/docked-fleet-actions/spec.md`, `openspec/specs/system-space-view/spec.md`,
`docs/plans/continous_space/handoffs/defect-post-dock-burn-cost-drift.md`,
`defect-post-sale-departure-burn-409s.md`, `defect-station-order-500.md`, RULINGs 43–49,
and the R2 orchestrator annotation's corrected `retry:` table (re-run: it is exactly right —
five production hits, all `useQuery`, plus two `retry: () => void` interface fields).

**Verdict: CLEAR.** No blocker. Four MAJOR and four MINOR items, of which seven are
**RESIDUE** (defects inside round-2 repair text) and one is **NEW**. Residue
dominating the round is the convergence signal the workflow expects at the cap;
none of it stops the run, and all eight fixes are one or two sentences each.

---

## Task A — verification table

### Adversary R2's findings

| R2 finding | Ruling | Evidence (re-derived) |
|---|---|---|
| **BLOCKER 1** — `requestfinished` switch weakens the double-submit counter | **CLOSED** | `tasks.md:52-65` now mandates the opposite: "each entry is still pushed **on the `request` event, at send time**… Do **not** switch the helper to `requestfinished`: that fires only after the response body downloads (making the file's poll-then-read `toBe(1)` checks a race) and never fires at all for a transport-layer failure". Send-time recording preserved; the prohibition carries its own reasons, so it survives a careless edit. Residue in the same clause → MAJOR D and MINOR E. |
| **MAJOR 2** — no-status class defined by an unobservable cause; no precedence | **CLOSED** | `spec.md:72-82` defines the class by the observable key ("the error surfaced to the retry policy exposes no response status"), lists causes as "illustrative, not exhaustive", and names the non-`Error` thrown value. `spec.md:88-93` adds the precedence paragraph: "a failure carrying no response status falls under this requirement and the `4xx`/`5xx` rule applies only to a failure that carries one." Scenario `:118-126` makes the observable reading the only passing implementation, and `tasks.md:11-17` forbids the cause-specific test at the predicate. Both engineer-A and engineer-B implementations from R2 MAJOR 2 now fail a scenario. |
| **MAJOR 3** — per-call-site `retry` override satisfies the whole spec | **CLOSED** | `spec.md:42-44`: "This policy is the app's only mutation retry policy: no mutation call site SHALL override it to resend a failure carrying a `4xx` or `5xx` status." Verified against the code: no `useMutation` in the frontend passes `retry`. `tasks.md:83-97` (2.1b) verifies the invariant by *which hook the option sits on*, and its parenthetical enumeration re-derives exactly (`use-auth.ts:159`, `use-market.ts:63`, `use-burn-preview.ts:61`, `use-account.ts:27`, `account-provider.tsx:74`; `use-burn-preview.ts:46` and `use-render-guard.ts:39` are the `retry: () => void` fields). RULING 49's correction landed correctly. Minor over-reach → MINOR G. |
| **MAJOR 4** — "exactly one entry" collides with two deliberate `toBe(2)`s | **CLOSED** | `tasks.md:66-78` (1.3b): "Leave every existing count expectation … exactly as it is — `toBe(1)` for the double-activation guards, `toBe(2)` for the guard-release checks at `:214` and `:310`, which are a second, deliberate user command and must not be reduced to one." Line numbers verified in the current file: `:214` `expect.poll(() => orders.length…).toBe(2)`, `:310` `expect.poll(() => sales.length…).toBe(2)`. The status assertion is now additive ("alongside each count expectation"). New consequence of the additive assertion → MAJOR B. |
| **MINOR 5** — 401/403 scenario lacked the credential carve-out | **CLOSED** | `spec.md:59-60` adds "**AND** any re-issue performed by the API client after force-refreshing the credential is not an automatic retry for this purpose"; `tasks.md:74-78` carries the wire-level rule citing `api-client.ts:169-190` (verified: the 401 refresh-and-retry is at `:168-206`). Count half unaddressed → MINOR H. |
| **MINOR 6** — Requirement 2 duplicated an operation-key rule it disclaims owning | **CLOSED** | `spec.md:84-86` is now a reference, not a duplicate: "including whatever operation key the issuing surface minted for that attempt (owned by `docked-fleet-actions`)". Confirmed still normative next door at `docked-fleet-actions/spec.md:316-322` and `:453-460`. |
| **MINOR 7** — proposal citation pointed at the queries block | **CLOSED** | `proposal.md:3-4` now cites "`frontend/lib/query-client.ts:4-13` … and `:24-26`". Verified: `shouldRetry` is `:4-13`; the mutations default is `:24-26`. |
| **MINOR 8** — no-status resend promoted to SHALL without naming the gap | **CLOSED** | `spec.md:95-103`: "This resend is therefore an at-least-once delivery… On a surface that mints no operation key the resend is at-least-once and nothing in this capability makes it safe; making those surfaces idempotent is out of this capability's scope." |

### Reliability panel's in-scope findings

| Finding | Ruling | Evidence |
|---|---|---|
| **MAJOR-1** — the app's timeout is status-less, not a `408`; the "attach 408" tidy-up would delete the surviving retry | **PARTIALLY CLOSED** | The *spec* half is closed and well done: `spec.md:81-82` "The API client's own request timeout is a member of this class and SHALL NOT be reclassified as a `408`", with its own scenario `:111-116`. The *enforcement* half is not: `tasks.md:39-43`'s assertion cannot go red when someone attaches a `408` in `api-client.ts` → **MAJOR A**. |
| **MAJOR-2** — "no response received" ≠ "the server did not act"; borrowed safety | **CLOSED** | `spec.md:95-100`, quoted above, names the operation key, the action spine's single-slot claim, and "an equivalent uniqueness anchor" as where the safety lives. |
| **MINOR-3** — "largely-unkeyed" | **CLOSED** | `spec.md:32-34` now reads "for a mutation that carries no per-attempt operation key". No weasel word survives in either requirement. |
| **MINOR-4** — the surviving resend is unrecorded (RULING 45) | **CLOSED as text** | `spec.md:128-148` (*An Automatic Resend Is Recorded*) + `tasks.md:18-24` (1.1b) + `:49-51` (1.2b). Bounded correctly on the authorize-only side ("The record SHALL be written only when a resend is authorized, so the number of records equals the number of automatic resends"). Two testability residues → **MAJOR C**, **MINOR F**. |
| **MINOR-5** — mutation `retryDelay` unpinned | **NOT A FINDING** | RULING 46. Not reopened. |

**R1 spot-check** (R2's Task A verified these; I re-derived the two blockers only):
5xx still excluded and matching `query-client.ts:8` plus the passing
`query-client.test.ts:96-101` ✅; the status-less resend still normative and still
`failureCount < 1` exactly once ✅.

**No contradiction with live specs.** `docked-fleet-actions/spec.md:325-329` and
`:466-470` ("the retry reuses the same operation key … the settlement remains a
single sale/refuel") require the status-less resend this change preserves;
`system-space-view/spec.md:614` and its scenario `:633` ("the commit is not
retried automatically at the higher cost") become true at the wire only after
this change lands. The change repairs drift in both directions.

---

## MAJOR A (RESIDUE) — `tasks.md` 1.2's timeout assertion cannot fail for the reason it says it exists; reliability MAJOR-1's prohibition is unenforced

**Location.** `tasks.md:39-43`:

> and a failure shaped exactly as `api-client.ts`'s timeout abort produces —
> `new Error('Request timeout')` with **no** `status` property — is still retried
> exactly once (**this is the app's only real timeout path; the assertion exists
> so that attaching a `408` to that error later goes red instead of silently
> deleting the one surviving retry**)

paired with the normative prohibition at `spec.md:81-82`: "The API client's own
request timeout is a member of this class and **SHALL NOT be reclassified as a
`408`**."

**Why it is wrong.** The assertion lives in `query-client.test.ts` and feeds the
predicate a **hand-constructed** error. It never observes `api-client.ts`. If a
future developer does exactly the tidy-up reliability warned about —

```ts
if (error instanceof Error && error.name === 'AbortError') {
  const e = new Error('Request timeout') as Error & { status: number }
  e.status = 408              // "correctness improvement"
  throw e
}
```

— then `query-client.test.ts` still constructs its own status-less
`new Error('Request timeout')`, still gets `true`, and stays **green**. The
predicate's 408 assertion (`4xx` → not retried) also stays green. The suite has
no way to notice, and `frontend/lib/api-client.test.ts:306-322` — the one test
that exercises the abort path — asserts only the message
(`rejects.toThrow('Request timeout')`), never the absence of `status`.

**Exploit.** The change ships with a `SHALL NOT` that nothing verifies, and the
parenthetical actively misleads the next reader into believing it is verified —
which is the precise failure mode (a claim inherited without re-derivation) that
RULING 49 and README Lesson six were written about. The surviving transport
retry is then deleted silently, falsifying `docked-fleet-actions/spec.md:325-329`
and `:466-470`.

**Smallest fix.** One added task and one honest parenthetical:

```markdown
- [ ] 1.2c In `frontend/lib/api-client.test.ts`'s existing "timeout handling"
      test (`:306-322`), assert the thrown error carries **no** `status`
      property — `await expect(slowClient.get('/test')).rejects.not.toHaveProperty('status')` —
      so attaching a `408` to the abort path goes red at the place that would
      attach it. The `query-client.test.ts` assertion in 1.2 pins the predicate
      only; it constructs its own error and cannot observe `api-client.ts`.
```

and change 1.2's parenthetical from "so that attaching a `408` to that error
later goes red" to "so that a later narrowing of the predicate goes red (the
`api-client` side of that prohibition is pinned by 1.2c)". Add
`frontend/lib/api-client.test.ts` to `proposal.md`'s Impact → Affected code.

---

## MAJOR B (NEW) — 1.3b's "every entry settled `2xx`" is asserted at the one site with no preceding UI wait, where a known-open, out-of-scope defect produces a `409`

**Location.** `tasks.md:69-73`:

> Add, alongside **each** count expectation, an assertion that **every** entry
> recorded so far settled with a `2xx` status

applied at `space-double-submit.spec.ts:209-214`:

```ts
await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/docked/i, { timeout: 600_000 })
await selectBody(page, bodyIds[1])
await page.getByTestId('burn-button').click()
await expect.poll(() => orders.length, { timeout: 20_000 }).toBe(2)
```

**Why it matters.** R2's out-of-scope note (and the consolidated file, quoting
it) asserts that the two open defects are not hostages to the new status
assertions because "both fail the *earlier* UI waits (`toContainText(/under
way/)`) before any count or status assertion runs". Re-derived: that is true at
every site **except this one**. The guard-release command at `:213` has **no**
`/under way/` wait after it — the only assertion is the count poll, which passes
on send-time recording regardless of what the server answered. Today a `409`
there is invisible and the test is green. With 1.3b's addition it is red.

And a `409` there is the documented shape of an open defect:
`defect-post-dock-burn-cost-drift.md` records `ErrQuotedCapExceeded`
(`fuelCostTons` 6.1296 vs `maxFuelTons` 4.99488, +22.7%) with its leading
suspicion stated verbatim as "the sequence that produces it is **burn → dock →
immediately order again**" — which is exactly lines 211-213. RULING 41 forbids
fixing it here and forbids widening `BURN_FUEL_ALLOWANCE`.

**Exploit.** Task 2.3 requires this suite green at archive time. The SDET or dev
hits an unexplained red on the *new* assertion, at the *new* site, and resolves
it the cheap way — dropping the status assertion at `:214`, or scoping it to
"the first entry". That is R2 MAJOR 4's exploit reappearing through the repair
that closed it: a weakened assertion produced by a task written to strengthen
assertions. (This is not an argument against the assertion — a `409`'d command
genuinely is not a successful one. It is an argument that the task must tell its
runner what the red means and who owns it.)

**Smallest fix.** Append to 1.3b:

```markdown
      If the status assertion at `:214` goes red with a `409` carrying
      `"solved fuel cost exceeds the requested maxFuelTons cap"`, that is
      `defect-post-dock-burn-cost-drift.md` (RULING 41 — out of scope here, do
      **not** widen `BURN_FUEL_ALLOWANCE` and do **not** relax or scope down
      this assertion). Record it against that defect file and report the red;
      the assertion is correct and the command genuinely failed.
```

---

## MAJOR C (RESIDUE) — Requirement 3 has no scenario for the *exhausted* status-less failure, so an over-logging implementation passes every scenario and every task

**Location.** `spec.md:136-137`: "The record SHALL be written **only when a
resend is authorized**, so the number of records equals the number of automatic
resends", against its only two scenarios (`:139-148`: one status-less resend
logs; one `4xx`/`5xx` refusal does not) and `tasks.md:49-51` (1.2b: written once
on the status-less resend, "not written for a `409`, a `408`, or a `500`").

**Why it is wrong.** The mutation predicate is invoked on **every** failure of
the attempt chain, including `failureCount === 1` — the second, status-less
failure that follows the one resend, where it returns `false`. Nothing in the
scenarios or in 1.2b exercises that call. The literal implementation

```ts
if (!hasStatus(error)) {
  console.warn('automatic transport-level resend')
  return failureCount < 1
}
```

satisfies both scenarios, satisfies 1.2b as written, and emits **two** warnings
for **one** resend — breaking the requirement's own counting sentence while the
suite stays green.

**Exploit.** The log over-reports resends. The next reader of a doubled
server-side request log counts two automatic resends where one occurred, and
mis-attributes a real second request to the retry policy. That is RULING 45's
misreading, inverted — the exact class the requirement was added to prevent.

**Smallest fix.** One scenario plus five words in 1.2b:

```markdown
#### Scenario: An exhausted status-less failure records nothing
- **WHEN** a status-less mutation failure arrives after the one automatic
  resend has already been issued, so no further resend is authorized
- **THEN** no additional automatic-resend warning is recorded
```

and in 1.2b: "…and not written for a `409`, a `408`, a `500`, **or a
status-less failure at `failureCount` 1, where no resend is authorized**".

---

## MAJOR D (RESIDUE) — 1.3's `requestfailed` clause has two readings, and the natural one double-counts the very class the change preserves

**Location.** `tasks.md:57-61`:

> plus a `requestfailed` listener that **records the same entry with
> `status: null`**, so a request that never receives a response is **counted
> rather than dropped**

**Why it is wrong.** Playwright fires `request` for every request and *then*
either `requestfinished` or `requestfailed`. Under 1.3's own (correct)
send-time design, a transport-failed POST has **already** been pushed by the
`request` handler — so "counted rather than dropped" is a leftover rationale
from the `requestfinished` mechanism that 1.3 now forbids. An SDET who follows
the rationale pushes a second entry; an SDET who follows "the same entry"
mutates the existing one. The two readings differ by a factor of two in the
count that is this file's entire purpose.

**Exploit.** Under the push reading, one lost-connection POST is recorded twice,
and its automatic resend a third time. `expect(...).toBe(1)` reads a single user
command as a double-submit — a phantom doubling, in the file whose reason for
existing is telling a real doubling from a phantom one. (Latent today: these
runs do not induce transport loss. It is exactly the class the change elevates
to a `SHALL`, so someone will induce it eventually.)

**Smallest fix.** Replace the clause with:

```markdown
      plus a `requestfailed` listener that sets the **already-recorded**
      entry's `status` to `null` (it was pushed at `request` time and must not
      be pushed again — `requestfailed` fires *in addition to* `request`, so a
      second push would double-count one request), and treat `null` as
      not-`2xx` in the status assertion
```

---

## MINOR E (RESIDUE) — 1.3's `req.response().then(...)` has no rejection guard

`tasks.md:56-57` prescribes `req.response().then(r => r?.status())` with no
`.catch`. `request.response()` rejects when the page or context closes while a
matched POST is still outstanding; an unhandled rejection is reported by the
Playwright runner as a test-level error, turning a passing 900 s journey into an
unexplained failure. Smallest fix: append "— `.catch(() => null)` the promise so
a page closed mid-flight records `status: null` rather than raising an unhandled
rejection."

## MINOR F (RESIDUE) — Requirement 3's "identifying it as an automatic transport-level resend" has no asserted marker

`spec.md:133-135` and scenario `:142-144` require the record to *identify* the
resend; `tasks.md:49-51` asserts only that the warning channel is written the
right number of times. `console.warn('retry')` satisfies both. RULING 45's whole
value is that a future reader can attribute a doubled request, and an
unattributable warning does not do that. Smallest fix: in 1.2b, "…and assert the
warning's message contains the fixed marker `automatic transport-level resend`,
so the record is greppable in a captured console log."

## MINOR G (RESIDUE) — 2.1b checks something stricter than the SHALL it verifies

`spec.md:42-44` forbids a call site overriding the policy **to resend a `4xx` or
`5xx`**; `tasks.md:83-84` checks that **no `useMutation` passes a `retry` option
at all**. A future `retry: false` on a mutation is fully compliant with the
requirement and fails the check. Harmless today (there are none), and the strict
form is easier to run — worth one clause so the next runner does not "fix" a
compliant call site: "a `useMutation` passing `retry: false` (strictly narrower
than the default) satisfies the requirement; anything that can return `true` for
a status-carrying failure does not."

## MINOR H (RESIDUE) — 1.3b's credential-retry carve-out rescues the status assertion but not the count

`tasks.md:74-78` says a `401` followed by a `2xx` re-issue is "not a doubling —
assert against the final settled status". True for status; the `api-client`
re-issue is a **separate `fetch`**, so it is a separate `request` event and a
separate recorded entry — the *count* assertion (`toBe(1)`) would fail regardless
of how statuses are read. This is pre-existing (today's recorder has the same
property) and unreachable in practice (emulator tokens outlive these runs), so it
is not this change's defect — but the sentence as written promises a rescue it
does not deliver. Smallest fix: "…assert against the final settled status; note
the credential re-issue is a second `request` event and would also perturb the
count, which is pre-existing and out of scope here."

---

## What holds up

- The three requirements are decidable, weasel-free, named-actor, and every
  predicate scenario maps to a one-line assertion against
  `getDefaultOptions().mutations.retry`. The captured `409` doubling is pinned by
  its own scenario, and the call-site-override hole R2 opened is closed by both a
  `SHALL` and a task that verifies it by invariant rather than by a rotting file list.
- The observable-key definition plus the precedence paragraph genuinely kill R2
  MAJOR 2's two-engineers exploit: engineer A's `!('status' in error)` is now the
  *mandated* implementation, and engineer B's cause test is forbidden by `spec.md:79-81`,
  `:118-126` and `tasks.md:11-17`.
- 1.3 and 1.3b preserve send-time recording, name both `toBe(2)` sites by verified
  line number, and forbid the mechanism R2 blocked — with the reasons attached, so
  the prohibition survives being re-read out of context.
- Tier placement in 2.1–2.4 still matches `docs/testing-tiers.md`, and 2.4's
  archiver check is correct (`grep -c 'deterministic client rejection'` matches
  `spec.md:7`, a single unwrapped line, and is case-distinct from the requirement
  heading).

**Verdict: CLEAR.** No blocker. MAJOR A–D and MINOR E–H are follow-up material
per the cap rule; A and B are the two worth applying before the build, since each
is one sentence and each prevents a wrong repair by the crew that follows.

---

## Orchestrator's rulings on round 3 — 2026-09-09

**Verdict accepted: CLEAR.** Three rounds run, cap reached, no blocker
outstanding. Round 3's own shape — seven of eight findings RESIDUE inside
round-2 repair text — is the convergence signal the workflow skill describes,
not a reason for a fourth attack. There will not be one.

**All eight findings APPLIED, not deferred** (FULL-AUTO RULING 50). The cap
governs adversary attack rounds, not the repair that follows a verdict, and
every one of these eight arrived with its own paste-ready smallest-fix text —
so applying them verbatim is the prescription of the review that just cleared
the change, not new unreviewed authorship. Verification that each landed as
specified was a mechanical orchestrator diff, listed below.

| Finding | Applied where |
| --- | --- |
| MAJOR A | new `tasks.md` 1.2c; 1.2's parenthetical corrected; `proposal.md:90` adds `frontend/lib/api-client.test.ts` to Affected code |
| MAJOR B | `tasks.md` 1.3b — the drift-defect red is record-and-report |
| MAJOR C | `spec.md:150` new scenario *An exhausted status-less failure records nothing*; 1.2b extended |
| MAJOR D | `tasks.md` 1.3 — `requestfailed` **mutates** the already-recorded entry, never pushes a second |
| MINOR E | `tasks.md` 1.3 — `.catch(() => null)` on `req.response()` |
| MINOR F | `tasks.md` 1.2b — assert the fixed marker `automatic transport-level resend` |
| MINOR G | `tasks.md` 2.1b — `retry: false` on a mutation is compliant |
| MINOR H | `tasks.md` 1.3b — the credential re-issue perturbs the count too; pre-existing |

Final delta: **3 requirements, 11 scenarios.** `validate --strict` valid;
`openspec-reconcile.py` OK.

**MAJOR B is escalated to a standing ruling — see FULL-AUTO RULING 51.** Its
premise was re-derived by the orchestrator and is exact: `space-double-submit.spec.ts:210`
waits for `/docked/i`, `:212` clicks burn immediately, and `:213` has no
`/under way/` wait — so the sequence is literally "burn → dock → immediately
order again", which `defect-post-dock-burn-cost-drift.md:40` names verbatim as
the sequence that produces the drift. **This change's new status assertion can
therefore turn a known, out-of-scope defect into a red archive gate.** That is
the assertion working. If it fires: record against the defect file, report, and
stop. Never widen `BURN_FUEL_ALLOWANCE`; never relax the assertion.

**MAJOR A's premise also re-derived and confirmed:** `frontend/lib/api-client.test.ts:322`
asserts only `rejects.toThrow('Request timeout')` and never the absence of a
`status` property, so nothing in the suite today would catch a `408` being
attached to the abort path. 1.2c closes it at the place that would attach it.

**Verdict commit: `946a70b`** — `spec(mutation-retry): author
fix-mutation-retry-on-4xx through three adversary rounds`. This CLEAR verdict
covers the change folder exactly as committed at that hash. It is current while
this is empty:

```bash
git diff 946a70b -- openspec/changes/fix-mutation-retry-on-4xx openspec/specs/mutation-retry-policy
```

`mutation-retry-policy` is a net-new ADDED capability owned by no other change,
so the usual expiry trigger — a predecessor archiving into the specs this change
targets — cannot fire here. The realistic trigger is an edit to the change folder
itself during implementation, which is forbidden: a spec conflict found mid-build
routes back through the writer, and that would expire this verdict.

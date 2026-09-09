# Rulings — `fix-mutation-retry-on-4xx`

Orchestrator rulings for this change, made under `--full-auto`. Numbering
continues the chain's global sequence (`add-vitals-strip-rulings.md` ended at
RULING 42), because this change is a recorded **prerequisite** of that link
rather than a link of its own, and its rulings are read alongside them.

Precedence used throughout, per the `openspec-team-workflow` skill: (1) a
recorded recommendation in the rulings/handoffs/chain doc; (2) a settled
decision in the root `CLAUDE.md` / `openspec/project.md`; (3) the panel's
recommendation; (4) the most reversible option.

---

### FULL-AUTO RULING 43 — this is a resume, and the prior verdict is expired; round 2 runs before anything else

**The question.** The change folder existed, `--strict`-valid, with an adversary
report returning **BLOCKED** — and artifacts that had visibly been revised after
that report was written. Does the R1 report's BLOCKED verdict still govern?

**Ruling.** No, and neither does its BLOCKED status. A prior verdict expires the
moment the spec is edited; the artifacts had been revised and **nobody had
adversarially reviewed the revised content**. Adversary round 2 ran against the
current content, using R1 as the findings to verify closed, before implementation
or any presentation.

**Basis.** Precedence 2 — the `openspec-team-workflow` skill states it directly:
"a resumed change (Phase 0 pickup) with no adversary verdict on its CURRENT
content gets one before proceeding — prior verdicts expire when the spec is
edited." Reinforced by the task brief.

**Alternatives rejected.** (a) Treat the revisions as closing R1 and proceed to
build — rejected: it is precisely the "the panel already looked at it" exemption
the skill names as forbidden, and R2 in fact found a blocker *inside* the R1
repairs. (b) Restart the change from authoring — rejected as wasteful; the R1
repairs are sound and R2's Task-A table confirms every substantive R1 finding
closed.

**Round budget.** R1 + R2 = two of three. **One round remains.** R3 is therefore
scoped as a verification-and-residue round, not a fresh attack.

**Reversal cost.** None — this is a process ruling, not a content decision.

---

### FULL-AUTO RULING 44 — the panel is reliability alone

**The question.** Which specialist reviewers does a fast-tracked, frontend-only,
one-predicate change get?

**Ruling.** **Reliability only.** Architect, UX, security and DBA are skipped.

**Basis.** Precedence 2 — the skill's panel selection matrix. Architect: skip,
this is a single-capability change with no cross-stack seam. DBA: skip, it
touches no persistent data. Security: the matrix says *default include*, but it
also says skip when there is *provably* no surface — this change adds no
endpoint, accepts no new input, and touches no auth (the one auth-adjacent
thing, `api-client.ts`'s 401 refresh, is explicitly carved **out** of the
requirement's scope and left untouched). UX: skip, no user-facing surface
changes — the change only removes a request the player never saw. Reliability
is included because the change **is** a retry policy: its specialty is the
entire subject matter.

**Alternatives rejected.** The full five-reviewer panel — rejected as
disproportionate for a fast-track, and the skill is explicit that a fast-track
"shrinks the artifacts, never the gates". The gates (writer → validator →
adversary → SDET red → dev → tier 1 → tier 4) are all intact.

**This ruling was tested and held.** Reliability returned two in-scope MAJORs
and two real follow-ups; nothing it found needed a security, DBA, UX or
architect lens.

**Reversal cost.** One additional reviewer run, minutes, read-only.

---

### FULL-AUTO RULING 45 — the surviving automatic resend must record itself (reliability MINOR-4, ACCEPTED)

**The question.** Reliability offered, explicitly as take-it-or-leave-it, a
third requirement: when the retry policy authorizes an automatic resend, the
client records that it happened. It flagged one real cost — it makes the retry
predicate side-effecting.

**Ruling.** **Accepted.** The requirement goes in, with two scenarios and a
paired vitest assertion. It logs on the **warning** channel, and **only when
the predicate authorizes a resend**, so log count equals resend count.

**Basis.** Precedence 1 — a recorded recommendation, and an unusually direct
one. `add-vitals-strip-rulings.md` RULING 42 records this exact lesson as "the
most expensive one this link taught": four consecutive analyses reasoned from
an *absence* in a log and all four were wrong, and the doubling that misled
them was an **invisible client retry**. After this change the app has exactly
one automatic resend left, and it is the invisible kind. Recording it is the
cheapest possible inoculation against a repeat, and the codebase already sets
the precedent for the *other* invisible retry at `api-client.ts:171`, which
`console.error`s the 401 refresh.

**Alternatives rejected.** (a) Skip it, per reliability's own "costs nothing
that gates the change" — rejected: RULING 42's lesson is a recorded basis, and
precedence 1 outranks the panel's own diffidence at precedence 3. (b) A metrics
or telemetry surface instead of a console record — rejected: the frontend has
no telemetry pipeline, so this would mean building one inside a fast-track,
which is exactly the scope creep the spec-first invariant forbids. (c) Assert
it only in the e2e — rejected: reliability's point is that
`space-double-submit.spec.ts` never induces transport loss, so it can never
observe this retry.

**Cost accepted knowingly.** The predicate becomes side-effecting. This is
tolerable because React Query invokes it once per failure decision, the effect
is a log line and nothing else, and the "records nothing on a 4xx/5xx" scenario
makes over-logging a test failure rather than a silent regression.

**Reversal cost.** Delete one requirement, two scenarios, one task line and one
`console.warn` — one production file, one test file, no data, no migration.

---

### FULL-AUTO RULING 46 — the mutation `retryDelay` stays unpinned (reliability MINOR-5, NOTED NOT CHANGED)

**The question.** `query-client.ts:21` sets `retryDelay` for **queries** only;
mutations inherit React Query's default (~1 s). Combined with
`api-client.ts:141`'s 120 s abort, that means the surviving resend goes out
while the original may still be executing — the two attempts overlap for
essentially the whole original request. Reliability declined to invent a number
and asked for a ruling.

**Ruling.** **No change.** The behaviour is left exactly as it is today, and the
question is recorded here rather than answered.

**Basis.** Precedence 4 — the most reversible option, and the only one with a
recorded basis. RULING 40 authorises exactly one behaviour change ("a mutation
retry never resends a 4xx"); a retry *delay* is a second, unrelated behaviour
change with no recorded lean anywhere in the repo. The spec cares about
"exactly once", not about when. Reliability itself recommends leaving it.

**Alternatives rejected.** Pinning a mutation `retryDelay` mirroring the
queries' line — rejected as an unmandated behaviour change smuggled into a
fast-track; it would also need its own requirement and scenario to be testable,
which is a change, not a tidy-up.

**Not a hard stop.** This needs no information nobody has — it needs a decision
nobody has yet had cause to make. Recorded for whoever next has that cause.

**Reversal cost.** None; nothing changed.

---

### FULL-AUTO RULING 47 — `useRefuel`'s `{ tons }` branch is filed as a defect, not fixed here (reliability FOLLOW-UP A)

**The finding, verified by the orchestrator in the code.**
`frontend/hooks/use-market.ts:111` calls `newOperationKey()` **inside**
`mutationFn`:

```ts
return marketService.refuel(fleetId, { tons: vars.tons, operationKey: newOperationKey() })
```

React Query re-invokes `mutationFn` for every retry attempt, so on that branch
an automatic transport resend carries a **different** operation key — server
side dedupe never fires, and `docked-fleet-actions/spec.md:466-470` ("the retry
reuses the same operation key … the settlement remains a single refuel") would
be false. The hook's own comment eight lines above, at `:99-103`, asserts the
opposite: "exactly ONE operation key is minted per `.mutate()` call, never per
underlying transport-retry attempt."

**Ruling.** **Filed as a defect, not fixed in this change.**

**Basis.** Precedence 1 — RULING 40 scopes this fast-track to the retry
predicate, and precedence 2 — the spec-first invariant's "no opportunistic
edits" rule: a diff exceeding the change's stated Impact is a finding against
the developer. The branch is also **unreachable from production UI**: the only
production caller, `components/space/FleetActionsPanel.tsx:279`, mints the key
in the handler and passes `{ fleetId, request }`.

**But it is not nothing, and the defect file must say why.** This change is
what promotes the no-status resend from accident to `SHALL` — it makes
normative the very retry that would exploit this hole. That is a reason to
*record the linkage loudly*, not a reason to widen the change.

**Alternatives rejected.** (a) Fix it here — rejected as scope creep past the
proposal's stated Impact. (b) Say nothing because it is unreachable — rejected:
"unreachable today" is exactly how the five built-and-never-called derivations
in this chain's README got shipped, and a live comment asserting the opposite
of the code is a trap for the next reader.

**Reversal cost.** N/A — nothing changed. The fix, when someone takes it, is to
delete the dead branch or hoist the key out of `mutationFn`, plus a vitest that
invokes the returned `mutationFn` twice with the same variables and asserts one
key.

---

### FULL-AUTO RULING 48 — the resent command verb's `409` toast is a follow-up (reliability FOLLOW-UP B)

**The question.** `mine-extraction/spec.md:508-520` specifies that a retried
commit after a lost response gets the active-action `409`, and that callers
SHALL treat that conflict as "already committed, re-fetch the fleet's active
action," not as a failed attempt. The frontend surfaces it as an ordinary
rejection toast.

**Ruling.** **Follow-up change, not this one.**

**Basis.** Precedence 1 — RULING 40 scoped this fast-track to the retry
predicate. The behaviour is pre-existing and **unchanged** by this change: a
`409` is not resent today and is not resent after this change, so this change
neither creates nor widens it. Fixing it would pull `docked-fleet-actions` and
`system-space-view` copy requirements into a predicate change.

**Alternatives rejected.** Folding it in — rejected: it needs new requirement
text in two capabilities this change does not touch, which is a change of its
own, not a task.

**Reversal cost.** N/A — nothing changed.

---

### FULL-AUTO RULING 49 — the writer's three unrequested additions: two accepted, one corrected as a check that could not pass

**The question.** The consolidated revision pass applied all nine accepted
findings and then flagged three additions that **no reviewer had asked for**,
correctly declining to slip them in silently.

**Ruling on (a), the precedence paragraph, and (b), the third no-status
scenario: ACCEPTED, kept as written.**

Adversary R2 MAJOR 2's stated defect was, verbatim, "the spec states no
precedence" on the path where a received-but-unparseable `5xx` body produces a
status-less error — Requirement 1's trigger does not fire and Requirement 2's
fires only under one of two readings. Its own paste-ready text asserts the
observable key without saying it *wins*. A repair that leaves the exploit
("two engineers build different products and both pass every scenario")
standing has not closed the finding. Scenario (b) makes the accepted reading
the only passing implementation, at the unit-test layer, and picks up the
non-`Error` thrown value that `query-client.test.ts:69-73` proves is live in
this codebase.

**Basis.** Precedence 3 — the panel/adversary's recommendation, read for its
*principle* rather than its literal text. The skill's repair-loop guidance is
explicit that a finding recurring in new text means "the writer needs the
finding's principle, not just its instance"; the converse applies here — the
writer supplied the principle where the paste-ready instance fell short.

**Ruling on (c), task 2.1b: KEPT BUT CORRECTED.** The task itself is right —
adversary MAJOR 3 added a new `SHALL` ("no mutation call site SHALL override
it") that nothing in the change verified, and an unverified SHALL is how this
chain ships derivations nobody calls. But **its enumeration was false, and it
was false by inheritance.** The writer took "the only `retry:` overrides
outside tests are `hooks/use-account.ts:27` and `components/account-provider.tsx:74`"
from adversary R2 MAJOR 3 and wrote it into a task as an expected grep result.

Re-derived against the code, there are **five** production `retry:` options:

| Call site | Value | Hook |
| --- | --- | --- |
| `frontend/hooks/use-auth.ts:159` | `retry: 3` | `useQuery` (idToken) |
| `frontend/hooks/use-market.ts:63` | `retry: false` | `useQuery` (station) |
| `frontend/hooks/use-burn-preview.ts:61` | `retry: false` | `useQuery` |
| `frontend/hooks/use-account.ts:27` | predicate | `useQuery` |
| `frontend/components/account-provider.tsx:74` | predicate | `useQuery` |

All five are `useQuery`, so **MAJOR 3's conclusion holds and the requirement
sentence stands** — but the task as written told its runner to expect two hits
from a grep that returns five. A check that cannot pass, in a task list.

**This is `README.md`'s *Lesson six* reproduced live, inside the very run that
cites it.** An enumeration asserted by a specialist, inherited verbatim by the
next agent, never re-derived by anyone following it. It was caught only because
the orchestrator re-ran the grep instead of trusting the finding — the same
discipline the README prescribes ("a confident empirical claim from a
specialist is still a claim, and the fix it proposes can be correct even when
its reasoning is not"). Both halves apply exactly: the fix (the new SHALL) is
correct; the reasoning (the enumeration) was not.

**Correction ordered.** 2.1b is rewritten to test the actual invariant — **no
`useMutation` call site passes a `retry` option** — rather than a file list
that rots as query call sites come and go.

**Alternatives rejected.** (a) Delete 2.1b, since no reviewer asked for it —
rejected: it is the only verification of a `SHALL` this round added, and
deleting it would leave the requirement unenforced. (b) Correct the list to
five files — rejected as a fix with the same shape as the bug: the next query
call site added falsifies it again.

**Reversal cost.** One task line.

---

### FULL-AUTO RULING 50 — round 3 is CLEAR at the cap; its eight residue findings are APPLIED, not deferred, because all eight are the adversary's own prescription

**The state.** Adversary round 3 returned **CLEAR** — no blocker — with four
MAJOR and four MINOR items, seven of them RESIDUE (defects inside round-2's
repair text) and one NEW. Three rounds is the cap. Residue dominating the final
round is exactly the convergence signal the workflow skill describes.

**The question.** The cap rule says MAJOR/MINOR residue at the cap becomes a
follow-up change. Does that mean these eight ship unfixed?

**Ruling. No — all eight are applied now.** The cap governs **adversary attack
rounds**, not the repair that follows a verdict. Every one of these eight
findings arrives with the adversary's own paste-ready smallest-fix text, so
applying them verbatim is not new unreviewed authorship — it is the prescription
of the review that just cleared the change. What the cap forbids is a **fourth
attack**, and there will not be one: verification that the eight were applied as
specified is a mechanical diff by the orchestrator, not a new round.

**Basis.** Precedence 2 — the workflow skill's own repair loop ("adversary →
writer → validator") and its failure-playbook entry for residue at the cap,
read together. Deferring them is also the actively worse option on the merits:
**MAJOR B and MAJOR D each predict a specific wrong repair by the crew that
follows**, and MAJOR B's is precisely R2 MAJOR 4's exploit reappearing —
a weakened e2e assertion, in the file that exists because a weakened assertion
let a double-charge ship. Filing a follow-up change to prevent a mistake that
will be made next week, during this change's own build, is not a real option.

**Alternatives rejected.** (a) Defer all eight per a literal reading of the cap
— rejected above. (b) Apply only A and B, as the adversary suggests — rejected:
C, E, F, G and H are one or two sentences each, all in task text, and splitting
the repair pass would mean two writer passes over one file for no gain. (c) Run
a fourth adversary round over the repairs — **rejected, and this is the hard
line**: the cap is three, and the run does not get a fourth attack because the
third went well.

**Reversal cost.** Each fix is one or two sentences; MAJOR A adds one task
(1.2c) and one `proposal.md` Impact line; MAJOR C adds one scenario.

---

### FULL-AUTO RULING 51 — the strengthened status assertion may turn a known, out-of-scope defect into a red gate; that red is REPORTED, never repaired

**This is the one thing that could stop this change at its own archive gate, and
it is recorded here in advance so nobody rediscovers it under pressure.**

**The mechanism** (adversary R3 MAJOR B, re-derived by the orchestrator).
Round 2's out-of-scope note claimed the two open defects cannot be hostages to
the new status assertions, because both fail an *earlier* UI wait
(`toContainText(/under way/)`) before any status assertion runs. That is true at
every site in `space-double-submit.spec.ts` **except one**. The guard-release
command at `:211-214`:

```ts
await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/docked/i, { timeout: 600_000 })
await selectBody(page, bodyIds[1])
await page.getByTestId('burn-button').click()
await expect.poll(() => orders.length, { timeout: 20_000 }).toBe(2)
```

has **no** `/under way/` wait after the click. Its only assertion is a count
that passes on send-time recording no matter what the server answered. So a
`409` there is invisible today and the test is green. **With this change's new
status assertion it becomes red** — and a `409` at that exact spot is the
documented shape of `defect-post-dock-burn-cost-drift.md`, whose stated
suspicion is verbatim "the sequence that produces it is burn → dock →
immediately order again", which is lines 211-213.

**Ruling.** The assertion is **correct and stays**. A `409`'d command genuinely
is not a successful one, and the whole point of RULING 40's second half is to
make this class visible. If task 2.3's tier-4 rerun goes red at `:214` with
`"solved fuel cost exceeds the requested maxFuelTons cap"`, the outcome is:
**record it against `defect-post-dock-burn-cost-drift.md`, report the red, and
stop.** Do not widen `BURN_FUEL_ALLOWANCE` (RULING 41 forbids it — it would
weaken a live `system-space-view` requirement to make a test pass). Do not
relax, scope down, or delete the status assertion (that is R2 MAJOR 4's exploit
wearing a new hat).

**Basis.** Precedence 1 — RULING 41 rules the drift untouched and RULING 40
commissions the visibility. The two together fully determine this: the change's
job is to make the class visible, and visibility that only ever shows green is
not visibility.

**The honest consequence, stated plainly.** This change may make an
already-broken thing *newly visible* as a red gate. That is the assertion
working, not the change failing — but it means this change's own archive gate
can go red for a defect it is forbidden to fix. If that happens, the run stops
and reports; it does not archive and it does not repair. The next orchestrator
must know that a red at `:214` is expected-and-owned-elsewhere, not a
regression introduced here.

**Alternatives rejected.** Exempting `:214` from the status assertion so the
gate stays green — rejected outright: it manufactures exactly the blind spot
that let this defect hide for four analyses, and buys a green gate with a lie.

**Reversal cost.** N/A — this is a ruling about how to read a result, not a
change to any artifact.

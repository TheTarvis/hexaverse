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

---

### FULL-AUTO RULING 52 — no architect kickoff and no impl contract for this change

**The question.** Phase 2 step 7 is an architect kickoff producing
`<change-id>-impl-contract.md`. Does this change get one?

**Ruling. No.** Phase 2 starts directly at the SDET red phase.

**Basis.** Precedence 2 — the impl contract exists for a stated purpose, and
that purpose is absent here. Per the handoffs README it holds "wire shapes,
identifiers, sequencing — everything the spec deliberately leaves open, settled
so the SDET can write both sides against one shape." This change has **no wire
shape** (it adds no endpoint and changes no payload), **no identifiers**, and
**no sequencing** (one developer, one production file, `frontend/lib/query-client.ts`).
Nothing crosses the Next.js/Go seam; there is no "both sides" for a contract to
reconcile. The tasks.md file already sequences the work, and the spec leaves
nothing open that an architect would have to settle — three adversary rounds
were spent closing exactly those gaps.

Consistent with RULING 44, which skipped the architect at panel time for the
same reason: a single-capability change with no cross-stack seam.

**Alternatives rejected.** Running the kickoff anyway for completeness —
rejected: it would produce a document whose every section is "n/a", and an
empty contract in the handoffs directory is worse than none, because a later
reader takes its existence as evidence a seam was considered and settled.

**Only one developer is needed** — `openspec-nextjs-dev`. There is no Go work,
so `openspec-golang-dev` is not launched, and the parallelism the kickoff
normally sequences does not arise.

**Reversal cost.** N/A — a process ruling. If the developer hits a genuine
design question mid-build, that is a spec conflict and routes back through the
writer (which would expire the adversary verdict), not to an after-the-fact
contract.

---

### FULL-AUTO RULING 53 — ticking a task checkbox does not expire the adversary verdict

**The question**, raised by the SDET at red handoff and correctly not resolved
unilaterally. Tasks 1.2, 1.2b, 1.2c, 1.3 and 1.3b are complete, but the SDET
declined to tick them, because the adversary R3 verdict's own currency check is:

```bash
git diff 946a70b -- openspec/changes/fix-mutation-retry-on-4xx openspec/specs/mutation-retry-policy
```

and ticking a checkbox makes that diff non-empty. Yet `openspec archive`
requires every task checked. Read literally, the two rules cannot both be
satisfied: the change can never be archived without expiring the verdict that
permits it to be archived.

**Ruling.** A `- [ ]` → `- [x]` transition is **progress state, not content**,
and does not expire an adversary verdict. Ticking proceeds normally.

**Basis.** Precedence 2 — the expiry rule read for its purpose rather than its
letter. The workflow skill defines the re-attack scope on a stale verdict as
"**the clauses whose live targets or delta text changed**". A checkbox tick
changes no clause, no requirement, no scenario, and no task's *text*; there is
nothing for a re-attack to attack. The rule exists so that edited normative
content is never implemented under a verdict issued against different words.
That hazard is absent here, and applying the rule literally would make every
change in this repo unarchivable — which is a reductio, not a policy.

**Made verifiable rather than asserted.** The exemption is narrow and must be
checked, not trusted. Before archive, the diff against the verdict commit must
contain **nothing but checkbox transitions**:

```bash
git diff 946a70b -- openspec/changes/fix-mutation-retry-on-4xx \
  | grep '^[+-]' | grep -v '^[+-][+-]' | grep -v '^[+-]- \[[ x]\]'
```

That must print nothing. If it prints any line, the delta text or a task's
wording genuinely changed, the verdict IS expired, and the change does not
archive without an adversary pass over that diff.

**Alternatives rejected.** (a) Leave every task unticked and archive anyway —
rejected: `openspec archive` requires them checked, and an unticked completed
task is a false record of what was done. (b) Re-run the adversary after ticking
— rejected: the cap is three rounds and a checkbox is not a finding surface;
this would also recur on every change forever. (c) Tick them all at the end in
one commit to "minimise" the diff — rejected as cosmetic: the diff is the same
size either way, and ticking a task when it is done is the honest record.

**Who ticks.** The agent that completes the task ticks it, per the standing
role rules — the developer for 1.1/1.1b, the SDET for its own test tasks, the
orchestrator for the 2.x validation tasks it runs. The SDET's five are ticked
by the orchestrator now, since it declined for this reason and is finished.

**Reversal cost.** N/A — a process ruling.

---

### FULL-AUTO RULING 54 — a non-4xx, non-5xx response status (e.g. `302`) stays unspecified

**The question**, raised by the SDET: the delta decides `4xx`, `5xx`, and
status-less. It says nothing about a mutation failing with a `3xx` or `1xx`
status. The SDET asserted nothing rather than invent semantics.

**Ruling.** Correct, and it stays that way. **No requirement is added.**

**Basis.** Precedence 4 — the most reversible option — reinforced by the
spec-first invariant: inventing a rule for a case no evidence has ever produced
is speccing a fantasy. `fetch` follows redirects transparently, so a `3xx`
reaching the retry predicate as a failure is near-unreachable; no artifact, no
defect, and no captured evidence in this repo describes one. Adding a clause
would mean choosing its behaviour with no basis, which is precisely the guess
the full-auto rules forbid.

**Consequence, stated honestly.** Such a status falls through to whatever the
implemented predicate does with an unmatched status. That is unspecified
behaviour in a capability that otherwise specifies its whole domain — a real,
if tiny, gap. Recorded here so it is a known gap rather than an unknown one.

**Alternatives rejected.** Sweeping "any response status" into the no-resend
rule — rejected: it is a wider behaviour change than RULING 40 authorises, and
it would silently redefine the capability's scope in its final hour on a case
nobody has observed.

**Reversal cost.** One requirement and one scenario in a follow-up change, if a
`3xx` ever shows up in a log.

---

### FULL-AUTO RULING 55 — the tier-1 gate's two reds are pre-existing and do not block; proven, not assumed

**The question.** The full frontend suite reports `2 failed | 1610 passed
(1612)`. Both failures are in
`frontend/components/space/SpaceStage.interaction.test.tsx`
(`SpaceStage — keyboard camera`). Does this change's tier-1 gate pass?

**Ruling.** **Yes — the gate passes**, with the two reds attributed to
`defect-spacestage-keyboard-camera-timeout-flake.md` (filed this run). This
change's own tests are `40 passed (40)`.

**Basis.** Precedence 2 — RULING 42's standing lesson, which this run treats as
binding method: *every analysis that reasoned from an absence in a log was
wrong; the one action that produced truth was capturing evidence.* So the
attribution was **proven twice, not asserted**:

1. **No code path exists.** `grep` over both the test file and `SpaceStage.tsx`
   finds no reference to `query-client`, `queryClient`, `useMutation` or
   `QueryClientProvider`. This change modifies exactly one production file,
   `frontend/lib/query-client.ts`, which nothing in that test's graph reaches.
2. **It reproduces at HEAD without the change.** Run in a clean `git worktree`
   detached at `31df519`, with the original `query-client.ts` confirmed in
   place: `1 failed | 36 passed (37)`.

And the decisive detail: **which of the two keyboard tests fails is not
stable.** Across four runs it failed case 1 alone, case 2 alone, and both
together, at 10.3–16.1 s against a 10 s `testTimeout`. A deterministic
regression does not migrate between sibling tests; a boundary timeout under
varying load does.

Corroborated independently by the SDET, which observed this same file flaking
at red handoff — when no production code for this change existed at all.

**A worktree was used deliberately.** Reverting `query-client.ts` in place
would have been the obvious way to test the counterfactual, and it was
rejected: the live tree held the developer's uncommitted implementation, and
`README.md`'s *Lesson seven* records this repo losing exactly such work to
exactly that manoeuvre. `git worktree add` is the tool the README names for a
scratch proof needing a clean tree. The worktree was removed and
`git status` confirmed the live tree unchanged.

**Alternatives rejected.** (a) Call the gate red and stop the run — rejected:
the reds are demonstrably not this change's, and stopping would block a
prerequisite on another capability's flake. (b) Fix the flaky test here —
rejected: it is outside the proposal's four-file Impact, in another
capability's area, and the workflow classes an out-of-Impact diff as a finding
against the developer. (c) Raise `testTimeout` — rejected outright:
`docs/testing-tiers.md` forbids raising a budget to make a suite pass, and it
would erase the only signal anyone has about the real cause.

**Reported honestly, not rounded off.** This change's tier-1 result is *not*
"all green". It is "40/40 for this change; 2 pre-existing reds in the suite,
proven pre-existing". `add-vitals-strip`'s next gate run will meet the same two
tests and should read the defect file rather than re-derive this.

**Reversal cost.** N/A — an attribution ruling. If someone later shows a causal
link from `query-client.ts` to `SpaceStage`, this ruling is wrong and the
defect file's *Proof* section is where to attack it.

---

### FULL-AUTO RULING 56 — the developer's `3xx` decision is AFFIRMED, and it supersedes RULING 54's "falls through"

**What the developer reported** (flagged, not slipped in — correctly, since
RULING 54 had named this band unspecified). Its `shouldRetryMutation` treats
**any** carried response status as "a response was read → no automatic resend",
so a hypothetical `302` reaching the predicate is now refused. Today's code
would have resent it once.

**Ruling. Affirmed.** No spec change, no task change.

**Basis.** Precedence 2 — the delta's own Requirement 2, which authorizes the
surviving resend **only** for the status-less class. The developer's reasoning
is better than the alternative it rejected, and it is worth recording:
preserving the old fall-through would resend a status-carrying failure that is
outside the class Requirement 2 covers, and that resend would then either be
**unrecorded** — breaking Requirement 3's "the number of records equals the
number of automatic resends" — or be recorded from a non-status-less branch,
breaking task 1.1b. So the old behaviour is not merely unspecified here; it is
**inconsistent with two of the three requirements**. Refusing it is the only
implementation that satisfies all three.

**This narrows RULING 54.** That ruling said the band stays unspecified and
"falls through to whatever the implemented predicate does". It is now known
what the predicate does, and it is the right thing. The *spec* still says
nothing about `3xx` — that part of RULING 54 stands, and adding a clause on a
case nobody has ever observed remains forbidden. What changes is that the gap
is no longer a shrug: the implemented behaviour is principled, derived from the
requirements rather than from an accident of control flow, and documented here.

**Reachability, checked not assumed.** `api-client.ts` attaches a `status` only
on `!response.ok`, and `fetch` follows redirects transparently, so a `3xx`
reaching this predicate as a failure is effectively unreachable. This is a
correctness-of-shape decision, not a behaviour change anyone will observe.

**Alternatives rejected.** (a) Preserve the old fall-through — rejected on the
two-requirement conflict above. (b) Add a `3xx` requirement now to make it
explicit — rejected: the adversary round cap is spent, and a new requirement
would ship with no adversarial review at all, which is worse than a documented
gap on an unreachable case.

**Reversal cost.** One conditional in `shouldRetryMutation`.

# Link 8b `add-scan-and-sightings-surface` — adversary round 5 + orchestrator rulings

Re-verify of round 4's repairs (`link8b-adversary-r4.md`). All sixteen round-4 repairs
confirmed present. Nine new findings, every one bred INSIDE those repairs — the
round-2/3 pattern again. Verdict: **NOT CLEAR** — 5 majors, 4 minors.

## Orchestrator rulings — ALL NINE ACCEPTED, apply each paste-ready fix exactly

| # | Ruling |
| --- | --- |
| 1 | Report sources the `type=scan&status=done` read: paragraph + scenario as pasted; tasks 4.6 and 6.10 amended. |
| 2 | B1 split into running-status / settled-status halves as pasted (+ scenario). |
| 3 | Second MODIFIED block on live *A Resolving Sweep Mints ...* (the requirement at live focused-scan spec.md:192-256) — every one of its seven scenario headings verbatim, only the first sentence amended as pasted. |
| 4 | Tasks 6.1, 6.7, 5.3 re-worded as pasted. |
| 5 | Add tasks 5.12, 6.13, 6.14, 7.9 as pasted. |
| 6 | Add `alreadySettled` to the spec's fizzle enumeration and its "own statement" scenario (six reasons). |
| 7 | 10.2c's fixture names `hostId` and the clean-sweep marker explicitly unset. |
| 8 | 1.15 gains the mixed case. |
| 9 | Decision 10 lists the two extra extended requirements; B1's opening sentence gets the count-reconciling clause. |

Round 6 is a re-verify of these nine areas only. This change has now had six adversary
passes; the cap is being run past deliberately, as link 7b's was, because every round's
findings sit inside the previous round's repairs and none is new scope.

## The adversary's report, verbatim

## Gate output

```
$ openspec validate add-scan-and-sightings-surface --strict
Change 'add-scan-and-sightings-surface' is valid          (exit 0)

$ python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface
add-scan-and-sightings-surface: OK                        (exit 0)
```

`git status openspec/changes/add-scan-and-sightings-surface` was identical at start and end (design.md, proposal.md, action-dispatch, focused-scan, system-space-view, tasks.md modified; sighting-log and sighting-records untouched). **Nothing changed under me** during the review.

## Round-4 repairs verified present (not merely claimed)

| # | Repair | Verified at |
| --- | --- | --- |
| B1 | independent-failure ADDED requirement | `specs/system-space-view/spec.md:618-644`, verbatim as ruled |
| M2 | "both of that fleet's action-inbox reads" + scenario | `:234-244`, `:273-278` |
| M3 | self-scanner exclusion + rejection agreement | `specs/focused-scan/spec.md:210-223`; tasks 1.15, 3.12; proposal ADD bullet |
| M4 | `type` filter on *Inbox by Actor Query Param* + both indexes | `specs/action-dispatch/spec.md:66-73`, `:117-123`; tasks 3.8/3.8a name `(actor,status,resolvedAt desc)` and `(actor,type,status,resolvedAt desc)` — **matches the ruling exactly**; proposal Impact now says "three" indexes. *Consumer half not landed — finding 1.* |
| M5 | re-attempt paragraph + scenario | `:246-250`, `:280-288` |
| M6 | mount pinned to the `docked-fleet-actions` panel; proposal Impact bullet | `:586-588`; `proposal.md:171-176` |
| M7 | a11y ADDED requirement | `:646-664`, verbatim as ruled |
| m8 | past-tense proposal/design; 3.11 verify-only | `proposal.md:116-131`, `design.md` D18, tasks 3.11 |
| m9 | transit/sweeping exception to "no host in range" | `:21-24` + scenario `:44-49` |
| m10 | countdown on the view's projected world time | `:171-174` |
| m11 | `useSubmitGuard` named | tasks 5.10 (`:352-356`) |
| m12 | filed-vs-fizzled rule + `alreadySettled` task | `:331-335`, scenario `:362-367`; task 3.13 |
| m13 | citations (`dao.go:335-339`, `fog.go:25-46`/`:105-115` — I re-checked both against the tree, correct) + the MODIFIED on *A Focused Sweep Commits On the Sensor Channel* | `specs/focused-scan/spec.md:225-288` |
| A1/A2/A4/A6 | ghost parenthetical; 10.5 lane-transit fizzle matching impl-contract §4.2; Decision 17 asymmetry paragraph; settling-read licence | `:391`, tasks 10.5, `design.md` D17, `specs/focused-scan/spec.md:15-20` |
| A3/PW | Open Questions 10 and 11; 10.2a/b/c and the amended 10.7 | `design.md:767-790`, tasks `:527-554`, `:579-591` |

**MODIFIED blocks re-checked heading-by-heading against the live specs:** `focused-scan`'s *A Focused Sweep Commits On the Sensor Channel* reproduces all 7 live scenario headings in order; `action-dispatch`'s *Exactly-Once Resolution* reproduces all 4 and *Inbox by Actor Query Param* both. Reconcile confirms.

**Interaction spot-checks you asked for, all clean:** M3's clean-sweep rule and the digest doc id do not collide (the scanner-only case mints exactly one clean sweep at `digest(actionId)`; no path mints both a clean sweep and a target record for one action); `alreadySettled` fires at `fleet/resolver.go:145` *before* any mint and cannot fire on an action that filed records (`ResolveOne` is exactly-once), so the m12 rule holds on it; M5's re-attempt does not contradict `sighting-log`'s never-poll rule (the retried read is the interior read, its follower is the space view's *system-filtered* pile read, and the log's own trigger stays "a settle refetch completed" — the no-poll scenario's GIVEN is scoped to "no sweep running"); B1 does not contradict *The Scan Surface Remains Usable While the Canvas Is Unavailable* (canvas unavailability and inbox failure are disjoint conditions, and the canvas requirement never claims read-failure immunity); 10.2c does declare itself a test fixture ("a declared test fixture, not a route the product serves"), so `sighting-records`' only-a-resolving-sweep-mints rule is not violated.

---

# MAJOR

**1. M4's ruling half-landed: the server gained the `type` filter, but nothing requires or tasks the report to use it — the original exploit is untouched.**

The ruling was "ACCEPT option (a): optional `type` filter on *Inbox by Actor Query Param*; **the report reads `type=scan&status=done`**". The first half is in. The second half exists only in prose that binds nobody:

- `specs/system-space-view/spec.md:317-319` still says the report covers *"the one with the greatest resolved-at world time **among that fleet's settled, unacknowledged scans**"* with no source read named.
- `tasks.md:295-298` (4.6): *"Add `actionService.listSettled(actorId)` over `GET /v1/actions?actor=&status=done`"* — **no `type`**.
- `tasks.md:389-392` (6.10) names the ordering but not the read.
- Only `proposal.md:135` says `type=scan&status=done`, and the proposal implements nothing.

Exploit unchanged from round 4: an implementer follows 4.6, picks a bound of 20, and a fleet that mines twenty times after a sweep pushes its unacknowledged scan off the page. The headline report never appears, nothing errors, nothing retries, and every scenario here still passes (both ordering scenarios use two-action fixtures).

Fix — append to the first paragraph of *A Settled Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player Copy* (`specs/system-space-view/spec.md`, after line 319's "its ETA breaking a tie"):

```markdown
The report SHALL source that scan from the acting fleet's **type-filtered**
settled inbox read — `type=scan&status=done` (`action-dispatch`'s *Inbox by
Actor Query Param*) — never from the type-agnostic settled read. That read is
bounded, and a fleet's settled mines, burns, jumps, holds, and releases share
the bound with its scans: on a type-agnostic page an unacknowledged sweep is
displaced by the fleet's ordinary work and the report simply never appears,
with no error and nothing to retry.

#### Scenario: A fleet's other settled actions cannot displace its scan report
- **GIVEN** the acting fleet has one unacknowledged settled scan and more
  settled actions of other types than the inbox read's bound
- **WHEN** the report is shown
- **THEN** the settled scan is still reported, the read it folds having been
  filtered to `type=scan`
```

and amend `tasks.md` 4.6 to read `GET /v1/actions?actor=&status=done&type=scan` (`actionService.listSettled(actorId, { type })`), and 6.10 to say the report folds that type-filtered read.

---

**2. B1 says "the action-inbox read" — but M2, in the same revision, established there are two, and the two readings differ by exactly the defect B1 exists to close.**

`specs/system-space-view/spec.md:619` and `:625-629`: *"The scan-target read, **the action-inbox read**, and the system-filtered sighting-pile read…"*, then *"IF **the action-inbox read** for a fleet fails, THEN the system SHALL NOT present that fleet as having no running sweep… and SHALL NOT offer the scan commit control for that fleet while its sweep state is unknown."*

M2's repair 400 lines earlier (`:234-244`) says the opposite about the same noun: *"**both of that fleet's action-inbox reads** — the running-status read that carries the sweep's window and cancel id, and the settled-status read that carries its outcome, reason code, and acknowledged state"*.

Two readings:
- (a) "the action-inbox read" = the running-status read. Then a failed **settled** read is unspecified, and the outcome report silently does not appear — an absence presented as a fact about the world, which is the exact class this requirement's own first paragraph forbids ("each absence SHALL be attributed to its failed read").
- (b) it means either read. Then a failed settled read withholds the **commit control** even though the running read succeeded and proved no sweep is running — a lockout on a fleet that is provably free to scan.

A lazy implementer picks (a), because the sentence's consequent is about "having no running sweep" and only the running read carries that.

Fix — replace `specs/system-space-view/spec.md:619` and the paragraph at `:625-629` with:

```markdown
The scan-target read, **both of a fleet's action-inbox reads** (the
running-status read and the settled-status read), and the system-filtered
sighting-pile read are reads this view issues itself, and SHALL obey *System
Space View Route and Data Fan-In*'s independence rule: no one of them failing
SHALL disable another's surface, and each absence SHALL be attributed to its
failed read rather than presented as a fact about the world.

IF the **running-status** inbox read for a fleet fails, THEN the system SHALL
NOT present that fleet as having no running sweep: it SHALL show that the
sweep's state could not be read, offer a retry, and SHALL NOT offer the scan
commit control for that fleet while its sweep state is unknown — a commit
offered on an unread inbox is a commit the server rejects for a sweep already
running.

IF the **settled-status** inbox read for a fleet fails, THEN the system SHALL
NOT present that fleet as having nothing to report: it SHALL show that the
sweep's outcome could not be read, offer a retry, and SHALL continue to offer
the commit control whenever the running-status read shows no running sweep — a
missing outcome withdraws a report, never a verb.

#### Scenario: A failed settled read withholds the report, not the verb
- **GIVEN** the acting fleet's running-status inbox read shows no running sweep
  and its settled-status inbox read fails
- **WHEN** the scan control is shown
- **THEN** it states that the sweep's outcome could not be read and offers a
  retry, and the scan commit control is still offered
```

(keep the existing ghost-pile paragraph and both existing scenarios unchanged).

---

**3. M3's exclusion directly contradicts the live requirement that owns minting, with no MODIFIED — a stronger conflict than the one m13 was made to carve.**

Live `openspec/specs/focused-scan/spec.md:192-195`: *"The system SHALL, when a focused scan resolves, **mint one sighting record per ship masked at the target host** — including ships masked further down an attachment chain beneath it — **or one clean-sweep record when nothing is masked there**."*

The change's ADDED `specs/focused-scan/spec.md:210-217`: *"The system SHALL exclude the scanning fleet from the set of ships a resolving sweep mints records for… **If the scanner is the only ship beneath the host, the sweep SHALL mint a clean-sweep record.**"*

In the canonical docked-mining case the two disagree on both clauses: a ship *is* masked at the host (the scanner), so the live rule mints a record for it and forbids the clean sweep ("when **nothing** is masked there"), while the new rule mints no record and mints a clean sweep. Unlike m13's hostId case — which the orchestrator nonetheless ruled must be carved — these are not logically compatible. After archive `focused-scan` will contain both, and the next brownfield audit or resolver change has two live SHALLs pointing opposite ways for the exact case task 10.2a's journey exercises.

Fix — add a second MODIFIED block to `specs/focused-scan/spec.md`, reproducing `openspec/specs/focused-scan/spec.md:192-256` **verbatim** (all seven scenario headings, in order: *A resolving sweep mints sightings for the chain masked at its host*, *A resolving sweep against an empty host mints a clean-sweep record*, *A resolving sweep stamps its records at pulse-reach, not resolution time*, *A geometry failure at pulse-reach mints nothing*, *A scanning fleet that left the host's system mints nothing*, *A scanning fleet in lane transit at pulse-reach mints nothing*, *An unresolvable body host mints nothing and releases the slot*), with only the first sentence amended to:

> The system SHALL, when a focused scan resolves, mint one sighting record per ship masked at the target host — including ships masked further down an attachment chain beneath it, **but never the scanning fleet itself** (*A Sweep Never Files a Claim Against Its Own Scanner*) — or one clean-sweep record when nothing **other than the scanner** is masked there.

---

**4. Four round-4 repairs landed in the spec and not in `tasks.md`; one task now instructs the defect its repair closed.**

`tasks.md` is the implementer's worklist, and three tasks still carry the pre-repair wording:

- `tasks.md:363-365` (6.1): *"counting down from **the served world time** to the action's ETA"* — m10's repair moved the time base off the inbox's served world time precisely because that read serves no clock scale (`specs/system-space-view/spec.md:171-174` now requires "**this view's projected world time**… scale-correct projection"). An implementer following 6.1 ships the scale-1 countdown m10 closed.
- `tasks.md:377-380` (6.7): *"(b) the **action inbox for the fleet whose sweep was due**"* — singular, the exact wording M2 replaced (the finding cited this line). 6.8 only partly rescues it.
- `tasks.md:331-332` (5.3): *"Render the explicit 'no host in range' state for an empty served set"* — m9's transit/already-sweeping exception (`:21-24`) has no task.

Fixes: 6.1 → "counting down to the action's ETA against **the view's scale-correct projected world time** (the inbox supplying only the ETA and committed time); assert in test that no fleet-read field and no scale-1 assumption is used"; 6.7 → "(b) **both** of that fleet's action-inbox reads, the running-status and the settled-status one; assert both are re-issued"; 5.3 → append "…and the transit/already-sweeping variants of the empty state, which state that reason instead of 'no host in range'".

---

**5. The two ADDED requirements the round-4 repair introduced — B1 and M7 — have no implementing task at all.**

`grep -i "live region\|announce\|keyboard\|a11y\|focus indicator" tasks.md` returns **nothing**, and no task in sections 5–8 covers a failed inbox read or a failed system-filtered pile read (5.3 covers only the scan-target read; 8.9 covers the *log's* unfiltered read, a different one). So `specs/system-space-view/spec.md:618-644` (the round-4 **blocker** fix) and `:646-664` (M7) are pure spec with no work item; 10.1's blanket "add the client unit tests… covering every scenario" asks for tests of behavior no task builds, and `check.py` (10.8) runs the data-testid and test-file validators, not an a11y pass.

Fix — add:

```markdown
- [ ] 5.12 Make the scan control keyboard-operable: the target list, the commit
      control, the cancel affordance, the report's dismiss affordance, and the
      log affordance each Tab-reachable, Enter/Space-activatable, with a visible
      focus indicator (`system-space-view` — *A Settled Sweep and the Scan
      Controls Are Reachable and Announced*)
- [ ] 6.13 Announce a landed settled sweep through a polite live region, naming
      whether records were filed or the sweep returned nothing — the same
      treatment 8a-2 gives a burn arrival, a jump arrival, and a mine completion
- [ ] 6.14 Render the failed-inbox states: a failed running-status read shows
      that the sweep's state could not be read, offers a retry, and withholds
      the commit control; a failed settled-status read shows that the outcome
      could not be read, offers a retry, and leaves the commit control offered
      (*The Sweep Surface's Reads Fail Independently…*)
- [ ] 7.9 Render the ghost layer's failed-read state: a failed system-filtered
      pile read states that this system's sightings could not be read and offers
      a retry; assert an empty scene is never presented as "no sightings here"
```

---

# MINOR

**6. Task 6.11 demands copy for a sixth reason code the spec does not know about, and the spec licenses folding it away.**

`tasks.md:393-399` (6.11): *"plus 3.13's `alreadySettled` code to its own copy… and **never folded into the generic fallback**"*. But `specs/system-space-view/spec.md:323-329` enumerates exactly five fizzle reasons, and `:344-345` says *"A reason code this client does not recognize SHALL be reported as a sweep that returned nothing"* — which is precisely the fallback 6.11 forbids. Two artifacts, two builds. Fix: add `alreadySettled` to the requirement's enumeration ("…and a sweep a racing resolver had already settled") and to the "reads as its own statement" scenario, or drop 6.11's "never folded into the generic fallback" clause. The enumeration is the smaller lie to fix.

**7. 10.2c's fixture field list omits the field 8.3 asserts on.**

`tasks.md:550-554`: *"with the record's other fields set directly (position, velocity, hull count, hull types, `systemId`, `asOf`)"* — no `hostId`, no clean-sweep marker. 10.2b says the record names "a host in the open system", but the seeding helper's own enumeration is what an SDET will code to, and `tasks.md:442-451` (8.3) asserts the log's host column *"carries no placeholder, empty cell, or degraded-state styling"*. A fixture with no `hostId` fails 8.3 for a fixture reason. Fix: append "…, the swept **`hostId`** (a host in the open system, so the log row's host column renders), and the clean-sweep marker explicitly unset, so the record is target-naming".

**8. Task 1.15 pins only the sole-ship half of M3.**

`tasks.md:84-92` covers "a fleet docked at a belt **with no other ship attached beneath it**" → clean sweep. The mixed case — scanner plus another ship beneath the same host — is where "exclude the scanner" and "mint a clean sweep" could be wired the wrong way round (a clean sweep minted alongside a target record, or the scanner's record kept). The requirement text covers it; no test does. Fix: append to 1.15 — "…and a second case with one other ship beneath the same host: exactly one record is minted, naming that ship and not the scanner, and **no** clean-sweep record accompanies it."

**9. Two enumerations went stale under the repairs.**

`design.md:369-400` (Decision 10) lists four live requirements this change "extends by addition"; B1 extends a fifth (*System Space View Route and Data Fan-In*) and M7 a sixth (*A Landed Resolution Is Announced to Assistive Technology*), neither listed. And live `openspec/specs/system-space-view/spec.md:33-34` says the view renders *"from **four reads this view issues itself**"* while B1 (`:619`) now says three more are *"reads this view issues itself"* — post-archive, one capability counts its own reads two ways. Fix: add the two bullets to Decision 10, and add one clause to B1's opening sentence: "…— *System Space View Route and Data Fan-In*'s count of four names the reads that requirement enumerates; these are additional reads this capability's later requirements add, and they do not edit that enumeration."

---

**Verdict: NOT CLEAR** — 5 majors, 4 minors. Both gates (validate --strict, reconcile) pass; no blocker survives round 4, but M4's accepted repair only half-landed (finding 1), M2's own repair collided with B1's wording (finding 2), M3's exclusion needs the carve m13 established the precedent for (finding 3), and the two ADDED requirements from the round-4 rulings reached no task (findings 4–5).
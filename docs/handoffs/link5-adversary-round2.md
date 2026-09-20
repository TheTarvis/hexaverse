# Link 5 — adversary round 5 (repair-loop round 2) findings + orchestrator rulings

Change: `replace-observation-with-sightings`
Round-2 verdict: **BLOCKED** — 1 blocker, 2 majors, 2 minors.

All 14 round-1 findings verified FIXED. Archive-mechanical checks verified CLEAN:
13 MODIFIED blocks reproduce every live scenario heading verbatim, 91 task citations
all resolve, `--strict` passes. **Do not re-litigate any of that.**

Every new finding lives in the enumeration text introduced by the round-1 MAJOR 10
and BLOCKER 1 repairs. Findings are the adversary's words VERBATIM; each is followed
by a binding **ORCHESTRATOR RULING**.

---

## BLOCKER A — `board-view`/`galaxy-view` require the server to distinguish "fleet not owned by the requester", which `fleet-movement` in the same change forbids it from distinguishing

**Location.** `specs/board-view/spec.md:13-16` and `specs/galaxy-view/spec.md:56-60`:

> "The server's distinguishable jump-rejection reasons include, at minimum: not attached to the named gate; already in lane transit; **fleet not owned by the requester**; lane not incident to the fleet's current system; and the destination's lane horizon could not be materialized (retryable)."

versus `specs/fleet-movement/spec.md:173-182`, *Fleet Command Endpoints Are Restricted to the Owning Corporation*:

> "SHALL respond `404 Not Found` — **not `403`** — when they do not match… **a foreign fleet is indistinguishable from a nonexistent one**, and a `403` would itself confirm the id exists (design.md Decision 21)."

**Exploit.** An implementer honouring `board-view` makes the ownership rejection distinguishable — the obvious form being `AbortWithStatusJSON(404, gin.H{"error": "fleet: requester does not own this fleet"})`, matching every other reason-bearing branch in `fleet/handler.go`'s `respond`. That body is exactly the existence confirmation `fleet-movement` was written to deny, re-opening the fleet-id enumeration oracle that requirement closes for all six endpoints (and which `focused-scan` mirrors with "A Foreign Fleet's Id Is Rejected Identically To An Unresolvable One"). An implementer honouring `fleet-movement` leaves the 404 bare (as `respond` does today) and `board-view`'s enumeration is simply false on archive. Two deltas of the same change, mutually unsatisfiable.

**Smallest fix** — in **both** *Jump Commit* requirements, replace the ownership item and add the carve-out:

```
The server's distinguishable jump-rejection reasons include, at minimum: not
attached to the named gate; already in lane transit; lane not incident to the
fleet's current system; and the destination's lane horizon could not be
materialized (retryable). A jump against a fleet the requester's corporation
does not own is deliberately NOT among them: it is a bare `404` indistinguishable
from a nonexistent fleet (`fleet-movement`: *Fleet Command Endpoints Are
Restricted to the Owning Corporation*), and therefore falls to the generic
fallback copy rather than to a mapped reason.
```

and strike "fleet not owned by the requester" from `tasks.md` 4.18's list (`:520-521`), replacing it with a sentence that the ownership 404 must map to the generic fallback, not to ownership-specific copy.

### ORCHESTRATOR RULING — BLOCKER A: ACCEPT the fix as written, in both requirements and in task 4.18

Upheld, and the fault is the round-1 MAJOR 10 ruling's: it added "fleet not owned by
the requester" to the enumeration without checking it against Decision 21's
deliberate indistinguishability. The standing tie-break applies and points the same
way — **security wins on controls** — so the `fleet-movement` 404 rule governs and the
enumeration yields. Apply the paste-ready text to BOTH *Jump Commit* requirements and
amend 4.18 exactly as described.

Additionally: add a scenario to BOTH *Jump Commit* requirements pinning the carve-out
so it is testable rather than merely asserted in prose —

```
#### Scenario: A jump against a fleet the requester does not own toasts generically

- **WHEN** the jump command is invoked against a fleet the requester's
  corporation does not own
- **THEN** the generic fallback toast is shown, with no copy that would
  distinguish the fleet from one that does not exist
```

---

## MAJOR B — the enumeration names "lane not incident to the fleet's current system" as distinguishable, while the proposal explicitly defers making it so

**Location.** Same two enumerations, versus `proposal.md:357-362`:

> "**Also noted, not fixed**: `galaxy.ErrLaneNotFound` has no case in `fleet/handler.go`'s `respond`, so a `laneId` not incident to the fleet's current system returns `500`, not a `400`/`404` the client could distinguish… but does not fix it; it is a candidate for a later link."

Confirmed in code as evidence of intent: `backend/fleet/handler.go:261-263` — `case err != nil:` → `c.AbortWithStatus(http.StatusInternalServerError)`, **bodyless**. Nothing in §4 or §10 adds the case.

**Exploit.** The change archives a `board-view`/`galaxy-view` requirement asserting a server behaviour the same change declines to build — the "wished-for behaviour specced as current truth" class. Downstream, task 4.18 instructs the implementer to add a `jump-copy.ts` entry for a reason string that can never arrive (the client sees an `apiClient`-generated message for a bodyless 500), so the entry is dead code that its own unit test — written against a fabricated string — will happily prove "works".

**Smallest fix (preferred, one switch case).** Add to §10:

```
- [ ] 10.15 Add `case errors.Is(err, galaxy.ErrLaneNotFound):` to
      `fleet/handler.go`'s `respond`, responding `404` with a reason body,
      so a `laneId` not incident to the fleet's current system is a
      distinguishable rejection rather than the bodyless `500` it is today
      (`proposal.md`'s "Also noted, not fixed" paragraph is deleted with it —
      `board-view`/`galaxy-view`'s *Jump Commit* enumeration now requires
      this reason to be distinguishable).
      (board-view: *Jump Commit* — A failed jump commit toasts the reason)
      (galaxy-view: *Jump Commit* — A failed jump commit toasts the reason)
```

Alternative if it must stay deferred: strike "lane not incident to the fleet's current system" from both enumerations and from 4.18, keeping the proposal's deferral paragraph honest.

### ORCHESTRATOR RULING — MAJOR B: TAKE THE PREFERRED FIX. Add task 10.15; do not defer.

It is one `case` in an existing switch. A client-supplied `laneId` that is not
incident to the fleet's system is a **client** error returning a bodyless `500` — a
real defect, not merely an unmapped reason, and leaving it would also leave a dead
`jump-copy.ts` entry that its own test would falsely validate. Add 10.15 verbatim as
written, and DELETE the proposal's "Also noted, not fixed" paragraph in the same
edit. Add a matching SDET task (10.16) asserting the `404` + reason body at the HTTP
surface, since 10.15 is a behaviour change with no test today.

---

## MAJOR C — the new destination-not-ready rejection is mapped to a `5xx`, and both *Jump Commit* requirements name `5xx` as the exemplar of "no mapped reason"; nothing tests that the retryable copy ever appears

**Location.** `tasks.md:1209-1214` (10.13): "map it in `fleet/handler.go`'s `respond` to **`503`** (retryable)". Versus `specs/board-view/spec.md:48-52` and `specs/galaxy-view/spec.md:87-91`:

> "#### Scenario: A failure with no distinguishable reason still toasts safely
> - **WHEN** the jump command fails with a response carrying no mapped rejection reason (**for example a `5xx`**)
> - **THEN** a generic, non-technical error toast is shown"

**Exploit.** The client half of BLOCKER 1's fix is unfalsifiable and the spec licenses swallowing it. A lazy implementer writes `if (status >= 500) return GENERIC_JUMP_FAILURE` — every scenario in both *Jump Commit* requirements passes, `jump-copy.test.ts` passes, and the player who hit a genuinely retryable refusal is told "The jump could not be completed" with no hint that retrying works. Reinforcing this: `respond`'s only existing 5xx branch is bodyless `AbortWithStatus`, so an implementer copying the adjacent line ships a bodyless `503` and the reason genuinely never reaches the client — while satisfying 10.13's literal text ("map it… to `503`"), which never requires a reason body. No scenario anywhere in the change asserts that this reason produces its own copy.

**Smallest fix.** Amend the generic scenario's example and add the positive scenario, in **both** requirements:

```
#### Scenario: A destination-not-ready rejection toasts as retryable, not generically
- **WHEN** the jump command fails with the server's
  destination-lane-horizon-could-not-be-materialized reason
- **THEN** the error toast surfaces that reason's own mapped copy, telling the
  player the jump can be retried — not the generic fallback used for a
  response carrying no distinguishable reason

#### Scenario: A failure with no distinguishable reason still toasts safely
- **WHEN** the jump command fails with a response carrying no mapped
  rejection reason (for example a **bodyless** `5xx`)
```

And in `fleet-movement:296-299`, make the wire form binding rather than implied:

```
…THEN the jump order SHALL be rejected with a distinguishable, retryable
reason **carried in the response body in the same form as this endpoint's
other distinguishable rejection reasons**, and no fleet SHALL enter lane
transit toward that destination.
```

Add "with a reason body, never a bodyless status" to `tasks.md` 10.13, and to 10.12's assertions.

### ORCHESTRATOR RULING — MAJOR C: ACCEPT every part as written

Apply all four edits (the new positive scenario in both requirements, the "bodyless"
qualifier on both generic scenarios, the binding wire-form clause in
`fleet-movement`, and the reason-body requirement in tasks 10.13 and 10.12). `503`
stays the status — retryable is the right semantic — but it MUST carry a reason body.

---

## MINOR D — the new structural scenario's "no gate-aware branch" is absolute where task 4.12 mandates a gate-aware presentation lookup

**Location.** `specs/board-view/spec.md:94-99`: "**THEN** no lane-gate-specific selection kind and **no gate-aware command branch** exists". Versus `tasks.md:389-399`, which *requires* gate-aware code: "both need a **gate-aware lookup** against `board.laneGates` (or an equivalent discriminant carried on the folded selection) so a selected gate still resolves for these two consumers", and the requirement's own final sentence preserving the facts panel and the selected mark.

**Exploit.** Task 4.17 says "asserting no `'gate'`-shaped selection kind and **no gate-aware branch** remains" without the command-path scoping. Written literally, that test fails the `FactsPanel`/`selectedGateId` lookup 4.12 obliges — so the implementer either weakens the test until it proves nothing, or deletes the presentation code the requirement protects. The scenario is reconcilable ("command branch"), but the ambiguity is exactly where a repair loop stalls.

**Smallest fix** — append to the scenario's THEN:

```
  — a gate-aware lookup used only to present a selected gate's facts and its
  drawn mark is not such a branch
```

and scope 4.17's assertion the same way ("no gate-aware branch **in the burn-command path**").

### ORCHESTRATOR RULING — MINOR D: ACCEPT both halves as written

This is live right now: task 4.12 has already shipped the gate-aware presentation
lookup, and an SDET is concurrently writing 4.17's test. Make both edits.

---

## MINOR E — design.md Decision 28 still asserts the self-healing property the same decision retracts

**Location.** `design.md:842-848`: "At the horizon call's new home, log-and-continue is also right… **It self-heals, because `EnsureLaneHorizon` is idempotent and the next read of that fleet or that system retries.**"

That is the exact claim BLOCKER 1 killed and `design.md:755-773` now disproves in the same document (a sweep-settled arrival reads back with `Jump == nil` and the branch never runs again). It is harmless only because commit now fails closed — but it is the sentence an implementer skimming for "is log-and-continue at 10.3 safe?" will land on, and it gives the wrong reason.

**Smallest fix** — replace the final sentence with: *"It is safe to log-and-continue here only because site 1 fails closed: nothing reached transit without a materialized horizon, so this call has nothing to heal — it does not self-heal a commit-time failure, and no such failure exists to heal."*

### ORCHESTRATOR RULING — MINOR E: ACCEPT as written

---

## Scope discipline for this pass

This is repair-loop **round 3 of 3**. Confine edits to the five findings above.
Do NOT restructure anything else, do NOT renumber existing tasks, and do NOT
touch the 64 checked tasks. New task numbers append as 10.15 and 10.16.

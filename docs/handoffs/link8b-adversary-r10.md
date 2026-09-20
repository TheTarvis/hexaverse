# Link 8b `add-scan-and-sightings-surface` — adversary round 10 (third mid-build spot-check) + rulings

**Why.** The Playwright journey's next finding: after an ACCEPTED commit the client's two
unordered invalidations let the held-channel empty scan-target set land before the
running-status read, so the control showed "No host is in range" for seconds. The writer
added a committed-and-awaiting-window clause; this round attacked only that text.
Verdict: **NOT CLEAR** — 1 blocker, 4 majors.

## Orchestrator rulings — ALL FIVE ACCEPTED, applied verbatim

| # | Ruling |
| --- | --- |
| P1 | The window ends at the first running-status read that reflects the commit (running → countdown; nothing running → the settled report); a failed read ends it into B1's failed-running-read state. Paragraph + scenario as pasted. |
| P2 | The target-list requirement's empty-set exception gains "having just had a scan commit accepted whose running-status read has not yet reflected it". |
| P3 | The pending presentation persists across remount/re-selection while the window is open; a running-status read in flight never presents "no running sweep" on a pre-commit page. |
| P4 | The guard-release scenario is scoped to a rejected/failed commit, with an AND pinning that after an accepted commit the pending state, not the guard, withholds the control. |
| P5 | No cancel affordance in the window (the action id arrives only with the read); never a fleet-level cancel in its place. Never-list + scenario AND. |

Tenth adversary pass on the change. Every mid-build clause since round 8 has needed one
re-verify to close the exits it left open — the lesson is that a clause naming a window
must name every way the window ends.

## The adversary's report, verbatim

## Gates

- `openspec validate add-scan-and-sightings-surface --strict` → `Change 'add-scan-and-sightings-surface' is valid`
- `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface` → `OK`

All spec citations are `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/specs/system-space-view/spec.md`; tasks are `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/tasks.md`. F1–F6 and A1–A4 not re-litigated.

---

### P1 — BLOCKER. The pending window has no exit but success, so a failed *or* an already-settled running read hangs it forever

`spec.md:184-189`:

> Between an accepted commit and the running-status inbox read that carries the new sweep, the control SHALL present the sweep as committed and awaiting its window … The countdown appears when that read lands.

The interval's only terminating event is a read *that carries the new sweep*. Two reachable ways that event never occurs:

1. **The read fails.** B1 (`spec.md:751-756`) mandates for exactly this read: "it SHALL show that the sweep's state could not be read, offer a retry, and SHALL NOT offer the scan commit control". A failed read never "lands", so the new SHALL is still in force over the same instant and mandates a different presentation. Nothing states which governs. Note the failed state is *not* excluded by the paragraph's own never-list (it is not the target list, not the empty-set copy, not a commit control), so both readings are literally satisfiable — and the lazy one is "keep showing committed-and-awaiting", which is the one that requires no new code.
2. **The read lands showing nothing running**, because the sweep already settled. `openspec/specs/action-dispatch/spec.md:154-158` resolves due actions on read, and the post-commit scan-target refetch is licensed to settle this very fleet's due actions (`specs/focused-scan/spec.md:16-22`: "The read MAY settle the named fleet's own due actions"). Under a scaled world clock a short `ScanDuration` ETA can pass inside one round trip. That read does not "carry the new sweep", so by the letter the pending state persists — concurrently with the settled-outcome report the settled-status read now renders.

Exploit: the control sits at "Sweep committed — awaiting its window" indefinitely, with no retry, no countdown, no cancel, no error, and no commit control; the player's only recovery is a reload. That implementation satisfies every scenario in this change, including the new one at `spec.md:199-207`, whose GIVEN only covers the read-not-yet-landed case.

Smallest fix — replace the sentence "The countdown appears when that read lands." at `spec.md:188-189` with:

```
The window ends at the first running-status read that **reflects the commit**:
one carrying the sweep as running, which the countdown then replaces with no
user action; or one showing no running sweep at all, which means the sweep
settled before the read landed and SHALL hand the control to its settled-sweep
report rather than holding the pending presentation. IF that read fails, THEN
the pending presentation SHALL end and the failed-running-read state of *The
Sweep Surface's Reads Fail Independently, Like Every Other Read This View
Issues* SHALL be shown instead — the sweep's state could not be read, with a
retry and no commit control — never an unbounded "awaiting its window", which
would leave a committed sweep unreportable and unretriable for as long as the
read kept failing.
```

and a scenario after `spec.md:207`:

```
#### Scenario: A failed running-status read ends the pending state rather than hanging it
- **GIVEN** a scan commit has been accepted and the running-status inbox read
  that would carry it fails
- **WHEN** the control is shown
- **THEN** it states that the sweep's state could not be read and offers a
  retry, offers no commit control, and does not remain in the committed-and-
  awaiting-window presentation
```

---

### P2 — MAJOR. The target-list requirement still mandates the empty-set copy in this exact window; the A2 carve-out does not reach it

`spec.md:21-24`:

> IF the served target set is empty, THEN the control SHALL state that no host is in range, except while the acting fleet's own served state explains the empty set — in lane transit, or already sweeping …

Both exceptions are keyed on **served** state. In the pending window nothing served says "already sweeping": the commit's own response is the fleet DTO, which carries no `activeScanId` and no sweep window (`/Users/travis/Projects/hexaverse/backend/fleet/handler.go:610-644`; `spec.md:265-266` says as much), and the inbox read is by definition not back yet. A2's carve-out (`spec.md:28-33`) covers only "WHILE a triggered refetch … is in flight" — but the premise of the new scenario is that the post-commit refetch **has already returned** the held-channel empty set (`spec.md:201-202`). So at that instant `spec.md:21-24` is an unqualified SHALL for "no host is in range" and `spec.md:186-187` is an unqualified "never the empty-set copy", in two different requirements, with no precedence stated. Same shape the orchestrator accepted as A2, one instant later in the sequence.

Smallest fix — `spec.md:24`, extend the exception clause:

```
in lane transit, already sweeping, or having just had a scan commit accepted
whose running-status inbox read has not yet reflected it (*A Focused Scan
Commits Against a Listed Target and Reports Its Rejection in Player Copy*),
```

---

### P3 — MAJOR. The pending presentation is anchored to a client-local transition with no stated durability, so a remount inside the window restores the bug

`spec.md:184`: "Between an accepted commit and the running-status inbox read…". The trigger is the commit event, which exists only in the control's own render state. The spec never says whether that state must survive a remount or a re-selection inside the window. Re-selection is safe by accident (F2 forces a scan-target refetch, so A2's in-flight rule takes over) — but a remount that is not a re-selection (collapsing and reopening the fleet panel, the canvas falling back to its unavailable state per `spec.md:704-718`) re-renders against a fresh-enough cached empty target page and a running-status page read *before* the commit, and nothing in the spec covers "running-status read in flight over a pre-commit page". Result: "No host is in range." — the originating defect, reproducible by a panel collapse/expand inside the window, with every scenario in the change still green.

Smallest fix — append to the paragraph at `spec.md:189`:

```
This presentation is a property of the window, not of one mount: it SHALL
persist across a remount or a re-selection of the control while the window is
open. WHILE the running-status inbox read is in flight, the control SHALL NOT
present that fleet as having no running sweep on the authority of a page read
before the commit.
```

---

### P4 — MAJOR. The guard-release scenario asserts a fresh commit is submittable right after an accepted commit — the state the new paragraph forbids

`spec.md:228-229`: "disabled from the moment of commit **until that request settles or fails**", and `spec.md:253-256`:

> #### Scenario: The guard releases when the request settles or fails
> - **WHEN** a scan commit settles or fails and the player then initiates a new sweep
> - **THEN** the guard has been released and the new attempt submits normally

"Settles" is not scoped to a rejection. On the accepted path the request settles at the start of the pending window, the guard releases, and this scenario says the next attempt "submits normally" — while `spec.md:186` says no commit control exists to attempt from. The question the writer needed to answer explicitly (the control is withheld by the *pending state*, not by the guard, in that gap) is answered only implicitly by the never-list, and this scenario states the opposite for a reader who takes "settles" to include acceptance. An implementer can ship a re-enabled control in the gap and cite it.

Smallest fix — `spec.md:253-256`, keep the heading, scope the GIVEN, and pin the accepted case:

```
#### Scenario: The guard releases when the request settles or fails
- **GIVEN** a scan commit that was rejected or failed
- **WHEN** it settles and the player then initiates a new sweep
- **THEN** the guard has been released and the new attempt submits normally
- **AND** after an *accepted* commit the guard's release does not re-offer the
  commit control, which the committed-and-awaiting-window state withholds until
  the running-status read lands and the running sweep withholds thereafter
```

---

### P5 — MAJOR (small). Cancel in the pending window is unspecified, and the only cancel the client *could* wire there is the forbidden one

`spec.md:268-271` obliges a cancel "WHILE the acting fleet has a running focused scan" — which is true of the world during the pending window — "that cancels that action **by its own id**". The client has no id: the commit response is the fleet DTO with no `activeScanId` (`backend/fleet/handler.go:610-644`), and the inbox read has not landed. The new paragraph's never-list omits cancel entirely. So the spec simultaneously obliges a cancel and makes it unsatisfiable, and the only endpoint reachable without an action id is the fleet-level cancel the same requirement forbids (it "releases only the movement channel and would leave the sweep running" — a player pressing it would silently cancel their burn).

Smallest fix — `spec.md:186`, extend the never-list, and add an AND to the new scenario at `spec.md:205`:

```
— never the target list, never the empty-set copy, never a fresh commit
control, and no cancel affordance, whose action id arrives only with that read —
```

```
- **AND** no cancel affordance is offered while the window is open, and no
  fleet-level cancel request is issued in its place
```

---

### Checked, no finding

- **Task 5.13 vs the paragraph** (`tasks.md:391-398`): faithful — same three prohibitions, the "whatever the post-commit scan-target refetch has already returned" qualifier, and the no-user-action countdown handoff. It inherits P1's and P5's gaps rather than adding its own; whatever the paragraph gains (failure exit, early-settle exit, cancel withholding, remount durability) must be mirrored into it, since 5.13 is the only task in the window.
- The new scenario at `spec.md:199-207` is falsifiable and carries the no-user-action AND its siblings carry — it is not an F5-shaped scenario.
- The withholding of the commit control in the window is genuinely stated (paragraph never-list + scenario "offers no commit control"), so the question's premise about withholding-by-pending-state is met; only its interaction with the guard (P4) is broken.

**Verdict: NOT CLEAR** for this clause — P1 lets an accepted commit hang unreportable and unretriable forever, and P2 leaves the requirement that started this whole thread still mandating "no host is in range" one instant after the window the clause was written to cover.
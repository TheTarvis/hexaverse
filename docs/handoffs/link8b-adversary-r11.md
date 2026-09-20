# Link 8b `add-scan-and-sightings-surface` — adversary round 11 (currency check on the resume) + rulings

**Why.** The `--chain` orchestrator's first instruction is to confirm the adversary verdict is
current before building further. Round 10's verdict was **NOT CLEAR** with five findings
(P1 blocker, P2–P5 majors); the orchestrator accepted all five and the writer applied the
prescribed text — and that applied text had never been attacked. Rounds 8, 9 and 10 each
found that the previous round's window clause left an exit unnamed, so the applied text was
exactly the kind that has needed one re-verify every time.

Scope was **the round-10 lineage only**: the five applied repairs, task 5.13's mirror of
them, and any contradiction the applied text creates with the clauses it now sits next to.
F1–F6, A1–A4 and rounds 4–9's findings were explicitly out of scope and not re-litigated.

Verdict: **NOT CLEAR (BLOCKED)** — 1 blocker, 1 major. Both are inside the round-10 text.

The round-11 confirmation of the pattern: round 10 closed the hang and opened a new exit
(the early settle), and the new exit is the one that leads nowhere. **A clause naming a
window must name every way the window ends — and every state it ends into must be one
something refreshes.**

## Orchestrator rulings — BOTH ACCEPTED, applied verbatim

| # | Ruling |
| --- | --- |
| F11-1 | ACCEPT. The early-settle exit must issue the fleet's post-settle follower reads (settled-status inbox, sighting pile, fresh scan-target read), because no ETA-scheduled trigger for them can exist on that path — the client never read a running sweep to schedule one. Paragraph + scenario + task 5.13 mirror as pasted below. |
| F11-2 | ACCEPT. The empty-set exception's condition must exclude a failed read, which otherwise satisfies "has not yet reflected it" while the failure exit mandates the opposite presentation at the same instant. Three-word fix as pasted below. |

Also ruled (orchestrator, not the adversary): **task 5.13 is unchecked.** Its early-settle
branch is not implemented — vitest `P1b` in
`frontend/components/space/SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` is red
against it — and it now gains F11-1's follower-read obligation.

## The adversary's report, verbatim

### F11-1 — BLOCKER. P1's early-settle exit hands the control to a report that nothing requires to be read

`specs/system-space-view/spec.md:192-197`:

> The window ends at the first running-status read that **reflects the commit**: … or one showing no running sweep at all, which means the sweep settled before the read landed and SHALL hand the control to its settled-sweep report rather than holding the pending presentation.

P1 correctly killed the hang, but the exit it substitutes names a destination whose data
source no clause refreshes on this path. The settled-status inbox read, the sighting-pile
read, and the fresh scan-target read have exactly **one** trigger in this change —
`spec.md:359-366`, whose entire premise is "After the interior refetch that follows **a
sweep's ETA** has completed". In the early-settle case the client never read a running
sweep, so it never learned an ETA, so no follower reads were ever scheduled. `spec.md:43`
invalidates only the scan-target read "on a successful scan commit"; nothing invalidates
the settled-status read or the pile at commit.

Concrete consequence at that instant: the window ends; the settled-status read still holds
its pre-commit page (nothing to report), so the settled-sweep report the clause hands off
to is empty; the target list still holds the held-channel empty page that the
commit-triggered refetch returned (the premise of the sibling scenario at
`spec.md:220-222`); and the empty-set exception at `spec.md:23-26` has just lapsed because
the read *did* reflect the commit. The control therefore states **"No host is in range"** —
the exact defect this whole clause exists to forbid — and the sweep's outcome (records
filed, log affordance) is never reported until some unrelated trigger happens to refetch the
settled read. `A Settled Sweep Reports Its Outcome…` (`spec.md:454-457`) is a standing SHALL
that this path silently fails.

This is not hypothetical: it is the shipped path. `frontend/hooks/use-scan.ts:48-49`
invalidates only `actions.running` and `fleets.scanTargets` on commit; `useSettledScan`
(`use-scan.ts:74-82`) has no invalidation, no poll, and the app-default staleTime; and
`frontend/components/space/SystemSpaceView.tsx:321-324` ends the window on *any* fresh
running read (`dataUpdatedAt`/`errorUpdatedAt` past the marker), including the empty one —
its own comment says "carrying nothing (handing off to the settled report, P1b)". The
hand-off lands nowhere.

Every scenario stays green: `spec.md:219-229` covers only the read-not-yet-landed case and
`spec.md:231-237` only the failed read. There is no scenario for the early settle at all.

**Smallest fix** — append to the paragraph after "…rather than holding the pending
presentation." at `spec.md:197`:

```
When the window ends that way, the system SHALL issue that fleet's
post-settle follower reads — its settled-status inbox read, the open
system's sighting-pile read, and a fresh scan-target read (*A Running Sweep
Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the
Pile*) — because no ETA-scheduled trigger for them can exist on this path:
the client never read a running sweep to schedule one. Without them the
sweep's outcome is never reported, its records never drawn, and the empty
set served while the sensor channel was held is re-offered as "no host is
in range" one instant after the window that forbade it.
```

and a scenario after `spec.md:237`:

```
#### Scenario: A sweep that settles inside the commit round trip still reports
- **GIVEN** a scan commit has been accepted and the first running-status read
  to land shows no running sweep, the sweep having settled before it landed
- **WHEN** the pending presentation ends
- **THEN** that fleet's settled-status inbox read, the open system's
  sighting-pile read, and a fresh scan-target read are each issued
- **AND** the settled sweep's outcome is reported, and the control does not
  state that no host is in range on the empty set served while the sensor
  channel was held
- **AND** none of this requires navigation, reload, or manual refresh
```

and mirror into task 5.13 at `tasks.md:399-401`, replacing "hands off to the settled-sweep
report instead of holding the pending presentation" with:

```
hands off to the settled-sweep report AND issues that fleet's post-settle
follower reads (settled-status inbox, sighting pile, fresh scan-target
read) — no ETA-scheduled trigger for them ever existed on that path, so
without them the outcome goes unreported and the held-channel empty set is
re-offered as "no host is in range"
```

---

### F11-2 — MAJOR. P2's carve-out and P1's failure exit both fire on a failed running-status read

`spec.md:21-26` (P2's applied text):

> IF the served target set is empty, THEN the control SHALL state that no host is in range, except while … having just had a scan commit accepted **whose running-status inbox read has not yet reflected it** … in which case the control SHALL state that instead, rather than rendering an empty list.

A read that **failed** has not reflected the commit, so the exception's condition literally
holds after a failure — and the exception's consequent is an unqualified SHALL to state the
committed-and-awaiting explanation. `spec.md:197-203` mandates the opposite at the same
instant ("the pending presentation SHALL end and the failed-running-read state … SHALL be
shown instead"). Two requirements, one instant, no precedence. The scenario at
`spec.md:231-237` pins the right behavior, so this is a text-level contradiction rather than
a lazy-implementer exploit — but it is the clause that will archive into `openspec/specs/`,
and the fix is three words.

**Smallest fix** — `spec.md:24`, replace "whose running-status inbox read has not yet
reflected it" with:

```
whose running-status inbox read has neither reflected it nor failed
```

---

### Checked, no finding

- **P3** (`spec.md:205-209`) is prose-only with no scenario, but it is an explicit SHALL, it
  is mirrored verbatim in task 5.13 (`tasks.md:403-407`), and the implementation already
  lifts the marker out of the component into the query cache for exactly this reason
  (`SystemSpaceView.tsx:316-324`). Not a finding.
- **P4** (`spec.md:284-289`): the GIVEN scoping plus the accepted-commit AND removes the
  "submits normally" reading; the AND's tail ("the running sweep withholds thereafter") is
  silent on the early-settle case, but that silence is subsumed by F11-1's fix, not a
  separate finding.
- **P5** (`spec.md:189-191`, `spec.md:228-229`): the never-list plus the
  no-fleet-level-cancel AND makes the forbidden wiring untakeable; the residual tension with
  `spec.md:301-303`'s standing cancel obligation is unshippable (there is no id to cancel
  with and the scenario forbids the substitute).
- All five round-10 repairs are present verbatim (P1 `spec.md:192-203`, P2 `spec.md:21-26`,
  P3 `spec.md:205-209`, P4 `spec.md:284-289`, P5 `spec.md:189-191` + `spec.md:228-229`), and
  task 5.13 (`tasks.md:391-409`) mirrors all four gains — failure exit, early-settle exit,
  cancel withholding, remount durability — so round 10's "must be mirrored" note is
  discharged. Its only gap is the one F11-1 prescribes.

---

## Post-repair defect found during the F11-1 build (orchestrator ruling, 2026-09-03)

Implementing F11-1 required the control to withhold the empty-set copy at the instant the
early-settle handoff supersedes the target list. The developer's first implementation
(`frontend/components/space/ScanControl.tsx:239-252`) gated on `targets.length === 0 &&
settledScan.data` — **any** unacknowledged settled scan, not the one that just ended a
committed-and-awaiting window. The developer identified the reachable consequence itself and
routed it back rather than leaving it:

1. A sweep settles by the ordinary ETA path; the report shows; the player never dismisses it.
2. Later the fleet's scan-target read genuinely returns empty, unrelated to that report.
3. `settledScan.data` is still truthy, so the control renders nothing — the player never sees
   "No host is in range to sweep.", indefinitely, until they dismiss an unrelated old report.

**Ruling: this is a defect in this change's own implementation, not a spec gap, and not
follow-up material.** The spec's empty-set requirement carries a closed exception list (lane
transit, already sweeping, commit accepted but not yet reflected); a blanket report-presence
gate is outside it and suppresses a fact the spec mandates. No spec text changes. The gate is
to be scoped to the early-settle handoff itself — a transient signal from the
pending→not-pending transition effect, mirroring how `committedPending` is scoped — never to
report presence in general.

Order of work, per the change's own TDD contract: the SDET writes the failing test for the
reachable case first (old unacknowledged report + genuinely empty list ⇒ the copy still
appears), then the developer scopes the gate to make it pass. The developer does not edit the
test; the SDET does not edit production code.

Worth recording as the round-11 counterpart to the lesson rounds 8-10 taught: **a repair that
withholds something must name exactly which instant it withholds it for.** Round 10's clause
named every way its window ends; this gate named none of them, and withheld forever.

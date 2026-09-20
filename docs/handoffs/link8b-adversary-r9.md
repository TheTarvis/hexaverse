# Link 8b `add-scan-and-sightings-surface` — adversary round 9 (second mid-build spot-check) + rulings

**Why.** After the round-8 refetch clause landed, the Playwright journey found the next gap: a
docked fleet's sweep settles and its scan control still shows the empty set cached at commit
(Decision 15's held-channel set) — sweep settlement was not a refetch trigger. The writer
added it; this round attacked only that text. Verdict: **NOT CLEAR** — 3 majors, 1 minor.

## Orchestrator rulings — ALL FOUR ACCEPTED, applied verbatim

| # | Ruling |
| --- | --- |
| A1 | The ordering scenario names the scan-target read among the followers and forbids a pre-settlement read (it would re-cache the held-channel empty set). |
| A2 | While a triggered scan-target refetch is in flight the control presents the list as being re-read, never "no host is in range" from the superseded set — paragraph + scenario. |
| A3 | The post-settle scan-target follower read is scoped to the acting fleet (the list has one consumer; re-selection refetches the other). Spec text aligned to tasks 4.9/6.7. |
| A4 | The new scenario's WHEN is "the sweep's ETA passes and the view's scheduled refetches run" with the no-user-action AND. |

Ninth adversary pass on the change; the fourth since resuming that was bred by a repair.

## The adversary's report, verbatim

Read the skill, the change's `system-space-view` delta, the prior rulings in `/Users/travis/Projects/hexaverse/docs/plans/continous_space/handoffs/link8b-adversary-r8.md`, design Decision 15, `tasks.md` 4.9/6.7, and the baseline `openspec/specs/system-space-view/spec.md` refetch rules. Both gates pass:

- `openspec validate add-scan-and-sightings-surface --strict` → `Change 'add-scan-and-sightings-surface' is valid`
- `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface` → `OK`

All spec citations below are `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/specs/system-space-view/spec.md`; task citations `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/tasks.md`.

---

### A1 — MAJOR. The ordering scenario was not extended with the new read, and a concurrently-issued scan-target read re-caches the held-channel empty set

`spec.md:293-298` puts the new read inside the "and only then" group correctly. But its only ordering scenario, `spec.md:332-337`, still enumerates two of three followers:

> **THEN** the sighting-pile refetch and the scan's action-inbox refetch are issued only after that interior refetch has completed, never concurrently with it

Exploit: an implementation that fires the scan-target refetch concurrently with the settling interior read passes every scenario in this change. Unlike the pile and inbox reads — which merely return nothing/stale and are corrected by the next landing — a pre-settlement scan-target read is *definitionally empty*: the sensor channel is still claimed, and `focused-scan`'s *Eligible Scan Targets Are Served Per Fleet, To Their Owner Alone* only says the read **MAY** settle due actions (`specs/focused-scan/spec.md:15`), so the server is entitled to answer the Decision 15 empty set. That empty answer is then cached as the *fresh* one, and the control states "no host is in range" for a docked fleet — the reported journey bug, restored, until the baseline poll happens to correct it. The reason this ordering is load-bearing for this read specifically is exactly the reason `spec.md:318-322` gives for the other two, and it is stronger here.

Smallest fix — `spec.md:332-337`, keep the heading, extend the THEN:

```
#### Scenario: The pile and the inbox are refetched only after the settling read completes
- **GIVEN** a running sweep whose ETA has just passed
- **WHEN** the scheduled interior refetch is issued
- **THEN** the sighting-pile refetch, the scan's action-inbox refetches, and the
  scan-target refetch are each issued only after that interior refetch has
  completed, never concurrently with it
- **AND** no scan-target read is issued before that settlement, since a read
  answered while the sensor channel is still claimed serves the empty set by
  construction and would be cached as the fresh one
```

---

### A2 — MAJOR. The m9 rule still mandates the wrong copy at the settled-but-not-yet-refetched instant, contradicting the new scenario

`spec.md:21-24`:

> IF the served target set is empty, THEN the control SHALL state that no host is in range, except while the acting fleet's own served state explains the empty set — in lane transit, or already sweeping — in which case the control SHALL state that instead

The two exception branches are keyed on **served** state. The post-settle follower reads are issued as a batch with no order pinned among them, so the running-status inbox read can land — flipping "already sweeping" to false — while the scan-target refetch is still in flight over the cached held-channel empty set. In that window the prose's SHALL mandates "no host is in range" for a fleet with hosts in range, in the same frame as the settled-sweep report. The new scenario forbids exactly that (`spec.md:104-106`: "and does not state that no host is in range"), so the requirement now contradicts its own scenario at the one instant this clause exists to fix; an implementer can ship the flash citing `spec.md:21-24`. (The reverse ordering — scan-target lands first, inbox still says "running" — is benign: the control withholds the commit control, which is what it does under an unread inbox anyway per `spec.md:712-717`. That half of the question is clean. Nothing in the baseline covers this either: the loading rule at `openspec/specs/system-space-view/spec.md:76` is the interior read's first read, and *A Failed or Stale Preview Is Never Presented as a Current Quote* is the burn quote.)

Smallest fix — insert after `spec.md:26`:

```
WHILE a triggered refetch of the scan-target read is in flight, the control
SHALL present the list as being re-read rather than stating that no host is in
range on the authority of the superseded set. The set served while the sensor
channel was held is empty by construction, and the instant the post-settle
running-status inbox read lands ahead of the scan-target read is precisely when
that empty set would otherwise be reported as a fact about the world.
```

and a scenario after `spec.md:106`:

```
#### Scenario: An empty set awaiting its triggered refetch is not reported as no host in range
- **GIVEN** the acting fleet's sweep has settled and the post-settle
  running-status inbox read has landed showing no running sweep, while the
  triggered scan-target refetch is still in flight
- **WHEN** the control is shown
- **THEN** it presents the target list as being re-read, and does not state that
  no host is in range
```

---

### A3 — MAJOR. Spec says the *settling* fleet's scan-target read; both tasks say the *acting* fleet's

`spec.md:295-298`: "**both of that fleet's action-inbox reads** … **and that fleet's scan-target read**" — the antecedent throughout that paragraph is the fleet whose ETA scheduled the refetch, which `spec.md:286-291` and the scenario at `spec.md:370-375` deliberately allow to be a **non-acting** fleet.

`tasks.md:407-412` (6.7): "(c) **the acting fleet's scan-target read**". `tasks.md:318-320` (4.9): "the settlement of **the acting fleet's** own sweep". And the trigger clause itself, `spec.md:33`, scopes to the acting fleet ("the settlement of that fleet's own sweep", where "that fleet" is the requirement's acting fleet).

Exploit: the SDET writing 6.7's "assert … the scan-target read is re-issued" must pick a query key. Built to the tasks, a non-acting fleet's settlement re-issues nothing and violates `spec.md:298` as written; built to the spec, the test asserts a read for a fleet whose query no consumer has mounted. One repair round burned either way. The tasks' scoping is the correct one — the scan-target read has exactly one consumer (the acting fleet's control), and re-selecting the other fleet is itself a refetch trigger under the F2 ruling (`spec.md:108-112`), so nothing is lost.

Smallest fix — `spec.md:298`, replace `state** — and **that fleet's scan-target read**.` with:

```
state** — and, when that fleet is the acting fleet, **its scan-target read**:
the target list has exactly one consumer, and a non-acting fleet's list is
refetched when it is selected (*Changing the acting fleet refetches the list*)
rather than while nothing reads it.
```

---

### A4 — MINOR. The new scenario borrows its mechanism in the WHEN and omits the no-user-action guard its siblings carry

`spec.md:103`: "**WHEN** the sweep settles and the post-settle follower reads run". This is *not* the F5 defect shape — the THEN asserts the new obligation (a fresh scan-target read among the followers) and fails an implementation that omits it, so it is falsifiable. But it presupposes the follower-read mechanism, and unlike its two nearest siblings (`spec.md:91`, `spec.md:354`, `spec.md:362`, `spec.md:368`) it never asserts that no user action was involved — which is the exact property the originating Playwright journey observed failing.

Smallest fix — `spec.md:100-106`:

```
#### Scenario: A settled sweep refetches the target list
- **GIVEN** the acting fleet's sweep was committed, so its cached scan-target
  set is the empty set served while the sensor channel was held
- **WHEN** the sweep's ETA passes and the view's scheduled refetches run
- **THEN** a fresh scan-target read is issued and the control offers the hosts
  now in range, never the held-channel empty set, and does not state that no
  host is in range
- **AND** none of this requires navigation, reload, or manual refresh
```

---

### Checked, no finding

- **tasks.md 6.7's "all four fire"** matches the requirement's follower list exactly: sighting pile + running-status inbox + settled-status inbox + scan-target = four followers behind the interior read (`git diff` shows the deliberate "all three" → "all four" update). No drift.
- **tasks.md 4.9's settlement trigger** ("issued with the post-settle follower reads") is consistent with the requirement's parenthetical at `spec.md:33-37`; no re-litigation of F1–F6 — F1's failed-refetch paragraph (`spec.md:50-55`), F3's baseline-poll ride, F4's widened verb list, and F6's fresh-read-on-cancel THEN are all present and unaltered by this edit.

**Verdict: NOT CLEAR** for this clause — A1 lets a concurrently-issued read re-cache the held-channel empty set, A2 still specifies the wrong copy at the settle instant, and A3 leaves the implementer and the SDET pointed at different fleets.
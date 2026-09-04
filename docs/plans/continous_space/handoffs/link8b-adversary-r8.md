# Link 8b `add-scan-and-sightings-surface` — adversary round 8 (mid-build spot-check) + rulings

**Why.** Phase 2 was under way when the Playwright journey found the client reading
`scan-targets` once at mount and never again, so a fleet that later docked displayed a
stale empty list. The Go side reproduced the served attached host four ways through the
real router; the client's trace showed exactly one round-trip. A spec gap: nothing tied
the scan-target read to the fleet's kinematic state. The writer added a refetch clause;
this round attacked ONLY that clause. Verdict: **NOT CLEAR** — 2 blockers, 4 majors,
every one paste-ready, F1 and F2 each letting the journey bug survive.

## Orchestrator rulings — ALL SIX ACCEPTED, applied verbatim

| # | Ruling |
| --- | --- |
| F1 | Failed refetch drops the stale list: paragraph + scenario as pasted. |
| F2 | Re-selection refetches rather than serving cache: task 4.9 sentence + strengthened scenario THEN as pasted. |
| F3 | The clause rides every fleet-read refetch rule incl. SSE, reconnect and baseline poll, as pasted. |
| F4 | Enumeration widened to cut drive, stop, hold, release, as pasted (cut drive retires the only scheduled trigger). |
| F5 | Arrival scenario no longer assumes its trigger; 6.15 asserts a network-level second read; a new 10.2d Playwright leg opens the control mid-burn and asserts the docked host appears with no user action. |
| F6 | The cancel scenario's THEN demands a fresh read, as pasted. |

Implementation consequence: the developer implements the widened trigger set and the
failed-refetch state; the SDET revises the arrival vitest to observe a real second read
and adds the mid-burn Playwright leg. Eighth adversary pass on the change.

## The adversary's report, verbatim

## Findings — the refetch clause only

All citations are `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/specs/system-space-view/spec.md` unless noted.

---

### F1 — BLOCKER. A *failed* refetch is unspecified, so the exact reported bug survives the fix

`spec.md:24-26` — "IF the scan-target read fails, THEN the control SHALL show a retriable error and offer no targets" — was written for a first read. `spec.md:28-36` now adds refetches on top of an already-populated cache and says nothing about what a failed refetch does to the list already on screen.

Exploit: the journey's fleet mounts mid-burn, gets an empty set, docks. The arrival-triggered refetch is issued and 500s. React Query's default is to keep `data` and set `isError` alongside it, so the control still holds the empty page and still renders `spec.md:21-22`'s "no host is in range" — a fact-about-the-world claim sourced from a read the client itself has decided is stale. The player sees the identical stale-empty screen the Playwright journey found, and every scenario in the requirement passes. This is precisely the class *The Sweep Surface's Reads Fail Independently* (`spec.md:658`, "each absence SHALL be attributed to its failed read rather than presented as a fact about the world") exists to forbid, but B1 never names the refetch case and its scenarios (`spec.md:686-702`) cover the inbox and pile reads, not a stale-then-failed target read.

Smallest fix — append to the paragraph at `spec.md:36`:

```
IF a refetch of the scan-target read fails, THEN the control SHALL present the
failed-read state of the rule above — a retriable error, offering no targets —
and SHALL NOT continue to display the previously served list, whose fleet state
the trigger has already declared stale. An empty list retained across a failed
refetch would state "no host is in range" on the authority of a read the client
has itself invalidated.
```

and a scenario:

```
#### Scenario: A failed refetch drops the stale list rather than restating it
- **GIVEN** the scan-target read returned an empty set and the acting fleet's
  burn has since landed
- **WHEN** the triggered refetch fails
- **THEN** the control shows the retriable error and offers no targets, and does
  not state that no host is in range
```

---

### F2 — BLOCKER. Task 4.9 instructs the implementer *not* to implement one of the clause's five triggers

`spec.md:28-32`: "The scan-target read **SHALL be refetched** … and when the acting fleet selection changes".

`tasks.md:317-319`: "The query is already keyed by `fleetId`, so a change of the acting fleet selection **refetches it for free**; state that explicitly rather than leaving it implicit".

That is false, and the task launders it into the spec. A key change serves whatever is cached under the new key; it refetches only when nothing is cached or the entry is past `staleTime`. A→B→A selection toggle re-serves A's page captured before A's burn landed — the mount-time defect, reproduced by a click. And scenario *Changing the acting fleet refetches the list* (`spec.md:73-76`) cannot catch it: its title says "refetches" but its THEN only asserts "the control lists that fleet's served targets, never the previous fleet's", which a cached page for that fleet satisfies exactly.

Smallest fix — tasks.md 4.9, replace the final sentence with: "and to a change of the acting fleet selection: the query is keyed by `fleetId`, but a cached entry for a previously selected fleet SHALL be refetched on re-selection rather than served from cache." And strengthen the scenario THEN:

```
- **THEN** a scan-target read is issued for the newly selected fleet, and the
  control lists that read's targets, never the previous fleet's and never a page
  cached for this fleet under an earlier selection
```

---

### F3 — MAJOR. "The same mechanism … applies to the fleet read" does not decide the question it was written to decide

`spec.md:31-33`: "on the same self-scheduled and realtime refetch mechanism *Realtime Refetch Rules While the Space View Is Open* applies to the fleet read".

That requirement (`/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:913-926`) is four rules, not one mechanism: (1) mine-ETA timer, (2) burn/jump-arrival timer, (3) SSE completion + reconnect, (4) "SHALL otherwise poll both reads at a constant baseline interval" — and (4) is scoped by name to "the open space view's interior and own-fleets reads", which the scan-target read is not. Two readings: *the scan-target read joins all four rules*, or *the five enumerated triggers are the whole obligation and this phrase only names the timer/subscription plumbing they ride*. The colon-enumeration at `spec.md:29-31` pushes a lazy implementer to the second.

Under the second reading there is **no cadence at all** on this read. A fleet parked at a point with nothing in range: no burn lands, no attachment changes, no sweep is committed, no selection changes — and a planet orbits into range. The control says "no host is in range" for the rest of the session. Same defect, different cause.

This also answers the SSE-vs-ETA half of the question: the clause's trigger is "**every** landed resolution", which is path-agnostic and correct — but `tasks.md:315-316` narrows it to "hooked to the same refetch the view already issues for the fleet read on a landed resolution", i.e. the rule-(2) timer. A resolution landed instead by the SSE completion event or by the baseline poll (a scheduled refetch that failed, a resolution that settled off a different read's opportunistic fold) refetches the fleet read and not the target list.

Smallest fix — replace `spec.md:31-33` with:

```
— riding every refetch rule *Realtime Refetch Rules While the Space View Is
Open* applies to the fleet read, including its live-subscription refetch, its
reconnect resync, and its constant baseline poll, so that a landed resolution
observed by any of those paths refetches this read too, and so that a fleet
whose surroundings change with no discrete event of its own does not hold one
list for the session —
```

---

### F4 — MAJOR. The clause's own general rule is wider than its enumeration, and cut drive falls in the gap

`spec.md:28-29`: "whenever the acting fleet's **served kinematic state changes**:" followed by a closed five-item list. Station-keeping hold, station-keeping release, cut drive, and stop-in-place below the speed floor each change the fleet's served kinematic state (park mode flip, burn→drift, `attachedTo` cleared) and none is listed. One engineer implements the general rule, the other the list.

Cut drive is the one with teeth. `/Users/travis/Projects/hexaverse/openspec/specs/fleet-movement/spec.md:291-305`: it "replace[s] the stored burn with a drift … and SHALL cancel the running movement action". So the cut **retires the only scheduled trigger the fleet had** — that burn's arrival will never land — and produces no landed resolution, no attachment change (`attachedTo` was already cleared at burn commit), no scan event, no selection change. A player who cuts drive and coasts holds the pre-burn target list indefinitely. Hold/release are milder (position is continuous across the flip) but the fleet stops orbiting, so the list diverges from the moment of the hold with no trigger to correct it.

Smallest fix — `spec.md:29-31`, extend the enumeration:

```
on every landed resolution of that fleet's own burn or jump, on every accepted
instant fleet verb that rewrites its stored kinematic state — cut drive, stop in
place, a station-keeping hold, and a station-keeping release — on a change of its
attachment, on a successful scan commit or cancel, and when the acting fleet
selection changes
```

(Cut drive warrants a sentence of its own rationale: it cancels the movement action, so the arrival trigger it would otherwise have fired is retired with it.)

---

### F5 — MAJOR. The arrival scenario assumes its own trigger, and no test in the change observes the real invalidation path

Three compounding pieces:

- `spec.md:69` — "**WHEN** the fleet's burn lands **and the view's refetch runs**". The clause under test *is* "the view's refetch runs"; putting it in the WHEN makes the scenario unfalsifiable. A manual refresh button satisfies it. Sibling scenarios in this same file are written correctly (`spec.md:311`, `spec.md:319`: "with no navigation, reload, or manual refresh") — this one omits that assertion.
- `tasks.md:430-435` (6.15) sits in section 6, the component-test section, and says only "Test that the scan-target read is refetched". A component test with a mocked `useScanTargets` asserting a second call satisfies it without ever exercising the invalidation wiring 4.9 builds — and wiring is exactly what broke.
- `tasks.md:564+` (10.2a) is the only stack-level scan journey and it "dock[s] the fleet at the home station **before opening the scan control**". The reported defect requires the control to be open across the arrival. As written, the sole Playwright leg is arranged to avoid the failure mode rather than pin it.

Smallest fix — scenario:

```
#### Scenario: A landed arrival refetches the target list
- **GIVEN** the scan control is open with the scan-target read having returned an
  empty set while the acting fleet was under way with nothing in range
- **WHEN** the fleet's burn lands
- **THEN** the scan-target read is re-issued and the control offers the hosts now
  in range, including the host the fleet attached to
- **AND** none of this requires navigation, reload, or manual refresh
```

and a tasks amendment: 6.15 should state that the test drives the real query client and asserts a second network-level read, not a second hook call; 10.2a (or a new 10.2d) should open the scan control **mid-burn**, observe the empty list, and assert the docked host appears without any user action.

---

### F6 — MAJOR. Post-cancel, the cached list is guaranteed empty, and the existing scenario accepts it

No contradiction with Decision 15 — to answer that half directly: refetch-on-commit returns the empty set Decision 15 mandates, the commit control is withheld anyway (`spec.md:203-204`), and `spec.md:22-24`'s "already sweeping" branch states the reason. That interaction is clean.

The hazard is the other side of it. Because Decision 15 makes the set fetched while a sweep runs *definitionally empty*, the cache entry standing at cancel time is empty. `spec.md:226-228` — "**THEN** the countdown clears and the served target list is offered again" — is satisfied by re-showing that empty page, which then renders "no host is in range" for a fleet that has hosts in range. The new clause fixes this in prose ("on a successful scan commit or cancel", `spec.md:30-31`) but no scenario pins freshness, so the requirement still ships a green test for the broken behaviour.

Smallest fix — amend `spec.md:228`:

```
- **THEN** the countdown clears and a fresh scan-target read is issued, whose
  targets the control offers — never the empty set served while the sweep held
  the sensor channel
```

---

**Verdict: NOT CLEAR** — F1 and F2 each permit the defect this clause was added to close.
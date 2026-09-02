# Design — `add-scan-and-sightings-surface`

## Context

Link 5 (`replace-observation-with-sightings`) shipped the focused scan complete
on the server: the verb, the sensor channel, the round-trip pricing, the
pulse-reach re-check, the fizzle reason codes, the immutable pile, and the
paginated read. It shipped **no client**. The deferral was recorded and
justified at the time — a scan button whose results cannot be seen is half a
feature — and then the client half became the chain's fifth *built and never
called* derivation, alongside `fleet.GraphSource`,
`galaxy.EnsureLaneHorizon`, `system.StationContinuousOrbit`, and
`disclosure.ScanMints`. `frontend/hooks/use-actions.ts`'s `useRunningScan`
still sits there with zero consumers, selecting `type === 'scan' && status ===
'running'` for a surface nobody wrote.

`build-production-space-view` (8a-2) archives immediately before this change
and creates the two capabilities this one extends: `system-space-view` and
`docked-fleet-actions`, replacing the retired `board-view`. This change adds
to `system-space-view`; nothing here belongs in `docked-fleet-actions`, because
a sweep requires no attachment — a fleet can scan from anywhere in its system,
and a docked fleet that scans breaks its own masking, which is the point of the
verb.

Three wire gaps stood between the shipped API and a usable surface. Each is
decided below against the code, not against the docs.

## Goals / Non-Goals

**Goals**

- Ship the scan command surface and the sightings display **in one change**, per
  the orchestrator's binding ruling. Neither half may be deferred, and no
  follow-up may carry either.
- Give `useRunningScan`, the served `reasonCode`, and the action inbox's
  `acknowledge` endpoint their first production consumers.
- Close the wire gaps with the minimum surface that has a **named consumer** for
  every field added.
- Unblock link 9 (`delete-the-lattice`), which is blocked on this change as well
  as on 8a.

**Non-Goals**

- Widening the sighting record. `sighting-records` freezes position and velocity,
  not orbital elements; this change does not add elements, a track rung, or an
  expiry.
- Any correlation between a sighting and a live contact (see Decision 2).
- A sighting marketplace, sale, or transfer. The pile is readable and inert here.
- Notifying a player of a settled sweep outside the open space view.
- Any migration or compatibility path. Per the project's ground rules, prod is
  unused and dev data is disposable; the document-id change below is a
  replacement, not a migration.

## Decisions

### Decision 1 — The record's wire `id` is its document id, and the document id stops naming the target

**Gap:** `sightings.Sighting` has no `Id` field at all, so two records minted by
one sweep against one host — two ships masked at the same body — are
indistinguishable on the wire. Every other served field can legitimately
coincide.

**What the code actually does:** `sightings.MintWrites` writes to
`corporations/{cid}/sightings/{actionId}_{targetId}` (or `{actionId}_clean`).
The target id is in the document id. And `dao.go`'s `encodeCursor` returns
`"{asOf}|{documentId}"` — **served in plaintext as `nextCursor`**. So the
shipped wire already publishes the sighted target's fleet id to any client that
pages the pile, which is exactly what `TargetId`'s `json:"-"` exists to
withhold. This is a live disclosure defect, not a hypothetical one; it is
unexercised today only because no client pages the pile.

**Decision.** Change the document-id derivation to an opaque, deterministic
identifier over `(actionId, targetId)` — a fixed-length digest, no float
arithmetic, so it needs no fixture family and no cross-target determinism
enrolment — and serve that identifier as the record's `id`. One change fixes
both halves: the record becomes addressable, and the cursor stops leaking
because there is no longer a target id anywhere in it.

**Why this and not a second identifier.** The alternative was to keep the
document id and serve a separate digest as `id`. That leaves the cursor leaking,
gives the record two identities that must be kept in step, and makes the fix
depend on remembering the cursor as a second surface. Fixing the identifier at
its source removes the class.

**What the id discloses.** It is per-record and per-sweep. Because the digest is
over the action id as well as the target, two sweeps against the same target
produce unrelated identifiers, so the id grants **no linkage**: not sighting to
sighting, and not sighting to contact. That is a property, not an accident, and
the spec pins it with a scenario.

### Decision 2 — There is no correlation key between a sighting and a live contact, and the intel spike's hide-ghost behaviour is dropped

**Gap:** `TargetId` is `json:"-"` by design, and `disclosure.Contact` — the
shape behind `system-interior`'s `contacts` array — carries **no id field at
all**. So `/spike/intel`'s `showGhost = sighting !== null && (!live || god)`,
which hides a ghost while its target is live-disclosed, has nothing to match on
in production. The spike gets away with it because it has exactly one enemy and
one boolean; production has many contacts and many records.

**Decision.** Do not introduce a correlation key. Render ghosts and live
contacts independently, in distinct visual registers, and forbid client-side
inference of identity between them (`system-space-view`'s *A Ghost Is Never
Suppressed By, Merged With, or Linked To a Live Contact*).

**Why.** A key that lets a client say "this ghost is that contact" is, by
construction, a stable per-target pseudonym. What it would disclose is exactly
the rung this model withholds:

- **It links a target across time.** Every sighting of one fleet, from every
  sweep, becomes one thread — and a live contact seen on two consecutive reads
  becomes a *track*. Link 8's OQ-8 ruling is that every sighting is a Glimpse and
  the Track rung is not implementable as shipped; a pseudonym implements the
  track through the back door, without widening the record.
- **It is as good as the fleet id for tracking purposes.** The only thing a raw
  fleet id buys over a stable pseudonym is dereferenceability against other
  endpoints — and every one of those already rejects a foreign fleet id
  identically to a nonexistent one. So the pseudonym costs nearly the whole
  privacy property while buying one presentation nicety.
- **It would need per-corporation salting or it links across corporations too** —
  two players comparing notes could confirm they had seen the same fleet, which
  is a trade the intel economy has not been designed for.

What it would have bought: suppressing a ghost when its target is already
visible live. That is worth a design conversation and is recorded as an open
question below, not taken here by a spec writer.

**Consequence, stated plainly:** a player may see a ghost of a fleet and a live
contact of that same fleet at once, and cannot be told they are the same. That
is consistent with *attribution is inferential* and with anonymous identity
gating; it is not a defect to be fixed later by a client-side heuristic.

### Decision 3 — The sweep window and its cancel come from the action inbox, not from a new fleet DTO field

**Gap:** `Fleet.Scan` (a `ScanWindow` with `HostId`, `DepartMs`, `ArriveMs`,
`Range`) exists on the model and in Firestore, but `fleetDTO` in
`backend/fleet/handler.go` does not carry it, so no fleet read serves a sweep
window.

**Decision.** Read the running sweep from `GET /v1/actions?actor=<fleetId>&
status=running` and add no field to `fleetDTO`.

**Why the inbox and not a DTO field.** The choice is not close once the cancel
affordance is counted:

1. `focused-scan`'s *Cancelling a Sweep Releases the Slot…* makes
   `POST /v1/actions/:actionId/cancel` the **only** cancel path for a sweep, and
   explicitly bars the fleet-level cancel from touching the sensor channel. So
   the control needs the **action id**, which only the inbox carries. A DTO field
   would give the window and still force the inbox read.
2. The inbox already carries everything the window does. `focused-scan` pins the
   depart time to the commit world time and the arrive time to the action's ETA,
   so `committedAt` and `eta` on the action **are** the window, by requirement,
   not by coincidence.
3. The inbox is also where the settled sweep's `reasonCode` and `outcome` live,
   which the outcome report needs.
4. Adding `scan` to `fleetDTO` would be a second source of one truth, and — since
   the inbox is needed regardless — a served field with no consumer, which is
   this chain's signature defect.

### Decision 4 — Scan targets are a dedicated fleet-scoped read, not a field on the interior read

Link 8's OQ-6 ruling allows either. A fleet-scoped endpoint is correct because
eligibility is relative to **one scanning fleet's live position**: range and
occlusion are computed from that fleet, and a corporation can have several
fleets in one system, so a field on the system-scoped interior read would either
be ambiguous about which fleet it answered for or would have to serve an
N-fleets × M-bodies matrix. The interior read is also the shared,
every-corporation read; per-fleet sensor eligibility is owner-only and does not
belong on it.

The predicates stay server-side, per the ruling — the client never mirrors a
`disclosure` predicate. The spec pins that with a scenario: a body present in the
interior read but absent from the served target set is not offered.

**Ineligible hosts are absent, with no reason field.** Serving "too far" or
"the star is in the way" per body would be more legible, but nothing in the
rulings decides it and inventing the shape would add a field with a speculative
consumer. Recorded as an open question.

**The list and the commit can disagree**, because bodies move between the two
reads. That is ordinary. The spec follows `goods-sale`/`docked-fleet-actions`'
established shape: the server is authoritative at commit, the rejection maps to
player copy, and the offer refreshes in-flow.

### Decision 5 — `sighting-records`' minting rule is sharpened rather than left contradicting the code

`sighting-records` currently says: *WHEN a corporation reads its sighting pile
**or a system's interior** THEN no new sighting record is created as a side
effect of that read.* But `system/handler.go` calls
`actions.ResolveDue(ctx, systemID)` on the interior read, a scan action's
`Scope` **is** its system id, and the fleet reads settle only movement-channel
dues (`fleet.Get` checks `State.Burn` and `Jump`, never `Scan`). So the interior
read is in fact the only player-reachable surface that resolves a due sweep, and
the live scenario is already false against shipped code.

This change is the first client to depend on that mechanism, so it is the right
place to state it correctly rather than build on a scenario the implementation
contradicts. The MODIFIED block keeps the rule — no read mints of its own
accord, no passive proximity mints, no burn resolution mints — and adds the
distinction that makes it true: a read may *settle* a due sweep, and the records
that appear are the sweep's own effect, stamped at the sweep's pulse-reach and
attributed to the sweep's action.

The alternative — leaving it and phrasing the client requirement evasively —
was rejected: it hides a known contradiction behind wording, and the next
reader would have to rediscover it.

### Decision 6 — The pile is never polled

A sighting is minted **only** by the reading corporation's own resolving sweep.
No other player's activity and no passage of time can add a record to a
corporation's pile. So the log reads on mount, after the settle refetch that
follows its own sweep's ETA, and on explicit refresh — and a timer poll would
be pure cost. This also means no new cadence constant is invented; the settle
refetch reuses the existing named ETA cushion (`ETA_CUSHION_MS`) that
`use-board-realtime.ts` already applies to a running mine.

### Decision 7 — Refetch ordering: settle first, then read the pile

The interior refetch is what resolves the due sweep; the pile read resolves
nothing. Issued concurrently, the pile read can return before the records exist
and the player sees an empty result for a sweep that worked. The spec therefore
requires the pile refetch to be issued only after the interior refetch has
**completed** — an ordering constraint, and a testable one.

### Decision 8 — A clean-sweep record draws no ghost

A clean-sweep record carries no target and no position; its `Position` is the
zero value. `system-space-view`'s *A Non-Star Position at the Origin Is Omitted
From the Scene* already requires a non-star zero position to be omitted rather
than drawn on the star, so drawing a clean-sweep mark at its stored position is
already forbidden. Drawing it at the *host* instead would be a new invention. It
appears in the log, which is where a claim of "nothing was masked here at time
T" is legible anyway.

### Decision 9 — The log is its own capability; the ghosts are not

`sighting-log` is corporation-wide and system-agnostic — its rows span every
system the corporation has ever swept — so it is not a property of one system's
view. The ghost marks are scene geometry in one system and belong to
`system-space-view`. Splitting them this way keeps each capability
single-purpose; the two are joined by exactly one shared key, the record's
served `id`.

### Decision 10 — Everything against `system-space-view` is ADDED, never MODIFIED

`system-space-view` does not exist in `openspec/specs/` until
`build-production-space-view` archives, and this change archives after it. A
MODIFIED block against a capability with no live spec cannot be validated,
cannot be reconciled by `.claude/scripts/openspec-reconcile.py`, and would be
refused. Two of 8a-2's requirements are therefore **extended by addition**
rather than edited:

- *Renderer Unavailability Is an Explicit State* enumerates the verbs that stay
  invokable "as of this change" (mine, sell, refuel, hold, release, cancel-mine,
  cut drive, stop, jump). This change adds *The Scan Surface Remains Usable While
  the Canvas Is Unavailable* rather than editing that list. The enumeration is
  self-dated, so it does not become false — but note that 8a-2's own text is
  where the "today: scan" defect the rulings flagged was already repaired, and
  this change is what finally makes a scan control exist to be listed.
- *Realtime Refetch Rules While the Space View Is Open* enumerates three refetch
  triggers. This change adds *A Running Sweep Self-Schedules the Refetch That
  Settles It, Then Reads the Pile* as a fourth, stated as its own requirement
  because it also carries the settle-then-pile ordering, which is not a refetch
  rule at all.

A future change that wants one merged requirement can MODIFY freely once both
are live.

### Decision 11 — A settled sweep is reported once, and acknowledging it is what stops the report

The action spine already has the mechanism: `AcknowledgedAt` powers the
done-but-unacknowledged inbox, and `POST /v1/actions/:actionId/acknowledge`
exists with no client consumer. Without it, the settled-sweep report would
either reappear on every refetch forever or be dismissed into component state
that resets on remount. Using acknowledge gives that endpoint its first
consumer and makes the dismissal survive a refetch.

## Risks / Trade-offs

- **The fizzle is the common case for a naive player.** Five reason codes exist
  (`outOfRange`, `occluded`, `leftSystem`, `laneTransit`, `hostUnresolved`) and
  three of them fire when the player did something reasonable — the scanner
  drifted, the host orbited behind the star. Mapping each to distinct copy is
  mandatory in the spec for that reason: a fizzle mints nothing and is otherwise
  indistinguishable from a sweep that never ran.
- **The double-submit guard is where this change is most likely to ship green
  and broken.** `hooks/use-refuel.test.tsx` asserted a guard against code that
  had none, because the harness held the mutation promise open and waited for
  the disabled state *between* the two clicks — stepping around the render race
  that was the whole defect. The scan guard's tests must double-activate within
  one tick with no awaited step, and the Playwright leg must double-click for
  real. A test that has never been observed to fail has not been shown to test
  anything.
- **The document-id change invalidates existing sighting documents' ids.** No
  migration is written and none should be: prod is unused, dev data is
  disposable, and the ground rules prefer deletion to compatibility. Existing
  documents simply keep their old ids and remain readable; they are not
  rewritten, and nothing depends on their format.
- **`disclosure.Contact`'s anonymity survives this change intact**, which is the
  thing most likely to be "improved" by a later implementer trying to make
  ghost-hiding work. The negative requirement exists to make that a spec
  violation rather than a judgement call.
- **The scan-target read costs one position solve per candidate body**, bounded
  by the system's body count (five to seven planets, some moons, a station, a
  gate per lane). It is not a new class of cost — the interior read already
  resolves every body's position — but it is per-request and owner-scoped.
- **`useRunningScan`'s doc comment is lattice-era prose** ("the frozen params
  (origin system + aim target) and eta let the board draw the committed beam").
  The hook is being adopted, not rewritten; its comment must be repointed or it
  will mislead the next reader into believing a beam render exists.

## Migration Plan

None. This change adds surfaces and changes one identifier derivation whose only
dependents are tests. Per the project's ground rules there is no migration, no
compatibility path, and no feature flag; the old behaviour has no users because
the client half never existed.

No capability is retired, so there is no post-archive hand-delete.

## Open Questions

Recorded for Travis. None of these is answered by this change, and none should
be answered by inventing a value.

1. **OQ-7 (inherited, still open) — sighting visual aging rules.** This change
   requires only an `asOf` label and a visual register distinct from a live
   contact. How staleness is *expressed* — fade, desaturation, size, or the
   growing "could-be" shell `/spike/intel` tried and cut — is undecided.
2. **OQ-9 (inherited, still open) — where the sighting log mounts.** This change
   requires only that it be reachable from the system space view without leaving
   it, and that the acting-fleet selection survive. Panel, drawer, overlay, or a
   route that keeps the view mounted are all permitted by the spec as written.
3. **OQ-8's residue — the design doc contradicts the shipped spec, and this
   change does not resolve it.** `README.md` and `/spike/intel` describe a
   **Track** rung: a ghost that rides a predicted orbit, called "the money
   shot". `sighting-records` freezes position and velocity, not orbital
   elements, so that rung is unimplementable as shipped and the spike's ghost
   cannot be graduated as-is. This change accepts the Glimpse and does not widen
   the record. Whether the record should eventually carry elements is Travis's
   call.
4. **Should a future change introduce a per-corporation pseudonymous target key,
   so a ghost can be suppressed while its target is live-disclosed?** Decision 2
   declines it here and states the cost: a stable pseudonym is a track in
   everything but name, links every sighting of one target across sweeps, links
   a ghost to a live contact, and needs per-corporation salting or it links
   across corporations too. What it buys is `/spike/intel`'s hide-ghost
   behaviour, which is genuinely nicer to look at.
5. **Should the scan-target list also enumerate *ineligible* hosts with a
   reason** ("too far", "behind the star")? It would make the range and
   occlusion rules legible instead of silently omitting bodies, and it discloses
   nothing a player cannot already see. It also adds a field whose consumer is
   speculative. Not decided by any ruling; not invented here.
6. **Should a settled sweep notify a player who does not have the space view
   open?** The action spine reserves `NotifiedAt` for exactly this and the
   notification channel is deferred post-slice. Out of scope here; the report is
   shown only to a player with the view open.
7. **OQ-5 (inherited, still open) — contact refresh cadence.** This change
   invents no cadence: the settle refetch reuses the existing named ETA cushion
   and the pile is not polled at all (Decision 6). If the baseline cadence
   changes, nothing here needs to change with it.

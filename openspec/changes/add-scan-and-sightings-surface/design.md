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

Adversarial review then found three more, all of them **live defects in shipped
code** rather than gaps in this change's plan, and all of them invisible to the
existing suite: the resolver's `reasonCode` is never persisted (Decision 18),
the settled-action inbox is neither ordered nor bounded (Decision 19), and the
body table's derived belt members are accepted scan hosts (Decision 17). The
first two are why this change carries an `action-dispatch` delta despite not
owning that capability — a requirement here reads a field that capability never
writes, and folds a list it never orders.

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

**The identifier's class is specified, not left to the implementer, and this
is the strongest argument in the change.** The identifier *is* the Firestore
document path. `sightings.MintWrites` returns `action.DocWrite`s that
`action/dao.go` applies with `tx.Set(ref, w.Data, firestore.MergeAll)`, so two
records that collide on the identifier are **one document**: the later mint
merges over the earlier, no error is raised, no duplicate appears, and one of
two filed claims is gone. That is undetectable data loss, in a pile that never
expires and has no repair path (`sighting-records`' *A Sighting Is Immutable
and Never Expires* forbids the update and delete verbs that would fix it).

An earlier draft of tasks.md said "fixed-length, integer-only", which was only
ever about float determinism — and SHA-256 satisfies float determinism
trivially. But "integer-only" steers directly at the two derivations that fail
catastrophically:

- **A 32-bit non-cryptographic hash** (FNV-1a is the obvious reach) birthday-
  collides at roughly 10^5 records. A single corporation's pile reaching six
  figures over a long game is unremarkable, and the failure is silent.
- **`hash/maphash`** (the other obvious reach for a fast, integer, stdlib
  hash) is **randomly seeded per process**. It passes *A retried resolve
  converges instead of duplicating* in a single-process test and mints two
  documents the moment a retry lands on a different Cloud Run instance —
  green in CI, wrong in production, which is the exact failure mode this
  chain has been repeatedly caught by.

The spec therefore mandates a **collision-resistant digest, rendered at no
fewer than 128 bits, depending on no per-process, per-instance, or randomly
seeded value**, and pins cross-process stability and non-invertibility with
their own scenarios.

**The 128-bit floor is this spec author's decision, not an inherited ruling.**
No entry in `decisions.md` and no upstream handoff prices identifier width;
128 bits is chosen as the smallest width at which birthday collisions are not
a design consideration at any pile size this game can produce. Travis may
revisit it — the requirement's shape (a digest whose width is named) survives
any change to the number.

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
2. The inbox already carries everything the window does — near enough that no
   surface can tell, though *not* "by requirement", as an earlier draft of this
   decision claimed. `fleet.Scan` reads the clock once for `ScanWindow.DepartMs`
   and `action.Commit` takes a **second, independent** `s.clock.Now()` for
   `CommittedAt`, so the two are equal only because nothing happens between
   them, not because any rule pins them together; and the arrive time and the
   ETA are the same stored value. The conclusion stands — the inbox's
   `committedAt`/`eta` are a faithful window and the DTO field would add
   nothing — but it rests on two clock reads a microsecond apart, not on a
   requirement.
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

**The scan-target read serves no world time — and an earlier draft of this
change served one.** The requirement, a scenario, and two tasks all carried a
world time on the scan-target response, and **nothing consumed it**: the only
client requirement that measures against a served world time is the running
sweep's countdown, which measures against the *action inbox's* own served world
time, from the read that carries the ETA it counts to. It is worth recording
plainly that this change — whose stated goal is "the minimum surface that has a
**named consumer** for every field added", written in direct response to five
built-and-never-called derivations — was itself about to ship a served field
with no consumer, and that its own orphan audit (task 9.2) enumerated five
fields and omitted the only genuinely new one, the field the audit existed to
catch. The clause is deleted from the requirement, the scenario, and both
tasks; the audit now names the *absence* explicitly.

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
effect of that read.* But `system/handler.go:97` calls
`actions.ResolveDue(ctx, systemID)` on the interior read and a scan action's
`Scope` **is** its system id, so that scenario is already false against shipped
code.

**Two corrections to an earlier draft of this decision, neither of which
changes the conclusion.**

1. The interior read is *not* "the only surface that resolves a due sweep."
   `fleet.Get`'s entry condition does check `State.Burn` and `Jump` — but once
   it enters, `resolveDue` calls `action.ResolveActive(ctx, f.Id)`, which
   resolves **every** due action for that actor, scan included. So a fleet read
   for a fleet with a due burn also settles that fleet's due sweep. The interior
   read is the *reliable* trigger, not the only one.
2. `ResolveDue` keys on `scope`, not on the reading corporation
   (`action/service.go:193`), and `POST /v1/push/action-sweep` calls
   `ResolveAllDue` on a ~15-minute cadence. So another corporation's read of the
   same system settles your due sweep and mints into your pile, and so does the
   passage of time with no reader at all. The MODIFIED requirement is worded to
   permit all of these rather than to name one.

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

The log reads on mount, after the settle refetch that follows a sweep's ETA,
and on explicit refresh. A timer poll would be pure cost. No new cadence
constant is invented; the settle refetch reuses the existing named ETA cushion
(`ETA_CUSHION_MS`) that `use-board-realtime.ts` already applies to a running
mine.

**The reason is narrower than an earlier draft claimed, and the draft's version
was false.** It said "no other player's activity and no passage of time can add
a record to a corporation's pile." Both halves are wrong against the code:
`action.ResolveDue` keys on an action's **scope**, not on the reading
corporation (`action/service.go:193`), and `system/handler.go:97` calls it on
**every** requester's interior read — so another corporation reading the same
system settles your due scan and mints into your pile. And
`POST /v1/push/action-sweep` calls `ResolveAllDue` on a ~15-minute Cloud
Scheduler cadence, so time alone mints.

What is actually true, and is enough: every record that appears is the effect
of a sweep **this corporation committed**, whose ETA this view already knows and
already schedules a refetch for. The client is not waiting on an event it cannot
predict; it is waiting on an instant it can name. A poll would re-read the pile
repeatedly to catch records that arrive only at instants already scheduled for.

### Decision 7 — Refetch ordering: settle first, then read the inbox and the pile — on the mount path too

The interior refetch is what resolves the due sweep; the pile read and the
action-inbox read each resolve nothing. Issued concurrently, either can return
before the records exist and before the action has flipped to `done`, so the
player sees an empty result and a still-running sweep for a sweep that worked.
The spec therefore requires both follower reads to be issued only after the
interior refetch has **completed** — an ordering constraint, and a testable one.

**The same ordering governs the mount path, where the hazard is likelier.** An
earlier draft fixed the ordering only after a *scheduled* post-ETA refetch,
which is the case where the view was open the whole time. The commoner case is
a sweep whose ETA passed while the view was closed: on open, `GetInterior`
settles it, and a log or ghost-layer mount read issued alongside that opening
interior read races it — with nothing scheduled afterwards to correct the empty
result, because the ETA is already in the past. `sighting-log`'s *The Log Reads
on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*
carries the mount-path ordering and its own scenario.

**The inbox refetch is part of this ordering, not an afterthought.** Nothing
else on the wire carries the running window, the cancel action id, the settled
`outcome`, the `reasonCode`, or `acknowledgedAt`. Without an inbox refetch
after settlement, *A past-ETA sweep reads as settling* holds forever and *A
Settled Sweep Reports Its Outcome* never fires — taking all five fizzle copies
with it, which is the headline half of this change.

### Decision 8 — A clean-sweep record draws no ghost, and the origin rule is restated for ghosts

A clean-sweep record carries no target and no position; its `Position` is the
zero value. It draws no ghost. Drawing it at the *host* instead would be a new
invention. It appears in the log, which is where a claim of "nothing was masked
here at time T" is legible anyway.

**A citation correction.** An earlier draft justified this by saying 8a-2's *A
Non-Star Position at the Origin Is Omitted From the Scene, Not Drawn Atop the
Star* "already requires" a zero-position ghost to be omitted. It does not. That
requirement enumerates its subjects — "a **body's**, **fleet's**, or
**contact's** served or resolved position" — and a ghost is a fourth mark
class it does not name. This change may not MODIFY it (Decision 10), so it is
restated for ghosts in this change's own ADDED requirement, *A Ghost at the
Origin Is Omitted From the Scene, Not Drawn Atop the Star*. The case that
escapes without it is not the clean sweep — that record has no position at all
— but a target-naming record whose stored position happens to be exactly the
origin, which would be drawn on top of the star.

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
  Settles It, Then Reads the Inbox and the Pile* as a fourth, stated as its own
  requirement because it also carries the settle-then-followers ordering, which
  is not a refetch rule at all.
- *A Non-Star Position at the Origin Is Omitted From the Scene, Not Drawn Atop
  the Star* enumerates body, fleet, and contact. This change adds *A Ghost at
  the Origin Is Omitted From the Scene, Not Drawn Atop the Star* rather than
  widening that enumeration (Decision 8).
- *Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point*
  already excludes fleets and contacts from the selection set by name. This
  change adds *A Ghost Is Not a Member of the Space View's Selection, and a Burn
  Never Consumes One* rather than editing that exclusion list (Decision 12).

A future change that wants one merged requirement can MODIFY freely once both
are live.

### Decision 11 — A settled sweep is reported once, and acknowledging it is what stops the report

The action spine already has the mechanism: `AcknowledgedAt` powers the
done-but-unacknowledged inbox, and `POST /v1/actions/:actionId/acknowledge`
exists with no client consumer. Without it, the settled-sweep report would
either reappear on every refetch forever or be dismissed into component state
that resets on remount. Using acknowledge gives that endpoint its first
consumer and makes the dismissal survive a refetch.

### Decision 12 — A ghost is outside the selection set, and its highlight is separate state

8a-2's picking rule is **exhaustive**: a click resolving against the pick plane
over no body or lane-gate mark **selects that point**, and *Burn Command Targets
Any Selected Body, Lane Gate, or Point Uniformly* means a selected point is a
burn target. A ghost is drawn in that same plane, at the place a sweep found
something masked — which is precisely where a curious player clicks. Without a
rule, clicking a ghost to read it silently arms a burn to the coordinate a
foreign fleet occupied at some past `asOf`.

**Decision.** A ghost is not a member of the space view's selection. The
row↔ghost highlight (`sighting-log`) is a **separate, additional** state held
alongside that selection, which a burn never consumes. This mirrors the
treatment 8a-2 already gives own fleets and foreign contacts, which are drawn
and never selectable, with the acting fleet chosen from the roster instead.

### Decision 13 — A fleet may not sweep itself: excluded from the list AND rejected at commit

Verified against the code: `resolveScanHost` iterates `dao.ListBySystem`, which
contains the scanner itself; the scanner passes the owner check trivially;
`disclosure.WithinRange(from, from, r)` passes at distance zero; and
`disclosure.Occluded` early-returns `false` for a zero-length segment
(`occlusion.go:35`). **A fleet can commit a focused scan against itself today,
and it succeeds** — spending sensor-channel time and unmasking itself to learn
composition it already reads in full.

`focused-scan`'s new list requirement says a served target is one a commit would
accept, so leaving the commit as-is would *mandate* listing the acting fleet in
its own target list. Excluding it from the list alone would leave the commit
accepting a host the list can no longer offer.

**Decision.** Exclude it on both sides: absent from the served set, and rejected
at commit through the same `ErrScanHostUnresolved` every other unresolvable host
returns. The identical-rejection shape means this needs no new player-facing
copy, because no client surface can produce the rejection.

### Decision 14 — The ghost layer's pile read is filtered server-side by system

`GET /v1/sightings` accepts `limit` and `cursor` only. `sightings.Dao.List`
orders by `asOf` descending across every system, `PageMax` is 50, and a record
never expires. So "every record in the pile whose system is the open system" is
not a read a client can perform: it can only page the whole pile and hope the
system it is drawing has not fallen past the last page it fetched. The failure
is silent and grows with play time — ghosts quietly stop appearing.

**Decision.** Add an optional `systemId` filter to the pile read and make the
ghost layer's source that filtered read. The alternative — "load N pages and
hope" — was rejected: it puts an unstated bound on correctness, and the bound
is exactly the thing that erodes.

**A residual bound remains, deliberately.** The filtered read is still paged at
`PageMax`, so the ghost layer draws the newest page of *this system's* records
rather than all of them. That is a bound on a bounded thing — the newest 50
sightings in one system — instead of a bound that silently degrades with total
pile size, which is the defect being fixed. Whether ghosts should page, or the
pile should ever expire, is not decided here and is not invented here.

The cost is one composite index (`systemId asc, asOf desc, __name__ desc`) in
`firestore-indexes.tf`, which Travis must `terraform apply`. Note that the
emulator auto-indexes, so the tests pass without it and only production fails —
the same trap `credit-reconcile` and the action inbox's indexes already carry.
**Decision 19 adds a second index under the same trap**, on `actions`; both must
land in the same `terraform apply`.

### Decision 15 — A fleet with a claimed sensor slot has an empty target set

The target list's contract is that a served entry is one a commit would accept.
While a fleet already has a running sweep, the sensor channel is claimed and
*every* commit is rejected (`focused-scan`'s *A second sweep is rejected while
one is running*), so the honest answer is an empty set — the same answer lane
transit already gets, for the same reason. It costs nothing at the surface: the
client withholds the commit control entirely while a sweep runs, and a
successful cancel invalidates the target-list query, so a fresh read returns the
real set immediately.

### Decision 16 — "Most recently settled" is ordered by served fields, and the settled-inbox read must be bounded

"The acting fleet's most recently settled, unacknowledged focused scan" named no
ordering field, and there is none to fall back on: `action.Dao.List` applies
**no ordering and no limit** — it is a `Where("actor", ==)` plus an optional
status equality, iterated to exhaustion. So the inbox's arrival order is
whatever Firestore returns, and "most recent" was undefined.

**Decision.** Order by the greatest served `resolvedAt` world time, with the
action's `eta` breaking a tie — both already stored and served, neither newly
added. The requirement states the ordering in terms of those fields and forbids
relying on the response's order.

The same finding exposes a second problem: `GET /v1/actions?actor=&status=done`
returns **every action that fleet has ever completed**, unbounded, and this
change would be its first caller. Round 2 showed that a bound alone is not just
insufficient but actively wrong — see Decision 19, which promotes it from a task
to an `action-dispatch` delta and answers OQ-9.

### Decision 17 — A derived belt member is not a scan host, on either surface

`system/bodies.go:150-155` synthesizes `AsteroidsPerBelt` (8) member bodies per
belt into the `BodyTable`, ids `{beltId}#{k}`, derived and never persisted.
`fleet/service.go:1120-1127`'s `resolveScanHost` accepts **any** `bt.Body(hostId)`,
so a belt member is an accepted scan host today. `system/handler.go:124-155`
serves features and lane gates only, so no read publishes a member id — which
makes the new scan-target read the **first** surface that would.

That collides with two settled things: `build-production-space-view`'s *Belt
Members Render as Decorative Detail, Never as Separate Pickable Bodies* ("no
member SHALL carry its own hit target, selection, or facts display") and link
8's OQ-4 ruling, "one body, members decorative and unpickable". It is not a
corner case either: a fleet docked at a belt is the canonical mining position,
so the first player to open the scan control while mining would see nine
entries for one belt, with ids the client has no name, mark, or facts surface
for.

**Decision (binding, and OQ-4 is NOT reopened).** Exclude derived members from
the served set, and reject a commit naming one identically to an unresolvable
`hostId` — the same both-sides shape Decision 13 applies to the self-sweep, and
for the same reason: excluding from the list alone leaves the commit accepting a
host the list cannot offer. The belt feature itself remains an eligible host.
Alternative considered and rejected: serving members with a "belt member" kind
so the client could group them — that is per-member lodes and a wire-size
question by another name, both of which OQ-4 closed.

### Decision 18 — `reasonCode` is persisted in the resolve transaction

`action/dao.go:334-339` is the resolve transaction's only write to the action
document, and it sets `status`, `outcome`, and `resolvedAt` — not `reasonCode`.
`ResolveOne` is the only applier. `Action.ReasonCode` is `omitempty`, so
`GET /v1/actions` serves the key **absent, always**. The five-way fizzle copy
this change specifies would therefore render its unrecognized-code fallback for
every fizzle, and task 9.2's orphan audit would still pass — the field has a
named consumer, it just has no producer.

Two things hid this, and both are recorded so they are not rediscovered:
`action/model.go:203-206` documents `ResolveResult.ReasonCode` as "the
structured classifier **mirrored onto `Action.ReasonCode` at the same status
flip**", which the code does not do — the same failure shape as `encodeCursor`'s
"opaque wire shape" comment; and `fleet/scan_resolver_test.go:280,371` assert
`res.ReasonCode != ""` on the resolver's **return value**, never on the stored
action, so the suite is green while the field is dropped.

This is also a **live requirement violation**, not merely a gap in this change:
`openspec/specs/focused-scan/spec.md:237-241` and `:264-266` already require
that the resolved action carry a reason code.

**Decision.** Add `reasonCode` to the existing `tx.Update` and mirror it onto
the returned in-memory action, specified as an `action-dispatch` MODIFIED
delta on *Exactly-Once Resolution*, and assert it by **reading the action back
from the store** — never from the `ResolveResult`, which is precisely the
assertion that already passes. Writing an empty string for verbs that set no
code is harmless; `omitempty` keeps it off the wire.

### Decision 19 — The settled inbox is ordered as well as bounded, and it needs an index

`action/dao.go:148-177`'s `List` is `Where("actor","==")` plus an optional
status equality, with **no `OrderBy` and no `Limit`**. A bare limit on an
unordered query returns an **arbitrary subset**, so the report would fold
"greatest `resolvedAt`" over that subset: it can show a stale sweep or none
while the newest stays unacknowledged forever, and dismissing the wrong report
acknowledges the wrong action. Both of the report's ordering scenarios pass
under a bare limit anyway, because a two-action fixture is under any bound.

**Decision.** Specify ordering *and* bound as an `action-dispatch` MODIFIED
delta on *Inbox by Actor Query Param* — this is OQ-9's answer: it wanted a
small delta, not a bare task.

Two constraints ride with it. First, `(actor ASC, status ASC, resolvedAt DESC)`
is a composite index and `infra/terraform/firestore-indexes.tf:58-73` has only
`(actor, status, eta ASC)`; the emulator auto-indexes, so tests stay green and
only production 500s — the same trap Decision 14 flags for the sightings index,
which is why both are named in one place. Second, the ordering applies **only**
on the `done` path: `resolvedAt` is `firestore:"...,omitempty"` and absent from
a running action's document, and Firestore's `OrderBy` excludes documents
missing the ordered field — so an unconditional order would silently return zero
running actions and break `useRunningScan`, the hook this change exists to give
a consumer.

### Decision 20 — The swept host's raw id is the ordinary label, and the name path stays

`system.Feature.Name` is set in exactly two places: `system/generator.go:64`
(the star, which is never a scan host) and `stations/service.go:238` (the
trading station). Planets, moons, belts, and lane gates carry no name; a fleet
host has none at all. So the log's "host is named" path is inducible only
against a station, and most rows will render `feat-planet-3`.

**Decision.** Keep the name clause and make the fallback's status explicit
rather than dropping it: the client's body type carries the optional served
`name` (task 4.2a), and the raw host id is specified as a **legitimate label,
the ordinary case** — no placeholder, no empty cell, no degraded-state
indication. Alternative considered and rejected: dropping the name clause for a
"type + id" label rule. It reads better for a body in the open system but has no
source anywhere else — a log row carries only the record's `hostId`, so a row
for another system's sweep has neither a name nor a type, and the rule would
need its own fallback to the bare id regardless. That trades one honest fallback
for two. The name path also stays true to the wire, which does serve names for
some hosts and may serve more later.

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
- **This change now writes against `action-dispatch`, a capability it does not
  own.** Decisions 18 and 19 add two MODIFIED requirements there. Both were
  forced: a requirement in *this* change reads a field that capability never
  persists, and another folds a list that capability never orders. Specifying a
  neighbour's read surface on the way past is a real cost, taken here because
  the alternative is a client that renders a fallback for every fizzle and a
  report that names an arbitrary action — neither of which any test in this
  change would catch.
- **The per-own-fleet inbox read is N reads, not one.** Re-anchoring the settle
  refetch to every own fleet in the open system (Decision 7 / MAJOR 5) means one
  `GET /v1/actions?actor=<fleetId>&status=running` per own fleet in that system,
  because the inbox is actor-scoped and has no multi-actor form. N is small — the
  fleets one corporation has in one system — and the reads are already how the
  acting fleet's window is fetched, but it is a per-fleet fan-out rather than a
  single query, and it is worth knowing before it surprises someone.
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
8. **Is 128 bits the right floor for the sighting identifier?** The floor is
   this change's own decision (Decision 1), not an inherited ruling — no entry
   in `decisions.md` prices identifier width. 128 bits is chosen as the smallest
   width at which birthday collisions stop being a design consideration at any
   pile size this game can produce, and the requirement's shape survives any
   change to the number. Travis may set it higher or lower; what must not
   change is that the width is *named* and the derivation is unseeded.
9. ~~**Should the settled-action inbox's bound be a requirement, and whose?**~~
   **ANSWERED (round 2, Decision 19).** It should, and it is `action-dispatch`'s:
   this change now carries an `action-dispatch` delta modifying *Inbox by Actor
   Query Param* to require ordering **and** a bound on the `done` path. A bare
   bound was not merely under-specified but wrong — an arbitrary subset of an
   unordered query. Nothing here remains open.

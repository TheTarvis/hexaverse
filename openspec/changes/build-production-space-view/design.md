## Context

`frontend/app/spike/space-3d/` (`sim.ts`, `SpaceView.tsx`, `page.tsx`) is a
self-contained interaction PoC: a seeded system of inclined continuous
orbits, click-to-plot burns solved against a moving target, arrival folding
into a rails park, and a station-keep toggle — all computed client-side in
`sim.ts`, with no backend behind it. Since the PoC was built, links 1–7 gave
the real backend everything it sketched. `board-view` is the only playable
tactical screen today, and it renders the polar ring-and-slot lattice
`backend/board`/`backend/polar` compute — a representation the backend has
moved away from.

This change is the renderer half of a two-change split; its sibling,
`serve-orbital-elements-and-burn-preview`, is where the wire and solve
surface live. Two properties of the PoC drive most of what follows. First,
`sim.ts` contains `arcTable`, `arcParam`, `burnProgress`, `burnSpeed`,
`resolveShip` and `stationKeepRate` — six functions that are, in Go, on
`space-kinematics`'s forbidden list, so a straight port is a mirror violation.
Second, the guard against that violation is structurally blind to it: the
anti-mirror check compares raw, case-sensitive names, and `ArcParam` versus
`arcParam` collide zero times.

## Goals / Non-Goals

- Goal: graduate the PoC's visual grammar (ring = live position, ghost =
  position at arrival, curve = the path) into a production view reading
  real backend state, with `board-view` fully retired.
- Goal: leave `backend/board`, `backend/polar`, and their fixtures
  unreferenced by any frontend code path, so link 9 is a pure deletion — and
  that means every tether, not only the component tree.
- Goal: ship the station-keeping hold/release verbs their first client
  affordance.
- Goal: make the anti-mirror guard actually able to catch the violation this
  change is most at risk of committing.
- Non-goal: the focused scan's command surface and the sightings display —
  entirely 8b's (`add-scan-and-sightings-surface`) scope.
- Non-goal: any kinematics on the client beyond drawing (Decision 1).
- Non-goal: multi-ship-per-fleet rendering, combat, or per-member belt lodes.
- Non-goal: any migration, backwards-compatibility, or feature-flagged
  coexistence between the lattice and space views.

## Decisions

These are the decisions this change actually had to take. The rulings it
inherited are recorded separately, below, so the two are not confused for
each other.

### Decision 1: What `frontend/lib/space` may compute — draw by curve parameter, never by arc length

**Taken.** `frontend/lib/space` contains exactly four kinds of function:
evaluate a position from a served orbital element set; evaluate a position
from a served park or drift; evaluate a served quintic Bézier at a parameter
`u`; and project/format for the screen. A burning fleet is drawn at
`u = (t − departMs) / (arriveMs − departMs)`, clamped to [0, 1], and a burn
past its served `arriveMs` is drawn frozen at its served intercept until a
refetch lands the settled park. Every displayed number comes from a served
field.

**Why the obvious approach is illegal.** Drawing a burning ship at its true
position at time `t` requires inverting arc length over the quintic under the
brachistochrone profile — `space.ArcTable`/`ArcParam` (a **curve length**) and
`space.Speed`. `space-kinematics`'s sole-authority requirement names "a curve
length" and "a settled park" on its forbidden list explicitly. An earlier
draft of this design asserted that animating a fleet from served kinematic
state was "already legal"; that is true for a park and a drift and **false for
a burn**, and the PoC this change ports from contains exactly the forbidden
functions.

**Alternatives considered.**

- *(a) Port `arcParam`/`burnSpeed` and accept a documented exception.*
  Rejected. It is the single largest architectural commitment in the chain
  (Go sole authority), the exception would be permanent, and the guard meant
  to police it cannot see the violation. If arc-length-correct drawing is
  ever wanted, the honest route is amending `space-kinematics`, not a carve-out
  in a renderer change.
- *(b) Draw by Bézier parameter, explicitly decorative.* **Taken.** Zero wire
  cost, no spec amendment, no forbidden function. The visible cost is that the
  mark leads or lags the true position mid-flight, coinciding at both ends.
  That is acceptable because nothing is decided from the mark: not a range
  test, not an ETA, not a price, not a pick.
- *(c) Have the server send a sampled polyline with timestamps.* Rejected: it
  turns a six-point payload into a per-burn sample array, and the sampling
  density becomes a tuning knob with a wire cost, to fix a discrepancy nobody
  can measure without a second ship to compare against.
- *(d) Poll often enough that interpolation does not matter.* Rejected — it
  trades a cosmetic inaccuracy for real request load, and the refetch rules
  exist to land state transitions, not to drive animation.

**A consequence worth stating:** the drawn positions use ordinary
floating-point trigonometry, not the authoritative implementation's pinned
turn table, so they are deliberately **not** bit-identical to the server's.
That is safe only because no drawn position is ever compared to a served one or
used in a predicate — which is why the requirement says so in those words.

**And the guard is fixed in this change.** `check-mirror-map.sh` compares
`GO_NAMES` and `TS_NAMES` with `comm -12` on raw names. `ArcParam`/`arcParam`,
`Speed`/`speed`, `StateAt`/`stateAt` all pass. The comparison becomes
case-insensitive, and `sharedNames` is matched case-insensitively too. This is
a code-is-wrong fix against the live requirement
(`cross-stack-determinism`'s *Shared Board Math Is Pinned By a Cross-Language
Golden Fixture*, scenario *A Go-sole-authority capability's mirror map runs in
anti-mirror mode*), which already forbids the mirror; only the check's
comparison was too weak to enforce it. No spec delta restates it.

**The case-insensitivity fix has a cost that must be paid deliberately, not
discovered.** `backend/space` exports, among ~50 non-test names, `Position`,
`Velocity`, `Length`, `Scale`, `Add`, `Sub`, `Dot`, `Cross`, `Normalize`,
`Point`, `Tangent`, `Progress`, `Speed`, `PhaseAt`, `LocalPosition`,
`LocalVelocity`, `ArcParam`, `ArcTable` and `StateAt`. Go's exported style is
TitleCase and TypeScript's is camelCase **for the same trivial helpers**, so a
case-insensitive comparison collides on `add`, `sub`, `dot`, `cross`,
`normalize`, `length`, `scale`, `point` — benign vector arithmetic — as readily
as on `arcParam`. A check that fires on `vecAdd`'s honest name is a check
someone widens `sharedNames` to silence, and `sharedNames` is the one door the
requirement says stays empty by default.

**So the naming rule is part of this decision, not a follow-on detail.** Every
export in `frontend/lib/space` is **subject-prefixed and draw-scoped** —
`drawOrbitPosition`, `drawParkPosition`, `drawDriftPosition`, `bezierPointAt`,
`vecAdd`, `vecSub`, `vecScale`, `projectToScreen` — chosen so that no name,
compared case-insensitively, equals any `backend/space` name, and
`fixtures/space/mirror-map.json`'s `sharedNames` stays **empty**. A collision
that forces an allowlist entry is treated as a signal to rename the TypeScript,
not to widen the allowlist. This also has the incidental benefit that every
export reads as "this is for drawing", which is the constraint the requirement
is really enforcing.

*Rejected alternative:* leave the check as-is and rely on review. Rejected —
this change is the first to put any TypeScript under `frontend/lib/space`, so
it is the first change for which the check has ever had anything to compare,
and the first at which its weakness is load-bearing.

### Decision 2: The `orbit` wire key collision — a new key, `orbitElements`

**Taken (in the sibling change; restated here because this change's removal
half depends on it).** The continuous element set ships under `orbitElements`.
The lattice `orbit` object keeps its name and meaning until this change deletes
it outright.

**Why it was a live defect.** `backend/system/fog.go`'s `fogFeatureDTO`
already serves `Orbit *Orbit \`json:"orbit,omitempty"\`` — the **lattice**
orbit `{ring, angle0, period, dir}` — and its `space` key already holds the
resolved `Vec3`. An earlier draft specified the continuous set as `orbit`,
silently retyping an occupied key, and its removal list omitted three lattice
fields live on the wire right now: `orbit`, `parentId` and `fixed` — precisely
the fields link 9 needs gone. Either an implementer ships a union of two
schemas or keeps both, and link 9 stays blocked in both cases.

**Alternatives considered.**

- *Retype `orbit`.* Rejected: the two objects share no field name, so a stale
  reader gets `undefined` for every field rather than an error. Nothing throws;
  a render is silently wrong or a test silently passes.
- *Remove the lattice fields in the sibling change and reuse `orbit`.*
  Rejected: that makes the sibling a removal rather than an addition, which is
  the property that makes the split safe, and it breaks the live lattice board
  while it is still the only playable view.
- *Rename `orbitElements` to `orbit` here, once the lattice key is gone.*
  Rejected as churn for a key whose meaning would then depend on which change
  had archived. `orbitElements` is also the better name beside a `space` key
  that holds a resolved position.

**This change's half** is the removal: `footprint`, `orbit`, top-level
`parentId`, `fixed`, `band`, `live`, `asOf`, and a lane gate's `cell`, all
dropped in the same change that stops reading them.

### Decision 3: The preview's settle semantics — settlement is permitted, and required

**Taken.** "The preview has no cumulative effect" is narrowed to: no action,
no channel claim, no fuel debit, no stored burn, and byte-identical stored
state across repeats **for a fleet with nothing due**. Settling an
already-due arrival through the shared fold-first seam is permitted and
required, and the preview solves from the settled state.

**Why the absolute version was unimplementable.** `fleet.OrderTo` opens with
`settleIfDue`, which calls `resolveDue` and writes; the single-fleet `Get`
settles too. A preview that wrote nothing at all would have to skip
settlement, and would then disagree with the commit that follows it — in
exactly the case that matters, since ordering the next leg immediately after
arriving is the most common thing a player does.

**Alternatives considered.**

- *A read-only fold that computes the settled state without persisting it.*
  Rejected: it duplicates the is-it-due predicate in a second shape, which is
  the thing `ListForCorp`'s own implementation notes record avoiding, and it
  makes preview and commit run different code — which is what the parity
  scenario asserts against.
- *Let the client send the settled state.* Rejected outright: computing it is
  `space.StateAt`, forbidden by name.

**Client-side consequence, decided here:** the preview is requested exactly
when a commit would be accepted — including while the fleet is **burning**,
because re-targeting mid-flight is an ordinary commit and is the highest-stakes
order in the game. An earlier draft forbade previewing a mid-burn re-target
while permitting its commit, which is backwards.

### Decision 4: The upkeep source — a served rate in tons, not a client derivation

**Taken.** The hold/release control's drain readout reads a served,
owner-only rate in fuel tons per unit time
(`serve-orbital-elements-and-burn-preview` adds it). The view computes nothing.

**Why it needed deciding.** `space.StationKeepRate` is on no DTO, and
Decision 2 hands the client `orbitElements.periodMs` and
`orbitElements.radius` — so the shortest path from "show a drain readout" to
a working readout is four lines of `omega² × radius` in a helper. That is a
mirror of an authoritative function, complete with its floor clamp and its
non-positive-period branch, followed by the equally rule-bearing
delta-v-to-tons conversion — the one `add-stationkeep-hold-verb` records being
got backwards once already at a 5× error. And a helper named `holdDrain` in
`frontend/components/space/` passes every automated gate even after Decision
1's case-insensitivity fix, because that directory is not scanned at all.

**Alternatives considered.**

- *Serve the delta-v rate; convert on the client.* Rejected: `DeltaVPerTon`
  would have to become a duplicated client constant, and the conversion is
  itself rule-bearing.
- *Serve the stored dry instant instead.* Rejected as answering a different
  question ("when does this end", not "what is this costing"), and as absent
  for an orbiting fleet, which still wants to know what holding would cost.
- *Compute it client-side and accept it as a stated exception.* Rejected: the
  exception would be invisible to every check, which is the specific failure
  mode this decision exists to avoid.

### Decision 5: Which fleet read drives the view — the corporation-scoped one

**Taken.** The space view reads own fleets through `GET /v1/fleets?mine=true`
(`fleet.ListForCorp`) and filters to the open system on the client. It does not
use `GET /v1/fleets?systemId=`.

**Why it needed deciding.** `ListInSystem` is a bare `dao.ListBySystem` — it
does **not** settle a due arrival. `ListForCorp` does, per system, through the
shared `settleIfDue` seam, precisely because the roster is the corp's fleet
surface and a docked fleet must read as docked there. An earlier draft named
`?systemId=` in the fan-in, which would have produced a screen where the canvas
shows a fleet still burning with no attachment while the roster beside it shows
the same fleet docked — and the docked commands live on the roster's panel, so
the disagreement is not cosmetic.

**Alternatives considered.**

- *Make `?systemId=` settle too.* Rejected: that read also serves foreign
  fleets, so settling as a side effect of a stranger's read is write
  amplification with an ownership smell.
- *Read both and reconcile.* Rejected: two sources of truth for one fleet on
  one screen is the defect, not the fix.
- *Keep `?systemId=` and re-fetch the single fleet on demand.* Rejected: it
  adds a read per fleet to remove a read that already returns them all,
  settled.

### Decision 6: The quote lock keeps BOTH halves — the display notice and the `maxFuelTons` reject

**Taken, overriding an earlier draft of this document.** The commit sends a
`maxFuelTons` cap derived from the previewed fuel cost by one named client-side
allowance factor, the view displays that ceiling rather than only the point
estimate, and a cap rejection re-quotes in flow. The drift-display behaviour is
kept alongside it, not instead of it.

**The overridden rationale, and why it fails.** The earlier draft took the
display half of the binding quote-lock ruling and dropped the reject half,
arguing that "a burn commit always succeeds against the best available solve —
there is no 'wrong' price to reject the way a concurrently-moved demand entry
is." Three problems:

1. **Fuel is finite.** It is a stored, mass-carrying commodity that also has to
   get the fleet home. A quote of 4 tons that settles at 11 is materially
   wrong even though both are payable.
2. **The target moves.** Between preview and commit the target advances along
   its orbit and the fleet advances along its own state, so the committed cost
   differs from the quoted one by construction. That is the same moving-quote
   problem `goods-sale`'s *Sell Commit* already solved with
   `expectedUnitPrice`.
3. **`ErrInsufficientFuel` does not cover it.** It fires only on can't-pay,
   never on paid-more-than-agreed. A fleet with a full tank has no protection
   at all without the cap.

**Why an allowance factor rather than a zero-slack cap.** A burn's solved cost
moves continuously, so a cap equal to the point estimate would reject ordinary
commits and bounce the player out of the flow for no reason. The allowance
distinguishes ordinary drift from a cost the player never agreed to, and the
view displays the resulting ceiling so the number the player agrees to is the
number enforced. Its value is a single named client constant and is an open
question below — the spec pins the shape, not a made-up number.

**Alternatives considered.** A mandatory cap (rejected: breaks every existing
caller and makes the commit unreachable whenever a preview fails); a
server-side quote token with a TTL (rejected: needs a store, an expiry policy
and a replay rule for the same guarantee); a server-side relative tolerance
field (rejected: a second rounding rule to pin cross-stack, when a client that
wants slack can send an absolute ceiling).

### Decision 7: Next.js structure — a client-rendered route, no server component in the data path

**Taken.** `app/systems/[systemId]/page.tsx` stays a thin `'use client'` shell
that reads the route param and hands it to `components/space/SystemSpaceView`,
mirroring `app/page.tsx` → `GalaxyView`. No React Server Component fetches
game data, no route handler proxies the backend, and the WebGL canvas is
loaded through `next/dynamic` with SSR disabled.

**Why it needed deciding.** No prior draft of this change said anything about
Next.js structure at all, and the App Router's default answer — fetch in a
server component — is unavailable here and would be discovered mid-build.

**Why the default is unavailable.** Authentication is a Firebase ID token held
in the browser and attached by `apiClient`; a server component has no access to
it, so every read this view makes is necessarily client-side. A WebGL context
additionally cannot be created during SSR, so the canvas must be dynamically
imported with `ssr: false` regardless.

**Alternatives considered.**

- *A route handler under `app/api/` that proxies the backend with a
  server-held credential.* Rejected: it invents a second auth path
  (service-account-shaped) alongside the token passthrough the whole system
  uses, for a page that must re-fetch on a timer anyway.
- *A server component shell that streams a skeleton while the client fetches.*
  Rejected as buying nothing: the view already has a specified loading state,
  and the shell would add a layer whose only content is that placeholder.
- *A route group or parallel route splitting canvas and panel.* Rejected: the
  two share selection and acting-fleet state, and the error-independence rule
  (interior fails, panel survives) is a component-boundary concern already
  satisfied inside one route.

### Decision 8: The sell double-submit fix is code-is-wrong, and the guard is shared

**Taken.** `board-view`'s *Sell Control Guards Against Double-Submit* is
already correct and already live: "disabled **from the moment of commit**".
`commitSell` does not satisfy it — it mints `newOperationKey()` and calls
`sell.mutate(...)` unconditionally, protected only by `disabled={!committable}`
driven by `sell.isPending`, an async React-Query flip that reaches the DOM one
render later. Two clicks a tick apart both enter the handler and **each mints
its own key**, so the server's idempotency-by-key structurally cannot collapse
them: two independent sales, one double charge.

This change therefore carries a **task and a scenario, and no spec delta
restating the requirement** — the requirement is re-ADDed under
`docked-fleet-actions` as part of the capability retirement, and gains one new
scenario pinning the timing; nothing about its substance changes.

**The scenario must be Playwright-level.** `hooks/use-refuel.test.tsx`'s
double-click case **passes** against the broken refuel code, because its
harness holds the mutation promise open manually and never reproduces real
render timing. A unit test in that shape cannot observe this failure, which is
why the drift survived a green suite. The scenario's WHEN says "within the same
tick, with no render cycle and no awaited step between them" for that reason,
and the e2e must not insert an `await` between the two clicks. The refuel twin
reproduced 4/4 in Playwright, never once passing, so this is confirmed rather
than suspected.

**One helper, not three copies.** Burn, mine, and sell all need this guard, and
refuel already has a hand-rolled `useRef` version from link 7. A single shared
hook (`frontend/hooks/use-submit-guard.ts`) is used by all four, with refuel
migrated onto it under its existing e2e as the regression. Three hand-copied
refs is how the second and third one drift.

*Rejected alternative:* rely on `disabled` plus `useMutation`'s own pending
state. That is exactly what is shipped and exactly what fails; the flip is
asynchronous by construction.

### Decision 9: Retirement mechanics are rehearsed as a task, not asserted in prose

**Taken.** A capability cannot be retired via REMOVED deltas — the archiver
rejects a rebuilt spec left with zero requirements — so this change carries
**no** `specs/board-view/` delta of any kind, and `openspec/specs/board-view/`
is hand-deleted by a task **after** the archive succeeds.
`polar-lattice-math` and `observation-fog-and-scan` are precedents, both
confirmed absent from `openspec/specs/` today.

An earlier draft of this document *asserted* that the mechanic "was rehearsed
on a copy" while no task in the change recorded doing so. The rehearsal is now
a task (section 12), performed on a copy of the tree before the real archive,
and it checks three things `--strict` does not: that the archive succeeds with
a capability directory that has no delta, that no MODIFIED body silently lost a
scenario, and that no surviving spec is left citing `board-view`.

### Decision 10: The interior read is RETIRED and re-ADDED under a new name, not MODIFIED

**Taken, after rehearsal, and this is a correction to the delta shape rather
than to any behaviour.** `system-interior`'s *Interior Read Endpoint* is
**REMOVED** by this change and re-ADDED, in the same delta file, as *Interior
Read Serves Continuous Bodies*, carrying the eight scenarios that survive.

**Why the MODIFIED form cannot work, and which tool actually stops it.** An
earlier draft used a MODIFIED block that deliberately dropped two scenarios —
*Pre-existing wire fields are unchanged* (live today) and *The lattice orbit
key keeps its lattice meaning* (added by
`serve-orbital-elements-and-burn-preview`) — on the grounds that the archiver's
silent-drop bug is what the rehearsal task exists to catch. That premise is
wrong, but **so was this document's first correction of it**, which claimed
`openspec validate --strict` refuses the drop. It does not. Measured, on a
scratch copy with the predecessors archived first:

    $ openspec validate build-production-space-view --strict
    Change 'build-production-space-view' is valid          # exit 0

The **archiver** is the gate:

    $ openspec archive build-production-space-view --yes
    system-interior MODIFIED failed for header "### Requirement: Interior Read
    Endpoint" - current spec contains scenario(s) not present in the modified
    block: "Pre-existing wire fields are unchanged", "The lattice orbit key
    keeps its lattice meaning". Refresh the change spec before archiving to
    avoid dropping scenarios.
    Aborted. No files were changed.

(That measurement was taken against the MODIFIED form with the sibling change
still adding *The lattice orbit key keeps its lattice meaning*. The sibling has
since dropped that scenario per its own Decision 8, so only *Pre-existing wire
fields are unchanged* now forces the retirement — one is enough.)

So the change as drafted validated cleanly and could never have been archived
— and the failure is loud and safe (nothing is written), but it lands at
archive time, after review and after implementation. `openspec validate
--strict` is **not** evidence that a MODIFIED delta will archive; only a
rehearsed archive is. The one earlier claim that this change "does not even
validate today" was false and is withdrawn.

**Why REMOVED + ADDED, and not the alternatives.**

- *Keep both scenario headings and rewrite their bodies to assert the removal.*
  Rejected. *Pre-existing wire fields are unchanged* would then be a scenario
  whose title asserts the exact opposite of its steps. The archiver is
  satisfied and every future reader is misled — and the title, not the body, is
  what a `grep` and a rehearsal check match on.
- *`## RENAMED Requirements` plus a MODIFIED block.* Rejected as unrehearsed:
  the interaction between a rename and a same-change body replacement is not
  something this change should be the first to discover, and the REMOVED +
  ADDED form is already the repository's precedent — `replace-observation-with-
  sightings` moved four requirements out of `observation-fog-and-scan` by
  exactly this mechanism.
- *Leave the two lattice scenarios standing, asserting fields that no longer
  exist.* Rejected outright: that is the link-9 blocker this change exists to
  clear, restated inside the spec.

**Rehearsed end to end, in the same scratch copy**: with the REMOVED + ADDED
form the change validates `--strict`, archives cleanly (`+ 46, ~ 4, - 1`),
`board-view` retires with no delta of its own, the two new capabilities land
with 30 and 15 requirements, and the surviving requirement carries exactly its
eight intended scenarios. One cosmetic consequence: a re-ADDed requirement is
appended at the **end** of `openspec/specs/system-interior/spec.md` rather than
kept in place, which is a reading-order nuisance and nothing more.

**Cheaper still, in the sibling change — and now done:** its design.md
Decision 8 records that it does not add *The lattice orbit key keeps its
lattice meaning* as a scenario at all, since it existed only to be destroyed
here; its assertion lives in that change's contract suite (tasks 1.2, 2.4)
instead. That reduces the retirement to one forced scenario instead of two; it
does not remove the need for this decision, because *Pre-existing wire fields
are unchanged* is already live and this change must still shed it.

### Decision 11: The backend field removal is the LAST implementation step, not the first

**Taken, and applied.** Dropping the lattice fields from
`system.fogFeatureDTO` and `system.LaneGate` now runs as `tasks.md`
**section 9**, immediately before section 10's deletions, after the new view
renders, previews, commands, and passes its component suite. The frontend
sections it used to precede are renumbered 1–8.

**Why the drafted order is wrong.** Task 9.1 removes `footprint`, `orbit`,
`band`, `live`, `asOf` and a gate's `cell` from the wire. Every one of those is
read by `frontend/components/board/*`, which task 10.1 did not delete until
roughly ninety tasks later. Between those two points the only playable view is
broken, its component suite is red, and all six e2e suites that drive it are
red — so for the whole build of the replacement, the repository's own quality
gate carries no signal, and a genuine regression introduced anywhere in
sections 1–8 is indistinguishable from the self-inflicted breakage.

Nothing in sections 1–8 requires the fields to be **absent**. They require
`orbitElements`, the preview endpoint, the upkeep rate, and the world-clock
scale to be **present**, and the sibling change already delivers all four
additively. The removal's only
consumer is link 9.

**Alternatives considered.**

- *Keep the removal first, to force the new view not to read the old fields.*
  Rejected. The forcing function is already stronger and cheaper: the new view
  is written from `system-space-view`'s own requirements, its types are
  generated against the sibling change's recorded wire sample (task 1.11
  there), and task 9.4's `grep` for surviving readers is what actually proves
  the removal safe.
- *Delete `components/board/` first, so nothing reads the fields.* Rejected:
  that deletes the only playable view before its replacement exists, which is
  the same window with a different cause and no partial fallback at all.

**This does not soften the atomic swap.** There is still no flag, no dual path,
and no coexistence in what ships. The ordering is about the length of the
red window *inside the change*, not about what the change delivers.

### Decision 12: Two of the "usable without the interior read" commands are not, and the seam is drawn here

**Taken, and it needs matching spec text the spec writer must supply (proposed
below).** Of the eight commands *System Space View Route and Data Fan-In*
promises stay invokable when the interior read fails — mine, sell, refuel,
hold, release, cut-drive, stop, jump — six genuinely are, and **two are not**:

- **Mine.** *Mine Offer on the Docked Fleet* requires "a feature carrying at
  least one visible resource" and a picker "limited to the docked feature's
  visible resource kinds." Resource kinds exist on exactly one wire surface,
  `fogFeatureDTO.Resources`, on the interior read. With that read failed there
  is no kind list, so the offer cannot be rendered at all — it is not
  "invokable," it is absent.
- **Jump.** *Jump Commit* resolves the lane id from "this system's own interior
  read's gate body … when the fleet is in this system, and the fleet's own read
  … otherwise." For a fleet in the open system — the common case — the
  specified source is the failed read.

**The resolution, and why this shape.** Jump collapses to **one** source: the
fleet's own read (`fleet-movement`'s *Fleet Read Serves the Attached Gate's
Lane Id*), unconditionally. It is corp-scoped, it settles, it is already
fetched by this view, it carries the id for a fleet attached to a gate in *any*
system, and it survives an interior failure. The interior read's gate body is a
redundant second source for the same value — and deriving gate identity from a
served list rather than from the acting fleet is the precise shape that took
four attempts to get right in `replace-observation-with-sightings`
(chain.md's *Restoring traversability took four attempts*). One source, always.

Mine is narrowed honestly rather than propped up: the offer depends on the
interior read, and the fan-in's promise is corrected to say so, rather than
inventing a cached-snapshot fallback whose staleness would be a second source
of truth about what a body contains.

**Alternatives considered.**

- *Serve resource kinds on the fleet read for the docked host.* Rejected for
  this change: it is a new wire field, so it belongs in the sibling additive
  change or nowhere, and it duplicates a body's composition onto a second
  surface — two definitions of one payload, which the contract rule forbids.
- *Fall back to the last successful interior snapshot.* Rejected: React Query
  already retains the last successful data, so "the read failed" and "we have
  stale kinds" are different states, and specifying mine against the stale one
  means specifying how stale is too stale, for a verb whose commit the server
  validates anyway.

**Delta text, now placed** (`system-space-view`'s *System Space View Route and
Data Fan-In*, replacing the scenario *A failed interior read leaves the
docked-fleet commands usable* and the bullet above it):

> - IF the interior read fails, THEN the view SHALL show an error state in the
>   canvas region — carrying the underlying error message when one is
>   available — and SHALL offer a retry affordance that refetches the interior.
>   The fleet roster and the `docked-fleet-actions` panel SHALL remain mounted,
>   and every command anchored to the acting fleet's own served state SHALL
>   remain invokable: sell, refuel, hold, release, cut drive, stop, and jump.
>   The mine offer SHALL NOT be shown, because the docked body's visible
>   resource kinds reach this view only on the interior read; its absence
>   SHALL be presented as a consequence of the failed read, alongside the same
>   retry, and never as "this body has nothing to mine."
>
> #### Scenario: A failed interior read leaves the fleet-state-anchored commands usable
> - **WHEN** the interior read fails while the acting fleet is attached to a
>   body
> - **THEN** the fleet roster and the `docked-fleet-actions` panel remain
>   mounted, and that fleet's sell, refuel, hold, release, cut-drive, stop,
>   and jump commands remain invokable
>
> #### Scenario: A failed interior read withdraws the mine offer without misreporting the body
> - **WHEN** the interior read fails while the acting fleet is docked to a
>   resource-bearing body
> - **THEN** the mine offer is not shown, and what is shown attributes its
>   absence to the failed read and offers the same retry — never a statement
>   that the body carries no resources

and in `system-space-view`'s *Jump Commit*, replacing the two-source clause:

> …submit a jump order for that fleet naming that gate's lane id, resolved
> from the acting fleet's **own read** (`fleet-movement`'s *Fleet Read Serves
> the Attached Gate's Lane Id*) and from no other source — never from the
> interior read's gate list, never from `GET /v1/galaxy`'s `links[]`, and never
> filtered by or derived from the corporation's charted-lane set. The fleet's
> own read carries the id for a fleet attached to a gate in any system and
> survives a failed interior read, so one source serves every case; a second
> source would reintroduce the class of defect in which the id is present on
> the surface the player is not looking at.

with its scenario *Invoking jump submits the attached gate's lane* (title
unchanged) re-GIVEN as "a fleet whose own read carries `laneId` for its
attached lane-gate body", its closing sentence re-anchored from "any gate the
interior read served" to "any gate a fleet's own read reports it attached to",
and one scenario added:

> #### Scenario: Jump still commits when the interior read has failed
> - **GIVEN** an own fleet attached to a lane-gate body in the open system and
>   a failed interior read
> - **WHEN** the jump command is invoked on that fleet's row
> - **THEN** a jump order is submitted naming the `laneId` the fleet's own read
>   carries, with no dependency on the interior read

### Decision 13: The two new capabilities are drawn at canvas-versus-panel, and the name under-describes one of them

**Taken: keep the split, and record what it actually is.** `system-space-view`
is *everything that needs the scene* — the route, the fan-in, selection,
picking, the camera, rendering, the preview overlay, and the two verbs whose
target comes from a pick (burn, and jump on a picked gate). `docked-fleet-
actions` is *everything the fleet panel can do from the acting fleet's own
served state*, with no scene and no selection. That line is real, it is the
line the renderer-unavailability requirements already depend on, and it maps
cleanly onto two React component subtrees.

**What the name hides, stated so nobody re-litigates it by surprise.** Three
members of `docked-fleet-actions` are not "docked" and not "fleet actions":
the hold/release controls act on an **orbiting** fleet (docking is irrelevant
to a station-keep park); the credit balance readout is **corporation**-scoped;
and *Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text* is a
**shared** module consumed by `system-space-view`'s burn and jump commands and
by `galaxy-view`'s *Jump Commit*. The capability is really "the fleet command
panel."

**Alternatives considered.**

- *Rename to `fleet-command-panel`.* Rejected only because the name is fixed by
  the orchestrator's binding ruling and the rename buys clarity at the cost of
  a second round of citation edits across three capabilities. Worth doing if
  the name is reopened for any other reason; not worth reopening it for.
- *Hoist the rejection-copy mapping into `fleet-roster`.* Rejected: it is
  consumed by three capabilities, not two, so any home is somebody's
  dependency. Leaving it where the ruling put it and stating the dependency
  explicitly is the cheaper honesty — and `add-scan-and-sightings-surface`
  needs the same module, so 8b must consume it rather than start a second copy.

### Decision 14: The client seams the new surfaces need, named — service methods and hooks

**Taken, because the layering is where this chain has lost verbs before.**
`frontend/CLAUDE.md` fixes the order component → hook → service → `apiClient`,
and `/check` carries a raw-`fetch` validator. Three of this change's surfaces
have **no existing seam at any layer**, and no task in `tasks.md` names one:

- `POST /v1/fleets/:fleetId/orders/preview` — `lib/services/fleet-service.ts`
  has `listMine`, `get`, `order`, `cutDrive`, `stop`, `jump`, `mine`, and no
  `preview`; `hooks/` has no preview hook.
- `POST /v1/fleets/:fleetId/hold` and `/release` — no service method, no hook.
  Note that `add-stationkeep-hold-verb` ships both verbs server-side with no
  client at all, so this change is the *only* thing that can give them one.
- The space view's realtime refetch — `hooks/use-board-realtime.ts` exists and
  is imported by exactly one module, `components/board/SystemBoardView.tsx`.
  Deleting `components/board/` (task 10.1) orphans it, and `hooks/` is outside
  every other deletion task's scope, so it survives as dead code unless named.
  (`lib/query-keys.ts` also names it in a comment, which is not an import.)
  Task 10.2 now names that deletion.

**Placed as tasks 4.1 (preview service method + hook), 7.9 (hold/release
service methods + hooks) and 10.2 (deleting the orphaned realtime hook).**
None of this is new design; it is the seam inventory, recorded because
`replace-observation-with-sightings` shipped `POST /v1/fleets/:fleetId/scan`
with no `fleet-service` method and no hook, and that is precisely why 8b exists
as a separate change today. `maxFuelTons` rides `order`'s existing request
type, and the served upkeep rate rides the existing fleet read type, so those
two need type widening rather than new seams.

## Inherited rulings, recorded for continuity

These are not decisions taken by this change. They were ruled upstream
(`handoffs/link8-rulings.md`, `decisions.md`) and are restated only so an
implementer does not have to reconstruct them.

- **Option B + D, Option C rejected.** The preview is a server round trip
  (`serve-orbital-elements-and-burn-preview`), render math lives under
  `frontend/lib/space`, and a true TypeScript kinematics mirror is rejected
  for this link with its cost measured: 2,340 lines / 79 functions of Go, a
  164 KB pinned `turn-table.json` that must index identically in JS,
  `fixtures/space/` re-recorded with a JS leg at bit fidelity, the anti-mirror
  map flipped to `pairs`, two spec deltas, and every FMA-guard shape in
  `burn.go`/`curve.go` reproduced operation-for-operation. **Trigger that
  reopens it:** previews measurably reading as laggy in play.
- **Atomic swap, not coexistence.** No flag, no dual path; the exit criterion
  is a Playwright journey against the real stack, because link 5's record shows
  a green suite and an end-to-end test through the real router are not, by
  themselves, evidence a human can perform the action.
- **Belt members are decorative and unpickable** (OQ-4). One belt is one
  pickable, mineable body. Serving members reopens the per-member-lode
  question; deriving them client-side is a mirror of `system` generation math,
  which the arm64 FMA history forbids. **This is the second time the
  per-member-lode deferral rolls forward** — inherited deliberately, not
  rediscovered.
- **A non-star position at the origin is omitted and logged** (OQ-3). On the
  lattice an unresolved position was simply absent; in R³ a zero vector draws
  the body on top of the star, which is worse than absence.
- **The point-in-space burn target is offered** (OQ-12). `space-kinematics`'s
  `ParkPoint` and half of *Targeting Names a Body or an Explicit Point* are
  otherwise unreachable from any UI. "Places are bodies" constrains
  *affordances*, not *positions*.
- **The PoC's gesture model is adopted** — primary-drag orbits, secondary-drag
  pans, wheel zooms. The default framing and the pan/zoom clamps are **not**
  decided (OQ-2).
- **The enforcement hole outside `lib/space` is recorded, not fixed.** The
  anti-mirror check scans `frontend/lib/space` only, so a rule-bearing function
  placed in `frontend/components/space/` passes every gate. Decision 1 fixes
  the case-sensitivity hole; this one — the directory-scope hole — stays open
  and is a stated, reviewed exception for this change.

## Risks / Trade-offs

- **The drawn burn position is knowingly wrong mid-flight** (Decision 1). It
  leads or lags the true position, coinciding at departure and arrival. This is
  visible if a player watches closely and is the accepted price of not building
  a mirror. It is safe only as long as nothing decides from it, which is why
  that constraint is a requirement rather than a note.
- **The directory-scope enforcement hole survives this change.** A future
  change can still place rule-bearing math in `frontend/components/space/` and
  pass every automated gate. Recorded, not fixed.
- **Atomic swap means no fallback.** If the new view is broken on some
  hardware, there is no lattice board to fall back to. Mitigated by the
  renderer-unavailability trio, which is specified precisely so an unusable
  canvas still leaves every own-state-anchored verb reachable — now including
  cut drive and stop, so a fleet is never uncommandable.
- **Rendering own fleets and contacts is a real behavioural reversal** of
  `board-view`'s post-link-4 "no fleet layer" state. Deliberate and necessary —
  the PoC's whole grammar is about rendering a ship — but it means this change
  touches more surface than a lattice-to-R³ re-skin would have.
- **`tasks.md` 10.11's `grep` is a frontend-only precondition, and link 9 needs
  more than it proves.** `backend/board` and `backend/polar` still have eight
  non-test production importers after this change lands: `system/generator.go`
  (footprints via `board.Schedule`/`board.Canon`/`board.RingCells`),
  `system/model.go` (`Feature.Footprint`), `system/service.go` (the stored
  interior's per-feature ring guard), `system/gates.go`
  (`board.LaneGateCell`), `system/fog.go`, `system/fog_source.go`
  (`board.StarOcclusionRadius2`/`PlanetOcclusionRadius2` — reachable today
  **only from tests**, a ninth instance of the chain's built-and-never-called
  shape and pure deletion material), `stations/placement.go`, and
  `stations/service.go`. The `grep` this change runs proves the *frontend* is
  clear, which is necessary and not sufficient; link 9's precondition also has
  to cover the backend importers, `fixtures/board/`, `fixtures/polar/`, their
  mirror-map entries, and the enforcement lists
  `pin-system-generation-determinism` catalogued. This is recorded, not fixed,
  because none of it is delta-reachable from this change's capabilities.
- **One of those backend tethers becomes invisible in this change.**
  `stations.FeatureOf` gates the station's presence in an interior read on a
  **lattice** range check — `board.ProductionSchedule()` and
  `st.Orbit.Ring <= sched.MaxRing` — omitting the station entirely when it
  fails. This change removes every lattice field from that response, so after
  it lands a station can still vanish from a system for a lattice reason with
  nothing on the wire to hint at it, and the M11 dock-then-sell loop goes
  unreachable exactly as it did once before
  (`replace-observation-with-sightings` blocker 5). Task 9.4's `grep` for
  production readers of the dropped fields is what should surface it; if the
  repair is deferred to link 9, defer it **by name** rather than by silence.
- **Six e2e suites reference board test ids**, not two. Two are deleted as
  lattice-specific and four are rewritten; a suite left un-rewritten is a
  green-looking gap over the exact journey the exit criterion depends on.

## Migration Plan

None. Per the project's ground rules this is a solo toy with no live users:
`board-view` is replaced outright, in one change, with no dual-write path, no
expand/contract, and no feature flag. The only two-step sequences are OpenSpec
mechanics — archive, then hand-delete the retired spec directory; archive, then
hand-edit four stale `## Purpose` sections — not data or traffic migrations.

**Two more post-archive hand-edits, not in any earlier draft.** The archiver
creates a brand-new capability spec with a placeholder Purpose — rehearsal
confirms both `openspec/specs/system-space-view/spec.md` and
`openspec/specs/docked-fleet-actions/spec.md` land carrying literally
`## Purpose` / `TBD - created by archiving change build-production-space-view.
Update Purpose after archive.` Link 4 shipped with exactly this left undone.
Both need a real Purpose written by hand after the archive.

**And one earlier-drafted hand-edit rests on a false premise.** A task proposed
hand-editing `space-kinematics`'s exemption clause inside *Every Rule-Bearing
Value of This Capability Is Computed Only in the Authoritative Implementation*,
on the grounds that it "names the now-deleted spike path." It does not: the
clause is written generically over `frontend/app/spike/`, and `audio/`,
`intel/`, `hex-board/` and `stealth/` all remain there, so the clause stays
true and needed. Only the `## Purpose` sentence names `space-3d` specifically,
and the Purpose is the part that is genuinely not delta-reachable. The clause
should be left alone (`tasks.md` 13.4 records that as a positive
confirm-and-do-nothing step, so the premise is not rediscovered). Where a
requirement body *does* need changing, it goes through a MODIFIED delta —
hand-editing `openspec/specs/` is what `add-stationkeep-hold-verb` recorded
losing a corrected formula to.

**One consequence of leaving the clause alone.** It requires the exemption to
be "stated in the capability's Purpose alongside the named path". So the
`space-kinematics` Purpose edit **repoints** the carve-out sentence at the
spike paths that survive rather than deleting it; deleting the only statement
of the exemption would leave that clause unsatisfied.

These `## Purpose` edits run **before** the `board-view` directory deletion
and its dangling-citation grep (`tasks.md` section 13 is ordered accordingly),
since two of them are what remove the last `board-view` citations the grep
looks for.

The four `## Purpose` sections are not delta-reachable (they sit outside any
`### Requirement:` block) and are corrected by hand after the archive:
`space-kinematics` (its `frontend/app/spike/space-3d` carve-out and its
`board-view`-citing sentence about a client-computed move preview),
`system-interior` ("a single star system's tactical polar board"),
`fleet-movement` (its `board-tactical-math` effective-state-fold sentence and
its reference to the deleted `observation-fog-and-scan`), and `fleet-roster`
("the system board view").

## Open Questions

Left genuinely open for Travis — recorded rather than answered by fiat:

- **OQ-1 — sticky picking / hover affordance.** Outer bodies move a long way
  between glance and click; the PoC's pick proxies are a fixed multiple of body
  radius. Whether to add hover highlighting, an orbit-track highlight, or rely
  on the pick radius alone is unresolved.
- **OQ-2 — the camera's default framing and pan bound in R³.** The PoC's fixed
  `camera.position.set(0, 110, 170)` and `board-view`'s lattice-sized clamps do
  not translate; a real default and bound need a specific system's scale to
  playtest against.
- **OQ-5 — contact refresh cadence.** How often a foreign contact's position
  should refresh independent of the baseline poll (distinct from the preview
  refresh cadence, which this change specifies qualitatively as bounded).
- **OQ-13 (new) — the burn quote's allowance factor** (Decision 6). The spec
  pins that there is one named client constant and that the resulting ceiling
  is displayed; its value needs play to choose, and choosing it by fiat here
  would be inventing a number.
- **OQ-7 — sighting visual aging** and **OQ-9 — where the sighting log
  mounts.** Both 8b's scope; recorded for continuity.

Also recorded, not re-opened: **OQ-8 (the Track rung)** — `sighting-records`
freezes position + velocity, not orbital elements, so the "predicts the target
forever" rung `README.md` and `/spike/intel` describe is unimplementable as
shipped; no change here widens the record, and `/spike/intel`'s
ghost-on-a-predicted-orbit cannot be graduated as-is. This is a
design-doc-vs-shipped-spec contradiction for Travis, not a question this change
answers. **OQ-6 (scan targeting)** is 8b's entirely, beyond noting that 8b's
target-list affordance must not collide with this change's point/body/gate
selection model.

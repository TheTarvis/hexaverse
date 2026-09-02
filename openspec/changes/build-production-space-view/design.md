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
a task (section 11), performed on a copy of the tree before the real archive,
and it checks three things `--strict` does not: that the archive succeeds with
a capability directory that has no delta, that no MODIFIED body silently lost a
scenario, and that no surviving spec is left citing `board-view`.

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
- **Six e2e suites reference board test ids**, not two. Two are deleted as
  lattice-specific and four are rewritten; a suite left un-rewritten is a
  green-looking gap over the exact journey the exit criterion depends on.

## Migration Plan

None. Per the project's ground rules this is a solo toy with no live users:
`board-view` is replaced outright, in one change, with no dual-write path, no
expand/contract, and no feature flag. The only two-step sequences are OpenSpec
mechanics — archive, then hand-delete the retired spec directory; archive, then
hand-edit four stale `## Purpose` sections — not data or traffic migrations.

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

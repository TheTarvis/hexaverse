## Context

`docs/plans/goods-market.md` (2026-07-30) is the accepted design; every
`**DECIDED**` line there is locked and is not re-litigated here. This
design.md carries its decisions forward, resolves the ambiguities it left
open (each recorded as an Open Question needing Travis's confirmation, per
the analysis that produced this change), and works through the forced
choices the existing code shape creates: `backend/fleet/model.go`'s `Cargo
map[string]float64` (a pattern this change deliberately does NOT repeat for
credits), `backend/system/dao.go`'s `CreateInterior` (a one-shot,
create-if-absent batch write with no add-a-feature path), `system.Feature`
(no owner field), `backend/common/tuning.go`'s `GameTuning` (pacing knobs
only, with a documented construction-time liveness caveat), and
`backend/action/`'s fold-of-deltas ledger (the pattern credits deliberately
deviates from, on the record, per the design doc's own words).

The resolving principle governs every requirement in this change: **bytes
move instantly, mass moves in a hold.** Credits, prices, listings are
information and transmit galaxy-wide with zero travel time; goods exist in
exactly two places (a fleet's hold, or — not yet, in M11 — a station's
storage) and a trade can only settle where they physically are.

## Goals / Non-Goals

**Goals:**

- A materialized, reconciliation-checked credit balance, mutated only
  through an idempotent, ledgered transaction.
- An NPC trading station at every spawn home, provisioned exactly once,
  visible without a scan.
- A static floor + data-driven premium-request demand model with the hooks
  a future pricing engine needs already landing in the ledger.
- A remotely-visible price board that makes "the spread" legible without
  arithmetic.
- An instant sell-from-hold verb, written against "the best standing demand
  at this venue" so M12's exchange can extend it without a rewrite.

**Non-goals** (deferred; do not build):

- **Dynamic pricing / inflation management.** v1 is a static floor table +
  data-driven requests. The ledger, the budget/absorption knobs, and credit
  sinks are the hooks a future pricing engine rides — not built here.
- **Player-built stations.** `ownerCorpId` exists from day one so this is a
  value change later, never a schema retrofit — no build verb ships.
- **Region hubs.** Spawn-home stations only; demand pattern (requests), not
  station placement, shapes traffic.
- **Station storage.** Goods sold to the NPC leave play. No unused storage
  field ships on the station doc — that would make "goods exist in exactly
  two places" untestable.
- **The buy side.** Nothing for a player to purchase until M12. Credits
  accumulate as the wealth axis.
- **The intel market** (`market.md`). Out of scope; M11 must not block it —
  the exchange machinery `goods-sale`/`market-price-board` establish
  (settle-against-standing-demand, remote quote visibility) is the shape
  M12's listings and the later intel market both ride, not a goods-specific
  dead end.
- **Jump-gate/toll mass networks, fuel, refining, the build verb.** Later
  arcs per `docs/plans/goods-market.md` and `BRAINSTORM.md`.

## Decisions

### 1. Credit representation: whole integer credits, floored proceeds — never `Cargo`'s `float64`

`fleet.Fleet.Cargo` is `map[string]float64` specifically because tonnage is
a continuous physical quantity and richness-derived yields are fractional
by nature. A credit balance is not that: it is a count of an indivisible
unit, and a `float64` balance invites exactly the class of bug `Cargo`
never has to worry about — accumulated binary-floating-point drift across
thousands of trades silently desyncing the "materialized total" from the
"true" total, undermining the very reconciliation invariant Decision 2
below exists to make testable. **`Corporation.Credits` is a signed 64-bit
integer** (whole credits; no minor-unit/cents subdivision — the design doc
never asks for fractional credits, and inventing a minor unit would be
premature precision). Every ledger entry's `Amount` field is the same
integer type, and `Corporation.Credits` is always exactly the type-checked
sum of `Amount` over the corporation's ledger (Decision 2's invariant).

The rounding question this forces: `goods-sale`'s proceeds are `tonnage
(float64) × unitPrice (integer credits per ton)`, a fractional product.
**Proceeds round DOWN to the nearest whole credit before crediting or
ledgering.** Direction matters for one reason, stated precisely (an earlier
draft also cited a "floor is a floor" rationale that had the direction
backwards — rounding down is what pays a hair *less* than tonnage × floor,
not more, so it cannot be what keeps the floor "firm"; removed): **M11
ships with no credit sink** (proposal.md's Scope caveat) — it is a pure
faucet — so rounding must never itself be an additional, uncontrolled
faucet leak across thousands of fractional-ton micro-trades. Rounding down
is the direction that never adds to that leak; rounding up would. That is
the entire justification. Reconciliation safety does not depend on the rounding
direction at all: the ledger entry records the exact, already-rounded
integer that was applied to the balance in the same transaction, never the
pre-rounding float — so the fold-equals-balance invariant holds by
construction regardless of which way rounding goes. Both facts are named
explicitly in `goods-sale`'s "Rounding Rule Preserves Reconciliation"
requirement, so a future refinement can change the direction without
breaking the invariant the requirement actually needs.

**Rounding applies per-portion, not to the total — pinned explicitly so
preview and settlement can never disagree.** A split-fill sale (request
portion + floor portion, see Decision 17) computes two fractional products,
not one; rounding each portion down separately before summing, rather than
summing the exact fractional total and rounding once, is the rule this
change ships (splitting a request-priced portion from a floor-priced
remainder is itself a per-portion operation, so rounding follows the same
granularity). This loses at most one whole credit per portion rather than
per sale, which is the more conservative (smaller) leak of the two
options, and it is the number `goods-sale`'s response and
`market-board-panel`'s proceeds preview both compute against — pinned by
the shared `fixtures/market/cases.json` golden (Decision 22) so the two
stacks cannot silently diverge on which rounding granularity they used.

**A hold fraction can still price to zero credits, and that is rejected,
not silently accepted.** Because `Cargo` is `float64`, a fleet can hold a
sub-ton fraction (e.g. 0.4 t) whose proceeds at a low floor price round
down to zero. `goods-sale`'s "A Sale Whose Proceeds Round To Zero Is
Rejected" (Finding R5) closes this: a sale whose total proceeds round to
zero whole credits is rejected outright rather than debiting cargo for
nothing in return.

*Alternative considered:* `int64` "minor units" (credits × 100, à la
currency cents), for future sub-credit pricing precision. Rejected — the
design doc's numbers ("+40% two lanes over") are whole-credit-scale
already, minor units solve a problem nobody has yet, and it doubles every
requirement's numeric examples for no present payoff. Revisit only if a
future feature genuinely needs sub-credit prices.

### 2. Materialized balance vs. the #0005 fold — a recorded, tested deviation, not a "fix" target

`action-dispatch`'s house pattern is "Additive Ledger Fold, No Materialized
Total" — by design, on the theory that a materialized total drifts from its
ledger. Credits are the one deliberate exception, and the design doc says
exactly why: *"This is a deliberate deviation from the fold-of-deltas house
pattern (#0005): a credit balance accrues entries forever, so folding every
read doesn't age well. The ledger is the record; the balance is the
truth."* (`docs/plans/goods-market.md` → Currency.) A mine lode's ledger is
bounded by construction (`MinRunTons` × a configured ceiling — see
`mine-extraction`'s Decision 18 lineage); a corporation's credit ledger is
not and cannot be — every trade a corporation ever makes, for the life of
its account, appends one more entry, and a live corporation folds it on
every single balance read if the balance itself is the fold. That does not
age well; the design doc is right to reject it.

**This is why `corporation-credits`' "Ledger-Balance Reconciliation
Invariant" requirement exists**: the deviation is safe exactly as long as
the fold and the stored balance provably agree, so the invariant is not
decoration — it is the thing that makes "the ledger is the record; the
balance is the truth" an operationally checkable claim rather than a
comment nobody verifies. **Do not "fix" this by converting the balance
back to a per-read fold** — that reintroduces the exact read-time cost
scaling problem the design doc rejected, on the one entity in the system
guaranteed to have the least-bounded, longest-lived ledger of them all. If
a future divergence is ever found, the fix is a bug in the mutation
transaction (Decision 7 below), not a rearchitecture of the balance model.

### 3. Why trades don't ride `action-dispatch` — and the idempotency consequence

Every existing mutating verb on the spine (burn, lane travel, scan, mine)
has one thing in common credits do not: **elapsed time is the mechanic.** A
burn's ETA is the point of the verb — you commit, time passes, and the
world is different when it resolves. Mine's design.md is explicit about
this too (Decision 5, "Point-at-ETA"): the run's duration is not
incidental, it's what "mining" means. A sale has no such duration. The
matter is already sitting in the hold — the time cost of getting it there
was paid by the haul, which is *itself* a #0005-riding verb (the burn/lane
trip that got the fleet to the station). Once docked, converting held
tonnage into credits is a state transition on already-present matter
against an already-known price; inventing an ETA for it would be inventing
elapsed time the design doesn't have. `docs/plans/goods-market.md` is
explicit: *"Selling from your hold while docked is instant... Credit
transfer is instant (data, not mass)."* So `goods-sale` and every
`corporation-credits` mutation settle synchronously inside their triggering
HTTP request — no action, no channel slot, no ETA, per `corporation-credits`'
"Credits Are Instant and Location-Independent" and `goods-sale`'s "Instant,
Not an Action."

**The consequence, which the design doc is silent on and this change must
supply:** every mutating verb on the action spine gets its retry-safety for
free from `action.Commit`'s atomic slot claim (`ErrActiveActionExists` on a
retry — see `mine-extraction`'s "A retried commit after a lost response
fails closed"). A sale claims no slot, so it inherits none of that.
Idempotency has to be engineered explicitly, or a client's ordinary
retry-after-a-lost-response becomes a double sale. Decision 7 below is that
engineering.

### 4. How a station becomes a board feature — and why it orbits

Two shapes were on the table for the store: (a) an extra feature doc
spliced into an already-materialized system's `features` subcollection, or
(b) a wholly separate store, projected in at interior-read time.

**Chosen: (b), a separate store.** `system.dao.go`'s `CreateInterior` is a
single atomic batch write, keyed by a create-if-absent claim on the
`interior/meta` doc — it assumes the *entire* feature set is known and
written together, once, at first materialization. There is no "add one
more feature to an already-claimed interior" path, and inventing one is
worse than it looks: a system's interior may already be materialized
before any corporation ever spawns there (M8's arrival trigger, or a
passing scan, can materialize a system's interior long before it becomes
anyone's home), so "write the station as part of generation" doesn't even
have a well-defined single moment to run at. Retrofitting `CreateInterior`
into a two-phase claim (claim the meta doc; separately, idempotently,
add-a-feature-if-the-station-doesn't-exist-yet) reopens the one
atomic-claim invariant that keeps concurrent first-explores from
double-writing, for a feature type `system` has no business knowing is
owned by a corporation at all — `system.Feature` has no owner field, and
giving it one means `system` importing corporation-ownership concepts,
which is exactly the cross-domain layering `backend/CLAUDE.md` rules out
(a DAO/model is private to its owning domain).

So a station lives in its **own store**, owned by the new
`trading-station` capability: one doc per system
(`galaxies/{gid}/systems/{sid}/station/meta` — mirroring the interior's own
`interior/meta` singleton-doc shape, so the claim discipline is familiar,
but a *distinct* subcollection `CreateInterior` never touches), carrying
`OwnerCorpId` (empty = NPC) where it naturally belongs — on the entity that
actually has an owner.

**The splice point is `GetOrCreateInterior` itself, ungated — corrected
twice now, and the second correction reverses the first.** The original
draft spliced the station in at the system-interior HTTP handler; that was
wrong because `fleet.resolveFeature` (used by both `Order`'s
`dockOnArrive` and `Position`'s docked-fleet resolution) reads
`GetOrCreateInterior` directly, never through the handler. The first
correction moved the splice into `system.Service.GetOrCreateInterior`
itself — but verified against the actual signature
(`GetOrCreateInterior(ctx context.Context, systemID string)`,
`backend/system/service.go:49`), that function **takes no requester and no
corporation id**. It cannot apply a per-requester visibility gate, and
neither can any of its other callers, none of which carry a requester
either: `mine/service.go:154` (is this feature id a station, for the mine
rejection); `fleet/service.go:203` (arrival settlement, which runs under
the OIDC-verified sweep `POST /v1/push/action-sweep`, where there is no
requester at all); `fleet/service.go:601` (`resolveFeature`, Order AND
Position). Gating *this* seam on the observer's tier is simply not
constructible — there is no observer at this seam.

**Corrected: the splice into `GetOrCreateInterior` is structural and
ungated — every caller sees the station whenever one exists for that
system, full stop.** The visibility gate (`market.Params.MinVisibilityTier`)
is applied only at the requester-scoped *read* surfaces that have a
resolved requester to gate against: `system.Handler`'s HTTP interior read
(filters the spliced station out of the response below-gate), the direct
`GET /v1/systems/:systemId/station` read, `market-price-board`'s read, and
`goods-sale`'s own sale-time resolution. Every other consumer —
`Order`/`dockOnArrive`, `Position`, the mine-command station-rejection
lookup, and arrival settlement under the sweep — resolves the station
structurally, gated by nothing, exactly like every other feature those
call sites already handle. This is not a security gap: a foreign fleet's
audience fog (`fleet-movement`'s unmodified "Fleet Read Endpoints and
Audience Fog") already hides a foreign fleet *entirely* — id, position,
everything — unless it is inside the requester's live sensor coverage; a
docked position resolving successfully server-side, for a fleet the
requester cannot even see, discloses nothing. And a fleet that *is* inside
live sensor coverage is redacted to a mode+position snapshot regardless —
the requester learns "something is docked here," never that it is
specifically a station, from `Position` alone; that disclosure is still
owned entirely by the gated read surfaces above.

**This closes the fog-domain risk the first correction opened.**
`backend/system/fog_source.go`'s `Features` method **is**
`observation.InteriorSource` — the exact feature list a scan resolves
line-of-sight and mints reveals against (`Scan Resolution Mints the
Reveal`: "mint a board-tier feature observation for every feature in the
origin system with clear line of sight"). An ungated splice at
`GetOrCreateInterior` alone would have made a scan mint a station
observation, falsifying Decision 5's "no reveal writer mints anything for
a station" and proposal.md's "Not affected: `observation-fog-and-scan`."
**`fog_source.Features` explicitly excludes the station feature type**
before mapping `gen.Features` into `observation.FeatureGeom` — the station
contributes no occluder geometry and is never a candidate for a
scan-minted observation. This exclusion is the actual mechanism Decision 5
depends on; it is now a stated, testable requirement
(`trading-station`'s "Station Excluded From the Fog/Scan Feature Source"),
not an assumption.

**A docked fleet's position never depends on the station store being
reachable.** `Position`/`resolveFeature`'s ordinary path looks the docked
`ParentId` up in `GetOrCreateInterior`'s projected features, which does
require a station-store existence check (not every system has one). But a
fleet already `docked` to a station got that way through a prior `Order`
that already confirmed the station exists — existence is not in question
again on every subsequent read. Since the station's geometry (ring, angle0,
period, direction) is a pure, deterministic function of the system id and
the live galaxy's seed — both non-volatile and available in-process, no
store read (this decision's placement rule) — **`Position` resolves an
already-docked-to-station fleet's live position by recomputing that
deterministic orbit in-process, never by re-reading the station store** —
so a station-store outage degrades new dock orders and fresh interior
reads (per "Station-Store Read Failure Degrades, Never Blocks the Interior
Read") but never an already-docked fleet's ordinary position resolution,
which is by far the more common, more critical read.

*Alternative considered:* extend `system.Feature` with an optional
`OwnerCorpId` and add a second, racier "add-if-absent" write path into an
already-claimed interior. Rejected for the layering violation above, and
because it forces every consumer of `system.Feature` (the generator, the
fog source, the mine resolver's feature lookups) to reason about a field
that means nothing to them.

**Orbiting, not fixed — reversed from an earlier draft of this decision.**
The earlier draft justified a fixed (non-orbiting) station partly on
"avoiding orbital computation." That justification is factually wrong:
`backend/fleet/service.go`'s `Position` already branches
`if orb := featureOrbit(feat); orb != nil { return board.OrbState(*orb,
now), nil }` for any feature carrying orbital elements — an orbiting
station costs **zero new code** at that seam, only orbital elements
(ring/angle0/period/direction) generated deterministically from the system
id and the live galaxy's seed alongside the station's placement (Decision
4's other placement rule), the same discipline
`corporations.Service.rimHex`'s account-seeded pick already uses. The
direction is not an independent roll: it equals the system's dominant
orbital direction (`system-interior`'s "Coherent Orbital Direction";
confirmed by Travis 2026-08-24), computed as a pure function of the
per-system seed — a station orbiting against its own disk in half of all
systems would be the same unmotivated physics exception the fixed-station
reversal below removed. **Corrected: the station orbits**, keeping the game's world
feel consistent — every other board feature orbits or coasts; a fixed
station would be the one physics exception with no mechanical reason to
be one. Burn-intercept math against an orbiting station rides the same
lead-solve branch `fleet-movement` already exercises for any orbiting
feature; no new intercept case is introduced. This reverses the earlier
"fixed, not orbiting" call — recorded explicitly in Open Questions below
so Travis sees it as a world-feel decision, not a silent implementation
detail.

*Alternative considered:* a fixed (non-orbiting) station, on the theory
that nothing in this version gives it a reason to move (no combat, no
positional play around it). Rejected once the "avoids orbital computation"
justification was shown false — the orbit costs nothing at the seam that
matters, and a fixed anchor is the one thing on a board that doesn't drift
or orbit, which reads as a physics exception rather than a deliberate
choice. Revisit only if a future feature needs the station to be
provably, permanently unintercept-able (this version does not need that).

### 5. How a station escapes fog omission

`system-interior`'s three-band projection omits any detail feature that is
neither currently sensor-visible nor remembered from a past scan — a naive
station would be invisible until someone scanned it, which directly
contradicts the design doc's DECIDED starter loop ("mine → haul → dock →
sell exists in-system from the first minute").

**Chosen: a station's inclusion is governed by its own graph-tier
visibility rule, not by minting a spawn-time feature observation.** A
station is an artificial structure broadcasting its own existence (an
"active transponder," per the analysis this design carries forward) — its
presence is already public information at the price board's tier, which is
a graph-tier (rumored/explored) concept, not a sensor-coverage (ambient
bubble / scan echo) concept. So `trading-station` owns a single rule,
"Home Station Visible On First Board Read, No Scan Required": a station
splices into a system's board read whenever the requester's *graph* tier
for that system is at least the configured minimum visibility tier (the
same tier `market-price-board` gates on, Decision 6) — independent of
sensor coverage entirely. Since spawn already writes a corporation's home
system to `explored` (`corporation-spawn`'s unmodified "Home-Only Initial
Fog, No Lanes Charted"), and `explored` clears any sane configured minimum
(defaulted to `rumored`), the home station is visible on the very first
board read with zero scan involved — exactly the "no scan required"
requirement — while a foreign system merely glimpsed on the galaxy graph
(`starVisible`, the free baseline) does not yet disclose its station.

This keeps `observation-fog-and-scan` completely untouched — and, per
Decision 4's fix, that claim is now backed by a stated mechanism rather
than an assumption about the splice: `fog_source.Features`
(`observation.InteriorSource`) explicitly excludes the station feature
type, so no reveal writer mints anything for a station and it contributes
no occluder geometry, `RevealArrival`'s existing behavior is unchanged,
and `system-interior`'s three-band rule is touched only to the extent of
stating that it does not govern this entity (its MODIFIED delta adds
exactly that clarifying clause, restating its five existing scenarios
verbatim).

*Alternative considered:* mint a station-presence observation at spawn
(`RevealArrival` extended to also write a permanent feature-level
observation for the home station). Rejected — it re-opens
`observation-fog-and-scan` for a concept (graph-tier, public-transponder
visibility) that isn't a sensed/remembered fact at all, complicates the
"home-only, no lanes" invariant that requirement is named for, and would
need its own bespoke monotonicity story for a *foreign* corporation's
station discovered via later travel/scan — where the tier-based rule
already generalizes for free (a system's tier only ever rises, so a
station's visibility, once earned, is never lost — the same monotonic
ladder `observation-fog-and-scan`'s graph tiers already guarantee, reused
rather than duplicated).

### 6. Price-board visibility tier — and the home-beacon consequence

`market-price-board`'s aggregate read is gated by a configured minimum
graph tier, `MarketParams.MinVisibilityTier`, defaulted to `rumored` —
directly following `system-interior`'s existing "Charted Lane Gate
Filtering" precedent (a lane's gate ships only once its destination clears
`rumored`). This is the SAME tier `trading-station`'s own splice rule
reads (Decision 5), so the two surfaces never disagree about which
stations are "known."

**Risk this creates, which the design doc never names:** because every
spawn home gets a station (DECIDED), and because reaching `rumored` on a
system is cheap (one scan of an adjacent system rumors its lane
neighbours — `observation-fog-and-scan`'s "Scan Resolution Mints the
Reveal"), the aggregate price board becomes, over a session, a running
directory of *where every active corporation woke up* — not by name, but
by coordinates-with-a-station-on-them. A single station-bearing system
showing up on the board is a strong signal that some corporation calls it
home, since this version places stations nowhere else (`trading-station`'s
"Stations Exist Only At Spawn Homes"). This is an acceptable v1 trade-off
(the whole mechanic is "prices pull you across the map," which requires
remote visibility by design) but is worth Travis's eyes: it is a soft,
incidental form of player-location disclosure the design doc's remote-
visibility rationale didn't anticipate. Recorded in Risks below; not
mitigated in this change.

**A second, distinct leak this same tier gate does NOT close: live
request quantities are a dynamic activity channel, not just a static
beacon.** An earlier draft of `market-price-board`'s "No Disclosure Beyond
Market Data" claimed the surface discloses nothing "beyond what the
requester's existing fog already grants." That claim is false as
specified: exact, live per-request remaining quantities let any observer
at `rumored` — one scan away, zero travel — poll the board and read off
whether a rival corporation is alive and actively playing, its
approximate hauling throughput per hour (remaining-quantity deltas over
time), which resource kinds it favors, and roughly when its fleet is
docked at home (quantity stops moving) — none of which costs a scan, a
sensor bubble, or a tile of travel, which is precisely the cost
`observation-fog-and-scan` exists to impose on everything else. This is
strictly cheaper for an attacker than the static home-beacon above (that
one at least requires reaching `rumored`; this one is free reconnaissance
once there). The fix considered — coarse availability bands (e.g., "high
/ medium / low / none") instead of the exact figure — was evaluated and
explicitly NOT adopted for this change: exact quantities are load-bearing
for the UX moment the design doc is built around ("40 t left at +40%" is a
materially different travel decision than "some left at +40%"), and
disclosure granularity was never DECIDED either way in the source design
doc. **Decision: ship exact quantities; correct the false "nothing beyond
existing fog" claim to honestly name this exception; record both the
static beacon (this section) and this dynamic activity leak as named,
accepted risks; and put the coarse-band mitigation to Travis as an Open
Question, not resolved here.**

### 7. Idempotency key scheme

`corporation-credits` and `goods-sale` both require a **client-supplied
operation key**, following `action-dispatch`'s own precedent almost
exactly: the exactly-once ledger entry for a credit mutation uses the
operation key as its own document id (`corporations/{corpId}/ledger/{operationKey}`),
the same "doc id doubles as the dedup anchor" trick `deltas/{scope}/entries/{actionId}`
already uses (there, the anchor is the server-frozen action id; here, since
there is no action and therefore no server-frozen id, the client must
supply one). A repeat call with an already-used key is answered from the
existing entry — read it, return its recorded result — rather than
re-executing the mutation; the settlement transaction's own ledger-entry
write is itself a create-if-absent, so two concurrent retries with the
same key can race safely (one wins the create, the other reads the
winner's result). A spawn's one-time opening grant (Decision 14, Migration
Plan) uses a *derived*, not client-supplied, key (`"spawn:" + corpId`) —
appropriate because that mutation is itself triggered by an idempotent,
corp-id-keyed call (`Spawn`/asset-healing), not by a client action a
network retry could duplicate under a fresh key.

*Alternative considered:* a server-issued idempotency token, minted on a
separate "intent" call and redeemed by a second "commit" call (a two-phase
handshake similar to a payment provider's charge API). Rejected — it adds
a round trip and a stateful intermediate for no benefit this game's client
shape needs: the client already knows, at the moment it calls sell, that
this is a fresh user action (a button press), so it can generate its own
key (a UUID) with no server round trip.

**The requirement text is now pinned to this scheme, closing an escape
hatch a security review found.** An earlier draft of
`corporation-credits`' "Idempotent Credit Mutation By Operation Key" said
the ledger entry is keyed by the operation key "or an equivalently
unique, checkable anchor" — vague enough to permit a global
`tradeOperations/{key}` keyspace instead of the per-corporation
`corporations/{corpId}/ledger/{operationKey}` scheme this decision always
specified. A global keyspace lets one corporation's client-chosen key
collide with another's (attacker-squatted or accidentally identical), so
a victim's mutation becomes a no-op returning the squatter's — or the
squatter's own replay reads the victim's — recorded result, including
`resultingBalance`. **Corrected: the requirement now states the
per-corporation scoping as the only anchor, with no escape-hatch
phrasing.** Three more gaps the requirement left open, now closed
alongside it:

- **Format is now constrained**: 16–64 characters, `[A-Za-z0-9_-]` only,
  rejected with `400` before any read — closing an unvalidated-external-
  input-as-Firestore-doc-id path (`""` → nil `DocumentRef` → panic;
  `"a/b/c"` → path injection; a 1 KB key → storage amplification).
- **The reserved-prefix namespace is now enforced, not just documented**:
  a caller-supplied key beginning with `spawn:` (this decision's own
  server-derived opening-grant key) or any other future server-reserved
  prefix is rejected outright, so a client can never squat, read, or
  suppress a server-derived idempotency anchor — proven reachable today
  (`spawn:<own corpId>` permanently suppresses one's own opening grant),
  which means every *future* server-derived key (a refund, an admin
  adjustment, an M12 escrow release) would have inherited the same hole
  unless closed at the format level now.
- **A replay now requires a fingerprint match, not just a key match**: a
  reused key naming different sale parameters (fleet, kind, tonnage,
  station) than the entry recorded under it is a conflict, rejected
  outright — not answered as if it were a legitimate replay of a
  different request.

### 8. Trade ledger growth is unbounded — and stays that way, deliberately

Mine bounds its per-lode ledger by construction: `MinRunTons` plus a named
ceiling caps the worst-case delta count any single, finite lode can ever
accumulate (`mine-extraction`'s "Minimum Mine Run Size Is Bounded By Lode
Tonnage"). **The credit ledger has no equivalent bound, and cannot be given
one that means anything**: a corporation can trade again next tick,
forever, for the life of its account — there is no finite "startTons" to
divide by a floor. A minimum sale size would only add friction to
legitimate small trades; it would not cap the ledger's eventual size the
way `MinRunTons` caps a *specific, finite* lode's. **Decision: `goods-sale`
ships no minimum sale size** (only "positive, finite, not exceeding held
tonnage" — no floor), and the growth-bound strategy lives entirely on the
**read side**, not the write side.

Since the materialized balance means ordinary reads (a player checking
their balance) never fold the ledger at all — that is the entire point of
Decision 2 — the only place the ledger's unbounded size is ever paid for
is the reconciliation check (`corporation-credits`' "Ledger-Balance
Reconciliation Invariant"). That check **must not** be a full, unbounded
transactional fold the way mine's commit-time courtesy check is (mine's
fold is safe only because Decision 18's ceiling bounds it) — a credit
ledger has no such ceiling. **The reconciliation check runs a
checkpointed, windowed fold**: it folds only entries appended since the
last confirmed checkpoint and compares
`checkpointBalance + fold(newer entries) == currentBalance`, advancing the
checkpoint on a clean match — never a from-genesis fold of a corporation's
entire trading history. This is a read-strategy commitment, not a numeric
one; the checkpoint cadence and the "how many entries counts as a window"
are implementation/tuning questions, same status as mine's tuning numbers.

**Corrected: the checkpoint cursor cannot be `{asOfBalance, asOfEntryId}`
as originally drafted.** Per Decision 7, a ledger entry's document id IS
the client-supplied operation key (a UUID) — it carries no chronological
ordering whatsoever, so a query bounded by "entries after this doc id"
cannot mean "entries after this checkpoint in time." **The cursor is a
compound, stable ordering instead: world time, then a tie-broken document
identity** (needed because more than one entry can legitimately share a
world-time tick), so the windowed fold never skips or double-counts a
same-tick entry at a checkpoint boundary.

**DBA-flagged scope limit, stated explicitly so it is never
over-relied-on:** this invariant reconciles a corporation's own stored
balance against its own ledger fold — nothing more. `ApplyCredit`'s
internal transaction keeps those two mutually consistent *within* one
corporation by construction, which means every corruption mode
`goods-sale`'s cross-domain settlement transaction (Finding C1) could in
principle produce — cargo debited with no matching credit, or a request
decremented with no matching ledger entry — leaves a corporation's own
balance/ledger perfectly self-consistent. Reconciliation reports clean in
every such case. **This invariant is not, and must not be treated as, a
correctness backstop for `goods-sale`'s cross-domain settlement** (fleet
cargo, NPC request quantity); those effects are outside this fold's scope
by construction, and the correctness guarantee for *that* surface is
Decision 16's single settlement transaction, not this reconciliation
check. A full, genesis-to-now fold remains available on demand (not
windowed) for when a windowed check itself is suspected unsound.

### 9. Rate-limit tier for the new trade endpoints — general-tier IP limit stands, but it is not the only control

`request-authorization`'s strict tier (20/min/IP) exists specifically for
credential/enumeration-sensitive surfaces (account creation, account
self-lookup, account profile lookup, corporation spawn) — a materially
different threat model from an active trader hitting the sell endpoint
repeatedly during ordinary play. `goods-sale`'s sell endpoint is, in every
way that matters to rate limiting, the same shape as the already-general-
tier `orders`/`cancel`/`scan` fleet command endpoints: an authenticated,
ordinary-gameplay mutation with no credential/enumeration surface. **The
general 600/min/IP tier applies to the whole authorized group and stays
the right tier for this surface** — no route in this change joins the
strict tier. (The strict tier's 20/min ceiling would in fact be too tight
for a trader working a spread across several stations in one session —
exactly the scenario named in the adjudication brief — reinforcing that it
is the wrong tier here, not merely an unnecessary one.)

**Corrected: this change DOES emit a `request-authorization` delta, and
proposal.md's earlier "Not affected: request-authorization" claim was
wrong.** The general per-IP tier is not a sufficient control on its own
for a money-mutating endpoint, for a reason the baseline spec itself
documents: `request-authorization`'s own "Fixed-Window Rate Limiting, Two
Tiers" requirement records, as a named, current defect, that the limiter
is keyed on `ClientIP()` with no trusted-proxy configuration (a spoofed
`X-Forwarded-For` obtains a fresh bucket per request) and is per-instance,
not service-wide (Cloud Run's autoscaling multiplies the effective
ceiling by instance count). A rate limit whose own spec admits it doesn't
reliably bound one caller is not a control a credit-mutating endpoint
should rest its only quota on. **Decision: add a second, orthogonal
control that the IP-spoofing defect cannot touch — a fixed-window quota
keyed on the requester's server-resolved corporation id
(`common.ActorCorp`, which no client-controlled header influences)**, on
every credit-mutating route. This is additive to, not a replacement for,
the existing per-IP tiers (`request-authorization`'s two-tier requirement
is left completely unmodified — restated nowhere, only added to), and it
is scoped narrowly to routes that mutate a balance, so it does not tax
`orders`/`cancel`/`scan` or any other ordinary command endpoint. See the
new `request-authorization` ADDED delta, "Per-Corporation Write Quota on
Credit-Mutating Routes."

### 10. Where the new knobs sit relative to `GameTuning`'s liveness caveat

`common/tuning.go`'s own doc comment draws the line precisely: `GameTuning`
is for **pacing** knobs on a *running* world that an operator would
plausibly hot-retune (`MsPerTile`, `ScanDuration`); world-*generation* and
*rules* params (`galaxy.GenerationParams`, `corporations.SpawnParams`,
`mine.MineParams`) are baked in at seed/spawn/commit time and stay in their
own domain's `params.go`, explicitly exempt from the hot-retune promise.
Every new knob this change introduces — the starting credit grant, the
per-region floor table, the request-provisioning bands (premium, quantity,
lifetime, cadence, concurrent count), and the NPC budget/absorption limits
— sits on the **`params.go` side of that line, not `GameTuning`'s**. This
follows directly from Decision 6 of `docs/plans/goods-market.md`'s own
"Pricing never responds to trade activity" non-goal (restated as
`npc-market-demand`'s own testable requirement): if pricing is not supposed
to move in response to anything happening in a running world, it is by
definition not a knob an operator plausibly hot-retunes mid-session either
— it is closer to `mine.MineParams`' richness-curve than to
`common.Tuning().ScanDuration`. A new `market.Params` struct (mirroring
`mine.MineParams`'s and `corporations.SpawnParams`'s shape: one struct, one
`Default*Params()` constructor, read at service construction) holds all of
it. Consistent with the caveat either way: even a value that *did* live in
`GameTuning` would not reach an already-registered resolver without a
process restart — and `market.Params`-holding services capture it at
construction exactly like `mine.MineParams`-holding ones do today, so this
is not a new limitation, only a correctly-placed one.

### 11. NPC budget/absorption: unlimited value, specified (reject-in-full) binding behavior

Constraint 6 requires the budget/absorption hook to be *testable*, not
merely present — an "unlimited" knob that silently no-ops when finite would
be dead code wearing a config field. **When a station's configured budget
(credit spend ceiling) or absorption (tonnage-bought ceiling) for the
current window would be exceeded by a floor-priced sale, the entire sale
is rejected — never partially filled for this reason.** This is
deliberately the opposite of the request-vs-floor split
(`goods-sale`'s "Applied Price Reported, Split Across Request and Floor"):
that split exists because there is a genuine *second buyer* to fall back
to (the floor, once a request's remaining quantity is exhausted) — a
natural, meaningful partial fill. An exhausted budget/absorption ceiling
has no third buyer behind it; there is nothing sensible to partially fill
into, so honesty requires rejecting the whole request rather than
inventing a fractional, buyer-less "clamp." This version's shipped value
for every station's budget and absorption limit is unlimited, so the
reject path is unreachable in play — exercised directly in tests via a
fixtured finite value, exactly the way `mine-extraction`'s `holdFull`
clamp stays specified and tested while structurally unreachable through
any verb this change ships (see the `mine-extraction` MODIFIED delta).

**Storage shape, pinned to avoid repeating a known Firestore SDK panic.**
Per-window budget/absorption consumption is tracked as new station-doc
state (e.g. `station.WindowSpend map[string]int64` /
`station.WindowAbsorbed map[string]float64`), keyed by the **string form**
of `system.ResourceKind` — never the named type itself. This is not a
style preference: `fleet.Cargo`'s own doc comment
(`backend/fleet/model.go`) documents a Firestore SDK transform-extraction
reflection panic on a map field keyed by a named string type, and a
per-kind consumption tally is the exact shape (`map[ResourceKind]...`)
that would repeat it verbatim if an implementer reached for the "natural"
typed-key map. Every other map-typed field this change introduces (the
per-region floor table, per-kind absorption limits, per-kind request
quantities) follows the same string-keyed rule. This field is registered
in `common.CleanupFirestoreTestData()` alongside the station
subcollection.

### 12. Request provisioning mechanism — lazy, read-triggered, epoch-seeded

The design doc's biggest silence: who writes NPC request entries, when,
how many, and with what bands. **Mechanism, not numbers:** provisioning
runs lazily, triggered by a read that touches a station's quotes (a
station read, the price-board aggregate, or a sale that consults current
demand) — following the exact house convention `system.GetOrCreateInterior`
and `action-dispatch`'s "resolution happens opportunistically whenever any
read touches it" already establish, rather than introducing a new
scheduled job (no new Terraform, no new Cloud Scheduler entry). A
provisioning attempt is keyed by `(stationId, epoch)`, where an epoch is a
coarse, deterministic time bucket (e.g., a fixed world-time window); the
write is a create-if-absent against that epoch's provisioning claim,
mirroring `system.CreateInterior`'s atomic claim discipline, so concurrent
readers that each trigger provisioning for the same station/epoch converge
on one set of requests, never two. Within a claimed epoch, the concrete
requests minted are a deterministic function of `(stationId, epoch,
worldSeed)` — the same "account-seeded pick" discipline
`corporations.selectSpawnSite` already uses — so re-deriving is never
needed and there is nothing to store beyond the resulting request set
itself.

**Price-board fan-out read strategy, pinned:** `market-price-board`'s one
read aggregates every visible station's quotes. This is implemented as N
point-reads (one per visible station, fanned out from the requester's
already-resolved visible-system set), not a `collectionGroup` query across
all stations — the visible set is bounded by the requester's own graph
tier per read, and a point-read-per-station needs no new composite index.
If a future change moves this to a `collectionGroup` query instead, that
change must declare the required composite index in
`infra/terraform/firestore-indexes.tf` and flag it for `terraform apply`,
per house convention. The implementer confirms during the build that
neither this read nor the reconciliation windowed-fold query (Decision 8)
requires a new index beyond what's already declared.

**Named knobs** (`market.Params`, numbers deferred — see Open Questions):
which stations receive requests (v1: every station, since v1 has only
spawn-home stations), the concurrent open-request count per station, the
eligible resource kinds, the premium band above that station's floor, the
quantity band, a request's lifetime before it expires unfulfilled, and the
regeneration cadence (a floor on how soon a filled/expired slot may be
replaced, so demand doesn't refresh instantly and trivialize the "haul
before it's gone" tension the design doc's demo depends on).

### 13. A kind with no configured floor for a region is not tradable there, not priced at zero

Four regions (`galaxy-generation`'s region classification) × six
`system.ResourceKind`s means a sparse or incomplete floor table is a live
footgun, not a hypothetical — a silent gap must not resolve to "sells for
0" (a value that would pass every numeric validation while being
economically nonsensical) or to some inherited/interpolated price (which
would itself be a pricing engine, the exact thing constraint 6 rules out).
**Decision: a `(region, kind)` pair with no configured floor entry means
that kind is simply not tradable at any station in that region** — a sale
naming it is rejected with a distinguishable reason, symmetric with every
other "this isn't sellable here" rejection `goods-sale` already reports.

### 14. Migration: one mechanism resolves both open gaps

Two migration questions were raised (existing corporations with no stored
balance; existing spawned corporations whose home has no station), and
they share one root cause: `corporation-spawn`'s asset-healing pass
(`ensureSpawnAssets`) only runs inside `Spawn`, which a client only calls
explicitly (fresh wake-up, or an idempotent re-spawn) — a corporation that
already exists and only ever calls the pure-read `GET /v1/corporations/me`
would never re-trigger healing, no matter how many new asset types this
change (or a future one) adds. **Decision: `GET /v1/corporations/me` also
runs the same idempotent asset-healing pass `POST /v1/corporations`
does**, before responding — generalizing the exact "hull exists, fog
missing → heal the fog" shape `Spawn Asset Healing` already specifies to
"station missing → heal the station; balance missing → heal the balance."
This is recorded as a MODIFIED clause + a new scenario on
`corporation-spawn`'s "Session Bootstrap and Wake-Up Endpoints"
requirement (not left as an uncaptured implementation detail), because it
changes `GET /me`'s observable behavior: every existing corporation heals
on its very next session bootstrap read, with no backfill script and no
explicit re-spawn required. *Alternative considered:* a one-time backfill
migration script run once at deploy time. Rejected — it's a second
mechanism solving a problem the existing idempotent-healing shape already
solves for free once the read path also drives it, and a script has no
story for a corporation that doesn't get read again before the script
runs (there isn't one — every account's session bootstrap is a `GET /me`
call).

### 15. The slippage guard compares against the server's first-ton applicable price — corrected: first-ton-only is not enough on its own

`goods-sale`'s optional `expectedUnitPrice` compares against the price the
server would apply to the *first ton* of the sale at settlement — the
best standing demand at that venue for the named kind (a request's premium
price if one is open and covers at least one ton, else the floor). This is
the same figure `market-price-board`/`market-board-panel` would have shown
the player moments earlier, so a mismatch reliably signals "the board you
looked at is stale" (most commonly: another corporation exhausted the
request between your read and your sale) rather than requiring the client
to reconstruct a blended request/floor split price to compare against. A
sale that supplies no `expectedUnitPrice` skips the check entirely (it is
optional, not a de facto requirement to quote first) — this keeps the
minimum viable sell flow (no board read, just sell) fully functional while
rewarding a client that did check the board with real protection.

**Corrected: comparing only the first ton's price fails in exactly the
scenario it exists to protect.** The demo flow this decision was written
for — read the board, haul a large tonnage across lanes toward a large
open request — is precisely the case a first-ton-only guard misses: if a
rival sells all but one ton of a 200 t request just before the victim
docks, the first ton still prices at the request's premium (140 cr/t in
the worked example), so `expectedUnitPrice: 140` still matches, the guard
passes, and the other 199 t settle at the floor — a large, silent loss on
a trip the player explicitly tried to protect with the guard. **Fix: add
a second, optional guard — a caller-supplied minimum acceptable total
proceeds** — evaluated against the same transactional settlement read the
first-ton guard uses. A client that computed an expected total from a
board read (e.g., "200 t at a blend of premium+floor should net at least
X") supplies it, and a settlement whose actual total proceeds fall below X
is rejected before any state change, exactly like the first-ton guard.
Both guards remain optional and independent; a sale may supply either,
both, or neither.

**Guard presence must be an explicit signal, never inferred from a zero
value.** A non-pointer `expectedUnitPrice int64`/`minTotalProceeds int64`
field reads an omitted JSON field as `0`, which matches no positive price
— every sale from a client that omits the guard would be incorrectly
rejected as though it had supplied an unmatchable price of zero. The
requirement now states this explicitly: presence is signaled by the
field's actual absence (a nullable/pointer type or an explicit "supplied"
flag), never inferred by comparing the value to zero.

**A rejection under this guard must not be a UI dead end.** A price-changed
rejection after a multi-minute haul, with no path back to the current
price from inside the flow, is a UX blocker in its own right — see
`hex-board-view`'s extended "Sell Commit" requirement, which now refreshes
the offer to the server's current applicable price and total on this
specific rejection, rather than leaving a stale, unre-committable offer on
screen.

### 16. The settlement transaction's composition mechanism

**Blocker, independently found by the DBA and architect reviews.**
`goods-sale`'s "One Atomic Transaction — Hold Debit, Balance Credit,
Ledger, Request Decrement" is not achievable by three sequential
service calls, because every existing service method already opens its
own transaction (`corporations.DaoImpl.CreateWithPointer`,
`action.DaoImpl.Commit`/`ResolveOne`, `system.DaoImpl.CreateInterior`).
Calling `fleet.ServiceInterface`'s cargo debit, then
`corporations.Service.ApplyCredit`, then a request-decrement call is
**three committed transactions**, not one — concretely: (a) cargo debited
then credit fails → goods vanish with no payment ("matter never
teleports" violated); (b) credit succeeds then request decrement fails →
the corp is paid, the ledger says settled, but the request's quantity
never shrinks, so an NPC budget/absorption ceiling can be exceeded
without bound and the same cargo can effectively be resold against a
request that should have closed. Firestore's per-transaction document
ceiling (500) is not the constraint here — four documents is nothing —
the constraint is purely architectural, and `backend/CLAUDE.md`'s
"cross-domain calls go through services, not DAOs" rules out the obvious
workaround of reaching into another domain's DAO directly.

**Existing precedent this decision follows:** `backend/action/dao.go`'s
`ResolveOne` already composes a multi-domain single transaction — the
action doc, the actor doc (another domain's data), the delta doc, and
arbitrary `res.Writes` paths via `refFromPath` — all inside one
transaction that `action` itself owns.

**Chosen mechanism:** the `market` sale service opens exactly one
`db.RunTransaction` and composes narrow, transaction-scoped primitives
that the owning domains implement and the consumer (market) declares:
`corporations.ApplyCreditInTx(tx, corpId, operationKey, entry)`,
`fleet.DebitCargoInTx(tx, fleetId, kind, tons)`, and a station-side
`DecrementRequestInTx(tx, stationId, requestId, tons)`.
`corporations.Service.ApplyCredit` becomes a thin wrapper that opens its
own transaction and delegates to `ApplyCreditInTx` for every non-sale
caller (the spawn opening grant remains a one-call, one-transaction
mutation). The layering rule (`backend/CLAUDE.md`'s "cross-domain calls go
through services, not DAOs") is satisfied because these are narrow
service-level interfaces, declared by the consuming domain and
implemented by the owning domain against its own DAO — never a direct
DAO reach-through from `market` into `fleet`'s or `corporations`'
persistence layer.

**The transactional re-read closes the second half of this finding**
(security's independent re-read): every precondition the sale evaluates
before opening the transaction (held tonnage, balance headroom, request
remaining quantity) is re-evaluated against a read taken *inside* the same
transaction, and a precondition that was true before the transaction but
false against the transactional read aborts the sale in full — it is
never reduced, clamped, or partially settled for that reason. Without
this, two concurrent sales with distinct operation keys (the idempotency
key does not fire, because it is by design a *different* key per attempt)
can each pass a pre-transaction check and both commit, overselling a
single hold. See `goods-sale`'s replaced "One Atomic Transaction..."
requirement for the exact, testable shape.

### 17. The uniform demand-entry / opaque venue abstraction — protecting the M12 intel-market seam

**Blocker, architect.** `goods-sale` was written NPC-shaped, not
venue-shaped: proposal.md claims the sale settles "against the best
standing demand at that venue — not 'sell to the NPC'," but the actual
requirements describe a two-case NPC rule (fill the request, then the
floor) with no venue concept anywhere in the change. M12 (the player
exchange) would then have to fork the settlement path or rewrite it
outright, and `market.md`'s intel market — which leans toward "one global
exchange" — has nothing to key a global order book on if "venue" doesn't
already exist as a first-class, opaque concept.

**Decision:** restructure both `goods-sale` and `market-price-board`
around a uniform **demand entry** abstraction under an **opaque venue
scope key**:

- A **venue** is an opaque scope key. In this version it is always a
  station's id, but neither the settlement fold nor the quote read
  interprets that key as a station id — it is just the scope a set of
  demand entries is attached to. This is what lets M12 key a global
  order book, a regional book, or a per-station book onto the exact same
  fold rule without a rewrite.
- **Demand at a venue is an ordered list of uniform demand entries**
  `{unitPrice, remainingQuantity, source}`. The NPC floor is modeled as
  **one entry of last resort** — unlimited remaining quantity, lowest
  price priority — never as a fallback branch in code or in the
  requirement text. In this version, every entry at a venue is
  NPC-sourced (the floor entry, plus zero or more premium-request
  entries); in M12, player asks join the exact same ordered list.
- **Settlement is one rule, no NPC special case:** fold the sale's
  tonnage across the venue's demand entries in price-descending order,
  filling each entry to its remaining quantity before moving to the next,
  until the tonnage is exhausted. "Fill the request first, then the
  floor" is simply what this fold produces given this version's entry
  set — not a separate code path.
- **The price-board response carries the same uniform demand-entry list
  per venue**, not `floor` + `requests` as two distinctly typed fields —
  closing the second architect blocker (a hardcoded two-field quote shape
  that M12 would have had to fork the client contract to extend).

This decision is the direct implementation of Finding C3 and the seam
Travis asked to be protected explicitly; `npc-market-demand` continues to
own *provisioning* the specific request/floor entries (their prices,
quantities, bands) — it is the fold and the response shape that become
uniform, not the data that feeds them in this version.

### 18. Reconciliation cadence, write-time chaining, and per-mutation attribution

Three related gaps, closed together because they compose: (a) nothing in
the change requires the reconciliation check (Decision 8) to ever run —
reliability's BLOCKER; (b) the ledger has no chained, write-time
divergence check, only a periodic one, so a corruption is detectable only
on the next windowed fold rather than at the moment it would occur —
architect's finding; (c) the ledger cannot attribute a mutation to the
account that triggered it, only to the corporation, which under token
passthrough (`CLAUDE.md`: "the claude-agent... passes it through to the
backend, so the agent inherits the user's permissions") means a
duplication bug investigated post-incident cannot tell which channel
produced a given entry — security's finding.

**Decision:** three new `corporation-credits` requirements close these
together: "Trade Entries Are Attributable To an Actor" (the triggering
account id rides every ledger entry alongside the corporation id);
"Credit-Mutating Attempts Are Audit-Logged, Settled or Rejected" (a
structured record for every attempt, not just successes, distinct from
`request-authorization`'s general HTTP audit logging which only
classifies `403`/strict-tier `429` — the sale's own rejections are
`400`/`404`/`409` and would otherwise leave no queryable trace); and
"Reconciliation Runs On a Stated Cadence, Chained at Write Time, and
Halts Mutation On Divergence" (a periodic run **and** an O(1) write-time
check — each settlement transaction validates its computed new balance
against the previous entry's recorded resulting balance before
committing — with a confirmed divergence halting further credit
mutation for that corporation until an operator resolves it via an
`adjustment` ledger entry, Decision 21).

### 19. Contention retry policy for the settlement transaction

**Reliability MAJOR.** A money-mutating instant verb with no policy for
who retries a `RunTransaction` contention abort, how many times, with
what backoff, and what the caller sees meanwhile is underspecified in a
way that matters — a client that gives up after one abort under load
behaves differently from one that spins forever. **Decision:** the
settlement transaction retries a transaction-conflict abort server-side,
automatically, up to a small fixed count with a short backoff, before
surfacing a distinguishable "busy, try again" rejection to the caller —
never silently retrying forever, and never surfacing the raw Firestore
contention error. See `goods-sale`'s new "Contention Aborts Retry
Server-Side Before Surfacing Failure."

### 20. Observability signals this change must emit

**Reliability MAJOR.** Beyond the reconciliation-divergence signal
(Decision 8/18), several other signals are implied by this change's own
risk profile but were not stated anywhere: sale failure rate by rejection
reason, transaction contention/abort rate, ledger growth rate, and — with
no credit sink in M11 (proposal.md's Scope caveat) — the rate credits are
minted, which is the *only* inflation visibility that exists this
milestone. **Decision:** add `corporation-credits`' "Credit Minting Rate
Is Observable" (a countable signal for the sum of positive ledger entries
over time) and `goods-sale`'s "Sale Outcomes Are Countable By Reason" (a
countable signal per settlement/rejection-reason, including contention
aborts) as testable requirements, rather than leaving these as
implementation details nobody committed to shipping.

### 21. The `adjustment` ledger entry kind — data model only, no admin endpoint

**Reliability proposed** an admin compensating-adjustment endpoint for
post-incident correction. **Ruling: out of scope.**
`request-authorization`'s "Admin-Only Gate" is currently wired to no
route in this codebase — adding one here would introduce the game's
*first* admin surface as an unplanned side effect of a market change,
well beyond what was asked. **Decision:** add `adjustment` to the trade
ledger's set of named entry kinds (alongside starting-grant and sale
proceeds) so the data model has a representation for an operator
correction once that surface exists, and record the admin endpoint
itself in Open Questions below as a deferred follow-up — not built here.

### 22. Cross-stack settlement math pinned by a shared fixture

**Architect MAJOR.** The proceeds preview (`market-board-panel`,
TypeScript) and the settlement fold (`goods-sale`, Go) are duplicated
cross-stack math with nothing holding them together — exactly the
"Go/TS shared math via fixtures" cross-cutting rule `docs/plans/
build-order.md` already establishes, whose existing precedent is
`fixtures/board/cases.json` (verified present, asserted by both `board`'s
Go tests and `lib/hex`'s TS tests). **Decision:** add
`fixtures/market/cases.json`, a golden covering the demand-entry fold,
split fills across more than one entry, and per-portion rounding
(Decision 1), asserted by both the Go settlement tests and the TS preview
tests, so the two stacks cannot silently diverge on the number a player
is shown versus the number that settles.

## Risks / Trade-offs

- **The price board as an incidental location beacon** (Decision 6). A
  station-bearing system on the aggregate board is a strong signal of a
  living corporation's home coordinates, once any observer reaches
  `rumored` on it — cheap to reach via one adjacent scan. Accepted as an
  emergent consequence of a DECIDED, load-bearing mechanic (remote price
  visibility); not mitigated in this change. Worth a design conversation
  before a public launch if it proves to matter (e.g., a later "cloak your
  home's listing" mechanic), but out of scope here.
- **Unbounded trade-ledger growth** (Decision 8). Accepted, by design — the
  materialized balance is exactly what makes this safe for ordinary reads;
  only the reconciliation check pays the ledger's size, and it does so via
  a checkpointed, windowed fold specifically so it never re-pays the full
  history. Flagged as a scaling question for whenever reconciliation
  cadence itself becomes a tuning concern (not expected at M11's data
  volumes).
- **A pure-faucet economy for the length of M11** (proposal.md's Scope
  caveat). With no buy side and no credit sink, credits can only
  accumulate — this milestone's economy cannot be balance-tested in
  isolation, and that is expected, not a defect; M12's listing fee is the
  first sink.
- **Optimistic, unreserved requests** (mirroring mine's "Optimistic
  Contested Lodes"): no reservation exists between a price-board read and a
  sale, so another corporation can exhaust a request in between — exactly
  the moment the slippage guard (Decision 15) exists to catch, for a client
  that opts in to it; a client that doesn't simply settles at whatever
  price currently applies, same as mine's un-previewed yield.
- **Live request quantities are a dynamic activity-disclosure channel**
  (Decision 6, second half). Distinct from the static home-beacon risk
  above: exact, live per-request remaining quantities let any observer at
  `rumored` read off a rival's throughput, resource mix, and rough
  docked/away schedule for free, with no scan and no travel. Accepted for
  this version because exact quantities are load-bearing for the design
  doc's core "spot the spread" decision; the coarse-band mitigation is
  offered to Travis as an Open Question, not resolved here.
- **Reconciliation does not backstop `goods-sale`'s cross-domain
  correctness** (Decision 8/16). `corporation-credits`' reconciliation
  invariant only ever reconciles a corporation's own balance against its
  own ledger fold — a corruption mode that leaves cargo or a request's
  remaining quantity divergent from the ledger, while the ledger and
  balance stay mutually consistent, is invisible to this check by
  construction. The actual correctness guarantee for that surface is
  Decision 16's single settlement transaction with a transactional
  re-read, not this reconciliation invariant; stated here so the
  invariant is never mistaken for a wider safety net than it is.
- **A popular station's request/budget state is a write hotspot**
  (Decision 12). Embedding requests on the station doc means every sale
  against an open request contends on that one document; the design's own
  demo ("spot the spread, fly there") concentrates concurrent sellers on
  exactly this doc. Firestore transactions still prevent oversell (no
  correctness risk), but sustained contention can raise abort/retry rates
  under load. Accepted at M11's expected concurrency; a distributed-
  counter/sharded-remaining-quantity pattern is the mitigation if this
  becomes measurable.
- **The instant verb rides no liveness floor** (Decision 3). Every other
  mutating verb settles through `action-dispatch`, which brings a durable
  action doc, resolve-on-read, and the scheduled sweep
  (`action-dispatch`'s "Scheduled Sweep as a Liveness Floor") as a
  backstop for an effect nobody happens to read again. A sale rides none
  of that — a half-applied or lost effect has nothing sweeping it up.
  What compensates, named explicitly rather than inherited silently: the
  single settlement transaction (Decision 16, all-or-nothing, so there is
  no "half-applied" state to sweep), the idempotency key (Decision 7, so
  a client retry is safe), and the reconciliation check (Decision 8/18,
  bounded to its own stated scope above) — not a scheduled sweep, because
  an instant, synchronous verb has no ETA to become due against.

## Migration Plan

- `corporations/{corpId}` documents gain one field, `credits` (int64),
  absent on every pre-existing document. Absent SHALL be treated as "never
  granted," not as zero-and-done — see Decision 14: the next `GET
  /v1/corporations/me` or `POST /v1/corporations` call for that account
  grants the configured starting balance exactly once (keyed by `"spawn:" +
  corpId`, idempotent under a repeated call).
- `corporations/{corpId}/ledger/{operationKey}` is a new append-only
  subcollection — additive, no backfill (a pre-existing corporation's
  ledger starts empty at the moment its balance is first granted, per the
  point above; its reconciliation fold is trivially correct from that
  moment forward).
- `galaxies/{gid}/systems/{sid}/station/meta` is a new per-system
  subcollection, distinct from `interior`/`features` — additive, and, per
  Decision 14, provisioned for a pre-existing spawn home on that
  corporation's next session-bootstrap read, not only a fresh spawn.
- No schema change to `system.Feature`, `SystemInterior`, `fleet.Fleet`
  (`Cargo` is debited by the same field a mining resolve already credits —
  no new field), `action.Action`, or `action.Delta`. No `action-dispatch`
  surface change of any kind — this change registers no `action.ResolveFunc`.
- New Firestore collections (the ledger subcollection, the station
  subcollection, the NPC-request-bearing station doc itself) are
  registered in `CleanupFirestoreTestData()` per house convention.
- No new Pub/Sub topic or event type — every mutation here is synchronous
  within its own HTTP request (Decision 3); there is no `ActionCompleted`-
  shaped completion to fan out, and `market-board-panel`'s freshness comes
  from a stated poll cadence (`market-board-panel`'s "Quote Freshness Via
  Stated Refresh Cadence"), not a push channel.
- No new Terraform (no scheduler, no index beyond what Firestore's own
  per-collection query needs, which the implementer confirms against
  `firestore-indexes.tf` during the build).

## Open Questions

*(Carried forward from the adjudication brief as proposed answers needing
Travis's confirmation — not silently resolved by fiat.)*

- **Request provisioning's numeric knobs** (Decision 12): concurrent
  request count per station, premium band, quantity band, lifetime,
  regeneration cadence, and epoch width are all left as named,
  configured, tuning-time values in `market.Params` — no number is
  proposed here (per the same discipline `mine.MineParams`'s starting
  numbers followed). Owner: dev, at implementation, informed by playtest
  feel — same status as `mine-extraction`'s own deferred tuning numbers.
- **Starting credit grant, floor-price table values, budget/absorption
  ceilings** — likewise tuning-time `market.Params` values, not pinned
  here.
- **The price-board visibility tier's default** (`rumored`, Decision 6) —
  proposed, following `system-interior`'s existing lane-gate precedent
  directly; confirm or override.
- **The station now orbits — this REVERSES the earlier "fixed, not
  orbiting" proposal** (Decision 4). The reversal happened because the
  original justification (avoiding orbital computation) was checked
  against the code and found false — `fleet.Position` already handles any
  orbiting feature generically, so orbiting costs nothing at that seam.
  This is now a pure world-feel call, not an engineering-cost trade-off:
  everything else on a board orbits or coasts; a fixed station would be
  the one physics exception. Flagged explicitly so Travis sees this as a
  reversal of a prior answer, not a silent implementation detail.
  **Resolved 2026-08-24: Travis confirmed orbiting, and further tied the
  station's direction to the system's dominant orbital direction** (the
  prograde convention `system-interior`'s "Coherent Orbital Direction"
  establishes) — the station rides the disk like every other feature.
- **The dynamic per-request-quantity disclosure channel** (Decision 6,
  second half) — exact live request quantities let any `rumored`-tier
  observer read a rival's throughput/activity for free, distinct from the
  static home-beacon risk. Proposed: ship exact quantities as-is (load-
  bearing for the core UX moment); the option to close this, if Travis
  wants it closed, is coarse availability bands (e.g., high/medium/low/
  none) in place of the exact figure — not adopted here, offered as the
  alternative if the risk is judged to matter sooner than "worth a design
  conversation before public launch."
- **The admin compensating-adjustment endpoint** (Decision 21) — deferred,
  not built in this change. The `adjustment` ledger entry kind ships so
  the data model supports a future correction; the endpoint itself
  (`request-authorization`'s "Admin-Only Gate" currently has no route to
  attach to) is a follow-up change, scoped and reviewed on its own once
  an actual incident or operational need makes it worth the game's first
  admin surface.
- **Market-board refresh cadence and acceptable price staleness** — a
  concrete number is needed for `market-board-panel`'s "Quote Freshness
  Via Stated Refresh Cadence" to be a testable requirement rather than a
  vague adjective. Proposed default: a 30-second poll cadence, treating a
  price up to 30 seconds stale as acceptable for a decision that itself
  takes minutes of travel to act on — same tuning-value status as every
  other `market.Params` number above; confirm or override.
- **The credit-mutation idempotency scheme** (client-supplied operation
  key, Decision 7) — the design doc is silent on idempotency entirely;
  this is this change's own proposed answer, not a re-statement of a
  locked decision.
- **Slippage-guard semantics** (Decision 15, comparing against the
  server's first-ton applicable price AND an optional minimum total
  proceeds, corrected from a first-ton-only design that failed on exactly
  the scenario it was meant to protect) — confirm this two-guard shape is
  right for the M11 demo's "spot the spread" moment specifically.
- **No minimum sale size** (Decision 8) — a considered, argued-for
  decision, not a silent omission; confirm the reasoning (no finite lode
  to bound against) lands, or flag a different concern (e.g., ledger read
  volume from many tiny trades) that would revive the idea.

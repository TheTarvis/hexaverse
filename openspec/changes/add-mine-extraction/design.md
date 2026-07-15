## Context

Mine is architecturally load-bearing beyond its size: it is the **reference
implementation of `action-dispatch`'s mutating-verb resolution strategy**
(append-only ledger, exactly-once by action id, folded at read time — no
materialized running total), and it forces the **fleet cargo model** into
existence, which the later economy (hauling, trade, piracy risk) hangs off.
The full design is accepted at `docs/specs/0010-mine.md`; this design.md
carries forward its Decisions section and the alternatives it already
weighed, rather than re-deriving them.

## Goals / Non-Goals

**Goals:** a mutating action on the `action-dispatch` spine (commit →
resolve, exactly-once); a fleet composition model (`ships[]` → derived
totals) shaped for the endgame (ships as stat contributors, fleet as sole
actor) even though the slice roster is one hull; a single fleet-level cargo
pool; day-one lode depletion via the ledger fold; yield clamped by reality
(remaining lode, free hold) at resolve, with an honest `outcome` string.

**Non-goals** (deferred, per the source spec — do not build):
- Ship classes and a build tree (deferred to "build-verb time"; this change
  ships the *shape* — roster + aggregation — with one generalist `seed`
  class).
- Cycle-quantized flow mining (`window {from, to, rate}` is written into
  the delta schema as a no-migration hedge but unused; the slice mines
  point-at-ETA).
- Fuel–tonnage coupling ("haul only what your fuel can push" — the
  deferred fuel economy). Tons are recorded from day one so this lands
  later as a burn-cost modifier, not a schema change.
- Trade/selling the ore, refining, mining structures (rigs/sites/bases) —
  all later-era.
- Depletion-driven intel freshness (a lode reading stale because it was
  mined) — that is the future `observation-fog-and-scan` /
  intel-market extension; this change writes exactly the ledger that
  extension will read.

## Decisions

1. **Ships compose, the fleet acts.** The endgame picture (e.g. 3 miners +
   1 cargo + 2 fighters) is one fleet whose roster contributes stats (rate,
   hold, speed-gates-on-slowest, later combat). Ship classes are never
   independent actors — `fleet-movement`'s fleet-is-the-mover stands
   unchanged. *Alternative considered:* ships as independent actors on the
   board. Rejected — it would fork movement state per ship and contradict
   the existing single-movement-state fleet record.
2. **Ore lives on the fleet, one pool.** Capacity = Σ roster holds.
   Per-ship allocation is bookkeeping with no gameplay value until ships
   can detach (a later replication/build era) — the pool is
   derived-capacity now, splittable later. *Alternative considered:*
   per-ship cargo slots. Rejected as premature complexity with no current
   payoff.
3. **Fuel–tonnage stays deferred.** "Haul what your fuel can push" is
   `fleet-movement`'s future fuel economy. Tons are in the ledger from day
   one so it lands later as a burn-cost modifier, never a schema change.
4. **Docked is the mining precondition**, not co-hex. Bodies move (orbital
   elements); a coasting fleet rides its own orbit, so co-hex is a moment
   and docked is a state. `fleet-movement`'s dock-to-ride already keeps a
   docked fleet glued to its host through orbital motion, so "docked to the
   target" is the one precondition that stays true for the whole run with
   no extra machinery.
5. **Point-at-ETA, window-hedged.** Inherited from `action-dispatch`
   (already decided there): mine resolves as one clamp-and-credit at ETA,
   not a metered flow. The delta's `window` field is written but unused —
   a no-migration hedge for a possible future flow-mining mode.
6. **Runs are sized by tonnage target**, not duration. "Mine 40t" →
   `eta = tons ÷ rate`. The delta amount and the hold clamp fall straight
   out of this, and "fill the hold" is the natural UI default.
   *Alternative considered:* duration-picked runs (mine for 2 hours). 
   Rejected — it makes the yield the derived quantity, which fights the
   hold clamp (you'd have to re-derive amount from clamped time).
7. **Lodes visibly deplete in the slice.** Depletion keeps players
   exploring and moving — a worked-out home system is the push to the next
   one, and it seeds "depletion with a story" / intel spoilage later. The
   ledger fold makes this nearly free (it is the same fold
   `action-dispatch` already specifies for any mutating verb).
   *Scope caveat (added in review):* this change writes the depletion
   ledger but does **not** add a read that surfaces a lode's *remaining*
   tonnage. `FoldDeltas` is exercised only inside `action/`'s resolve today;
   no `system`/board read projects `remaining = startTons + fold` back to a
   client, so a re-read after mining still shows the original static
   `richness`. Depletion is therefore *recorded* here and *made visible* by a
   named follow-up (the same `hex-board-view` follow-up that carries the
   `useMine()` UI must, or a small preceding backend read change must, fold
   the ledger into the feature read). This change's deliverable is the
   honest ledger; "visibly" is the follow-up's. See Open Questions.

8. **Starting lode tonnage is frozen at commit, not recomputed at resolve.**
   The resolve-time clamp needs the lode's starting (richness-derived)
   tonnage to compute `remaining = startTons + fold(≤eta)`. The
   `action.Resolution` surface a resolver receives exposes only
   `DecodeActor` (the fleet) and `Remaining` (the ledger fold for the
   scope) — it cannot read the target feature's `resources[].richness`
   transactionally. Two routes exist: freeze `startTons` into `action.params`
   at commit (the commit already reads the feature to validate the
   kind precondition), or inject a `system` service into the resolver and
   read the feature non-transactionally (the `AmbientRecorder` precedent).
   **We freeze at commit.** It is not merely convenient — it is the only
   choice consistent with the spine's freeze-at-commit invariant: the
   richness→tonnage curve lives in `MineParams` (tuning), so recomputing
   `startTons` at resolve against live params would let a tuning change
   between commit and resolve move a run's yield, violating "tuning changes
   affect only new commits." Freezing `startTons` keeps resolve
   self-contained (which the ETA requirement already claims) and
   deterministic under contention (every run against one lode freezes the
   same `startTons`; the fold alone carries depletion). *Consequence for the
   spec:* the frozen-params set is `{featureId, kind, tons, rate, startTons}`,
   not `{featureId, kind, tons, rate}` — reported to the writer.

9. **Mine claims the movement channel slot (`activeActionId`), not a new
   channel.** A docked, mining fleet must not also burn away, so mine and
   movement are correctly mutually exclusive — and reusing the movement slot
   buys transactional safety for free: mine validates its preconditions
   (docked, kind present, free hold) *before* `action.Commit`, outside the
   claim transaction, but because burning-away and a second mine both need
   the same movement slot, the atomic slot claim at commit closes the TOCTOU
   window — a fleet cannot leave the dock or start a competing run between
   the precondition check and the claim without failing the claim
   (`ErrActiveActionExists`). Scan stays on the independent sensor channel,
   so a docked fleet can prospect-scan while a mine run is underway.
   *Alternative considered:* a dedicated mining channel. Rejected — it would
   let a fleet commit a burn and a mine on the same tick, breaking the
   "docked is the precondition that stays true for the whole run" guarantee
   (Decision 4).

10. **Mine enforces fleet ownership at commit, unlike the three inherited
    fleet command endpoints.** `POST /v1/fleets/:fleetId/mine` is a brand-new
    endpoint, not an existing one whose behavior this change would be
    changing out from under callers — so there is no compatibility cost to
    doing it right here. Security review flagged that claiming another
    corp's fleet's movement slot to mine is materially worse than the
    inherited orders/cancel/scan gap (design section's old framing: "does not
    fix or worsen"), because a mine run also locks the victim fleet in place
    for the run's duration, forces cargo into its hold, and can consume a
    contested lode on the victim's behalf — a resource-griefing surface, not
    just a reversible reposition. Commit resolves the requester's living
    corporation (`common.ActorCorp`, set by `middlewares.ResolveCorporation`
    — the same seam every fogged read already keys on) and rejects before any
    other precondition check when it does not own the named fleet, hiding
    existence with `404` (matching the fog convention `fleet-movement`'s read
    endpoints already use for foreign fleets outside coverage) and rejecting
    an unauthenticated caller with `401`. *Alternative considered:*
    specifying the endpoint as consistent with the other three (documenting
    the inherited gap rather than closing it), so a later
    `enforce-fleet-and-action-ownership` change sweeps all four uniformly.
    Rejected for mine specifically — panel tie-break gives security authority
    over control decisions, and "cheapest to fix now, on a new endpoint" beats
    "consistent with a defect we already know is wrong." This does **not**
    retrofit ownership onto `orders`/`cancel`/`scan`; that gap is unchanged
    and stays tracked by `enforce-fleet-and-action-ownership`.

11. **Ledger scope is system-qualified (`systemId/featureId`), never bare
    `featureId`.** `system/generator.go` assigns feature ids by a per-system,
    index-based scheme (`feat-star`, `feat-belt-0`, `feat-body-0`, ...) that
    repeats identically across systems — every system with a belt has a
    feature literally named `feat-belt-0`. `action-dispatch`'s delta ledger
    is a top-level collection keyed only by `scope`
    (`deltas/{scope}/entries/{actionId}`); every prior scope user (burn,
    lane travel) passed a globally-unique `systemId`, so this collision was
    latent, not yet triggered. Mine is the first verb to scope by feature, so
    it must qualify: `scope = fmt.Sprintf("%s/%s", systemId, featureId)`,
    mirroring the nesting pattern `observation/service.go` already uses for
    per-feature keys. *Alternative considered:* bare `featureId` as
    documented in the original migration plan below. Rejected — confirmed by
    data review as a silent cross-system ledger collision (two corporations
    each mining their own home system's belt would fold into the same
    `remaining` computation), not a hypothetical.
    *Correction (added in architecture review — see Decision 12):* the
    per-feature ledger granularity this decision correctly requires must be
    carried by a **ledger key decoupled from `action.Scope`**, not by moving
    `action.Scope` itself to `systemId/featureId`. `action.Scope` is
    triple-purposed (ledger key + read-resolution query key + SSE channel), so
    overloading it onto the feature axis is the wrong lever. Decision 12
    supersedes the *mechanism* here while keeping this diagnosis intact.

12. **The per-feature ledger key is decoupled from `action.Scope`; mine's
    `Scope` stays `systemId`.** `action.Scope` is not just the ledger key — it
    is also (a) the `ResolveDue(scope)` query key `system-interior`'s board
    read runs (`system/handler.go` calls `ResolveDue(systemID)` before
    projecting features) and (b) the `channelId` the completion event fans out
    on (`action/service.go` publishes `ActionCompleted` with
    `channelId = a.Scope`), which is exactly the channel the board view
    subscribes to (`frontend/hooks/use-board-realtime.ts` opens
    `/v1/channels/{systemId}/stream` and refetches on `action.completed`).
    Setting mine's `Scope = systemId/featureId` (Decision 11's original
    mechanism) therefore has two unintended consequences: the mine's completion
    broadcasts on a `systemId/featureId` channel **no client subscribes to** (no
    realtime push when a run finishes), and `ResolveDue(systemID)` from a board
    read **never resolves a due mine** (scope mismatch) — it would settle only
    on a fleet-actor read (`ResolveActive(fleetId)`, which mine's actor makes
    work) or the ~15-min sweep. Within this write-only change that has no
    board-visible effect yet, but the **named depletion-visibility follow-up**
    (Decision 7's caveat, Open Questions) adds a `remaining` read to exactly
    that board handler — and would inherit a board that neither resolves the
    due mine nor gets pushed to refetch it. And `Scope = systemId` cannot be
    used as the ledger key either: two features in *one* system
    (`feat-belt-0`, `feat-belt-1`) would then share a ledger, which is worse
    than the cross-system collision Decision 11 found. The two axes are
    genuinely independent — resolution/channel want **per-system** granularity
    (align with the board), the ledger wants **per-feature** — so they must be
    separated, not traded off. Mine therefore commits with `Scope = systemId`
    and a distinct **ledger key** `systemId/featureId`. This requires a small
    `action-dispatch` surface change: a mutating verb must be able to name a
    ledger key distinct from its channel scope, and the resolver's `Remaining`
    / appended `Delta` must fold and write that ledger key rather than
    `a.Scope`. *Alternative considered:* keep Decision 11's overloaded scope
    and document the divergence (mine completions do not ride the system
    channel; the follow-up subscribes to the feature channel and resolves mines
    by actor). Rejected — it pushes a per-verb special case into the frontend
    realtime layer and the board read, to save one additive field on the
    already-generic spine; the spine is the right seam. *Consequence for the
    spec:* `action-dispatch` gains an affected-spec delta (a decoupled ledger
    key), and the mine spec's "Ledger Scope Is System-Qualified" requirement is
    reworded to "ledger *key*," leaving `Scope = systemId` — reported to the
    writer. *Further refined by Decision 14 below:* security and DBA review,
    reading this decision's ledger key, each independently found it still
    under-specified on a different axis (kind-conflation; an illegal
    Firestore document-id character). Decision 14 lands both fixes on the
    same key this decision introduces — it does not reopen the
    Scope-vs-ledger-key split settled here.

13. **The commit-time already-depleted check needs a public fold on
    `action.Service`.** "Already-Depleted Lode Rejected At Commit" folds the
    lode ledger at the commit instant, outside any resolve transaction. The
    only fold that exists today, `FoldDeltas`, is a method on the **private**
    `action.Dao` (used inside `ResolveOne` to build the resolver's `Remaining`);
    `backend/CLAUDE.md`'s layering rule ("a DAO is private to its owning
    service; cross-domain calls go through services") forbids the mine service
    from calling it directly. Satisfying the commit-time check cleanly requires
    exposing a **public read-time fold on `action.Service`** (e.g.
    `Remaining(ctx, ledgerKey, t)`), keyed on the decoupled ledger key from
    Decision 12. This is the same surface the resolver's `Remaining` already
    computes internally — it is only unexported at the service boundary today.
    *Consequence for the spec:* this is a second `action-dispatch` delta, and
    the proposal's Impact must add `action-dispatch` to affected specs (it
    currently lists only `mine-extraction` and `fleet-movement`) — reported to
    the writer.

14. **The ledger key is further qualified by resource kind, and joined with
    `::`, not `/`.** Two independent, non-conflicting fixes land on Decision
    12's ledger key:
    - *[Security]* `resources` is a list — a single feature can carry more
      than one kind (this spec's own "One Resource Kind Per Run" carries a
      scenario for exactly that case, and the source design plans
      multi-kind bodies: "multi-kind bodies take multiple runs"). A ledger
      key of `systemId/featureId` alone folds every kind's deltas into one
      running total, so mining a feature's cheap kind can drive its
      expensive kind's readable remaining negative — "Already-Depleted Lode
      Rejected At Commit" then blocks the *owner* from mining the
      untouched kind, a resource-denial defect the generator doesn't
      trigger today (one kind per feature) but the spec's own scenarios
      already assume. Fix: fold the resource kind into the key.
    - *[DBA]* Firestore document ids cannot contain `/`; `action.Dao`'s
      delta path (`.Collection("deltas").Doc(scope)`) concatenates the key
      raw, so a key built with an embedded `/` fails Firestore's
      `InvalidArgument` check on every resolve attempt — confirmed against
      a live emulator. This is not the same mechanism as the
      `observation/dao.go` per-feature nesting Decision 11 cited as
      precedent (that path chains real `.Collection().Doc()` calls; this
      key concatenates into one opaque Doc ID string in `action-dispatch`'s
      existing flat collection) — only one of the two mechanisms is legal
      Firestore. A key built with `/` would strand every mine action that
      reaches resolve permanently in `running`, movement slot unreleased,
      cargo never credited.
    Both fixes compose onto the same string with no interaction: the ledger
    key becomes `${systemId}::${featureId}::${kind}` (e.g.
    `sys-042::feat-belt-0::metals`). *Consequence for the spec:* the mine
    spec's ledger-key requirement (Decision 12's "Ledger Scope Is
    System-Qualified") is retitled and reworded to name both the kind
    dimension and the `::` join; `action.Action`'s `Scope` doc comment gains
    a note that a composite ledger key must never contain `/` (Scope itself
    is unaffected — it stays the bare `systemId` per Decision 12).

15. **Resolve floors `remainingAtEta` and `take` at zero.** "Resolve Clamps
    Yield to Reality" computed `take = min(params.tons, remainingAtEta,
    freeHoldAtResolve)` with no lower bound (security review). If
    `remainingAtEta` is ever negative — cumulative deltas exceeding
    `startTons`, which Decision 14's kind-scoping now prevents from the
    conflation vector but does not rule out under float drift across many
    contested runs against one popular lode — `take` goes negative: the
    appended delta becomes *positive* (restores phantom tonnage to the
    lode, inflating every future reader's remaining) and
    `fleet.cargo[kind]` is credited a *negative* amount. Both quantities are
    now floored at zero: `remainingAtEta = max(0, startTons +
    fold(deltas ≤ eta))`, `take = max(0, min(params.tons, remainingAtEta,
    freeHoldAtResolve))`. Defensive and independent of Decision 14 — it
    guards a case Decision 14 makes rarer, not one it rules out.

16. **A fleet's own cancel endpoint must not force an undock when the slot
    it releases was held by mine, not movement.** Decision 9 puts mine on
    the fleet's movement channel so a docked, mining fleet cannot also
    burn away. That means Decision 9 also makes `docked` +
    `ActiveActionId != ""` a reachable state for the first time — and
    `backend/fleet/service.go`'s `Cancel` → `haltState` was written before
    that was possible: it branches on `ModeLaneTransit`/`ModeLaneHold` and
    falls through to `board.CoastAt` for everything else, including
    `ModeDocked`. Cancelling a mine run through
    `POST /v1/fleets/:fleetId/cancel` (a plausible, undocumented-as-wrong
    path a player or client could reach) would therefore silently force
    the fleet into `coast` at the feature's hex — while the *documented*
    cancel path for the same intent, the generic
    `POST /v1/actions/:actionId/cancel` (the only one this change's own
    tasks test, 5.1), passes no actor-state patch and correctly leaves the
    fleet `docked`. Two paths to the same player intent must not produce
    contradictory results (reliability review). Fix: `haltState` gains a
    no-op branch for `ModeDocked` — a docked fleet has no motion to halt
    into a coast, so releasing a co-resident verb's slot must never move
    it. *Consequence for the spec:* `fleet-movement`'s "Cancel Halts in
    Place" is MODIFIED (not just extended by an ADDED mine requirement) —
    it is the base requirement whose branch coverage was incomplete before
    mine existed, and mine is what makes the gap reachable.

17. **Mine ledger depth is logged at every commit and resolve, not left
    unobservable.** The "Unbounded ledger growth" risk (below) is real and
    accepted, but reliability review pointed out its trigger was
    unobservable: `action/dao.go`'s `foldDeltasTx` does a full
    transactional read of every delta doc in a scope, and mine pays that
    cost at **commit** time too (the "Already-Depleted Lode" courtesy
    check), not only at resolve — so a popular lode's fold cost grows on
    every commit against it, not just once per run. Fix: every mine commit
    and resolve logs (or emits as a metric) the folded ledger key's
    resulting delta-entry count, attributed to that key, so a scope
    approaching a size that risks a slow or failing transactional fold is
    visible before it degrades production, rather than discovered as
    commit timeouts on a popular lode.

18. **`MineParams.MinRunTons` is bound by a named, configured ceiling on
    delta count, not left a bare tuning note.** DBA review: the Risks
    section already names `MinRunTons` as the mechanism that bounds ledger
    delta count (`lodeTonnage / MinRunTons`), but nothing ties it to a
    lode's typical starting tonnage — the Open Questions entry left it "not
    a blocker, tuning-time." An under-tuned default lets a single popular
    lode's fold cost grow unbounded with no spec-level guard to catch it
    before launch. We stop short of hard-coding a specific number into the
    requirement text (no number has been chosen, and a bracketed
    placeholder in a `SHALL` is not a real requirement) and instead require
    that a *named, configured* ceiling exist and be honored — the number
    itself stays a tuning decision, at implementation, same as
    `MinRunTons` itself. See "Minimum Mine Run Size Is Bounded By Lode
    Tonnage" in the spec delta and the corresponding tasks.md item.

19. **Every mine commit rejection carries a distinguishing reason in the
    response body.** UX review: this spec's commit-rejection scenarios
    (ownership, tonnage validity, dock state, resource kind, free hold,
    mining capability, lode depletion, busy slot) originally specified only
    a bare HTTP status, unlike the `gin.H{"error": "<reason>"}` convention
    `backend/fleet/handler.go`'s `RoutePreview`/`Scan`/`Order` already
    establish for the same class of problem — and which
    `frontend/lib/api-client.ts` is already written to surface, falling
    back to a generic message only when the field is absent. Decision 9
    (mine shares the movement channel with burn/travel) makes this
    concrete for the busy-slot case specifically: "movement slot busy" used
    to mean exactly one thing (the fleet is moving); after this change it
    can mean three materially different player situations (wait for a
    burn, wait for a lane trip, wait for another mine run), and an
    undifferentiated message can't distinguish them. Design.md frames mine
    as the reference implementation for future mutating verbs, so an
    unspecified convention here compounds forward onto every verb that
    copies mine's shape. Fixed by an ADDED requirement in the spec delta;
    no backend-shape decision beyond following the existing
    `backend/fleet/handler.go` convention.

## Risks / Trade-offs

- **Optimistic contested lodes** (no reservation at commit) means a
  player's preview-time "you'll get ~40t" can be wrong by the time their
  run resolves, if another fleet's earlier-ETA run against the same lode
  resolves first. This is accepted (per Decision 7 and the source spec) as
  "on-theme for the frontier" — the `outcome` string always tells the
  truth after the fact.
- **Ownership** (resolved for this endpoint, per Decision 10 — not for the
  other three): `fleet-movement`'s existing baseline documents that
  `orders`/`cancel`/`scan` currently accept any authenticated caller without
  verifying fleet ownership (the retrofit analysis's "A3"). Security review
  correctly flagged that mine widens the *consequence* of that gap, not just
  its mechanism — before this change, commanding a foreign fleet only
  repositions it (reversible, free); a mine command additionally occupies
  the victim's movement slot for the run's duration, forces cargo into its
  hold, and can consume a contested lode on the victim's behalf. Since mine
  is a brand-new endpoint, this change closes the gap at the source instead
  of inheriting it: `POST /v1/fleets/:fleetId/mine` enforces corp ownership
  at commit (see Decision 10, and `specs/mine-extraction/spec.md`'s "Mine
  Command Requires Fleet Ownership"). `orders`/`cancel`/`scan` are
  unchanged by this decision and remain tracked by
  `enforce-fleet-and-action-ownership`.
- **Unbounded ledger growth.** `deltas/{scope}/entries/*` is append-only
  forever (per `action-dispatch`'s "no materialized total" contract), and
  every resolve/read folds the full entries subcollection transactionally.
  Mine is the first verb to point this at a repeatedly-targeted, long-lived
  entity (a home-system belt many corporations will mine over the game's
  life) rather than a per-trip `systemId` scope that stays naturally small.
  `MineParams.MinRunTons` (a minimum run-size floor — see
  "Minimum Mine Run Size" in the spec delta, now bound by a named ceiling
  per Decision 18's "Minimum Mine Run Size Is Bounded By Lode Tonnage")
  bounds delta *count* per feature to `lodeTonnage / MinRunTons`, which
  keeps the immediate fold cost sane, but no compaction/checkpoint strategy
  is specified for the ledger's long-run lifecycle. Accepted as a known,
  deferred risk at today's data volumes; the commit- and resolve-time depth
  logging added by Decision 17 ("Mine Ledger Depth Is Observable" in the
  spec delta) is this risk's monitoring hook, so the trigger to act on it
  is itself observable rather than discovered as production timeouts;
  flagged as a follow-up before a popular lode accumulates enough runs
  (even at the floored, ceiling-bound minimum size) to make its per-resolve
  (and, since mine also folds at commit, per-commit) fold slow or
  expensive.
- **Undifferentiated commit-rejection messages** (raised in UX review): the
  spec's commit-precondition scenarios (ownership, tonnage validity, dock
  state, resource kind, free hold, mining capability, lode depletion, busy
  slot) did not originally require a distinguishing reason in the response
  body, unlike the established `gin.H{"error": ...}` convention already
  used by `backend/fleet/handler.go` for the same class of problem, and
  Decision 9's shared movement channel makes the busy-slot case ambiguous
  between three materially different player situations for the first time.
  Closed by "Mine Commit Rejections Report a Distinguishable Reason" in
  `specs/mine-extraction/spec.md` (Decision 19) — flagged here so the
  `hex-board-view` follow-up doesn't have to rediscover it when it builds
  the error-toast mapping.

## Migration Plan

- `fleets/{fleetId}` documents gain two new fields (`ships`, `cargo`).
  Both are additive with safe zero-values for existing fleet documents
  (`ships: []`, `cargo: {}` read as empty); no backfill required. A fleet
  read on an existing document with no `ships` array is treated as a fleet
  with a single default (`seed`-class) hull for capacity/rate derivation
  purposes — this is now a spec requirement, not just an implementation
  note (`fleet-movement`'s "Fleet Ship Composition" — renamed from "Fleet
  Ship Roster" in review to avoid collision with the unrelated
  `fleet-roster` frontend panel capability — tightened in review because
  M9 spawn already ships today, so fleet documents without `ships`/`cargo`
  already exist in `hexaverse-game-dev` Firestore — this is live data, not
  a hypothetical). `SeedFleet` itself is updated by this change to write the
  roster going forward; the fallback only matters for documents it wrote
  before that update lands.
- No changes to `features/{fid}` documents themselves. The mine delta
  ledger writes to `action-dispatch`'s generic ledger collection
  (`deltas/{ledgerKey}/entries/{actionId}`) under the **ledger key**
  `systemId + "::" + featureId + "::" + kind` (e.g.
  `sys-042::feat-belt-0::metals` — never `/`-joined; Firestore document ids
  cannot contain `/`, and a bare `systemId::featureId` key without the kind
  segment would let two kinds on one feature conflate their depletion — see
  Decision 14) — while the mine action's `Scope` stays `systemId` so its
  resolution and SSE completion stay aligned with the board (see Decision
  12). This does require an additive `action-dispatch` surface change (a
  ledger key nameable distinct from `Scope`, plus a public commit-time fold
  on `action.Service` — Decision 13); no schema change to `features/{fid}`,
  `action.Action`, or `action.Delta` is needed. The `action-dispatch`
  capability is therefore affected by this change and needs its own spec
  delta — reported to the writer.
- **Rollback of the mine feature** (reliability review): if this deploy is
  rolled back after a `mine` action has committed, `action-dispatch`'s
  existing "unregistered resolver type is skipped, not fatal" behavior
  applies unchanged: the running mine action is never resolved by the
  prior binary (no resolver registered for `type: "mine"`), so it stays
  `running` and its fleet's movement slot (`activeActionId`) stays claimed
  until either (a) a binary with the mine resolver is redeployed, or (b)
  the run is manually released via the existing generic
  `POST /v1/actions/:actionId/cancel` endpoint (forfeiting the run's yield
  — no delta, no cargo credit). This is a reversible rollback (no data
  loss, no corruption) but a stuck fleet is the visible symptom until one
  of those two things happens. This is inherited `action-dispatch`
  behavior, not new to mine — mine is only the first mutating verb this
  panel walked the rollback consequence through end-to-end; see the
  corresponding scenario added to "Mine Command Endpoint" in the spec
  delta.

## Open Questions

*(carried verbatim from `docs/specs/0010-mine.md` — not resolved here)*

- **Starting numbers** (seed hull `mineRate`/`cargoCap`, richness→tonnage
  curve, and now `MineParams.MinRunTons`, the ledger-growth-bounding minimum
  run size added in review): tuning-time, in `MineParams` with
  spike-informed defaults. Not a blocker. Owner: dev, at implementation.
  DBA review promoted the *existence* of a ceiling relating `MinRunTons` to
  a lode's typical starting tonnage from an implicit assumption to a named
  spec requirement ("Minimum Mine Run Size Is Bounded By Lode Tonnage,"
  Decision 18) — the specific numbers on both sides of that ratio remain
  this same open, implementation-time tuning question.
- **Belt coasting as "docked"**: does coasting *inside* a belt arc count as
  docked to the belt? Nice texture, zero slice value (docking to the belt
  feature works today). Deferred to when orbital motion turns on.

- **Where the remaining-tonnage read projection lands** (raised in review,
  not a blocker for this write-only change): making Decision 7's depletion
  *visible* needs a read that folds the lode ledger into
  `remaining = startTons + fold`. That is a backend read change (a
  `system`/board handler projecting remaining, fog-filtered per
  `observation-fog-and-scan`) plus its frontend readout — naturally the same
  `hex-board-view` follow-up that carries `useMine()`. Owner: orchestrator,
  when sequencing the follow-up. This change must not claim visible depletion
  as delivered.

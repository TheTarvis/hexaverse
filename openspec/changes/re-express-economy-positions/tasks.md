## 1. Belt member model (`system-interior`)

- [x] 1.1 No code change: the belt feature itself accepts a mine commit on
      the same preconditions as any other resource-bearing feature —
      confirm with a test that a mine commit naming a belt feature's own
      id introduces no belt-specific rejection
      (`system-interior`: "A Belt's Members Are Discrete Mineable Bodies On
      a Shared Radius" — "The belt feature remains mineable alongside its
      members")

## 2. Belt member resolution and input validation (`mine-extraction`)

- [x] 2.1 Implement `featureId` validation in `mine.Commit` in two phases.
      A lexical phase, run before the string is parsed for the `#`
      separator at all: reject a string containing `/`; equal to `.` or
      `..`; matching the regular expression `^__.*__$`; or exceeding
      `MineParams.MaxFeatureIdBytes` (default 256 bytes, measured as UTF-8
      bytes). A resolution phase, run only on a string the lexical phase
      passed, after the `#` is parsed but before the resulting prefix is
      used to resolve any target: reject a string containing more than one
      `#`; carrying a `#` whose suffix is not a base-10 integer in
      `[0, AsteroidsPerBelt)`; or carrying a `#` whose prefix does not
      resolve, in the fleet's own current system, to an existing feature
      of the belt type. Each rejection carries its own distinguishable
      reason, surfaces as `400 Bad Request`, and creates no action
      (`mine-extraction`: "A Client-Supplied Feature Id Is Validated Before
      Resolution" — "A featureId containing a path separator is rejected
      before parsing"; "A featureId of exactly `.` or `..` is rejected
      before parsing"; "A reserved dunder-pattern featureId is rejected
      before parsing"; "An overlong featureId is rejected before parsing";
      "A featureId at the maximum configured length is not rejected on
      length grounds"; "A featureId one byte past the maximum configured
      length is rejected"; "A featureId with more than one member
      separator is rejected"; "A member suffix outside the valid index
      range is rejected"; "A member prefix that does not resolve to a
      belt feature is rejected")
- [x] 2.2 Wire this validation to run strictly after the ownership check
      and the not-docked rejection, never before — add a test asserting an
      unresolvable/malformed `featureId` never surfaces its own rejection
      ahead of ownership or dock-state failures
      (`mine-extraction`: "An unresolvable member rejection never precedes
      ownership or the not-docked rejection")
- [x] 2.3 Extend `mine.Commit`'s target resolution to recognize a
      validated member `featureId`, split it on its first `#`, and locate
      the parent belt feature in `interior.Features` by the validated
      prefix, rather than searching for the member id itself, resolving
      the member's mineable resource kinds and richness as the parent
      belt feature's own `resources` field, never an independent set of
      its own — add a test asserting a mine commit resolved through a
      member exactly matches the parent's richness for a kind the parent
      carries, and is rejected as an unknown kind for one it does not
      (`mine-extraction`: "Belt Member Targets Resolve Through Their
      Parent Belt Feature" — "A fleet docked to a belt member can mine its
      inherited resource kind"; `system-interior`: "A Belt's Members Are
      Discrete Mineable Bodies On a Shared Radius" — "A member's mineable
      resource kinds match its parent belt exactly")
- [x] 2.4 Compute a resolved member target's `startTons` via the parent
      belt feature's own richness-derived computation, exactly as a direct
      mine of the belt feature computes it — no split, no per-member
      quantity
      (`mine-extraction`: "Belt Member Targets Resolve Through Their
      Parent Belt Feature")
- [x] 2.5 Compose the run's ledger key from the **resolved parent**
      feature's own id and the acting fleet's own stored `systemId` —
      never the client-supplied `featureId` string and never a
      client-supplied system identifier
      (`mine-extraction`: "A resolved run's ledger key never contains the
      raw client string or a client-supplied system id"; "Ledger Key Is
      System-And-Kind-Qualified, Channel Scope Is Per-System")
- [x] 2.6 Add a test asserting a run committed via a belt member id and a
      run committed by naming that belt feature's own id directly fold
      the identical ledger key and each deplete what the other can still
      yield
      (`mine-extraction`: "A member's mine run depletes the same lode as
      its parent belt feature"; `system-interior`: "A Belt's Members Are
      Discrete Mineable Bodies On a Shared Radius" — "A member's mining
      draws from and depletes the belt's one shared lode")
- [x] 2.7 Confirm (add a test if none exists) that a fleet docked to a
      member, naming the parent belt feature's id in a mine commit, still
      fails the existing `ErrNotDocked` check — no code change expected,
      since `DockedTo()`'s `host != req.FeatureId` comparison already
      covers this
      (`mine-extraction`: "Naming the belt feature while docked to one of
      its members is rejected as not docked")
- [x] 2.8 Update "Mine Commit Preconditions"'s docstring/comment in
      `mine/service.go` to describe the resolved-target generalization
      (named feature, or a member's validated-and-resolved parent belt)
      and the two-phase (lexical, then resolution) validation-ordering
      guarantee, so the code comment matches the spec text
      (`mine-extraction`: "Mine Commit Preconditions")
- [x] 2.9 Add a test asserting a fleet parked near (but not attached to) a
      body — e.g., a fresh jump arrival parked near a gate — cannot mine
      it, if no existing test already exercises this distinction
      (`mine-extraction`: "A fleet parked near a body but not attached to
      it is rejected")
- [x] 2.10 Add a test pair asserting `MineParams.MaxFeatureIdBytes`'s
      boundary against ONE base id differing by a single byte: at exactly
      the configured maximum, a resolvable resource-bearing feature id is
      accepted and an action is created; the same id plus one ASCII byte
      is rejected with the overlong reason, distinct from every other
      rejection reason
      (`mine-extraction`: "A featureId at the maximum configured length is
      not rejected on length grounds"; "A featureId one byte past the
      maximum configured length is rejected")
- [x] 2.11 Extend the rejection-reason distinguishability test to cover
      every new `featureId` validation failure alongside the existing
      preconditions, asserting each surfaces a `4xx` response carrying a
      reason distinct from every other rejection in the list — never a
      bodiless `5xx`
      (`mine-extraction`: "Mine Commit Rejections Report a Distinguishable
      Reason" — "Each commit rejection reason is distinguishable from the
      others")

## 3. Attachment host, masking, and dock-predicate documentation

- [x] 3.1 No code change: `fleet/resolver.go`'s attach-on-resolve write
      already reads only the resolved burn's own target body id, class-
      blind. Verify this remains true (grep for any type/class branch on
      the attach path) before archiving
      (`fleet-movement`: "Every Body In the System's Body Table Is a Valid
      Attachment Host" — "A fleet may attach to any body class present in
      the system")
- [x] 3.2 No code change: confirm an order naming the system's star is
      rejected by `space.BuildCurve`'s endpoint-clearance guard before any
      settled park (and therefore any attach) is reached
      (`fleet-movement`: "Ordering the star is rejected before any
      attachment step is reached")
- [x] 3.3 No code change: confirm a point-targeted burn whose solved park
      happens to land coincident with, or near, some body leaves
      `attachedTo` empty; add a test if none exists
      (`fleet-movement`: "A point-targeted park coincident with a body
      does not attach")
- [x] 3.4 No code change: confirm the focused-scan masking predicate
      matches only the exact host id named, never a sibling under a
      shared parent — add a test in `backend/disclosure`'s suite (a belt
      feature and one of its members as two distinct host ids) if none
      exists
      (`fleet-movement`: "A sweep of a belt feature does not reveal a
      fleet masked at one of its members")
- [x] 3.5 No code change: confirm `stations` docking resolves through
      `Fleet.AttachedTo` alone, with no board-cell or lattice predicate of
      its own, by grepping `stations/*.go` and `mine/`/`market/` for any
      co-location check beyond `DockedTo()`
      (`trading-station`: "Docking to the station involves no lattice
      predicate")
- [x] 3.6 Add a test (if none exists) covering a fleet parked near, but not
      attached to, the buying station, asserting the sale is rejected
      (`goods-sale`: "A fleet parked near the station but not attached to
      it cannot sell")
- [x] 3.7 Add an integration test that commits a burn order naming a
      derived belt-member body id (e.g. `feat-belt-0#3`), asserting
      `OrderTo`'s body-existence check accepts it and the run resolves to
      a settled `attachedTo` exactly equal to that member id — the
      load-bearing precondition every belt-member resolution test in
      section 2 otherwise only exercises via a stubbed `FleetSource`
      (`fleet-movement`: "Every Body In the System's Body Table Is a Valid
      Attachment Host" — "A fleet may attach to a belt member or the belt
      feature alike")
- [x] 3.8 Make `fleet`'s read path degrade on an unresolvable attachment
      host: `toDTO` (`backend/fleet/handler.go:362`) currently returns
      every non-`ErrFleetInTransit` error from `PositionOf`, so a stored
      `attachedTo` absent from the body table 500s the read via
      `space.ErrUnknownBody`. Treat `space.ErrUnknownBody` the way
      `ErrFleetInTransit` is already treated — no position reported, the
      fleet still returned, the unresolved host id logged
      (`fleet-movement`: "A fleet attached to a body the table no longer
      resolves degrades, never panics")
- [x] 3.9 Add a test asserting that degrade for both derived-id cases (a
      belt member index beyond a retuned `AsteroidsPerBelt`, and a lane
      gate a degraded gate read omits)
      (`fleet-movement`: "A fleet attached to a body the table no longer
      resolves degrades, never panics")

## 4. Board view wording

- [x] 4.1 Update `frontend/components/board/*` mine-offer test fixtures
      and/or copy, if any literally reference "same cell" language, to
      match the dock-state wording (no behavior change — this is a spec
      wording fix; verify no test string needs updating)
      (`board-view`: "Mine is not offered when merely co-located, not
      docked")
- [x] 4.2 Update `frontend/components/board/*` sell-offer test fixtures
      and/or copy, if any literally reference "same cell" language, to
      match the dock-state wording (no behavior change; this is the mine
      scenario's sibling under a separate requirement)
      (`board-view`: "Sell is not offered when merely co-located, not
      docked")

## 5. Hygiene — stale comments and dangling cross-references

- [x] 5.1 Fix `backend/stations/placement.go`'s doc comment: correct the
      change id from `re-anchor-mine-market-stations` to
      `re-express-economy-positions`, and correct "dies at link 6" to "dies
      at link 8-9" per the Q1 ruling that placement/orbit retention
      survives until the renderer is replaced. Leave the rest of the
      comment's lattice framing (the description of `DeriveOrbit` itself,
      the `hexaverse/board` import it explains) untouched — link 9 deletes
      `DeriveOrbit` and that import wholesale, so editing surrounding
      prose two links early buys nothing beyond these two corrected facts
- [x] 5.2 Fix `backend/system/station_continuous.go`'s doc comment with
      the same two corrections as 5.1, and the same note: the surrounding
      lattice-contrast prose is left as-is, pending link 9
- [ ] 5.3 At archive time, replace `openspec/specs/system-interior/
      spec.md`'s `## Notes for future maintainers` cross-reference to
      `observation-fog-and-scan` with a pointer to `focused-scan` (the
      verb) and `sighting-records` (its product) — NOT done by this
      change; `openspec/specs/` changes only on archive (see design.md
      Decision 4; precedent: `pin-cross-stack-determinism-seam` tasks.md
      3.1)
- [x] 5.4 Leave `openspec/specs/board-tactical-math/spec.md`'s own
      `observation-fog-and-scan` reference untouched — link 9 deletes that
      spec outright (do not re-open; see design.md Decision 4)

## 6. Lattice-symbol regression guards

- [x] 6.1 Add `backend/mine/lattice_symbols_absent_test.go` (mirroring
      `backend/fleet/lattice_symbols_absent_test.go`'s pattern), asserting
      `mine`'s non-test source files contain no `hexaverse/board` import
      and no `board.` symbol reference, pinning the B1 baseline (already
      zero) against regression. Scope the scan to CODE, not comment
      text — parse each file with `go/parser` and inspect its import set
      and selector expressions, never a raw `strings.Contains` over the
      file bytes (the `fleet` precedent's raw scan is safe only because
      none of its target symbols appear in prose; `board.` does)
      (`mine-extraction`: "Mine Commit Preconditions" — the not-docked
      check this guards is implemented entirely via `fleet.DockedTo()`)
- [x] 6.2 Add `backend/market/lattice_symbols_absent_test.go` with the
      same AST-based scan, scoped to `market`'s non-test source files.
      Note `market/handler.go:33` and `market/service.go:146` both
      contain the literal text `board.` inside comments ("price board.
      GET", "the whole board."), so a raw text scan fails on the current
      tree and must not be used
      (`goods-sale`: "Sale Requires the Fleet Docked To the Buying
      Station")
- [x] 6.3 Add `backend/stations/lattice_symbols_absent_test.go` asserting,
      over parsed ASTs, that the `hexaverse/board` import appears only in
      `placement.go` and `service.go`, and that within `service.go` every
      `board.` SELECTOR EXPRESSION lies inside `FeatureOf`; an import or
      selector in any other file of the package fails the guard. Comment
      text is out of scope — `stations/model.go:37` and
      `stations/service.go:53,204,212` all mention `board.` in prose
      today and must not trip it. This is scoped by file and by call
      site, not by symbol name — `stations` never imports `ModeDocked`,
      `Within`, or `LineOfSight` today, so a symbol-name list would assert
      nothing — while still allowing `placement.go` and `FeatureOf`'s
      `Footprint` derivation to keep their `board` import per Q1
      (`trading-station`: "Docking to the station involves no lattice
      predicate")

## 7. Validation

- [x] 7.1 `go test ./mine/... ./system/... ./fleet/... ./stations/...
      ./market/... ./disclosure/... -short` green, including the new
      belt-member-resolution, validation-ordering, attachment-host,
      masking, and lattice-symbol-absence tests
- [x] 7.2 `openspec validate re-express-economy-positions --strict` passes
- [ ] 7.3 Update `docs/plans/continous_space/chain.md`'s Link 6 section to
      match this proposal's corrected scope (predicate migration already
      done at link 4; `board.Within`/`LineOfSight` already have no
      production caller; the real work is belt-member resolution and
      input validation, attachment-host documentation, the retained
      `trading-station` placement requirement's corrected intercept
      clause, and cross-reference hygiene — a belt stays one lode, not
      eight) once this change is approved

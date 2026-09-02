# Link 6 — adversary round 2: findings + orchestrator rulings

Verdict: **BLOCKED** — 1 blocker, 3 majors, 2 minors, ALL in text added in round 1's repair.

**Round-1 status: 16 of 17 FIXED, 1 PARTIAL (MAJOR 7 → superseded by NEW-1 below).
Mechanical archive checks re-verified CLEAN**: 8 MODIFIED blocks, 27 live scenario
headings, zero dropped — including all three blocks added last round; all 7 target
capabilities exist; all 34 task citations resolve; `--strict` passes.
**Do not re-litigate any of that.** This is round 3 of 3: verification-only in shape —
every fix below is a scenario rewrite, one requirement sentence, one task split, and
two task re-wordings. No new design surface.

**ALL SIX ARE ACCEPTED.** Use the adversary's paste-ready text verbatim.

---

## NEW-1 (BLOCKER) — the degrade scenario forbids the codebase's own idiom, defines no positive outcome, and has no implementing task

Notable: this is the adversary's OWN round-1 MAJOR 7 text, which it now reports does
not survive contact with the code. Three verified problems with
`specs/fleet-movement/spec.md:31-37` and its scenario at `:87-94`:

1. **It is a behaviour change, not a restatement.** `space.Position` returns
   `ErrUnknownBody` for an absent body (`backend/space/body.go:57-59`), which
   propagates through `space.StatePosition` → `fleet/service.go:377-382` →
   `fleet/handler.go:366-370`, where `toDTO` returns any non-`ErrFleetInTransit` error
   and `Get` hands it to `respond` unmapped → **500**. So "never a failed read"
   mandates new code — while `proposal.md:59-64` says "**No code change**" and Impact
   lists `backend/fleet/` as "(attachment-host and masking **tests**)", and task 3.8
   says only "**Add a test**". The implementer runs the test, it fails, and no task
   tells them what to build.
2. **The cited analogue is the wrong shape.** `trading-station`'s station outcome is
   "**omitted** from the read". Transposed to a fleet that means 404-ing a player's own
   fleet because one derived id went stale — and an implementer could ship exactly that
   and satisfy the scenario.
3. **"Never a position at the origin" forbids the established precedent.**
   `fleet-movement`'s *Effective Position Resolution* says a jumping fleet "SHALL report
   NO position", implemented as `pos = space.Vec3{}` (the origin) with `Jump` as the
   discriminating field (`fleet/handler.go:365-371`). The one prohibition rules out the
   one degrade the codebase already uses, and names no replacement.

**Fix.** Replace the requirement paragraph at `specs/fleet-movement/spec.md:31-37`:

```
If a stored `attachedTo` names a body the current body table no longer
resolves — a derived id whose defining tuning constant was retuned after
attachment (a belt member index beyond a retuned `AsteroidsPerBelt`), or a
lane gate a degraded gate read omits — a read of that fleet SHALL still
succeed, returning the fleet with its stored `attachedTo` unchanged and
NO position, the same absent-position shape "Effective Position
Resolution" already defines for a jumping fleet, and SHALL record the
unresolved host id. It SHALL NOT panic, SHALL NOT omit the fleet from the
read, and SHALL NOT silently substitute a position derived from anything
other than the named host.
```

and the scenario at `:87-94`:

```
#### Scenario: A fleet attached to a body the table no longer resolves degrades, never panics
- **GIVEN** a fleet whose stored `attachedTo` names a derived body absent
  from the current body table (a belt member index beyond a retuned
  `AsteroidsPerBelt`, or a lane gate omitted by a degraded gate read)
- **WHEN** the fleet is read
- **THEN** the read succeeds, the fleet is present in the response with
  its stored `attachedTo` unchanged and no position reported (the same
  absent-position shape a jumping fleet reports), the unresolved host id
  is recorded, and no panic occurs
```

and split task 3.8 into implementation + test:

```
- [ ] 3.8 Make `fleet`'s read path degrade on an unresolvable attachment
      host: `toDTO` (`backend/fleet/handler.go:362`) currently returns
      every non-`ErrFleetInTransit` error from `PositionOf`, so a stored
      `attachedTo` absent from the body table 500s the read via
      `space.ErrUnknownBody`. Treat `space.ErrUnknownBody` the way
      `ErrFleetInTransit` is already treated — no position reported, the
      fleet still returned, the unresolved host id logged
      (`fleet-movement`: "A fleet attached to a body the table no longer
      resolves degrades, never panics")
- [ ] 3.9 Add a test asserting that degrade for both derived-id cases (a
      belt member index beyond a retuned `AsteroidsPerBelt`, and a lane
      gate a degraded gate read omits)
      (`fleet-movement`: "A fleet attached to a body the table no longer
      resolves degrades, never panics")
```

**Also correct `proposal.md:59-64`'s "No code change" claim and Impact's
`backend/fleet/ (attachment-host and masking tests)` to name the degrade fix.**

## NEW-2 (MAJOR) — the `MaxFeatureIdBytes` boundary pair reproduces BLOCKER 1's failure mode

`specs/mine-extraction/spec.md:82-96`. The at-max THEN ("the length check does not
reject the commit — it proceeds to the remaining checks on its own merits") is
vacuously true with no length check at all, and the one-past THEN carries **no
distinctness clause**, unlike its seven siblings. An implementer with no length check
submits a 257-byte id with a `#` and a bad prefix, gets the unresolvable-prefix
rejection, and passes both. Task 2.10 inherits the hole verbatim.

**Fix** — make the pair differ in exactly one byte and assert opposite outcomes:

```
#### Scenario: A featureId at the maximum configured length is not rejected on length grounds
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId` — a resolvable, resource-bearing
  feature's own id whose UTF-8 byte length is exactly
  `MineParams.MaxFeatureIdBytes`
- **WHEN** a mine commit is submitted naming that `featureId` and a kind
  that feature carries
- **THEN** the commit is accepted and an action is created

#### Scenario: A featureId one byte past the maximum configured length is rejected
- **GIVEN** the same fleet and the same `featureId` extended by one ASCII
  byte, with `attachedTo` set to the extended string
- **WHEN** a mine commit is submitted naming that extended `featureId`
- **THEN** the commit fails with `400 Bad Request` and the overlong-id
  reason — distinct from the not-docked, unknown-kind, and every other
  id-validation reason — and no action is created
```

and task 2.10:

```
- [ ] 2.10 Add a test pair asserting `MineParams.MaxFeatureIdBytes`'s
      boundary against ONE base id differing by a single byte: at exactly
      the configured maximum, a resolvable resource-bearing feature id is
      accepted and an action is created; the same id plus one ASCII byte
      is rejected with the overlong reason, distinct from every other
      rejection reason
      (`mine-extraction`: "A featureId at the maximum configured length is
      not rejected on length grounds"; "A featureId one byte past the
      maximum configured length is rejected")
```

## NEW-3 (MAJOR) — "no predicate consumes it" is false and collides with a requirement this change retains

`specs/trading-station/spec.md:24-26` claims the lattice derivation is retained "solely
to supply the board renderer's `Footprint` … no predicate consumes it". But
`backend/stations/service.go:223-236` consumes the derived ring in a live,
read-affecting predicate (the `ErrStationRingOutOfRange` omission), which is normative
under *A Station Orbit Outside the Live Board Radius Is Omitted, Never Panicked* — a
requirement `proposal.md:149-151` explicitly RETAINS. And NEW-1's degrade scenario
points at that very predicate as its analogue. An implementer could read this as licence
to delete the ring-range guard.

**Fix** — replace the final clause:

```
…with no new intercept case and no `board.OrbState` resolution. The
lattice ring/slot derivation this requirement defines is retained to
supply the board renderer's `Footprint` until the renderer is replaced;
no position, dock, or intercept predicate consumes it. Its one remaining
non-renderer consumer is this capability's own out-of-range omission
check ("A Station Orbit Outside the Live Board Radius Is Omitted, Never
Panicked"), which is retired alongside the derivation at link 8/9.
```

## NEW-4 (MAJOR) — tasks 6.1–6.3's guards fail on the current tree as worded

The named precedent (`backend/fleet/lattice_symbols_absent_test.go:56-64`) is a raw
`strings.Contains` over whole source files, **comments included**. `board.` appears in
prose today at `market/handler.go:33`, `market/service.go:146`, `stations/model.go:37`,
and `stations/service.go:53,204,212` (the last three outside `FeatureOf`). As worded the
implementer either weakens the guard silently or edits unrelated comments to appease a
string match.

**Fix** — scope the scan to CODE via `go/parser`, not file bytes:

```
- [ ] 6.1 … Scope the scan to CODE, not comment text — parse each file
      with `go/parser` and inspect its import set and selector
      expressions, never a raw `strings.Contains` over the file bytes
      (the `fleet` precedent's raw scan is safe only because none of its
      target symbols appear in prose; `board.` does).
- [ ] 6.2 Add `backend/market/lattice_symbols_absent_test.go` with the
      same AST-based scan, scoped to `market`'s non-test source files.
      Note `market/handler.go:33` and `market/service.go:146` both
      contain the literal text `board.` inside comments ("price board.
      GET", "the whole board."), so a raw text scan fails on the current
      tree and must not be used
      (`goods-sale`: "Sale Requires the Fleet Docked To the Buying
      Station")
- [ ] 6.3 Add `backend/stations/lattice_symbols_absent_test.go` asserting,
      over parsed ASTs, that the `hexaverse/board` import appears only in
      `placement.go` and `service.go`, and that within `service.go` every
      `board.` SELECTOR EXPRESSION lies inside `FeatureOf`; an import or
      selector in any other file of the package fails the guard. Comment
      text is out of scope — `stations/model.go:37` and
      `stations/service.go:53,204,212` all mention `board.` in prose
      today and must not trip it. …
```

## NEW-5 (MINOR) — ACCEPT. `design.md:130-131` still cites the pre-rename requirement name ("A Client-Supplied **Member** Feature Id…"). One word; it is the exact drift the rename existed to remove.

## NEW-6 (MINOR) — ACCEPT. Change `specs/mine-extraction/spec.md:17-18` to "Each rejection carries its own distinguishable reason" (task 2.1 already words it that way), removing the singular/per-phase tension for free.

## Also worth closing while you are in there (adversary's "soft spot", orchestrator ACCEPT)
Task 2.1 cites its requirement then gestures at "the lexical- and resolution-phase
rejection scenarios" instead of naming them — nine scenarios hang off it with no
verbatim citation. Name them explicitly, as every other task does.

# Security review — `fix-burn-order-geometry-refusals` (spec phase, panel)

*Written by the security reviewer, 2026-10-04. Read-only review: the spec deltas, proposal,
tasks, rulings, analysis sections 3 and 12, and the current code were read; nothing was run.*

**Finding counts: BLOCKER 0, MAJOR 0, MINOR 3, ADVISORY 2. Verdict: SECURITY-CLEAR.**

The three MINORs are hardening on spec wording. Each fits inside an existing task (2.6, 2.9,
2.11/2.12), so the change stays at 33 tasks.

## The questions asked

**1. Do the new refusal bodies disclose anything fog or ownership hides? No.**

- **Bodies are public.** Every body in a system ships to every authenticated requester
  (`backend/system/fog.go:10-14`, citing `system-interior` "Bodies Are Public; Ships Are
  Disclosed"). The body table the solve reads is unfogged by design
  (`backend/system/bodies.go:146-199`). "This body id is not in the system" therefore tells the
  owner nothing an interior read does not already serve.
- **The absent-body oracle is not new.** Today the same request distinguishes present from
  absent as 200-with-a-solved-curve against a bodyless 500. The change renames the 500 to a 404.
- **Origin and destination reasons** describe the requester's own fleet and the requester's own
  chosen target. The reasons are reachable only after the ownership check (below).

**2. Is authz evaluated before any solve refusal on all three routes? Yes in the code; the
delta pins it on one route only (MINOR 1).**

- `Order`, `OrderPreview` and `Stop` each call `commandedFleetId` first
  (`backend/fleet/handler.go:223`, `:253`, `:346`), ahead of body binding and the service.
- That seam serves the bodyless 404 for absent, foreign and corpless alike, from a
  non-settling read (`handler.go:179-201`).
- Live text already binds it: `fleet-movement/spec.md:765-835` (owner restriction, one deny
  scenario per verb) and `:2371-2377` (check precedes settlement).

**3. Reason-bearing 404 (absent body) against bodyless 404 (foreign or unknown fleet):
distinguishable, and fine.**

- The reason-bearing 404 is reachable only by the fleet's owner.
- A foreign requester gets the bodyless 404 whatever body id they name, so the two shapes do
  not let anyone tell a foreign fleet from a nonexistent one.
- Precedent: `galaxy.ErrLaneNotFound` and `ErrScanHostUnresolved` are already reason-bearing
  404s beside the bodyless one (`handler.go:553-558`, `:588-593`).

**4. Does RULING 5 (no error-level log for a served refusal) suppress genuine faults? Not as
specified, but one fault can be misclassified into the quiet 404 (MINOR 2).**

**5. Client-controllable error-budget noise: closed for the three sentinels this change maps.
One candidate remains, already filed by task 5.4 (ADVISORY A).**

**6. Spawn criterion (d): no security surface.** It is a pure predicate over galaxy-tier data
with no requester input. It only narrows the candidate set, and the existing
`MaxSpawnWalkBlocks` rail and the strict rate limit on spawn (`backend/router.go:177`) are
unchanged.

## Findings

### MINOR 1 — the foreign-fleet deny scenario covers `orders` only, and not with a refusal-triggering request

**Where:** `specs/fleet-movement/spec.md:64-66`, scenario "An unknown fleet still answers a
bodyless 404".

**Attack if the ordering regresses.** The new reasons are a function of the fleet's kinematic
state. If any arm were reachable ahead of the ownership check, a foreign corporation could:

- preview a far point against fleet F and read "origin inside clearance" or not, learning
  whether F is inside the star clearance;
- preview body X against F and read the minimum-arc reason, learning which body F is docked at;
- call stop on F and read origin against destination reasons, learning F's position and heading
  relative to the star.

None of these is disclosed to a foreign requester by any other path.

**Why MINOR.** The code is ordered correctly today and the live requirement at
`fleet-movement/spec.md:765` already binds it. But task 2.10 adds a new origin test "before the
solve", and the delta's only deny scenario exercises one route with an unspecified request. A
deny-path test that sends a benign order would pass even if a refusal arm leaked.

**Fix.** Replace the scenario body (heading kept verbatim). Fits in task 2.6.

```
#### Scenario: An unknown fleet still answers a bodyless 404
- **GIVEN** a fleet F owned by another corporation, positioned so that its owner would be served each of the origin-inside, destination-inside, minimum-arc and absent-body refusals
- **WHEN** a foreign requester, and separately a requester with no corporation, submits each of those four requests to `orders` and `orders/preview` for F, and stop-in-place for F, and again for a fleet id that does not exist
- **THEN** every response is `404` with no body, byte-identical between F and the nonexistent fleet id
- **AND** no clearance, minimum-arc or absent-body reason is served, and F's stored record is unchanged
```

### MINOR 2 — a broken parent chain on the target body can be served as the quiet absent-body 404

**Where:** `specs/fleet-movement/spec.md:53` and `:90`; tasks 2.11 and 2.12.

**Evidence.** `space.ErrUnknownBody` reaches the solve error from three places:

- the named target id is absent (`backend/space/burn.go:247-249`) — the player-causable case;
- the target exists but a body in its parent chain does not (`backend/space/body.go:56-58`,
  reached from `burn.go:251` and the park position at `burn.go:270`) — a data fault;
- the fleet's own stored host is absent (`backend/fleet/service.go:678`) — a data fault, and the
  only one task 2.12 separates.

**What goes wrong.** A `respond` arm written as `errors.Is(err, space.ErrUnknownBody)` on the
solve error serves the second case as a 404 that tells the player the body "is not present",
with no error-level log. A corrupted body table then produces no alert, and RULING 5 has
suppressed a genuine fault. The requirement's own wording ("a target body id that is not in the
system's body table") excludes this case, but neither the fault list at `:90` nor any scenario
names it.

**Fix.** Decide absence by a table lookup of the requested id, and add the case to the fault
requirement. Fits in tasks 2.9 and 2.12.

Append to the requirement text at `:90`, after "a body-table cycle":

```
, a target body that is present in the body table but whose parent chain names a body that is not,
```

Add under "Internal Faults on the Burn Routes Remain Server Errors":

```
#### Scenario: A present target whose parent is missing is a 5xx, not the absent-body 404
- **GIVEN** a system whose body table holds a body whose stored parent id is not in the table
- **WHEN** an order, and a preview, naming that body are submitted
- **THEN** each response is `5xx` and not the absent-body `404`
- **AND** an error-level log entry is written
```

Add one line to the existing scenario "A fleet whose stored host no longer resolves is still a
5xx" (`:98-101`), which currently asserts the status but not the log:

```
- **AND** an error-level log entry is written
```

### MINOR 3 — the reason text is not required to be fixed

**Where:** `specs/fleet-movement/spec.md:4`, `:39`, `:53`; task 2.11.

**Evidence.** The neighbouring arms serve `err.Error()` (`backend/fleet/handler.go:558`, `:593`).
The solve errors are wrapped with route-specific prefixes: `fleet: solving burn: ...`
(`service.go:722`) and `fleet: solving stop burn: ...` (`service.go:1350`).

**What goes wrong.** Copying the neighbouring pattern serves the wrapped internal chain, which
differs between `orders` and stop and so breaks the same-reason rule. If an implementer adds the
offending id to the absent-body reason, the response reflects a request-supplied string of
unbounded length (no `http.MaxBytesReader` on these routes, and `OrderRequest.BodyId` has no
length limit, `backend/fleet/model.go:172`). The frontend maps reasons by substring to fixed
copy (`frontend/lib/rejection-copy.ts:65-77`), so this is not script injection today; it is
response and log amplification, and a reason that changes with the input.

**Fix.** Add one sentence to "Burn Solve Refusal Reasons Are Pairwise Distinct" (`:69`). Fits
in task 2.7.

```
Each reason SHALL be a fixed string: it SHALL NOT contain the requested body id, the requested point, any coordinate of the fleet, or the text of a wrapped internal error.
```

And one line on the scenario "Four refusals yield four different reason bodies":

```
- **AND** the absent-body reason is byte-identical for two different absent body ids
```

## Advisories

### ADVISORY A — an out-of-extent point target is the remaining client-controllable 5xx candidate (unverified, already filed by task 5.4)

- `OrderRequest.Point` has no magnitude check before the solve. `checkedCoordinate`
  (`backend/space/params.go:107-116`) runs on decode only; `EncodeBurn`
  (`backend/space/codec_state.go:68`) does not call it.
- **Inferred, not observed:** an owner posting a point far beyond the extent can either get a
  5xx from the solve or the JSON encoder (a preview serialising a non-finite value), or store a
  burn that later fails to decode, which would turn every command on that fleet into a logged
  5xx (`fleet.ErrKinematicDecode`, kept 5xx by this change at `:90`).
- It is self-inflicted on the owner's own fleet, so there is no access issue. It matters here
  because the proposal's stated aim is to end 5xx noise from client-controllable input, and
  RULING 6 asked for a sweep of the whole family.
- **Recommendation:** keep it out of scope, but make task 5.4's note state both outcomes above
  and the fix shape (a `400` in `backend/fleet` against the body table's extent, no edit under
  `backend/space`). If the adversary or SDET confirms the stored-undecodable outcome, it should
  be its own change, not a note.

### ADVISORY B — refusals become invisible in logs; rate protection is unchanged

- After RULING 5 a served refusal writes nothing at error level, and the spec does not ask for
  any other level. A client looping refusals leaves a trace only in the audit middleware.
- Each refused request still costs a body-table build. The fleet routes sit under the general
  per-IP limit only (600 per minute, `backend/router.go:88`, `:188`), not the per-corporation
  write quota (`:216-232`). That is unchanged by this change and a refusal is cheaper than a
  success, so it is not a finding.
- **Suggestion, no spec text needed:** log a served refusal at info or debug with the fleet id
  and refusal kind. The scenario at `:85-87` forbids error level only, so this is permitted as
  written.

## Checked and found clean

- No new endpoint, field, stored shape, secret or dependency.
- No free text reaches a renderer: reasons map to fixed copy lines.
- Body binding and the `400` for a malformed body happen after the ownership check on `orders`
  and `orders/preview`; stop takes no body.
- The claude-agent path uses token passthrough and reaches the same handler seam.
- "A Served Burn Solve Refusal Leaves No Trace" does not conflict with the settlement the
  owner's own request legitimately triggers before the solve; that runs only after
  authorization.

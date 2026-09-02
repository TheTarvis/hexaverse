## Why

The continuous-space PoC (`frontend/app/spike/space-3d/`) proved the feel —
real orbits, curved burns, a settle-on-read fold — and links 1–7 have since
given the backend everything the PoC only sketched: real bodies and lane
gates in `backend/space`, proximity disclosure, continuous-burn fleets,
sighting-backed knowledge, minable positions, and fuel as cargo. The only
playable tactical view left is still `board-view`'s polar ring-and-slot
lattice, which link 4 already stripped of its fleet layer and which cites
one requirement header that no longer exists. Graduating the PoC into a
production view and retiring the lattice view is the one thing standing
between the backend that exists today and `delete-the-lattice` (link 9),
which cannot remove `backend/board`/`backend/polar` while `system-interior`
still promises their wire fields to a caller.

## The split, and why neither half is a deferral

This change is the second of two, ruled by its own panel review (H7). The
first, **`serve-orbital-elements-and-burn-preview`**, carries the backend
half — orbital elements on the body and lane-gate DTOs, the burn-preview
endpoint, the quoted fuel cap, and the station-keeping upkeep rate. It is
**purely additive**, which is what makes the split safe: it removes no field,
so there is no coexistence period and no feature flag, and the lattice view
keeps working untouched while it is in flight.

**Neither half is a deferral.** This change cannot render a moving system or
price a burn without the first; the first is dead code until this change calls
it. They are one review's output with one successor each. The decisive reason
to sequence rather than merge them is that an SDET can write the failing
wire/preview contract suite **before either developer starts** — which this
change's atomic-swap risk profile demands, since the lattice view is deleted in
the same change that replaces it.

**Link 9 (`delete-the-lattice`) is blocked on BOTH this change and
`add-scan-and-sightings-surface` (8b) — not on this change alone.** 8b carries
the focused scan's entire player-facing half (the command surface and the
sightings display, together — the scan's client half has already been deferred
once, at link 5, where it became a dead derivation:
`frontend/hooks/use-actions.ts`'s `useRunningScan` exists today with zero
consumers). What must NOT happen is 8b's own two halves being separated from
each other, or the scan surface being deferred out of the chain a second time.

## What Changes

- **ADD `system-space-view`** (new capability): the continuous-R³ per-system
  route — data fan-in over two independently-failing reads, single selection
  among a body/lane-gate/point, own-fleet position/curve/ghost rendering,
  foreign-contact rendering, the server-solved burn preview and its failure
  states, the quote-locked burn commit and its outcome reporting, one unified
  burn-command path for a body, a lane gate, or a point, double-submit guards
  on burn and jump, jump commit, departure hand-off scoped to the acting
  fleet, roster cross-navigation, realtime refetch rules, live-region
  announcement of landed resolutions, the renderer-unavailability trio,
  keyboard/reduced-motion accessibility including a keyboard path to the point
  selection, pointer and touch reachability of off-screen bodies and gates,
  and an orbit/pan/zoom camera (all four camera requirements plus the
  inert-while-unavailable rule).
- **ADD `docked-fleet-actions`** (new capability): the fleet panel's
  own-state-anchored command surface — mine, sell, and refuel offers and
  commits, double-submit guards on all three, the station-keeping hold/release
  controls reading the **served** upkeep rate, a cargo-hold readout, the credit
  balance readout, rejection-copy mapping, and running-mine gating of the
  roster's movement commands.
- **BREAKING: retire `board-view`.** Its surviving requirements are re-ADDED
  under the two capabilities above with their substance preserved; its two
  requirements with no continuous-space equivalent — *The Board Renders on
  the Polar Lattice* and *Board Coordinates Are Ring-and-Slot Throughout* —
  are dropped outright, with no successor. A capability cannot be retired
  via REMOVED deltas (the archiver rejects a spec left with zero
  requirements), so this change carries no `specs/board-view/` delta at
  all; `openspec/specs/board-view/` is hand-deleted after this change
  archives (`polar-lattice-math` and `observation-fog-and-scan` are both
  confirmed-absent precedents for this exact mechanic). The rehearsal of that
  mechanic on a copy of the tree is a task in this change, not an assertion in
  its design doc.
- **REMOVED `system-interior`'s *Interior Read Endpoint*, re-ADDED as *Interior
  Read Serves Continuous Bodies*: remove every polar-lattice field from the
  wire.** The additivity clause is withdrawn, and a body loses `footprint`, its
  lattice `orbit` object (`ring`/`angle0`/`period`/`dir`), its top-level
  `parentId`, `fixed`, `band`, `live`, and `asOf`; a lane-gate body loses
  `cell`. The continuous `orbitElements` set and the world-clock `scale` that
  `serve-orbital-elements-and-burn-preview` added both stay. **This is what
  unblocks link 9**: while this response promised lattice fields, a caller
  could still be reading them. It is a retirement-and-re-add rather than a
  MODIFIED block because two of the old requirement's scenarios assert the
  removed fields survive, and `openspec archive` refuses a MODIFIED block that
  sheds a scenario the current spec carries (design.md Decision 10).
- **MODIFIED `galaxy-view`'s *Jump Commit*** to cite `docked-fleet-actions`'s
  rejection-copy requirement instead of `board-view`'s. The citation sits
  inside a requirement body, so it is delta-reachable and is fixed now rather
  than left dangling at a retired capability. **MODIFIED `galaxy-view`'s
  *Drill-In Navigation to the System Board*** and **`fleet-roster`'s *Active
  and Here Highlighting*** to retire "hex board" / "board" wording that named
  the retired lattice concept.
- **Fix two live `board-view` defects during the move rather than carry
  them forward**: a requirement that cited a header that never existed
  (*Board Picking Resolves to the Entity Under the Pointer*, twice — the
  real title is *...Resolves to the Feature, Cell, or Lane Gate Under the
  Pointer*) is corrected by construction; and *Renderer Unavailability Is an
  Explicit State*'s enumeration of "today: scan" — a control the client has
  never had — is corrected to name the verbs that actually exist, **including
  cut drive and stop**, so a player whose graphics context drops mid-burn can
  still end the burn.
- **Fix a confirmed production defect against an already-live requirement.**
  `commitSell` (`frontend/components/board/SystemBoardView.tsx:356`) mints
  `newOperationKey()` and calls `sell.mutate(...)` unconditionally, with no
  synchronous guard; the only protection is `disabled={!committable}` driven by
  `sell.isPending`, an async React-Query flip that needs a render cycle. Two
  clicks in one tick both enter the handler and each mints its **own** key, so
  server-side idempotency-by-key structurally cannot dedup them — a double
  charge on this economy's first credit sink. The identical defect in the
  refuel twin reproduced 4/4 in Playwright. `board-view`'s *Sell Control Guards
  Against Double-Submit* already says "disabled **from the moment of commit**",
  so **the requirement is right and the code is wrong**: this change carries a
  task and a Playwright-level scenario, and no spec delta restating the
  requirement. Burn and mine get the same guard, from one shared helper.
- **Cut every remaining frontend tether to the lattice**, which is larger than
  the component tree: `frontend/lib/types/action.ts` imports `Cell` and
  `Target` from `@/lib/board` for `params.origin`/`params.target`, both already
  dead against the live wire; the two lattice e2e suites (`board.spec.ts`,
  `board-camera.spec.ts`); and `frontend/app/spike/webgl-board/`, which is a
  bench for the renderer being deleted.
- **Delete `frontend/app/spike/space-3d/`** — its production successor now
  exists in `frontend/components/space/` and `frontend/lib/space/`; keeping
  the spike leaves a second, divergent implementation of production
  kinematics with its own passing test suite, the artifact most likely to
  mislead the next agent.
- **Close the anti-mirror check's case-sensitivity hole.**
  `check-mirror-map.sh` compares Go and TypeScript function names with
  `comm -12`, case-sensitively, so Go's `ArcParam`/`Speed`/`StateAt` against an
  idiomatic TypeScript `arcParam`/`speed`/`stateAt` collide zero times and the
  check passes. Since this change is the first to put any TypeScript under
  `frontend/lib/space`, it is the change that must make that guard real. The
  fix comes in two halves: **MODIFIED `cross-stack-determinism`'s *Shared
  Board Math Is Pinned By a Cross-Language Golden Fixture*** to say the
  comparison and the `sharedNames` match are case-insensitive and that a
  collision is resolved by renaming the TypeScript, and then the script change
  itself. Widening the requirement first is deliberate: a check stricter than
  the requirement it enforces is one a future agent can "fix" back while
  following the spec.

## Impact

- **Affected specs**: `system-space-view` (new), `docked-fleet-actions`
  (new), `board-view` (retired — no delta in this change; hand-deleted
  post-archive), `system-interior` (*Interior Read Endpoint* REMOVED, re-ADDED
  as *Interior Read Serves Continuous Bodies*), `galaxy-view`, `fleet-roster`,
  `cross-stack-determinism`.
- **Affected code**: `frontend/components/board/*` is replaced by new
  `frontend/components/space/*` + `frontend/lib/space/*` (render math lives
  under `lib/space` specifically so `check-mirror-map.sh`'s anti-mirror pass
  can see it — that check scans `frontend/lib/space` only, so a rule-bearing
  function placed instead in `frontend/components/space/` would pass every
  gate unseen; this is a stated, reviewed exception, not a guarantee);
  `frontend/lib/types/system-board.ts`, `frontend/lib/types/action.ts`'s
  lattice imports, `frontend/app/spike/webgl-board/` and
  `frontend/app/spike/space-3d/` are deleted; `frontend/e2e/tests/board.spec.ts`
  and `board-camera.spec.ts` are deleted and the four remaining suites that
  use board test ids are rewritten; `backend/system` loses the lattice fields
  from the interior read DTO; `.claude/scripts/check-mirror-map.sh` gains a
  case-insensitive collision comparison; `frontend/lib/services/fleet-service.ts`
  gains `preview`, `hold` and `release` with hooks over them; and
  `frontend/hooks/use-board-realtime.ts` is deleted.
- **Sequencing**: archives after `serve-orbital-elements-and-burn-preview`
  (this change's `system-interior` re-ADDED body is authored against that
  change's post-archive text, including the `orbitElements` set and the
  world-clock scale) and before `delete-the-lattice`.

## Exit criterion

A human can spawn, see their home system rendered in continuous space, burn
to a body, dock, mine, sell, refuel, fly to a lane gate, and jump — entirely
through the new view — proven by a Playwright journey against the real
stack. A green unit/component suite and an end-to-end test through the real
router are not, by themselves, evidence of this: link 5's own record shows
a green suite surviving four consecutive states in which a human player was
stuck, and the sell double-submit defect this change fixes survived a green
unit test written in a shape that could not observe the failure.

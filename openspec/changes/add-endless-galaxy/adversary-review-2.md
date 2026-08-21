# Adversary Review #2 — add-endless-galaxy (2026-08-20)

Verdict: **BLOCKED** — 3 blockers, 5 majors, 8 minors. Round-1 disposition:
21/25 RESOLVED; B2/B3 reopened for bridge lanes only; B5 unit ambiguity
remains; M11's reservation under-specced. The three blockers are one root
cause each: bridges have no materialization horizon; the spawn walk has no
materialization rule; the spawn claim has no qualification effect.

## BLOCKERS

### R2-B1. Bridge lanes lie outside every materialization horizon — they can never persist; a scan meeting one must dangle or lie
A bridge's far endpoint block (skipping empty blocks) is not among the eight
neighbours the materialization transaction reads, nor inside the 3×3 scan
window. (1) Neither side's transaction can see the other → bridge lost
permanently (B3's race, unfixed for bridges — fires even in the seeded start
area). (2) No trigger ever creates the far block. (3) A scan on a
bridge-endpoint system must chart a lane to an unmaterialized id (violating
"lanes reference real systems" / "never a lane to a nonexistent node") or
omit it (the forbidden false dead end).
**Fix:** make the bridge horizon a first-class materialization horizon: the
block transaction reads the anchors of every block that can share a lane
with it — eight neighbours plus every block within `BridgeSearchHorizon`
along the four cardinal axes; the scan's ensured set becomes the 3×3 window
plus the far-endpoint block of every bridge incident to the scanned system.
Add scenario: a bridge across empty blocks is persisted exactly once from
either side. (Alternative: pin `BridgeSearchHorizon = 1` and drop the
empty-block skip.)

### R2-B2. The spawn walk has no rule for which blocks it materializes — the literal implementation stalls at the frontier and 503s
The walk's frontier advances along persisted lanes, but an edge system has
no persisted lanes into unmaterialized blocks, so the walk never "reaches"
an unmaterialized block; honest implementation = BFS the persisted graph,
find nothing, 503 — the original bug. The grows-the-world scenarios are
acceptance criteria, not a mechanism.
**Fix:** state the rule: when the walk visits a system, first ensure that
system's 3×3 block window (plus incident-bridge far blocks) is
materialized, so its true incident lanes are enumerable before the walk
expands past it.

### R2-B3. The concurrent-spawn re-pick is not derivable — and against the real write ordering it re-picks the same system forever
`spawnClaims` appears only in a scenario; qualification is defined only as
mineable + min-distance, so a faithful re-run is identical → same pick →
livelock. The claim signal the requirement keys on (explored systems) is
written AFTER the corp transaction (confirmed in service.go ordering), so
the loser's re-derivation is unchanged. Unspecified: re-pick bound;
reservation lifecycle (heal-path re-pick orphans a claim forever).
**Fix:** promote the reservation into the requirement: a reserved system
does not qualify; the reservation is created in the corp-commit transaction
and is the authoritative claim signal; the picked home is recorded on the
corporation at commit (healing reuses it — no re-pick, no orphan); a losing
spawn re-runs selection at most `MaxSpawnRepicks` times then
`ErrNoSpawnSite`.

## MAJOR

- **R2-M1.** Contiguity invariant ambiguous ("4-connected" vs the scan's own
  3×3 corners) and nothing consumes it under the origin-component model —
  delete it (or restate as "within the 3×3 window of an existing block").
- **R2-M2.** The headline guarantee (all homes share the origin component)
  is pinned by no scenario — add: a lane-graph traversal from the origin
  reaches every corporation's home.
- **R2-M3.** Walk cap unit: spec reads depth, design reads blocks-touched;
  the count reading is population-dependent (wide frontier trips it) — pin
  expansion DEPTH (max block-hop distance from the starting block set), and
  note a wide frontier consumes no budget.
- **R2-M4.** `MinSpawnDistance` unenforced under concurrency (reservation
  guards only exact collision; nearest-ring rule concentrates concurrent
  picks) — decide: proximity check in the commit txn, or honestly scope the
  invariant to selection-time-visible claims (tolerated, not repaired) with
  a scenario.
- **R2-M5.** Cross-change collision: `add-credits-and-npc-market` also
  MODIFIES `Session Bootstrap and Wake-Up Endpoints`; whichever archives
  second silently drops the other's version — drop that modification from
  this change (move the corpless guarantee into Home Site Selection) or
  name the rebase obligation in the proposal.

## MINOR

- **R2-m1.** Scan requirement materializes before the fizzle test — gate:
  "when a scan resolves AND the fleet is still in the origin system, first
  ensure…".
- **R2-m2.** `BlockSize·cellSize ≥ MaxLaneLength` at exact equality lets a
  lane span two blocks — require strict `>` (or make the lane rule strict).
- **R2-m3.** Params validation misses `MaxLaneLength ≤ 0`; only 2 of 4
  clauses have scenarios.
- **R2-m4.** Origin system: no tie-break for equidistant survivors; depends
  on `StartAreaBlockRadius` at evaluation time — hash tie-break + record
  the origin system id on the galaxy doc at seed time.
- **R2-m5.** The origin-component floor is an unnamed parameter — name it
  and validate it positive.
- **R2-m6.** "Configured tolerance band" implies a param that doesn't exist
  — say "tolerance asserted by the generator statistics test".
- **R2-m7.** Failed seed validation leaves materialized blocks under an
  unreferenced galaxy id — state that's acceptable (or require cleanup).
- **R2-m8.** Design-only: bounds expansion inside every block txn makes the
  galaxy doc a global write hotspot — loosen D7 (idempotent monotonic merge
  outside the txn; bounds are display metadata, lost updates self-heal).

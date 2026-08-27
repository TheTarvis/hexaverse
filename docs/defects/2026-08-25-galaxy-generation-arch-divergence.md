# Defect: seeded galaxy generation is architecture-dependent

**Filed:** 2026-08-25, by the `pin-cross-stack-determinism-seam` adversarial
review; reproduced in compiler output by the orchestrator.
**Status:** open — **narrowed 2026-08-27**, see "Narrowed by add-endless-galaxy".
**Against:** `galaxy-generation` (`backend/galaxy/field.go`, `generator.go`) and
the `cross-stack-determinism` capability.
**Severity:** **downgraded 2026-08-25 after measurement — see "Measured".**
Originally filed as potentially the widest-blast-radius member of this family, on
the theory that a flipped Poisson-disc acceptance would re-phase the whole galaxy.
Measured across 60 seeds, that cascade does not fire: ids, regions and the lane
graph are identical on both architectures; only coordinates differ, by one ULP.
Real but narrow — and it feeds the lane-ETA defect, which is where its
consequence actually lands.

## What is wrong

`galaxy-generation`'s core promise is that `Generate(seed, params)` is
deterministic: the same seed yields the same galaxy. That determinism is
**conditional on the CPU architecture the binary was compiled for**, and nothing
says so.

Two independent mechanisms:

### 1. Float contraction — verified in compiler output

```
GOARCH=arm64 go build -gcflags=-S ./galaxy   ->  12 FMADDD/FMSUBD sites
GOARCH=amd64 go build -gcflags=-S ./galaxy   ->  0
```

The Poisson-disc acceptance test is the canonical fusable shape:

```go
func dist(a, b Coords) float64 {
	dx, dy, dz := a.X-b.X, a.Y-b.Y, a.Z-b.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)   // contracts on arm64
}
```

`dist` gates **acceptance or rejection** of every candidate system. A 1-ULP
difference flips a candidate that sits within an ULP of `minSpacing`, and
because placement is a sequential accept/reject loop over a shared RNG stream,
**a flipped decision would re-phase every subsequent draw** — such a divergence
would not be local, it would cascade into a different star field from that point
on. **Measured: it did not fire.** Across seeds 1-60 on both architectures the
acceptance sequence never diverged (topology, ids and counts identical, 0/60);
only the accepted coordinates differ, and only in the low bits. The cascade is
the hazard this shape carries, not an observed behaviour — see "Measured" below.

### 2. Trigonometry writing persisted coordinates

```go
r := params.RadiusXY * math.Sqrt(rng.Float64())
theta := 2 * math.Pi * rng.Float64()
cand := Coords{
	X: r * math.Cos(theta),
	Y: r * math.Sin(theta),
	...
}
```

`math.Cos`/`math.Sin` are pure Go, built from contraction-sensitive polynomial
evaluation, so they too differ across build targets (the orchestrator measured
the sibling case: `math.Atan2` diverges on 132/17,956 integer inputs, 0.73%).
Their output is written straight into `Coords`, which is **persisted** to
Firestore and is the input to `laneLength` — see the sibling defect
`2026-08-25-lane-eta-arch-divergence.md`, which makes lane ETAs
architecture-dependent twice over.

## Why it has not bitten yet

Galaxies are generated once and persisted, and production has only ever
generated on amd64 Cloud Run. The exposure is:

- `make seed` / `cmd/seed` run on a developer's arm64 Mac produces a **different
  galaxy for the same seed** than production would. Any local reasoning about
  "seed X gives this start area" does not transfer.
- `cmd/seed start-area` writes `frontend/public/galaxy/start-area.json` — a
  checked-in artifact generated on whoever's machine ran it.
- **This gets materially worse with `add-endless-galaxy`** (21 open tasks),
  whose whole design is *lazy, idempotent block materialization*: blocks are
  generated on demand, over time, by whatever build is deployed then. Its
  `Lazy, Idempotent Block Materialization` requirement's idempotence is exactly
  what an architecture change would break — the same block, materialized twice
  by two builds, could differ. That change should not land before this is
  resolved or explicitly accepted.

## Measured (2026-08-25)

Done. `Generate(seed, DefaultParams())` compiled `GOARCH=arm64` vs `GOARCH=amd64`,
same binary source, no Firestore involved. Seeds 1..60.

| across 60 seeds | arm64 vs amd64 |
|---|---|
| system count, lane count | identical — 0/60 differ |
| system ids, region classification, lane topology | identical — 0/60 differ |
| system coordinates | **differ — 60/60** |

Detail at seeds 1/42/424242: 18 of 960 emitted coordinates differ, each by
exactly one ULP in a single axis. Region labels are stable (`sys-26 star_rich`
on both, `sys-145 barrier` on both) and not one lane pair differs.

**This falsifies the prediction in the previous revision of this section**
("either bit-identical or wildly different, with little in between"). The real
answer is a third thing: *universally* divergent in the low bits, *structurally*
stable. The cascade the doc feared did not fire at any of 60 seeds — the
Poisson-disc acceptance test is apparently not sitting near its threshold often
enough for a 1-ULP nudge to flip it.

### What this does and does not downgrade

**Downgrades:** "the substrate every domain is keyed to differs between dev and
prod" is not what is happening. System ids, regions, and the lane graph — the
things fog, routing, and spawn key on — reproduced exactly across every seed
tested. A dev galaxy and a prod galaxy from the same seed are the same galaxy.

**Does not downgrade:**
- Coordinates are persisted, and they are the direct input to `laneLength`'s
  `sqrt(dx*dx+dy*dy+dz*dz)` → `legMs` → the persisted `LaneTransit.LegEtas`.
  So this defect feeds the lane-ETA defect: two ULP sources compounding on a
  value that is rounded to an integer millisecond.
- 60 seeds is not a proof. The acceptance test is a threshold comparison; the
  mechanism for a structural flip is real and unbounded, it simply did not fire
  in this sample. Treat "no topology change" as an observation, not a guarantee.
- The `galaxy-generation` capability still claims unconditional determinism, and
  that claim is still false as written. The fix and the spec requirement are
  unchanged — only the urgency ranking moves.

### Reproducing

`scratchpad/galprobe/` (standalone module, `replace hexaverse => backend`).
Hashes ids+regions+lanes separately from coordinates so the two failure modes
can be told apart; build under both `GOARCH` values and diff.

## Narrowed by add-endless-galaxy (2026-08-27)

This doc's own warning — *"gets materially worse with `add-endless-galaxy`,
whose whole design is lazy, idempotent block materialization … that change
should not land before this is resolved or explicitly accepted"* — was taken
literally. Both of the mechanisms above are now **gone from our code**, and what
remains is named precisely.

**Mechanism 1 (float contraction) — FIXED in our code.** Every FMA site in
`backend/galaxy` was made contraction-independent while the generator was
rewritten around the infinite field:

- `dist` (`field.go`) — the squares are wrapped in explicit `float64(...)`, so
  the sum cannot fuse. It still gates placement survival, the lane cap, the
  relative-neighbourhood test, and bridge pair selection.
- candidate X/Y jitter (`field.go`) — each product is materialized through a
  conversion before it meets an add.
- candidate Z (`field.go`) — **discretized**: the slab position is an exact
  integer step count scaled once, so there is no float chain left to fuse. This
  is the discretization discipline the capability prescribes, not a pinning.
- the fractal-noise accumulate (`generator.go`) and the origin-system
  squared-distance argmin (`generator.go`) — both wrapped.

Verified: `GOOS=linux GOARCH=arm64 go build -gcflags=-S ./galaxy` now emits
**zero** `FMADDD`/`FMSUBD` sites (was 12).

**Mechanism 2 (trigonometry writing persisted coordinates) — GONE.** The
`r·cos θ / r·sin θ` disc placement was deleted with rejection sampling itself.
The field derives coordinates from a hash: integer mixing, one division, and one
multiply per axis. No trigonometry writes a coordinate any more.

### What remains open

The residual is **third-party**: `github.com/ojrac/opensimplex-go` emits 273 FMA
sites on arm64 and zero on amd64. Its `Eval3` output is compared against
`StarRichThreshold` / `DeadThreshold` / `BarrierBand` to classify a candidate's
region, and the region selects the minimum gap that decides survival. So a
1-ULP noise difference at a classification threshold can still, in principle,
change which systems exist.

Under lazy materialization this is the exposure that matters: the same block
materialized by an arm64 build and an amd64 build could disagree, and
`Lazy, Idempotent Block Materialization` promises they cannot. It has **not**
been measured. Candidate resolutions, cheapest first: pin the region classifier
by quantizing the noise value before comparison (a discretized choice, the same
move Z just took); vendor a contraction-free noise implementation; or restrict
seeding and materialization to one build target and say so in the spec.

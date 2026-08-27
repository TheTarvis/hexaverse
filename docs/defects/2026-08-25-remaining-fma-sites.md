# Defect: remaining FMA-contracting sites reaching persisted values

**Filed:** 2026-08-25, by the `pin-cross-stack-determinism-seam` adversarial
review (round 2); each site reproduced in compiler output and each persistence
path traced by the orchestrator.
**Status:** open
**Against:** `system-interior`, `corporation-spawn`, `npc-market-demand`, and the
`cross-stack-determinism` capability.
**Severity:** same mechanism as the three already-filed defects, on three more
persisted values. Magnitudes **unmeasured**.

## Why this doc exists

The first pass at enumerating this defect class was a hand audit and missed
sites. One command enumerates it mechanically:

```
$ cd backend && GOOS=linux GOARCH=arm64 go build -gcflags=-S ./... \
    | grep -E 'FMADDD|FMSUBD' | sed 's/.*hexaverse\///; s/:[0-9]*).*//' \
    | sort | uniq -c | sort -rn

  12 backend/galaxy/generator.go            -> 2026-08-25-galaxy-generation-arch-divergence.md
                                              (FIXED 2026-08-27: now 0 — see that doc)
   8 backend/fleet/routing.go               -> 2026-08-25-lane-eta-arch-divergence.md
   6 backend/board/hex.go                   -> 2026-08-25-line-fma-arch-divergence.md
   4 backend/system/generator.go            -> THIS DOC
   3 backend/corporations/siteselection.go  -> THIS DOC (RESOLVED 2026-08-27, sites deleted)
   2 backend/market/provisioning.go         -> THIS DOC
   2 backend/board/gate.go                  -> 2026-08-25-line-fma-arch-divergence.md
                                              (its `hexDirection` FMA sites; the SEPARATE
                                               near-tie atan2 defect is governed by the
                                               authority carve-out, not the register)
   1 backend/mine/service.go                -> THIS DOC
```

`GOARCH=amd64` emits **zero** FMA for every one of these files. Go permits
fusing `x + y*z` "possibly across statements"; gc does it on `arm64` and not on
`amd64` at the default microarchitecture level. So each site computes a
different `float64` on a developer's Apple Silicon machine than on amd64
Cloud Run.

## The three sites and what each persists

### 1. `backend/system/generator.go:88,90,186,238` — feature richness

```go
f.Resources = []Resource{{Kind: ResourceExotic,
    Richness: 0.4 + 0.6*r.Float64()*dial.RichnessMult}}
```

`a + b*c*d` — a contraction shape. `Resource.Richness` is persisted
(`system/model.go:58`, `firestore:"richness"`) and is read by `mine` as
`startTons = Richness * TonsPerRichness`. **A lode's tonnage therefore depends
on which machine materialized the interior.** Interiors are materialized lazily
on first read, so dev and prod can disagree per system.

### 2. `backend/corporations/siteselection.go:54,159` — the spawn home — **RESOLVED 2026-08-27**

**Both sites were deleted by `add-endless-galaxy`, not repaired.** Periphery
weighting and `centralSystemID` retired with the finite galaxy: site selection is
now a breadth-first walk over the lane graph that stops at the first qualifying
hop-ring and draws uniformly within it, so there is no centroid distance and no
weighted score left to contract. `backend/corporations` emits zero FMA sites on
arm64, and the two register entries naming this defect were removed. The original
description is kept below as the record of what was there.


```go
d := (c.X-cx)*(c.X-cx) + (c.Y-cy)*(c.Y-cy) + (c.Z-cz)*(c.Z-cz)
if d < best { best, bestID = d, gal.Systems[i].Id }
```

Classic contraction shape feeding an **argmin** — the same structural pattern as
the `LaneGateHex` near-tie defect, and with the same consequence: a 1-ULP
difference flips the winner only when two candidates are near-equidistant, but
the output (`centralSystemID`) drives the periphery weighting that chooses a
corporation's **persisted home system**. A flipped choice is not self-correcting;
it is written to `corporations/{id}` and every fleet, fog record and charted lane
hangs off it.

### 3. `backend/market/provisioning.go:35,38` — NPC request pricing

```go
premium  := p.PremiumBandLow  + unitFloat(h)*(p.PremiumBandHigh-p.PremiumBandLow)
quantity := p.QuantityBandLow + unitFloat(h)*(p.QuantityBandHigh-p.QuantityBandLow)
```

Both are `a + b*(c-d)` — contraction shapes. The premium sets an NPC request's
unit price, and a sale against that request credits a corporation. **Credits are
a materialized `int64` on the corp doc**, so a divergence here writes a
different balance, and the credit-reconciliation invariant would then be
comparing a fold against a total computed under different arithmetic.

### 4. `backend/mine/service.go` — one FMA site plus a `math.Round` ETA

`mine/service.go:224` computes `eta := now.Add(WorldMillis(math.Round(req.Tons /
fleetRate)))`, a persisted action ETA. `math.Round` is identical across Go build
targets, but **differs from JavaScript's `Math.round` on every negative
half-integer** (Go rounds half away from zero; JS rounds half toward +infinity)
— relevant only if the frontend ever mirrors this computation, which it does not
today. The file also carries one FMA site, now localized: `mine/service.go:187` (`remainingAtNow := startTons + fold`, fed by line 186's `startTons := res.Richness * s.params.TonsPerRichness`). Lowest severity of the four; listed
for completeness so the mechanical sweep and the register agree.

## Not yet measured

**None of these has had its magnitude measured.** For each, the measurement is
the same shape as the `board.Line` sweep: run the computation over a realistic
input domain on both `GOARCH` values and count divergences. Do that before
deciding severity — the `board.Line` case turned out to be 1.97% of inputs,
while the `LaneGateHex` argmin produced zero flips over 300,000 random inputs.
Argmin-shaped sites (2) are likely closer to the latter; arithmetic-shaped sites
(1, 3) are likely closer to the former.

## Recommended fix

Identical to the sibling defects, and with the same trap: **assigning a product
to a local does NOT inhibit fusion — gc fuses across statements. Only an
explicit `float64(...)` conversion around the product is specified to force the
intermediate rounding.** Verified in assembly:

```
a + (b-a)*t                    ->  FSUBD ; FMADDD          fused
p := (b-a)*t ; return a + p    ->  FSUBD ; FMADDD          STILL fused
a + float64((b-a)*t)           ->  FSUBD ; FMULD ; FADDD   not fused
```

Better for sites (1) and (3): both derive a bounded scalar from a hash or RNG
draw and then persist it. Quantizing to a fixed integer scale at generation time
(e.g. richness in basis points, premium in whole credits) removes the
floating-point dependence entirely rather than pinning which way it rounds —
the discretization discipline `cross-stack-determinism` already prescribes.

## Related

- `docs/defects/2026-08-25-line-fma-arch-divergence.md`
- `docs/defects/2026-08-25-lane-eta-arch-divergence.md`
- `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`
- `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`

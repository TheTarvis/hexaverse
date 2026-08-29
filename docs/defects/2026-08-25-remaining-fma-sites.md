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
   4 backend/system/generator.go            -> THIS DOC (RESOLVED 2026-08-29, float64(...) conversions)
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

### 1. `backend/system/generator.go:129,131,247,308` — feature richness — **RESOLVED 2026-08-29**

**Fixed by `pin-system-generation-determinism`, not deferred.** Each of the
four richness-producing products (the anomaly and ruin special branches, the
belt primary-lode branch, and the shared `rich()` helper) now carries an
explicit `float64(...)` conversion around its fusible product, forcing the
intermediate rounding that inhibits FMA contraction on arm64 — the same
remedy `board.Line`'s sibling defect used where the float could not be
deleted outright (see that resolution's own note, and design.md Decision 1
for why deletion does not apply here: richness is the stored result itself,
not a discrete choice with an integer form to retreat to). `backend/system`
now emits zero arm64 FMA sites (`go build -gcflags=-S ./system/` on
`GOOS=linux GOARCH=arm64` prints no `FMADDD`/`FMSUBD`), the generator's full
output (lattice projection AND the continuous element set) is byte-identical
between `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1`, and the four register
entries naming these sites were removed in the same commit. The original
description (below) is kept as the record of what was there; its line
numbers (88,90,186,238) had already drifted to 129,131,247,308 by the time
of this fix (see the register's own re-anchoring notes, now removed with the
entries).

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

**CORRECTION (2026-08-29, `pin-system-generation-determinism` design.md
Decision 1): the "better for sites (1) and (3)" quantization suggestion
above is wrong, and site (1) was fixed with the plain `float64(...)`
conversion instead.** Quantizing an already-divergent float to a fixed
integer scale does not remove the floating-point dependence — it only
*lowers the probability the divergence survives rounding*, converting a
reliably reproducible disagreement (13 of ~500 richness values, measured
over the 80-case sweep) into a rare one that appears only when the
pre-quantization value lands within 1 ULP of a quantum boundary. A rarer
nondeterminism is a *worse* one: it survives every test run and then shows
up in exactly one player's world. Quantization would also introduce a bare
rounding call into a package `check-transcendental.sh` already lints for
that exact shape (`RULE_BEARING_GO_PACKAGES` contains `system`), trading one
problem for a second. Quantization is only sound *on top of* the
`float64(...)` fix, at which point the fix has already finished the job —
so for a value-producing site (the float *is* the stored result, with no
discrete choice to retreat to, unlike an argmin-shaped site such as (2)),
the plain conversion is the whole remedy, not a stopgap. Site (3)
(`market/provisioning.go`) remains open and unfixed; if it is ever
"improved" by quantizing instead of converting, that repeats this mistake.

## Related

- `docs/defects/2026-08-25-line-fma-arch-divergence.md`
- `docs/defects/2026-08-25-lane-eta-arch-divergence.md`
- `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`
- `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`

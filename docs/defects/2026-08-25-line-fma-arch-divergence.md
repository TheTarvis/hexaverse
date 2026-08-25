# Defect: `board.Line` diverges between arm64 and amd64 (FMA contraction)

**Filed:** 2026-08-25. Originally found by the `pin-cross-stack-determinism-seam`
panel; that agent died to a rate limit before writing it down, so this doc is a
clean-room re-derivation that reproduces its numbers exactly.
**Status:** open
**Against:** `board-tactical-math` (`backend/board/hex.go` — `Line`/`lerp`/`roundf`),
the `cross-stack-determinism` capability, and — added 2026-08-25 — **two
already-shipped capabilities this falsifies**:
- `fleet-movement`, scenario *"Route preview matches what a commit would freeze"*,
  which promises the previewed route/ETAs/gate are **exactly** what a commit
  freezes. `SolveHex`/`SolveIntercept` call `RouteAround`, which calls `Line`
  (`backend/board/intercept.go:19,59,69` → `backend/board/route.go:14,20,21`),
  and `frontend/components/board/move-preview.ts` mirrors those solves for the
  dashed route and the `move-eta` readout. On an arm64 backend that promise is
  false for ~2% of orders **today** — this path is live, not dormant like the
  lane-gate case.
- `hex-board-view`, requirement *"Move Preview From the Acting Fleet's Live
  Position"*, for the same reason.

Both need re-verification when `lerp` is de-fused — not just `board-tactical-math`'s
fixtures.
**Severity:** **higher than the lane-gate defect.** This is not Go↔TS — it is
**Go↔Go across CPU architectures**, on a value that feeds committed burn paths.
Dev machines are arm64 (Apple Silicon); Cloud Run is amd64.

## Repro

Enumerate the hex disc of radius 10 (331 hexes) and take all ordered pairs
(109,561). Compare `Line(a,b)` output built `GOARCH=arm64` vs `GOARCH=amd64`:

```
diverging pairs: 2160 / 109561   (1.97%)

board.Line((-10,0) -> (-1,3))
  arm64:  ... (-3,2) (-2,2) (-2,3) (-1,3)
  amd64:  ... (-3,2) (-3,3) (-2,3) (-1,3)   <- matches JS
```

## Measured cause

`lerp(a, b, t) = a + (b-a)*t` (`hex.go`). The Go spec permits an implementation
to fuse `x + y*z` into a single FMA (no intermediate rounding); the gc compiler
**does this on arm64 and does not on amd64**.

Raw bits at step i=10 of the path above (cube a=(-10,10,0), b=(-1,-2,3), n=12):

```
        x                          y
arm64   -5629499534213119p-51      -4503599627370496p-103   (= -2.4999999999999996, -4.44e-16)
amd64   -5629499534213120p-51       0p-1074                 (= exactly -2.5,        exactly 0)
```

The fused arm64 result is *more* accurate — which is precisely what breaks it.
It lands one ULP away from the exact `.5` tie, and `roundf` is maximally
sensitive there:

- `roundf(-2.5)`                  = `-int(2.5 + 0.5)`                = `-int(3.0)` = **-3**  (amd64)
- `roundf(-2.4999999999999996)`   = `-int(2.4999999999999996 + 0.5)` = `-int(2.9999999999999996)` = **-2**  (arm64)

A hex lattice sits on exact half-integer cube coordinates constantly (that *is*
the staircase), so the tie boundary is hit often rather than rarely — hence
~2% of pairs, not a knife-edge like the lane-gate case.

## Why this is worse than the lane-gate divergence

- **The lane-gate defect is latent** (server-authoritative, preview-only
  disagreement). **This one is not.** `Line` is the path a burn traverses; it
  feeds `board.StateAt` / `ShipPos`, so a fixture regenerated on an arm64 dev
  box encodes paths that amd64 production does not walk.
- `UPDATE_FIXTURES=1` run locally therefore bakes **arm64** answers into
  `fixtures/board/cases.json`. amd64 matches JS here, so the golden contract
  currently agrees with production and with TS *by luck of who last regenerated
  it* — the fixture's authority is architecture-dependent, which is exactly the
  property the seam claims to have and does not.
- It also means the `cross-stack-determinism` capability as drafted is
  **incomplete**: it pins a Go↔TS seam, but the drift demonstrated here is
  Go↔Go. A same-language, cross-architecture requirement is missing.

## Recommended fix

Suppress contraction at the seam so both architectures round identically.

**CORRECTION (2026-08-25, verified in compiler output):** an earlier revision of
this doc recommended assigning the product to a local variable. **That does not
work.** The Go spec permits fusion "possibly across statements", and gc fuses
through the local just as it does the inline form. Only an explicit `float64(...)`
conversion around the product is *specified* to force the intermediate rounding.

Measured, `GOARCH=arm64 go build -gcflags="-S -l"`:

```
a + (b-a)*t                    ->  FSUBD ; FMADDD             fused
p := (b-a)*t ; return a + p    ->  FSUBD ; FMADDD             STILL fused  <- the bad advice
a + float64((b-a)*t)           ->  FSUBD ; FMULD ; FADDD      not fused    <- correct
```

So the fix is:

```go
func lerp(a, b, t float64) float64 {
    // The float64() conversion is load-bearing: it forces the intermediate
    // rounding that inhibits FMA contraction on arm64. Assigning to a local
    // does NOT — gc fuses across statements. Do not "simplify" this.
    return a + float64((b-a)*t)
}
```

`roundf` (`hex.go:93`/`95`) is fused for the same reason and needs the same
treatment; `hexDirection` (`gate.go:54`) likewise.

**Beware the false green:** `go test ./board/ -short` passes on BOTH arm64 and
amd64 *today*, because the three recorded `line` cases dodge all 2,160 divergent
pairs. A test run is therefore NOT evidence the fix worked. Verify by diffing an
exhaustive `Line` sweep across `GOARCH=arm64` and `GOARCH=amd64`, or by
inspecting `-gcflags=-S` for `FMADDD`.

Then regenerate `fixtures/board/cases.json` and confirm arm64 == amd64 == JS.
(Do NOT regenerate before the fix: that freezes arm64's answers.)

Better, and worth weighing given the polar discussion: `Line` does not need
floats at all. Cube-lerp at `i/n` is exact rational arithmetic — the fractional
coordinates are always `k/n` for integer `k`, so the whole walk can run in
integers with an explicit, spec'd tie-break at the half-integer boundaries. That
removes the FP tie entirely instead of pinning which way it falls, and it makes
`roundf`'s current implicit "round half away from zero" behavior a stated rule.

## Verification artifact

Probe: `scratchpad/lineprobe/` (standalone module, `replace hexaverse => backend`).
`GOARCH={arm64,amd64} go build` then diff the two outputs.

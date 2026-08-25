## Why

`fixtures/board/cases.json` is the Go↔TypeScript determinism contract — the
codebase's most valuable property, per `docs/handoffs/2026-08-24-polar-lattice-migration.md`
Section 7 — and today it is protected only by prose in a `## Notes for future
maintainers` block on `board-tactical-math` and by convention. That prose,
and this change's own first draft, believed transcendental functions were
the hazard and that `+ − × ÷` were safe. Both are false. Go's spec permits
fusing a multiply and an adjacent add into a single rounded FMA instruction
("possibly across statements"); ECMAScript requires each operation rounded
separately. `go build -gcflags=-S ./board` emits 8 FMA instructions on
`arm64` and 0 on `amd64` from identical source, at three call sites
including `hex.go`'s `lerp`. The measured consequence:
`board.Line` — the function both the handoff doc and this change's original
draft cite as the canonical safe integer case — diverges on 2,160 of 109,561
radius-10 hex pairs (1.97%) between Go/`arm64` and Go/`amd64`, and `amd64`
(prod) matches the TypeScript mirror while `arm64` (Travis's dev machine)
does not (`docs/defects/2026-08-25-line-fma-arch-divergence.md`). Worse, the
divergence is **Go↔Go across CPU architectures**, not merely Go↔TS — a gap
the capability as originally scoped could not even express. A second,
independent probe found a live near-tie divergence in the lane-gate bearing
itself, confirming the seam's actual guarantee is server authority, not
bit-identical agreement, on inputs a continuous bearing can place arbitrarily
close to a tie (`docs/defects/2026-08-25-lanegate-near-tie-divergence.md`).
This revision reframes the capability around the property that actually
holds — exact arithmetic or discretization, checked across build targets,
not language pairs — so it states the real contract instead of a
convenient but false one.

This change stands alone regardless of the polar lattice migration, which is
now **approved** (`docs/handoffs/2026-08-24-polar-lattice-migration.md`,
Section 5, decision 1: "SETTLED (2026-08-25): yes, full polar") — none of
this change's requirements depend on which lattice ships. It is scoped to
today's hex board; nothing here requires touching
`backend/board` geometry or `frontend/lib/hex` beyond the enforcement and
fixture-coverage mechanisms described below, and it does NOT fix the `lerp`
contraction defect or the lane-gate near-tie defect — both are separate,
already-filed changes against `board-tactical-math`.

## What Changes

- Add a new capability `cross-stack-determinism` that specifies, as testable
  requirements rather than prose notes:
  - the golden-fixture discipline (`fixtures/board/cases.json` asserted by
    both languages, never a one-sided change, and — new in this revision —
    an exhaustive-sweep case for any enumerable function family, because
    three hand-picked `line` cases all reproduce while 2% of the function's
    actual domain does not);
  - that a rule-bearing value crosses the seam only by exact arithmetic
    (integer arithmetic within safe bounds, or individually-rounded
    `+ − × ÷`) or by discretization — **not** by an absolute ban on
    transcendentals, since exact arithmetic itself forks across build
    targets when a compiler contracts multiply-add;
  - a same-language, cross-architecture reproducibility requirement
    (Go/`arm64` vs Go/`amd64`) that the original draft omitted entirely,
    closing the gap the `lerp` defect exposed;
  - a requirement that the golden fixture itself is asserted on a second
    build target, not merely recorded and trusted on the machine that
    generated it;
  - the lane-gate bearing as a discretized argmin with the **backend
    designated authoritative** — replacing the original "provably unchanged
    by a last-ULP difference" framing, which the near-tie probe proved
    false (a continuous bearing can always be placed arbitrarily close to a
    tie; there is no such proof, only server authority over the preview);
  - a pinned-not-assumed requirement for `sqrt` in rule-bearing computations,
    covering both runtime values (fixture family required) and compile-time
    constants (equality asserted, not assumed) — `backend/board/gate.go`
    already applies `sqrt` to a runtime value today, so the prior
    "vacuously satisfied" framing was already false on arrival. `sqrt` is
    now split from the other transcendentals: it is correctly-rounded and
    therefore identical across Go build targets, but not guaranteed across
    the language seam (ECMAScript's `Math.sqrt` is
    implementation-approximated), so the risk it names is Go↔TS, not Go↔Go;
  - **one capability-level deviation register** (round 2), replacing the
    prior draft's register defined only inside the cross-target
    requirement: every one of this capability's checks — the fixture sweep,
    the exact-arithmetic-or-discretization requirement, the cross-target
    check, the discretized-choice carve-out, and (round 3) the sqrt-pinning
    requirement — consults and prints the same register, whose entries
    carry site, referenced open defect, filed date, and measured/unmeasured
    magnitude, and go stale (and fail their check) the moment the
    referenced `docs/defects/` document's `**Status:** open` line changes;
  - the fixture-coverage inventory reframed as a **deadline**, not a
    permanent home — a rule-bearing mirrored function may not sit in the
    inventory across more than one change that touches its package — backed
    by an explicit mirror map covering non-exported mirrored functions too
    (a purely-exported predicate cannot even name `lerp`, unexported on both
    sides);
  - qualifying exact arithmetic widened to include `math.Min`/`Math.min`,
    `math.Max`/`Math.max`, and `math.Ceil`/`Math.ceil` (all exactly defined
    in both languages), so the market fold — this capability's own example
    of the discipline done right — isn't itself out of compliance.
- Add the exhaustive-sweep case for `board.Line` to the fixture family (as a
  task; NOT recorded from an arm64 machine until the `lerp` contraction
  defect is fixed, or it freezes the wrong side's answers).
- Add `GOARCH=amd64` cross-architecture test runs to the check harness and
  wire them into `/check`, so a change touching `backend/board` is asserted
  on both contracting and non-contracting targets.
- Add `fixtures/**` to the CI path filters that trigger both the backend and
  frontend board-fixture suites (`.gitlab-ci.yml`'s `.backend-changes` and
  `.frontend-changes` anchors currently omit it, so a fixture-only or
  one-sided commit can stay green while the contract is broken).
- The transcendental-drift lint mechanism (the exact-arithmetic-or-
  discretization requirement, as originally drafted) is **already
  implemented on disk**:
  `.claude/scripts/check-transcendental.sh`, wired as Check 8 in
  `.claude/skills/code-quality-checks/check.py`, with
  `determinism:allow(...)` pragmas at the 5 known call sites. This revision
  keeps it as a secondary, advisory check — cheap and useful for catching a
  *new* transcendental call landing on a rule path — but demotes it from
  primary enforcement, because it is textual and cannot see a contraction
  hazard (`a + b*c`) at all; the primary enforcement mechanism for the
  larger hazard class is the cross-architecture differential run.
- At implementation time, replace the non-normative `## Notes for future
  maintainers` prose in `openspec/specs/board-tactical-math/spec.md` with a
  pointer to this capability. That edit is **not** made by this change
  (specs change only on archive) — it is task-level guidance for whoever
  implements this change.
- Propellant/delta-v itself is explicitly **out of scope**. The sqrt
  requirement only obligates a fixture family *if and when* a runtime-value
  `sqrt` rule beyond `LaneGateHex` is introduced; it does not introduce one,
  and it flags (without resolving) that the propellant plan's own "Hohmann
  is safe because it only uses sqrt" reasoning has the same contraction gap
  as `lerp` — a sqrt result multiplied against a subtraction is itself a
  contraction site.

## Known violations at landing

This capability's requirements are written over "the system" — every
runtime and build target the game's rules execute on — not over
`backend/board`/`frontend/lib/hex` alone. A cross-architecture divergence
inside a single Go package, with no TypeScript mirror in sight, is exactly
the hazard class this capability exists to catch (that's what the `lerp`
finding is). Narrowing the requirements' scope to the two mirrored packages
a prior pass happened to audit would exclude persisted values this
capability is supposed to govern.

**This section is a mechanically generated snapshot, not a hand audit.** It
is the output of

```
GOOS=linux GOARCH=arm64 go build -gcflags=-S ./... | grep -cE 'FMADDD|FMSUBD'
```

run per file against the whole `backend/` module on 2026-08-25, cross-checked
file-by-file against an identical `GOARCH=amd64` run (zero for all eight,
confirming the divergence is architecture-dependent and not just present).
Eight files carry a nonzero count — not the subset a prior hand-audit pass
listed:

| Count | File |
|-|-|
| 12 | `backend/galaxy/generator.go` |
| 8 | `backend/fleet/routing.go` |
| 6 | `backend/board/hex.go` |
| 4 | `backend/system/generator.go` |
| 3 | `backend/corporations/siteselection.go` |
| 2 | `backend/market/provisioning.go` |
| 2 | `backend/board/gate.go` |
| 1 | `backend/mine/service.go` |

Each reaches a persisted, decision-bearing, or disclosure-relevant value.
All eight are now filed as defects. Three are bridged by the capability's
deviation register (`The Capability's Deviation Register Bridges Known
Violations Across Its Checks`) so the requirements stay true both today and
after each is separately resolved — that's this change's Task 6.1. The
remaining five are filed in one consolidated document (round 3) but not yet
register-seeded — that's Task 6.3, follow-up work. This change DOCUMENTS all
eight; it does not fix any of them.

- **`board.Line`/`lerp`/`roundf`** (`backend/board/hex.go`, 6 sites) **and
  `hexDirection`** (`backend/board/gate.go`, 2 sites) — the same FMA
  contraction defect, Go `arm64` vs `amd64`, at both files (the defect doc
  covers `hex.go:73`/`93`/`95` and `gate.go:54` together). Filed:
  `docs/defects/2026-08-25-line-fma-arch-divergence.md`. Register-seeded by
  this change (Task 6.1). Magnitude measured for `Line`: 1.97%
  (2,160/109,561 pairs); `hexDirection`'s own magnitude is unmeasured.
- **`LaneGateHex` near-tie** (`backend/board/gate.go`) — a **measured**
  Go↔TS divergence at one probed near-tie input
  (`docs/defects/2026-08-25-lanegate-near-tie-divergence.md`), governed by
  the authoritative-side carve-out in `Inexact Arithmetic Is Rule-Bearing
  Only Through a Discretized, Tie-Broken Choice`, not the deviation
  register. **Correction (round 2): this is not "Go↔TS, not a same-language
  cross-target one."** `math.Atan2` itself is measured arch-divergent — one
  ULP between Go/`arm64` and Go/`amd64` on ~0.75% of inputs. Whether that ULP
  ever flips a `LaneGateHex` candidate selection is **unmeasured**: 300,000
  random inputs plus targeted bisector probes found no flip, which is
  evidence of rarity, not a proof — precisely the gap the three hand-picked
  `line` fixture cases left before the exhaustive sweep found 2,160
  divergent pairs. The requirement now obligates that sweep to run on both
  of the authoritative side's build targets and any divergence to be filed
  and registered, rather than citing authority as the mitigation (see
  design.md's round-2 correction to the "Discretized choice with an
  authoritative side" Decision).
- **`fleet/routing.go`'s `legMs`/`laneLength`** (line 196) — a **persisted
  lane-leg ETA** computed by a runtime `math.Sqrt` with no fixture family, an
  FMA-contracting `dx*dx + dy*dy + dz*dz` (verified: `FMADDD` × 5, `arm64`
  vs zero on `amd64`), and a `math.Round` that disagrees with JavaScript's
  `Math.round` on every negative half-integer (see `Rule-Bearing Values
  Cross the Seam By Exact Arithmetic or By Discretization`). Filed:
  `docs/defects/2026-08-25-lane-eta-arch-divergence.md`. Register-seeded by
  this change (Task 6.1). Magnitude unmeasured.
- **`galaxy/generator.go`** — trigonometric functions into persisted system
  coordinates (`r * math.Cos(theta)`, `r * math.Sin(theta)`) and an
  FMA-contracting `math.Sqrt(dx*dx + dy*dy + dz*dz)` gating Poisson-disc
  acceptance/rejection. Filed:
  `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`.
  Register-seeded by this change (Task 6.1). **Magnitude measured** (round
  3): `Generate(seed, DefaultParams())` built for both `GOARCH` values,
  seeds 1–60 — system count, lane count, system ids, region classification,
  and lane topology are identical on all 60 (the acceptance-cascade the
  defect doc originally predicted did not fire in this sample). Coordinates
  differ on 60/60 seeds, but only in the low bits: 18 of 960 coordinates at
  seeds 1/42/424242, each exactly one ULP in a single axis. Those
  coordinates feed `laneLength`'s `sqrt(dx*dx+dy*dy+dz*dz)` → `legMs` → the
  persisted `LaneTransit.LegEtas`, so this compounds with the lane-ETA
  defect above rather than standing alone. Caveat carried by the
  measurement itself: 60 seeds is an observation, not a proof — the
  acceptance test remains a threshold comparison, and the mechanism for a
  structural flip is real and unbounded even though it did not fire in this
  sample.
- **`backend/system/generator.go:88,90,186,238`** (round-4 correction: four
  sites, not two — the sweep emits `FMADDD`/`FMSUBD` at all four, matching
  the file's count of 4 in the table above) — feature `Richness`, read by
  `mine` as `startTons`. `88` and `90` are the anomaly/ruin specials; `186`
  is `Richness: 0.3 + 0.5*r.Float64()*dial.RichnessMult` on the **belt**
  feature — the primary mineable lode, a strictly larger persistence path
  than the anomaly/ruin specials at `88`/`90`; `238` is the shared `rich()`
  helper both belts and specials route through. Filed:
  `docs/defects/2026-08-25-remaining-fma-sites.md`. Not yet register-seeded
  (Task 6.3).
- **`backend/corporations/siteselection.go:54,159`** — the `centralSystemID`
  argmin that becomes the persisted spawn home. Filed:
  `docs/defects/2026-08-25-remaining-fma-sites.md`. Not yet register-seeded
  (Task 6.3).
- **`backend/market/provisioning.go:35,38`** (round-4 correction: the
  emitting lines are 35 and 38 — an earlier draft of this document said
  `34-38`, and the defect doc itself says `34,37`; neither matches the
  actual `FMADDD`-emitting lines) — the NPC request price, which becomes
  persisted credits through the market fold. Filed:
  `docs/defects/2026-08-25-remaining-fma-sites.md`. Not yet register-seeded
  (Task 6.3).
- **`backend/mine/service.go:187`** (round-4 correction: localized — an
  earlier draft of this document said "its exact line is not yet
  localized") — `remainingAtNow := startTons + fold`, an across-statement
  fusion of `startTons := res.Richness * s.params.TonsPerRichness` (line
  186) into the following addition, gating a mine commit's remaining-lode
  check. Independent of the file's already-known `math.Round` issue below.
  Filed: `docs/defects/2026-08-25-remaining-fma-sites.md`. Not yet
  register-seeded (Task 6.3).
- **`mine/service.go:224`** and **`fleet/service.go:117`** — `math.Round`
  into persisted ETAs (mine completion, per-tile transit time). Not caught
  by the FMA sweep above (`math.Round` compiles identically on both
  architectures — it diverges Go↔JS, not Go↔Go). Filed:
  `docs/defects/2026-08-25-remaining-fma-sites.md` (noted there as Go↔JS,
  not Go↔Go). Not yet register-seeded (Task 6.3).

Filing is done: `docs/defects/2026-08-25-remaining-fma-sites.md` covers all
of the bullets above in one document (`**Status:** open`), so every site the
mechanical sweep found now maps to a filed defect. What remains is seeding
a register entry per site — follow-up work, not performed by this change
(see tasks.md, Task 6.3); note that `system/generator.go`'s four call sites
alone become four register entries under Task 6.3's "one register entry per
site, not one per file" rule, not one. The sweep itself is not a one-time
audit: re-running it against the then-current `backend/` tree, and seeding
one register entry per site it finds with a filed defect, is also Task 6.3.

## Impact

- Affected specs: new capability `cross-stack-determinism` (this change adds
  it; `board-tactical-math` is referenced but not modified by this change —
  its Notes-block edit is deferred to implementation, per the rule above).
- A sibling change, `add-polar-lattice-math`, is being authored against the
  now-approved polar migration and depends on this capability's discipline
  (its fixture families and exact-arithmetic-or-discretization rule apply to
  the polar math the same way they apply to hex math today). **Round 2:**
  `Shared Board Math Is Pinned By a Cross-Language Golden Fixture` now
  obligates that change to CREATE a fixture file for any new Go↔TypeScript
  mirror it introduces, closing a gap where that change would otherwise be
  fully compliant with this capability while creating no fixture file at
  all (as `frontend/lib/market/fold.ts` existed as a mirror before
  `fixtures/market/cases.json` did).
- Affected code:
  - `backend/board/fixtures_test.go`, `frontend/lib/hex/fixtures.test.ts` —
    add the `line` exhaustive-sweep case (deferred recording — see above).
  - `fixtures/board/cases.json` — regenerate to include the sweep case, only
    after the `lerp` contraction defect is resolved.
  - `.claude/scripts/check-transcendental.sh`,
    `.claude/skills/code-quality-checks/check.py` — already implemented;
    kept as secondary enforcement, no further edits required by this
    change.
  - The check harness — add a `GOARCH=amd64 go test ./board/...` run and
    wire it into `/check`.
  - `.gitlab-ci.yml` — add `fixtures/**` to the path filters gating the
    backend and frontend board-fixture CI stages.
  - Cross-referenced defects, not fixed by this change, register-seeded per
    Task 6.1: `docs/defects/2026-08-25-line-fma-arch-divergence.md` (Go↔Go
    across architectures, `board.Line`/`lerp`/`hexDirection`, against
    `board-tactical-math`), `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`
    (Go↔TS near-tie, `LaneGateHex`, against `board-tactical-math`), and
    `docs/defects/2026-08-25-lane-eta-arch-divergence.md` and
    `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md` (Go↔Go
    across architectures, against `fleet-movement` and `galaxy-generation`
    respectively, and this capability). Also filed, but NOT register-seeded
    by this change (Task 6.3, follow-up):
    `docs/defects/2026-08-25-remaining-fma-sites.md` (Go↔Go across
    architectures, five sites across `system-interior`, `corporation-spawn`,
    and `npc-market-demand`, and this capability).
  - The `lerp` defect is live, not dormant: `move-preview.ts` mirrors
    `SolveHex`/`SolveIntercept`, which call `RouteAround`, which calls
    `Line`, so it falsifies `fleet-movement`'s already-shipped "Route
    preview matches what a commit would freeze" scenario and
    `hex-board-view`'s "Move Preview From the Acting Fleet's Live Position"
    requirement on an arm64 backend today. Whoever fixes `lerp` needs to
    re-verify those two capabilities, not just `board-tactical-math`'s
    fixtures — neither is modified by this change.

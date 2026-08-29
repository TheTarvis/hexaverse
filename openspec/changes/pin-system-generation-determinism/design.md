# Design: pin-system-generation-determinism

> **Revision 2 (2026-08-29).** An adversarial review returned BLOCKED and
> broke revision 1's Decision 2 with a working counterexample. Decisions 2,
> 3, 4, 5 and 6 are revised; Decision 7 is new. Every claim this revision
> makes about a script's behaviour was re-derived from the script's source,
> and the two load-bearing empirical claims were re-run. Where revision 1 was
> wrong, the wrong sentence is named rather than quietly deleted — this is a
> change about enforcement claims that turned out to be false, and it would
> be absurd for its own design doc to launder its own.

## Context

`backend/system`'s interior generator is **architecture-dependent today**.
Exactly four expressions in `generator.go` fuse a multiply into an add on
arm64 and do not on amd64/`GOAMD64=v1`, so a lode's `Resource.Richness`
differs by 1 ULP depending on which machine materialized the interior. Over
the 80-case sweep `lattice_identity_test.go` already generates, 13 of roughly
500 richness values differ. The value is persisted (`system/model.go`,
`firestore:"richness"`), read by `mine` as
`startTons = Richness × TonsPerRichness`, and **copied into persisted fog
memory** (`system/fog_source.go:84` → `observation.ResourceReading` →
`observation/model.go:128`, `firestore:"richness"`), where a `remembered`-band
read serves the frozen copy back forever. It reaches a gameplay quantity and a
disclosure payload, not merely a debug field.

The divergence is **pre-existing**, not introduced by
`add-orbital-system-bodies` (link 3): it reproduces against the pre-link-3
tree at identical case indices. Link 3 is what *exposed* it, by widening the
local determinism gate to cover `./system/`.

**The fact that motivates this change, stated plainly: the byte-for-byte
cross-target rule is enforced for `backend/system` in ZERO places, and
`fixtures/system/` does not exist on any architecture.** Two prior reports —
including the architect's own link-3 design, Decision 13.5 — claimed this leg
was "asserted by the local `/check` gate only, pending CI." That was wrong in
both halves.

### The enforcement surface is six hand-maintained sites, not three

Revision 1 listed three. That was itself an undercount, found by the same
review that found the original one. The full surface:

| # | Site | Current content | This change |
|---|---|---|---|
| 1 | `.gitlab-ci.yml:341,352` — CI amd64 leg | `./board/`, `./space/` | add `./system/`, `./polar/` |
| 2 | `.gitlab-ci.yml:358-367` — CI qemu arm64 leg | `./board/`, `./space/`, wrapped in `if [ -n "$QEMU" ]` | add `./system/`, `./polar/` |
| 3 | `check.py:1078,1087` — the `/check` gate's two `go test` command strings | `./board/ ./polar/ ./space/` | add `./system/` |
| 4 | `check.py:1426-1432` — `determinism_trigger`, the changed-file predicate that decides whether site 3 runs at all | `backend/board/**`, `fixtures/**` | add `backend/system/**`; `backend/polar/**` and `backend/space/**` are missing too |
| 5 | `check-mirror-map.sh:~end` — three hardcoded passes (`check_mirror board`, `check_mirror polar`, `anti_mirror_space`) | no `system` pass | add one (Decision 5) |
| 6 | `check.py:1435-1441` — `mirror_trigger`, the changed-file predicate for site 5 | `backend/board/**`, **`frontend/lib/hex/**`** (a directory deleted by the polar migration), `fixtures/**` | add `backend/system/**`; the dead `lib/hex` clause is a separate pre-existing bug |

Site 4 is the sharpest of these and it lives inside a file this change already
edits. After task 5.3's edit to the *command strings*, a changed-file `/check`
run touching only `backend/system/generator.go` still does **not** run the
cross-target matrix, because the predicate that gates the whole block never
mentions `backend/system`. Enrolling the package in the command a gate does not
invoke is exactly the class of false enforcement claim this change exists to
end. Sites 4 and 6 are not optional extras.

Two further lists already contain `system` and need no edit from this change,
but both are named here so a reader counting hand-maintained package lists
arrives at eight, not six — the count in an earlier draft of this design was
wrong, and in a change about enforcement honesty that is not a detail to leave
standing:

- **Seventh:** `check-transcendental.sh:82`'s `RULE_BEARING_GO_PACKAGES` —
  `(board polar space disclosure fleet mine galaxy system corporations market)`.
- **Eighth:** `check.py:223`'s `DETERMINISM_GO_PACKAGES` —
  `("board", "fleet", "mine", "galaxy", "system", "corporations", "market")`,
  the changed-file gate for the transcendental lint, living in a file this
  change already edits.

The eighth carries a comment asserting it *"Must match check-transcendental.sh's
own gate"*, and it does not: `polar`, `space` and `disclosure` are missing from
it. That drift is pre-existing, affects a different check than the one this
change enrols, and is **recorded as a known open item rather than fixed here** —
resyncing it changes which files trigger the transcendental lint, which is a
behaviour change this change has not specified and cannot verify in passing.

Note also that sites 1–2 and site 3 **already disagree**: `./polar/` is
enforced locally and not in CI. That asymmetry is pre-existing and this change
closes it in passing, because leaving a known hole open in a change whose
entire purpose is gate honesty is indefensible.

### The register does not fail on a forgotten entry — revision 1 said it does, and that was false

Revision 1's Context and its task 2.7 both leaned on: *"a stale entry fails
the check by design."* Read `check-fma-contraction.sh`. "Stale" there means
exactly one thing:

```
if ! grep -qE '^\*\*Status:\*\* open' "$REPO_ROOT/$defect"; then
    echo "FAIL: register entry references '$defect', whose **Status:** line no longer reads 'open'."
```

A register entry fails only when its **defect doc is closed**. A registered
site that no longer emits FMA is explicitly *not* a failure:

```
# Registered sites that no longer emit: not a failure (only a closed defect
# invalidates an entry), but surface them —
    echo "WARN: registered cross-target site '$site' no longer emits FMA on arm64 —"
```

And `docs/defects/2026-08-25-remaining-fma-sites.md` deliberately keeps
`**Status:** open`, because its `market` and `mine` sites survive this change.
So the exact failure mode revision 1 claimed was impossible — apply the fix,
forget to remove entries `[2..5]` — **passes with four WARN lines**, leaving
four live suppressions pinned at precisely the lines this change just fixed,
re-admitting the defect class the moment anyone edits near them.

The safety net does not exist. Discharging the register is therefore an
independently-verified obligation, not something the check will catch:
`check-fma-contraction.sh` output must contain **no**
`WARN: registered cross-target site 'backend/system/generator.go:` line. That
is the assertion; the pass/fail exit code is not.

### The CI arm64 skip is quiet, not silent — revision 1 overstated that too

Revision 1 called the skip "unremarked" and "green-by-absence." `.gitlab-ci.yml:366`
already prints:

```
arm64 fixture leg SKIPPED: TEST_RUNNER_IMAGE lacks qemu-user (rebuild it per infra/docker) — leg asserted by the local /check gate only
```

That names the condition and the remedy. What it does *not* do is name which
packages went unasserted, carry a greppable marker, or say the words that make
it findable in a job log nobody reads to the bottom of. The defect is
legibility, not silence, and Decision 4 is narrowed accordingly. In a change
whose thesis is that two prior reports misdescribed enforcement, the
mirror-image overstatement gets corrected in the same breath.

### Verification performed for this design

All of the following were run against a scratch copy of `backend/`; the
working tree is untouched.

- Committed tree, `GOARCH=amd64 GOAMD64=v1 go test ./system/`: the
  lattice-identity test **fails**, digest `e7217686…`, against a recorded
  `141cffd8…`.
- With an explicit `float64(...)` conversion around each of the four
  products: `GOOS=linux GOARCH=arm64 go build -gcflags=-S ./system/` emits
  **zero** `FMADDD`/`FMSUBD` sites, and the digest is
  `e72176868246e64134791e642a9e495fcaa7e538f62f073b1e9d8078a006fbb6` on
  **both** targets.
- Post-fix, the surviving `wantLatticeDigest = "141cffd8…"` const fails on
  **both** targets with `got e72176868246…` — re-run on both legs
  (Decision 7).
- Revision 1's proposed two-seed property test, implemented verbatim, **passes
  with a live stream leak present** (Decision 2, where the counterexample and
  its replacement are laid out).
- The replacement — lattice projection with continuous draws *present* vs.
  *absent* — **fails** on that same leak, and its "absent" digest equals the
  clean "present" digest exactly.
- Digesting the continuous fields (`Extent`, per-feature `Size`, `Width`,
  `Space`) over all 80 cases gives
  `4cdcb881167666cb2b1ed9c44d497e4fef9404d73280adaa87473cd1e0bfcfa8` on both
  targets — so the continuous surface converges too, though nothing in the
  task list currently checks that (Decision 3, step 2).

Two facts from the second bullet are load-bearing downstream. First, the fix
makes arm64 adopt amd64's answers — the unfused values were already the ones
production computes. Second, the *entire* 80-case lattice projection converges
once richness is fixed, so richness was the only architecture-dependent
content in it.

## Goals / Non-Goals

**Goals**

1. Make the four `backend/system` richness expressions produce identical bits
   on arm64 and amd64/`GOAMD64=v1`, verified by
   `check-fma-contraction.sh` reporting zero sites for the *package* and by
   the generator's output converging across targets.
2. Remove the four register entries and mark the fixed sites in the defect
   doc, in the same commit as the fix, with an assertion that does not depend
   on the check failing (Context, above).
3. Replace `lattice_identity_test.go`'s misdiagnosing golden master with
   mechanisms that are at least as strong as it was, and that tell the truth
   (Decision 2).
4. Record `fixtures/system/cases.json` and `fixtures/system/mirror-map.json`,
   and enroll `./system/` in all six enforcement sites, in that order
   (Decisions 3 and 5).
5. Make the CI arm64 leg's unasserted state legible instead of buried
   (Decision 4).

**Non-Goals**

- Recording all seven fixture families link 3's Decision 13 declared. Four
  are recorded here; three are deferred to link 4 through the shipped
  coverage-inventory mechanism (Decision 5).
- Fixing any other register entry. `fleet/routing.go`, `galaxy/field.go`,
  `market/provisioning.go` and `mine/service.go` stay registered and open;
  this change touches `backend/system` and the enforcement plumbing only.
- Quantizing richness to an integer scale. Considered and rejected
  (Decision 1).
- Rebuilding and pushing the CI test-runner image. That needs Artifact
  Registry push credentials and is recorded as an environment task
  (Decision 4).
- Any backfill of already-materialized worlds (Decision 6).
- Unifying the six enforcement sites behind one declared package list
  (Decision 3, Open Question 2).

## Decisions

### Decision 1: The remedy is an explicit `float64(...)` conversion around each of the four products — the same remedy the polar rewrite used where it could not delete the float

**What the `board.Line` precedent actually did.** Travis's instruction was to
follow it, so it is worth being precise, because it did **two different
things** and only one of them is available here.
`docs/defects/2026-08-25-line-fma-arch-divergence.md` records the resolution:
`Line`, `lerp`, `roundf`, `cubeRound`, `RouteAround` and `hexDirection` were
**deleted**, because the successor path function (`polar.ArcPath`) is
exact-integer end to end — there is no float left to contract. But the same
resolution note continues: "the lane-gate dot product carries the explicit
`float64(...)` conversions this doc's Recommended fix specifies." Where the
float was removable, it was removed; where it was not, the conversion was
used. Neither is a pragma, and Go has no pragma for this. The register entry
*is* this codebase's pragma, and it is what this change removes.

**Which branch applies here.** The four sites produce values rather than
decisions, and that difference is decisive rather than cosmetic:

- A site whose float is immediately reduced to a **discrete choice**
  (`roundf` at a half-integer tie, an argmin over near-equal candidates) can
  be repaired *without* making the arithmetic identical, by making the
  decision robust — exact-integer arithmetic with a stated tie-break, which is
  exactly what `polar.ArcPath` did. There is a discretization to retreat to
  because the output was already discrete.
- A site whose float **is the stored result** has no tie to break. Richness is
  a bounded scalar drawn from an RNG and persisted; there is no exact integer
  form it was secretly always in. So the deletion branch of the precedent has
  nothing to delete, and the only remedies are (a) make the arithmetic
  bit-identical on both targets, or (b) discretize the *output* so 1-ULP noise
  falls below the quantum.

**And (b) is not a fix, which is the argument the defect doc's "Recommended
fix" section gets wrong.** That doc suggests quantizing richness to basis
points as the better option. Quantizing an already-divergent float only
*reduces the probability* that the divergence survives rounding — it converts
a reliably reproducible 13-in-500 disagreement into a rare one that appears
only when the pre-quantization value lands within 1 ULP of a quantum
boundary. A rarer nondeterminism is a worse nondeterminism: it survives every
test run and shows up in one player's world. It also introduces a bare
rounding call into a package `check-transcendental.sh` lints for exactly that
(`RULE_BEARING_GO_PACKAGES` contains `system`), buying a second problem.
Quantization is only sound *on top of* (a), at which point (a) has already
finished the job.

**The call.** Wrap each of the four products in an explicit `float64(...)`
conversion, with the "do not simplify this — a bare local does NOT inhibit
fusion" comment the codebase already uses at its other guarded sites. The
four sites, at their committed lines:

- `generator.go:129` — `Richness: 0.4 + 0.6*r.Float64()*dial.RichnessMult` (anomaly)
- `generator.go:131` — `Richness: 0.3 + 0.5*r.Float64()*dial.RichnessMult` (ruin)
- `generator.go:247` — `Richness: 0.3 + 0.5*r.Float64()*dial.RichnessMult` (belt primary lode)
- `generator.go:308` — `func rich(...)`: `v := (lo + (hi-lo)*r.Float64()) * mult`

In the first three the fusible shape is the outer `constant + product`; a
single conversion around the product suffices (a chain of multiplies with no
add cannot fuse). In `rich` the fusible shape is the inner
`lo + (hi-lo)*r.Float64()`, whose result is then multiplied — guard the inner
add's product, and guard the outer sum defensively as well so a later edit
that adds a term downstream cannot silently re-open the site.

**The requirement asserts a whole-package zero, never a carve-out.** This
design's "value site vs. discrete-choice site" vocabulary is *rationale* — it
explains why the conversion is the right remedy here. It must not leak into a
spec delta as a qualifier. `check-fma-contraction.sh` fails on **any**
unregistered arm64 FMA site anywhere in the module; a requirement phrased as
"every *value-producing* expression in `backend/system` SHALL…" licenses an
implementer to add a render-only helper with an `a + b*c` shape, argue it is
not value-producing, satisfy the requirement, and red the build. It is also
untestable: an assembly dump names `file:line`, not a category. The behaviour
to require is the observable one — *`backend/system` emits zero FMA
contraction sites on the arm64 leg, and carries no register entry*.
("Value-producing" appears nowhere in the shipped `cross-stack-determinism`
spec, whose vocabulary is "rule-bearing"; revision 1 introduced it and defined
it nowhere. Flagged to the writer.)

**Acceptance is compiler output, not a passing test.** The defect doc's
"beware the false green" warning applies verbatim: the recorded cases can
dodge every divergent input.
`GOOS=linux GOARCH=arm64 go build -gcflags=-S ./system/ | grep -E 'FMADDD|FMSUBD'`
must print nothing, and `bash .claude/scripts/check-fma-contraction.sh` must
pass with the four register entries **removed**, printing no
`WARN: registered cross-target site 'backend/system/generator.go:` line — not
merely with the fix applied.

**What this forecloses.** It forecloses the quantized-richness design: once
the float is pinned, moving richness to basis points later is a
value-changing rewrite of stored data, not a refinement. It also forecloses
treating "assign the product to a local" as a fix anywhere in this codebase —
that advice is already recorded as wrong in two places and this change adds
no third exception.

**Alternatives considered.**

- *Delete the floats — richness as an integer draw in basis points from the
  start.* This is the true analogue of the `board.Line` deletion and it is
  defensible on its own terms. Rejected for this change: it changes the
  generator's semantics and its tuning surface (every `RichnessMult` dial and
  every downstream consumer's arithmetic) in a change whose whole purpose is
  to make an existing gate honest. It is a design change wearing a
  determinism change's clothes, and it can be proposed on its own later at no
  extra cost, since Decision 6 already wipes.
- *Leave the sites registered and only fix the enforcement plumbing.* Rejected:
  the register admits *known, filed, not-yet-fixed* violations, and this
  violation is now four `float64(...)` keystrokes from fixed. An entry that
  cheap to discharge is not a deviation, it is a to-do.

### Decision 2 (REVISED): The surviving in-flight scenario is implemented as written — lattice projection with continuous draws present vs. absent — with the two-seed property as a supporting scenario and a lattice draw-count pin as an independent second guard

Revision 1 got this wrong in two independent ways, and both are fatal to the
version it proposed. They are stated first, because the replacement only makes
sense against them.

**Wrong #1: the property test cannot see the leak class it was sold as
covering.** Revision 1 claimed the two-seed test "is strictly better than the
digest at the job the digest was introduced for" and "cannot misdiagnose its
own failure — there is exactly one thing it can mean." Both of its scenarios
are *same lattice seed, two different continuous seeds*. That detects only a
leak whose effect on the lattice stream **varies with the continuous seed's
value**. It cannot detect the leak that actually matters: continuous-element
code drawing from the **lattice** stream, which shifts every downstream
lattice draw *identically for both continuous seeds*.

Verified, not argued. With a one-line leak in the moon loop
(`m.Size = drawFeatureSize(FeatureMoon, r)` instead of `r2`):

```
leak=false: property test PASSES; digest=16edd243666c04be…
leak=true:  property test PASSES; digest=6ee3441fb9d1f050…
GOLDEN MASTER: caught=true
```

Both scenarios pass with a live stream leak, including the complementary
"continuous elements do differ" assertion (other continuous fields still come
from `r2`, so it stays true). The mechanism revision 1 was retiring catches
this; the replacement does not. An implementer could ship a generator whose
moon sizes, belt widths and orbital radii all draw from the lattice stream and
satisfy revision 1's requirement in full.

**Wrong #2: the "stream non-crossing is change-scoped and has expired
everywhere" premise is false.** Revision 1 argued the assertion's form was
"output after link 3 == output before link 3," and that there is no longer a
"before." But `add-orbital-system-bodies` — an **unarchived, in-flight** delta —
states it in a form that is not change-scoped
(`specs/system-interior/spec.md:41`):

> **Scenario: Adding continuous elements leaves every lattice placement unchanged**
> — **WHEN** an interior is generated across a swept set of seeds, **with the
> continuous element draws present and again with them absent** — **THEN** every
> feature's lattice ring, start angle, direction, footprint, resources,
> effects, id, and generation order are identical between the two runs, for
> every seed

*Present vs. absent* is a same-machine comparison runnable forever. It needs
no vanished tree, no recorded constant, and no recording architecture. It was
implemented as a golden master because that was the cheapest thing to write in
a hurry; the scenario itself never asked for one. `lattice_identity_test.go` is
its only implementation, and revision 1's task 3.4 deleted it — which on
archive would leave `openspec/specs/system-interior` carrying a scenario
nothing implements, next to a weaker near-duplicate from this change, in the
same capability.

**The call — implement the surviving scenario as written.** I accept the
adversary's option (a) without qualification; it closes both defects at once
and it is the reading the in-flight spec already has.

1. **Thread the streams instead of the seeds.** Extract `Generate`'s body into
   an unexported
   `generateWithStreams(seed int64, r, r2 *rand.Rand, region string, skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior`,
   with `Generate` calling
   `generateWithStreams(seed, newRand(seed), newRand(continuousSeed(seed)), …)`.
   Streams rather than seeds, because both new mechanisms need to *construct*
   a stream (a nil one; a counting one) and neither should require a
   test-only knob in production code. `seed` stays a parameter because
   `DominantOrbitDirection(seed)` and `Interior.Seed` consume it directly.

2. **`r2 == nil` means "continuous draws absent."** Three sites need a guard,
   and the set is closed — verified by making the change and compiling:
   `continuousStarParented` early-returns on nil (covering the skeleton-body,
   extra-planet, special, belt and hazard call sites); the moon loop in
   `Generate` skips its `Space`/`Size` block; and `beltFeature`'s
   `f.Width = float64(BeltWidthFraction * f.Space.Radius)` guards on
   `f.Space != nil` (it panics otherwise — the one non-obvious site, found by
   running it). No continuous value feeds back into any lattice field, which
   is what makes "absent" well-defined rather than a fiction.

3. **The primary assertion is present vs. absent, over the swept seed set.**
   Verified against the same injected leak:

   | | present | present, alt continuous seed | absent |
   |---|---|---|---|
   | leak=false | `16edd243…` | `16edd243…` (two-seed **passes**) | `16edd243…` (present-vs-absent **passes**) |
   | leak=true | `6ee3441f…` | `6ee3441f…` (two-seed **passes**) | `16edd243…` (present-vs-absent **FAILS**) |

   Note the bottom-right cell: with the leak on, the *absent* run still
   produces the clean digest, because absent-mode is exactly the pre-continuous
   generator. Present-vs-absent recovers the original golden master's full
   diagnostic power — "the continuous draws moved the lattice stream" — with
   no recorded constant and no recording architecture, and it is the one
   sentence a failure can mean.

4. **The two-seed property is demoted to a supporting scenario**, not deleted.
   It costs nothing, it is nearly subsumed by (3), and it states a differently
   readable property ("the lattice output is a function of the lattice seed
   alone") that a reader gets faster than the present/absent framing. Keep its
   complementary "continuous elements do differ between the two runs"
   assertion, which is the guard against an accidentally-disconnected second
   stream. Neither may be described as the primary assertion, and the spec
   delta must not present them as covering the leak class — that is
   demonstrably false and is how this got here.

5. **Take the draw-count pin.** Yes. Record, per case in the `interiorElements`
   family, the number of words consumed from the **lattice** stream. It is a
   genuinely independent guard: present-vs-absent detects a leak by the *shift
   it causes downstream*, so a leak in the last continuous draw — after every
   lattice draw is done — moves nothing and slips through; a draw count catches
   it. Cost is small now that streams are parameters: the test constructs
   `rand.New(countingSource{…})` and production code never learns about it.
   Two implementation notes for whoever writes it, both cheap to get wrong:
   the wrapper must embed `rand.Source64` and implement **both** `Int63` and
   `Uint64`, since `rand.Rand` type-asserts for `Source64` and a wrapper that
   loses it silently changes the generated sequence; and the test must assert
   the counted run reproduces the uncounted run's projection byte-for-byte, so
   that mistake fails loudly rather than re-recording a different world.

`lattice_identity_test.go`'s `wantLatticeDigest` const and its "the second
(continuous) RNG stream has perturbed the FIRST" `Fatalf` are deleted — not
because the assertion expired (it did not; revision 1 was wrong about that),
but because the *golden-constant instrument* is the wrong shape for it: the
value was recorded on one architecture, is un-re-recordable without editing Go
source, and reports a cross-target float divergence under a stream-leak
message. The assertion survives, better implemented, in the same file.
`TestClampRing_StaysMonotonicNonDecreasing` is unrelated and stays untouched.

**Regression pinning still becomes a fixture family** — `interiorElements` in
`fixtures/system/cases.json` (Decision 5), covering the lattice projection,
the continuous element set, and the lattice draw count, asserted on both legs
by the same harness `board`/`polar`/`space` already use. That is a different
job from the property assertions above: the property tests say the streams do
not cross; the fixture says the output has not moved.

**Is a digest the right shape for the fixture?** For the *sweep*, yes — that is
the recorded convention (`space`'s sweeps digest the newline-joined canonical
serialization) and 80 whole interiors is too much to store as prose. But the
family must **also** carry per-case canonical lines. A digest is a tripwire: it
says something moved. A case file says *what* moved — which feature, which
field, on which case — and that is the difference between a five-minute
diagnosis and an afternoon. The convention already supports both, and this
family uses both.

**What this forecloses.** It forecloses re-adding a hand-copied golden constant
anywhere in `backend/system`: recorded values live in `fixtures/system/` where
the no-drift gate and the reviewable-diff rule can see them. It commits the
package to an unexported streams-in entry point plus three nil-guards, which
link 9 (the lattice deletion) must preserve or deliberately retire. And the
nil-guards are load-bearing test infrastructure living in production code — if
a later change deletes one as "dead," the primary assertion dies with it, so
each carries a comment naming the scenario it serves.

**Alternatives considered.**

- *Revision 1's two-seed property test as the primary assertion.* Rejected on
  evidence, above. It is retained as a supporting scenario only.
- *Keep one test, fix the message* — e.g. "recorded on arm64; if this passes
  on the recording architecture it is a contraction divergence, not a stream
  leak." Rejected as the primary answer, though it remains the correct
  **fallback if Decision 1 slips**: it keeps a golden value outside the fixture
  machinery under a diagnostic that has to enumerate its own failure modes. If
  for any reason the const survives this change, this wording is mandatory.
- *A distinct `contRand` wrapper type so passing the lattice stream to a
  continuous helper is a **compile** error.* Genuinely attractive — it makes
  the leak impossible rather than detected. Rejected on coverage: it only
  guards sites where a *stream* crosses a function boundary. The moon block
  draws inline (`r2.Float64()`), and `r.Float64()` compiles there regardless,
  so the type covers roughly half the surface while costing six signature
  changes and a wrapper type in production. Half a structural guard is worse
  than a whole behavioural one, because it reads as complete.
- *Keep the digest test and add the fixture family* — belt and braces.
  Rejected: two pinnings of the same bytes drift apart, and the one that
  drifts is always the one nobody can re-record without editing Go source.
- *Assert field-by-field with no digest.* Rejected for the sweep only (80
  interiors is unreadable as literals); adopted for the named cases.

### Decision 3 (REVISED): Fix → verify → record → enroll, in that order, across six sites, with the verification surface matching the recording surface

Enrolling `./system/` in any site before Decision 1 lands turns the gate and
the pipeline red, and recording `fixtures/system/` before Decision 1 lands
**freezes arm64's fused answers into the contract** — the precise trap
`docs/defects/2026-08-25-line-fma-arch-divergence.md` spells out ("Do NOT
regenerate before the fix"). Getting this backwards is what happened during
link 3, so it is a constraint, not an implicit task order.

1. **Fix.** Decision 1's four conversions.
2. **Verify, on compiler output and on both targets.** Zero
   `FMADDD`/`FMSUBD` from `go build -gcflags=-S ./system/` on arm64; the
   generator's output identical on arm64 and amd64/`GOAMD64=v1`. **Over the
   whole surface step 4 records, not a subset of it.** Revision 1 verified the
   80-case `projectLattice` sweep, which deliberately excludes `Space`, `Size`
   and `Width`, and then recorded a family covering the continuous element set
   — a surface nothing had checked, in a change whose Decision 3 exists to
   prevent exactly that. The continuous surface does converge
   (`4cdcb881167666cb…` on both targets, measured), but the point is that the
   verification step must be the one that establishes it. A passing test suite
   is not verification; recorded cases can dodge divergent inputs.
3. **Discharge the register.** Remove entries `[2..5]` from
   `fixtures/determinism-register.json` and update
   `docs/defects/2026-08-25-remaining-fma-sites.md` §1, in the **same commit**
   as step 1 — *not* because the check would otherwise fail (it would not; see
   Context), but because it silently would not, and the verification is
   therefore the absence of the `WARN: registered cross-target site
   'backend/system/generator.go:` lines. The defect doc keeps its
   `**Status:** open` line because its `market` and `mine` sites remain open;
   only §1's `system` sites are marked resolved, in the style §2's
   `siteselection.go` resolution already uses.
4. **Record** `fixtures/system/cases.json` and `fixtures/system/mirror-map.json`
   (Decision 5), on either architecture — after step 2 they agree, which is
   the entire point.
5. **Enroll**, all six sites in one commit: `./system/` into `.gitlab-ci.yml`'s
   amd64 leg and its qemu block, into `check.py`'s two command strings, into
   `check.py`'s `determinism_trigger` and `mirror_trigger` predicates, and a
   `system` pass into `check-mirror-map.sh`. Add `./polar/` to the CI amd64
   and qemu legs in the same edit, closing the pre-existing local-vs-CI
   asymmetry, and add `backend/polar` and `backend/space` to
   `determinism_trigger` — they are enrolled in the command and missing from
   the predicate that runs it, the same hole as `system`.

Sites 1–4 of the *sequence* above are one commit (Decision 7); the enrollment
step is the second.

**One list, or six?** These are six hand-maintained copies of one package
list, and this change is the third time that has cost something. The correct
architecture is one declared list both CI and `check.py` read. Ruled **out of
scope** for a fast-tracked change: it touches CI shell and the check harness
for no behavioral gain today, and doing it badly is worse than six greppable
literals. Recorded as Open Question 2 — but the enrollment edits MUST land in
a single commit so a reviewer sees all six adjacent, which is the only thing
that would have caught sites 4, 5 and 6 the first time.

**What this forecloses.** Nothing technically; it forecloses a task ordering.
The writer must not emit a tasks.md whose fixture-recording or enrollment
tasks can be checked off before the verification task, and must not emit a
verification task narrower than the recording task.

### Decision 4 (REVISED): The CI arm64 leg's skip becomes greppable and package-naming; rebuilding the runner image is Travis's environment task

The leg is wrapped in `if [ -n "$QEMU" ]` and, when the runner image lacks
qemu-user, prints a skip line and **exits 0**. It has been effectively
green-by-absence since `add-space-kinematics`. Every determinism claim of the
form "asserted on both legs in CI" that this repo has made is, in CI, an
assertion on one leg.

Revision 1 called that skip unremarked. It is not: line 366 already names the
condition, the remedy (`rebuild it per infra/docker`) and the fallback
("asserted by the local /check gate only"). The real defect is narrower and
worth stating precisely, because a change about false enforcement claims
cannot afford a false claim about enforcement:

- the message carries **no greppable marker**, so no pipeline-wide search or
  future hard-fail flip can find it;
- it does **not name which packages** went unasserted, which is the fact that
  matters once the list is `./board/ ./space/ ./system/ ./polar/`;
- it is worded as a routine skip rather than as a downgrade of a stated
  guarantee.

**The call: make it legible, do not make it fail — yet.** The block keeps
running conditionally; the else branch gains the greppable marker
`DETERMINISM ARM64 LEG UNASSERTED`, the explicit package list, and the exact
command that clears it (`infra/docker/build-test-runner.sh`).

Hard-failing today would red the pipeline for a condition no code change in
this repo can clear, which trains people to ignore it — the same pathology as
a quiet skip, with more noise. The honest position is: the leg is downgraded,
the downgrade is stated in a form a machine can find, and it clears the moment
the image is rebuilt.

**The image rebuild is out of scope as a code task and in scope as a recorded
environment task.** `infra/docker/test-runner.Dockerfile` **already installs
`qemu-user-static`** — verified, line 10. There is nothing to write.
`infra/docker/build-test-runner.sh` requires `GCP_PROJECT`, an authenticated
`gcloud`, and Artifact Registry push rights, none of which an implementing
agent has. The writer should record it as an explicit, separately-checkable
task addressed to Travis, phrased so it cannot be checked off by an agent, and
the change must not claim the arm64 leg is asserted in CI until it is done.

**What this forecloses.** Once the marker is greppable, a later change flips
the leg to a hard failure in one line the day the image ships.

**Alternatives considered.**

- *Hard-fail now.* Rejected above — an unclearable red gate gets routed
  around, and routing around a determinism gate is the failure mode this
  whole capability exists to prevent.
- *Run the arm64 leg natively on a `saas-linux-*-arm64` runner instead of
  under qemu.* Genuinely better — native, faster, no emulation fidelity
  question — and it deletes the whole problem. Out of scope: a runner-tier and
  pipeline-topology decision with cost implications only Travis can make.
  Open Question 3.

### Decision 5 (REVISED): `fixtures/system/` records four families **and an anti-mirror map**; the remaining three families are deferred to link 4 through the shipped coverage inventory

Link 3's Decision 13 declared seven families with per-family sweep types.
**None were recorded**; `fixtures/system/` does not exist. This change is the
one that makes the hard stop real, so it must record something — but recording
all seven means building three pinned-randomized harnesses (100k + 100k + 50k
cases, each with its own draw box, word-consumption order and mapping) for a
fast-tracked change, which is a change of its own wearing this one's name.

**Recorded here:**

| Family | Sweep | Why now |
|---|---|---|
| `continuousRadius` | exhaustive, index `[0, 64]` (65 inputs) | enumerable, pure, ~zero cost |
| `starSizeForClass` | exhaustive, `O B A F G K M` + one unrecognized input (8 inputs) | same |
| `beltMemberOrbit` | exhaustive, `feat-belt-0…7 × k ∈ [0, AsteroidsPerBelt)` (64 inputs) | same |
| `interiorElements` | pinned sweep over `lattice_identity_test.go`'s existing 80-case cross (4 skeletons × 4 regions × 5 seeds): lattice projection, continuous element set, **and lattice draw count**, in generation order | this is the family that carries the values this change fixes, and it subsumes the retired golden master (Decision 2) |

`interiorElements` deliberately reuses the existing fixture set rather than
inventing a new seed sweep: those cases already exercise every branch (extra
planets, belts, moons, specials, hazards) across every region dial, and
reusing them makes the retirement of the digest test a like-for-like swap a
reviewer can check. Link 3's Decision 13 asked for 10,000 seeds under the name
`interiorContinuousElements`; the family is renamed and narrowed here, and the
narrowing is the debt stated below rather than hidden.

**`fixtures/system/mirror-map.json` is required, and revision 1 said the
opposite.** Revision 1 wrote: *"No `mirror-map.json`. `board` and `polar` carry
one because they have TypeScript mirrors; `space` does not, and `system` does
not."* `fixtures/space/mirror-map.json` exists (10,627 bytes) and is the
**anti-mirror** map. Shipped `cross-stack-determinism` binds it:

> "A mirror map for a capability designated Go-sole-authority (no TypeScript
> mirror) SHALL instead run in anti-mirror mode: it SHALL fail if any function
> name is declared in both the Go package and the designated non-mirror
> TypeScript directory, unless that name appears in an explicit,
> empty-by-default `sharedNames` allowlist recorded in the pair's mirror-map
> file."

This change designates `system` Go-sole-authority. Omitting the map would
designate the authority and skip the clause that binds the designation — and
the guard against a mirror silently reappearing later is, in the shipped
spec's own words, "the anti-mirror check named below, not a `pairs` entry."

So: record `fixtures/system/mirror-map.json` with `sharedNames: []`, a
`$comment` stating the designation, and the `coverage`/`inventory` keys
`fixtures/space/mirror-map.json` already uses.

**Generalize `anti_mirror_space` into `anti_mirror <pkg>`.** The function is
already parameterless-by-hardcoding (`fixtures/space/mirror-map.json`,
`backend/space`, `frontend/lib/space`) and its whole body is generic. Lift
those three to arguments and call it twice. `frontend/lib/system` does not
exist, so the `system` pass takes the function's existing
directory-does-not-exist branch and prints a stated trivial pass — the same
shape `space` had before its TS directory existed. That is cheap, it is the
honest form of "no mirror," and it means the day someone adds
`frontend/lib/system` the check is already watching. I decline the "state
explicitly why `system` is exempt" option: there is no principled exemption,
only a cheaper-to-write one.

**Deferred, and owned by link 4.** `keplerPeriodMs` over its full R¹ box,
`gateOrbit`, `stationOrbit`. All three are pure functions whose values
`interiorElements` exercises only at the radii and inputs generation happens to
produce — coverage, not a contract. Per the orchestrator's ruling, the owner is
**link 4, `migrate-fleet-to-continuous-burns`**, and the deferral routes
through the mechanism the shipped spec already provides rather than through
prose: each becomes an `inventory` entry in `fixtures/system/mirror-map.json`
naming link 4 as the covering change, exactly as
`fixtures/space/mirror-map.json`'s four entries do (`pair`, `why`,
`expectedChange`). The rule that keeps them from evaporating is the shipped
one: *"a rule-bearing shared function SHALL NOT remain in the inventory across
more than one change that modifies its package."* Add a line to
`docs/plans/continous_space/chain.md`'s Link 4 section so the obligation is
visible from the chain, not only from a fixture file.

Be honest about the strength of that: `anti_mirror` does not read `inventory`
(only `check_mirror` does, and `system` has no `pairs`). So the entries are a
*declared, greppable, spec-bound home* with a named owner — not a script
assertion. That is strictly better than revision 1's unowned Open Question and
strictly weaker than a failing check, and the writer must not describe it as
the latter. They do not get a *register* entry either: the register admits
violations of a check, and no check consults a family that was never recorded.

**Shape, confirmed against the shipped conventions** (`fixtures/space/cases.json`,
`fixtures/polar/cases.json`), not invented:

- `_meta.generatedOn.goarch` + `goamd64`, `_meta.buildTargetMatrix`
  (`"GOARCH=arm64 and GOARCH=amd64 with GOAMD64=v1"`), `_meta.serialization`.
- `_meta.jsRuntimeLeg` carries a **stated** "none — `backend/system` is
  Go-sole-authority with no TypeScript mirror by design" sentence, matching
  `space`'s `noJSLegStatement`. An absent field reads as an oversight; a
  stated one reads as a decision.
- Per family: a list of named hand-selected cases with their canonical `out`
  lines, plus a `<family>Sweep` entry pinning domain (or PRNG + integer seed
  + box + draw mapping + word order), `count`, `lines`, `serialization`, and
  the SHA-256 `digest`.
- Canonical float serialization is `strconv.FormatFloat(v, 'b', -1, 64)`;
  integer-valued outputs (a `WorldMillis` period, a `SubTurns` angle, a draw
  count) as exact decimal `int64`; multi-component outputs joined by `,`; an
  error outcome as a fixed sentinel token.

**What this forecloses.** Recording four families means `./system/`'s
cross-target legs assert the package's whole test suite plus four families —
strictly more than today's nothing, strictly less than the capability's full
shape. The change must say that in those words and must not describe the
system fixture matrix as complete.

### Decision 6 (REVISED): Changed richness values are a wipe-and-reseed, never a backfill — and the wipe scope includes persisted fog memory

Decision 1 changes what `Generate` produces. Every already-materialized dev or
emulator interior therefore carries richness values a fresh generation would no
longer produce (specifically: arm64-fused values where a regeneration would now
produce the unfused ones). Per the standing ground rule — and per link 3's own
Decision 15, which made the identical call — the remedy is **wipe the world and
reseed**. No backfill, no lazy re-derive on read, no migration script.

The reasons hold unchanged: prod exists but is unused, the toy has no players
whose worlds must survive, and a partial backfill would produce interiors whose
richness came from one arithmetic and whose derived state (`mine` deltas already
appended against the old `startTons`) came from another — internally
inconsistent, silently. `galaxies/` is regenerated via `make seed`;
corporations re-spawn.

**Second affected surface, named because it is easy to miss.** Richness is
copied out of the interior into persisted fog memory —
`system/fog_source.go:84` builds `observation.ResourceReading` from
`Resource.Richness`, and `observation/model.go:128` persists it
(`firestore:"richness"`). A `remembered`-band read serves that frozen copy, so
a stale fog document would keep serving a fused value long after the interior
was regenerated. The wipe covers it (dropping `galaxies/` and re-spawning drops
the observation store with it), but `observation-fog-and-scan` is a **touched
surface** and the change's Impact list must say so — it is exactly the kind of
second copy a future partial-reset would miss.

**What this forecloses.** Any future claim that a materialized world is
comparable across the fix boundary. A world seeded before this change and a
world seeded after are different worlds, and no digest, screenshot, or saved
coordinate from before is evidence about after.

### Decision 7 (NEW): Sections 1–4 land as a single commit, because any split of them is red on both targets

Revision 1's tasks 2.7 and 3.4 guaranteed a commit that is red everywhere.
The mechanism:

- Section 1's fix changes the generator's output from arm64's fused values to
  the unfused ones, on **both** targets.
- `lattice_identity_test.go`'s `wantLatticeDigest = "141cffd8…"` was recorded
  from the fused arm64 values.
- So the instant the fix lands, that test fails on arm64 **and** on
  amd64/`GOAMD64=v1`, both reporting `got e72176868246…, want 141cffd8…`.
  Re-run on both legs for this revision; the output is identical.

Revision 1's task 4.6 — "confirm the suite is green on both targets before
committing the fixture" — is therefore unsatisfiable as long as the const
exists, and revision 1's task 3.4 deferred deleting the const until the fixture
commit. The two tasks are mutually unsatisfiable.

**The call.** Sections 1 (fix), 2 (verify + register discharge), 3 (test
replacement, including deleting the const) and 4 (fixture recording) are **one
commit**. Section 5 (enrollment) is a second commit; Section 6 (the CI skip
marker) may ride either. The reason is not tidiness: it is that the interval
between "the fix lands" and "the const is gone" is a state in which the
package's suite cannot be green anywhere, so no verification step inside that
interval can be honestly checked off, and any tasks.md that creates the
interval instructs the developer either to commit red or to lie.

This also satisfies the risk revision 1 correctly identified — that deleting
the golden master before the fixture exists leaves the package *less* pinned
than today. One commit resolves it in the only direction that works.

**What this forecloses.** A bisectable history across the fix. There is no
commit in this change at which `backend/system` computes the new values under
the old pin, which is the point; anyone bisecting a richness question crosses
the boundary in one step and Decision 6 already says worlds are incomparable
across it.

## Risks / Trade-offs

- **The arm64 leg remains unasserted in CI after this change ships.** Adding
  `./system/` to the qemu block changes nothing until the runner image is
  rebuilt (Decision 4). The change's own claims must be worded as "enrolled in
  all six sites; the CI arm64 leg is enrolled but unasserted pending the image
  rebuild" — never "asserted on both legs." This is the third time this exact
  overstatement would have been made; the writer should treat any sentence
  containing "both legs" as requiring proof.
- **`fixtures/system/` covers four of seven declared families.** Stated in
  Decision 5, repeated here so it appears in the risk register a reviewer
  reads. The three deferred ones are inventory entries with a named owner, not
  a failing check.
- **The nil-continuous-stream guards are test infrastructure in production
  code.** Three sites (`continuousStarParented`'s early return, the moon
  block's skip, `beltFeature`'s `f.Space != nil` width guard) exist only so
  the primary assertion can run. A future change deleting one as dead code
  silently kills the assertion. Each carries a comment naming the scenario it
  serves; that is the whole mitigation, and it is a weak one.
- **`generateWithStreams` takes both a `seed` and a lattice `*rand.Rand`,
  which can disagree.** A caller could pass a stream seeded from something
  other than `seed` while `DominantOrbitDirection(seed)` reads the original.
  It is unexported and has two callers (`Generate` and the tests), but it is a
  footgun and link 9 must decide the seam's fate rather than inherit it.
- **The residual architecture hazard in `system` is not zero after this
  change.** `system.Generate` consumes `galaxy.Skeleton`, and
  `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md` remains open
  on `opensimplex-go`'s 273 arm64 FMA sites, which decide which systems exist
  at all. Fixing `system`'s own arithmetic does not make a generated *galaxy*
  target-independent, and no wording in this change should imply it does.
- **Richness magnitude was never measured beyond this sweep.** 13 of ~500
  values over 80 interiors is the observed rate, not a measured bound over the
  real input domain. The fix removes the need for the measurement, so the
  register entries are discharged rather than remeasured — but the defect doc's
  "magnitudes unmeasured" line stays true for its surviving sites.
- **Two of this change's six enrollment sites were discovered by adversarial
  review, not by the design.** Sites 4, 5 and 6 were missed on the first pass
  by the same process that missed site 3 during link 3. Nothing in this change
  prevents a seventh from existing. Open Question 2 is the actual fix, and it
  is deferred.

## Migration Plan

**There is none, deliberately.** See Decision 6: the only stored artifacts this
change invalidates are generated world data and the fog memory copied from it,
and both are wiped and reseeded. There is no schema change, no API change, no
persisted-shape change — `Resource.Richness` and
`observation.ResourceReading.Richness` keep their types, tags and ranges. Prod
exists but is unused; there are no players and no saved worlds to carry
forward. Writing a backfill would be more code, more risk and more surface than
`make seed`, and it would produce interiors whose richness and whose
already-appended `mine` deltas came from different arithmetic.

Local action for Travis after this lands: clear the Firestore emulator data
(which drops `galaxies/` **and** the observation store together — dropping only
one leaves fog memory serving pre-fix richness) and re-run `make seed`, plus
`cmd/seed start-area` if `frontend/public/galaxy/start-area.json` is in use.
Any dev corporation re-spawns through the existing idempotent spawn path.

## Open Questions

1. ~~Who owns the three deferred fixture families?~~ **Resolved by orchestrator
   ruling, 2026-08-29: link 4, `migrate-fleet-to-continuous-burns`.** Recorded
   as `inventory` entries in `fixtures/system/mirror-map.json` naming link 4,
   plus a line in `docs/plans/continous_space/chain.md`'s Link 4 section
   (Decision 5). Note that `migrate-fleet-to-continuous-burns` has no
   `openspec/changes/` directory yet, so the obligation lives in the fixture
   file and the chain doc until it does.
2. **One declared package list for the six enforcement sites.** Ruled out of
   scope in Decision 3. It is now the highest-value follow-up in this area:
   three of the six were missed on the first pass, and the seventh copy is the
   one that gets missed next. Owner unassigned; recommend it precede the next
   package enrollment rather than follow it.
3. **Native arm64 CI runner instead of qemu.** Strictly better than the
   emulated leg and it deletes Decision 4's whole problem, but it is a
   runner-tier and cost decision only Travis can make.
4. **`check.py`'s `mirror_trigger` names `frontend/lib/hex`,** a directory the
   polar migration deleted. That clause is dead, so a change touching only
   `frontend/lib/polar` or `frontend/lib/board`… actually still triggers via
   `backend/board`, but the intent is plainly stale. Out of scope to fix
   properly; flagged so the writer can decide whether a one-line correction
   rides along with the site-6 edit.
5. **Should `check-fma-contraction.sh` assert a per-package zero-site
   expectation?** Today it fails on any *unregistered* site anywhere in the
   module, which is correct but means a package's clean state is never
   positively recorded — `backend/galaxy` and now `backend/system` are at zero
   sites and nothing pins them there except the absence of a register entry.
   Related: the WARN-not-FAIL behaviour documented in Context means a forgotten
   entry is invisible to the exit code. Both are arguments for the same small
   upgrade; neither is in scope here.
6. **Does anything else read `Resource.Richness` besides `mine` and the fog
   source?** Two consumers are now known (Decision 6). Worth one grep during
   implementation; if a market or UI path derives from richness, Decision 6's
   wipe scope is unchanged but the change's Impact list grows again.

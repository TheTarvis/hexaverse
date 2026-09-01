# Cross-package emulator test race — `go test ./...` is not safe in parallel

**Found:** 2026-09-01, during link 5 (`replace-observation-with-sightings`)
section 6 orientation.
**Status:** open. Pre-existing; **not** caused by the continuous-space chain.
**Reproduces on:** an unmodified tree at `d18c255`, working tree clean.
**Severity:** the full backend suite is unrunnable in its default mode. The
`/check` gates do not hit it; this change's own task 8.3 does.

## The symptom

Default `go test ./...` (parallel, one process per package) fails in **five**
packages:

```
FAIL	hexaverse/corporations	81.496s
FAIL	hexaverse/fleet	 6.991s
FAIL	hexaverse/galaxy	24.687s
FAIL	hexaverse/market	41.036s
FAIL	hexaverse/mine	17.809s
```

`go test -p 1 ./...` is **fully green, all 20 packages.** So is
`go test -short ./...` in parallel — `-short` skips the emulator-backed
integration tests, which is why the repo's routine gates
(`.claude/scripts/check.sh` runs `go test -short ./...`; `backend/Makefile`'s
`test` target runs `go test ./... -short`) have never surfaced it.

Failure messages are the tell — every one is a missing-precondition error, not
a logic error:

```
galaxy/dao_test.go:104: GetLive: no live galaxy
galaxy/dao_test.go:154: block holds 0 systems, want exactly 4 (converged, not duplicated)
corporations/spawn_healing_test.go:97: first Spawn: system not found
corporations/spawn_healing_test.go:137: Spawn: corporation not found
corporations/service_test.go:172: rpc error: code = NotFound desc = no entity to update:
    app: "dev~test" path < Element { type: "corporations" name: "corp_1957..." } >
market/service_test.go:457: 0 of 2 concurrent sales settled, want exactly 1
    (errors: not found, not found)
```

Data that the test itself wrote, seconds earlier, is gone by the time it reads
it back.

## The mechanism

It is not flaky ordering or emulator slowness. It is **destructive
cross-package collection wipes**, and it is deterministic given overlap.

`common.CleanupFirestoreTestData(t, client, collections...)`
(`backend/common/firestore_test_helpers.go:43`) takes *top-level collection
names* and deletes **every document in each one**:

```go
for _, collName := range collections {
    iter := client.Collection(collName).Documents(ctx)
    // ... doc.Ref.Delete(ctx) for every document
}
```

There is no test-run namespacing. Every package points at the same emulator,
the same project (`dev~test`), and the same collection names. The collections
wiped this way, gathered across the suite, are shared by construction:

`galaxies`, `corporations`, `corpByAccount` (account pointers), `fleets`,
`actions`, `accounts`, plus the spawn-claims and station paths.

So when `corporations`' test binary runs its deferred cleanup of `galaxies`
while `galaxy`'s test binary is midway through a materialization assertion,
the live-galaxy pointer `galaxy` just wrote is deleted underneath it — hence
`GetLive: no live galaxy`. The relationship is symmetric and n-way: any two of
the five packages can victimize each other, in either direction, and `market`
and `mine` are hit because they seed corporations and fleets to sell and mine
with.

Note this is a *wipe*, not a *conflict*: the victim does not observe a
contended write, it observes an empty world. That is why the failures read as
absurd ("0 of 2 concurrent sales settled") rather than as races.

## Why it is worth recording rather than patching in passing

`CleanupFirestoreTestData` is already on the books as an instance of a species
this chain keeps rediscovering — link 4's task 9.9 catalogued
*hand-maintained lists kept in sync by memory, where the omission is silent
and the unit tests still pass*, and link 5's task 7.5 enrolls
`CleanupFirestoreTestData` as the sixth instance (it needs `sightings`,
`charts`, and `chartedLanes` added by hand).

This defect is a **different** flaw in the same helper: not that its list of
collections is hand-maintained, but that the collections are **global**. Adding
names to the list makes this race strictly worse, since each added name is one
more shared collection that any package may wipe out from under any other.
Task 7.5 will add three.

## Candidate fixes, none applied here

1. **Namespace the test data per package or per run.** A collection prefix
   drawn from the package name or a run id (`test_<run>_galaxies`) removes the
   overlap entirely and is the only fix that makes parallel execution correct
   rather than merely avoided. Cost: every DAO would need to resolve its root
   through a configurable prefix.
2. **Delete by query, not by collection.** Cleanup scoped to the documents a
   test actually created (by id prefix or a seeded marker field) rather than
   `Collection(name).Documents()`. Cheaper, but relies on every test tagging
   its writes — a new hand-maintained discipline, which is the species we are
   already trying to leave.
3. **Force `-p 1` for the emulator-backed suite** and say so in
   `backend/CLAUDE.md` and the Makefile. Honest, immediate, and slow: the
   serialized run's package times sum to ~4m25s, where the parallel run is
   bounded by its slowest package (~80s). This is
   a workaround, not a fix — it makes the suite pass by removing the
   concurrency rather than by making the tests independent.

Recommendation: (3) now as a stated rule so the suite is trustworthy, (1) as
its own change. Deriving cleanup scope rather than declaring it is the same
shape of fix link 4's task 9.9 deferred for the registry lists, and the two
should probably be one change.

## Interaction with link 5's task 8.3

Task 8.3 says "Run the full backend test suite (`go test ./...`, emulators
up)". Run verbatim, it is **red on an untouched tree** — and would be read as
link 5 having broken five packages. Run it as `go test -p 1 ./...`, and record
both results, so a red parallel run is attributed here and not to the change
under test.

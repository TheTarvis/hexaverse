# DEFECT: two `SpaceStage — keyboard camera` vitest cases time out nondeterministically

**Found** 2026-09-09 during `fix-mutation-retry-on-4xx`'s tier-1 gate.
First noticed by that change's SDET at red handoff (before any production code
for it existed), then characterised by the orchestrator.
**Status:** OPEN. NOT this change's — **proven pre-existing by isolation in a
clean worktree at HEAD.** See *Proof* below.
**Owner:** whoever next works `add-vitals-strip` / `system-space-view` — these
are that area's tests, not the retry policy's.

## The tests

`frontend/components/space/SpaceStage.interaction.test.tsx`, describe block
`SpaceStage — keyboard camera`:

1. `Scenario: Keyboard input at a clamp is distinguishable from no input`
2. `Scenario: A pan limit is still observable while the camera is also at the zoom clamp`

## What happens

Either one fails by **timing out**, not by asserting. Measured wall times sit
right at or just past the 10 s `testTimeout`:

| Context | Failing case | Duration |
| --- | --- | --- |
| full suite, live tree | both 1 and 2 | 16.1 s, 11.8 s |
| isolated, live tree (run 1) | 2 only | 10.6 s |
| isolated, live tree (run 2) | 2 only | 10.3 s |
| **isolated, clean worktree at HEAD** | **1 only** | **12.0 s** |

**Which of the two fails is not stable** — and that is the tell. The same file,
run four times across two trees, failed case 1 alone, case 2 alone, and both
together. A deterministic regression does not move between sibling tests.

Full-suite totals for context: `2 failed | 1610 passed (1612)`; isolated:
`1 failed | 36 passed (37)`.

## Proof it is not `fix-mutation-retry-on-4xx`'s

Two independent lines, one logical and one empirical.

**1. There is no code path.** Neither the test nor the component under test
references the changed module at all:

```
$ grep -n "query-client\|queryClient\|useMutation\|QueryClientProvider" \
    frontend/components/space/SpaceStage.interaction.test.tsx
(no matches)
$ grep -rn "query-client\|useMutation" frontend/components/space/SpaceStage.tsx
(no matches)
```

`fix-mutation-retry-on-4xx` changes exactly one production file,
`frontend/lib/query-client.ts`. Nothing in this test's graph reaches it.

**2. It reproduces at HEAD, without the change.** Run in a **clean
`git worktree` detached at `31df519`** — the commit before any production code
for the change — with `node_modules` symlinked and `frontend/lib/query-client.ts`
confirmed to be the original (`grep -c shouldRetryMutation` → `0`):

```
× SpaceStage — keyboard camera > Scenario: Keyboard input at a clamp is
  distinguishable from no input 12037ms
Tests  1 failed | 36 passed (37)
```

A worktree was used deliberately rather than reverting the file in place: the
live tree held another agent's uncommitted work, and this repo has a recorded
incident (`README.md`, *Lesson seven*) of exactly that reversion destroying it.

## Likely cause, stated as a hypothesis

A timeout at the boundary that gets worse under parallel load (16.1 s in the
full suite vs ~10.5 s isolated) usually means the test is *waiting* on
something that resolves slowly rather than asserting something false — a
`waitFor`/`findBy` on a camera state that settles over several animation
frames, with rAF or a settle loop starved when other suites share the CPU.

**Do not "fix" this by raising `testTimeout`.** `docs/testing-tiers.md` is
explicit that a budget raised to make a suite pass hides the thing it was
measuring, and this repo has already ridden that treadmill twice on the backend
suite. The question to answer first is *what* the test is waiting on and why it
takes ten seconds when its siblings take milliseconds.

## Why it was not fixed here

`fix-mutation-retry-on-4xx` is a fast-tracked, frontend-only change whose
stated Impact is four files, none of them this one. Fixing an unrelated flaky
test in another capability's area would exceed that Impact, which the team
workflow classes as a finding against the developer. It is also not a
regression: it is equally red without the change.

## CORRECTION, same day — it is load-dependent, and a quiet tree is green

The section above was written from contended runs. Two further data points
finish the picture, and they matter:

| Run | Wall time | SpaceStage result |
| --- | --- | --- |
| orchestrator, developer agent running concurrently | 205 s | **2 failed** |
| orchestrator, quiet tree | **104 s** | **green — 1612 passed (1612)** |
| developer, contended | 146–212 s | 2 failed |
| developer, quiet | 106–115 s | green |

**The tier-1 gate for `fix-mutation-retry-on-4xx` is GREEN**
(`bash .claude/scripts/check.sh` → `All checks passed`, exit 0, 119 files /
1612 tests). The two reds appear only when the suite is contended, at roughly
double the wall time.

So the correct statement is not "two pre-existing failures" but **"two tests
that time out when the machine is loaded, and pass when it is not."** That is a
sharper and more useful claim: the tests are not broken, they are *slow enough
to be fragile*, and the 10 s budget has no headroom under load. It also means
CI — which is more contended than a quiet laptop — is where this will bite.

The independent proof of non-causation stands unchanged and is the durable
part: no import path, and reproduced at HEAD without the change. The developer
reached the same conclusion by a different route (a `cp`-based swap of HEAD's
`query-client.ts`, no destructive git command), which is worth noting as two
agents converging rather than one being believed.

## What it costs right now

Nothing, for this change — the gate is green. The cost is latent: anyone
running a contended tier 1 anywhere in this repo can meet these two reds and
lose time deciding whether they are theirs. Read this file first. The
orchestrator spent four runs and a worktree establishing that they are not.

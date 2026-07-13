# Specs — Spec-Driven Development for Hexaverse

This directory holds **feature specs**: short documents that capture the
*what* and *why* of a change before the code is written, plus enough of the
*how* to start building. The spec is the durable artifact; code is downstream
of it.

## Why we do this

- **The spec is what the AI agent reads.** Claude Code (and `claude-agent`)
  work from intent, not just code. A spec is a stable source of truth for
  *why* something exists — code only ever shows *what*.
- **Cheap review before expensive review.** Catching "wrong feature entirely"
  in a one-page English spec beats catching it in a 600-line diff.
- **Decisions get recorded, not just made.** For a rebuild where "which
  features survive is still to be decided," specs are where those decisions
  live.

## When to write one

Write a spec for anything **big enough to think about**: a new gameplay
system, a data model, a cross-service flow, a non-trivial refactor. **Skip it**
for bugfixes, tweaks, and mechanical CRUD (use `/new-domain` for the latter).
Lightweight by design — if the ceremony ever outweighs the thinking, shorten
the spec.

## How

```bash
/spec <slug>        # e.g. /spec galaxy-generation
```

This allocates the next number, stamps `TEMPLATE.md` into
`NNNN-<slug>.md`, adds it to the index below, and then the agent interviews
you to fill it in. Or just copy `TEMPLATE.md` by hand.

## Lifecycle

Each spec carries a `status` in its frontmatter:

| Status | Meaning |
|--------|---------|
| `draft` | Being written / discussed. Not yet agreed. |
| `accepted` | Agreed; ready to build against. |
| `implemented` | Shipped. The spec now documents what exists. |
| `superseded` | Replaced by a later spec (link it). |

Keep the status current — a spec that says `accepted` but was never built is
worse than no spec.

## Conventions

- Filenames: `NNNN-kebab-slug.md`, zero-padded 4-digit number (`0001-...`).
- Numbers are allocated in order and never reused.
- One spec = one coherent feature or decision. Split if it sprawls.
- Cross-link related specs and the vision doc (`../vision.md`).

## Scenarios — the spec-to-test link

Testable behavior lives in a spec's `## Scenarios` section as **Given / When /
Then** blocks. Each is a `### S<n> — <title>` heading, giving it a global ID of
`NNNN/S<n>`. A test declares it covers a scenario by citing that ID in a
comment:

```go
// Spec: 0009/S1
func TestSpawn_CreatesCorpFleetAndFog(t *testing.T) { ... }
```

`frontend/lib/spec-scenarios.test.ts` — an ordinary **frontend unit test**, one
case per scenario — fails if any scenario in an `accepted`/`implemented` spec
has no test citing its ID. It scans all four suites (BE unit, BE e2e, FE unit,
FE e2e), so a Go test losing its marker fails it too. Scenarios in `draft` specs
don't fail — write them before the code exists and they arm the moment the spec
is accepted.

No BDD runner, no step definitions, no bespoke harness: tests stay idiomatic Go
/ vitest / Playwright and just carry the marker. `0009-spawn.md` is the worked
example. Non-behavioral guarantees (invariants, structural facts) stay in
**Acceptance criteria**, not Scenarios.

## What's not spec'd yet

See **[BACKLOG.md](BACKLOG.md)** — a coverage map of every game mechanic the
design implies, marked spec'd / plan-only / idea-only, so gaps are visible and
each can be spec'd, folded, or scratched.

## Index

<!-- specs:index (the /spec tool appends rows below this line; keep it) -->
| # | Spec | Status |
|---|------|--------|
| 0011 | [Fleet Roster (where is everything?)](0011-fleet-roster.md) | implemented |
| 0010 | [Mine (extraction verb)](0010-mine.md) | accepted |
| 0009 | [Spawn & Corporation Identity](0009-spawn.md) | implemented |
| 0008 | [Inter-system Movement (galaxy graph)](0008-movement-galaxy.md) | accepted |
| 0007 | [Hex Board View (system renderer)](0007-hex-board-view.md) | accepted |
| 0006 | [Scan & Fog of War](0006-scan-and-fog.md) | accepted |
| 0005 | [Action & Timer System](0005-action-timer.md) | accepted |
| 0004 | [In-system movement (coast & thrust)](0004-movement-board.md) | accepted |
| 0003 | [System interior generation](0003-system-interior.md) | accepted |
| 0002 | [Galaxy view (galactic graph UI)](0002-galaxy-view.md) | accepted |
| 0001 | [Galaxy generation](0001-galaxy-generation.md) | accepted |

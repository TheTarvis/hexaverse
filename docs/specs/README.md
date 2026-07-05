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

## Index

<!-- specs:index (the /spec tool appends rows below this line; keep it) -->
| # | Spec | Status |
|---|------|--------|
| 0001 | [Hex-grid galaxy generation](0001-hex-grid-galaxy-generation.md) | draft |

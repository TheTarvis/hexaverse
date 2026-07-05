---
name: spec
description: Create or update a feature spec under docs/specs/ (spec-driven development). Allocates the next spec number, stamps the template, wires the index, then interviews the user to fill in the what/why before code is written. Triggers on `/spec`, "write a spec", "spec out this feature".
---

# Spec

Hexaverse uses lightweight **spec-driven development**: before building a
feature big enough to think about, write a one-page spec capturing the *what*
and *why* (plus enough *how* to start). The spec is the durable artifact and
the source of truth the AI agent reads. See `docs/specs/README.md` for the
philosophy, lifecycle, and conventions.

Use this for real features (gameplay systems, data models, cross-service
flows, non-trivial refactors). **Don't** use it for bugfixes or mechanical
CRUD — that's `/new-domain`.

## Steps

### 1. Confirm the slug and title

Ask the user for a short kebab-case slug (e.g. `galaxy-generation`,
`fog-of-war`) and, if the auto-titled version isn't right, a human title.
Don't guess a vague slug — the slug is the filename forever.

### 2. Allocate + stamp the spec

```bash
python3 .claude/skills/spec/new_spec.py <slug> ["Human Title"]
```

The script:
- Finds the next free `NNNN` by scanning `docs/specs/`.
- Renders `docs/specs/TEMPLATE.md` → `docs/specs/NNNN-<slug>.md`, filling in
  number, title, and created date.
- Adds a row to the index table in `docs/specs/README.md`.
- Refuses to overwrite an existing file unless `--force` is passed.

The date defaults to today; pass `--created YYYY-MM-DD` only if backdating.

### 3. Interview the user and fill the body

This is the real work and needs judgment — do **not** leave the template
placeholders. Walk the user through, section by section, and write their
answers into the file:

- **Problem / motivation** — what's wrong today, who's affected. Push for
  concreteness.
- **Goals** — testable outcomes.
- **Non-goals** — what it deliberately excludes (prevents scope creep).
- **Proposed approach** — the core idea in prose.
- **Design details** — data model, events, edge cases; reference real paths
  (`backend/<domain>/`, `backend/common/pubsub.go`, SSE channels, frontend
  service/hook/component chain).
- **Acceptance criteria** — concrete checkable conditions; these become the
  review checklist / tests.
- **Open questions** — unresolved decisions, each with an owner.

Cross-link `../vision.md` and related specs (`#NNNN`). Keep it tight — if a
section has nothing real to say, a single honest line beats padding.

Leave `status: draft` until the user explicitly agrees the spec. Then they (or
you, on their say-so) bump it to `accepted`.

### 4. Offer next steps

Once accepted, the spec drives implementation. For a CRUD-shaped feature,
`/new-domain` scaffolds the code; for gameplay logic, build against the
acceptance criteria and check them off as you go. Update `status:` to
`implemented` when it ships.

## Updating an existing spec

To revise a spec, just edit the file. Keep the `status` frontmatter honest
(`draft → accepted → implemented → superseded`). When one spec replaces
another, set `superseded_by` on the old and `supersedes` on the new, and
update the index status.

## Editing the template

The template lives at `docs/specs/TEMPLATE.md` (not in this skill dir, so it's
visible alongside the specs it seeds). The script substitutes `number: NNNN`,
`title: <Feature name>`, `created: YYYY-MM-DD`, and the `# NNNN — <Feature
name>` heading — keep those literal strings intact if you edit it.

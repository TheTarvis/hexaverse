# description: Create or update a feature spec under docs/specs/ (spec-driven development)

Write a lightweight feature spec — the *what* and *why* of a change, plus
enough *how* to start — before building. The spec is the durable artifact and
the source of truth the AI agent reads. See `docs/specs/README.md`.

Use for real features (gameplay systems, data models, cross-service flows,
non-trivial refactors). Not for bugfixes or mechanical CRUD — that's
`/new-domain`.

## Steps

1. Confirm a kebab-case slug (e.g. `galaxy-generation`, `fog-of-war`) and a
   human title with the user. Don't guess — the slug is the filename forever.
2. Verify Python is available: `command -v python3 >/dev/null 2>&1`. If not,
   stop and tell the user (`brew install python@3.12` on macOS).
3. Execute: `python3 .claude/skills/spec/new_spec.py <slug> ["Human Title"]`
   — allocates the next `NNNN`, stamps `docs/specs/TEMPLATE.md` into
   `docs/specs/NNNN-<slug>.md`, and adds it to the index.
4. Interview the user section by section and fill in the body: Problem /
   Goals / Non-goals / Proposed approach / Design details / Acceptance
   criteria / Open questions. Do **not** leave template placeholders.
   Reference real codebase paths in Design details.
5. Leave `status: draft` until the user agrees the spec; then bump to
   `accepted`. Update to `implemented` when it ships.

## Notes

- To revise a spec, edit the file directly and keep the `status` frontmatter
  honest (`draft → accepted → implemented → superseded`).
- When one spec replaces another, set `superseded_by` / `supersedes` and
  update the index.
- `docs/specs/0001-hex-grid-galaxy-generation.md` is a worked example.

See `.claude/skills/spec/SKILL.md` for the full design.

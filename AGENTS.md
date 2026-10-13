# Shared agent guidance

Read root `CLAUDE.md` before working in this repository and each applicable
nested `CLAUDE.md` before editing a file. Keep project guidance in those shared
files so both clients read the same source.

## Shared files

`harness/` owns shared tooling. `harness/skills/` contains unmodified published
skills from mattpocock/skills. `.agents/skills` and `.claude/skills` point there.
Do not edit imported skills; update them with `python3 harness/update-skills.py
update`. Provenance and verification are described in `harness/README.md`.

Local operational scripts live in `harness/utilities/`. They are ordinary
commands, not skills. Use `harness/` paths in new references. `tools` and
`.claude/scripts` are compatibility links to `harness/`.

## Working rules

- Run harness scripts from the repository root unless documented otherwise.
- After editing a file, run `bash harness/validate-file.sh <path>`.
- Map skill tool names to available client capabilities. Report an unavailable
  required capability rather than pretending it ran.
- Claude hooks and permissions are client-specific; run applicable checks
  explicitly in other clients.
- Bootstrap substitutes project labels in local utility templates. Construct
  literal placeholder tokens at runtime, as in
  `harness/utilities/new-domain/new_domain.py`. Imported skills and their lock
  file are excluded from substitution.

---
name: new-domain
description: Scaffold a new CRUD domain by rendering the in-skill templates. Generates backend handler/service/dao + frontend service/hook/page, then prints the wiring edits to apply.
---

# New Domain

Adds a new domain end-to-end by rendering the templates in this skill's
`templates/` directory. The script does the deterministic render + write.
The agent applies the wiring edits the script prints (router, pubsub
constants, query-keys, service index) — those touch shared files, so
they need judgment.

## Steps

### 1. Confirm the name with the user

Ask for the singular noun (lowercase, e.g. `widget`, `post`, `comment`).
If the plural is irregular (e.g. `story → stories`, `person → people`),
ask for that too. Don't guess — the script defaults to `name + "s"` for
the regular case and applies basic English rules for `-y` and sibilant
endings, but unusual plurals must be explicit.

### 2. Run the scaffolder

```bash
python3 harness/skills/new-domain/new_domain.py <singular> [plural]
```

The script:
- Renders the six backend templates from
  `harness/skills/new-domain/templates/backend/` to `backend/<plural>/`,
  substituting `{{singular}}`, `{{Singular}}`, `{{plural}}`, `{{Plural}}`.
- Renders the four frontend templates from `templates/frontend/` to
  `frontend/lib/types/<singular>.ts`,
  `frontend/lib/services/<singular>-service.ts`,
  `frontend/hooks/use-<plural>.ts`, and
  `frontend/app/<plural>/page.tsx`.
- Refuses to overwrite existing files unless `--force` is passed.
- Runs `gofmt -w` over the new backend package so map/struct padding
  matches the new identifier widths.
- Prints the exact wiring snippets to add to `router.go`,
  `common/pubsub.go`, `query-keys.ts`, and `services/index.ts`.

### 3. Apply the printed wiring edits

Read the script's "Wiring" section and apply each of the four edits with
the `Edit` tool. None of these are auto-applied because they live in
shared files — applying them programmatically would risk clobbering
unrelated changes. Order doesn't matter.

While applying:
- **pubsub.go event abbreviations**: the script suggests
  `<first-letter>.c/u/d` (e.g. `w.c` for `widget`). If another domain
  already uses that prefix, pick a unique two-letter abbreviation and
  tell the user.
- **router.go import path**: use `hexaverse/<plural>` if
  bootstrap/init.sh hasn't run yet, or the actual module slug if it has.

### 4. Verify

Run `/check` (or the commands the script prints) to confirm the backend
builds, tests pass, and TypeScript compiles. If the user wants the new
page in the nav, that's a manual edit to `components/app-navigation.tsx`
— not part of this skill.

## Editing the templates

The templates live in `harness/skills/new-domain/templates/` as `.tmpl`
files. Placeholders:

- `{{singular}}` — lowercase singular (`widget`)
- `{{Singular}}` — PascalCase singular (`Widget`)
- `{{plural}}` — lowercase plural (`widgets`)
- `{{Plural}}` — PascalCase plural (`Widgets`)
- `hexaverse` / `Hexaverse` — handled by `bootstrap/init.sh`,
  not the scaffolder. Leave them as-is in templates.

To change the default scaffold (add a field, change the route shape,
adjust the page UI), edit the templates directly. They are valid-but-
not-syntactically-buildable when viewed in isolation; that's fine
because the `.tmpl` extension keeps them out of language-server scope.

## Why a script (and why an agent step too)

Same split as `/onboard`: the script does mechanical, deterministic work
(render templates, refuse to overwrite, gofmt). The agent does the
judgment work (picking irregular plurals, picking event abbreviations
when the obvious one collides, applying edits to shared files).

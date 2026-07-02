# description: Scaffold a new CRUD domain by rendering the in-skill templates

Generate a new backend domain (handler/service/dao + tests) and matching
frontend pieces (types/service/hook/page) from the templates in
`.claude/skills/new-domain/templates/`.

## Steps

1. Confirm the singular noun with the user (lowercase, e.g. `widget`,
   `post`, `comment`). If the plural is irregular (`story → stories`,
   `person → people`), ask for that too.
2. Verify Python is available: `command -v python3 >/dev/null 2>&1`. If
   not, stop and tell the user:
   > Python 3.9+ is required.
   > - macOS: `brew install python@3.12`
   > - Debian/Ubuntu: `sudo apt-get install -y python3`
3. Execute: `python3 .claude/skills/new-domain/new_domain.py <singular> [plural]`
4. Read the script's "Wiring" output and apply the four edits with the
   `Edit` tool:
   - `backend/router.go` — import + handler registration
   - `backend/common/pubsub.go` — event-type and topic constants
   - `frontend/lib/query-keys.ts` — query-key block + union type
   - `frontend/lib/services/index.ts` — service exports
5. Run `/check` to verify the backend builds, tests pass, and the
   frontend compiles.

## Notes

- If a pubsub event abbreviation (`<first-letter>.c/u/d`) collides with
  another domain's, pick a unique two-letter abbreviation and mention
  the choice to the user.
- Adding the new page to the nav (`components/app-navigation.tsx`) is a
  manual edit, not part of this command.
- Pass `--force` to the script if you intentionally need to overwrite
  existing files.

See `.claude/skills/new-domain/SKILL.md` for the full design.

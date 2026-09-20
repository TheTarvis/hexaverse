# Shared agent guidance

## Project instructions

Read the root `CLAUDE.md` before working in this repository. Before editing a
file, also read each applicable nested `CLAUDE.md` along its directory path;
more specific instructions apply within that subtree. Keep project guidance in
those shared files so Claude and Codex use the same source.

## The harness

`harness/` is the source of truth for everything the coding agents share, and
it is owned by no single client: scripts at its root, plus `skills/`,
`agents/` (role definitions) and `commands/` (playbooks). Add or edit these
files in `harness/`; never maintain duplicate copies under a client directory.

Each client reaches the same files through symlinks, so a file has one
location and one history:

| Path | Kind | Points at |
| --- | --- | --- |
| `harness/` | real | — |
| `.claude/skills`, `.claude/agents`, `.claude/commands` | symlink | `harness/{skills,agents,commands}` |
| `.agents/skills` | symlink | `harness/skills` |
| `tools`, `.claude/scripts` | symlink | `harness/` (compat; older handoffs and archived changes name these) |

Write new references as `harness/<name>`. The compat symlinks exist only so
that prose written before the move still resolves — do not add new references
through them.

Client-specific configuration stays out of `harness/`: `.claude/settings.json`
(hooks, permissions) and `.claude/workflows/` configure Claude Code only.

## Working rules

- Run harness scripts from the repository root unless the script says otherwise.
- **After editing a file, run `bash harness/validate-file.sh <path>`.** It is
  fast, it is the same check Claude Code runs automatically from a hook, and it
  catches a file that does not parse or is not formatted while you still hold
  the context that wrote it. It exits non-zero with the fix on stderr.
- Invoke the shared team workflow in Codex with `$team <arguments>` (for
  example, `$team <change-id> --full-auto`). The skill reads this project's
  `harness/commands/team.md`; Claude Code keeps its `/team` entry point. If the
  skill is not visible yet, ask in plain text to read that command file and
  follow it with the supplied arguments.
- When a request names a Claude slash command, read the matching Markdown file
  under `harness/commands/` (including nested directories) and follow its steps.
  These files are instructions, not shell commands or registered Codex commands.
- Map Claude tool names such as Bash, Read, Edit, WebSearch, and WebFetch to
  the current agent's equivalent capabilities. Do not assume a named tool exists.
- For requested team workflows, read the referenced `harness/agents/`
  definitions and README, and pass the relevant role instructions to available
  subagents. Claude-specific agent types and workflow runtimes are not
  registered by this link. If a required runtime is unavailable, report that
  limitation explicitly.
- Claude hooks, plugins, permissions, and MCP connections are client-specific.
  Do not assume `.claude/settings*.json` configures Codex. Run required project
  checks explicitly and use only tools actually available in the current session.

## Editing harness files that mention `{{PLACEHOLDERS}}`

`bootstrap/init.sh` seds placeholders such as `PROJECT_SLUG` and `PROJECT_NAME`
across the whole repo at fork time, `harness/` included — the new-domain
templates and the onboarding checklist template depend on that. So a harness
file that mentions a placeholder *as a literal* — code that matches on it, or
prose explaining it — must not write it as bare doubled braces, or the fork's
sed rewrites it and the file silently breaks. Build the token at runtime
instead; see `NAME_TOKEN` in `harness/skills/onboard/onboard.py` and
`SLUG_TOKEN` in `harness/skills/new-domain/new_domain.py`.

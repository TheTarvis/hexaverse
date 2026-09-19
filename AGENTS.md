# Shared agent guidance

## Project instructions

Read the root `CLAUDE.md` before working in this repository. Before editing a
file, also read each applicable nested `CLAUDE.md` along its directory path;
more specific instructions apply within that subtree. Keep project guidance in
those shared files so Claude and Codex use the same source.

## Skills and tools

- `.claude/skills/` is the source of truth for this project's skills.
  `.agents/skills` links to that directory so Codex discovers the same files.
  Add or edit skills in `.claude/skills/`; do not maintain duplicate copies.
- Run skill scripts from the repository root unless the skill says otherwise.
- Invoke the shared team workflow in Codex with `$team <arguments>` (for
  example, `$team <change-id> --full-auto`). The skill reads this project's
  `.claude/commands/team.md`; Claude Code keeps its `/team` entry point.
  If the skill is not visible yet, ask in plain text to read that command
  file and follow it with the supplied arguments.
- When a request names a Claude slash command, read the matching Markdown file
  under `.claude/commands/` (including nested directories) and follow its steps.
  These files are instructions, not shell commands or registered Codex commands.
- Map Claude tool names such as Bash, Read, Edit, WebSearch, and WebFetch to
  the current agent's equivalent capabilities. Do not assume a named tool exists.
- For requested team workflows, read the referenced `.claude/agents/` definitions
  and README, and pass the relevant role instructions to available subagents.
  Claude-specific agent types and workflow runtimes are not registered by this link.
  If a required runtime is unavailable, report that limitation explicitly.
- Claude hooks, plugins, permissions, and MCP connections are client-specific.
  Do not assume `.claude/settings*.json` configures Codex. Run required project
  checks explicitly and use only tools actually available in the current session.

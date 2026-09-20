---
name: team
description: Run this repository's OpenSpec multi-agent team for a design document, feature request, or existing change. Use when the user invokes /team or $team, or requests the OpenSpec team workflow.
---

# Shared team entry point

Resolve all repository paths against the project being worked on, and run its
commands from that project's root. Read its root `CLAUDE.md` and
`.claude/CLAUDE.md` when present before loading the command; they contain
project-specific stack and testing adaptations.

1. Read `harness/commands/team.md`. It is the authoritative source for argument
   routing, flags, authorization, pipeline gates, and reporting. Treat the text
   after `/team` or `$team` as its `$ARGUMENTS`; preserve the user's input and
   flags. Follow its no-arguments behavior when no task was supplied.
2. Read `harness/agents/README.md` and
   `harness/agents/openspec-orchestrator.md` before delegation. Follow their
   backing-skill references in `harness/skills/`.
3. Use the current client's agent tools. In Claude Code, use the registered
   `openspec-orchestrator` agent when available. In Codex, spawn an agent with
   the orchestrator role instructions and the command's required delegation
   context, including the absolute project root. Tell it to read each delegated
   role's `harness/agents/<role>.md` and backing skills and pass those role
   instructions to its subagents. Claude role names are instructions, not
   registered Codex agent types. Use available models; do not pass Claude model
   aliases to Codex tools.
4. Map Bash, Read, Edit, and search tools to the current client's equivalents.
   Respect available concurrency, scheduling independent roles in batches when
   necessary while preserving reviewer, writer, developer, and SDET separation.
   Carry this client adaptation into every delegation.
5. If a required file, delegation capability, or explicitly requested
   `--workflow` runtime is unavailable, report the specific limitation. Do not
   claim the runtime exists or silently replace the requested execution mode.
   Claude hooks and settings do not configure Codex; run required project checks
   explicitly with available tools.
6. Relay the resulting report, including unresolved findings and blockers.

Maintain the workflow in `harness/commands/team.md` and its referenced files;
this skill only provides discovery and client adaptation. The shared
`.agents/skills` link lets Codex discover this same skill without a second copy.

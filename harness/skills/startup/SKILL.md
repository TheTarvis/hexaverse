---
name: startup
description: Start or clean-restart this checkout's local dev stack in GoLand. Use when the user invokes $startup or /startup; shares the existing spinup workflow.
---

# Startup — shared spinup entry point

Read `harness/skills/spinup/SKILL.md` in the target repository and follow its
complete workflow. Resolve paths and ports against that checkout, and pass
its absolute root as `projectPath` on all GoLand MCP calls.

The shared `.agents/skills` link exposes `$startup` to Codex; `.claude/skills`
exposes `/startup` to Claude Code. Keep restart logic in the spinup skill.

# description: Create a commit with a well-formed conventional commit message

Generate a useful, conventional-commit-style message for the current changes and create the commit. The message is clean source material for AI-generated release notes downstream.

**Usage:**
- `/commit` — analyze changes, propose a message, confirm, commit
- `/commit --yes` — skip the confirmation prompt
- `/commit --split` — force split mode if there are multiple logical changes

Follow the full procedure in `.claude/skills/commit/SKILL.md`. Key points:

1. **Survey**: Run `git status`, `git diff`, `git diff --staged`, and `git log -5 --oneline` in parallel.
2. **Group**: Identify logical chunks in the diff. If it spans unrelated changes, propose splitting and ask which to commit first.
3. **Stage**: Add specific files by name (never `git add -A` or `git add .`).
4. **Draft**: `<type>(<scope>): <subject>` + optional body. Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `test`. Subject describes the user-visible change in present tense.
5. **Confirm**: Show the message and wait for approval (unless `--yes`).
6. **Commit**: Use HEREDOC with the `Co-Authored-By` trailer (per CLAUDE.md).
7. **On hook failure**: Fix the issue and create a NEW commit. Never `--amend`. Never `--no-verify`.

Goal: one logical user-visible change per commit, with a subject that describes the user-facing impact (not the code change).

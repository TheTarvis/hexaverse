---
name: commit
description: This skill should be used to create a git commit with a well-formed, conventional-commit-style message. Produces commit messages that are clean source material for AI-generated release notes downstream. Triggers when the user invokes `/commit`, asks to "commit these changes", or asks for help writing a commit message.
---

# Commit

Generate a useful commit message and create **one** commit covering everything in the working tree. Do NOT split into multiple commits — the default behavior is one commit listing every change as a bullet. This message is the source of truth for downstream AI-generated release notes.

## Output goal

A commit message in this shape:

```
<type>(<scope>): <subject describing the dominant change, ≤72 chars>

<optional 1-2 sentence body for the dominant change>

- <bullet for each other change in the diff, type-prefixed>
- <feat(widgets): inline rename from the list view>
- <fix(account): treat expired tokens as logged-out instead of erroring>
- <chore(ci): cache go modules between pipeline stages>

Impact: minor
Co-Authored-By: Claude <noreply@anthropic.com>
```

The subject describes the **largest / most user-visible change** in the diff. Every other change — features, fixes, chores, docs, tests — becomes a `- type(scope): description` bullet in the body. One commit, many bullets. Release-note generation downstream parses the bullets.

(If the harness/CLAUDE.md specifies a model-specific `Co-Authored-By` trailer, use that exact trailer instead of the generic one above.)

### Type (required)

| Type | Use for | Released? | Default Impact |
|------|---------|-----------|----------------|
| `feat` | New user-visible capability | ✅ | `minor` |
| `fix` | Bug fix | ✅ | `patch` |
| `perf` | Performance improvement, no behavior change | ✅ | `patch` |
| `refactor` | Code restructuring, no behavior change | ❌ | `none` |
| `docs` | Documentation only | ❌ | `none` |
| `chore` | Tooling, dependencies, config, internal cleanup | ❌ | `none` |
| `test` | Adding/fixing tests only | ❌ | `none` |

The "Released?" column reflects the default downstream filter — `feat`/`fix`/`perf` surface in release notes; the rest are filtered out. The "Default Impact" column drives the `Impact:` trailer (see next section).

### Impact (release version bump)

Every commit ends with an `Impact:` Git trailer that release tooling can parse to compute the next version. Multiple PRs can land independently — the tooling walks every commit since the last tag and takes the **highest** impact across all of them, so individual commits never need to know the current version.

| Impact | Bump | When |
|--------|------|------|
| `major` | `1.x.y → 2.0.0` | Breaking change to a public contract — API, CLI flag, data shape, config key. Mark with `BREAKING CHANGE:` footer in the body. |
| `minor` | `0.44.12 → 0.45.0` | New user-visible capability (`feat`). |
| `patch` | `0.44.12 → 0.44.13` | Bug fix, perf improvement, anything user-facing but additive/corrective. |
| `none` | (no release) | Internal-only: refactor, docs, chore, test. Tooling skips tagging when every commit since the last tag is `none`. |

**Derivation (default):** compute impact from the *highest-impact change in the diff*, not just the dominant subject. A commit whose subject is `feat(...)` but whose bullets include a `fix(...)` is still `minor` (feat wins). A commit whose subject is `chore(...)` but whose bullets include a `fix(...)` is `patch` (fix beats chore).

Precedence, high → low: `BREAKING CHANGE:` → `feat` → `fix`/`perf` → everything else.

**Override:** the user can supply any of the four values explicitly:
- Pass `--impact=<major|minor|patch|none>` on the `/commit` invocation, OR
- At the review prompt, say `impact=patch` (or whatever) before confirming.

Common reasons to override:
- A `feat` behind a kill-switch / feature flag that's not yet user-reachable → `patch` or `none`
- A `fix` that changes a documented contract callers depend on → `major`
- A `chore` that ships a user-visible bundle bump → `patch`

When you override, also surface the reason in the body (one bullet or sentence), since release notes will quote the trailer and a `major` with no visible breaking change reads as a mistake.

### Scope (optional but encouraged)

The area of the codebase. Prefer specific over generic:
- Good: a domain name (`widgets`, `account`), `claude-agent`, `sse`, `e2e`, `infra`
- OK: `frontend`, `backend`, `agent`
- Avoid: `app`, `code`, `misc`

### Subject

- Present tense, imperative mood ("add X" not "added X" or "adds X")
- Describe the **user-visible change**, not the code change
  - ✅ `feat(widgets): support archiving widgets from the list view`
  - ❌ `feat(widgets): refactor widget handler`
- No trailing period
- ≤72 characters

### Body

The body is where the rest of the diff gets enumerated. Structure:

1. **Optional 1-2 sentence paragraph** giving the "why" for the dominant change (the subject), only if non-obvious.
2. **A bulleted list of every other change in the diff.** Each bullet starts with its own conventional-commit type/scope prefix so downstream tooling can classify it:

```
- feat(account): show display name on the home page greeting
- fix(sse): reconnect with backoff after a dropped stream
- chore: housekeeping — gitignore __pycache__, refresh onboarding checklist
```

Skip the body entirely only when the diff is a single trivial change (color tweak, typo, dep bump).

## Workflow

### 1. Survey the changes

Run these in parallel:

- `git status` (never use `-uall`)
- `git diff` (unstaged)
- `git diff --staged` (staged)
- `git log -5 --oneline` (recent style reference)

### 2. Identify every distinct change in the diff

Walk the diff and group files by the logical change they implement. A "change" is a set of files that together implement ONE user-visible capability, fix, perf improvement, refactor, or chore. Coordinated frontend + backend + tests + tied docs for one thing = one change.

You're NOT splitting into multiple commits. You're producing a **labeled list** of every change so each can become a bullet. Expect 1–8 changes per diff.

For each change, decide:
- Type (`feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `test`)
- Scope (specific area, e.g. `widgets`, `account`, `e2e`)
- One-line description (what the user sees, not what files moved)

#### Pick the dominant change for the subject line

The dominant change is the **biggest user-visible item** — usually the `feat` with the largest footprint, or the most impactful `fix` if there's no `feat`. Its type/scope/description becomes the commit subject. Everything else goes into the bullet list in the body.

If two changes look equally weighty, prefer the `feat` over the `fix`, and prefer the one with broader user impact.

#### Demote non-user-facing items in the bullet order

Within the bullet list, order matters — release-note tooling reads top-down:

1. `feat` / `fix` / `perf` bullets first (the things users see)
2. `refactor` bullets (only if substantial)
3. `docs` / `test` bullets
4. `chore` bullets last (build artifacts, tooling, internal docs)

Bundle related chores into one line where possible:
- ✅ `- chore: housekeeping — new skill, docs refresh, gitignore __pycache__`
- ❌ Three separate chore bullets for those same things

#### Build artifacts and gitignore misses

`__pycache__/`, `dist/`, `.DS_Store`, `*.pyc`, `node_modules/` etc. should be added to `.gitignore` rather than committed. Mention this in the proposal — fold the gitignore update into the housekeeping bullet, and don't stage the artifact dirs themselves.

### 3. Stage everything you're about to commit

Stage every file that's part of the diff you reviewed. **Never `git add -A` or `git add .`** — those grab untracked secrets or large binaries. List the files explicitly:

```bash
git add path/to/file1 path/to/file2 path/to/file3 ...
```

Skip files you've decided to leave out (e.g., `__pycache__/` dirs being gitignored instead).

For partial-file commits, mention `git add -p` and ask the user.

### 4. Draft the message

Apply the format above. Look at recent commits for stylistic reference but do NOT copy a pre-conventional style if you see one — the goal is to move *toward* conventional commits.

Compute the `Impact:` value from the highest-impact change in the diff using the precedence in the Impact table. If `--impact=<level>` was passed on invocation, use that instead and skip derivation.

### 5. Show for review

Print the proposed commit message and ask:

> Commit with this message? Impact derived as `<level>` — reply `y`, `edit`, `no`, or `impact=<major|minor|patch|none>` to override.

Unless `--yes` was passed, wait for confirmation. If the user replies with `impact=<level>`, swap the trailer value and re-print before committing.

### 6. Commit

Use HEREDOC to preserve formatting:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>

Impact: <major|minor|patch|none>
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

The `Impact:` trailer must be present on every commit so release tooling can compute the version bump without falling back to type derivation. Then run `git status` to confirm.

### 7. If a hook fails

A pre-commit hook failure means the commit did NOT happen. Do NOT `--amend` — there's nothing to amend onto, and amending would silently rewrite the previous commit.

1. Fix the issue the hook reported.
2. Re-stage the fix.
3. Create a NEW commit (repeat from step 6).

Never bypass with `--no-verify` unless the user explicitly asks.

## Hard rules

- Never `git add -A` or `git add .` — stage specific files
- Never `--no-verify` (unless user explicitly asks)
- Never `--amend` (unless user explicitly asks)
- Never commit files that look like secrets (`.env`, `credentials.json`, anything with `secret`/`key`/`token` in the name) — warn instead
- Always include the `Impact:` trailer and the `Co-Authored-By` trailer (in that order)
- Always use HEREDOC for the message

## Examples

### Good (single trivial change — no bullet list needed)

```
chore(deps): bump @tanstack/react-query to 5.62.0

Impact: none
```

### Good (dominant change + bullet list)

```
feat(widgets): add bulk archive from the widgets list

Multi-select in the list header archives up to 50 widgets in one call;
the new BulkArchiveRequest keeps the existing per-widget events flowing
so downstream subscribers see each archive.

- fix(account): expired Firebase tokens now surface as logged-out, not a 500
- test(e2e): smoke coverage for the bulk-select toolbar
- chore: housekeeping — gitignore playwright artifacts, refresh docs

Impact: minor
```

### Good (overridden impact with reason)

```
feat(billing): gate new checkout flow behind kill-switch

New flow is wired up but unreachable until the `billing.checkout_v2`
flag flips on. Override impact=patch because no user surface changes
until the flag flips.

Impact: patch
```

### Bad

`update files` — no type, no scope, says nothing.

`fix: fixed the bug` — type without scope, body is a tautology.

`feat: widget stuff and account fix and docs` — subject smashes everything together. Pick one dominant change for the subject; put the rest in body bullets.

## Flags

- `/commit` — full interactive flow with confirmation
- `/commit --yes` — skip confirmation, commit immediately after drafting
- `/commit --impact=<major|minor|patch|none>` — override the derived `Impact:` value. Combine with `--yes` for fully non-interactive use.
- `/commit --split` — opt-in: split into multiple commits (one per change). Use ONLY when the user explicitly asks. Each resulting commit still gets its own `Impact:` trailer derived from its own contents.

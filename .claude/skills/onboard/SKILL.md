---
name: onboard
description: Walks a freshly-forked skeleton from zero to a working local stack. Drives the CLAUDE.md discovery conversation, fills bootstrap/config.env (interactively gathering values from the user), creates GCP + Firebase projects, runs bootstrap/init.sh, and probes the result. Re-runnable.
---

# Onboard

Three stages, ordered by dependency:

1. **Define the project** (agent-driven, only on a fresh fork) — fill in
   `CLAUDE.md` if it's still in template state.
2. **Bootstrap GCP + Firebase + config.env** (agent-driven, only when
   values are missing) — drive a conversation to collect required values
   and provision GCP/Firebase.
3. **Probe local setup** (script-driven, every run) — run `onboard.py`
   to refresh `onboarding_checklist.md`.

The agent owns stages 1 and 2 because they need conversation, judgment,
and external auth flows. The script owns stage 3 because probes are
mechanical.

---

## Stage 1 — CLAUDE.md discovery

Read `CLAUDE.md`. If you find the literal string `IMPORTANT — first-run
setup` (the unfilled-template sentinel):

- Pause before running anything else.
- Drive a short Mom-Test–style discovery conversation. Ask open
  questions, capture the user's phrasing, don't over-polish. Cover the
  four areas listed in the IMPORTANT block: purpose, user profile,
  domain quick-reference, project conventions.
- Once you have enough material, update `CLAUDE.md`: fill the empty
  sections, delete the entire IMPORTANT blockquote.
- If the user says "skip it" / "leave it for now," respect that and
  continue to stage 2 — the probe will still flag CLAUDE.md as
  unfilled.

If `CLAUDE.md` is already filled in, skip to stage 2.

---

## Stage 2 — Bootstrap config + GCP/Firebase setup

### 2a. Read or create `bootstrap/config.env`

If it doesn't exist, copy from `bootstrap/config.example.env`:

```bash
cp bootstrap/config.example.env bootstrap/config.env
```

Then read it. Identify which required keys are empty:

| Key | Required for |
|---|---|
| `PROJECT_SLUG` | substitution into go.mod, service names, etc. |
| `PROJECT_NAME` | display name in UI |
| `BILLING_ACCOUNT` | linking GCP projects |
| `REGION` | Firestore + Cloud Run location (default `us-central1`) |
| `GCP_PROJECT_DEV` | dev environment provisioning |
| `GCP_PROJECT_PROD` | prod environment provisioning |
| `PROD_DOMAIN`, `DEV_DOMAIN` | CORS, OAuth allow-lists |
| `FIREBASE_*_DEV`, `FIREBASE_*_PROD` | populated automatically by setup-gcp.sh |

### 2b. Drive the conversation to fill the empty values

Ask one key at a time. Keep prompts short, give context only when it
helps:

- **PROJECT_SLUG** — "What slug for this project? Lowercase letters/digits
  only — used as Go module name, service names, Pub/Sub topics."
- **PROJECT_NAME** — "Display name shown in the UI?"
- **BILLING_ACCOUNT** — list the user's accounts first:
  ```bash
  gcloud beta billing accounts list --filter=open=true --format='value(name,displayName)'
  ```
  If they have one open account, default to it (confirm with the user).
  If they have several, present the list and ask which to use. If none,
  point them at <https://console.cloud.google.com/billing> and stop —
  setup can't proceed without billing.
- **REGION** — default to `us-central1`; only ask if the user wants to
  override.
- **GCP_PROJECT_DEV** / **GCP_PROJECT_PROD** — ask for the IDs the user
  wants. Validate format (6–30 chars, lowercase letters/digits/hyphens,
  starts with a letter, ends with letter or digit). Then check
  availability:
  ```bash
  gcloud projects describe "$ID" 2>/dev/null
  ```
  Three outcomes: exit 0 (user has access — reuse), `NOT_FOUND` (taken
  by someone else, ask for a different ID), or `does not exist` (free —
  use it). If you can't tell from stderr, ask the user to confirm.
- **PROD_DOMAIN**, **DEV_DOMAIN** — bare hostnames, no scheme. If the
  user doesn't have one yet, suggest placeholders like
  `<slug>.example.com` and `<slug>-dev.example.com` and note they can
  swap later.

After collecting each value, write it back to `bootstrap/config.env`
immediately (use `Edit` to update the line) so a mid-session interrupt
doesn't lose answers.

### 2c. Verify `gcloud` and `firebase` auth

Both CLIs need active sessions before `setup-gcp.sh` can run.

```bash
# gcloud — must list at least one ACTIVE account
gcloud auth list --filter=status:ACTIVE --format='value(account)'

# firebase — projects:list works only when logged in
firebase projects:list >/dev/null 2>&1
```

If either is missing, tell the user to run the appropriate command via
the inline-shell prefix:

```
! gcloud auth login
! firebase login
```

(Both open a browser. Wait for the user to confirm before continuing.)

### 2d. Run `setup-gcp.sh` for each environment

```bash
bash bootstrap/setup-gcp.sh dev
bash bootstrap/setup-gcp.sh prod
```

The script logs progress to stderr and emits one normalized JSON line
on stdout:

```json
{"projectId":"...","apiKey":"...","authDomain":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
```

Capture that JSON and use `Edit` to write the six values into
`bootstrap/config.env` under the corresponding `FIREBASE_*_DEV` or
`FIREBASE_*_PROD` block.

The script is idempotent — if it fails halfway (e.g. a transient
Firebase API propagation delay), re-run it.

### 2e. Prompt for manual auth-provider setup

`setup-gcp.sh` adds the env's domain (and its `www.` variant) to
Firebase Auth's authorized-domain list automatically, so
`auth/unauthorized-domain` errors won't bite at login time. What it
*can't* automate is enabling sign-in providers — that stays manual.

Tell the user (once per environment) to:

1. Open <https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers>
   (substitute the dev project ID, then the prod one).
2. Enable **Email/Password** and **Google** sign-in.

This blocks login from working but doesn't block any other onboarding
step, so it's fine to surface it once and continue.

### 2f. Run `init.sh`

```bash
bash bootstrap/init.sh
```

Substitutes `hexaverse`, `Hexaverse`, `{{GCP_PROJECT_*}}`,
and `{{*_DOMAIN}}` placeholders across the repo, and writes
`frontend/.env.local` from the `FIREBASE_*_DEV` block.

---

## Stage 3 — Probe

```bash
python3 .claude/skills/onboard/onboard.py
```

The script:

1. Probes the onboarding milestones (CLAUDE.md filled in, prereqs
   installed, config.env complete, bootstrap run, env files, build,
   tests, cloud auth, Firebase keys present).
2. Writes `onboarding_checklist.md` at the repo root with `[x]` / `[ ]`
   boxes reflecting actual state.
3. Prints a summary to stdout. Exits non-zero if any required check
   fails.

After the probe, summarize for the user: how many passed, what the next
required failure is, and the command that unblocks it. Offer to run the
unblocking step if it's safe and non-interactive.

---

## Where the checklist lives

Repo root: `onboarding_checklist.md`. Gitignored — each developer keeps
their own. Re-running the script overwrites the file, so any hand-edits
are lost.

## Adding a check

1. Add a `(name, fn)` entry to the `CHECKS` list in `onboard.py`. The
   function returns `(ok: bool, msg: str | None)`.
2. Add a `<<your.check.id>>` token to `checklist_template.md` where the
   box should render.
3. Done. The script substitutes `<<id>>` with `[x]` or `[ ]`.

## Why a script and an agent step

Probes are mechanical — run a command, parse output, check a path — so
they live in a deterministic Python script. The discovery conversation
and the GCP/Firebase orchestration are judgment-based and need browser
auth flows the agent can't drive directly. Splitting it this way keeps
each part doing what it's good at.

# Bootstrap

Two paths from a freshly-forked skeleton to a working local stack.

## Path A — agent-driven (recommended)

Run `/onboard`. The agent will:

1. Drive a short discovery conversation to fill in `CLAUDE.md` if it's still in template state.
2. Read `bootstrap/config.env` (creating it from the example if missing) and ask you for any empty values one at a time, with context for each (e.g. lists your billing accounts, validates project IDs are available before using them).
3. Run `bash bootstrap/setup-gcp.sh dev` and `setup-gcp.sh prod` to create the GCP projects, link billing, enable APIs, create the Firestore databases, add Firebase, register your `DEV_DOMAIN`/`PROD_DOMAIN` (and `www.` variants) as Firebase Auth authorized domains, and pull the SDK config back into `config.env` automatically.
4. Tell you to enable Email/Password and Google sign-in providers in the Firebase console (the only step the CLI can't automate — domain authorization is handled in step 3).
5. Run `bash bootstrap/init.sh` to substitute `{{KEY}}` placeholders and write `frontend/.env.local`.
6. Run the probe to refresh `onboarding_checklist.md` and report what (if anything) is left.

You'll need to run `! gcloud auth login` and `! firebase login` interactively — both open a browser, so the agent can't drive them, but it'll prompt you at the right moment.

## Path B — manual

Use this if you already have GCP + Firebase projects, or if you'd rather drive the CLI yourself.

```bash
cp bootstrap/config.example.env bootstrap/config.env
$EDITOR bootstrap/config.env       # fill in every required value

# If you need new GCP+Firebase projects, run setup-gcp.sh per env.
# It's idempotent — safe to re-run if anything fails partway.
bash bootstrap/setup-gcp.sh dev    # captures FIREBASE_*_DEV values to stdout
bash bootstrap/setup-gcp.sh prod   # captures FIREBASE_*_PROD values to stdout
# Paste the printed JSON values into the matching FIREBASE_*_DEV/PROD blocks
# in config.env (or just use Path A and let the agent do it).

bash bootstrap/init.sh             # placeholder substitution + .env.local
```

## What `init.sh` substitutes

| Placeholder | Used in | Example value |
|---|---|---|
| `{{PROJECT_SLUG}}` | Go module name, Cloud Run service names, Pub/Sub topics, GCS buckets, Postgres test DB | `acme` |
| `{{PROJECT_NAME}}` | Page titles, sidebar header, login screen | `Acme` |
| `{{GCP_PROJECT_DEV}}` | GCP project ID for dev (CI vars, Terraform) | `acme-dev-123456` |
| `{{GCP_PROJECT_PROD}}` | GCP project ID for prod | `acme-prod-789012` |
| `{{PROD_DOMAIN}}` | CORS origin, OAuth redirect, Firebase Auth domain | `acme.com` |
| `{{DEV_DOMAIN}}` | Same, dev environment | `dev.acme.com` |

`FIREBASE_*_DEV` values become `frontend/.env.local` (used at runtime; never substituted into source). `FIREBASE_*_PROD` values stay in `config.env` for pasting into Vercel when you set up production deploys.

## App secrets (Anthropic, Stripe, OAuth, etc.)

These don't go in `bootstrap/config.env`. The skeleton ships with a Terraform-driven flow that pipes secrets from **GitLab CI/CD variables → `TF_VAR_*` → Google Secret Manager → Cloud Run env vars**. You set values once per env in GitLab's UI; Terraform does the rest on the next pipeline run.

See [`infra/CLAUDE.md` → Secrets](../infra/CLAUDE.md#secrets) for the full flow, the table of which GitLab variables to set, and how to add or rotate a secret.

For **local dev**, copy `backend/.env.local.example` → `backend/.env.local` and fill in values directly — local doesn't go through Secret Manager.

## Constraints on `PROJECT_SLUG`

Use **lowercase letters and digits only**. Hyphens or underscores break either Go module paths or Postgres DB names — the slug is reused across both.

## Re-running

- `init.sh` is idempotent in the sense that running it twice doesn't break anything, but the first run consumes all `{{KEY}}` placeholders, so subsequent runs become no-ops on source files (they'll still rewrite `frontend/.env.local`). To "reset" the skeleton, fork the original repo again — don't try to un-substitute an in-place tree.
- `setup-gcp.sh` is fully idempotent — every step checks existence before creating. Re-run after a transient failure (e.g. Firebase API still propagating from `services enable`) and it picks up where it left off.

## Adding a new placeholder

1. Add `KEY=value` to `bootstrap/config.example.env`.
2. Add `KEY` to the `SUBST_KEYS` array in `bootstrap/init.sh`.
3. Use `{{KEY}}` in the source files that need it.
4. Add a row to the table above.

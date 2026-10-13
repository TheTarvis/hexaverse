# Infra

Terraform-managed GCP for Cloud Run + Firestore + Pub/Sub + Vercel. CI/CD via GitLab.

## Layout

```
infra/
├── terraform/
│   ├── main.tf               # Provider config
│   ├── services.tf           # GCP API enablement
│   ├── cloudrun.tf           # Backend Cloud Run service
│   ├── firebase.tf           # Firebase project
│   ├── firebase-auth.tf      # Auth providers
│   ├── firestore-indexes.tf  # Composite indexes (start empty; add as queries demand)
│   ├── pubsub.tf             # Topics + push subscriptions
│   ├── secrets.tf            # Secret Manager
│   ├── storage.tf            # GCS buckets
│   ├── scheduler.tf          # Cloud Scheduler service account (jobs added per-project)
│   ├── vercel.tf             # Frontend deployment
│   ├── cicd-iam.tf           # CI service account + Workload Identity
│   ├── variables.tf
│   ├── outputs.tf
│   └── environments/         # Per-env tfvars (dev/staging/prod)
└── docker/                   # CI runner image Dockerfiles
```

## Source of truth

Project-specific values come from `bootstrap/config.env` (created from `config.example.env` and gitignored). `bootstrap/init.sh` substitutes them into Terraform files at fork time. After init runs, the `.tf` files contain real values — Terraform itself never reads `config.env`.

CI variables live in `.gitlab-ci.yml` and reference the same substituted values.

## `setup-gcp.sh` vs Terraform

Two GCP-touching scripts in this repo, with a clean split:

- **`bootstrap/setup-gcp.sh`** runs once per env at fork time. It provisions the *project shell*: `gcloud projects create`, billing link, API enable, Firestore database create, `firebase projects:addfirebase`, web app create, SDK config pull. The output (project ID + Firebase web-app config) feeds back into `config.env`. After this runs, the GCP project exists and Firebase is wired up.
- **Terraform** runs every time infra changes. It manages everything *inside* the project: Cloud Run service, Firestore composite indexes, Pub/Sub topics + subscriptions, Secret Manager secrets, GCS buckets, Cloud Scheduler jobs, IAM. Terraform assumes the project already exists.

Order of operations on a fresh fork: `setup-gcp.sh dev` → `setup-gcp.sh prod` → `bootstrap/init.sh` (placeholder substitution) → `terraform apply -var-file=environments/dev.tfvars` → repeat for prod when you're ready to deploy. See `bootstrap/README.md` for setup and the onboarding probe; review Terraform plans before applying.

## Common operations

**Add a Pub/Sub topic:** add a `google_pubsub_topic` resource in `pubsub.tf`. If the backend should consume it, add a matching `google_pubsub_subscription` with `push_config.push_endpoint = "${google_cloud_run_v2_service.backend.uri}/v1/push/<your-route>"` and the `pubsub_push` service account for OIDC. The backend route must register a push handler (see `account/subscriptions.go` for the pattern).

**Add a Firestore composite index:** add a `google_firestore_index` resource in `firestore-indexes.tf`. The starter file has a commented example. Single-field indexes don't go here — Firestore creates them automatically.

**Add a secret:** see the [Secrets](#secrets) section below — there's a default flow that pipes values from GitLab CI variables straight into Secret Manager via Terraform.

**Add a scheduled job:** add a `google_cloud_scheduler_job` to `scheduler.tf` using the existing `scheduler` service account (already grants `run.invoker` on the backend). Pattern is in the file.

## Workflow

```bash
cd infra/terraform
terraform init
terraform plan -var-file=environments/dev.tfvars      # always plan first
terraform apply -var-file=environments/dev.tfvars
```

Run `terraform fmt` before committing.

## Secrets

App secrets (API keys, OAuth client secrets, Stripe keys) live in **Google Secret Manager**, but you set their values **once per env in GitLab CI/CD variables** — Terraform reads those, writes them as initial Secret Manager versions, and grants the backend service account read access. The backend then mounts each secret as an env var on Cloud Run via `secret_key_ref` in `cloudrun.tf`.

### The flow, end-to-end

```
GitLab CI/CD variable             →  shell export in .gitlab-ci.yml
ANTHROPIC_API_KEY_DEV                 TF_VAR_anthropic_api_key

→  Terraform variable in variables.tf
   variable "anthropic_api_key" { sensitive = true; default = null }

→  Secret Manager resources in secrets.tf
   google_secret_manager_secret           "anthropic_api_key"
   google_secret_manager_secret_version   "anthropic_api_key_initial"  (lifecycle.ignore_changes = [secret_data])
   google_secret_manager_secret_iam_member "backend_anthropic_api_key" (grants backend SA Accessor)

→  Cloud Run env var in cloudrun.tf
   env { name = "ANTHROPIC_API_KEY"; value_source.secret_key_ref { secret = ...; version = "latest" } }
```

### Set values: GitLab → Settings → CI/CD → Variables

For each secret, define one variable per env. The convention is `<NAME>_DEV` and `<NAME>_PROD`. Mark them **Masked** and **Protected** (Protected = only available on protected branches/tags, which is what dev/prod deploys run on).

Secrets currently scaffolded:

| Secret Manager id | GitLab var (dev) | GitLab var (prod) | Backend env var |
|---|---|---|---|
| `google-oauth-client-id` | `GOOGLE_OAUTH_CLIENT_ID_DEV` | `GOOGLE_OAUTH_CLIENT_ID_PROD` | `GOOGLE_OAUTH_CLIENT_ID` |
| `google-oauth-client-secret` | `GOOGLE_OAUTH_CLIENT_SECRET_DEV` | `GOOGLE_OAUTH_CLIENT_SECRET_PROD` | `GOOGLE_OAUTH_CLIENT_SECRET` |
| `anthropic-api-key` | `ANTHROPIC_API_KEY_DEV` | `ANTHROPIC_API_KEY_PROD` | `ANTHROPIC_API_KEY` |
| `resend-api-key` | `RESEND_API_KEY_DEV` | `RESEND_API_KEY_PROD` | `RESEND_API_KEY` |
| `stripe-secret-key` | `STRIPE_SECRET_KEY_DEV` | `STRIPE_SECRET_KEY_PROD` | `STRIPE_SECRET_KEY` |
| `stripe-webhook-secret` | `STRIPE_WEBHOOK_SECRET_DEV` | `STRIPE_WEBHOOK_SECRET_PROD` | `STRIPE_WEBHOOK_SECRET` |
| `stripe-pro-monthly-price-id` | `STRIPE_PRO_MONTHLY_PRICE_ID_DEV` | `STRIPE_PRO_MONTHLY_PRICE_ID_PROD` | `STRIPE_PRO_MONTHLY_PRICE_ID` |
| `stripe-pro-annual-price-id` | `STRIPE_PRO_ANNUAL_PRICE_ID_DEV` | `STRIPE_PRO_ANNUAL_PRICE_ID_PROD` | `STRIPE_PRO_ANNUAL_PRICE_ID` |
| (frontend, not a Secret Manager secret) | `STRIPE_PUBLISHABLE_KEY_DEV` | `STRIPE_PUBLISHABLE_KEY_PROD` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |

Delete the slots you don't need (Stripe-only app? Drop the Resend block. No payments? Drop all the Stripe blocks.). Each block touches three files: `secrets.tf` (secret + version + IAM), `variables.tf` (variable declaration), `cloudrun.tf` (env mount), plus the `TF_VAR_` exports in `.gitlab-ci.yml`.

### Add a secret

1. **`variables.tf`**: declare a `sensitive = true` variable with `default = null`.
2. **`secrets.tf`**: add three resources — `google_secret_manager_secret`, `google_secret_manager_secret_version` (with `lifecycle.ignore_changes = [secret_data]` so manual rotations don't trigger Terraform diffs), and `google_secret_manager_secret_iam_member` granting `roles/secretmanager.secretAccessor` to `google_service_account.backend`.
3. **`cloudrun.tf`**: add an `env { value_source.secret_key_ref { ... } }` block referencing the secret.
4. **`.gitlab-ci.yml`**: add the `TF_VAR_<name>` export line in each Terraform job that runs against the env (search for an existing `TF_VAR_anthropic_api_key` line and copy the pattern).
5. **GitLab UI**: add the `<NAME>_DEV` and `<NAME>_PROD` CI/CD variables (Masked + Protected).
6. **Update the table above** in this file.

### Rotating a secret without a deploy

The `lifecycle.ignore_changes = [secret_data]` on each `_initial` version means Terraform sets the value once at creation and then leaves it alone. To rotate without re-deploying:

```bash
gcloud secrets versions add anthropic-api-key --project=<PROJECT_ID> --data-file=- <<< "$NEW_VALUE"
```

The Cloud Run service references `version = "latest"`, so the next request picks up the new value (Cloud Run does cache secrets per instance — restart the revision if you need an immediate cutover).

### Local dev

Backend reads secrets via env vars at runtime. For local dev, set them in `backend/.env.local` (gitignored — see `backend/.env.local.example` for the template). Never commit values; the local dev path doesn't go through Secret Manager.

## CI/CD

`.gitlab-ci.yml` defines a four-stage pipeline: verify-dev → deploy-dev → promote (manual) → deploy-prod. Auth is Workload Identity Federation (no JSON keys). Terraform state lives in GitLab's HTTP backend, keyed by project.

Custom runner images (test-runner, gcp-deployer, terraform-deployer, frontend-builder) are built from `infra/docker/` and live in Artifact Registry under `${PROJECT_SLUG}-ci/`.

## Gotchas

- **`google_project_service` resources gate everything.** New resources that need a GCP API must `depends_on` the matching service enablement, or `terraform apply` races and fails.
- **Push subscription audience.** OIDC tokens for push delivery use audience `${PROJECT_SLUG}-backend`. The backend's `OIDCTokenVerification` middleware verifies the same. Mismatch = 401 on every push.
- **Vercel project import.** First-time setup needs the Vercel project ID — capture it and put in `environments/<env>.tfvars`.
- **Don't commit tfvars with secrets.** `environments/*.tfvars` are project-specific config; secrets stay in Secret Manager and are referenced by name.

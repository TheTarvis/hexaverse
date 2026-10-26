---
name: onboarding
description: Bootstrap a fresh fork or replacement cloud environments through working dev deployment and prod promotion. Use for /onboarding, the former /onboard workflow, or setting up GCP/Firebase, CI/CD, and environment configuration. For a local restart use spinup.
---

# Onboarding

Claude Code and Codex share this workflow. Run commands from the repository root.
Read root `CLAUDE.md`, `bootstrap/README.md`, and `infra/CLAUDE.md` before cloud
setup; read applicable nested guidance before editing files. Use the current
scripts and pipeline as evidence, rather than treating old bootstrap guides as
executable instructions.

## Establish the target

Distinguish a fresh fork, a new developer checkout, and replacement environments
for an existing application. Preserve project identity on an existing application.
`bootstrap/init.sh` substitutes remaining template tokens and writes local env
files; rerunning it does not migrate already-substituted project IDs.

Inspect existing configuration, Git remotes, CLI authentication, and accessible
cloud resources. Resolve the following from the session and configuration before
asking for anything missing:

- Application slug and name; dev/prod GCP IDs and region.
- Google login, organization/folder, and billing account.
- CI host, repository identity, and runner availability.
- Frontend host/team, intended environment targets, and domains when known.

Verify explicit account and project selection on cloud commands. An inaccessible
project ID is not proof that the ID is available. Reuse projects only after
checking their parent and billing. Preserve existing environments, their state,
and DNS during replacement setup until cutover is separately authorized.

Maintain a resumable status in `.scratch/onboarding/` with targets, verified
milestones, commands or pipeline links, and blockers. Keep secrets out of it.
Continue work covered by the user's authorization; request only missing inputs
or authorization required for the actual next action.

## Configure and provision

1. Read or create the gitignored `bootstrap/config.env` from its example. Fill
   known values together; persist discovered Firebase SDK values per environment.
2. Verify both `gcloud` and Firebase CLI identities. They have separate sessions.
   Give the exact login command if reauthentication needs the user.
3. Inspect `bootstrap/setup-gcp.sh` before using it. It uses the CLI's active
   identities and currently has no organization/account arguments. When creating
   project shells, explicitly select the intended parent and account first;
   verify the script will reuse those shells and the correct billing account.
4. Choose resource ownership before provisioning Firebase. The setup script
   creates Firebase registration, a web app, and Firestore; Terraform also declares
   them. Use Terraform for those resources, or import script-created resources
   into the intended state before planning. Avoid creating a second web app.
5. For a fresh fork with remaining template tokens, run `bootstrap/init.sh` after
   completing config. For replacement environments, update specific references
   in CI, Terraform, and env files instead. Preserve unrelated local env values.

Provision only what the application uses. Check its Terraform and runtime config
for required secrets and sign-in providers. Use Firebase SDK output for storage
bucket/config values instead of guessing bucket names. Keep DNS changes deferred
when requested; verify using provider URLs first.

## Make CI/CD usable

For this checkout, read `.gitlab-ci.yml`, `infra/terraform/main.tf`,
`cicd-iam.tf`, `firebase-auth.tf`, `vercel.tf`, and the runner-image scripts.
Derive required variable names and deployment targets from these files.

Work through dependency order, completing each environment explicitly:

1. Establish separate remote Terraform states for dev and prod. Replacement
   projects get fresh state names; retain old states for later retirement.
2. Set up CI deployer service accounts and OIDC Workload Identity Federation.
   Restrict trust to the intended repository and allowed deployment refs; derive
   provider paths from each real project number. Prefer keyless authentication.
   Terraform currently looks up an existing `gitlab-ci-deployer`; bootstrap it
   before planning resources that depend on it. Confirm any referenced helper
   exists before trying to run it.
3. Create required registries and first runner/application images before jobs
   or services consume them. Inspect build scripts for hardcoded project/repo
   overrides. Check runner access to private images before the job starts.
4. Configure CI secrets securely and nonsecret environment values for each target.
   Verify protected-variable availability matches branch/environment rules.
   Configure the frontend host's project and dev/prod targets to agree with CI.
5. Update project IDs, WIF paths, service accounts, registry locations,
   cross-project image-promotion permissions, and state addresses together.
   Search scoped deployment/configuration files for old references; distinguish
   active configuration from historical documentation. Avoid repository-wide
   string replacement in an already-configured application.
6. Run applicable validation and inspect a Terraform plan per environment before
   applying. For a partially provisioned target, reconcile existing resources
   with state first. Check first-apply dependencies, including secrets and images.
7. Complete the dev pipeline and verify the deployed application. Prepare and
   verify the production promotion path within the user's authorized scope.
   Honor its manual gate; report a pending promotion as pending.

When an implementation is missing, add a reusable helper under `bootstrap/` or
`harness/utilities/` rather than leaving the essential setup as an undocumented
sequence of one-off commands. Keep the skill as orchestration and reference the
helper. Use a wizard only for remaining steps the human must perform.

## Verify and report

For a local-only checkout, install its dependencies and run the existing probe:

```bash
python3 harness/utilities/onboard/onboard.py --local
```

The probe without `--local` adds cloud checks. Inspect it before running: it also
builds and runs tests. Its generated `onboarding_checklist.md` describes local
readiness, not CI/CD deployment readiness.

For cloud onboarding, verify both project parents/billing, isolated state,
CI OIDC authentication, registry access, and the dev deployment using actual
job results. Verify backend/agent health, frontend API connectivity, Firebase
sign-in, and an application read/write against the intended environment when
authorized. Prod is complete only after its authorized promotion/deployment and
equivalent checks. Report separately: provisioned resources, dev readiness, prod
readiness, and deferred work such as DNS. Include evidence and the precise next
blocker; never equate a successful script exit or local probe with deployment.

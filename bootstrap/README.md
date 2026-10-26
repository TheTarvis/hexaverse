# Bootstrap and onboarding

Use the shared [onboarding skill](../harness/skills/onboarding/SKILL.md) for a
fresh fork or replacement dev/prod environments, including CI/CD and deployment
verification. Claude Code discovers it through `.claude/skills`; Codex through
`.agents/skills`. Both point to `harness/skills`. In a new session, invoke
`/onboarding` in Claude Code or `$onboarding` in Codex. The former `/onboard`
workflow was removed during the shared-skills migration; its probe remains below.

## Local checkout and fresh forks

Hexaverse is already configured. For a new local checkout, install dependencies
with `npm install` and `npm run install:all`; use the root README's dev commands.
Copy local environment examples and supply the checkout's Firebase configuration
when setting up a new machine.

For a fresh fork, copy `bootstrap/config.example.env` to `bootstrap/config.env`,
fill in project and Firebase values, then run `bash bootstrap/init.sh` from the
repository root. The script substitutes project labels and writes local
configuration. Imported skills and their lock remain byte-for-byte intact;
local utility templates are substituted.

## Onboarding probe

```bash
python3 harness/utilities/onboard/onboard.py --local
```

The local probe checks prerequisites, configuration, builds and tests without
cloud login checks, and writes the gitignored `onboarding_checklist.md`.
Use `python3 harness/utilities/onboard/onboard.py` to include cloud checks.
Hexaverse's existing bootstrap requires the Firebase values used by its
configuration; the probe does not provision them.

## Cloud environments

Authenticate with `gcloud auth login` and `firebase login`. For a fresh fork,
fill the billing and project values in `bootstrap/config.env`, then provision
each environment:

```bash
bash bootstrap/setup-gcp.sh dev
bash bootstrap/setup-gcp.sh prod
```

Copy the emitted Firebase SDK values into the matching config blocks. Enable
the sign-in providers needed by the application using `firebase-auth.tf` or the
Firebase console, then run `bash bootstrap/init.sh` on a fresh template. Review
Terraform plans before applying infrastructure; see `infra/CLAUDE.md` for
deployment and secrets.

### Resource ownership

`setup-gcp.sh` creates Firebase registration, a web app, and the default Firestore
database. `infra/terraform/firebase.tf` also declares these resources. If using
the script, import the existing resources into the target Terraform state before
applying. Alternatively, use Terraform to create them after provisioning the
project shell. An already-existing web app must be reused/imported rather than
duplicated. The script uses active CLI identities and does not select an
organization: create/verify shells under the intended parent and account first.

### Replacement environments

`init.sh` replaces template tokens only; it does not retarget already-substituted
configuration. Update explicit CI, Terraform, and env references for replacement
projects. Give each replacement environment a fresh remote state, retaining old
states until retirement. Preserve unrelated local env values and keep DNS on the
old deployment until the new provider URLs work.

## CI/CD completion

The intended pipeline is verify/build → deploy dev → manual promotion → deploy
prod. The onboarding skill coordinates this setup; the probe does not verify it.
Complete these dependencies before treating new environments as ready:

- CI deployer service accounts and repository-restricted WIF trust per project.
- Separate Terraform states, project numbers, IAM, and billing for dev/prod.
- Registries and initial runner/application images before their consumers run.
- CI secrets and frontend-host configuration for the actual environment targets.
- Reviewed Terraform plans and observed pipeline/deployment smoke checks.

Current implementation gaps to resolve during cloud onboarding:

- `.gitlab-ci.yml` contains old project IDs and WIF project numbers.
- Terraform looks up `gitlab-ci-deployer`; the referenced
  `docs/gitlab/gitlab_wif_setup.sh` is absent.
- `infra/docker/build-all-runners.sh` overrides the target with a Flywheel
  project and repository. It must be parameterized before use here.
- Dev Terraform grants registry access to a stale prod service account.
- Terraform uses Vercel's `preview` target for dev, while CI requests `dev`;
  select and configure matching targets before first deployment.

These are setup gaps, not steps already performed by the existing scripts.

## Agent skills

Both clients use the imported Matt Pocock skills and local `onboarding` and
`spinup` skills in `harness/skills/`.
See `harness/README.md` for provenance, verification and explicit updates.

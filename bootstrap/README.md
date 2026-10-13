# Bootstrap and onboarding

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
Email/Password and Google sign-in in the Firebase console, then run
`bash bootstrap/init.sh`. Review Terraform plans before applying infrastructure;
see `infra/CLAUDE.md` for deployment and secrets.

## Agent skills

Both clients use the imported Matt Pocock skills in `harness/skills/`.
See `harness/README.md` for provenance, verification and explicit updates.

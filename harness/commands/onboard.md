# description: Inspect onboarding state and refresh onboarding_checklist.md

Run the onboarding probe and refresh the local checklist.

## Steps

1. Verify Python is available: run `command -v python3 >/dev/null 2>&1`. If
   that returns non-zero, stop and tell the user:
   > Python 3.9+ is required to run the onboarding probe.
   > - macOS: `brew install python@3.12`
   > - Debian/Ubuntu: `sudo apt-get install -y python3`
   > - Or download from <https://www.python.org/downloads/>
   > Re-run `/onboard` after installing.
2. Execute: `python3 harness/skills/onboard/onboard.py`
3. Read `onboarding_checklist.md` and report:
   - How many items are still unchecked
   - The first failing item with its remediation hint
4. If everything is checked, congratulate and remind the user that the checklist
   is gitignored — it tracks their personal setup state, not the repo's.

## What the probe checks

- Prereqs on PATH: node 20+, go 1.24+, git, gcloud, firebase, glab
- Bootstrap state: `bootstrap/config.env` filled in, `init.sh` was run, `frontend/.env.local` created
- Build state: `frontend/node_modules` exists, backend builds, backend + frontend tests pass
- Cloud auth (optional): `gcloud` and `glab` authenticated

## Re-runnable

The probe overwrites `onboarding_checklist.md` every time. Run it whenever you
want a fresh status. The file is gitignored — each contributor maintains their
own copy.

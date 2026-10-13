# Shared tooling and upstream skills

`skills/` contains the 27 skills published by Matt Pocock's plugin manifest at
the revision in `skills-lock.json`, plus his MIT license. Each skill directory,
including references, scripts and client metadata, is copied without changes.
Experimental and miscellaneous skills outside that published manifest are not
installed. `.agents/skills` and `.claude/skills` both point to this directory.

`skills/spinup/` is a local skill shared by Claude Code and Codex. Invoke
`spinup` to restart the dev stack, in GoLand Run tabs.
Test runners own the test emulators. The skill is excluded from the upstream
lock and preserved by the updater; an upstream skill with the same name
blocks the update rather than replacing it.

The initial import is upstream version 1.3.1, commit
`49dd158d1076134a641b33efb035946536778336`. The lock file is authoritative after
subsequent updates. Cloning Hexaverse includes the skills; no global installation or
additional plugin is needed. Avoid installing another copy of the same skills.

## Use

Start a fresh agent session after replacing the old skills. Invoke `ask-matt`
for upstream workflow guidance, or `grill-with-docs` to explore an idea.
The project uses the upstream local Markdown issue tracker under `.scratch/`,
default triage labels, and single-context domain docs. Configuration is in
`docs/agents/`, copied from the setup skill's templates. Run
`setup-matt-pocock-skills` if you want to change that setup.

Upstream owns the workflow, including document lifecycle and testing practice.
Hexaverse adds no custom completion cleanup or skill prompt overrides.

## Verify and update

From the repository root:

```bash
# Offline check: every installed file must match its recorded SHA-256.
python3 harness/update-skills.py check

# Explicit update to upstream main; requires Git and network access.
python3 harness/update-skills.py update

# Or select a particular upstream tag or commit.
python3 harness/update-skills.py update --ref <tag-or-commit>

# Review and commit the skill changes and lock together.
git diff --stat -- harness/skills harness/skills-lock.json
git diff -- harness/skills harness/skills-lock.json
```

The updater reads upstream's published plugin manifest, includes new skills,
removes retired ones, preserves file bytes and executable modes, and records
the resolved commit. It stages the download before replacing anything and
refuses to overwrite locally changed, missing or additional upstream skill files.
It does not execute downloaded skill scripts, modify project configuration,
stage Git changes, or commit. To roll back an adopted update, revert its commit;
to reproduce an older upstream release, pass its recorded SHA to `--ref`.

Keep local configuration in `CLAUDE.md` and `docs/agents/`, outside the imported
tree. `bootstrap/init.sh` excludes both the skills and lock from substitutions.
Each fork chooses when to update and commits its own resolved version.

## Ordinary utilities

These retained commands are separate from skill discovery:

| Tool | Command |
| --- | --- |
| Syntax/format check | `bash harness/validate-file.sh <path>` |
| Backend/frontend checks | `bash harness/check.sh` |
| Port management | `python3 harness/ports.py --help` |
| Onboarding probe | `python3 harness/utilities/onboard/onboard.py --local` |
| CRUD scaffold | `python3 harness/utilities/new-domain/new_domain.py widget` |
| Optional legacy convention checks | `python3 harness/utilities/code-quality-checks/check.py --help` |

The post-edit validator runs syntax/format checks by default. Its
`--project-checks` flag opts into legacy file conventions. Test execution is
documented in `docs/testing-tiers.md`; there is no custom SDET or archive gate.

#!/usr/bin/env python3
"""Onboarding probe for the Hexaverse skeleton.

Inspects local state (prereqs, bootstrap, build, tests) and writes
`onboarding_checklist.md` at the repo root with `[x]` / `[ ]` boxes reflecting
actual status. Re-runnable. Exits non-zero if any required check fails.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

# Built at runtime, never written as one literal: bootstrap/init.sh seds
# "{{" "PROJECT_NAME" "}}" across the repo, and a literal here would be
# rewritten to the project name and stop matching the template.
NAME_TOKEN = "{{" "PROJECT_NAME" "}}"

# harness/utilities/onboard/onboard.py → repo root is parents[3].
REPO_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE = REPO_ROOT / "harness/utilities/onboard/checklist_template.md"
OUTPUT = REPO_ROOT / "onboarding_checklist.md"


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 60) -> subprocess.CompletedProcess:
    """Run a command; never raise. Return CompletedProcess (returncode set on failure/timeout)."""
    try:
        return subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        # Synthesize a failed result so callers don't need to handle exceptions.
        result = subprocess.CompletedProcess(cmd, returncode=127, stdout="", stderr=str(e))
        return result


# ---------------------------------------------------------------------------
# Individual checks. Each returns (ok: bool, message: str | None).
# `message` is shown to the user on failure to help them remediate.
# ---------------------------------------------------------------------------


def _on_path(name: str) -> bool:
    return shutil.which(name) is not None


def _major_version(out: str) -> int | None:
    m = re.search(r"(\d+)\.\d+", out)
    return int(m.group(1)) if m else None


def check_node_20() -> tuple[bool, str | None]:
    if not _on_path("node"):
        return False, "Install Node.js 20+ (https://nodejs.org or via nvm)."
    res = run(["node", "--version"])
    major = _major_version(res.stdout)
    if major is None:
        return False, f"Could not parse `node --version` output: {res.stdout!r}"
    if major < 20:
        return False, f"node {res.stdout.strip()} is too old; need 20+."
    return True, None


def check_go_124() -> tuple[bool, str | None]:
    if not _on_path("go"):
        return False, "Install Go 1.24+ (https://go.dev/dl)."
    res = run(["go", "version"])
    # `go version go1.26.2 darwin/arm64`
    m = re.search(r"go(\d+)\.(\d+)", res.stdout)
    if not m:
        return False, f"Could not parse `go version` output: {res.stdout!r}"
    major, minor = int(m.group(1)), int(m.group(2))
    if (major, minor) < (1, 24):
        return False, f"go {major}.{minor} is too old; need 1.24+."
    return True, None


def check_git() -> tuple[bool, str | None]:
    if not _on_path("git"):
        return False, "Install git."
    return True, None


def check_gcloud() -> tuple[bool, str | None]:
    if not _on_path("gcloud"):
        return False, "Install Google Cloud SDK (https://cloud.google.com/sdk/docs/install)."
    return True, None


def check_firebase_cli() -> tuple[bool, str | None]:
    if not _on_path("firebase"):
        return False, "Install Firebase CLI: `npm install -g firebase-tools`."
    return True, None


def check_glab_cli() -> tuple[bool, str | None]:
    if not _on_path("glab"):
        return False, "Install GitLab CLI (https://gitlab.com/gitlab-org/cli) — optional, only needed for GitLab CI work."
    return True, None


def _config_env_value(key: str) -> str | None:
    """Read a single key from bootstrap/config.env. Returns the trimmed value
    (possibly empty), or None if the file or key is missing."""
    p = REPO_ROOT / "bootstrap/config.env"
    if not p.exists():
        return None
    text = p.read_text()
    m = re.search(rf"^{re.escape(key)}=(.*)$", text, re.MULTILINE)
    return m.group(1).strip() if m else None


def check_config_env(local_only: bool = False) -> tuple[bool, str | None]:
    p = REPO_ROOT / "bootstrap/config.env"
    if not p.exists():
        return False, "Run: `cp bootstrap/config.example.env bootstrap/config.env`, follow bootstrap/README.md."
    required = [
        "PROJECT_SLUG", "PROJECT_NAME", "GCP_PROJECT_DEV", "GCP_PROJECT_PROD",
        "PROD_DOMAIN", "DEV_DOMAIN",
    ]
    if not local_only:
        required += ["BILLING_ACCOUNT", "REGION"]
    for key in required:
        val = _config_env_value(key)
        if val is None or not val:
            return False, f"`bootstrap/config.env` exists but `{key}` is empty."
    return True, None


def _firebase_keys_set(env: str) -> tuple[bool, str | None]:
    """Return (ok, missing-key) for the FIREBASE_*_<ENV> block."""
    keys = [
        f"FIREBASE_API_KEY_{env}",
        f"FIREBASE_AUTH_DOMAIN_{env}",
        f"FIREBASE_PROJECT_ID_{env}",
        f"FIREBASE_STORAGE_BUCKET_{env}",
        f"FIREBASE_MESSAGING_SENDER_ID_{env}",
        f"FIREBASE_APP_ID_{env}",
    ]
    for key in keys:
        val = _config_env_value(key)
        if val is None or not val:
            return False, key
    return True, None


def check_firebase_keys_dev() -> tuple[bool, str | None]:
    ok, missing = _firebase_keys_set("DEV")
    if not ok:
        return False, f"`{missing}` is empty. Run: `bash bootstrap/setup-gcp.sh dev`."
    return True, None


def check_firebase_keys_prod() -> tuple[bool, str | None]:
    ok, missing = _firebase_keys_set("PROD")
    if not ok:
        return False, f"`{missing}` is empty. Run: `bash bootstrap/setup-gcp.sh prod`."
    return True, None


def check_firebase_auth() -> tuple[bool, str | None]:
    if not _on_path("firebase"):
        return False, "firebase CLI not installed (see Prerequisites)."
    res = run(["firebase", "projects:list"], timeout=15)
    if res.returncode != 0:
        return False, "Run: `firebase login`."
    return True, None


def check_init_run() -> tuple[bool, str | None]:
    """Heuristic: no `{{KEY}}` placeholders left in tracked source files."""
    # Sample a few files where placeholders live; if any still has them, init wasn't run.
    candidates = [
        REPO_ROOT / "backend/go.mod",
        REPO_ROOT / "backend/main.go",
        REPO_ROOT / "frontend/app/layout.tsx",
        REPO_ROOT / "infra/terraform/cloudrun.tf",
    ]
    placeholder = re.compile(r"\{\{[A-Z_]+\}\}")
    for f in candidates:
        if not f.exists():
            continue
        if placeholder.search(f.read_text()):
            return False, "Run: `bash bootstrap/init.sh` after filling in `bootstrap/config.env`."
    return True, None


def check_frontend_env(local_only: bool = False) -> tuple[bool, str | None]:
    p = REPO_ROOT / "frontend/.env.local"
    if not p.exists():
        return False, "`frontend/.env.local` missing. `bash bootstrap/init.sh` writes it from `bootstrap/config.env`."
    text = p.read_text()
    required = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
    # Development derives authDomain from projectId when it is blank. Cloud
    # builds require their explicitly configured domain.
    if not local_only:
        required.append("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")
    for key in required:
        match = re.search(rf"^{key}=(.*)$", text, re.MULTILINE)
        if not match or not match.group(1).strip().strip("\"'").strip():
            return False, f"`{key}` is empty in `frontend/.env.local`."
    return True, None


def check_frontend_node_modules() -> tuple[bool, str | None]:
    p = REPO_ROOT / "frontend/node_modules"
    if not p.exists():
        return False, "Run: `cd frontend && npm install`."
    return True, None


def check_go_build() -> tuple[bool, str | None]:
    backend = REPO_ROOT / "backend"
    if not backend.exists():
        return False, "`backend` directory missing."
    res = run(["go", "build", "./..."], cwd=backend, timeout=120)
    if res.returncode != 0:
        first_line = (res.stderr or res.stdout).strip().splitlines()[:1]
        return False, f"`go build ./...` failed: {first_line[0] if first_line else 'see stderr'}"
    return True, None


def check_go_test() -> tuple[bool, str | None]:
    backend = REPO_ROOT / "backend"
    if not backend.exists():
        return False, "`backend` directory missing."
    res = run(["go", "test", "-short", "./..."], cwd=backend, timeout=180)
    if res.returncode != 0:
        return False, "`go test -short ./...` failed; run it directly to see which test."
    return True, None


def check_frontend_test() -> tuple[bool, str | None]:
    frontend = REPO_ROOT / "frontend"
    if not frontend.exists():
        return False, "`frontend` directory missing."
    if not (frontend / "node_modules").exists():
        return False, "Frontend dependencies not installed; skipping (run `npm install` first)."
    res = run(["npx", "vitest", "run", "--reporter=basic"], cwd=frontend, timeout=180)
    if res.returncode != 0:
        return False, "`npx vitest run` failed; run it directly to see which test."
    return True, None


def check_gcp_auth() -> tuple[bool, str | None]:
    if not _on_path("gcloud"):
        return False, "gcloud not installed (see Prerequisites)."
    res = run(["gcloud", "auth", "print-access-token"], timeout=15)
    if res.returncode != 0:
        return False, "Run: `gcloud auth login` and `gcloud auth application-default login`."
    return True, None


def check_glab_auth() -> tuple[bool, str | None]:
    if not _on_path("glab"):
        return False, "glab not installed (see Prerequisites)."
    res = run(["glab", "auth", "status"], timeout=15)
    if res.returncode != 0:
        return False, "Run: `glab auth login`."
    return True, None


# Order matters for the printed summary.
CheckFn = Callable[[], "tuple[bool, str | None]"]

CHECKS: list[tuple[str, str, CheckFn]] = [
    ("prereq.node", "Node.js 20+", check_node_20),
    ("prereq.go", "Go 1.24+", check_go_124),
    ("prereq.git", "git", check_git),
    ("prereq.gcloud", "gcloud CLI", check_gcloud),
    ("prereq.firebase", "Firebase CLI", check_firebase_cli),
    ("prereq.glab", "GitLab CLI (optional)", check_glab_cli),
    ("cloud.gcp_auth", "gcloud authenticated", check_gcp_auth),
    ("cloud.firebase_auth", "firebase CLI authenticated", check_firebase_auth),
    ("bootstrap.config_env", "bootstrap/config.env exists and required keys filled in", check_config_env),
    ("bootstrap.firebase_dev", "FIREBASE_*_DEV keys populated in config.env", check_firebase_keys_dev),
    ("bootstrap.firebase_prod", "FIREBASE_*_PROD keys populated in config.env", check_firebase_keys_prod),
    ("bootstrap.init_run", "bootstrap/init.sh has been run", check_init_run),
    ("bootstrap.frontend_env", "frontend/.env.local exists with Firebase keys", check_frontend_env),
    ("deps.npm", "Frontend dependencies installed", check_frontend_node_modules),
    ("deps.go_build", "Backend builds (`go build ./...`)", check_go_build),
    ("deps.go_test", "Backend unit tests pass (`go test -short`)", check_go_test),
    ("deps.fe_test", "Frontend tests pass (`npx vitest run`)", check_frontend_test),
    ("cloud.gitlab_auth", "glab authenticated (optional)", check_glab_auth),
]

# Checks that are non-blocking (don't affect exit code).
OPTIONAL = {"prereq.glab", "cloud.gitlab_auth"}


LOCAL_SKIP = {
    "prereq.gcloud", "prereq.glab", "cloud.gcp_auth", "cloud.firebase_auth",
    "cloud.gitlab_auth", "bootstrap.firebase_dev", "bootstrap.firebase_prod",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Check emulator-only setup without cloud provisioning or login")
    args = parser.parse_args(argv)
    if not TEMPLATE.exists():
        print(f"Template not found: {TEMPLATE}", file=sys.stderr)
        return 2

    template = TEMPLATE.read_text()
    rendered = template
    failures: list[tuple[str, str, str]] = []  # (id, label, msg)
    required_failures = 0

    active_checks = [check for check in CHECKS if not (args.local and check[0] in LOCAL_SKIP)]
    if args.local:
        for check_id in LOCAL_SKIP:
            rendered = rendered.replace(f"<<{check_id}>>", "[-] (skipped: cloud setup)")
    print(f"Probing {len(active_checks)} onboarding milestones (mode: {'local' if args.local else 'cloud'})...\n")
    for check_id, label, fn in active_checks:
        try:
            if check_id == "bootstrap.config_env":
                ok, msg = check_config_env(local_only=args.local)
            elif check_id == "bootstrap.frontend_env":
                ok, msg = check_frontend_env(local_only=args.local)
            else:
                ok, msg = fn()
        except Exception as e:
            ok, msg = False, f"check raised: {e!r}"
        marker = "[x]" if ok else "[ ]"
        rendered = rendered.replace(f"<<{check_id}>>", marker)

        flag = "✓" if ok else "✗"
        suffix = ""
        if not ok:
            suffix = f"  ({msg})" if msg else ""
            failures.append((check_id, label, msg or ""))
            if check_id not in OPTIONAL:
                required_failures += 1
        print(f"  {flag} {label}{suffix}")

    # Strip any unfilled markers (in case of typos / stale template entries).
    rendered = re.sub(r"<<[^>\n]+>>", "[ ]", rendered)

    # Stamp the run time at the top.
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    rendered = rendered.replace("{{LAST_RUN}}", timestamp)

    # If config.env is present, substitute PROJECT_NAME so the title isn't ugly
    # before init.sh has run. After init.sh, the template itself is already
    # substituted, so this is a no-op.
    config_env = REPO_ROOT / "bootstrap/config.env"
    if config_env.exists():
        text = config_env.read_text()
        m = re.search(r"^PROJECT_NAME=(.*)$", text, re.MULTILINE)
        if m and m.group(1).strip():
            rendered = rendered.replace(NAME_TOKEN, m.group(1).strip())

    OUTPUT.write_text(rendered)

    print(f"\nWrote {OUTPUT.relative_to(REPO_ROOT)}")
    total = len(active_checks)
    passed = total - len(failures)
    print(f"{passed}/{total} checks passed (required failures: {required_failures})")

    if failures:
        print("\nNext steps:")
        for check_id, label, msg in failures:
            tag = "(optional)" if check_id in OPTIONAL else ""
            print(f"  - {label} {tag}\n      {msg}")

    return 0 if required_failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

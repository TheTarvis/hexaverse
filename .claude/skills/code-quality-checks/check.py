#!/usr/bin/env python3
"""
Code Quality Checks

Runs various validation scripts against changed files or specified directories.
"""

import os
import sys
import subprocess
import json
import fnmatch
from pathlib import Path
from typing import List, Set, Optional, Dict, Any


# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_header(message):
    """Print a formatted header."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{message}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 60}{Colors.ENDC}\n")


def print_success(message):
    """Print a success message."""
    print(f"{Colors.OKGREEN}✓ {message}{Colors.ENDC}")


def print_error(message):
    """Print an error message."""
    print(f"{Colors.FAIL}✗ {message}{Colors.ENDC}")


def print_warning(message):
    """Print a warning message."""
    print(f"{Colors.WARNING}⚠ {message}{Colors.ENDC}")


def print_info(message):
    """Print an info message."""
    print(f"{Colors.OKCYAN}ℹ {message}{Colors.ENDC}")


def run_command(command, cwd=None, check=True, capture_output=True):
    """Run a shell command."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            check=check,
            capture_output=capture_output,
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        if check:
            raise
        return e


def get_changed_files(base_ref: str = "HEAD") -> List[str]:
    """Get list of changed files since the specified git ref."""
    try:
        # Get staged files
        staged_result = run_command("git diff --cached --name-only --diff-filter=d", check=False)
        staged_files = staged_result.stdout.strip().split('\n') if staged_result.stdout.strip() else []

        # Get unstaged files
        unstaged_result = run_command("git diff --name-only --diff-filter=d", check=False)
        unstaged_files = unstaged_result.stdout.strip().split('\n') if unstaged_result.stdout.strip() else []

        # Get untracked files
        untracked_result = run_command("git ls-files --others --exclude-standard", check=False)
        untracked_files = untracked_result.stdout.strip().split('\n') if untracked_result.stdout.strip() else []

        # Combine and deduplicate
        all_files = set(staged_files + unstaged_files + untracked_files)
        all_files.discard('')  # Remove empty strings

        # Convert to absolute paths and filter out deleted files
        project_root = Path.cwd()
        changed_files = []
        for file in all_files:
            file_path = project_root / file
            if file_path.exists():
                changed_files.append(str(file_path))

        return changed_files
    except Exception as e:
        print_error(f"Failed to get changed files: {e}")
        return []


def get_files_in_directory(directory: str) -> List[str]:
    """Get all files recursively in the specified directory."""
    dir_path = Path(directory)
    if not dir_path.exists():
        print_error(f"Directory does not exist: {directory}")
        return []

    if not dir_path.is_dir():
        print_error(f"Not a directory: {directory}")
        return []

    all_files = []
    for file_path in dir_path.rglob('*'):
        if file_path.is_file():
            all_files.append(str(file_path.absolute()))

    return all_files


def run_check_script(script_name: str, file_path: str) -> Optional[dict]:
    """Run a check script on a single file."""
    script_path = Path.cwd() / f".claude/scripts/{script_name}"

    if not script_path.exists():
        print_error(f"Script not found: {script_path}")
        return None

    # Create the JSON input that the script expects
    tool_input = {
        "tool_input": {
            "file_path": file_path
        }
    }

    try:
        # Run the script with the JSON input
        result = subprocess.run(
            ["bash", str(script_path)],
            input=json.dumps(tool_input),
            capture_output=True,
            text=True,
            cwd=Path.cwd()
        )

        # Exit code 2 means the check failed (blocking)
        if result.returncode == 2:
            try:
                response = json.loads(result.stdout)
                return {
                    "file": file_path,
                    "passed": False,
                    "reason": response.get("reason", "Unknown error")
                }
            except json.JSONDecodeError:
                return {
                    "file": file_path,
                    "passed": False,
                    "reason": "Script returned invalid JSON"
                }
        elif result.returncode == 0:
            return {
                "file": file_path,
                "passed": True
            }
        else:
            return {
                "file": file_path,
                "passed": False,
                "reason": f"Script exited with code {result.returncode}"
            }
    except Exception as e:
        return {
            "file": file_path,
            "passed": False,
            "reason": f"Error running script: {e}"
        }


def run_datatestid_check(file_path: str) -> Optional[dict]:
    """Run the data-testid check script on a single file."""
    return run_check_script("check-datatestid.sh", file_path)


def run_backend_tests_check(file_path: str) -> Optional[dict]:
    """Run the backend tests check script on a single file."""
    return run_check_script("check-backend-tests.sh", file_path)


def run_backend_params_check(file_path: str) -> Optional[dict]:
    """Run the backend params helper check script on a single file."""
    return run_check_script("check-backend-params.sh", file_path)


def run_python_tests_check(file_path: str) -> Optional[dict]:
    """Run the Python tests check script on a single file."""
    return run_check_script("check-python-tests.sh", file_path)


def run_frontend_tests_check(file_path: str) -> Optional[dict]:
    """Run the frontend tests check script on a single file."""
    return run_check_script("check-frontend-tests.sh", file_path)


def run_raw_fetch_check(file_path: str) -> Optional[dict]:
    """Run the raw fetch check script on a single file."""
    return run_check_script("check-raw-fetch.sh", file_path)


def run_transcendental_check(file_path: str) -> Optional[dict]:
    """Run the cross-stack determinism transcendental lint on a single file."""
    return run_check_script("check-transcendental.sh", file_path)


# The Go packages whose outputs are rule-bearing (persisted values, solve
# results, ETAs, disclosure decisions) — the transcendental lint's scope gate.
# Must match check-transcendental.sh's own gate.
DETERMINISM_GO_PACKAGES = ("board", "fleet", "mine", "galaxy", "system", "corporations", "market")


def print_deviation_register():
    """Print the capability's deviation register (openspec cross-stack-
    determinism): every check that consults it prints it, so a suppressed
    violation is visible in the check's own output."""
    register_path = Path.cwd() / "fixtures" / "determinism-register.json"
    if not register_path.exists():
        print_warning("Deviation register not found (fixtures/determinism-register.json)")
        return
    try:
        register = json.loads(register_path.read_text())
    except json.JSONDecodeError as e:
        print_error(f"Deviation register is not valid JSON: {e}")
        return
    entries = register.get("entries", [])
    print_info(f"Deviation register: {len(entries)} open-defect entrie(s) (fixtures/determinism-register.json)")
    for e in entries:
        checks = ",".join(sorted(e.get("checks", {}).keys())) or "-"
        print(f"    [{checks}] {e.get('site')}")
        print(f"        defect: {e.get('defect')}  filed: {e.get('filed')}  magnitude: {e.get('magnitude')}")


def check_transcendental(files: List[str]) -> dict:
    """Cross-stack determinism lint (secondary, textual): transcendental /
    sqrt / bare-Round calls in the rule-bearing Go packages and the TS
    board-math mirror must carry a reviewed determinism:allow pragma or be
    named in the deviation register. See openspec cross-stack-determinism."""
    print_header("Checking Determinism Seam (transcendental lint)")

    seam_files = [
        f for f in files
        if (any(f.startswith(str(Path.cwd() / "backend" / pkg) + os.sep) for pkg in DETERMINISM_GO_PACKAGES)
            and f.endswith(".go"))
        or (f.startswith(str(Path.cwd() / "frontend" / "lib" / "hex") + os.sep) and f.endswith(".ts"))
    ]

    if not seam_files:
        print_info("No determinism-governed files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_deviation_register()
    print_info(f"Checking {len(seam_files)} file(s)...")

    results = {
        "total": len(seam_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in seam_files:
        result = run_transcendental_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_datatestid(files: List[str]) -> dict:
    """Run data-testid checks on the provided files."""
    print_header("Checking for data-testid Attributes")

    # Filter to only frontend TypeScript/TSX files
    frontend_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "frontend")) and
        any(f.endswith(ext) for ext in ['.tsx', '.ts', '.jsx', '.js'])
    ]

    if not frontend_files:
        print_info("No frontend TypeScript/TSX files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(frontend_files)} file(s)...")

    results = {
        "total": len(frontend_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in frontend_files:
        result = run_datatestid_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_backend_tests(files: List[str]) -> dict:
    """Run backend test coverage checks on the provided files."""
    print_header("Checking Backend Test Coverage")

    # Backend files excluded from test coverage (templates, helpers that don't need their own tests)
    backend_test_coverage_excludes: Set[str] = set()

    # Filter to only backend Go files (not tests, not mocks)
    backend_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "backend")) and
        f.endswith('.go') and
        not f.endswith('_test.go') and
        not f.endswith('_mock.go') and
        not any(f.endswith(exc) for exc in backend_test_coverage_excludes)
    ]

    if not backend_files:
        print_info("No backend Go files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(backend_files)} file(s)...")

    results = {
        "total": len(backend_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in backend_files:
        result = run_backend_tests_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_backend_params(files: List[str]) -> dict:
    """Run backend param helper usage checks on the provided files."""
    print_header("Checking Backend Param Helper Usage")

    # Filter to only backend Go files (not tests, not mocks)
    backend_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "backend")) and
        f.endswith('.go') and
        not f.endswith('_test.go') and
        not f.endswith('_mock.go')
    ]

    if not backend_files:
        print_info("No backend Go files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(backend_files)} file(s)...")

    results = {
        "total": len(backend_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in backend_files:
        result = run_backend_params_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_python_tests(files: List[str]) -> dict:
    """Run Python test coverage checks on agent files."""
    print_header("Checking Python Test Coverage")

    # Filter to only claude-agent Python source files (not tests, not __init__.py)
    python_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "claude-agent" / "src")) and
        f.endswith('.py') and
        not f.endswith('__init__.py') and
        not f.endswith('conftest.py') and
        '.venv' not in f
    ]

    if not python_files:
        print_info("No Python source files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(python_files)} file(s)...")

    results = {
        "total": len(python_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in python_files:
        result = run_python_tests_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_frontend_tests_coverage(files: List[str]) -> dict:
    """Run frontend test coverage checks on the provided files."""
    print_header("Checking Frontend Test Coverage")

    # Filter to only frontend TypeScript/TSX files (not tests, not stories, not marketing, not SEO files)
    frontend_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "frontend")) and
        any(f.endswith(ext) for ext in ['.tsx', '.ts']) and
        not any(pattern in f for pattern in ['.test.', '.spec.', '.stories.', 'node_modules', '/e2e/'])
    ]

    if not frontend_files:
        print_info("No frontend TypeScript/TSX files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(frontend_files)} file(s)...")

    results = {
        "total": len(frontend_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in frontend_files:
        result = run_frontend_tests_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def check_raw_fetch(files: List[str]) -> dict:
    """Check that service files use apiClient instead of raw fetch()."""
    print_header("Checking for Raw fetch() Usage in Services")

    # Filter to only frontend service files
    service_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "frontend" / "lib" / "services")) and
        f.endswith('.ts') and
        not f.endswith('.test.ts')
    ]

    if not service_files:
        print_info("No frontend service files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(service_files)} file(s)...")

    results = {
        "total": len(service_files),
        "passed": 0,
        "failed": 0,
        "failures": []
    }

    for file in service_files:
        result = run_raw_fetch_check(file)
        if result:
            if result["passed"]:
                results["passed"] += 1
                print_success(f"{Path(file).relative_to(Path.cwd())}")
            else:
                results["failed"] += 1
                results["failures"].append(result)
                print_error(f"{Path(file).relative_to(Path.cwd())}")

    return results


def run_npm_audit() -> dict:
    """Run npm audit on frontend production dependencies.

    Mirrors CI: `cd frontend && npm audit --omit=dev --audit-level=high`
    Fails on high/critical vulnerabilities in production deps (CASA T3 / ASVS V14.2).
    """
    print_header("Running npm audit (frontend prod deps)")

    frontend_dir = Path.cwd() / "frontend"
    if not frontend_dir.exists():
        print_warning("Frontend directory not found, skipping")
        return {"passed": True, "skipped": True}

    print_info("Running npm audit --omit=dev --audit-level=high...")

    try:
        result = run_command(
            "npm audit --omit=dev --audit-level=high",
            cwd=frontend_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("npm audit passed (no high/critical vulnerabilities)")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("npm audit found high/critical vulnerabilities")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "High or critical vulnerabilities in production dependencies. Run `cd frontend && npm audit fix` to resolve."
            }
    except Exception as e:
        print_error(f"Failed to run npm audit: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_govulncheck() -> dict:
    """Run govulncheck on backend Go code.

    Mirrors CI: `cd backend && govulncheck ./...`
    Fails on vulnerabilities reachable from application code paths (CASA T3 / ASVS V14.2).
    """
    print_header("Running govulncheck (backend Go)")

    backend_dir = Path.cwd() / "backend"
    if not backend_dir.exists():
        print_warning("Backend directory not found, skipping")
        return {"passed": True, "skipped": True}

    # Check govulncheck is installed; auto-install if missing
    which_result = run_command("command -v govulncheck", check=False)
    if which_result.returncode != 0:
        print_info("govulncheck not found, installing via go install...")
        install_result = run_command(
            "go install golang.org/x/vuln/cmd/govulncheck@latest",
            cwd=backend_dir,
            check=False
        )
        if install_result.returncode != 0:
            print_error("Failed to install govulncheck")
            return {
                "passed": False,
                "output": install_result.stdout + "\n" + install_result.stderr,
                "reason": "Could not install govulncheck. Run: go install golang.org/x/vuln/cmd/govulncheck@latest"
            }

    print_info("Running govulncheck ./...")

    try:
        result = run_command(
            "govulncheck ./...",
            cwd=backend_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("govulncheck passed (no reachable vulnerabilities)")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("govulncheck found reachable vulnerabilities")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "Reachable vulnerabilities in Go dependencies or stdlib. Bump the affected module(s) or Go toolchain version in backend/go.mod."
            }
    except Exception as e:
        print_error(f"Failed to run govulncheck: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_frontend_lint() -> dict:
    """Run frontend linting (next lint + tsc)."""
    print_header("Running Frontend Lint")

    frontend_dir = Path.cwd() / "frontend"
    if not frontend_dir.exists():
        print_warning("Frontend directory not found, skipping")
        return {"passed": True, "skipped": True}

    print_info("Running ESLint and TypeScript compiler...")

    try:
        result = run_command(
            "npm run lint",
            cwd=frontend_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("Frontend lint passed")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("Frontend lint failed")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "Linting errors found"
            }
    except Exception as e:
        print_error(f"Failed to run lint: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_frontend_tests() -> dict:
    """Run frontend tests (vitest)."""
    print_header("Running Frontend Tests")

    frontend_dir = Path.cwd() / "frontend"
    if not frontend_dir.exists():
        print_warning("Frontend directory not found, skipping")
        return {"passed": True, "skipped": True}

    print_info("Running Vitest...")

    try:
        result = run_command(
            "npx vitest run",
            cwd=frontend_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("Frontend tests passed")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("Frontend tests failed")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "Test failures detected"
            }
    except Exception as e:
        print_error(f"Failed to run tests: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def _http_reachable(url: str, insecure: bool = False) -> bool:
    """Best-effort probe: returns True if the URL answers with any HTTP status."""
    flag = "-sk" if insecure else "-s"
    result = run_command(
        f"curl {flag} -o /dev/null -w '%{{http_code}}' --max-time 3 {url}",
        check=False,
    )
    code = (result.stdout or "").strip()
    return result.returncode == 0 and code not in ("", "000")


def run_frontend_e2e(required: bool = True) -> dict:
    """Run the frontend Playwright E2E suite via `npm run e2e`.

    `npm run e2e` routes through scripts/dev/with-test-emulators.sh, which reuses a
    running test emulator or starts a throwaway one, then boots the suite's own
    isolated frontend/backend. This delegates entirely to that wrapper — no stack
    or emulator management is duplicated here, so wrapper changes are picked up
    automatically.

    `required` (explicit `--e2e`): always run — ensure-test-emulators.sh starts a
    persistent test emulator first (or reuses one), so the wrapper and later runs
    attach to it instead of cold-starting a throwaway set every time. Best-effort
    (`--run-all`/default `/check`): only run when a test emulator is already up, so
    a routine `/check` isn't slowed by a multi-minute cold-started e2e run.
    """
    print_header("Running Frontend E2E Tests (Playwright)")

    frontend_dir = Path.cwd() / "frontend"
    if not frontend_dir.exists():
        print_warning("Frontend directory not found, skipping")
        return {"passed": True, "skipped": True}

    # Default fast-path gate only. The actual run + emulator handling belong to the
    # wrapper (npm run e2e); here we just probe the test emulator's Firestore port
    # (firebase.test.json) to decide whether the heavy suite is worth starting.
    if not required and not _http_reachable("http://127.0.0.1:9100"):
        print_warning("Test emulator not running — skipping E2E.")
        print_info("Start it (npm run firebase:emulators:test) or run `/check --e2e` to cold-start one.")
        return {"passed": True, "skipped": True}

    # Explicit --e2e: start (or reuse) a persistent test emulator so the wrapper —
    # and any later /check run — attaches to it instead of cold-starting a
    # throwaway one every time.
    if required:
        ensure = run_command(
            "scripts/dev/ensure-test-emulators.sh",
            check=False,
            capture_output=False,
        )
        if ensure.returncode != 0:
            print_error("Could not start the test emulators (see output above)")
            return {"passed": False, "reason": "Test emulator failed to start"}

    print_info("Running Playwright (npm run e2e)...")
    try:
        # Stream live — the suite runs for minutes; buffering would hide progress.
        result = run_command(
            "npm run e2e",
            cwd=frontend_dir,
            check=False,
            capture_output=False,
        )
        if result.returncode == 0:
            print_success("Frontend E2E tests passed")
            return {"passed": True}
        print_error("Frontend E2E tests failed")
        return {"passed": False, "reason": "E2E failures detected (see output above)"}
    except Exception as e:
        print_error(f"Failed to run E2E tests: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def generate_backend_mocks() -> dict:
    """Generate backend mocks using go generate."""
    print_header("Generating Backend Mocks")

    backend_dir = Path.cwd() / "backend"
    if not backend_dir.exists():
        print_warning("Backend directory not found, skipping mock generation")
        return {"passed": True, "skipped": True}

    print_info("Running go generate ./...")

    try:
        result = run_command(
            "go generate ./...",
            cwd=backend_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("Mock generation completed")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("Mock generation failed")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "go generate failed"
            }
    except Exception as e:
        print_error(f"Failed to generate mocks: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_backend_tests_suite() -> dict:
    """Run backend test suite (gotestsum)."""
    print_header("Running Backend Tests")

    project_root = Path.cwd()
    package_json = project_root / "package.json"

    if not package_json.exists():
        print_warning("package.json not found, skipping")
        return {"passed": True, "skipped": True}

    # Generate mocks first
    mock_result = generate_backend_mocks()
    if not mock_result.get("passed", False) and not mock_result.get("skipped", False):
        return mock_result

    print_info("Running Go tests via npm script...")

    try:
        result = run_command(
            "npm run test:backend:all",
            cwd=project_root,
            check=False
        )

        if result.returncode == 0:
            print_success("Backend tests passed")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("Backend tests failed")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "Test failures detected"
            }
    except Exception as e:
        print_error(f"Failed to run tests: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_agent_tests() -> dict:
    """Run agent/Python tests (pytest via uv)."""
    print_header("Running Agent Tests")

    agent_dir = Path.cwd() / "claude-agent"
    if not agent_dir.exists():
        print_warning("claude-agent directory not found, skipping")
        return {"passed": True, "skipped": True}

    print_info("Running pytest via uv...")

    try:
        # First sync dependencies
        sync_result = run_command(
            "uv sync --extra dev",
            cwd=agent_dir,
            check=False
        )

        if sync_result.returncode != 0:
            print_error("Failed to sync dependencies")
            return {
                "passed": False,
                "output": sync_result.stdout + "\n" + sync_result.stderr,
                "reason": "uv sync failed"
            }

        # Run tests
        result = run_command(
            "uv run pytest tests/ -v",
            cwd=agent_dir,
            check=False
        )

        if result.returncode == 0:
            print_success("Agent tests passed")
            return {"passed": True, "output": result.stdout}
        else:
            print_error("Agent tests failed")
            return {
                "passed": False,
                "output": result.stdout + "\n" + result.stderr,
                "reason": "Test failures detected"
            }
    except Exception as e:
        print_error(f"Failed to run tests: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def run_agent_lint() -> dict:
    """Run agent/Python linting (ruff + pyright via uv)."""
    print_header("Running Agent Lint")

    agent_dir = Path.cwd() / "claude-agent"
    if not agent_dir.exists():
        print_warning("claude-agent directory not found, skipping")
        return {"passed": True, "skipped": True}

    print_info("Running ruff check, ruff format, and pyright via uv...")

    try:
        # First sync dependencies
        sync_result = run_command(
            "uv sync --extra dev",
            cwd=agent_dir,
            check=False
        )

        if sync_result.returncode != 0:
            print_error("Failed to sync dependencies")
            return {
                "passed": False,
                "output": sync_result.stdout + "\n" + sync_result.stderr,
                "reason": "uv sync failed"
            }

        # Run ruff check (on entire codebase)
        check_result = run_command(
            "uv run ruff check .",
            cwd=agent_dir,
            check=False
        )

        # Run ruff format check (on entire codebase)
        format_result = run_command(
            "uv run ruff format --check .",
            cwd=agent_dir,
            check=False
        )

        # Run pyright (type checking)
        pyright_result = run_command(
            "uv run pyright",
            cwd=agent_dir,
            check=False
        )

        all_passed = (
            check_result.returncode == 0 and
            format_result.returncode == 0 and
            pyright_result.returncode == 0
        )

        if all_passed:
            print_success("Agent lint passed")
            return {"passed": True, "output": check_result.stdout}
        else:
            print_error("Agent lint failed")
            output = ""
            if check_result.returncode != 0:
                output += f"ruff check errors:\n{check_result.stdout}\n{check_result.stderr}\n"
            if format_result.returncode != 0:
                output += f"ruff format errors:\n{format_result.stdout}\n{format_result.stderr}\n"
            if pyright_result.returncode != 0:
                output += f"pyright errors:\n{pyright_result.stdout}\n{pyright_result.stderr}\n"
            return {
                "passed": False,
                "output": output,
                "reason": "Linting errors found"
            }
    except Exception as e:
        print_error(f"Failed to run lint: {e}")
        return {"passed": False, "reason": f"Error: {e}"}


def check_color_compliance(files: List[str], semantic: bool = False) -> dict:
    """Check frontend files for color palette compliance."""
    title = "Checking Color Compliance" + (" (with AI semantic analysis)" if semantic else "")
    print_header(title)

    # Filter to only frontend TSX/TS files
    frontend_files = [
        f for f in files
        if f.startswith(str(Path.cwd() / "frontend")) and
        any(f.endswith(ext) for ext in ['.tsx', '.ts']) and
        not any(x in f for x in ['.test.', '.stories.', 'node_modules'])
    ]

    if not frontend_files:
        print_info("No frontend files to check")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    print_info(f"Checking {len(frontend_files)} file(s)...")

    # Run the color compliance script
    script_path = Path.cwd() / ".claude" / "scripts" / "check-color-compliance.py"

    if not script_path.exists():
        print_warning("Color compliance script not found, skipping")
        return {"total": 0, "passed": 0, "failed": 0, "failures": []}

    try:
        file_list = '\n'.join(frontend_files)
        cmd = ["python3", str(script_path)]
        if semantic:
            cmd.append("--semantic")
        result = subprocess.run(
            cmd,
            input=file_list,
            capture_output=True,
            text=True,
            cwd=Path.cwd()
        )

        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError:
            print_error(f"Invalid JSON from color check: {result.stdout[:200]}")
            return {"total": len(frontend_files), "passed": 0, "failed": 0, "failures": []}

        total_errors = output.get("total_errors", 0)
        total_warnings = output.get("total_warnings", 0)
        passed_count = 0
        failed_count = 0
        failures = []

        for file_result in output.get("files", []):
            rel_path = str(Path(file_result["file"]).relative_to(Path.cwd()))
            if file_result.get("passed", True) and not file_result.get("warnings", 0):
                passed_count += 1
                print_success(rel_path)
            elif file_result.get("passed", True) and file_result.get("warnings", 0):
                passed_count += 1
                print_warning(f"{rel_path} ({file_result['warnings']} warning(s))")
                for v in file_result.get("violations", []):
                    if v["severity"] == "warning":
                        print(f"    ⚠ Line {v['line']}: {v['message']}")
            else:
                failed_count += 1
                print_error(rel_path)
                violation_details = []
                for v in file_result.get("violations", []):
                    violation_details.append(f"  Line {v['line']}: [{v['rule']}] {v['match']} - {v['message']}")
                failures.append({
                    "file": file_result["file"],
                    "passed": False,
                    "reason": f"Color compliance errors:\n" + "\n".join(violation_details)
                })

        if total_errors == 0 and total_warnings == 0:
            print_success(f"All {len(frontend_files)} file(s) comply with color palette")

        return {
            "total": passed_count + failed_count,
            "passed": passed_count,
            "failed": failed_count,
            "failures": failures
        }

    except Exception as e:
        print_error(f"Failed to run color compliance check: {e}")
        return {"total": len(frontend_files), "passed": 0, "failed": 0, "failures": []}


def run_determinism_cross_target() -> dict:
    """Cross-build-target determinism checks (openspec cross-stack-determinism).

    Three legs, in the enforcement order the capability's design.md ranks them:
    1. The differential fixture-suite run — the golden fixtures (board AND
       polar; the polar suite's sweep digests re-enumerate the full bounded
       domain, so this leg is an exhaustive cross-target diff for that
       package, per openspec polar-lattice-math) must reproduce on
       GOARCH=amd64 GOAMD64=v1 (the non-contracting target; Rosetta locally,
       native on CI) alongside the native arch. GOAMD64 is pinned explicitly
       because v3+ emits FMA on amd64 too. backend/space (openspec
       add-space-kinematics) rides the same leg: it is a Go-only rule-bearing
       package with no JavaScript-runtime leg by design (Decision 1 — no
       TypeScript mirror), so this compiled-output cross-target run is its
       whole determinism story, not merely a fixture-file diff.
    2. Compiled-output FMA inspection over the whole backend module
       (check-fma-contraction.sh) — the primary mechanism; consults and
       prints the deviation register.
    3. The deployed-build pin check: backend/Dockerfile must pin GOARCH and an
       explicit, non-contracting GOAMD64 level. Fails when the pin is absent.
    """
    print_header("Determinism Cross-Target (build-target matrix)")

    backend_dir = Path.cwd() / "backend"
    if not backend_dir.exists():
        print_warning("Backend directory not found, skipping")
        return {"passed": True, "skipped": True}

    reasons = []

    print_info("Board + polar + space fixture suites, native arch...")
    native = run_command("go test ./board/ ./polar/ ./space/ -short -count=1", cwd=backend_dir, check=False)
    if native.returncode == 0:
        print_success("native arch board/polar/space tests passed")
    else:
        print_error("native arch board/polar/space tests failed")
        reasons.append("native-arch board/polar/space tests failed:\n" + native.stdout + native.stderr)

    print_info("Board + polar + space fixture suites, GOARCH=amd64 GOAMD64=v1 (non-contracting target)...")
    amd64 = run_command(
        "GOARCH=amd64 GOAMD64=v1 go test ./board/ ./polar/ ./space/ -short -count=1",
        cwd=backend_dir, check=False
    )
    if amd64.returncode == 0:
        print_success("amd64/GOAMD64=v1 board/polar/space tests passed")
    else:
        print_error("amd64/GOAMD64=v1 board/polar/space tests failed")
        reasons.append(
            "amd64/GOAMD64=v1 board/polar/space tests failed (on Apple Silicon this leg needs "
            "Rosetta 2 — `softwareupdate --install-rosetta`):\n" + amd64.stdout + amd64.stderr)

    print_info("Compiled-output FMA-contraction inspection (backend module, arm64 vs amd64/v1)...")
    fma = run_command("bash .claude/scripts/check-fma-contraction.sh", check=False)
    print(fma.stdout, end="")
    if fma.returncode == 0:
        print_success("FMA-contraction check passed")
    else:
        print_error("FMA-contraction check failed")
        reasons.append("FMA-contraction check failed (see output above)")

    print_info("Deployed-build target pin (backend/Dockerfile)...")
    dockerfile = backend_dir / "Dockerfile"
    if not dockerfile.exists():
        print_error("backend/Dockerfile not found — the deployed build target is unpinned")
        reasons.append(
            "backend/Dockerfile is missing: the deployed backend's GOARCH/GOAMD64 is whatever "
            "the build image defaults to. Pin GOARCH and an explicit non-contracting GOAMD64 "
            "(v1) in the Dockerfile (openspec cross-stack-determinism: an unpinned GOAMD64 "
            "build target is out of compliance).")
    else:
        content = dockerfile.read_text()
        import re
        if not re.search(r'GOAMD64=v\d', content):
            print_error("backend/Dockerfile has no explicit GOAMD64 pin")
            reasons.append(
                "backend/Dockerfile does not pin GOAMD64: GOAMD64=v3+ emits FMA on amd64 too, "
                "silently turning production into a contracting target while every stated check "
                "still passes. Pin GOAMD64=v1 (or another level verified non-contracting via "
                "-gcflags=-S) in the build stage.")
        elif not re.search(r'GOARCH=\w+', content):
            print_error("backend/Dockerfile has no explicit GOARCH pin")
            reasons.append("backend/Dockerfile does not pin GOARCH — the deployed architecture "
                           "must be a committed, reviewable value.")
        else:
            print_success("backend/Dockerfile pins GOARCH and GOAMD64 explicitly")

    if reasons:
        return {"passed": False, "reason": "\n\n".join(reasons)}
    return {"passed": True}


def run_mirror_map_check() -> dict:
    """Mirror-map coverage check (openspec cross-stack-determinism): every
    function defined in both backend/board and frontend/lib/board must be named
    in fixtures/board/mirror-map.json and be fixture-covered or inventoried."""
    print_header("Checking Determinism Mirror Map Coverage")

    result = run_command("bash .claude/scripts/check-mirror-map.sh", check=False)
    print(result.stdout, end="")
    if result.returncode == 0:
        print_success("Mirror map coverage check passed")
        return {"passed": True}
    print_error("Mirror map coverage check failed")
    return {"passed": False, "reason": "Mirror map coverage check failed (see output above)"}


def print_summary(results: dict):
    """Print summary of check results."""
    print_header("Check Summary")

    # File-based checks
    file_check_names = {
        "datatestid": "Data-testid Attributes",
        "backend_tests": "Backend Test Coverage",
        "backend_params": "Backend Param Helpers",
        "frontend_tests_coverage": "Frontend Test Coverage",
        "raw_fetch": "Raw fetch() in Services",
        "python_tests": "Python Test Coverage",
        "color_compliance": "Color Compliance",
        "transcendental": "Determinism Seam (transcendental)"
    }

    # Suite-based checks (lint, tests)
    suite_check_names = {
        "npm_audit": "npm audit (frontend prod)",
        "govulncheck": "govulncheck (backend)",
        "frontend_lint": "Frontend Lint",
        "frontend_tests": "Frontend Tests",
        "frontend_e2e": "Frontend E2E Tests",
        "backend_tests_suite": "Backend Tests",
        "determinism_cross_target": "Determinism Cross-Target (build matrix)",
        "mirror_map": "Determinism Mirror Map",
        "agent_lint": "Agent Lint",
        "agent_tests": "Agent Tests"
    }

    total_files = 0
    total_passed = 0
    total_failed = 0
    all_failures = []
    has_failures = False

    # Aggregate file-based check results
    for check_key, check_name in file_check_names.items():
        check_results = results.get(check_key, {})
        total = check_results.get("total", 0)
        passed = check_results.get("passed", 0)
        failed = check_results.get("failed", 0)

        if total > 0:
            total_files += total
            total_passed += passed
            total_failed += failed
            print(f"\n{check_name}:")
            print(f"  Total: {total}, Passed: {passed}, Failed: {failed}")

            if failed > 0:
                for failure in check_results.get("failures", []):
                    all_failures.append({
                        "check": check_name,
                        "file": failure["file"],
                        "reason": failure.get("reason", "Unknown error")
                    })

    # Report suite-based checks
    for check_key, check_name in suite_check_names.items():
        check_result = results.get(check_key)

        # Skip if check wasn't run
        if not check_result:
            continue

        # Skip if explicitly marked as skipped
        if check_result.get("skipped"):
            continue

        passed = check_result.get("passed", False)
        print(f"\n{check_name}:")
        if passed:
            print_success("  Passed")
        else:
            print_error("  Failed")
            has_failures = True
            all_failures.append({
                "check": check_name,
                "file": None,
                "reason": check_result.get("reason", "Check failed"),
                "output": check_result.get("output", "")
            })

    if total_files == 0 and not any(results.get(k) for k in suite_check_names.keys()):
        print_info("No checks run")
        return

    print(f"\n{Colors.BOLD}Overall:{Colors.ENDC}")
    if total_files > 0:
        print(f"Total files checked: {total_files}")
        print_success(f"Passed: {total_passed}")

    if total_failed > 0 or has_failures:
        if total_failed > 0:
            print_error(f"Failed: {total_failed}")
        print()
        print_header("Failures")
        for failure in all_failures:
            if failure["file"]:
                file_path = Path(failure["file"])
                # Handle both relative and absolute paths
                if file_path.is_absolute():
                    try:
                        file_rel = file_path.relative_to(Path.cwd())
                    except ValueError:
                        file_rel = file_path
                else:
                    file_rel = file_path
                print_error(f"\n[{failure['check']}] {file_rel}")
            else:
                print_error(f"\n[{failure['check']}]")
            print(f"{failure['reason']}")
            if failure.get("output"):
                # Show last 20 lines of output for suite failures
                output_lines = failure["output"].strip().split('\n')
                if len(output_lines) > 20:
                    print(f"\n... (showing last 20 lines) ...")
                    print('\n'.join(output_lines[-20:]))
                else:
                    print(f"\n{failure['output']}")
    else:
        print_success("\nAll checks passed!")


def main():
    """Main check flow."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Run code quality checks on changed files or specified directories"
    )
    parser.add_argument(
        "--all",
        metavar="DIR",
        help="Check all files in the specified directory (e.g., ./frontend/components/aws)"
    )
    parser.add_argument(
        "--base",
        default="HEAD",
        help="Git reference to compare against (default: HEAD)"
    )
    parser.add_argument(
        "--lint",
        action="store_true",
        help="Run frontend linting (next lint + tsc)"
    )
    parser.add_argument(
        "--frontend-tests",
        action="store_true",
        help="Run frontend tests (vitest)"
    )
    parser.add_argument(
        "--backend-tests",
        action="store_true",
        help="Run backend tests (gotestsum)"
    )
    parser.add_argument(
        "--e2e",
        action="store_true",
        help="Run frontend E2E tests (Playwright via `npm run e2e`, which auto-starts a test emulator). Always runs when set; also runs in --run-all when a test emulator is already up."
    )
    parser.add_argument(
        "--agent-tests",
        action="store_true",
        help="Run agent/Python tests (pytest via uv)"
    )
    parser.add_argument(
        "--agent-lint",
        action="store_true",
        help="Run agent/Python linting (ruff via uv)"
    )
    parser.add_argument(
        "--npm-audit",
        action="store_true",
        help="Run npm audit on frontend production dependencies (CI mirror)"
    )
    parser.add_argument(
        "--govulncheck",
        action="store_true",
        help="Run govulncheck on backend Go code (CI mirror)"
    )
    parser.add_argument(
        "--run-all",
        action="store_true",
        help="Run all checks including lint and tests (DEFAULT BEHAVIOR)"
    )
    parser.add_argument(
        "--files-only",
        action="store_true",
        help="Only run file-based checks, skip test/lint suites"
    )
    parser.add_argument(
        "--semantic",
        action="store_true",
        help="Enable AI-powered semantic analysis for color compliance (uses claude CLI with haiku)"
    )

    args = parser.parse_args()

    print_header("Code Quality Checks")

    # Run checks
    results = {}

    # Determine if we should run full suite (default) or just specific checks
    # If no flags specified, default to --run-all behavior
    # If --files-only is specified, skip suite checks
    # If specific flags (--lint, --frontend-tests, --backend-tests, --agent-tests, --agent-lint) are specified, run only those
    no_flags_specified = not any([args.lint, args.frontend_tests, args.backend_tests, args.e2e, args.agent_tests, args.agent_lint, args.run_all, args.files_only, args.npm_audit, args.govulncheck])
    run_all_checks = args.run_all or no_flags_specified

    # Determine which files to check (for file-based checks)
    run_file_checks = args.files_only or run_all_checks or not (args.lint or args.frontend_tests or args.backend_tests or args.e2e)

    files: List[str] = []
    if run_file_checks:
        if args.all:
            print_info(f"Checking all files in: {args.all}")
            files = get_files_in_directory(args.all)
        else:
            print_info(f"Checking files changed since {args.base}")
            files = get_changed_files(args.base)

        if files:
            print_info(f"Found {len(files)} file(s) to process\n")

            # Check 1: data-testid attributes
            results["datatestid"] = check_datatestid(files)

            # Check 2: backend test coverage
            results["backend_tests"] = check_backend_tests(files)

            # Check 3: backend param helper usage
            results["backend_params"] = check_backend_params(files)

            # Check 4: frontend test coverage
            results["frontend_tests_coverage"] = check_frontend_tests_coverage(files)

            # Check 5: raw fetch in services
            results["raw_fetch"] = check_raw_fetch(files)

            # Check 6: Python test coverage for claude-agent
            results["python_tests"] = check_python_tests(files)

            # Check 7: Color palette compliance
            results["color_compliance"] = check_color_compliance(files, semantic=args.semantic)

            # Check 8: Cross-stack determinism (transcendental lint)
            results["transcendental"] = check_transcendental(files)
        elif not (args.lint or args.frontend_tests or args.backend_tests or args.run_all):
            print_warning("No files to check")
            return

    # Suite-based checks
    if args.npm_audit or run_all_checks:
        results["npm_audit"] = run_npm_audit()

    if args.govulncheck or run_all_checks:
        results["govulncheck"] = run_govulncheck()

    if args.lint or run_all_checks:
        results["frontend_lint"] = run_frontend_lint()

    if args.frontend_tests or run_all_checks:
        results["frontend_tests"] = run_frontend_tests()

    if args.backend_tests or run_all_checks:
        results["backend_tests_suite"] = run_backend_tests_suite()

    # Determinism cross-target matrix: runs alongside the native-arch board
    # tests (not an opt-in extra step — openspec cross-stack-determinism).
    # Also triggered in file-based-only runs when the change touches
    # backend/board or fixtures/, which is the surface the matrix pins.
    determinism_trigger = args.backend_tests or run_all_checks or any(
        f.startswith(str(Path.cwd() / "backend" / "board") + os.sep)
        or f.startswith(str(Path.cwd() / "fixtures") + os.sep)
        for f in files
    )
    if determinism_trigger:
        results["determinism_cross_target"] = run_determinism_cross_target()

    # Mirror-map coverage: any change touching either mirror or the fixtures.
    mirror_trigger = run_all_checks or any(
        f.startswith(str(Path.cwd() / "backend" / "board") + os.sep)
        or f.startswith(str(Path.cwd() / "frontend" / "lib" / "hex") + os.sep)
        or f.startswith(str(Path.cwd() / "fixtures") + os.sep)
        for f in files
    )
    if mirror_trigger:
        results["mirror_map"] = run_mirror_map_check()

    # E2E runs in --run-all/default too, but best-effort: it needs the local dev
    # stack and takes minutes, so when the stack is down it's skipped (not failed)
    # unless explicitly requested via --e2e.
    if args.e2e or run_all_checks:
        results["frontend_e2e"] = run_frontend_e2e(required=args.e2e)

    if args.agent_lint or run_all_checks:
        results["agent_lint"] = run_agent_lint()

    if args.agent_tests or run_all_checks:
        results["agent_tests"] = run_agent_tests()

    # Print summary
    print_summary(results)

    # Exit with error code if any checks failed
    # Two result shapes: per-file sections carry counts ({"passed": N, "failed": N})
    # where a zero-file section legitimately has passed == 0; suite sections carry
    # a boolean {"passed": bool}. Only a truthy failed-count or an explicit
    # passed=False (not skipped) is a failure.
    has_failures = any(
        r.get("failed", 0) > 0
        or (isinstance(r.get("passed"), bool) and not r["passed"] and not r.get("skipped", False))
        for r in results.values()
    )
    if has_failures:
        sys.exit(1)


if __name__ == "__main__":
    main()

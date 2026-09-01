#!/usr/bin/env python3
"""Drift guard for two hand-maintained package lists (replace-observation-with-
sightings, tasks.md 7.2 / design.md Decision 25).

THE JOB: check.py's DETERMINISM_GO_PACKAGES and check-transcendental.sh's
RULE_BEARING_GO_PACKAGES must name the exact same set of Go packages. When
they diverge, the shorter list silently stops linting whatever it omits — a
failure with no symptom, which is why the same drift needed rediscovering
three separate times (`polar`, `space`, `disclosure`) before this check
existed. It is the fifth instance of the hand-maintained-list-drift species
catalogued in link 4's task 9.9 inventory. Deriving both lists from one
source remains out of scope; this check is the loud-failure net in the
meantime.

STATE OF THE TREE: green. The three-package drift this check was written
against was fixed in commit 9c00216 — both lists now name board, polar,
space, disclosure, fleet, mine, galaxy, system, corporations and market. The
test therefore passes today and fails only on a future divergence, which is
its whole point. (This docstring previously said "EXPECTED RED TODAY" and
described check.py's tuple as still missing polar/space/disclosure; that has
been false since 9c00216.)

HOW IT RUNS: from check.py, unconditionally, via
run_determinism_lists_check() — not by hand and not behind a changed-file
trigger, because either script can introduce the drift and both live outside
the paths the determinism and mirror triggers watch. It stays dependency-free
(stdlib only, no pytest) so it also runs standalone:

    python3 .claude/skills/code-quality-checks/test_check_determinism_lists.py
"""

import ast
import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CHECK_PY = REPO_ROOT / ".claude" / "skills" / "code-quality-checks" / "check.py"
CHECK_TRANSCENDENTAL_SH = REPO_ROOT / ".claude" / "scripts" / "check-transcendental.sh"


def _extract_check_py_packages() -> tuple[str, ...]:
    """Parses check.py's DETERMINISM_GO_PACKAGES tuple via the AST — not a
    regex over source text — so a reformatted-but-unchanged tuple can never
    produce a false positive."""
    source = CHECK_PY.read_text()
    tree = ast.parse(source, filename=str(CHECK_PY))
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "DETERMINISM_GO_PACKAGES" for t in node.targets
        ):
            value = ast.literal_eval(node.value)
            return tuple(value)
    raise AssertionError(f"DETERMINISM_GO_PACKAGES assignment not found in {CHECK_PY}")


def _extract_transcendental_sh_packages() -> tuple[str, ...]:
    """Parses check-transcendental.sh's RULE_BEARING_GO_PACKAGES bash array
    literal (RULE_BEARING_GO_PACKAGES=(a b c ...)) via a targeted regex — the
    array has no quoting/expansion inside it anywhere in this file, so a
    plain whitespace split is exact, not an approximation."""
    source = CHECK_TRANSCENDENTAL_SH.read_text()
    m = re.search(r"RULE_BEARING_GO_PACKAGES=\(([^)]*)\)", source)
    if not m:
        raise AssertionError(f"RULE_BEARING_GO_PACKAGES array not found in {CHECK_TRANSCENDENTAL_SH}")
    return tuple(m.group(1).split())


class DeterminismPackageListsAgreeTest(unittest.TestCase):
    """Scenario (design.md Decision 25, tasks.md 7.2): check.py's determinism
    scope gate and check-transcendental.sh's own gate must name the same set
    of rule-bearing Go packages, so the next package added to one side can
    never silently go unlinted on the other."""

    def test_determinism_go_package_lists_are_equal(self) -> None:
        check_py_packages = set(_extract_check_py_packages())
        sh_packages = set(_extract_transcendental_sh_packages())

        if check_py_packages == sh_packages:
            return

        only_in_check_py = sorted(check_py_packages - sh_packages)
        only_in_sh = sorted(sh_packages - check_py_packages)
        self.fail(
            "check.py's DETERMINISM_GO_PACKAGES and check-transcendental.sh's "
            "RULE_BEARING_GO_PACKAGES disagree — the transcendental lint silently "
            "unlints whatever the shorter list omits.\n"
            f"  check.py                    (DETERMINISM_GO_PACKAGES): {sorted(check_py_packages)}\n"
            f"  check-transcendental.sh (RULE_BEARING_GO_PACKAGES): {sorted(sh_packages)}\n"
            f"  only in check.py: {only_in_check_py}\n"
            f"  only in check-transcendental.sh: {only_in_sh}"
        )


if __name__ == "__main__":
    unittest.main()

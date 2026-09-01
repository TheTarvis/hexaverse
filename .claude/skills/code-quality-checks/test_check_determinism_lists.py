#!/usr/bin/env python3
"""RED-phase regression net for replace-observation-with-sightings §4,
tasks.md 7.2 (design.md Decision 25): check.py's DETERMINISM_GO_PACKAGES and
check-transcendental.sh's RULE_BEARING_GO_PACKAGES must name the exact same
set of Go packages, or the transcendental lint silently stops covering
whatever check.py's own copy omits. This is the fifth instance of the
hand-maintained-list-drift species (link 4's task 9.9 inventory); the fix in
THIS change is limited to fixing the current three-package drift
(`polar`, `space`, `disclosure`) and adding this test so the class fails
loudly rather than needing rediscovery — deriving the list from one source is
explicitly out of scope for this change.

Dependency-free (stdlib only, no pytest) so it runs anywhere:

    python3 .claude/skills/code-quality-checks/test_check_determinism_lists.py

EXPECTED RED TODAY: check.py's tuple is ("board", "fleet", "mine", "galaxy",
"system", "corporations", "market") — missing "polar", "space", "disclosure",
all three present in check-transcendental.sh's array. This is a genuine
CURRENT DEFECT (design.md: "despite check.py's own comment asserting 'Must
match check-transcendental.sh's own gate'"), not a tautological assertion —
it is expected to still be red immediately after `disclosure` alone is added
without also fixing the pre-existing `polar`/`space` omission, per tasks.md
7.2's own instruction that "a list two-thirds fixed is the same defect with a
smaller number."
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

#!/usr/bin/env python3
"""
Color Compliance Check for the Frontend

Validates that frontend TSX/CSS files follow the color palette documented in
frontend/CLAUDE.md (Color system section). Catches common violations that agents introduce:

1. Hard-coded hex colors in inline styles (should use Tailwind classes)
2. Wrong dark mode background shades (bg-zinc-900 instead of bg-zinc-700)
3. Gray scale usage (should be zinc, not gray/slate/neutral)
4. Missing dark mode variants for color classes
5. Gradients used on non-icon elements

This is a hybrid check: the script catches pattern-based violations,
while semantic violations (e.g., "is this gradient on an icon or a background?")
are flagged as warnings for agent review.

Usage:
    python3 check-color-compliance.py [file1.tsx file2.tsx ...]

    If no files specified, reads file list from stdin (one per line).

    Output: JSON with pass/fail status and violation details.
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional


# ============================================================
# Rule definitions
# ============================================================

# Files/directories exempt from color checks
EXEMPT_PATHS = [
    "components/catalyst/",         # Base UI library - may have intentional overrides
    "components/google-icon.tsx",    # SVG brand colors
    ".stories.",                    # Storybook stories
    ".test.",                       # Test files
    "storybook/",                   # Storybook config
]

# Hard-coded hex colors that are allowed (brand colors, SVG fills, etc.)
ALLOWED_HEX_CONTEXTS = [
    r'fill=',           # SVG fills
    r'stop-color',      # SVG gradients
    r'stroke=',         # SVG strokes
    r'\/\/',            # Comments
    r'\*',              # Block comments
    r'console\.',       # Console logging
    r'chartColors',     # Chart/visualization colors
    r'typeColors',      # Schema type color maps (data visualization)
]

# Forbidden patterns with explanations
RULES = [
    {
        "id": "no-gray-scale",
        "pattern": r'(?:text|bg|border|ring|shadow|from|to|via)-(?:gray|slate|neutral)-\d{2,3}',
        "message": "Use zinc scale instead of gray/slate/neutral. See the color system in frontend/CLAUDE.md",
        "severity": "error",
    },
    {
        "id": "no-dark-zinc-900-bg",
        "pattern": r'dark:bg-zinc-900(?!\/)(?!\d)',
        "message": "Dark mode page background should be zinc-700, not zinc-900. Use dark:bg-zinc-700",
        "severity": "error",
    },
    {
        "id": "no-dark-zinc-800-bg",
        "pattern": r'dark:bg-zinc-800(?!\/)',
        "message": "Dark mode background should be zinc-700 (page) or white/[0.12] (card). zinc-800 is not in the palette. See the color system in frontend/CLAUDE.md",
        "severity": "warning",
    },
    {
        "id": "no-bg-black",
        "pattern": r'(?<!dark:)bg-black(?!\/)(?!\d)',
        "message": "Don't use bg-black. Use zinc-700 for dark backgrounds. See the color system in frontend/CLAUDE.md",
        "severity": "warning",
    },
    {
        "id": "missing-dark-text",
        "pattern": r'(?<!\s)text-zinc-900(?!.*dark:text)',
        "message": "text-zinc-900 without dark mode variant. Add dark:text-white",
        "severity": "warning",
    },
    {
        "id": "missing-dark-bg",
        "pattern": r'(?<!\s)bg-zinc-100(?!.*dark:bg)',
        "message": "bg-zinc-100 without dark mode variant. Add dark:bg-zinc-700",
        "severity": "warning",
    },
    {
        "id": "missing-dark-border",
        "pattern": r'(?<!\s)border-zinc-200(?!.*dark:border)',
        "message": "border-zinc-200 without dark mode variant. Add dark:border-zinc-800/50",
        "severity": "warning",
    },
]

# Hard-coded hex color detection
HEX_COLOR_PATTERN = re.compile(
    r"""
    (?:color|background|border-color|fill|stroke)\s*:\s*    # CSS property
    ['"]?\#[0-9a-fA-F]{3,8}['"]?                           # Hex color value
    """,
    re.VERBOSE,
)

# Inline style hex colors (JSX style objects)
INLINE_STYLE_HEX = re.compile(
    r"""
    (?:color|backgroundColor|borderColor)\s*:\s*            # JS style property
    ['"]?\#[0-9a-fA-F]{3,8}['"]?                           # Hex color value
    """,
    re.VERBOSE,
)

# Style tag hex colors
STYLE_TAG_HEX = re.compile(r'color:\s*#[0-9a-fA-F]{3,8}')


def is_exempt(file_path: str) -> bool:
    """Check if a file is exempt from color checks."""
    for exempt in EXEMPT_PATHS:
        if exempt in file_path:
            return True
    return False


def is_allowed_hex_context(line: str) -> bool:
    """Check if a hex color usage is in an allowed context."""
    for ctx in ALLOWED_HEX_CONTEXTS:
        if re.search(ctx, line):
            return True
    return False


def check_class_string(line: str, line_num: int, violations: list):
    """Check a line for Tailwind class violations."""
    for rule in RULES:
        matches = re.finditer(rule["pattern"], line)
        for match in matches:
            # For missing-dark-* rules, check the full className string
            # These need to look at the whole class attribute, not just the line
            if rule["id"].startswith("missing-dark-"):
                # Simple heuristic: check if dark: variant exists on same line
                # This catches most cases since className is usually on one line
                variant_prefix = "dark:" + match.group(0).split("-")[0]  # e.g., dark:text or dark:bg
                if variant_prefix in line:
                    continue

            violations.append({
                "line": line_num,
                "rule": rule["id"],
                "severity": rule["severity"],
                "match": match.group(0),
                "message": rule["message"],
            })


def check_hex_colors(line: str, line_num: int, violations: list, in_style_tag: bool):
    """Check for hard-coded hex colors."""
    if is_allowed_hex_context(line):
        return

    patterns = [STYLE_TAG_HEX] if in_style_tag else [INLINE_STYLE_HEX]

    for pattern in patterns:
        matches = pattern.finditer(line)
        for match in matches:
            violations.append({
                "line": line_num,
                "rule": "no-hardcoded-hex",
                "severity": "warning",
                "match": match.group(0),
                "message": "Hard-coded hex color. Use Tailwind classes or CSS variables for dark mode support",
            })


def check_file(file_path: str) -> Optional[dict]:
    """Check a single file for color compliance violations."""
    if is_exempt(file_path):
        return None

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except Exception:
        return None

    violations = []
    in_style_tag = False

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Track style tag context
        if '<style' in stripped or '{`' in stripped:
            in_style_tag = True
        if '</style' in stripped or '`}' in stripped:
            in_style_tag = False

        # Skip comments
        if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
            continue

        # Check Tailwind classes
        check_class_string(line, i, violations)

        # Check hex colors in style tags and inline styles
        if in_style_tag or 'style=' in line or 'Style' in line:
            check_hex_colors(line, i, violations, in_style_tag)

    if not violations:
        return {"file": file_path, "passed": True}

    errors = [v for v in violations if v["severity"] == "error"]
    warnings = [v for v in violations if v["severity"] == "warning"]

    return {
        "file": file_path,
        "passed": len(errors) == 0,
        "errors": len(errors),
        "warnings": len(warnings),
        "violations": violations,
    }


COLOR_PALETTE_RULES = """
# Color Palette Rules (from the Color system section in frontend/CLAUDE.md)

## Backgrounds
- Page backgrounds: bg-zinc-100 dark:bg-zinc-700 (NEVER zinc-900 for dark page bg)
- Card/panel backgrounds: bg-zinc-50 dark:bg-white/[0.12]
- Hover states: hover:bg-zinc-200 dark:hover:bg-white/[0.14]

## Text
- Primary: text-zinc-900 dark:text-white
- Secondary/body: text-zinc-600 dark:text-zinc-400
- Description/help: text-zinc-500 dark:text-zinc-300
- Muted: text-zinc-500 dark:text-zinc-400

## Borders
- Default: border-zinc-200 dark:border-zinc-800/50

## Critical Rules
1. Gradients are for ICONS ONLY (small h-8 w-8 or h-10 w-10 containers) — never for backgrounds or large surfaces
2. Use zinc scale only — never gray, slate, or neutral
3. Every color class needs a dark: variant
4. No hard-coded hex colors (they can't respond to dark mode)
5. Monochromatic gradients for domain entities (from-cyan-600 to-cyan-500, not from-cyan-500 to-blue-500)
"""

SEMANTIC_CHECK_PROMPT = """You are a color compliance reviewer for a React/Tailwind frontend.

Review this TSX file for violations of the color palette rules below. Focus ONLY on issues that require understanding the component structure — things a regex can't catch:

1. **Gradient on non-icon elements**: bg-gradient-to-* should only be on small icon containers (h-6/h-8/h-10/h-12 w-6/w-8/w-10/w-12 rounded-lg). If a gradient is on a larger element, section, card, or background, flag it.
2. **Color contrast issues**: Dark text on dark backgrounds, or light text on light backgrounds where the pairing would be hard to read.
3. **Mixed color scales**: Using gray-* alongside zinc-* in the same component.

{rules}

Respond with ONLY a JSON array of violations. Each violation:
{{"line": <number>, "rule": "<rule-id>", "severity": "warning", "match": "<brief code snippet>", "message": "<explanation>"}}

Rule IDs: gradient-on-non-icon, contrast-issue, mixed-color-scales

If no violations found, respond with: []

IMPORTANT: Only flag clear violations. Do not flag:
- SVG fills or brand colors
- Chart/visualization colors
- Tailwind class strings in variables/constants (these are applied to icons elsewhere)
- Anything in comments

File contents:
```tsx
{file_content}
```"""


def run_semantic_check(file_content: str) -> list:
    """Run Claude agent to check for semantic color violations."""
    prompt = SEMANTIC_CHECK_PROMPT.format(
        rules=COLOR_PALETTE_RULES,
        file_content=file_content,
    )

    try:
        result = subprocess.run(
            [
                "claude",
                "--print",
                "--model", "haiku",
                "--output-format", "text",
                "--bare",
                "--no-session-persistence",
                "--max-budget-usd", "0.01",
                "-p", prompt,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            return []

        output = result.stdout.strip()

        # Extract JSON array from response (may have markdown fences)
        if "```" in output:
            # Strip markdown code fences
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', output, re.DOTALL)
            if match:
                output = match.group(1).strip()

        if not output or output == "[]":
            return []

        violations = json.loads(output)
        if isinstance(violations, list):
            return violations
        return []

    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        return []


def format_violation(v: dict) -> str:
    """Format a single violation for display."""
    icon = "✗" if v["severity"] == "error" else "⚠"
    return f"  {icon} Line {v['line']}: [{v['rule']}] {v['match']}\n    {v['message']}"


def main():
    """Main entry point."""
    # Check for --semantic flag
    run_semantic = "--semantic" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    # Get files from args or stdin
    if args:
        files = args
    else:
        input_data = sys.stdin.read().strip()
        if not input_data:
            print(json.dumps({"passed": True, "total": 0}))
            return
        files = [f.strip() for f in input_data.split('\n') if f.strip()]

    project_root = Path.cwd()
    results = []
    total_errors = 0
    total_warnings = 0

    for file_path in files:
        if not file_path.endswith(('.tsx', '.ts')):
            continue
        if not Path(file_path).exists():
            continue

        result = check_file(file_path)
        if result is None:
            continue

        # Run semantic check (agent-based) for TSX files with JSX
        if run_semantic and file_path.endswith('.tsx'):
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                # Only run semantic check on files with actual JSX and color classes
                has_color_classes = any(kw in content for kw in ['gradient', 'bg-', 'text-zinc', 'dark:'])
                if has_color_classes and len(content) < 15000:  # Skip very large files
                    print(f"  Running semantic check on {Path(file_path).name}...", file=sys.stderr)
                    semantic_violations = run_semantic_check(content)
                    if semantic_violations:
                        existing = result.get("violations", [])
                        existing.extend(semantic_violations)
                        result["violations"] = existing
                        result["warnings"] = result.get("warnings", 0) + len(semantic_violations)
                        # Semantic violations are always warnings, never errors
                        result["semantic_warnings"] = len(semantic_violations)
            except Exception:
                pass  # Don't let semantic check failures block the script

        results.append(result)
        if not result["passed"]:
            total_errors += result.get("errors", 0)
        total_warnings += result.get("warnings", 0)

    # Output JSON for integration with check.py
    output = {
        "passed": total_errors == 0,
        "total_files": len(results),
        "total_errors": total_errors,
        "total_warnings": total_warnings,
        "semantic": run_semantic,
        "files": results,
    }

    print(json.dumps(output, indent=2))

    # Also print human-readable summary to stderr
    if total_errors > 0 or total_warnings > 0:
        for result in results:
            if result.get("violations"):
                rel_path = str(Path(result["file"]).relative_to(project_root)) if Path(result["file"]).is_absolute() else result["file"]
                print(f"\n{rel_path}:", file=sys.stderr)
                for v in result["violations"]:
                    print(format_violation(v), file=sys.stderr)

    sys.exit(1 if total_errors > 0 else 0)


if __name__ == "__main__":
    main()

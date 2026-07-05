#!/usr/bin/env python3
"""Allocate the next spec number, stamp the template, and update the index.

Deterministic part of the /spec flow: the script creates the file and wires
it into docs/specs/README.md. The agent then interviews the user to fill in
the body (Problem / Goals / Non-goals / etc.) — that part needs judgment.

Usage:
    python3 .claude/skills/spec/new_spec.py <slug> ["Human Title"] [--created YYYY-MM-DD]

  slug          kebab-case feature slug, e.g. galaxy-generation
  "Human Title" optional display title; defaults to Title-Cased slug
  --created     ISO date for the frontmatter; defaults to today

Refuses to clobber an existing file. Prints the new path and next steps.
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SPECS_DIR = REPO_ROOT / "docs" / "specs"
TEMPLATE = SPECS_DIR / "TEMPLATE.md"
INDEX = SPECS_DIR / "README.md"
INDEX_MARKER = "<!-- specs:index"

NUM_RE = re.compile(r"^(\d{4})-.*\.md$")


def next_number() -> int:
    highest = 0
    for p in SPECS_DIR.glob("[0-9][0-9][0-9][0-9]-*.md"):
        m = NUM_RE.match(p.name)
        if m:
            highest = max(highest, int(m.group(1)))
    return highest + 1


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "spec"


def titleize(slug: str) -> str:
    return " ".join(w.capitalize() for w in slug.split("-"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("title", nargs="?", default=None)
    ap.add_argument("--created", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not TEMPLATE.exists():
        print(f"error: template not found at {TEMPLATE}", file=sys.stderr)
        return 1

    slug = slugify(args.slug)
    title = args.title or titleize(slug)
    created = args.created or datetime.date.today().isoformat()
    num = next_number()
    num_str = f"{num:04d}"

    out = SPECS_DIR / f"{num_str}-{slug}.md"
    if out.exists() and not args.force:
        print(f"error: {out} already exists (pass --force to overwrite)",
              file=sys.stderr)
        return 1

    body = TEMPLATE.read_text()
    body = body.replace("number: NNNN", f"number: {num_str}")
    body = body.replace("title: <Feature name>", f"title: {title}")
    body = body.replace("created: YYYY-MM-DD", f"created: {created}")
    body = body.replace("# NNNN — <Feature name>", f"# {num_str} — {title}")
    out.write_text(body)

    # Wire into the index table, right after the marker's table header.
    if INDEX.exists():
        lines = INDEX.read_text().splitlines(keepends=True)
        row = f"| {num_str} | [{title}]({out.name}) | draft |\n"
        inserted = False
        for i, line in enumerate(lines):
            if line.lstrip().startswith("|---") and any(
                INDEX_MARKER in lines[j] for j in range(max(0, i - 3), i)
            ):
                # after the |# | Spec | Status| header separator? insert below
                lines.insert(i + 1, row)
                inserted = True
                break
        if not inserted:
            lines.append(row)
        INDEX.write_text("".join(lines))
        index_note = f"added to {INDEX.relative_to(REPO_ROOT)}"
    else:
        index_note = f"(no index at {INDEX} — skipped)"

    rel = out.relative_to(REPO_ROOT)
    print(f"Created spec {num_str}: {rel}")
    print(f"Index: {index_note}")
    print()
    print("Next: interview the user and fill in the body sections")
    print("  (Problem / Goals / Non-goals / Approach / Acceptance criteria).")
    print("Leave status: draft until they've agreed it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

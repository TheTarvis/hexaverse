#!/usr/bin/env python3
"""Scaffold a new CRUD domain by rendering the in-skill templates.

Reads `.tmpl` files from `harness/skills/new-domain/templates/`, substitutes
`{{singular}}`, `{{Singular}}`, `{{plural}}`, `{{Plural}}` placeholders, and
writes the new files to their backend/frontend destinations.

Wiring (router.go, common/pubsub.go, query-keys.ts, services/index.ts) is
not auto-applied — the script prints the snippets for the agent to apply
with the Edit tool.

Usage:
    python3 new_domain.py <singular> [plural] [--force]

Examples:
    python3 new_domain.py widget              # widget / widgets
    python3 new_domain.py story stories       # irregular plural
    python3 new_domain.py post --force        # overwrite existing
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Built at runtime: bootstrap/init.sh seds "{{" "PROJECT_SLUG" "}}" across
# the repo, so a literal here would be rewritten to the project slug and
# these instructions would stop telling the reader what to substitute.
SLUG_TOKEN = "{{" "PROJECT_SLUG" "}}"

# harness/skills/new-domain/new_domain.py → repo root is parents[3].
SKILL_DIR = Path(__file__).resolve().parent
REPO_ROOT = SKILL_DIR.parents[2]
TEMPLATES = SKILL_DIR / "templates"

# Template path → destination path. {singular}/{plural} get formatted in.
# Backend templates live under templates/backend/ and land in backend/<plural>/.
# Frontend templates have explicit per-file destinations.
BACKEND_TEMPLATES = [
    "model.go.tmpl",
    "dao.go.tmpl",
    "dao_mock.go.tmpl",
    "service.go.tmpl",
    "service_test.go.tmpl",
    "handler.go.tmpl",
]

FRONTEND_TEMPLATES = [
    ("frontend/types.ts.tmpl", "frontend/lib/types/{singular}.ts"),
    ("frontend/service.ts.tmpl", "frontend/lib/services/{singular}-service.ts"),
    ("frontend/hook.ts.tmpl", "frontend/hooks/use-{plural}.ts"),
    ("frontend/page.tsx.tmpl", "frontend/app/{plural}/page.tsx"),
]


class Names:
    """Naming variants derived from the singular noun."""

    def __init__(self, singular: str, plural: str | None):
        if not re.fullmatch(r"[a-z][a-z0-9]*", singular):
            raise ValueError(
                f"Domain name must be lowercase alphanumeric, starts with a letter; got {singular!r}."
            )
        self.singular = singular
        self.plural = plural or _default_plural(singular)
        if not re.fullmatch(r"[a-z][a-z0-9]*", self.plural):
            raise ValueError(f"Plural must match the same pattern; got {self.plural!r}.")
        self.Singular = singular[0].upper() + singular[1:]
        self.Plural = self.plural[0].upper() + self.plural[1:]


def _default_plural(singular: str) -> str:
    # Cover the common English suffix cases. User can override with explicit plural.
    if singular.endswith(("s", "x", "z", "ch", "sh")):
        return singular + "es"
    if len(singular) >= 2 and singular.endswith("y") and singular[-2] not in "aeiou":
        return singular[:-1] + "ies"
    return singular + "s"


def render(template_text: str, n: Names) -> str:
    """Substitute {{singular}}, {{Singular}}, {{plural}}, {{Plural}}.

    Order matters: {{Plural}} before {{plural}} (case-insensitive prefix match
    isn't a concern since these are exact-string replacements, but ordering by
    length keeps the intent clear). Other placeholders like Hexaverse
    are left untouched — bootstrap/init.sh substitutes those.
    """
    return (
        template_text
        .replace("{{Singular}}", n.Singular)
        .replace("{{Plural}}", n.Plural)
        .replace("{{singular}}", n.singular)
        .replace("{{plural}}", n.plural)
    )


def write_if_safe(dest: Path, content: str, force: bool) -> bool:
    if dest.exists() and not force:
        print(f"  ✗ {dest.relative_to(REPO_ROOT)} already exists (use --force to overwrite)")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content)
    print(f"  ✓ {dest.relative_to(REPO_ROOT)}")
    return True


def scaffold_backend(n: Names, force: bool) -> int:
    print(f"\nBackend → backend/{n.plural}/")
    dest_dir = REPO_ROOT / "backend" / n.plural
    written = 0
    for filename in BACKEND_TEMPLATES:
        src = TEMPLATES / "backend" / filename
        if not src.exists():
            print(f"  ! template missing: {src.relative_to(REPO_ROOT)}", file=sys.stderr)
            continue
        # Strip the .tmpl suffix for the destination.
        dest_name = filename.removesuffix(".tmpl")
        if write_if_safe(dest_dir / dest_name, render(src.read_text(), n), force):
            written += 1
    return written


def scaffold_frontend(n: Names, force: bool) -> int:
    print("\nFrontend")
    written = 0
    for src_rel, dest_template in FRONTEND_TEMPLATES:
        src = TEMPLATES / src_rel.removeprefix("frontend/")
        # The list above starts paths with "frontend/" for clarity but the
        # actual templates live at templates/frontend/<file>.tmpl.
        src = TEMPLATES / "frontend" / Path(src_rel).name
        if not src.exists():
            print(f"  ! template missing: {src.relative_to(REPO_ROOT)}", file=sys.stderr)
            continue
        dest_rel = dest_template.format(singular=n.singular, plural=n.plural)
        dest = REPO_ROOT / dest_rel
        if write_if_safe(dest, render(src.read_text(), n), force):
            written += 1
    return written


def print_wiring(n: Names) -> None:
    print(
        f"""
─── Wiring (apply these manually) ─────────────────────────────────────

1) backend/router.go
   Add to imports:
       "{SLUG_TOKEN}/{n.plural}"
   Add after the existing account handler registration:
       {n.plural}Handler := {n.plural}.NewHandler()
       {n.plural}Handler.RegisterRoutes(authorized)
   (replace {SLUG_TOKEN} with the actual module slug if
   bootstrap/init.sh has already substituted it.)

2) backend/common/pubsub.go
   Add an event-type const block:
       const (
           {n.Singular}Created = "{n.singular[0]}.c"
           {n.Singular}Updated = "{n.singular[0]}.u"
           {n.Singular}Deleted = "{n.singular[0]}.d"
       )
   And a topics const block:
       const (
           Topic{n.Singular}Events = "{n.singular}-events"
       )
   ⚠ If the abbreviation prefix collides with another domain's
   (e.g. another domain already uses "{n.singular[0]}.c"), pick a unique
   two-letter abbreviation and tell the user.

3) frontend/lib/query-keys.ts
   Add a block to the queryKeys factory:
       {n.plural}: {{
         all: ['{n.plural}'] as const,
         lists: () => [...queryKeys.{n.plural}.all, 'list'] as const,
         list: (filters?: Record<string, unknown>) => [...queryKeys.{n.plural}.lists(), filters] as const,
         details: () => [...queryKeys.{n.plural}.all, 'detail'] as const,
         detail: (id: string) => [...queryKeys.{n.plural}.details(), id] as const,
       }},
   And add the matching union type:
       export type {n.Singular}QueryKey =
         | typeof queryKeys.{n.plural}.all
         | ReturnType<typeof queryKeys.{n.plural}.lists>
         | ReturnType<typeof queryKeys.{n.plural}.list>
         | ReturnType<typeof queryKeys.{n.plural}.details>
         | ReturnType<typeof queryKeys.{n.plural}.detail>

4) frontend/lib/services/index.ts
   Add:
       export {{ {n.singular}Service }} from './{n.singular}-service'
       export {{ default as {n.Singular}Service }} from './{n.singular}-service'

─── Verify ────────────────────────────────────────────────────────────

   cd backend && go build ./... && go test -short ./{n.plural}/...
   cd frontend && npx tsc --noEmit && npx vitest run

If you change the DAO interface later, regenerate the mock:
   cd backend && go generate ./{n.plural}/...
"""
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold a new domain from in-skill templates.")
    parser.add_argument("singular", help="Singular domain name, lowercase (e.g. widget)")
    parser.add_argument("plural", nargs="?", default=None, help="Optional explicit plural")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    if not TEMPLATES.exists():
        print(f"error: templates dir missing: {TEMPLATES}", file=sys.stderr)
        return 2

    try:
        n = Names(args.singular, args.plural)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    print(f"Scaffolding domain: {n.singular} / {n.plural} (types {n.Singular} / {n.Plural})")

    backend_written = scaffold_backend(n, args.force)
    frontend_written = scaffold_frontend(n, args.force)

    if backend_written == 0 and frontend_written == 0:
        print("\nNothing written. Re-run with --force to overwrite existing files.")
        return 1

    # gofmt the generated Go files so map/struct padding matches the new
    # identifier widths. Silent if gofmt isn't on PATH.
    if backend_written > 0 and shutil.which("gofmt"):
        subprocess.run(
            ["gofmt", "-w", str(REPO_ROOT / "backend" / n.plural)],
            check=False,
        )

    print_wiring(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())

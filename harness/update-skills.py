#!/usr/bin/env python3
"""Import Matt Pocock's published skills verbatim; record and verify provenance."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = "https://github.com/mattpocock/skills.git"
LOCAL_SKILLS = {"spinup"}


def inventory(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Unexpected symlink: {path}")
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    return result


def verify(root):
    lock = json.loads((root / "harness/skills-lock.json").read_text())
    actual = inventory(root / "harness/skills")
    actual = {
        name: digest for name, digest in actual.items()
        if name.split("/", 1)[0] not in LOCAL_SKILLS
    }
    expected = lock["files"]
    changed = sorted(
        name for name in actual.keys() | expected.keys()
        if actual.get(name) != expected.get(name)
    )
    if changed:
        raise ValueError("Skills differ from the imported version:\n" + "\n".join(changed))
    return lock


def stage(source, destination):
    manifest = json.loads((source / ".claude-plugin/plugin.json").read_text())
    paths = manifest["skills"]
    if not paths:
        raise ValueError("Upstream published no skills")
    names = set()
    for relative in paths:
        relative = relative.removeprefix("./")
        parts = Path(relative).parts
        if (len(parts) != 3 or parts[0] != "skills"
                or any(not re.fullmatch(r"[a-z0-9-]+", part) for part in parts[1:])
                or parts[2] in names):
            raise ValueError(f"Unsupported upstream skill path: {relative}")
        skill = source / relative
        if skill.is_symlink() or not (skill / "SKILL.md").is_file():
            raise ValueError(f"Not a skill directory: {relative}")
        inventory(skill)  # Reject symlinks before copying.
        shutil.copytree(skill, destination / parts[2])
        names.add(parts[2])
    shutil.copy2(source / "LICENSE", destination / "LICENSE")
    return paths, manifest["version"]


def update(root, ref, source=UPSTREAM):
    verify(root)  # Never overwrite locally edited or unknown files.
    if not ref or ref.startswith("-"):
        raise ValueError("Expected a branch, tag, or commit")
    harness = root / "harness"
    with tempfile.TemporaryDirectory(prefix="volt-skills-") as download:
        checkout = Path(download)
        for command in (
            ["git", "init", "-q", str(checkout)],
            ["git", "-C", str(checkout), "fetch", "-q", "--depth", "1", source, ref],
            ["git", "-C", str(checkout), "checkout", "-q", "--detach", "FETCH_HEAD"],
        ):
            subprocess.run(command, check=True)
        revision = subprocess.check_output(
            ["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True
        ).strip()
        # Stage on the same filesystem. A failed fetch/import leaves Volt untouched.
        with tempfile.TemporaryDirectory(prefix=".skills-update-", dir=harness) as temp:
            work = Path(temp)
            staged = work / "skills"
            staged.mkdir()
            paths, version = stage(checkout, staged)
            lock = {
                "source": UPSTREAM,
                "revision": revision,
                "version": version,
                "skills": paths,
                "files": inventory(staged),
            }
            staged_lock = work / "skills-lock.json"
            staged_lock.write_text(json.dumps(lock, indent=2) + "\n")
            verify(root)  # Check again after the network operation.
            current = harness / "skills"
            for name in sorted(LOCAL_SKILLS):
                if (staged / name).exists():
                    raise ValueError(f"Upstream skill conflicts with local skill: {name}")
                if (current / name).exists():
                    shutil.copytree(current / name, staged / name)
            backup = work / "previous"
            current.rename(backup)
            try:
                staged.rename(current)
                staged_lock.replace(harness / "skills-lock.json")
            except BaseException:
                if current.exists():
                    shutil.rmtree(current)
                backup.rename(current)
                raise
    return lock


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "update"))
    parser.add_argument("--ref", default="main", help="Update to this upstream branch, tag, or SHA")
    args = parser.parse_args()
    try:
        lock = verify(ROOT) if args.command == "check" else update(ROOT, args.ref)
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")
    print(f"{len(lock['skills'])} unmodified skills; upstream {lock['version']} ({lock['revision']})")
    if args.command == "update":
        print("Review git diff -- harness/skills harness/skills-lock.json before committing.")


if __name__ == "__main__":
    main()

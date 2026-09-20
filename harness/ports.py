#!/usr/bin/env python3
"""
ports.py — per-project port lane allocation for Volt and its forks.

THE PROBLEM THIS SOLVES
-----------------------
Every Volt fork needs ~20 local ports (frontend, backend, agent, storybook, two
Firebase emulator sets, the e2e stack). Before this, each fork inherited the
skeleton's literal port numbers and you renumbered by hand — Volt/Flywheel/Roma/
Busbar all ended up on the same ports, hexaverse got a hand-rolled +10 offset,
Chartz a +40. Hand-offsetting cannot work: the skeleton shipped the agent on
:8080, the same port as the dev Firestore emulator, and the e2e frontend on
:3100 == 3000 + 100, so offsets self-collide once you have ten forks.

THE SCHEME
----------
Each project owns one contiguous LANE of 100 ports. Every port is
`PORT_BASE + <fixed offset>`, and the offset table below is identical in every
fork — so "what port is hexaverse's test auth emulator" is arithmetic, not
archaeology. Lanes live in 20000-29999: above the privileged/registered noise,
far below the macOS ephemeral range (net.inet.ip.portrange.first = 49152).

PORT_BASE is read from `ports.env` at the repo root (committed, one line).
Everything else is generated — `ports.py render` rewrites the machine-read
files (.ports.env, .ports.json, firebase*.json, the .env files) so re-laning a
project is one command, not twenty edits.

A machine-global registry at ~/.config/volt/ports.tsv records which lane each
checkout owns, so `ports.py claim` hands a new fork the next free lane and
`ports.py check` can name the squatter when a port is already held.

USAGE
-----
  ports.py show                  resolved port table for this repo
  ports.py env                   shell-sourceable exports (what .ports.env holds)
  ports.py get <name>            one port number, for scripts
  ports.py render                regenerate every port-bearing file
  ports.py wire                  swap this lane's literals in dev scripts for $PORT_*
  ports.py check [--dev|--test|--only a,b]   fail if those lane ports are held
  ports.py registry              list every known lane on this machine
  ports.py claim [--base N]      claim a lane for this checkout and render
  ports.py migrate --map old:new[,...] [--only paths] [--exclude paths]
                                 one-time textual renumber sweep
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

LANE_SIZE = 100
LANE_BAND = (20000, 29999)

# ---------------------------------------------------------------------------
# The offset table. THIS IS THE CONTRACT — identical in every fork.
# Keep the gaps: 4-9, 18-29, 33-39, 48-49 and 60-99 are deliberate headroom, so
# a project that grows a new service never has to re-lane.
# ---------------------------------------------------------------------------
OFFSETS: dict[str, int] = {
    # --- dev stack (0-9) ---
    "frontend": 0,
    "backend": 1,
    "agent": 2,
    "storybook": 3,
    # --- dev Firebase emulators (10-19) ---
    "emu_ui": 10,
    "emu_auth": 11,
    "emu_firestore": 12,
    "emu_firestore_ws": 13,
    "emu_pubsub": 14,
    "emu_storage": 15,
    "emu_hub": 16,
    "emu_logging": 17,
    # --- test/e2e services (30-39) ---
    "test_frontend": 30,   # Playwright boots its own Next server here
    "test_backend": 31,    # ENV=test backend for the Go integration suite
    "e2e_backend": 32,     # ENV=test backend Playwright globalSetup owns
    # --- isolated test Firebase emulators (40-49) ---
    "test_emu_ui": 40,
    "test_emu_auth": 41,
    "test_emu_firestore": 42,
    "test_emu_firestore_ws": 43,
    "test_emu_pubsub": 44,
    "test_emu_storage": 45,
    "test_emu_hub": 46,
    "test_emu_logging": 47,
    # --- datastores (50-59) ---
    "postgres": 50,
    "postgres_alt": 51,
    "minio": 52,
    "minio_console": 53,
    "redis": 54,
    "dynamodb": 55,
    "dynamodb_admin": 56,
}

# Ports a full `/spinup` is expected to own, in start order. Used by `check`.
DEV_PORTS = ["frontend", "backend", "agent", "emu_ui", "emu_auth",
             "emu_firestore", "emu_pubsub", "emu_hub", "emu_logging"]
TEST_PORTS = ["test_emu_firestore", "test_emu_auth", "test_emu_pubsub",
              "test_emu_hub", "test_emu_logging", "test_emu_storage"]

REGISTRY = Path(os.environ.get("VOLT_PORT_REGISTRY",
                               Path.home() / ".config" / "volt" / "ports.tsv"))


# ---------------------------------------------------------------------------
# repo + base resolution
# ---------------------------------------------------------------------------
def repo_root() -> Path:
    """Repo root = the directory holding ports.env, walking up from this file."""
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / "ports.env").exists():
            return parent
    # harness/ is a real directory at the repo root; fall back to its parent.
    return here.parent.parent


def read_config(root: Path) -> tuple[int, dict[str, int]]:
    """PORT_BASE plus any project-local offsets from ports.env.

    A fork with a service the skeleton doesn't have declares it in its own
    ports.env rather than editing the shared table:

        PORT_OFFSET_FRED_FIXTURE=60

    which puts it at PORT_BASE + 60, inside this project's lane and therefore
    inside everything that kills, probes or renders the lane. Use the 60-99
    band — the lower offsets are the skeleton's contract.
    """
    cfg = root / "ports.env"
    if not cfg.exists():
        die(f"no ports.env at {cfg} — run `ports.py claim` to allocate a lane")
    base, extra = None, {}
    for line in cfg.read_text().splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, raw = (s.strip().strip('"\'') for s in line.split("=", 1))
        if key == "PORT_BASE":
            if not raw.isdigit():
                die(f"PORT_BASE in {cfg} is not a number: {raw!r}")
            base = int(raw)
        elif key.startswith("PORT_OFFSET_"):
            name = key[len("PORT_OFFSET_"):].lower()
            if not raw.isdigit() or not (0 <= int(raw) < LANE_SIZE):
                die(f"{key} in {cfg} must be 0-{LANE_SIZE - 1}, got {raw!r}")
            if name in OFFSETS:
                die(f"{key} in {cfg} collides with the shared offset table")
            clash = next((n for n, o in {**OFFSETS, **extra}.items()
                          if o == int(raw)), None)
            if clash:
                die(f"{key}={raw} in {cfg} collides with {clash}")
            extra[name] = int(raw)
    if base is None:
        die(f"{cfg} has no PORT_BASE= line")
    return base, extra


def read_base(root: Path) -> int:
    return read_config(root)[0]


def resolve(base: int, extra: dict[str, int] | None = None) -> dict[str, int]:
    return {name: base + off
            for name, off in {**OFFSETS, **(extra or {})}.items()}


def project_name(root: Path) -> str:
    return root.name


def backend_dir(root: Path) -> Path | None:
    """Where the Go service lives.

    The skeleton puts it at backend/, but older forks nest it (Flywheel:
    backend/main/). Find it by its Makefile or env examples rather than
    assuming, so one code path serves every fork.
    """
    base = root / "backend"
    if not base.is_dir():
        return None
    for cand in (base, *sorted(d for d in base.iterdir() if d.is_dir())):
        if (cand / "Makefile").exists() or (cand / ".env.local.example").exists():
            return cand
    return base


def die(msg: str) -> "None":
    print(f"ports.py: {msg}", file=sys.stderr)
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# registry (~/.config/volt/ports.tsv)
# ---------------------------------------------------------------------------
def registry_read() -> list[dict[str, str]]:
    if not REGISTRY.exists():
        return []
    rows = []
    for line in REGISTRY.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        rows.append({"base": parts[0], "project": parts[1], "path": parts[2]})
    return rows


def registry_write(rows: list[dict[str, str]]) -> None:
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    out = ["# Volt port-lane registry. One 100-port lane per checkout.",
           "# base\tproject\tpath",
           "#"]
    for r in sorted(rows, key=lambda r: int(r["base"])):
        out.append(f"{r['base']}\t{r['project']}\t{r['path']}")
    REGISTRY.write_text("\n".join(out) + "\n")


def registry_claim(root: Path, base: int | None) -> int:
    rows = registry_read()
    path = str(root)
    mine = next((r for r in rows if r["path"] == path), None)

    if base is None:
        if mine:
            return int(mine["base"])
        taken = {int(r["base"]) for r in rows}
        base = LANE_BAND[0]
        while base in taken:
            base += LANE_SIZE
        if base > LANE_BAND[1]:
            die(f"no free lane left in {LANE_BAND[0]}-{LANE_BAND[1]}")

    if base % LANE_SIZE:
        die(f"base {base} is not a multiple of {LANE_SIZE}")
    if not (LANE_BAND[0] <= base <= LANE_BAND[1]):
        die(f"base {base} is outside the {LANE_BAND[0]}-{LANE_BAND[1]} band")
    clash = next((r for r in rows
                  if int(r["base"]) == base and r["path"] != path), None)
    if clash:
        die(f"lane {base} already belongs to {clash['project']} ({clash['path']})")

    rows = [r for r in rows if r["path"] != path]
    rows.append({"base": str(base), "project": project_name(root), "path": path})
    registry_write(rows)
    return base


def registry_owner(port: int) -> str | None:
    """Which registered lane contains `port`."""
    for r in registry_read():
        b = int(r["base"])
        if b <= port < b + LANE_SIZE:
            off = port - b
            name = next((n for n, o in OFFSETS.items() if o == off), f"+{off}")
            if name == f"+{off}" and r["path"] == str(Path.cwd()):
                name = next((n for n, o in read_config(Path(r["path"]))[1].items()
                             if o == off), name)
            return f"{r['project']} {name}"
    return None


# ---------------------------------------------------------------------------
# render
# ---------------------------------------------------------------------------
def write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text() == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return True


def render_ports_env(root: Path, ports: dict[str, int], base: int) -> bool:
    lines = [
        "# GENERATED by harness/ports.py render — do not edit.",
        "# Source of truth: ports.env (PORT_BASE) + the offset table in harness/ports.py.",
        f"PORT_BASE={base}",
    ]
    for name, port in ports.items():
        lines.append(f"PORT_{name.upper()}={port}")
    return write_if_changed(root / ".ports.env", "\n".join(lines) + "\n")


def render_ports_json(root: Path, ports: dict[str, int], base: int) -> bool:
    doc = {"_generated": "harness/ports.py render — do not edit",
           "base": base, "ports": ports}
    return write_if_changed(root / ".ports.json",
                            json.dumps(doc, indent=2) + "\n")


def render_firebase_json(root: Path, ports: dict[str, int]) -> bool:
    """Rewrite emulator ports in firebase.json, preserving everything else."""
    path = root / "firebase.json"
    if not path.exists():
        return False
    doc = json.loads(path.read_text())
    emu = doc.setdefault("emulators", {})
    mapping = {
        "ui": ("emu_ui", True),
        "auth": ("emu_auth", False),
        "firestore": ("emu_firestore", False),
        "pubsub": ("emu_pubsub", False),
        "storage": ("emu_storage", False),
        "hub": ("emu_hub", False),
        "logging": ("emu_logging", False),
    }
    for key, (name, _) in mapping.items():
        # Only touch emulators this project actually declares (Chartz has no
        # firestore emulator, for instance) — except ui/hub/logging, which the
        # CLI always binds and which therefore always need an explicit port.
        if key in emu:
            emu[key]["port"] = ports[name]
        elif key in ("ui", "hub", "logging"):
            emu[key] = {"port": ports[name]}
            if key == "ui":
                emu[key]["enabled"] = True
    if "firestore" in emu:
        emu["firestore"]["websocketPort"] = ports["emu_firestore_ws"]
    return write_if_changed(path, json.dumps(doc, indent=2) + "\n")


def render_firebase_test_json(root: Path, ports: dict[str, int]) -> bool:
    path = root / "firebase.test.json"
    if not path.exists():
        return False
    doc = json.loads(path.read_text())
    emu = doc.setdefault("emulators", {})
    mapping = {
        "ui": "test_emu_ui",
        "auth": "test_emu_auth",
        "firestore": "test_emu_firestore",
        "pubsub": "test_emu_pubsub",
        "storage": "test_emu_storage",
        "hub": "test_emu_hub",
        "logging": "test_emu_logging",
    }
    for key, name in mapping.items():
        if key in emu:
            emu[key]["port"] = ports[name]
        elif key in ("ui", "hub", "logging"):
            emu[key] = {"port": ports[name]}
            if key == "ui":
                emu[key]["enabled"] = False
    if "firestore" in emu:
        emu["firestore"]["websocketPort"] = ports["test_emu_firestore_ws"]
    return write_if_changed(path, json.dumps(doc, indent=2) + "\n")


def patch_env_file(path: Path, updates: dict[str, str]) -> bool:
    """Rewrite `KEY=value` lines (commented or not) for the given keys."""
    if not path.exists():
        return False
    text = path.read_text()
    original = text
    for key, value in updates.items():
        # Match an active assignment, or a commented one, keeping the comment.
        text = re.sub(rf"(?m)^(\s*#?\s*){re.escape(key)}=.*$",
                      lambda m: f"{m.group(1)}{key}={value}", text)
    if text == original:
        return False
    path.write_text(text)
    return True


def render_env_files(root: Path, ports: dict[str, int]) -> list[str]:
    """Patch the port-bearing keys in the .env files and their examples."""
    host = "localhost"
    fe_url = f"http://{host}:{ports['frontend']}"
    changed = []

    backend_local = {
        "PORT": str(ports["backend"]),
        "FRONTEND_URL": fe_url,
        "FIREBASE_AUTH_EMULATOR_HOST": f"{host}:{ports['emu_auth']}",
        "FIRESTORE_EMULATOR_HOST": f"127.0.0.1:{ports['emu_firestore']}",
        "PUBSUB_EMULATOR_HOST": f"{host}:{ports['emu_pubsub']}",
        "CORS_ALLOWED_ORIGINS": fe_url,
    }
    backend_test = {
        "PORT": str(ports["test_backend"]),
        "FRONTEND_URL": fe_url,
        "FIREBASE_AUTH_EMULATOR_HOST": f"{host}:{ports['test_emu_auth']}",
        "FIRESTORE_EMULATOR_HOST": f"{host}:{ports['test_emu_firestore']}",
        "PUBSUB_EMULATOR_HOST": f"{host}:{ports['test_emu_pubsub']}",
        "CORS_ALLOWED_ORIGINS": fe_url,
    }
    agent = {
        "PORT": str(ports["agent"]),
        "CORS_ALLOWED_ORIGINS": fe_url,
        "BACKEND_API_URL": f"http://{host}:{ports['backend']}",
    }
    # The frontend's emulator ports are written explicitly rather than left to
    # lib/firebase.ts's literal fallbacks — those are browser code and cannot
    # read .ports.json, so a re-laned project would silently keep dialling the
    # old emulator.
    frontend = {
        "NEXT_PUBLIC_API_URL": f"http://{host}:{ports['backend']}",
        "NEXT_PUBLIC_CLAUDE_AGENT_URL": f"http://{host}:{ports['agent']}",
        "NEXT_PUBLIC_AUTH_EMULATOR_PORT": str(ports["emu_auth"]),
        "NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT": str(ports["emu_firestore"]),
    }

    be = backend_dir(root)
    be_rel = be.relative_to(root).as_posix() if be else "backend"
    targets = [
        (f"{be_rel}/.env.local", backend_local),
        (f"{be_rel}/.env.local.example", backend_local),
        (f"{be_rel}/.env.example", backend_local),
        (f"{be_rel}/.env.test", backend_test),
        (f"{be_rel}/.env.test.example", backend_test),
        ("claude-agent/.env", agent),
        ("claude-agent/.env.example", agent),
        ("frontend/.env.local", frontend),
    ]
    for rel, updates in targets:
        # The agent's auth-emulator host is intentionally empty in the example
        # (real tokens by default); only rewrite it where it is already set.
        if rel.startswith("claude-agent"):
            p = root / rel
            if p.exists() and re.search(r"(?m)^FIREBASE_AUTH_EMULATOR_HOST=\S",
                                        p.read_text()):
                updates = {**updates,
                           "FIREBASE_AUTH_EMULATOR_HOST": f"{host}:{ports['emu_auth']}"}
        if patch_env_file(root / rel, updates):
            changed.append(rel)
    return changed


def cmd_render(root: Path, ports: dict[str, int], base: int) -> None:
    changed = []
    if render_ports_env(root, ports, base):
        changed.append(".ports.env")
    if render_ports_json(root, ports, base):
        changed.append(".ports.json")
    if render_firebase_json(root, ports):
        changed.append("firebase.json")
    if render_firebase_test_json(root, ports):
        changed.append("firebase.test.json")
    changed += render_env_files(root, ports)
    print(f"lane {base}-{base + LANE_SIZE - 1} ({project_name(root)})")
    if changed:
        for c in changed:
            print(f"  updated {c}")
    else:
        print("  already up to date")


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------
def port_held(port: int) -> bool:
    """True if something is listening. Probes both stacks — the Firebase
    emulators bind an IPv6 socket that an AF_INET-only probe misreads as down."""
    for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            s = socket.socket(family, socket.SOCK_STREAM)
            s.settimeout(0.25)
            if s.connect_ex((addr, port)) == 0:
                s.close()
                return True
            s.close()
        except OSError:
            continue
    return False


def port_holder(port: int) -> str:
    try:
        out = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
                             capture_output=True, text=True, timeout=5).stdout
        lines = [l for l in out.splitlines()[1:] if l.strip()]
        if lines:
            f = lines[0].split()
            return f"{f[0]} (pid {f[1]})"
    except (OSError, subprocess.SubprocessError):
        pass
    return "unknown process"


def cmd_check(root: Path, ports: dict[str, int], base: int,
              which: list[str]) -> None:
    held = []
    for name in which:
        port = ports[name]
        if port_held(port):
            held.append((name, port, port_holder(port)))
    if not held:
        print(f"lane {base} ({project_name(root)}): all {len(which)} ports free")
        return
    print(f"lane {base} ({project_name(root)}): {len(held)} port(s) already held",
          file=sys.stderr)
    for name, port, holder in held:
        owner = registry_owner(port)
        suffix = f"  [lane: {owner}]" if owner else ""
        print(f"  {port:<6} {name:<22} {holder}{suffix}", file=sys.stderr)
    # A port inside OUR lane held by something else is normal (our own stack is
    # up). A port outside every registered lane is a genuine squatter.
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# migrate
# ---------------------------------------------------------------------------
SWEEP_SUFFIXES = {".go", ".ts", ".tsx", ".js", ".mjs", ".json", ".sh", ".py",
                  ".md", ".yml", ".yaml", ".xml", ".tf", ".example", ".env",
                  ".toml", ".txt"}
SWEEP_NAMES = {"Makefile", "Dockerfile"}
# Archived changes and handoff records are history — they describe what the
# ports WERE when that work shipped, so a renumber must not rewrite them.
SWEEP_SKIP_DIRS = {"node_modules", ".git", ".idea", ".venv", "__pycache__",
                   "dist", "storybook-static", "archive", "handoffs",
                   "coverage", "playwright-report", "test-results", ".auth",
                   ".firebase", ".turbo", "bin", "vendor",
                   # Recorded upstream payloads. A 4-digit port is also a
                   # Treasury yield, a timestamp and a row count.
                   "testdata", "fixtures", "__snapshots__", "cassettes"}
# Build output is regenerated, never edited: .next, .next-e2e, .next-anything.
SWEEP_SKIP_PREFIXES = (".next",)


def cmd_migrate(root: Path, mapping: dict[int, int], dry: bool,
                exclude: list[str], only: list[str]) -> None:
    """One-time textual renumber: rewrite old port literals to new ones.

    Only rewrites a bare 4-5 digit number when it is NOT adjacent to another
    digit, so 9090 inside 190901 is left alone. Longest old port first, so no
    rewritten value can be re-matched by a later rule.
    """
    # ports.py itself documents the legacy numbers in prose; never sweep it.
    excluded = {Path(__file__).resolve()} | {(root / e).resolve() for e in exclude}
    # `--only` narrows the sweep to named files/globs. Use it on a fork whose
    # tree has drifted far enough that a whole-tree sweep is unreviewable:
    # move the files that actually bind a port, leave the prose for later.
    included: set[Path] | None = None
    if only:
        included = set()
        for pat_ in only:
            included |= {q.resolve() for q in root.glob(pat_) if q.is_file()}
        if not included:
            die(f"--only matched no files: {', '.join(only)}")

    pairs = sorted(mapping.items(), key=lambda kv: -kv[0])
    pattern = re.compile(r"(?<!\d)(" + "|".join(str(o) for o, _ in pairs) + r")(?!\d)")
    table = {str(o): str(n) for o, n in pairs}

    touched = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SWEEP_SKIP_DIRS for part in path.parts):
            continue
        if any(part.startswith(SWEEP_SKIP_PREFIXES) for part in path.parts[:-1]):
            continue
        if path.resolve() in excluded:
            print(f"  skipped {path.relative_to(root)} (excluded)")
            continue
        if included is not None and path.resolve() not in included:
            continue
        if path.suffix not in SWEEP_SUFFIXES and path.name not in SWEEP_NAMES \
                and not path.name.startswith(".env"):
            continue
        try:
            text = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        new = pattern.sub(lambda m: table[m.group(1)], text)
        if new != text:
            n = sum(1 for _ in pattern.finditer(text))
            rel = path.relative_to(root)
            print(f"  {'would rewrite' if dry else 'rewrote'} {rel} ({n} hit{'s' if n != 1 else ''})")
            if not dry:
                path.write_text(new)
            touched += 1
    print(f"{'would touch' if dry else 'touched'} {touched} file(s)")


# ---------------------------------------------------------------------------
# wire — replace lane literals in dev scripts with lane VARIABLES
# ---------------------------------------------------------------------------
SH_PREAMBLE = """
# Ports come from .ports.env (generated by `python3 harness/ports.py render`
# from this checkout's lane), so a re-laned project needs no edit here.
# shellcheck source=/dev/null
[ -f "$ROOT/.ports.env" ] || {{ echo "no .ports.env — run: python3 {tool} render" >&2; exit 1; }}
source "$ROOT/.ports.env"
"""

MAKE_PREAMBLE = """
# Port lane for this checkout. .ports.env is generated at the repo root by
# `python3 {tool} render` from ports.env's PORT_BASE — never hardcode
# a port below, or a re-laned project silently talks to another fork's stack.
-include {up}.ports.env
ifndef PORT_BASE
$(error no {up}.ports.env — run: python3 {tool} render)
endif
# Exported so recipes that shell out (docker-compose host-port substitution)
# see the lane too, not just Make's own variable expansion.
export
"""


def cmd_wire(root: Path, ports: dict[str, int], dry: bool) -> None:
    """Swap this lane's literal port numbers for $PORT_* references.

    Run once per fork, right after `migrate`: `migrate` moves the numbers,
    `wire` makes sure nothing has to move again. Safe to re-run — a file that
    already sources the lane is only scanned for stray literals.
    """
    tool = Path(__file__).resolve().relative_to(root).as_posix()
    by_value = {v: k for k, v in ports.items()}

    targets: list[tuple[Path, str]] = []
    for sh in sorted((root / "scripts" / "dev").glob("*.sh")):
        targets.append((sh, "sh"))
    be = backend_dir(root)
    if be and (be / "Makefile").exists():
        targets.append((be / "Makefile", "make"))

    pattern = re.compile(r"(?<![\d$({])(" + "|".join(str(v) for v in sorted(by_value, reverse=True))
                         + r")(?!\d)")

    for path, style in targets:
        text = original = path.read_text()
        if not pattern.search(text):
            continue
        has_lane = ".ports.env" in text

        if not has_lane:
            if style == "sh":
                anchor = 'cd "$ROOT"\n'
                if anchor not in text:
                    print(f"  SKIP {path.relative_to(root)}: no `cd \"$ROOT\"` anchor "
                          f"to insert the lane source after — wire it by hand")
                    continue
                text = text.replace(anchor, anchor + SH_PREAMBLE.format(tool=tool), 1)
            else:
                lines = text.split("\n")
                # After the leading comment block, before the first directive.
                i = 0
                while i < len(lines) and (lines[i].startswith("#") or not lines[i].strip()):
                    i += 1
                depth = len(path.parent.relative_to(root).parts)
                lines.insert(i, MAKE_PREAMBLE.format(tool=tool, up="../" * depth))
                text = "\n".join(lines)

        ref = (lambda n: f"${{PORT_{n.upper()}}}") if style == "sh" \
            else (lambda n: f"$(PORT_{n.upper()})")
        # Code lines only. A comment that says ":20042" is documentation, and
        # turning it into "${PORT_TEST_EMU_FIRESTORE}" makes it unreadable —
        # but such a comment does go stale on a re-lane, so count and report it.
        out, stale = [], 0
        for line in text.split("\n"):
            if line.lstrip().startswith("#"):
                stale += len(pattern.findall(line))
                out.append(line)
            else:
                out.append(pattern.sub(lambda m: ref(by_value[int(m.group(1))]), line))
        text = "\n".join(out)

        rel = path.relative_to(root)
        if text == original:
            if stale:
                print(f"  {rel}: already wired; {stale} port literal(s) remain "
                      f"in comments (prose only — they go stale on a re-lane)")
            continue
        note = f"; {stale} literal(s) left in comments" if stale else ""
        print(f"  {'would wire' if dry else 'wired'} {rel}{note}")
        if not dry:
            path.write_text(text)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(prog="ports.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show")
    sub.add_parser("env")
    g = sub.add_parser("get"); g.add_argument("name")
    sub.add_parser("render")
    c = sub.add_parser("check")
    c.add_argument("--dev", action="store_true")
    c.add_argument("--test", action="store_true")
    c.add_argument("--only", default="",
                   help="comma-separated port names to probe, e.g. frontend")
    sub.add_parser("registry")
    cl = sub.add_parser("claim"); cl.add_argument("--base", type=int, default=None)
    w = sub.add_parser("wire"); w.add_argument("--dry-run", action="store_true")
    m = sub.add_parser("migrate")
    m.add_argument("--map", required=True, help="old:new,old:new,...")
    m.add_argument("--dry-run", action="store_true")
    m.add_argument("--only", default="",
                   help="comma-separated repo-relative paths or globs; limits "
                        "the sweep to those files")
    m.add_argument("--exclude", default="",
                   help="comma-separated repo-relative paths to leave alone "
                        "(container-internal ports, test fixtures)")
    args = ap.parse_args()

    root = repo_root()

    if args.cmd == "registry":
        rows = registry_read()
        if not rows:
            print(f"no lanes registered ({REGISTRY})")
            return
        print(f"{'BASE':<8} {'PROJECT':<14} PATH   [{REGISTRY}]")
        for r in sorted(rows, key=lambda r: int(r["base"])):
            print(f"{r['base']:<8} {r['project']:<14} {r['path']}")
        return

    if args.cmd == "claim":
        base = registry_claim(root, args.base)
        if not (root / "ports.env").exists():
            write_if_changed(root / "ports.env", PORTS_ENV_TEMPLATE.format(
                project=project_name(root), base=base, last=base + LANE_SIZE - 1))
        else:
            # Keep any PORT_OFFSET_* lines this project added; swap the base.
            txt = (root / "ports.env").read_text()
            txt = re.sub(r"(?m)^PORT_BASE=.*$", f"PORT_BASE={base}", txt)
            (root / "ports.env").write_text(txt)
        _, extra = read_config(root)
        cmd_render(root, resolve(base, extra), base)
        return

    if args.cmd == "migrate":
        mapping = {}
        for pair in args.map.split(","):
            old, new = pair.split(":")
            mapping[int(old)] = int(new)
        exclude = [e for e in args.exclude.split(",") if e]
        only = [o for o in args.only.split(",") if o]
        cmd_migrate(root, mapping, args.dry_run, exclude, only)
        return

    base, extra = read_config(root)
    ports = resolve(base, extra)

    if args.cmd == "show":
        print(f"{project_name(root)}  lane {base}-{base + LANE_SIZE - 1}  ({root})")
        for name, port in ports.items():
            local = "" if name in OFFSETS else "  (project-local)"
            print(f"  {port:<7} +{port - base:<3} {name}{local}")
    elif args.cmd == "env":
        print(f"PORT_BASE={base}")
        for name, port in ports.items():
            print(f"PORT_{name.upper()}={port}")
    elif args.cmd == "get":
        if args.name not in ports:
            die(f"unknown port name {args.name!r}; try `ports.py show`")
        print(ports[args.name])
    elif args.cmd == "render":
        cmd_render(root, ports, base)
    elif args.cmd == "wire":
        cmd_wire(root, ports, args.dry_run)
    elif args.cmd == "check":
        which = []
        if args.only:
            which += [n.strip() for n in args.only.split(",") if n.strip()]
            unknown = [n for n in which if n not in ports]
            if unknown:
                die(f"unknown port name(s): {', '.join(unknown)}; try `ports.py show`")
        if args.dev:
            which += DEV_PORTS
        if args.test:
            which += TEST_PORTS
        if not which:
            which = list(ports)
        cmd_check(root, ports, base, which)


PORTS_ENV_TEMPLATE = """\
# Port lane for this checkout. ONE number defines every local port.
#
# Every port is PORT_BASE + a fixed offset from the table in harness/ports.py,
# which is identical in every Volt fork. Lane {base}-{last} belongs to {project}
# (see ~/.config/volt/ports.tsv for the machine-wide registry).
#
# To move this project to a different lane:
#     python3 harness/ports.py claim --base <new-base>
# which rewrites this file, re-renders every port-bearing file, and updates the
# registry. Never edit a port anywhere else by hand.
PORT_BASE={base}
"""

if __name__ == "__main__":
    main()

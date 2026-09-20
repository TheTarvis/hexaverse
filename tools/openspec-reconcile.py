#!/usr/bin/env python3
"""Report what `openspec archive` will REFUSE, before you get there.

A MODIFIED block must reproduce every scenario heading the live spec still
has for that requirement. `openspec validate --strict` does NOT check this:
a change can be strict-valid for days and still abort at archive time with
"current spec contains scenario(s) not present in the modified block".
This script finds that early (behaviour measured against openspec 1.6.0,
2026-09-02).

Usage:  python3 .claude/scripts/openspec-reconcile.py <change-id> [...]
Run it from the repo root, or set REPO_ROOT.
Exit 1 if any change would be refused.
"""
import sys, os, re
def parse(path):
    """capability spec/delta -> {requirement: [scenarios]}, only within MODIFIED for deltas"""
    if not os.path.exists(path): return None
    reqs, cur, section = {}, None, None
    for line in open(path):
        s = line.rstrip("\n")
        m = re.match(r'^## (ADDED|MODIFIED|REMOVED|RENAMED)', s)
        if m: section = m.group(1); continue
        m = re.match(r'^### Requirement:\s*(.+?)\s*$', s)
        if m: cur = (section, m.group(1)); reqs.setdefault(cur, []); continue
        m = re.match(r'^#### Scenario:\s*(.+?)\s*$', s)
        if m and cur: reqs[cur].append(m.group(1))
    return reqs


REQ_LINE = re.compile(r'^\s*-\s*(FROM|TO):\s*`?###\s*Requirement:\s*(.+?)`?\s*$')


def parse_renames(path):
    """{new title: old title} from a delta's ## RENAMED Requirements block.

    The archiver applies renames BEFORE modifications, so a MODIFIED block
    under the NEW name targets a live requirement still carrying the OLD one.
    Without this, a rename could not pass both this gate and the archiver.
    """
    if not os.path.exists(path):
        return {}
    out, section, pending = {}, None, None
    for line in open(path):
        t = line.rstrip("\n")
        m = re.match(r'^## (ADDED|MODIFIED|REMOVED|RENAMED)', t)
        if m:
            section = m.group(1)
            continue
        if section != "RENAMED":
            continue
        m = REQ_LINE.match(t)
        if not m:
            continue
        kind, title = m.group(1), m.group(2)
        if kind == "FROM":
            pending = title
        elif pending is not None:
            out[title] = pending
            pending = None
    return out

def check(change, root):
    base = os.path.join(root, "changes", change, "specs")
    if not os.path.isdir(base):
        print(f"{change}: NO SUCH CHANGE ({base})"); return 1
    bad = 0
    for cap in sorted(os.listdir(base)):
        delta = parse(os.path.join(base, cap, "spec.md"))
        live = parse(os.path.join(root, "specs", cap, "spec.md"))
        renames = parse_renames(os.path.join(base, cap, "spec.md"))
        if delta is None:
            continue
        for (sec, name), scns in delta.items():
            if sec != "MODIFIED":
                continue
            if live is None:
                print(f"  [{cap}] MODIFIED '{name}' but capability has NO live spec")
                bad += 1
                continue
            target = renames.get(name, name)
            match = [v for (s2, n2), v in live.items() if n2 == target]
            if not match:
                hint = f" (renamed from '{target}', which is also absent)" if target != name else ""
                print(f"  [{cap}] MODIFIED '{name}' — NO SUCH live requirement{hint}")
                bad += 1
                continue
            missing = [x for x in match[0] if x not in scns]
            if missing:
                bad += 1
                print(f"  [{cap}] '{name}' OMITS {len(missing)} live scenario(s) — archive will refuse:")
                for x in missing:
                    print(f"        - {x}")
    print(f"{change}: {'OK' if bad == 0 else str(bad) + ' ISSUE(S)'}")
    return bad


if __name__ == "__main__":
    root = os.path.join(os.environ.get("REPO_ROOT", os.getcwd()), "openspec")
    names = sys.argv[1:]
    if not names:
        cdir = os.path.join(root, "changes")
        names = sorted(d for d in os.listdir(cdir)
                       if os.path.isdir(os.path.join(cdir, d)) and d != "archive")
    sys.exit(1 if sum(check(c, root) for c in names) else 0)

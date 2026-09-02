#!/usr/bin/env python3
"""Report what `openspec archive` will REFUSE, before you get there.

A MODIFIED block must reproduce every scenario heading the live spec still
has for that requirement. `openspec validate --strict` does NOT check this:
a change can be strict-valid for days and still abort at archive time with
"current spec contains scenario(s) not present in the modified block".
This script finds that early. Measured behaviour, 2026-09-02 — see
docs/plans/continous_space/handoffs/README.md.

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

def check(change, root):
    base = os.path.join(root, "changes", change, "specs")
    if not os.path.isdir(base):
        print(f"{change}: NO SUCH CHANGE ({base})"); return 1
    bad = 0
    for cap in sorted(os.listdir(base)):
        delta = parse(os.path.join(base, cap, "spec.md"))
        live = parse(os.path.join(root, "specs", cap, "spec.md"))
        if delta is None:
            continue
        for (sec, name), scns in delta.items():
            if sec != "MODIFIED":
                continue
            if live is None:
                print(f"  [{cap}] MODIFIED '{name}' but capability has NO live spec")
                bad += 1
                continue
            match = [v for (s2, n2), v in live.items() if n2 == name]
            if not match:
                print(f"  [{cap}] MODIFIED '{name}' — NO SUCH live requirement (renamed? typo?)")
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

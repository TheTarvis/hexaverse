#!/usr/bin/env python3
"""Aggregate this repo's Claude Code token usage from the local transcripts.

The point of this script is a *before* number. Efficiency work on the agent
harness — reducing a consolidated findings file, fusing validation into the
edit that caused it — is unfalsifiable without one, and the mechanisms that
deliver it can fail silently while still looking configured.

Transcripts live under `~/.claude/projects/<slug>/`:

    <session-id>.jsonl                      the main thread
    <session-id>/subagents/agent-*.jsonl    every delegation

**Both are read.** Counting only the main thread understates an OpenSpec team
run by more than an order of magnitude — the panel, the adversary and the
implementation crew are all subagents, and they are the whole cost.

    agent-token-usage.py                       # totals + per-agent breakdown
    agent-token-usage.py --by session          # one row per session
    agent-token-usage.py --since 2026-09-01    # window it
    agent-token-usage.py --json                # machine-readable
    agent-token-usage.py --baseline "link 2b"  # freeze it into docs/

Cost is reported as **input-token-equivalents (ITE)**: fresh input counts 1x,
cache writes 1.25x, cache reads 0.1x, output 5x. These are ratios, not prices;
override with --weights when they drift. ITE is the number to compare
before/after, because raw token counts hide that a cache write costs 12.5x a
cache read.

Time is reported three ways, because for a team of parallel agents the obvious
number is the wrong one:

**active** — the sum of gaps between consecutive records, with any gap longer
than --idle-gap (default 300s) counted as idle and dropped. This is the honest
"time this agent spent working", and it is the column to sort by. The cap
matters here: a chain orchestrator parked waiting for SendMessage can sit idle
for hours inside one invocation, and its raw span would call that work.

**span** — first record to last within one invocation, idle included. span far
above active means an agent spent its life waiting, not thinking.

**wall clock** — the union of every active interval. Subagents run in parallel,
so the active column sums to more than the clock on the wall; agent-time over
wall clock is the parallelism factor, printed under the table.

Both are undercounts at the tail: the last timestamp in a transcript is the
last model response, so tool work after it is invisible.
"""
import argparse, collections, datetime as dt, json, os, pathlib, re, sys
from datetime import timezone

FIELDS = (("in", "input_tokens"), ("write", "cache_creation_input_tokens"),
          ("read", "cache_read_input_tokens"), ("out", "output_tokens"))
DEFAULT_WEIGHTS = {"in": 1.0, "write": 1.25, "read": 0.1, "out": 5.0}
BASELINE = pathlib.Path("docs/agent-cost-baseline.md")
IDLE_GAP = 300.0  # seconds; a longer gap is waiting, not working


def slug(path):
    """`/Users/t/Projects/Roma` -> `-Users-t-Projects-Roma`, as Claude Code names it."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def transcript_dir(project):
    return pathlib.Path.home() / ".claude" / "projects" / slug(project)


def parse_ts(raw):
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return None


def scan(root, since=None):
    """Yield one record per transcript FILE.

    A file is the right unit for time: a `subagents/agent-*.jsonl` IS one
    delegation, so its rows are that invocation's activity trace. Timestamps are
    taken from every row, not only the billed ones — a tool result marks the
    agent as alive just as well as a model response does.
    """
    for path in sorted(root.rglob("*.jsonl")):
        sub = path.parent.name == "subagents"
        session = path.parent.parent.name if sub else path.stem
        counts, stamps, turns = collections.Counter(), [], 0
        agents, branches = collections.Counter(), collections.Counter()
        with path.open(errors="ignore") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                ts = d.get("timestamp") or ""
                if since and ts[:10] < since:
                    continue
                t = parse_ts(ts)
                if t is not None:
                    stamps.append(t)
                if (a := d.get("attributionAgent")):
                    agents[a] += 1
                if (b := d.get("gitBranch")):
                    branches[b] += 1
                usage = (d.get("message") or {}).get("usage")
                if usage:
                    turns += 1
                    for k, f in FIELDS:
                        counts[k] += usage.get(f, 0) or 0
        if not stamps and not turns:
            continue
        yield dict(
            path=path, kind="subagent" if sub else "main", session=session,
            agent=agents.most_common(1)[0][0] if agents else ("subagent" if sub else "main thread"),
            branch=branches.most_common(1)[0][0] if branches else "?",
            counts=counts, turns=turns, stamps=sorted(stamps))


def intervals(stamps, cap):
    """-> (spans, active_seconds, wall_span). A gap over `cap` is idle, not work."""
    if len(stamps) < 2:
        return [], 0.0, 0.0
    spans, start, prev, active = [], stamps[0], stamps[0], 0.0
    for t in stamps[1:]:
        gap = t - prev
        if gap > cap:
            spans.append((start, prev))
            start = t
        else:
            active += gap
        prev = t
    spans.append((start, prev))
    return spans, active, stamps[-1] - stamps[0]


def union(spans):
    """Total seconds covered by the union of intervals — parallel work counted once."""
    merged = []
    for lo, hi in sorted(spans):
        if merged and lo <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    return sum(hi - lo for lo, hi in merged)


def hms(sec):
    sec = int(round(sec))
    h, m, sx = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}h{m:02d}m" if h else (f"{m}m{sx:02d}s" if m else f"{sx}s")


def ite(counts, weights):
    return sum(counts[k] * weights[k] for k, _ in FIELDS)


def collect(root, since, key, cap):
    """-> (groups, totals, meta) where a group carries both cost and time."""
    groups = collections.defaultdict(lambda: dict(
        counts=collections.Counter(), turns=0, invocations=0,
        active=0.0, span=0.0, longest=0.0, spans=[]))
    totals, all_spans = collections.Counter(), []
    first = last = None
    branches = set()

    for rec in scan(root, since):
        g = groups[rec[key]]
        g["counts"].update(rec["counts"])
        g["turns"] += rec["turns"]
        g["invocations"] += 1
        spans, active, span = intervals(rec["stamps"], cap)
        g["active"] += active
        g["span"] += span
        g["longest"] = max(g["longest"], active)
        g["spans"] += spans
        all_spans += spans
        totals.update(rec["counts"])
        branches.add(rec["branch"])
        if rec["stamps"]:
            first = min(first or rec["stamps"][0], rec["stamps"][0])
            last = max(last or rec["stamps"][-1], rec["stamps"][-1])

    return groups, totals, dict(first=first, last=last, branches=branches,
                                wall=union(all_spans), cap=cap)


def cost_table(groups, totals, weights, label):
    grand = ite(totals, weights) or 1
    out = [f"| {label} | turns | fresh in | cache write | cache read | output | ITE | % |",
           "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for g, d in sorted(groups.items(), key=lambda kv: -ite(kv[1]["counts"], weights)):
        e = ite(d["counts"], weights)
        c = d["counts"]
        out.append(f"| {g} | {d['turns']:,} | {c['in']:,} | {c['write']:,} | "
                   f"{c['read']:,} | {c['out']:,} | {e/1e6:,.1f}M | {100*e/grand:.1f}% |")
    tt = sum(d["turns"] for d in groups.values())
    out.append(f"| **total** | **{tt:,}** | **{totals['in']:,}** | **{totals['write']:,}** | "
               f"**{totals['read']:,}** | **{totals['out']:,}** | **{grand/1e6:,.1f}M** | |")
    return out


def time_table(groups, meta, label):
    grand = sum(d["active"] for d in groups.values()) or 1
    out = [f"| {label} | runs | active | % of agent-time | span (idle incl.) | longest run | occupied |",
           "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for g, d in sorted(groups.items(), key=lambda kv: -kv[1]["active"]):
        out.append(f"| {g} | {d['invocations']:,} | {hms(d['active'])} | "
                   f"{100*d['active']/grand:.1f}% | {hms(d['span'])} | {hms(d['longest'])} | "
                   f"{hms(union(d['spans']))} |")
    out.append(f"| **total** | **{sum(d['invocations'] for d in groups.values()):,}** | "
               f"**{hms(grand)}** | | **{hms(sum(d['span'] for d in groups.values()))}** | | "
               f"**{hms(meta['wall'])}** |")
    return out



BASH_KINDS = [
    (r"\bgo test\b.*-run\s", "go test -run (one test)"),
    (r"\bgo test\b", "go test (package or ./...)"),
    (r"\bgo (build|vet)\b", "go build / vet"),
    (r"\b(npm (run )?test|vitest)\b", "vitest"),
    (r"\b(npx )?tsc\b", "tsc"),
    (r"\b(eslint|npm run lint)\b", "eslint"),
    (r"\b(npx playwright|npm run e2e)\b", "playwright"),
    (r"\bnpm (install|ci)\b", "npm install"),
    (r"^(until|while)\b|\bsleep \d", "POLL / WAIT LOOP"),
    (r"^(cat|head|tail|sed|grep|rg|ls|find|wc|awk)\b", "shell read/search"),
    (r"\bopenspec\b", "openspec cli"),
    (r"red-manifest", "red-manifest"),
    (r"^git\b", "git"),
    (r"^(mkdir|rm|cp|mv|chmod|touch)\b", "file admin"),
]


def classify_bash(cmd):
    c = re.sub(r"^cd\s+\S+\s*&&\s*", "", " ".join(cmd.split()))
    c = re.sub(r"^\w+=\S+\s+", "", c)
    for pat, label in BASH_KINDS:
        if re.search(pat, c):
            return label
    return "other: " + " ".join(c.split()[:2])[:30]


def drill(root, since, agent, cap):
    """Where one agent's clock goes: tool vs inference, by tool, by Bash kind.

    Tool execution is the gap from an assistant message that calls a tool to the
    next record; inference is the gap from a tool result back to the next
    assistant message. Both are capped at --idle-gap, and both undercount the
    final step of a transcript, which has nothing after it to measure against.
    """
    tool_n, tool_t = collections.Counter(), collections.Counter()
    bash_n, bash_t = collections.Counter(), collections.Counter()
    tool_time = infer_time = 0.0
    turns, ctx_first, ctx_last = [], [], []
    runs = 0

    for rec in scan(root, since):
        if rec["agent"] != agent:
            continue
        runs += 1
        turns.append(rec["turns"])
        stamped = []
        with rec["path"].open(errors="ignore") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                t = parse_ts(d.get("timestamp") or "")
                if t is not None:
                    stamped.append((t, d))
        stamped.sort(key=lambda x: x[0])
        reads = [u.get("cache_read_input_tokens", 0)
                 for _, d in stamped if (u := (d.get("message") or {}).get("usage"))]
        reads = [r for r in reads if r]
        if len(reads) >= 4:
            ctx_first.append(sum(reads[:3]) / 3)
            ctx_last.append(sum(reads[-3:]) / 3)
        for i, (t, d) in enumerate(stamped):
            msg = d.get("message") or {}
            gap = min(stamped[i + 1][0] - t, cap) if i + 1 < len(stamped) else 0.0
            if msg.get("role") != "assistant":
                infer_time += gap
                continue
            content = msg.get("content")
            uses = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"] \
                if isinstance(content, list) else []
            if not uses:
                continue
            tool_time += gap
            for b in uses:
                name = b.get("name", "?")
                tool_n[name] += 1
                tool_t[name] += gap / len(uses)
                if name == "Bash":
                    k = classify_bash((b.get("input") or {}).get("command") or "")
                    bash_n[k] += 1
                    bash_t[k] += gap / len(uses)

    if not runs:
        return None
    turns.sort()
    return dict(runs=runs, turns=turns, tool_time=tool_time, infer_time=infer_time,
                tool_n=tool_n, tool_t=tool_t, bash_n=bash_n, bash_t=bash_t,
                ctx_first=sum(ctx_first) / len(ctx_first) if ctx_first else 0,
                ctx_last=sum(ctx_last) / len(ctx_last) if ctx_last else 0)


def drill_report(agent, d):
    clock = d["tool_time"] + d["infer_time"] or 1
    out = [f"### {agent} — where the clock goes", "",
           f"{d['runs']} runs, {sum(d['turns']):,} turns "
           f"(median {d['turns'][len(d['turns'])//2]}/run, max {d['turns'][-1]}).",
           "",
           f"- tool execution : {hms(d['tool_time'])} ({100*d['tool_time']/clock:.0f}%)",
           f"- model inference: {hms(d['infer_time'])} ({100*d['infer_time']/clock:.0f}%)",
           f"- context per turn: {d['ctx_first']:,.0f} -> {d['ctx_last']:,.0f} cache-read tokens",
           "",
           "| tool | calls | time | % |", "| --- | ---: | ---: | ---: |"]
    tt = sum(d["tool_t"].values()) or 1
    for k, v in d["tool_t"].most_common(10):
        out.append(f"| {k} | {d['tool_n'][k]:,} | {hms(v)} | {100*v/tt:.1f}% |")
    if d["bash_t"]:
        out += ["", "| what it runs in Bash | calls | time | % |", "| --- | ---: | ---: | ---: |"]
        bt = sum(d["bash_t"].values()) or 1
        for k, v in d["bash_t"].most_common(14):
            out.append(f"| {k} | {d['bash_n'][k]:,} | {hms(v)} | {100*v/bt:.1f}% |")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", default=os.getcwd(), help="repo path (default: cwd)")
    ap.add_argument("--by", default="agent", choices=("agent", "session", "kind", "branch"))
    ap.add_argument("--since", metavar="YYYY-MM-DD", help="ignore records before this date")
    ap.add_argument("--idle-gap", type=float, default=IDLE_GAP, metavar="SEC",
                    help=f"a gap longer than this is idle, not work (default {IDLE_GAP:.0f})")
    ap.add_argument("--only", choices=("cost", "time"), help="print just one table")
    ap.add_argument("--drill", metavar="AGENT",
                    help="break ONE agent's clock into tool vs inference, by tool and Bash kind")
    ap.add_argument("--weights", metavar="IN,WRITE,READ,OUT",
                    help=f"ITE multipliers (default {','.join(str(DEFAULT_WEIGHTS[k]) for k, _ in FIELDS)})")
    ap.add_argument("--json", action="store_true", dest="as_json")
    ap.add_argument("--baseline", metavar="LABEL", nargs="?", const="",
                    help=f"append this measurement to {BASELINE} under LABEL")
    args = ap.parse_args()

    weights = dict(DEFAULT_WEIGHTS)
    if args.weights:
        try:
            weights = {k: v for (k, _), v in zip(FIELDS, [float(v) for v in args.weights.split(",")])}
        except (ValueError, TypeError):
            ap.error("--weights wants four numbers: IN,WRITE,READ,OUT")

    root = transcript_dir(args.project)
    if not root.is_dir():
        print(f"no transcripts at {root} — nothing has run against {args.project} yet", file=sys.stderr)
        return 1

    if args.drill:
        d = drill(root, args.since, args.drill, args.idle_gap)
        if d is None:
            print(f"no runs for agent '{args.drill}' in {root}", file=sys.stderr)
            return 1
        print()
        print("\n".join(drill_report(args.drill, d)))
        return 0

    groups, totals, meta = collect(root, args.since, args.by, args.idle_gap)
    if not groups:
        print(f"no records in {root}" + (f" since {args.since}" if args.since else ""), file=sys.stderr)
        return 1

    if args.as_json:
        print(json.dumps({
            "project": str(args.project), "transcripts": str(root), "by": args.by,
            "since": args.since, "weights": weights, "idle_gap": args.idle_gap,
            "window": [meta["first"], meta["last"]], "wall_clock_s": meta["wall"],
            "totals": dict(totals), "ite": ite(totals, weights),
            "groups": {g: dict(dict(d["counts"]), turns=d["turns"],
                               invocations=d["invocations"], active_s=d["active"],
                               span_s=d["span"], longest_s=d["longest"],
                               occupied_s=union(d["spans"]), ite=ite(d["counts"], weights))
                       for g, d in groups.items()},
        }, indent=2))
        return 0

    def stamp(t):
        return dt.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M") if t else "?"

    blocks = []
    if args.only != "time":
        blocks.append(cost_table(groups, totals, weights, args.by))
    if args.only != "cost":
        blocks.append(time_table(groups, meta, args.by))

    print(f"\n{args.project}  —  {root}")
    print(f"window: {stamp(meta['first'])} .. {stamp(meta['last'])}"
          f"   branches: {', '.join(sorted(meta['branches']))}")
    for b in blocks:
        print()
        print("\n".join(b))

    agent_time = sum(d["active"] for d in groups.values())
    if args.only != "cost":
        par = agent_time / meta["wall"] if meta["wall"] else 0
        print(f"\nwall clock {hms(meta['wall'])} for {hms(agent_time)} of agent-time "
              f"— {par:.1f}x parallelism. Gaps over {args.idle_gap:.0f}s counted as idle.")
    if args.only != "time":
        grand = ite(totals, weights) or 1
        print(f"cache writes are {100*totals['write']*weights['write']/grand:.0f}% of ITE "
              f"— context churn; cache reads are {100*totals['read']*weights['read']/grand:.0f}% — replay.")

    if args.baseline is not None:
        today = dt.date.today().isoformat()
        label = args.baseline or f"measured {today}"
        body = [f"\n## {label}", "",
                f"Measured {today} by `tools/agent-token-usage.py --by {args.by}"
                + (f" --since {args.since}" if args.since else "") + "`.",
                f"Window {stamp(meta['first'])} .. {stamp(meta['last'])}. "
                f"ITE weights {weights}. Idle gap {args.idle_gap:.0f}s. "
                f"Wall clock {hms(meta['wall'])}, agent-time {hms(agent_time)}.", ""]
        for b in blocks:
            body += b + [""]
        header = ("" if BASELINE.exists() else
                  "# Agent cost baseline\n\nBefore-numbers for harness efficiency work, appended by\n"
                  "`tools/agent-token-usage.py --baseline`. Append-only: each block is a\n"
                  "measurement taken at a moment, never revised. Compare blocks, don't edit them.\n"
                  "ITE = input-token-equivalents; active/span/wall clock are defined in the\n"
                  "script's docstring.\n")
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        with BASELINE.open("a") as fh:
            fh.write(header + "\n".join(body) + "\n")
        print(f"\nappended to {BASELINE} under '{label}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Decide whether reducing a handoff pays — before paying a reducer to find out.

`check-quote-fidelity.py` answers *is this reduction honest*. It does not
answer *was it worth making*, and the handoffs README already names
consolidation as the single largest line in the harness bill. A 25 KB panel
report read by one delegation is never worth a reducer pass. The same report
read by five is worth it twice over. Nothing in the harness told the two apart,
so the standing rule was "always consolidate".

The break-even is `decideCompaction()` from the online-context-compact
mechanism in NVlabs/SoL-Pi (MIT), with their cache-ratio term replaced by this
repo's ITE weights:

    saving    = archive_tokens - reduced_tokens          per downstream read
    cost      = archive_tokens*W_in + reduced_tokens*W_out   the reducer's own bill
    breakeven = cost / (saving * W_in)                    readers needed to repay it

Output is 5x input, so writing the reduction — not reading the sources — is
most of the cost, and a reduction that saves little repays slowly.

Volt has a third option SoL-Pi does not: `harness/handoff-index.py` buys most
of the same saving for **zero model tokens**, because it is a script. So the
verdict is three-way, and "index it" is the default answer whenever the reader
count is below break-even.

    reduction-economics.py docs/handoffs/x-panel-*.md --readers 3
    reduction-economics.py docs/handoffs/x-impl-contract.md --readers 5 --json
    reduction-economics.py <sources> --readers 2 --reduced docs/handoffs/x-panel-consolidated.md

How many readers? Count the delegations that will be handed the path, not the
agents on the team. A consolidated panel file is read by the spec writer, the
adversary, and a resuming orchestrator — 3. An impl-contract is read by both
developers, the SDET, QA and the adversary — 5. A kickoff is read once.

--window/--reserve carry SoL-Pi's window-protection override: when the sources
cannot fit the reading agent's context at all, economics stop mattering and
something has to shrink. Indexing is still preferred there if the index fits.
"""
import argparse, importlib.util, json, pathlib, sys

CHARS_PER_TOKEN = 4
THRESHOLD_BYTES = 10 * 1024
# The reducer reads every source fresh and writes the reduction; a downstream
# delegation reads the result fresh. Cache reads never enter it — a handoff is
# read by agents that did not have it in context a moment ago.
FALLBACK_WEIGHTS = {"in": 1.0, "write": 1.25, "read": 0.1, "out": 5.0}
# A reduction that keeps every finding lands here; below it, evidence is going
# missing rather than being compressed.
DEFAULT_RATIO = 0.45
DEFAULT_WINDOW = 200_000
DEFAULT_RESERVE = 16_384


def weights():
    """ITE weights from agent-token-usage.py, so the two never drift apart."""
    src = pathlib.Path(__file__).with_name("agent-token-usage.py")
    try:
        spec = importlib.util.spec_from_file_location("_atu", src)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return dict(mod.DEFAULT_WEIGHTS)
    except Exception:
        return dict(FALLBACK_WEIGHTS)


def estimate_tokens(text):
    return -(-len(text) // CHARS_PER_TOKEN)


def index_tokens(sources):
    """What the reader pays under harness/handoff-index.py.

    A source at or below the indexer's threshold gets no index and is read
    whole — counting a notional index for it would credit indexing with a saving
    it does not deliver.
    """
    total, estimated = 0, 0
    for p in sources:
        text = p.read_text(errors="ignore")
        idx = p.with_name(f"{p.stem}-index.md")
        if len(text.encode()) <= THRESHOLD_BYTES:
            total += estimate_tokens(text)
        elif idx.is_file():
            total += estimate_tokens(idx.read_text(errors="ignore"))
        else:
            estimated += 1
            total += estimate_tokens(text) // 6
    return total, estimated


def decide(sources, readers, reduced, ratio, window, reserve, w):
    archive = sum(estimate_tokens(p.read_text(errors="ignore")) for p in sources)
    memo = estimate_tokens(reduced.read_text(errors="ignore")) if reduced else round(archive * ratio)
    idx, idx_estimated = index_tokens(sources)

    saving = archive - memo
    cost = archive * w["in"] + memo * w["out"]
    breakeven = cost / (saving * w["in"]) if saving > 0 else None
    benefit = saving * readers * w["in"] if saving > 0 else 0
    fits = archive <= window - reserve
    index_fits = idx <= window - reserve

    if sum(len(p.read_bytes()) for p in sources) <= THRESHOLD_BYTES:
        verdict, why = "pass-through", "small enough to read as it is"
    elif saving <= 0:
        verdict, why = "non-positive-saving", "the reduction is not smaller than its sources"
    elif not fits and not index_fits:
        verdict, why = "reduce", "window protection — neither the sources nor an index fit the reader's context"
    elif not fits:
        verdict, why = "index", "window protection — the sources do not fit, the index does, and it is free"
    elif readers >= breakeven:
        verdict, why = "reduce", f"{readers} readers clears the {breakeven:.1f} needed to repay the reducer"
    else:
        verdict, why = "index", f"{readers} readers is below the {breakeven:.1f} needed to repay the reducer"

    return dict(sources=[str(p) for p in sources], readers=readers,
                archive_tokens=archive, reduced_tokens=memo, index_tokens=idx,
                index_estimated=idx_estimated, saving_per_read=saving,
                reducer_cost_ite=round(cost), benefit_ite=round(benefit),
                net_ite=round(benefit - cost),
                breakeven_readers=round(breakeven, 1) if breakeven else None,
                fits_window=fits, verdict=verdict, reason=why,
                estimated=reduced is None)


def report(d, sources):
    print(f"{len(sources)} source(s), {d['archive_tokens']:,} tokens "
          f"({'measured' if not d['estimated'] else 'reduction estimated'})")
    for p in sources:
        print(f"  {p}")
    print()
    print(f"  reduced to       : {d['reduced_tokens']:,} tokens"
          f"{'  (assumed ratio)' if d['estimated'] else ''}")
    print(f"  indexed to       : {d['index_tokens']:,} tokens"
          + (f"  ({d['index_estimated']} of {len(sources)} estimated — run harness/handoff-index.py"
             f" for the real number)" if d['index_estimated'] else ""))
    print(f"  saving per read  : {d['saving_per_read']:,} tokens")
    print(f"  reducer costs    : {d['reducer_cost_ite']:,} ITE  "
          f"(read the sources once, write the reduction at 5x)")
    print(f"  {d['readers']} readers return : {d['benefit_ite']:,} ITE  "
          f"→ net {d['net_ite']:+,} ITE")
    if d["breakeven_readers"]:
        print(f"  break-even       : {d['breakeven_readers']} readers")
    if not d["fits_window"]:
        print("  window           : the sources do NOT fit the reading agent's context")
    print()
    print(f"  VERDICT: {d['verdict'].upper()} — {d['reason']}")
    if d["verdict"] == "index":
        print(f"\n    python3 harness/handoff-index.py {' '.join(str(p) for p in sources)}\n"
              f"\n  Hand delegations the -index.md path. Indexing costs no model tokens,\n"
              f"  keeps every byte of evidence in place, and needs no fidelity gate.")
    elif d["verdict"] == "reduce":
        print("\n    write the reduction, then:\n"
              "    python3 harness/check-quote-fidelity.py <reduction> --strict --write-header")
    elif d["verdict"] == "non-positive-saving":
        print("\n  Reducing this would cost tokens to produce a larger file. Index it, or\n"
              "  leave it alone.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", nargs="+", help="the file(s) a reduction would consume")
    ap.add_argument("--readers", type=int, required=True, metavar="N",
                    help="downstream delegations that will be handed this path")
    ap.add_argument("--reduced", metavar="PATH", help="the reduction, if it already exists")
    ap.add_argument("--ratio", type=float, default=DEFAULT_RATIO,
                    help=f"assumed reduced/original size when --reduced is absent (default {DEFAULT_RATIO})")
    ap.add_argument("--window", type=int, default=DEFAULT_WINDOW,
                    help=f"reading agent's context window in tokens (default {DEFAULT_WINDOW:,})")
    ap.add_argument("--reserve", type=int, default=DEFAULT_RESERVE,
                    help=f"tokens the reader needs for everything else (default {DEFAULT_RESERVE:,})")
    ap.add_argument("--json", action="store_true", help="machine-readable")
    args = ap.parse_args()

    sources = [pathlib.Path(p) for p in args.source]
    missing = [p for p in sources if not p.is_file()]
    if missing:
        for p in missing:
            print(f"no such file: {p}", file=sys.stderr)
        return 2
    reduced = pathlib.Path(args.reduced) if args.reduced else None
    if reduced and not reduced.is_file():
        print(f"no such file: {reduced}", file=sys.stderr)
        return 2

    d = decide(sources, args.readers, reduced, args.ratio, args.window, args.reserve, weights())
    if args.json:
        print(json.dumps(d, indent=2))
    else:
        report(d, sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())

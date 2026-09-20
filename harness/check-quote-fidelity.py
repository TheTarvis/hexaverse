#!/usr/bin/env python3
"""Verify a reduced handoff against the sources it claims to reproduce.

Consolidation is where findings die. This project already lost nine architect
findings to a summary that *named* them and did not restate them, and the rule
written to stop that — reproduce every accepted finding in full, verbatim — is
expensive: a consolidated panel file runs longer than the five reports it
consolidates, and every downstream delegation reads it.

There is a third option, and this script is what makes it safe: **reduce, but
only accept the reduction when every quotation in it matches the archived
source and no finding id has gone missing.** A reducer that cannot pass this
is not a reducer, it is a paraphrase.

    check-quote-fidelity.py docs/handoffs/<id>-panel-consolidated.md
    check-quote-fidelity.py <file> --source a.md --source b.md
    check-quote-fidelity.py <file> --inline --report

Two checks, both exit 1 on failure:

**Quotation fidelity.** Every **attributed** blockquote (and, with --inline, every
quoted span of at least --min-chars) must appear in some source. A blockquote is
attributed when an explicit `<!-- quote: <path> -->` marker precedes it, or when
one of the three lines above it names a source file in backticks. Blockquotes
serve two jobs in these files — reproducing a source, and presenting text the
orchestrator is proposing — and nothing distinguishes them but attribution, so
an unattributed one is **reported as unverified rather than failed**. --strict
fails those too, which is what a reduction claiming to be evidence-preserving
should be run with. Comparison is on
normalised text — whitespace collapsed, smart quotes and dashes folded — so
re-wrapping a quote is fine and changing a word is not. A quote containing an
ellipsis is checked segment by segment, in order, against a single source: a
reducer may elide, it may not bridge two sources into one sentence nobody said.

**Finding coverage.** Every finding id in a source must appear somewhere in the
reduced file. A finding heading is a `##`/`###` heading carrying BLOCKER,
MAJOR or MINOR; its id is the leading token (`M1`, `R1`, `m6`, `MAJOR-A`).
Ids are matched by name only, so when two reviewers both number a finding `M1`
one mention satisfies both — the script says so rather than pretending
otherwise.

Sources default to every file path the document itself names in backticks, plus
its sibling `<prefix>-panel-*.md` reports. A reduced file that cites no sources
has nothing to be checked against, and that is itself the finding.

**Source pinning.** Both checks run against whatever the sources say *today*,
so a reduction that passed when it was written silently becomes a claim about
a file that has since moved on. `--write-header` records a receipt — the idea
and most of the field list are lifted from the evidence-preserving reducer in
NVlabs/SoL-Pi (MIT) — pinning every source by sha256, and upgrading each
`<!-- quote: <path> -->` marker to carry the line the quote was found at and
the quote's own hash:

    <!-- reduction-receipt: volt_reduction_v1
    source=docs/handoffs/x-panel-architect.md sha256=… bytes=24797 lines=612
    authority=…
    readback=…
    -->

`--verify-header` then fails the file when a pinned source no longer hashes to
what the receipt claims. That is the difference between "these quotes match"
and "these quotes match the thing I said I reduced". The `authority=` line is
load-bearing too: without it a downstream agent reads a reduction as a ruling.
"""
import argparse, bisect, hashlib, pathlib, re, sys, unicodedata

FOLD = {"‘": "'", "’": "'", "“": '"', "”": '"',
        "–": "-", "—": "-", "−": "-", " ": " ",
        "′": "'", "…": "..."}
SEVERITY = re.compile(r"\b(BLOCKER|MAJOR|MINOR)\b")
HEADING = re.compile(r"^#{2,4}\s+(?P<text>.+?)\s*$")
# `M1 — MAJOR — …`, `R1 — BLOCKER. …`, `MAJOR-A — …`, `m6 — MINOR — …`
FINDING_ID = re.compile(r"^(?P<id>[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)?)\s*[—–:.-]")
BACKTICK_PATH = re.compile(r"`([^`\s]+\.(?:md|txt))`")
INLINE_QUOTE = re.compile(r"[\"“]([^\"“”]{20,})[\"”]")
# The path may be followed by anchors written by --write-header: `L204 sha256=…`.
QUOTE_MARKER = re.compile(r"<!--\s*quote:\s*(?P<path>[^\s>]+)(?P<anchors>[^>]*?)-->")
ELISION = re.compile(r"\s*(?:\.\.\.|\[\s*\.\.\.\s*\])\s*")

SCHEMA = "volt_reduction_v1"
RECEIPT_BLOCK = re.compile(rf"(?s)^\s*<!--\s*reduction-receipt:\s*{SCHEMA}\s*\n(?P<body>.*?)-->[ \t]*\n?")
PIN = re.compile(r"^source=(?P<path>\S+)\s+sha256=(?P<sha>[0-9a-f]{64})\s+"
                 r"bytes=(?P<bytes>\d+)\s+lines=(?P<lines>\d+)\s*$")


def sha256(text):
    return hashlib.sha256(text.encode()).hexdigest()


def norm(text):
    """Fold to the form two honest copies of the same sentence share.

    Blockquote markers are stripped on both sides: a passage quoted here as a
    blockquote is very often *already* a blockquote in the source, and leaving
    the `>` in would make every such quote look fabricated.
    """
    text = unicodedata.normalize("NFKC", text)
    for a, b in FOLD.items():
        text = text.replace(a, b)
    text = re.sub(r"(?m)^\s*>+\s?", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def norm_index(text):
    """-> (normalised text, [(offset, line_no)]) so a match can name a source line.

    `norm` folds the whole document into one line, which is what makes quote
    matching survive re-wrapping — and what loses the line number a reader needs
    to page the source back. Normalising line by line and joining on the single
    space `norm` would have left produces the identical string, plus the offset
    of every contributing line.
    """
    parts, marks, pos = [], [], 0
    for n, line in enumerate(text.split("\n"), start=1):
        piece = norm(line)
        if not piece:
            continue
        if parts:
            pos += 1
        marks.append((pos, n))
        parts.append(piece)
        pos += len(piece)
    return " ".join(parts), marks


def locate(quote, body, marks):
    """Line number in the source where `quote` starts, or None."""
    segments = [norm(s) for s in ELISION.split(quote) if norm(s)]
    if not segments:
        return None
    at = body.find(segments[0])
    if at < 0:
        return None
    i = bisect.bisect_right([m[0] for m in marks], at) - 1
    return marks[i][1] if i >= 0 else None


def relpath(path, repo):
    try:
        return str(path.resolve().relative_to(repo))
    except ValueError:
        return str(path)


def receipt(paths, raw, repo):
    """The pin block. Sources in the order they were resolved, hashes over raw bytes."""
    out = [f"<!-- reduction-receipt: {SCHEMA}",
           "# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.",
           "# Every source below is pinned by content hash. If one of them changes, this",
           "# reduction is a claim about a file that has moved on: re-verify it with",
           "# --verify-header and re-reduce before anything downstream trusts it."]
    for p in paths:
        out.append(f"source={relpath(p, repo)} sha256={sha256(raw[p])} "
                   f"bytes={len(raw[p].encode())} lines={len(raw[p].split(chr(10)))}")
    out += ["authority=the orchestrator retains adjudication; this file is evidence, not a ruling",
            "readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line",
            "-->"]
    return "\n".join(out) + "\n"


def read_pins(text):
    """-> (list of pins, found) for the receipt block at the top of `text`."""
    m = RECEIPT_BLOCK.match(text)
    if not m:
        return [], False
    pins = []
    for line in m.group("body").split("\n"):
        hit = PIN.match(line.strip())
        if hit:
            pins.append(dict(path=hit.group("path"), sha=hit.group("sha"),
                             bytes=int(hit.group("bytes")), lines=int(hit.group("lines"))))
    return pins, True


def anchor_markers(text, raw, repo):
    """Rewrite every `<!-- quote: <path> -->` to carry the quote's line and hash.

    An unanchored marker names the file and leaves the reader to grep 25 KB for
    a passage that has been re-wrapped. The anchor turns readback into one
    `sed -n`, which is the whole point of keeping the archive.
    """
    indexed = {p: norm_index(t) for p, t in raw.items()}
    by_name = {p.name: p for p in raw}
    lines, out, changed = text.split("\n"), [], 0
    for n, line in enumerate(lines):
        m = QUOTE_MARKER.search(line)
        if not m:
            out.append(line)
            continue
        src = by_name.get(pathlib.Path(m.group("path")).name)
        # The blockquote this marker attributes: the next `>` run within 3 lines.
        buf, k = [], n + 1
        while k < len(lines) and k <= n + 3 and not lines[k].lstrip().startswith(">"):
            if lines[k].strip():
                break
            k += 1
        while k < len(lines) and lines[k].lstrip().startswith(">"):
            buf.append(re.sub(r"^\s*>\s?", "", lines[k]))
            k += 1
        quote = "\n".join(buf)
        at = locate(quote, *indexed[src]) if src and quote else None
        anchor = f" L{at} sha256={sha256(norm(quote))[:12]}" if at else ""
        rewritten = line[:m.start()] + f"<!-- quote: {m.group('path')}{anchor} -->" + line[m.end():]
        changed += rewritten != line
        out.append(rewritten)
    return "\n".join(out), changed


def attributed(lines, idx, names):
    """Do the three lines above line index `idx` claim a source for this quote?"""
    seen = 0
    for k in range(idx - 1, -1, -1):
        line = lines[k]
        if not line.strip():
            if seen:
                break
            continue
        if QUOTE_MARKER.search(line):
            return True
        for raw in BACKTICK_PATH.findall(line):
            if pathlib.Path(raw).name in names:
                return True
        seen += 1
        if seen >= 3:
            break
    return False


def blockquotes(lines, names=()):
    """-> [(line_no, text, attributed)] for each contiguous run of `>` lines."""
    out, buf, start = [], [], 0
    for n, line in enumerate(lines, start=1):
        if line.lstrip().startswith(">"):
            if not buf:
                start = n
            buf.append(re.sub(r"^\s*>\s?", "", line))
        elif buf:
            out.append((start, "\n".join(buf), attributed(lines, start - 1, names)))
            buf = []
    if buf:
        out.append((start, "\n".join(buf), attributed(lines, start - 1, names)))
    return out


def inline_quotes(lines, min_chars):
    out = []
    for n, line in enumerate(lines, start=1):
        for m in INLINE_QUOTE.finditer(line):
            if len(m.group(1)) >= min_chars:
                out.append((n, m.group(1)))
    return out


def findings(text):
    """-> {id: heading} for every severity-bearing heading."""
    found = {}
    for line in text.split("\n"):
        m = HEADING.match(line)
        if not m or not SEVERITY.search(m.group("text")):
            continue
        hit = FINDING_ID.match(m.group("text"))
        if hit:
            found.setdefault(hit.group("id"), m.group("text"))
    return found


def matches(quote, sources):
    """Is `quote` in some source? Elided quotes must land in ONE source, in order."""
    segments = [norm(s) for s in ELISION.split(quote) if norm(s)]
    if not segments:
        return True
    for body in sources.values():
        pos, ok = 0, True
        for seg in segments:
            at = body.find(seg, pos)
            if at < 0:
                ok = False
                break
            pos = at + len(seg)
        if ok:
            return True
    return False


def is_source(p, doc):
    """Archived evidence only — not derived artefacts, not documentation.

    A `*-index.md` is generated FROM a handoff by harness/handoff-index.py;
    treating one as a source lets a reduction verify a quote against a head/tail
    excerpt of the very file it is reducing, and inflates the reduction ratio
    with bytes nobody wrote. A `README.md` is the convention document these
    files are written *under* — reductions cite it in passing, and pinning it
    makes every edit to the conventions invalidate reductions it has nothing to
    do with. Neither is evidence of a finding.
    """
    return (p.is_file() and p.name != "README.md"
            and not p.name.endswith("-index.md") and p.resolve() != doc.resolve())


def resolve_sources(doc, explicit, repo):
    if explicit:
        return [pathlib.Path(p) for p in explicit]
    text, out = doc.read_text(errors="ignore"), []
    for raw in BACKTICK_PATH.findall(text):
        for cand in (repo / raw, doc.parent / raw):
            if is_source(cand, doc):
                out.append(cand)
                break
    prefix = re.sub(r"-(consolidated|reduced)\b.*$", "", doc.stem)
    out += [p for p in doc.parent.glob(f"{prefix}*.md") if is_source(p, doc)]
    seen, uniq = set(), []
    for p in out:
        if p.resolve() not in seen:
            seen.add(p.resolve())
            uniq.append(p)
    return uniq


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("document", help="the reduced/consolidated file to verify")
    ap.add_argument("--source", action="append", default=[], metavar="PATH",
                    help="archived source (repeatable); default: cited + sibling reports")
    ap.add_argument("--min-chars", type=int, default=40,
                    help="ignore quotations shorter than this (default 40)")
    ap.add_argument("--inline", action="store_true", help="also verify inline \"...\" spans")
    ap.add_argument("--report", action="store_true", help="print the reduction ratio")
    ap.add_argument("--no-coverage", action="store_true", help="skip the finding-id check")
    ap.add_argument("--strict", action="store_true",
                    help="also fail on blockquotes that claim no source")
    ap.add_argument("--write-header", action="store_true",
                    help="pin the sources by hash and anchor every quote marker (rewrites the file)")
    ap.add_argument("--verify-header", action="store_true",
                    help="fail when a pinned source has changed since the reduction was written")
    args = ap.parse_args()

    doc = pathlib.Path(args.document)
    if not doc.is_file():
        print(f"no such file: {doc}", file=sys.stderr)
        return 2
    repo = pathlib.Path.cwd()

    paths = resolve_sources(doc, args.source, repo)
    missing = [p for p in paths if not p.is_file()]
    paths = [p for p in paths if p.is_file()]
    for p in missing:
        print(f"source not found, skipped: {p}", file=sys.stderr)
    if not paths:
        print(f"{doc}: cites no readable source — nothing to verify against.\n"
              f"  A reduced file must name the reports it reduces, or it is a paraphrase.",
              file=sys.stderr)
        return 1

    raw = {p: p.read_text(errors="ignore") for p in paths}
    sources = {p: norm(t) for p, t in raw.items()}
    text = doc.read_text(errors="ignore")
    lines = text.split("\n")

    names = {p.name for p in paths}
    runs = [(n, q, a) for n, q, a in blockquotes(lines, names) if len(norm(q)) >= args.min_chars]
    quotes = [(n, q) for n, q, a in runs if a]
    unattributed = [(n, q) for n, q, a in runs if not a]
    if args.inline:
        quotes += [(n, q) for n, q in inline_quotes(lines, args.min_chars)]

    bad = [(n, q) for n, q in quotes if not matches(q, sources)]
    loose = [(n, q) for n, q in unattributed if not matches(q, sources)]

    dropped, ambiguous = [], []
    if not args.no_coverage:
        doc_norm = norm(text)
        by_id = {}
        for p in paths:
            for fid, heading in findings(raw[p]).items():
                by_id.setdefault(fid, []).append((p, heading))
        for fid, owners in sorted(by_id.items()):
            if not re.search(rf"(?<![A-Za-z0-9]){re.escape(norm(fid))}(?![A-Za-z0-9])", doc_norm):
                dropped += [(fid, p, h) for p, h in owners]
            elif len(owners) > 1:
                ambiguous.append((fid, [p.name for p, _ in owners]))

    print(f"{doc}")
    print(f"  sources   : {len(paths)} — {', '.join(p.name for p in paths)}")
    print(f"  quotations: {len(quotes)} attributed and checked, {len(bad)} unmatched")
    if unattributed:
        print(f"  unattributed: {len(unattributed)} blockquote(s) claim no source "
              f"({len(loose)} of them match none either)"
              + ("" if args.strict else " — not failed; use --strict"))
    if not args.no_coverage:
        total = sum(len(findings(raw[p])) for p in paths)
        print(f"  findings  : {total} ids in sources, {len(dropped)} missing from the reduction")
    if args.report:
        src_bytes = sum(len(t.encode()) for t in raw.values())
        doc_bytes = len(text.encode())
        pct = 100 * (1 - doc_bytes / src_bytes) if src_bytes else 0
        print(f"  reduction : {src_bytes:,} B of sources -> {doc_bytes:,} B "
              f"({pct:+.0f}%{'  — this file is LARGER than its sources' if pct < 0 else ''})")

    pins, has_receipt = read_pins(text)
    drifted, unpinned = [], []
    if args.verify_header:
        pinned_names = {pathlib.Path(p["path"]).name for p in pins}
        for pin in pins:
            p = pathlib.Path(pin["path"])
            p = p if p.is_file() else repo / pin["path"]
            if not p.is_file():
                drifted.append((pin, "no longer exists"))
            elif sha256(p.read_text(errors="ignore")) != pin["sha"]:
                drifted.append((pin, "has changed since this reduction was written"))
        unpinned = [p for p in paths if p.name not in pinned_names]
        print(f"  receipt   : {'absent' if not has_receipt else f'{len(pins)} source(s) pinned'}"
              f"{f', {len(drifted)} drifted' if drifted else ''}"
              f"{f', {len(unpinned)} resolved source(s) not pinned' if unpinned else ''}")

    sys.stdout.flush()
    for fid, names in ambiguous:
        print(f"  note: id {fid} is used by {len(names)} reports ({', '.join(names)}); "
              f"one mention satisfies all of them", file=sys.stderr)

    if bad:
        print(f"\n{len(bad)} quotation(s) match no source:", file=sys.stderr)
        for n, q in bad:
            snippet = norm(q)
            print(f"  {doc}:{n}: {snippet[:100]}{'...' if len(snippet) > 100 else ''}", file=sys.stderr)
    if dropped:
        print(f"\n{len(dropped)} finding(s) present in a source and absent here:", file=sys.stderr)
        for fid, p, heading in dropped:
            print(f"  {p.name}: {fid} — {heading[:90]}", file=sys.stderr)

    if loose and args.strict:
        print(f"\n{len(loose)} unattributed blockquote(s) match no source (--strict):", file=sys.stderr)
        for n, q in loose:
            print(f"  {doc}:{n}: {norm(q)[:100]}", file=sys.stderr)

    if args.verify_header and not has_receipt:
        print(f"\n{doc}: no reduction receipt. This file claims to reduce "
              f"{len(paths)} source(s) but pins none of them, so 'the quotes match'\n"
              f"is a statement about today's files, not about what was reduced.\n"
              f"  fix: python3 harness/check-quote-fidelity.py {doc} --write-header",
              file=sys.stderr)
    if drifted:
        print(f"\n{len(drifted)} pinned source(s) no longer match the receipt:", file=sys.stderr)
        for pin, why in drifted:
            print(f"  {pin['path']}: {why} (was {pin['bytes']:,} B / {pin['lines']:,} lines)",
                  file=sys.stderr)
        print("  Re-read them and re-reduce, then re-pin with --write-header. A reduction\n"
              "  of a superseded source is not evidence of anything.", file=sys.stderr)
    if unpinned:
        print(f"\n{len(unpinned)} source(s) this file cites are absent from the receipt:",
              file=sys.stderr)
        for p in unpinned:
            print(f"  {relpath(p, repo)}", file=sys.stderr)

    failed = bool(bad or dropped or (loose and args.strict))
    header_failed = args.verify_header and (not has_receipt or drifted or unpinned)

    if failed:
        print("\nFAIL — the reduction is not evidence-preserving. Restore the dropped\n"
              "findings and correct the quotations, or reproduce the sources in full.",
              file=sys.stderr)
    if args.write_header:
        if failed:
            print("\nReceipt NOT written: a receipt over a failing reduction would pin the\n"
                  "defect rather than catch it. Fix the above, then re-run --write-header.",
                  file=sys.stderr)
            return 1
        body, anchored = anchor_markers(RECEIPT_BLOCK.sub("", text, count=1), raw, repo)
        doc.write_text(receipt(paths, raw, repo) + body)
        print(f"  receipt   : written — {len(paths)} source(s) pinned, "
              f"{anchored} quote marker(s) anchored")
        return 0
    if failed or header_failed:
        return 1
    print("  OK — every quotation matches a source, every finding id survives."
          + (" Pinned sources are unchanged." if args.verify_header else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

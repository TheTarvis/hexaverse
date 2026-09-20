# Handoff notes — the continuous-space chain

Working records from the agent runs that authored and implemented the chain. Each
file is the *reasoning* behind a decision, preserved because the decision itself is
terse in `chain.md` and the spec, and because several of these findings cost real
investigation to reach.

They are dated working documents, not living specification. Where one disagrees with
`openspec/specs/`, the spec wins.

| File | What it holds |
| --- | --- |
| `link5-adversary-round1.md` | Link 5's first adversarial pass on the resumed change — 3 blockers, 7 majors, 4 minors — each with the orchestrator's binding ruling. The fail-closed jump ruling lives here. |
| `link5-adversary-round2.md` | Link 5's second pass: the findings the round-1 repairs themselves introduced. |
| `link6-rulings.md` | Link 6's seven original open questions (Q1–Q7) and their rulings, **plus the reversal of Q2** with its full reasoning. Read the reversal before anything else about belts. |
| `link6-panel-consolidated.md` | The four-reviewer panel (architect, DBA, security, UX) deduped into rulings R0–R8, with the list of findings the Q2 reversal dissolved outright. |
| `link6-adversary-r1.md` | Link 6's first adversarial pass — 3 blockers, 9 majors, 5 minors. BLOCKER 1 (seven vacuously-satisfied validation scenarios) is the one worth reading. |
| `link6-adversary-r2.md` | Link 6's second pass: 1 blocker, 3 majors, 2 minors, all inside the round-1 repairs. |
| `link7-rulings.md` | Link 7's ten adjudicated open questions, and the three structural findings that reshaped it — including two false premises in `decisions.md`. |
| `link7-panel-consolidated.md` | Link 7's reviewer panel, deduped. |
| `link7-adversary-r1.md` / `-r2.md` | Link 7's two adversarial passes. A4 (the refuel double-submit) is the one that turned out to be real in production, not just on paper. |
| `link7-impl-contract.md` | The implementation contract handed to link 7's developers. |
| `link8-rulings.md` | Link 8's twelve open questions and their rulings, **including the 8a/8b split** — read this before touching link 8's naming. |
| `link8a-panel-consolidated.md` | 8a's panel, deduped into H1–H7 with rulings. Its "Architect M1–M7 and L1–L5 accepted" line is the cautionary case in *Lesson three* below. |
| `drift-sell-double-submit.md` | Confirmed drift: the shipped sell control never had the guard its live requirement demands. Routed into 8a-2. |
| `link8b-impl-contract.md` | The implementation contract handed to link 8b's developers — wire shapes, the sighting-id digest, sequencing, the lane-transit fizzle that replaced an unarrangeable range fizzle. |
| `link8b-adversary-r4.md` … `-r8.md` | Link 8b's rounds 4–8: round 4 re-attacked the resumed change against the now-live `system-space-view` spec (1 blocker, 6 majors); rounds 5–7 found only residue of each previous repair; round 8 was a mid-build spot-check on the scan-target refetch clause a Playwright journey forced (2 blockers, 4 majors — a failed refetch keeping a stale empty list; a re-selected fleet served from cache). Each carries the orchestrator's rulings. |
| `link8b-red-coverage.md` | Link 8b's SDET coverage table — 157 scenarios, every one accounted for, with the commands that show each red group. |
| `link9-adversary-r2.md`, `-r3.md` | Link 9's rounds 2–3 after the 8a-2 archive expired its verdict: a live requirement forbidding a wire field the change deletes, `SystemInterior.Radius` handed over by name and deleted by no task, a precondition grep that could never pass; then the repaired grep tripping on the directories the change deletes. Round 4 was CLEAR. |
| `defect-jump-never-lands-in-ui.md` | **Open, player-facing:** only `GET /v1/fleets/:id` settles a due jump and no client path calls it, so a jumped fleet reads "In transit" until the 15-minute sweep — never, on a local stack. Found by link 8b's fizzle journey. |

## The one lesson these keep re-teaching

Five times now this chain has shipped a derivation that was built, unit-tested against
its own determinism, and **never called**: `fleet.GraphSource`, `EnsureLaneHorizon`,
`StationContinuousOrbit`, `disclosure.ScanMints`, and the focused scan's client half.
A sixth was nearly added by an orchestrator ruling (link 6's per-member belt lodes,
reversed for exactly this reason) and a seventh is pending (`stationkeep`'s upkeep, whose
verb does not exist).

The tell is always the same: a green suite proves the unit correct while nothing in
production reaches it. `openspec validate --strict` does not catch it, and neither does
an end-to-end test that constructs its own request.

## Lesson two — a green test is not evidence a requirement holds

The sibling of *built and never called* is **written and never really verified**: a
requirement exists, a test for it exists and passes, and the behaviour is still broken,
because the test is shaped so it cannot observe the failure. Three instances, all found
on 2026-09-02:

- `hooks/use-refuel.test.tsx` asserted the double-submit guard and passed against code
  that had no guard at all. Its harness held the mutation promise open by hand and
  waited for the disabled state *between* the two clicks — stepping around the render
  race that was the entire defect. The Playwright equivalent failed 4/4, never once
  passing. `commitSell` has the same hole and no such e2e, which is the only reason it
  is not also red.
- Link 7b's SDET found `A foreign fleet is indistinguishable from a nonexistent one
  (hold)` passing green against a route that **does not exist** — an unwired Gin route
  and a genuine foreign-corp rejection both return the same generic 404, so the
  assertion could never fail. Fixed with a `requireRouteImplemented` guard.
- The same SDET caught two tautological tests in its *own* red suite (one asserted the
  struct literal it had just built) only because it verified red-for-the-right-reason
  in a scratch copy with the missing symbols stubbed in.

The rule that falls out: when a requirement turns on real timing or real wiring, only a
test running against real timing or real wiring counts as coverage. And a test that has
never been observed to fail has not been shown to test anything.

## Lesson three — consolidation silently discards findings

`link8a-panel-consolidated.md` records "Architect M1–M7 and L1–L5" as accepted but spells
out only M3, M4 and M5. The individual reviewer reports were never written to disk, so
**nine findings were lost outright** — noticed only because the spec writer refused to
guess at them and said so.

A summary that names findings it does not restate is not a record of them. Either persist
each reviewer's own report, or restate every accepted finding in full. The recovery, when
this happens, is to re-run the reviewer against the *current* artifact rather than try to
reconstruct what was said about an artifact that has since changed.


## Measured 2026-09-02 — what the archiver actually does with a dropped scenario

The standing belief in this project's notes is that a MODIFIED block missing a live
scenario heading gets **silently dropped**, and that `--strict` does not catch it. Half
of that is right. Measured on a scratch copy, with `build-production-space-view`'s
`system-interior` block deliberately omitting two live scenarios:

```
$ openspec validate build-production-space-view --strict
Change 'build-production-space-view' is valid

$ openspec archive build-production-space-view --yes
system-interior MODIFIED failed for header "### Requirement: Interior Read Endpoint"
 - current spec contains scenario(s) not present in the modified block:
   "Pre-existing wire fields are unchanged", "The lattice orbit key keeps its
   lattice meaning". Refresh the change spec before archiving to avoid dropping
   scenarios.
Aborted. No files were changed.
```

So: **`--strict` does not catch it, but the archiver does, and it fails loudly and
safely** — it names both scenarios and changes nothing. This is not a silent-corruption
trap; it is a late-firing gate. The practical consequences:

1. A change can sit `--strict`-valid for days and still be unarchivable. Validation is
   not evidence a change can land.
2. The failure surfaces at the worst moment — archive time, at the end of implementation
   — so it is worth detecting early. `.claude/scripts/openspec-reconcile.py` (written this run) parses
   MODIFIED blocks and reports exactly what the archiver will refuse, at any time.
   Run it with no arguments to check every active change; it exits non-zero.
3. Because the archiver aborts atomically, a failed archive costs nothing. **Rehearsing
   on a copy is still the right habit**, but for the *other* traps — a capability that
   cannot be retired via REMOVED deltas, and dangling cross-references — not for this one.

An architect review this same day reported this as "fails `--strict`" and quoted a
validator error that does not reproduce. The conclusion was right and the mechanism was
invented. Both halves are worth remembering: a confident empirical claim from a
specialist is still a claim, and the fix it proposes can be correct even when its
reasoning is not.

## Lesson four — retiring a capability trades a hard gate for a manual one

To make `build-production-space-view` archivable, its `system-interior` block was
restructured from `MODIFIED` to `REMOVED` + `ADDED`. That was the right fix — the archiver
refuses a MODIFIED block that omits a live scenario — but it has a cost nobody stated at
the time:

**The archiver's scenario check only protects MODIFIED blocks.** A requirement re-ADDed
under a *new* capability is invisible to it, and `.claude/scripts/openspec-reconcile.py`
inherits the same blind spot. So the moment a capability is retired and its requirements
re-expressed elsewhere, the guarantee that nothing is silently dropped stops being
mechanical and becomes a promise in a proposal.

The promise did not hold. A mechanical diff of all 31 requirements 8a-2 re-ADDs from
retired `board-view`, against their live originals, found **six** load-bearing losses:

- a selected point's visible mark (found by review; a point in vacuum, unlike a lattice
  cell, has no intrinsic outline, so an implementer could ship an invisible selection and
  satisfy every scenario)
- the camera's pan clamp — a SHALL whose only scenario was dropped
- keyboard pan entirely, while two other requirements still cited an "orbit/pan/zoom"
  affordance, and the keyboard point-selection control reads the pan target
- pinch zoom keeping the centred point fixed
- the tap/pan threshold's exactly-at-boundary case
- **a carve-out no reviewer flagged**: `board-view`'s "a gate-aware lookup used only to
  present a selected gate's facts is not a kind-specific branch". Without it the re-ADDed
  requirement forbids what the same requirement mandates.

Five of the six were found by adversarial review; the sixth only by the diff.

**The rule:** whenever a capability is retired and re-expressed, diff every re-ADDed
requirement's body and scenario list against its live original, mechanically, and re-run
that diff before archive whenever a re-ADDed requirement is edited. `--strict` passing,
`reconcile` passing, and an archive rehearsal succeeding all remain true while substance
is quietly missing. **Link 9 (`delete-the-lattice`) retires capabilities too — this
applies there.**

## Lesson five — a binding constraint outlived its cause, and only the repo knew

Every agent on this chain was handed, as a hard rule: *do not regenerate fixtures under
`backend/system` — arm64 gives 1-ULP FMA divergence.* It is in the operating notes and it
was repeated in every delegation.

**It is stale.** `docs/defects/2026-08-25-remaining-fma-sites.md:44` records site 1,
`backend/system/generator.go`, as **RESOLVED 2026-08-29** by
`pin-system-generation-determinism` — and `fixtures/determinism-register.json` carries
entries for `backend/galaxy`, `backend/market` and `backend/mine` only, with **none** for
`backend/system`. The constraint was correct when written and became false four days
later; the note asserting it predates the fix that dissolved it.

This mattered concretely: `delete-the-lattice` **cannot proceed without re-recording**
`fixtures/system/cases.json`. Removing the lattice `Angle0` draw from `orbitFor` shifts
every later draw from the primary RNG stream, so the same seed generates a different
world. Under the stale constraint the change was impossible; the constraint was simply out
of date.

Two things worth carrying:

1. **A prohibition should name its cause, so the cause can be checked.** "Do not regenerate
   X" is unfalsifiable. "Do not regenerate X *because* defect D is open" can be verified in
   one grep, and dissolves on its own when D closes.
2. **The resolution is not to pick a side.** `delete-the-lattice` task 7.5 re-records and
   then requires byte-identity across `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1` before
   committing, stopping if they disagree. That is correct whether or not the hazard is
   live: it re-derives the answer instead of trusting either the note or the defect doc.

Related: `.claude/scripts/openspec-reconcile.py` originally could not resolve `RENAMED`
requirements, so a rename could pass the archiver or this gate but never both. Fixed
2026-09-02 — it now maps a MODIFIED block under the new name back to the live requirement
under the old one, because the archiver applies renames first. The change that found it
declined to patch the gate from inside the change being gated, which was right.

## Lesson six — the integrity check had no baseline, and the suite command could not pass

Two harness findings from link 7b's implementation, both from the SDET rather than review.

**1. The post-development integrity check was unfalsifiable.** Its job is to prove no test
was modified, weakened, skipped or deleted since the red handoff. That needs a baseline —
and the red suite is *untracked*, because a red suite does not compile by design and
committing it would turn `main` red and fail the pipeline. So the SDET could only offer
filesystem mtimes ("every handed-off file still carries an mtime in the red-phase window")
and said plainly that this is weaker evidence than a diff and should not be read as
equivalent. That honesty is the only reason the gap is visible at all.

The fix keeps both properties instead of trading one away:
`.claude/scripts/openspec-red-manifest.sh record <change-id> <paths...>` hashes the suite
at handoff and writes `red-manifest-<change-id>.txt` here; `verify <change-id>` diffs the
current state against it and exits non-zero on any modification, deletion or unrecorded
addition. Self-tested both directions. **Record the manifest at the moment of red handoff,
before any developer starts** — link 7b's own manifest was recorded after its SDET revision
pass, so it is a post-revision baseline, not a true red one. That baseline is gone and
cannot be reconstructed.

**2. The mandated suite command could not pass.** Every delegation carried
`cd backend && go test -p 1 ./...`. The root `hexaverse` e2e package takes ~19.5 minutes on
this machine and dies at go's **600s default** with goroutine dumps — reported as
`FAIL hexaverse 600.704s`, which looks exactly like an assertion failure. `-timeout 40m` is
required. Note this is the same failure mode a prior commit already fixed *inside* the
suite ("A TIMEOUT IS NOT AN ASSERTION FAILURE") — the banner went into CI while the
instruction agents were handed stayed wrong.

The pattern behind both: an instruction repeated across many delegations is never
re-derived by the people following it. Lesson five was a prohibition that outlived its
cause; this is a command that never worked. Both survived because they were *inherited*,
and both were caught by an agent doing the work rather than by a reviewer reading it.

### Addendum — the suite timeout is now a treadmill, with numbers

Measured on this machine, same command, same day:

| point | root e2e package | whole `./...` | timeout in force |
| --- | --- | --- | --- |
| before link 7b | ~109 s (after the leak fix) | — | 15m |
| link 7b landed | 1289 s (21.5 min) | 1284 s reported at the cap | 15m → **40m** |
| link 8a-1 landed | 2397 s (40 min) | 2850 s (47.5 min) | 40m → **90m** |

Two raises in one day, and 8a-2 (106 tasks) and 8b (105 tasks) are still unimplemented.
Raising the number is not a fix: each raise widens the window in which a genuine hang is
indistinguishable from a slow suite, which is precisely the confusion the
"A TIMEOUT IS NOT AN ASSERTION FAILURE" banner exists to resolve. The banner keeps working;
the thing it explains keeps getting worse.

The growth is not mysterious. Nearly every new e2e test **provisions a fresh corporation**
against the emulator — galaxy read, spawn, interior materialization, station provisioning —
and the chain has added dozens of them. The cost is per-test, not per-suite.

**Two structural fixes, for Travis to choose between.** Neither is something an agent should
pick unilaterally, because both change how the suite is written:

1. **Share spawn fixtures.** Most e2e tests need *a* corporation with *a* fleet, not a
   uniquely-seeded one. A per-package spawned corp reused across tests that only read, with
   fresh spawns reserved for tests that mutate ownership, would cut the dominant cost.
   Risk: cross-test coupling, which the root `TestMain`'s wipe currently prevents by force.
2. **Split the root package.** The slow leg is one package. Moving the e2e suite behind its
   own target keeps `/check`'s default path fast and makes the long run explicit, at the
   cost of a second command people must remember.

Until one lands, expect a third raise.

## Lesson seven — one working tree, two changes, and a `git checkout --`

On 2026-09-03 link 9's SDET, proving a red test in a scratch stub, ran
`git checkout -- backend/fleet/service.go` to revert the stub. The file also carried link
8b's **uncommitted** implementation — the extracted host-eligibility helper and the
self/belt-member exclusions — and the checkout erased it silently. The SDET noticed,
rebuilt a labelled "STOPGAP" reconstruction so the package compiled, and reported it.
The reconstruction passed the package tests. It had also **reverted the host resolver to
its pre-change form with no self-exclusion and no belt-member exclusion** — two of the
change's rejection scenarios gone, green build throughout. Only the original author, from
its own record of the edits, could restore the file verbatim; it did, and the by-name e2e
group (16/16) and a fresh full Playwright run had to be repeated.

Three rules fall out, all cheap:

1. **Never run a destructive git command in a shared working tree** (`checkout --`,
   `restore`, `stash`, `reset`, `clean`). Back a file up with `cp` before a scratch edit
   and restore from the copy. A worktree (`git worktree add`) is the right tool for a
   scratch proof that needs a clean tree.
2. **A reconstruction of someone else's uncommitted code is never a fix.** It is a
   second, divergent implementation with a green build — the species this chain has
   catalogued since lesson one. Report the loss; the author restores.
3. **Two changes in one tree is the orchestrator's risk to manage.** Snapshot the staging
   list for the change being committed before the other change's agents start writing,
   and exclude the other change's files by name at commit time.

## How this directory is used by the team (Volt convention)

Every finding, ruling, contract, and baseline the team produces while working a
change is written here, named by change-id. This directory is what lets a fresh
session resume a change without re-deriving it, and what lets a long chain drop
the orchestrator between links.

They are dated working documents, not living specification. Where one disagrees
with `openspec/specs/`, the spec wins.

### The rulings ledger has an index, and agents read the index

`<change-id>-rulings.md` is history: append-only, every ruling with its full
reasoning. Nothing should read it end to end. `tools/openspec-rulings-index.py`
generates `<change-id>-rulings-index.md` — one line per ruling (id, line range,
outcome, and which later ruling revised it) — and **that** is the file a
delegation names and a resuming orchestrator reads. Regenerate after every
ruling; `--check <change-id>` exits 1 when it is stale.

The script auto-detects this directory and needs no arguments. These handoffs
used to live under `docs/plans/continous_space/handoffs/`; that path is now a
symlink here, so the frozen records and archived changes that name it still
resolve.

A ruling heading must therefore state its outcome in one sentence — that heading
*is* its index line. The four `link6`–`link9` ledgers predate this convention and
carry no ruling ids; their indexes correctly mint none and list sections by line
instead. Nothing reconstructs ids for them.

### Reduction is allowed when it is verified, not when it is trusted

Lesson three above is enforceable now, not merely remembered:

```bash
python3 tools/check-quote-fidelity.py docs/plans/continous_space/handoffs/<id>-panel-consolidated.md --report
```

It fails the file unless every **attributed** quotation matches an archived
source and every finding id in a source appears in the reduction. A blockquote
is attributed by a `<!-- quote: <path> -->` marker or a backticked source path
in the three lines above it; unattributed blocks are reported as unverified
rather than failed, because blockquotes here also carry the orchestrator's own
proposed text. Run it with `--strict` when the file claims to be a reduction.

Run against this directory today, 6 of 7 consolidated files pass.
`link8a-panel-consolidated.md` fails with *"cites no readable source"* — it is
the only `link8a-*` file on disk, which is precisely the defect Lesson three
records. The check would have caught it the day it was written.

This runs automatically: editing any `*-consolidated.md` fires it through
`tools/validate-file.sh`, which Claude Code runs from a PostToolUse hook and
other clients run by the instruction in `AGENTS.md`.

### Why files, not relayed prose

- **Consolidation silently discards findings.** Hexaverse lost nine architect
  findings to a summary that named them and did not restate them; the reviewer
  reports were never written down, and the artifact had changed by the time
  anyone noticed. A summary that names findings it does not restate is not a
  record of them.
- **Relayed instructions go stale.** A command that never worked and a
  prohibition whose cause had been fixed both survived across dozens of
  delegations because each prompt inherited them from the last. A file is
  re-read; a paste is trusted.
- **Delegations pass paths.** An orchestrator hands a subagent the path to a
  findings file, never a paraphrase of it — paraphrase drops the quoted
  evidence the fix depends on.

### Files per change

All names are prefixed by the change-id so a directory of many changes stays
greppable.

| File | Written by | Holds |
| --- | --- | --- |
| `<change-id>-panel-<reviewer>.md` | each panel reviewer | that reviewer's own findings, verbatim, before consolidation |
| `<change-id>-panel-consolidated.md` | orchestrator | the deduped, tie-broken findings sent to the writer, **every accepted finding restated in full** |
| `<change-id>-adversary-r<N>.md` | adversary, then orchestrator | round N's findings, each with the orchestrator's binding ruling, and the **commit hash the verdict was issued at** |
| `<change-id>-rulings.md` | orchestrator | open questions and their rulings, including any reversal with its reasoning |
| `<change-id>-impl-contract.md` | architect at kickoff | wire shapes, identifiers, sequencing — everything the spec deliberately leaves open, settled so the SDET can write both sides against one shape |
| `<change-id>-red-coverage.md` | SDET at red handoff | the coverage table: every scenario → test → level → status (`assertion-red`, `compile-red`, `already-green`, `Playwright, deferred`, `reasoned-not-automated`) |
| `red-manifest-<change-id>.txt` | `openspec-red-manifest.sh record` | content hashes of the red suite at handoff; the integrity check's baseline |
| `<change-id>-journey.md` | SDET after the archive-gate run | the journey run's outcome, the batched findings if it went red, and the **suite budget line**: wall time of tiers 3 and 4 |
| `defect-<slug>.md` | anyone | a pre-existing defect found during the change and deliberately not fixed in it — repro, evidence, whose call it is |
| `drift-<slug>.md` | anyone | confirmed code-vs-spec drift, with file:line and the spec passage, awaiting adjudication |

### Verdict expiry is a diff, not a calendar

An adversary verdict names the commit it was issued at. The verdict is current
while this is empty:

```bash
git diff <verdict-sha> -- openspec/specs/<every capability the change touches> openspec/changes/<change-id>
```

When it is not empty, the re-attack scope is **that diff**, not the whole
change. Archiving the previous link in a chain is the common cause: the live
specs the next link targets just changed underneath it. Hexaverse ran four full
re-attack rounds after a resume where three found only residue of the previous
round's repairs.

### Chain records

A multi-change chain keeps its sequencing document (`chain.md`: the ordered
links, what each delivers, its state, and what each one taught) under
`docs/plans/<chain>/`. That document is the input to `/team --chain`. The
per-change files above stay here so one convention serves single changes and
chains alike.

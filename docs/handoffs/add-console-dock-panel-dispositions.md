# `add-console-dock` — panel dispositions

Orchestrator, 2026-10-05. This file is NOT a reduction: it restates no finding.
Each row points at the reviewer's own report, which is the text of record and
carries the paste-ready delta and task text. Reports:
`add-console-dock-panel-architect.md` (A), `add-console-dock-panel-ux.md` (U),
`add-console-dock-panel-security.md` (S). Rulings: `add-console-dock-rulings-index.md`
(15–20 are the post-panel rulings).

"2b-i" = this change, `add-console-dock`, after RULING 15. "2b-i-b" = the new
link `keep-console-tab-content-mounted`, not authored in this run; findings sent
there are preserved for its author, not applied now.

Tie-breaks applied: architect on technical shape and tier; UX on user-observable
behaviour; security on controls.

| Finding | Disposition | Lands in | Note |
| --- | --- | --- | --- |
| A1 BLOCKER size | ACCEPT — split at placement against lifetime (RULING 15) | 2b-i keeps the requirements A1 lists for it; the rest move | tasks.md is re-cut to A1's honest unit: one task per test arrangement group, no box naming several distinct closing assertions |
| A2 MODIFIED strip block | ACCEPT (RULING 16) | 2b-i | paste the block from the architect's Job 4(b) verbatim; apply A2's proposal and task consequences |
| A3 early-settle exit misdescribed | ACCEPT | 2b-i-b | D1 leaves this change with RULING 9 |
| A4 expanded geometry vs the scrolling column | ACCEPT | 2b-i | spec rewording, task 6.2 leg, `space-command-column` testid, proposal coexistence sentence |
| A5 Escape menu clause | ACCEPT | 2b-i-b | filed now: `drift-fleet-menu-ignores-escape-when-unfocused.md` |
| A6 "inside it" scope; focus on expand | ACCEPT (RULING 18) | 2b-i | scenarios that need the Escape key are re-arranged on the collapse control or move to 2b-i-b with Escape |
| A7 mount gate | SPLIT | 2b-i: the observable wording (no pile read and no log content until the interior's first load has answered or failed; the waiting indication), with today's gate. 2b-i-b: the latch, the warm-cache arm, the "first read without expansion" GIVEN | under mount-on-show nothing reads before the tab is shown, so the warm-cache hole A7 names does not open in 2b-i |
| A8 tier assignments | ACCEPT items 1, 2, 4, 5 and the tier-1 Tab-walk relaxation | 2b-i | item 3 (request counts need the real hook) moves with its scenarios to 2b-i-b; item 5's pointer-press journey leg stays in 2b-i's journey only if *Activating the Dock…* stays — it moves (see below), so the leg moves with it |
| A9 mount timing | SPLIT, as A9's own last sentence says | 2b-i: selector/opener migrations (4.1, 4.3 incl. "four uses", collapse-before-ghost-click and the stale helper comment, 4.4 opener, 4.5, 4.6, the galaxy leg via the app's own link). 2b-i-b: the fizzle spec's refresh-before-count, scan-journey step 5 without re-open, the vitals intercept note, task 4.7's hook half | 2b-i keeps a reduced 4.7: run the `SystemSpaceView*` and `SpaceStage*` families after the build and attribute every red before editing any |
| A10 join-in-flight; retry multiplies the re-read | NOTE | 2b-i-b | design.md Risks already carries it |
| A11 "no announcement" vs the focus move | ACCEPT | 2b-i | "SHALL change no live region's text" |
| A12 UX set: shape and tier | ACCEPT as tabled | per U rows below | |
| A13 boundary and hygiene | ACCEPT | 2b-i | mechanism wording replaced by A7's observable |
| A14 / S1 own-ness scenario anchoring | ACCEPT (RULING 20) | chain doc, at the gate task | no 2b-i delta |
| A15 carry items | ACCEPT | chain doc sections for 2b-i-b … 2b-v and link 4, written by the orchestrator at the gate | the three unfiled gaps (watcher disarm race, ghost layer's warm-cache gate, join-in-flight) are listed there for 2b-i-b to file |
| A16 work order | ACCEPT | kickoff | |
| U1 failure while collapsed survives; independent retries | DEFER | 2b-i-b | premise is a mounted log; in 2b-i the log is not mounted while collapsed |
| U2 focus on expand; report link moves focus; Escape with focus outside | ACCEPT first two (RULING 18); third moves with Escape | 2b-i / 2b-i-b | |
| U3 waiting indication | ACCEPT (RULING 19) | 2b-i | wording per A7's 2b-i half |
| U4 ghost highlighted while collapsed (positive half); row brought into view | ACCEPT positive half; DEFER row-into-view | 2b-i / 2b-i-b | "the row is highlighted when the tab is next shown" stays in 2b-i (the highlight is view state today) |
| U5 tab panel role and name; Tab continues into the panel | ACCEPT | 2b-i | tier 1 per A8 |
| U6 24 px targets | ACCEPT | 2b-i | journey leg |
| U7 drop "not listed on re-expansion" | ACCEPT (dropped) | — | its requirement moves to 2b-i-b without that scenario |
| U8 refresh control and first row in view | ACCEPT | 2b-i | journey leg; chrome-only trim of the log inside the panel |
| U9 two live sentences | per RULING 16 | 2b-i | |
| U10 confirmations | ACCEPT | 2b-i | journey task cites analysis § 5's enumeration |
| S1 | ACCEPT (RULING 20) | chain doc | |

## Requirements after the split

Kept in `add-console-dock`: *The Console Dock Extends Beneath the Strip and Is
Collapsed on Every Mount of the View*; *The Dock Carries These Tabs*; *The Log
Tab Is the Sighting Log's Home on This View*; *The Dock Is Keyboard-Operable*
(without Escape); *The Dock Has One Fixed Height and Nothing Covers It or Is
Covered by It*; MODIFIED *The Vitals Strip Is Present on Every Render of the
System Space View*.

Moved to 2b-i-b, draft text preserved: *A Tab's Content Stays Mounted While It
Is Not Shown*; *Showing or Hiding the Log Tab Issues No Read*; *Escape Collapses
the Expanded Dock*; *Activating the Dock Changes No Space-View Selection*.

A scenario kept in 2b-i must be true of a log that is mounted when the tab is
shown and unmounted when it is not (today's behaviour): nothing in 2b-i may
promise that loaded pages, scroll or the log's read state survive a collapse,
and nothing may promise they are discarded either — 2b-i is silent on it and
2b-i-b states it.

# Link 8b `add-scan-and-sightings-surface` — adversary round 7 (final) + orchestrator ruling

Re-verify of round 6's four repairs (`link8b-adversary-r6.md`): all four present, verbatim
where pasted, the focused-scan MODIFIED block byte-verbatim on all seven original scenario
headings and bodies. One MINOR confined to two `design.md` rationale sentences ("Five
reason codes exist" / "all five fizzle copies") that should say six.

**Orchestrator ruling: CLEAR for implementation.** The adversary itself states the finding
is "a rationale-consistency fix rather than a blocker on implementation" — no delta, task
or proposal text is wrong. The two lines are applied by the writer; no round 8, because a
count in design.md's rationale is not content any test derives from. Seven rounds in
total: rounds 4–7 ran after the resume, every finding from round 5 on sitting inside the
previous round's repairs. Recorded as the second deliberate run past the three-round cap
(link 7b was the first), for the same reason.

## The adversary's report, verbatim

## Gate output

```
$ openspec validate add-scan-and-sightings-surface --strict
Change 'add-scan-and-sightings-surface' is valid              (exit 0)

$ python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface
add-scan-and-sightings-surface: OK                            (exit 0)
```

`git status` on `openspec/` identical at start and end (design, proposal, action-dispatch, focused-scan, system-space-view, tasks modified; sighting-log and sighting-records untouched). I edited nothing.

## All four repairs verified present and correct

**Repair 1 — the countdown clock, four artifacts.** All four re-pointed at the view's projection, as ruled:

- `/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/specs/system-space-view/spec.md:171-174` requirement body — "measured against **this view's projected world time** (*Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously*'s scale-correct projection), the inbox supplying the ETA and the committed time only".
- Same file `:188-192` scenario THEN — "counts down to that ETA against the view's scale-correct projected world time, using the action's own committed time and ETA, and no world time the inbox served" (verbatim as pasted).
- Same file `:213` past-ETA GIVEN — "whose ETA is at or before the view's projected world time".
- `tasks.md:185-190` (3.7) — "the running sweep's countdown measures against the view's own scale-correct projected world time, the inbox supplying only the ETA and the committed time"; `tasks.md:372-375` (6.1) unchanged and agreeing.
- `design.md:229-234` (Decision 4) — pasted sentence present verbatim.

Grep sweep of the whole change folder for `world time` / `served world time`: the only surviving `served world time` string is `design.md:230`'s "measures against a *served* world time is none" (the ruled phrasing itself). Nothing anywhere still anchors the countdown to the inbox. The cross-reference target is real — `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:260` is that requirement, and its scale rule sits at `:273-282`. Checked the obvious bred defect: the inbox's served `worldTime` does not become an orphan field, because `action-dispatch`'s "every response including the current world time" is pre-existing live text (`openspec/specs/action-dispatch/spec.md:214`), not a field this change adds.

**Repair 2 — Decision 10 counts.** `design.md:376` now reads "Six of 8a-2's requirements are therefore **extended by addition**" and the bullet list under it has exactly six bullets (Renderer Unavailability, Realtime Refetch Rules, Non-Star Position at the Origin, Toggle-to-Deselect, Route and Data Fan-In, A Landed Resolution Is Announced). `design.md:401` now reads "— four more such reads —", and B1 (`specs/system-space-view/spec.md:636-645`) does enumerate four: scan-target, running-status inbox, settled-status inbox, system-filtered pile. B1's own clause "*System Space View Route and Data Fan-In*'s count of four" matches the live requirement, which says "four reads this view issues itself" (`openspec/specs/system-space-view/spec.md:34`).

**Repair 3 — six-way / all six.** `specs/system-space-view/spec.md:350` "this whole six-way mapping renders its unrecognized-code fallback"; `proposal.md:98` "including all six served fizzle reason codes". Both as ruled, and consistent with the enumeration at `:325-328` and the scenario at `:390-396` ("differs for each of those six reasons").

**Repair 4 — the `alreadySettled` producer.** `specs/focused-scan/spec.md:317-322` (paragraph) and `:324-330` (scenario) are byte-verbatim as pasted, and sit exactly where ruled: after the fizzle enumeration ends ("...unable to commit a new scan.") and before the first original scenario. Machine-diffed the whole MODIFIED requirement against live `/Users/travis/Projects/hexaverse/openspec/specs/focused-scan/spec.md`: all seven original scenario headings present, byte-identical, **in original order**, with all seven bodies byte-identical; the only prose diff is round 5's first-sentence amendment plus repair 4's new paragraph. No archiver trap introduced.

Two candidate bred defects checked and dismissed: the new paragraph does not restate the sensor-slot release, but the `alreadySettled` path is by construction the one where a racing read already settled and released the slot, so there is nothing to strand; and focused-scan's "distinct from every fizzle above" versus system-space-view's treating it as a sixth fizzle-class code is terminology, not behavior — the client rule is "any reason code ⇒ fizzle", and `tasks.md:407-413` (6.11) spells the mapping out, so no implementation can diverge.

---

# MINOR

**1. Repair 4 made a sixth reason code real; two present-tense counts in `design.md` still say five, one of them the flat "Five reason codes exist".**

`/Users/travis/Projects/hexaverse/openspec/changes/add-scan-and-sightings-surface/design.md:667-668`:

> "- **The fizzle is the common case for a naive player.** Five reason codes exist (`outOfRange`, `occluded`, `leftSystem`, `laneTransit`, `hostUnresolved`) and three of them fire when the player did something reasonable"

`design.md:339`:

> "*A Settled Sweep Reports Its Outcome* never fires — taking all five fizzle copies with it, which is the headline half of this change."

Both are present-tense claims about this change's own served enumeration, not history. The charitable reading — "five *fizzle* codes, and `alreadySettled` is not a fizzle" — is the one repair 3 closed off: the ruled `proposal.md:98` now calls them "all six served fizzle reason codes", and the requirement that owns the copy (`specs/system-space-view/spec.md:317`, *…Including Each Fizzle Reason…*) enumerates `alreadySettled` inside its fizzle list and tests six distinct reports. So the change now says five and six in the same voice about the same set.

Exploit: none against implementation — no code follows `design.md`, the deltas and tasks are all correct at six, and `tasks.md:407-413` enumerates five plus `alreadySettled` explicitly. This is filed on the same ground the orchestrator accepted for round-6 finding 2: a mis-stated count in the rationale outlives the round that wrote it, and `:667` is the sentence a future reader will quote as the enumeration.

Paste-ready fixes (two lines):

`design.md:667-668` →
```markdown
- **The fizzle is the common case for a naive player.** Six reason codes exist
  (`outOfRange`, `occluded`, `leftSystem`, `laneTransit`, `hostUnresolved`, and
  the racing-resolver `alreadySettled`) and three of them fire when the player
  did something reasonable — the scanner
```

`design.md:339` → "*A Settled Sweep Reports Its Outcome* never fires — taking all **six** fizzle copies".

---

## Notes, not findings (no action requested)

- `tasks.md:241`, `proposal.md:124`, `design.md:563` still say "five-way fizzle copy map", but each is a counterfactual about the pre-`add-stationkeep-hold-verb` `reasonCode` state; round 6 examined and excused these and I am not re-litigating them. If the team wants uniformity, they read fine as-is.
- Decision 10's premise sentence (`design.md:371-373`) — "`system-space-view` does not exist in `openspec/specs/` until `build-production-space-view` archives" — is now stale in fact (that change archived; the live spec exists and I diffed against it), but the deltas remain ADDED, which is still valid and still reconciles. Presentation only, unchanged by this round's repairs.
- `specs/system-space-view/spec.md:213` is a 91-character line where the file mostly wraps at 80; other body lines in the same file exceed 80 too, so this is not a convention break.

**Verdict: NOT CLEAR** — one MINOR, confined to two `design.md` sentences. All four ruled repairs are present, verbatim where pasted, and correct; the focused-scan MODIFIED block is byte-verbatim on all seven original scenario headings and bodies; both gates pass. Nothing in the deltas, tasks, or proposal is wrong, so this is a rationale-consistency fix rather than a blocker on implementation.
# add-figure-formatting — adversary round 3 (the round cap)

Change: `openspec/changes/add-figure-formatting/` (link 1 of
`docs/plans/system-hud/chain.md`, `/team --chain --full-auto`).
Round 3 of a maximum of 3. Scope per the orchestrator's narrowing: verify
round 2's ten findings, then attack **only** the text this round changed —
R11/R12's four-way duration token and byte-identity rewrite, R4's third
scenario and its new accessible-label SHALL, R3/R9's retitles and pinned
literal, the two retitled absent-value scenarios, `system-space-view`'s
RULING 24 clause and retitled cross-reference, design.md's token-vocabulary
and `assertFiguresMatchModule` paragraphs, and tasks 4.3 / 9.5. The round-1
MODIFIED-body diff sweep and round-2's arithmetic re-derivation were **not**
re-run wholesale, per instruction; the one requirement body edited this round
was re-diffed (below).

**Verdict: NEEDS REVISION — 0 BLOCKER, 3 MAJOR, 2 MINOR. The chain is not
stopped.** All ten round-2 findings hold as repaired. Every new finding is
residue *inside* round 2's own repair text (the byte-identity clause and task
9.5's helper contract) plus two small task-text gaps; none permits a wrong
behaviour to ship undetected by the rest of the suite, and none is
unarchivable. RULING 23's thesis survives the attack: making the element's
text a computable function of its own attributes is what closed the family.
What remains is that the *comparison operator* in that function is
underspecified in two directions — too strict for one element class it names
as passing, and unanchored for the one quantity whose output is a prefix of
its own raw value.

`openspec validate add-figure-formatting --strict` → valid.
`openspec-reconcile.py` → OK. *A Commit's Actual Result Is Never Silently
Swapped for the Previewed One* — the one requirement body edited this round —
re-diffs against `openspec/specs/system-space-view/spec.md:684-710` as a
**pure insertion**: three scenario headings verbatim, two THENs extended, no
sentence dropped. The archiver trap does not bite it.

---

## Answers to the three questions

**1. Is R12's invariant closed?** Yes for six of seven quantity classes, and
the duration class — the one round 2 killed on — is now genuinely total:
`data-unit`'s four-way span token plus the raw plus the test's scale
determines the expected string, the absent form is a module output rather
than a skip, and the spec says in terms "no element carrying the
`data-raw`/`data-unit` pair is exempt from this scenario", which forecloses
the skip branch round 2 found. The round-2 exploit
(`<Figure raw={preview.arriveMs} unit="world-ms-span" text={String(remaining)} />`)
no longer compiles (the token is gone from the union) and no longer passes in
any spelling (with an `-in` token the helper computes `in 4m 12s` and the
containment check fails against `21646048727`; and if the call site puts the
*instant* in `data-raw` to dodge that, the computed expectation moves with
it and still fails).

**A fifth spelling does exist, in exactly one quantity class — `range`.** See
MAJOR 2. It is a gap in the comparison operator, not in the function's
totality, and it is MAJOR rather than BLOCKER for the reason stated there.

**2. Did the containment relaxation open a hole?** It opened one and closed
another badly: the clause is **too strict for the `<option>` it names as
passing** (MAJOR 3 — host ids carry digits) and **too loose for a range**
(MAJOR 2 — the output is a decimal prefix of the raw). The ghost sr-only
label, the other case it was written to admit, is clean: its prose is
`Observed at ` and the stamp's module output includes the whole
`T+ 2d 04:13 ×60`, so nothing outside the output carries a digit.

**3. Did the four-token split leave anything stale?** No stale token. Every
`data-unit` occurrence in the five deltas, tasks.md and design.md is in the
closed set; no bare `world-ms-span` survives anywhere (independently
grepped). Semantically, eight of the nine duration figures now carry a form
that matches the token they would take. The ninth — `SpaceStage`'s
`fleet-facts` `Arrives in …`, task 8.1 — names no form anywhere (MINOR 1);
round 2's walk enumerated eight surfaces and did not reach it.

---

## MAJOR 1 — task 9.5 and design.md branch the helper on *whether a scale was served* instead of on *which quantity the token names*, so a compliant `×—` stamp and every scale-independent figure on a scale-less mount are asserted to be `—`

**Where.** tasks.md 9.5:

> if the element's scale was served, calls the shared module's function for
> that `data-unit` … ; **if the scale was not served, asserts the
> `textContent` is exactly `figure-formatting`'s absent form for that
> quantity, without calling the module** — no element carrying the pair is
> skipped either way

and design.md:319-322, in the same words ("For an element rendered with no
served scale, it asserts the `textContent` is exactly `figure-formatting`'s
absent form for that quantity, the module never called").

**Why it matters.** "The scale was served" is a property of the *mount*, not
of the element, so on a scale-less render the second branch swallows every
figure in the tree:

- A `world-ms-instant` element on a scale-less mount correctly renders
  `T+ 0d 00:00 ×—` (`figure-formatting/spec.md:420-425` and its scenario
  `:442-446`; RULING 19; task 1.2; the fixture row task 2.1 pins). The helper
  as specced asserts its text is exactly `—`, so it **fails a correct
  implementation**. `SightingLog` is the surface that can be mounted without a
  scale (task 7.4 threads it there precisely so the suffix can render), and
  task 9.3 is the file that invokes the helper over it.
- A tonnage, range, delta-v or credit figure does not depend on the scale at
  all — the capability requirement is scoped to "every figure whose
  presentation *value* depends on that scale — a relative duration … and a
  rate" (`:405-410`) — so `fleet-fuel-*` and `fleet-range-*` still render real
  figures on a scale-less roster mount, and the helper asserts they are `—`.

The R12 scenario itself is **correct**: its AND clause is conditioned on "an
element rendering the absent form *because* no scale has been served for it",
which a stamp and a tonnage never do. Only the task and the design paragraph
mis-state it. An implementer follows the task, not the scenario prose, and has
two exits: fix the helper (right) or make a scale-less stamp render `—`
(wrong, and it would break `sighting-log`'s standing "every row shows its
`asOf`" — the exact three-way collision RULING 19 was written to resolve).
The spec and the fixture row would catch the second exit, which is why this is
MAJOR and not BLOCKER, but it costs a repair round during the build.

**Smallest fix.** In task 9.5 and design.md, replace the branch condition:
"…if the element's `data-unit` names a duration or a rate **and** the test
rendered with no served scale, asserts the `textContent` is exactly
`figure-formatting`'s absent form for that quantity, without calling the
module; **every other element — including a `world-ms-instant`, whose stamp
function takes `number | undefined` — is checked by calling the module,
passing the scale-or-`undefined` the test rendered with**."

## MAJOR 2 — the containment match is unanchored, and `range` is the one quantity whose formatted output is a decimal prefix of its own raw value, so `text={String(raw)}` can satisfy it

**Where.** `specs/figure-formatting/spec.md:577-584`:

> **THEN** the shared module's output … **appears in the element's text
> content verbatim, and the element's text contains no other numeric run**

**Why it matters.** RULING 14 gives a range "a magnitude suffix and **no unit
name**" — so `range` is the only quantity whose output carries no
non-digit decoration (a tonnage has `U+2009 t`, credits `₡ `, a delta-v
` m/s`, a rate `t/h`, a duration `m`/`s`, a stamp `T+`). Below 1,000 the
three-significant-figure output is therefore a **prefix of the raw string**:

| raw | `String(raw)` | module output | output ⊂ raw string? |
|---|---|---|---|
| 833.25 | `833.25` | `833` | **yes** |
| 12.3456 | `12.3456` | `12.3` | **yes** |
| 1.23456 | `1.23456` | `1.00`… | no |

So `<Figure raw={r} unit="range" text={String(r)} />` renders `833.25`,
contains `833` verbatim, and has exactly **one** numeric run in its text.
Whether it passes depends entirely on how an implementer renders "no other
numeric run", which the spec never defines: comparing the *set of runs*
against the output rejects it (`833.25` ≠ `833`); comparing the *count* of
runs accepts it. Under the accepting implementation, `fleet-range-*` ships
`833.25` — a raw wire float on screen, fault #1, inside the change that
exists to remove it, on a site this change itself converts.
`FleetRoster.tsx:211-212` is `{f.roster.estimatedRange ?? 0} range` today and
`FleetRoster.test.tsx:365-371` serves `estimatedRange: 833.25` and asserts
`toHaveTextContent('833.25')`, so the value is real and the assertion that
would have caught it is the one task 9.4 migrates to a `data-raw` read.
Neither task 11.1's static check (no `toFixed`, no local `countdown`, no
template-literal into `text`) nor `String(r)` being a bare call is caught by
anything else.

**Why MAJOR and not BLOCKER.** The careful reading of the clause as written
rejects `833.25` — `833.25` *is* a numeric run other than `833` — and the
natural build of task 6.2 calls the range formatter rather than `String`. The
spec does not *prescribe* the wrong behaviour; it leaves one term undefined in
the one place where the definition is load-bearing.

**Smallest fix.** Anchor the match in R12's scenario and task 9.5: "…appears
in the element's text content verbatim **as a complete numeric run — bounded
by a non-digit or by the start/end of the text, so a range's `833` is not
matched inside a raw `833.25`** — and the element's text contains no other
numeric run".

## MAJOR 3 — "no other numeric run" fails the `<option>` the same scenario names as passing, because host ids carry digits

**Where.** the same clause, whose stated purpose is:

> so an element that legitimately labels its figure with surrounding prose (a
> select's `option`, a screen-reader-only label) passes

**Why it matters.** The option's text is
`{kind} · {hostId} · {duration}` (`ScanControl.tsx:290`, design.md:113-122),
and host ids are `feat-belt-1` and `flt-9x2` in the suite that will run the
helper (`ScanControl.test.tsx:99-100`; task 9.4 migrates that file, task 9.5
invokes the helper from it). `body · feat-belt-1 · 0m 5s` contains the
module's output verbatim **and** the numeric run `1`. So the scenario
simultaneously requires this element to pass and makes it fail, and the
implementer must invent the carve-out — which is where MAJOR 8 (round 1) and
MAJOR 1 (round 2) both said the blindness re-enters. Two exits:

1. narrow "numeric run" by some unstated rule (harmless, but unspecified and
   therefore not the same rule twice); or
2. **drop the host id from the option's label** so the text stops carrying
   digits. Nothing forbids this: the delta requires only that each target be
   "labelled by its kind … and each showing its served sweep duration"
   (`system-space-view/spec.md:176-181`), the host id is required only as the
   option's `value`, and task 7.2's "raw host id left untouched" is about the
   sighting-log row, not the option. That exit is a real visible regression —
   two belts in one system become indistinguishable in the select — reached
   by an implementer trying to make a specified assertion pass.

**Smallest fix.** One clause on the same THEN: "…and the element's text
contains no other numeric run, **except a run inside an identifier the
element also carries verbatim in an attribute (a select `option`'s `value`) —
so `body · feat-belt-1 · 0m 5s` passes while `4m 12s (21646048727)` does
not**" — plus the same words in task 9.5.

---

## MINOR 1 — the ninth duration figure names no direction form, so its token and its copy are the implementer's choice

`SpaceStage.tsx:821` builds `detail = \`Arrives in ${formatEta(remaining)}\``
and task 8.1 converts it. No delta covers that figure (it is R12's
whole-tree rule that requires the conversion, and no `system-space-view`
requirement in this change mentions `fleet-facts`), and neither the task nor
design.md names which of R3's forms it takes — while R11 now requires "the
call site chooses the token from its own known form". R3 forbids the bare form
here (it is a deadline, not a cost), so both admissible builds read oddly and
differently: `Arrives in in 4m 12s` (`world-ms-span-in`, prose kept) or
`Arrives 4m 12s left` (`world-ms-span-left`, prose trimmed). Round 2's
eight-surface walk did not include this one. Fix: one clause in task 8.1 —
"rendered with the `world-ms-span-left` token, the surrounding copy trimmed to
`Arrives`, so the affix is not printed twice" (or `-in` with the copy trimmed
to `Arrives`; either, stated once).

## MINOR 2 — task 1.7 does not carry the two R9 behaviours that are not the ladder

R9 states three rules beyond unit selection: zero renders `0.0 t/h`
(in the task), a strictly positive rate whose per-hour magnitude rounds to
`0.0` renders the literal `<0.1 t/h` (`:364-369`, pinned this round per
round-2 MINOR 2), and a negative rate renders the absent form (`:371-373`).
Task 1.7 names only the first. Only task 2.1's blanket "every boundary
scenario in R1–R10" reaches the other two, so the build could implement the
rate function, pass its own task, and discover both from a fixture row. Fix:
append to 1.7 — "a strictly positive rate that rounds to `0.0` at one decimal
renders `<0.1 t/h`; a negative rate renders the absent form".

---

## Round-2 verification table

| # | Round-2 finding | Status | Evidence |
|---|---|---|---|
| B1 | byte-identity undecidable for a duration; `<Figure text>` bypass open | **held** | RULING 23; R11 `:458-465` + scenario `:517-523` split the token four ways; R12 `:572-579` names the token as the form source; design.md:127-139, 313-318; task 9.5. The round-2 exploit fails in every spelling; the token is gone from the union so it will not even compile |
| M1 | scenario contradicted the `<option>` and the sr-only label | **held, with residue** | rewritten as containment + exclusivity `:577-584`; the sr-only label now passes cleanly; the `<option>` does not → MAJOR 3, and the containment half is unanchored → MAJOR 2 |
| M2 | scale-absent figure had no operand | **held in the spec, mis-stated in the task** | R12's AND clause `:585-589` is correctly conditioned on the element rendering the absent form; task 9.5 and design.md:319-322 restate it as a mount-level branch → MAJOR 1 |
| M3 | drift notice's previewed arrival: `in` or `left`? | **held** | RULING 24; `system-space-view:138-142` and its scenario `:164`; task 4.3 |
| M4 | R4's third suffix-less string, and a false WHEN | **held** | `:169-173` is the proposed replacement verbatim — two stamps *at* 1,000 and 40,000 world-ms, both `T+ 0d 00:00 ×1`, with the resolution-loss reason inline |
| m1 | stale R3 title + settling mis-attributed | **held (both halves)** | `system-space-view:316-318` cites the new title and reads "`figure-formatting`'s due-form override for this surface" |
| m2 | `<0.1 t/h` unpinned | **held** | `:368` pins the literal, "for example" gone (see MINOR 2 for the task-side residue) |
| m3 | RULING 12 still listed the ghost label as string-only | **held** | rulings file `:348-355`, a recorded narrowing citing r2 MINOR 3 |
| m4 | absent-scenario titles keyed on the rendered form | **held** | `:492` "A figure with no numeric value carries no raw attribute"; `:498-506` adds the negative-rate and non-positive-scale cases to the WHEN |
| m5 | accessible label optional in practice | **held** | R4's body `:142-144`: "Every rendered `T+` figure SHALL carry the accessible label … not only the call sites a later task list happens to name" |

(Round 2 filed ten findings — 1 BLOCKER, 4 MAJOR, 5 MINOR — not eleven.)

## What was checked and found sound

- **The four-token vocabulary is consistent everywhere.** No bare
  `world-ms-span` in the change; every token in the five deltas, tasks.md and
  design.md is in design.md's closed set; the closed set in design.md:127-133
  and R11's sentence agree token for token.
- **Form-vs-token semantics, all nine duration figures.** scan-target option
  bare, mine preview bare, mine countdown `left`, sweep countdown (running
  order → `left`), roster row (running order → `left`), burn-preview arrival
  `in`, drift notice actual `in`, drift notice previewed `in` — each matches
  the token it would carry, and the two costs are named "bare, no direction
  affix" in their own delta text. Only the ninth (MINOR 1) is unnamed.
- **RULING 24 is applied, not misapplied.** `system-space-view:138-142` and
  task 4.3 say what the ruling says. R3's "`left` for the remainder of
  something already running" reads oddly against a *committed* burn's arrival,
  but the delta names the form explicitly and twice, so no implementation
  ambiguity remains; the substance is settled and out of scope.
- **The scale-absent branch does not contradict R4.** `:420-425` scopes the
  stamp out of the absent rule and into `×—`; R11 `:471-474` keeps its
  `data-raw`; the fixture row is in task 2.1. The only defect is the helper's
  restatement (MAJOR 1).
- **The `<option>`'s sibling cases.** The sighting-log row's `asOf` is already
  its own `<span>` (`SightingLog.tsx:70`), the ghost sr-only label's prose
  carries no digit (`SpaceStage.tsx:693`), `hold-*` splits per task 5.1, and
  `sighting-facts`' `Bearing`/`Speed` digits sit on sibling `<div>`s that carry
  no attribute pair — so the option is the only pair-bearing element whose
  prose carries a digit.
- **Archiver safety.** The one requirement body edited this round diffs as a
  pure insertion with all scenario headings verbatim; `validate --strict` and
  `openspec-reconcile.py` are both clean.

## Buildability at 48 tasks, and scenario coverage

**Do not split. Judgement unchanged from rounds 1 and 2, and RULING 18's
reasoning is untouched by this round.** R12 remains a whole-tree invariant no
seam can halve; every seam leaves it false in the first half with an exception
list naming the unconverted components, which is the failure species this
repo has catalogued twice. Nothing since round 2 added depth: the count is
still 48, this round's repairs were all text edits inside existing tasks, and
the three MAJORs above are repaired by re-wording tasks 9.5 / 8.1 / 1.7 and
two spec clauses — **+0 tasks**. The overage against the 40-task band stays
flagged to Travis exactly as RULING 18 flags it, not re-argued.

**Coverage: every requirement has an implementing task, and every scenario is
reachable — with one concentration risk.** The change's ~95 new/changed
scenarios are 90 in `figure-formatting` plus the amended clauses and one new
scenario across the five MODIFIED blocks. Mapping: R1-R10 → tasks 1.1-1.8 and
2.1-2.2; R11 (attributes) → 1.9/1.10 and the per-site tasks 4.x-8.x; the
scale-absent requirement → 1.2, 1.8, 3.3, 5.8, 6.4, 7.4, 8.2; R12 → 3.1, 3.2,
4.2, 9.5, 11.1; R13 → 2.2, 11.1. No scenario is orphaned and no task
implements behaviour no requirement demands. The risk is **task 2.1**: it
carries the fixture rows for roughly 69 module-level scenarios as a single
checkbox. That is defensible as a task, but the red-phase coverage table
should expand 2.1 row by row rather than treating it as one unit, or the
build will have one task whose completion is unverifiable by inspection.

## Disposition

Three MAJOR and two MINOR, all repairable by text edits, no new tasks. Two of
the three MAJORs are in round-2's own repair text and are cheapest to fix now,
before a developer writes task 9.5 (MAJOR 1 and MAJOR 3 both surface as a red
test on the first migrated file, and MAJOR 2 is invisible until it is not). If
the orchestrator elects to carry them forward as a follow-up change instead,
the chain may proceed: none of the five ships wrong behaviour undetected by
the rest of the suite, and none affects archivability.

---

## Verdict commit

**`da3ba3683dfc9254403415264f303de2e2334656`** — the commit at which this change's
adversary verdict was issued, for the currency check
(`.claude/skills/openspec-team-workflow/SKILL.md` § *Verdict expiry and re-attack
scope*). The verdict is current while this is empty:

```bash
git diff da3ba3683dfc9254403415264f303de2e2334656 -- \
  openspec/specs/system-space-view openspec/specs/docked-fleet-actions \
  openspec/specs/fleet-roster openspec/specs/sighting-log \
  openspec/changes/add-figure-formatting
```

**Scope note, recorded honestly.** Round 3 returned *no BLOCKER* with 3 MAJOR and
2 MINOR residue. Under the round-cap rule that residue could have ridden forward
as a follow-up change; the orchestrator repaired it instead (RULINGs 25, 26 and
two inline minors), so **the content at this commit is one repair pass newer than
the round-3 attack that verified it.** The round cap is three and all three are
spent, so no fourth round verified these final edits. Mitigations are recorded in
the rulings file's closing section: every repair is text-only and adds no scope,
RULING 25's formulation is verified case-by-case against all six cases in play
rather than asserted, and these clauses become executable in the red phase as
task 9.5's `assertFiguresMatchModule` helper — so a wrong formulation surfaces as
a red test on the first migrated file rather than as a silent gap.

# Link 8b `add-scan-and-sightings-surface` — adversary round 6 + orchestrator rulings

Re-verify of round 5's nine repairs (`link8b-adversary-r5.md`): all nine present and
correct, the second MODIFIED block byte-verbatim on all seven scenario headings, the
mixed case agrees across both requirements. Verdict: **NOT CLEAR** — 1 major, 3 minors,
all residue of earlier repairs (m10's clock fix reached the requirement body and task 6.1
but not the requirement's own scenario, task 3.7, or design.md).

## Orchestrator rulings — ALL FOUR ACCEPTED, apply each paste-ready fix exactly

| # | Ruling |
| --- | --- |
| 1 | Countdown scenario, the past-ETA GIVEN, task 3.7 and design.md Decision 4 all re-pointed at the view's projected world time, as pasted. |
| 2 | Decision 10: "Six of 8a-2's requirements", "four more such reads". |
| 3 | "six-way mapping" (spec) and "all six served fizzle reason codes" (proposal). |
| 4 | `alreadySettled` gets a producer requirement: the pasted sentence + scenario appended to the already-MODIFIED *A Sweep Resolves Into Sightings, Or Fizzles* (headings untouched). |

Round 7 re-verifies these four only.

## The adversary's report, verbatim

# Adversary round 6 — `add-scan-and-sightings-surface` (re-verify of round 5's nine repairs)

## Gate output

```
$ openspec validate add-scan-and-sightings-surface --strict
Change 'add-scan-and-sightings-surface' is valid              (exit 0)

$ python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface
add-scan-and-sightings-surface: OK                            (exit 0)
```

`git status` on the change folder was identical at start and end (design, proposal, action-dispatch, focused-scan, system-space-view, tasks modified; sighting-log and sighting-records untouched). Nothing changed under me. Note the environment shifted since round 5: **`build-production-space-view` has archived** (`openspec/changes/archive/2026-09-03-build-production-space-view/`), so `openspec/specs/system-space-view/spec.md` is now live and I diffed against it rather than against the sibling change.

## All nine repairs verified present (not merely claimed)

| # | Repair | Verified at |
| --- | --- | --- |
| 1 | type-filtered report source | `specs/system-space-view/spec.md:332-338` (paragraph verbatim as ruled), scenario `:371-376`; `tasks.md:297-300` (4.6) now reads `GET /v1/actions?actor=&status=done&type=scan`, `actionService.listSettled(actorId, { type })`; `tasks.md:400-405` (6.10) "folding the **type-filtered** settled-inbox read (`type=scan&status=done`), never the type-agnostic one" |
| 2 | B1 running/settled split | `:636-644` opening, `:646-651` running half, `:653-657` settled half, new scenario `:669-674`; both original scenarios intact (`:663-667`, `:676-679`) |
| 3 | second MODIFIED block | `specs/focused-scan/spec.md:290-365`. **Byte-diffed** against live `openspec/specs/focused-scan/spec.md:192-265`: the only difference is the amended first sentence plus its re-wrap. All seven scenario headings and all scenario bodies are byte-identical, in order |
| 4 | tasks re-worded | 6.1 `tasks.md:372-375`, 6.7 `:387-391`, 5.3 `:333-336` — all three as pasted |
| 5 | four new tasks | 5.12 `:364-368`, 6.13 `:415-417`, 6.14 `:418-422`, 7.9 `:455-457` — verbatim |
| 6 | `alreadySettled` sixth reason | requirement `:327-328`, scenario `:390-395` ("differs for each of those **six** reasons"); task 6.11 `:406-412` and the requirement now agree |
| 7 | 10.2c fixture | `tasks.md:578-580` — `hostId` ("a host in the open system, so the log row's host column renders") and "the clean-sweep marker explicitly unset" |
| 8 | 1.15 mixed case | `tasks.md:92-94` — "exactly one record is minted, naming that ship and not the scanner, and **no** clean-sweep record accompanies it" |
| 9 | Decision 10 + B1 clause | `design.md:398-406` (the two new bullets), B1's clause `specs/system-space-view/spec.md:641-644` |

**Requested interaction spot-checks, both clean:**

- **Mixed case (scanner + one other ship beneath the host).** The amended MODIFIED first sentence mints "one sighting record per ship masked at the target host … but never the scanning fleet itself — or one clean-sweep record when nothing **other than the scanner** is masked there"; the ADDED requirement excludes the scanner and mints a clean sweep only "if the scanner is the only ship beneath the host". Applied to the mixed case both yield exactly one target-naming record for the other ship and **no** clean sweep. They agree, and task 3.12 (`:258-266`) and 1.15's second case pin that same reading.
- **3.8a's index vs the read 4.6 issues.** 4.6 issues `actor=` + `status=done` + `type=scan` ordered by `resolvedAt desc`; 3.8a (`:209-222`) requires `(actor ASC, type ASC, status ASC, resolvedAt DESC)` for exactly that path and `(actor ASC, status ASC, resolvedAt DESC)` for the type-agnostic one, with `resolvedAt`'s `omitempty` trap and the emulator trap both recorded. Fields, order-by direction, and the done-path-only restriction all match; proposal Impact (`proposal.md:157-165`) names all three indexes.

---

# MAJOR

**1. Repair 4 aligned task 6.1 to m10's amended requirement, but the requirement's own scenario — and three other artifacts — still name the clock m10 removed. The scenario is the test contract, so the defect is now *pinned by a test*.**

The requirement body (`openspec/changes/add-scan-and-sightings-surface/specs/system-space-view/spec.md:170-175`):

> "…SHALL show a countdown from that action's committed time to its ETA, measured against **this view's projected world time** (*Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously*'s scale-correct projection), **the inbox supplying the ETA and the committed time only**."

Its own first scenario (`:187-191`) was never touched by m10 and says the opposite:

> "**THEN** it counts down from **the served world time** to that ETA, using the action's own committed time and ETA"

The only world time the inbox serves is `action-dispatch`'s per-response `worldTime` (*Inbox by Actor Query Param*: "every response including the current world time") — a bare snapshot with **no scale**. The live requirement m10 redirected to is explicit that this is the defect: `openspec/specs/system-space-view/spec.md:273-282` — "**The current world time** SHALL be extrapolated from the most recent served reading at the **served world-clock scale**, never at an assumed scale of 1. **Both reads this view fans in carry the scale**" (the interior read and the fleet read — not the inbox).

Exploit: task 10.1 requires "client unit tests for sections 5–8 covering **every scenario** in the four spec deltas". An implementer writes the test straight from `:190`, anchors the countdown to `useRunningScan`'s served `worldTime`, and the spec's own scenario passes — a scan countdown that ticks at wall rate on a world clock whose scale is not 1, drifting further from the ETA the longer the view stays open, which is precisely the class the live requirement forbids. Nothing in the change then contradicts the test, because two more artifacts back the wrong reading:

- `tasks.md:185-190` (3.7): *"no client requirement measures anything against a scan-target read's world time — **the running sweep's countdown measures against the action inbox's own served world time** — so serving one here would be this chain's signature defect"*
- `design.md:229-232`: *"the only client requirement that measures against a served world time is the running sweep's countdown, which measures against the ***action inbox's*** own served world time, from the read that carries the ETA it counts to"*
- `specs/system-space-view/spec.md:211-212`: *"**GIVEN** a running scan action whose ETA is at or before **the served world time**"*

Fixes (smallest, four one-line edits; 3.7's and Decision 17's *conclusion* — serve no world time — is unaffected and in fact strengthened):

`specs/system-space-view/spec.md:187-191` →
```markdown
#### Scenario: The countdown spans the action's committed window
- **GIVEN** a running scan action with a committed time and an ETA
- **WHEN** the control is shown
- **THEN** it counts down to that ETA against the view's scale-correct
  projected world time, using the action's own committed time and ETA, and no
  world time the inbox served
```

`:211-212` → "**GIVEN** a running scan action whose ETA is at or before **the view's projected world time**".

`tasks.md:187-188` → "…— the running sweep's countdown measures against **the view's own scale-correct projected world time**, the inbox supplying only the ETA and the committed time —…".

`design.md:230-232` → "…the only client requirement that measures against a *served* world time is none: the running sweep's countdown measures against **this view's projected world time**, the inbox supplying only the ETA it counts to and the committed time it counts from."

---

# MINOR

**2. Decision 10's own counts went stale inside the repair that existed to fix stale counts (repairs 2 + 9 collide).**

`design.md:375-376`: *"**Two** of 8a-2's requirements are therefore **extended by addition** rather than edited:"* — followed by **six** bullets after repair 9 added two (it was already four before).

`design.md:398-401` (repair 9's own new bullet): *"This change adds *The Sweep Surface's Reads Fail Independently…* — **three more such reads** — rather than editing that count."* But repair 2, in the same revision, split the inbox read in two, so B1 (`specs/system-space-view/spec.md:636-638`) now enumerates **four**: the scan-target read, the running-status inbox read, the settled-status inbox read, and the system-filtered pile read.

No implementation follows design.md, so this is presentation — but finding 9 was filed precisely because a mis-stated count outlives the round that wrote it. Fix: `:375` → "**Six** of 8a-2's requirements"; `:400` → "— **four** more such reads —".

**3. `alreadySettled` became the sixth fizzle reason in the requirement, but "five" survives in the same requirement's explanatory paragraph and in the proposal.**

`specs/system-space-view/spec.md:346-350`: *"…every fizzle carries no reason code at all and this whole **five-way** mapping renders its unrecognized-code fallback"* — three lines below the enumeration that now names six, and eight lines above a scenario that says "each of those **six** reasons".

`proposal.md:98`: *"the settled sweep's outcome in player copy including all **five** served fizzle reason codes"*.

(`tasks.md:240`, `proposal.md:124` and `design.md:562` also say "five-way", but those are historical statements about the pre-`add-stationkeep-hold-verb` state of `reasonCode` and read correctly as such; 6.11's "distinct from the five" is internally coherent.) Fix: `:349` → "this whole **six-way** mapping"; `proposal.md:98` → "including all **six** served fizzle reason codes".

**4. The sixth reason code has a consumer requirement and no producer requirement — only a task.**

`grep` across `openspec/` finds `alreadySettled` in exactly two places: `tasks.md:267-274` (3.13) and `tasks.md:406-412` (6.11). No requirement anywhere obliges the server to emit it. Meanwhile `specs/system-space-view/spec.md:327-328` now requires client copy for *"a sweep a racing resolver had already settled"* as one of six **served** reason codes, and `:390-395` tests that all six differ. `focused-scan`'s *A Sweep Resolves Into Sightings, Or Fizzles* — the requirement that owns fizzle reason codes, and which this change already MODIFIES — enumerates only the five geometry/host/transit causes; the `f.Scan == nil` no-op path (`backend/fleet/resolver.go:144-146`, `return action.ResolveResult{Outcome: "scan already settled"}` with **no** `ReasonCode`) is outside its enumeration.

Exploit: an implementer working from the specs alone (the deltas are the contract; tasks are a worklist) never emits the code, the no-mint path keeps returning no reason code, and the client's filed-vs-fizzled rule (`:340-341` — absence of a code means "filed records") reports *"the sweep filed records"* over an empty log. That is the exact misreport task 3.13 was written to prevent, and no scenario in any capability fails. Task 9.2a's audit does not catch it: it audits **fields**, and `reasonCode` has both a producer and a consumer.

Smallest fix — one sentence appended to the already-MODIFIED *A Sweep Resolves Into Sightings, Or Fizzles* in `specs/focused-scan/spec.md` (after the fizzle enumeration ends at `:314`, leaving every scenario heading untouched):

```markdown
A resolve that finds the sweep already settled — the scanning fleet's stored
scan window cleared by a racing read before this resolver ran — SHALL likewise
mint nothing and SHALL carry its own reason code distinguishing it from every
fizzle above, so a consumer that treats an absent reason code as "records were
filed" cannot read a no-mint resolution as a successful one.

#### Scenario: A sweep already settled by a racing read carries its own reason code
- **GIVEN** a running scan whose scanning fleet no longer carries the scan
  window when the resolver runs
- **WHEN** the scan resolves
- **THEN** no sighting record is minted
- **AND** the resolved action carries a reason code distinct from every
  geometry, system, transit, and host-resolution reason code
```

---

**Verdict: NOT CLEAR** — 1 major, 3 minors. All nine round-5 repairs are present and correct as ruled, the second MODIFIED block is byte-verbatim on all seven scenario headings, the mixed case agrees across both requirements, 3.8a's index matches 4.6's read, and both gates pass. The one kill is not new scope: repair 4 fixed task 6.1's clock and left the requirement's own scenario, task 3.7, and design.md still naming the inbox's scale-free world time — so m10's defect is now specified in the artifact tests are written from.
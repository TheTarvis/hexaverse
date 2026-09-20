# `add-vitals-strip` — reliability review (panel round)

Reviewer: reliability. Scope, per the brief: this is a pure frontend change
with no new dependency, no cross-service call, no backend work, and no
rollout/migration surface — the usual dependency-timeout / retry / rollback
agenda has nothing to attach to. The lens here is narrow and specific:
**degradation behaviour and blast radius of a surface that is now always on
screen.**

Inputs read: `openspec/changes/add-vitals-strip/{proposal,design,tasks}.md`,
`specs/system-console/spec.md`, `specs/system-space-view/spec.md`,
`specs/docked-fleet-actions/spec.md`, `specs/figure-formatting/spec.md`;
`docs/plans/continous_space/handoffs/add-vitals-strip-{analysis,rulings}.md`;
live `openspec/specs/system-space-view/spec.md`; and code —
`frontend/components/space/SystemSpaceView.tsx`,
`frontend/hooks/use-world-time.ts`, `frontend/hooks/use-fleets.ts`,
`frontend/components/corporation-provider.tsx`,
`frontend/components/layout-wrapper.tsx`, `frontend/lib/format/figures.ts`.

**Headline conclusion.** The spec is disciplined about the *first-failure*
case (a read that has never resolved) — R1's "unserved roster reads absent",
R5's explicit anti-`?? 0` clause, R9's bespoke unavailable copy are all
correct and testable, and are a real improvement on link 1's shipped defect.
What is **not** specified — anywhere in this delta — is the *second-failure*
case: a read that resolved once and then errors on a later refetch, which is
the far more common real-world failure mode for an always-on strip that sits
through an entire play session. Chasing that gap down to the actual
`useQuery`/`useWorldTime` call sites this change wires into surfaces two
concrete, testable defects (Findings 1 and 3 below) — one of them a repeat,
in a new place, of the exact "unserved value renders as if it were a real
zero" species this project has already been bitten by once.

---

## Q1 — Does one failed read take the strip down?

**Mostly yes, it degrades correctly — with one gap.** `system-console`'s R1
states the invariant well and its own scenarios pin it per-cell, not just
"the strip renders":

> "The strip survives a failed interior read — **WHEN** the interior read
> fails **THEN** the strip is still rendered; the cells fed by the fleet read
> and the session are unchanged"

That's exactly the shape the review wants: a named cause, and a named
per-cell consequence. The renderer-unavailable scenario is equally concrete
("the strip is still rendered and its figures still read"). R4's pill
degradation is the strongest example in the whole delta:

> "An unresolvable host degrades the pill, it does not blank it — **WHEN**
> the acting fleet is docked but the interior read has failed, so the host
> cannot be named **THEN** the pill still reads the docked state, with the
> raw attachment id or no host label, never an empty pill"

That is a per-cell, inducible, non-adjective scenario — no finding there.

**The gap:** the own-fleets read — the dependency the fleet, fuel, and hold
cells actually live on — never gets a dedicated scenario. R1's opening SHALL
lists it among the conditions the strip must survive ("including … while the
own-fleets read has failed"), but no scenario exercises it the way the
interior-read and renderer scenarios do. Grepping the delta confirms it:

```
$ grep -n "own-fleets" specs/system-console/spec.md
19:interior read has failed, while the own-fleets read has failed, and while
26:- WHEN the view renders with interior, own-fleets, station, board and
```

"own-fleets read has failed" appears exactly once, in prose, and is never
turned into a scenario. The `system-space-view` fan-in delta's own
own-fleets-failure bullet is scoped to the fleet panel/roster region only
("the view SHALL show an error state in the fleet panel region … only the
own-fleet marks are absent") and never mentions the strip. Nothing pins what
the fleet/fuel/hold cells do when this specific read fails, as distinct from
the "no acting fleet in this system" case (a *successful* read that happens
to be empty) that R1's fourth scenario already covers. See Finding 1.

## Q2 — Is "absent" distinguishable from "zero" and from "stale"?

**Zero vs. absent: yes, and well.** R5 states the anti-pattern by name:

> "WHEN either figure is unavailable on the fleet read, the cell SHALL show
> that figure's absent form and the gauge SHALL render no fill, **rather
> than a zero fill indistinguishable from a dry fleet**."

and pins it with a scenario ("A dry fleet reads zero, distinguishably from
absent"). R9's credits cell goes further and gives "unavailable" its own
bespoke copy rather than the generic `—`, specifically so it can never be
confused with the em dash used elsewhere — also correct and intentional.

**Not-yet-loaded vs. never-resolved: correctly conflated.** Both render the
absent form under R5/R8's "has not yet served roster fields" language; that's
fine — a player doesn't need a different treatment for "still loading" vs.
"failed and never loaded," and giving them the same absent form is honest
(neither has a real value to show).

**Stale vs. currently-being-served: unaddressed, and the underlying data
layer actively defeats the distinction.** This is the finding the first two
checks don't catch, because it isn't about the *formatter* — `formatTons`,
`formatCredits`, etc. all correctly turn `undefined`/`null` into `—`. It's
about what value is actually *handed to* the formatter once a read has
succeeded once and then starts failing. Two call sites in code this change
wires directly into:

- `frontend/hooks/use-fleets.ts:22-26` — `useMyFleets()` is a bare
  `useQuery`, no `placeholderData`/`initialData` override. Standard React
  Query behaviour: `data` is retained across a failed refetch; only
  `isError` flips. `SystemSpaceView.tsx:268` — `const allFleets =
  useMemo(() => fleets.data ?? [], [fleets.data])` — never consults
  `fleets.isError`. So once the own-fleets read has succeeded once, a later
  failure leaves `allFleets`/`acting` populated with the **last-known, now
  stale** fleet — fuel, hold, and identity all included.
- `frontend/components/corporation-provider.tsx:56-66` — same shape:
  `data` (hence `corporation`) survives a failed background refetch;
  `isError` is exposed as a **separate** field specifically so a consumer
  can tell "resolved-but-stale" from "resolved-and-fresh." This is
  documented, not accidental — `layout-wrapper.tsx:70-74`:

  > "D6/B1 — a corp-lookup error (5xx/network) is not evidence of
  > corplessness … **a background refetch failure while a corporation is
  > already resolved keeps serving the resolved app.**"

  `SystemSpaceView.tsx:655-657` inherits that same policy for the credits
  figure: `const credits = corporation?.credits ?? null` — this never
  reads `corporation.isError`, so it can only ever be `null` before the
  *first* successful resolve. After that, a failed background refetch is
  invisible to this expression.

So `system-console` R9's own condition — "IF the session balance is
unavailable, THEN the cell SHALL show an explicit unavailable indication" —
describes a branch that, given the app's existing, documented policy, can
only ever fire once per session (before first load). The credits cell's
mandated unavailable copy is therefore close to dead code for the far more
common case: a read that goes bad *after* the player has been looking at a
number for a while. Same shape for fuel/hold/the fleet id. See Findings 1
and 2.

## Q3 — Is the "drain" spec testable and not an animation licence?

**Yes — this is the best-specified requirement in the delta and needs no
finding.** R7's text is explicit both ways — what the cell may show, and
what it may not compute:

> "WHILE the acting fleet's effective state is a burn, the system SHALL mark
> the fuel cell as draining and SHALL update its figure and its gauge fill
> **only when a read serves new values**. The client SHALL NOT interpolate,
> extrapolate, or otherwise compute fuel consumed in flight: fuel per unit of
> delta-v is a rule-bearing `backend/space` computation and no client mirror
> of it exists."

and the scenario is phrased as a negative, inducible test rather than a
description of an outage:

> "The figure moves only when a read lands — **WHEN** world time advances
> between two refetches while the fleet burns **THEN** the fuel figure and
> its `data-raw` are unchanged, and change on the next served read"

Because the fill and the figure are explicitly pinned to "only … when a read
serves new values," an implementation that interpolates the gauge fails this
scenario outright — it can't be satisfied by a client-side animation, which
is exactly what the review asked to rule out. The "draining marker" itself is
left unspecified in *form* (icon vs. label), but since the requirement
already forbids that marker from being the fill or the figure, there's no
room for it to smuggle in an interpolated number. No finding.

## Q4 — Staleness of a figure the player will act on

Covered mostly by Q2's finding — the mechanism is the same defect wearing a
decision-consequence hat. Two things specifically in scope here:

- **Post-settlement refresh is well-specified.** `Sell Commit`/`Refuel
  Commit`'s scenarios ("A successful sale refreshes hold and balance," "A
  successful refuel refreshes hold, range, and balance") correctly point the
  refresh at the strip's cells and require no navigation. This is a
  commit-triggered refetch, not a poll, so it isn't subject to the
  live-subscription/baseline-interval numbers the (unmodified, inherited)
  *Realtime Refetch Rules While the Space View Is Open* requirement leaves
  unbounded — that requirement predates this change and isn't touched by it,
  so it's out of scope for this review.
- **The burn-cost overlay boundary is respected.** Nothing in this delta's
  text can be read as specifying quote staleness for a preview figure —
  `add-vitals-strip` ships a plain gauge with no cost segment, and the
  proposal's Out of Scope section is explicit that the overlay and its
  stale-preview handling are `add-burn-cost-overlay`'s. Correct split, no
  finding.
- **What is in scope and unaddressed:** the fuel/hold/credits figures a
  player reads to decide "can I afford this" go stale, silently, the moment
  the read that fed them errors on any refetch *after* the first successful
  one — see Findings 1 and 2. This is the concrete form Q4 is asking about:
  a figure the player acts on, that can sit stale with no way for the player
  to tell.

## Q5 — Observability

**No requirement recommended, deliberately, not by omission.** This is a
pure client presentation surface: no new backend endpoint, metric surface,
or service dependency is introduced, and the repo has no client-side
telemetry/error-reporting pipeline referenced anywhere in `frontend/CLAUDE.md`
or this change's own design doc for a requirement to bind to. The player-
facing observability that *does* apply — distinguishing absent from zero,
retry affordances on the reads that already have them, live regions for the
credits cell's own transitions — is exactly what R1/R5/R8/R9 already specify,
and Findings 1-2 below extend that same, already-established pattern rather
than asking for new infrastructure. Proposing a "such that failures are
countable" SHALL here would bind to a logging/metrics pipeline this repo
doesn't have for the frontend — the "requirement nobody implements" case the
brief warns against. No finding.

---

## Findings by severity

### BLOCKER — the credits cell's "unavailable" branch cannot fire for the common failure case

**Attaches to:** `system-console` — *The Credits Cell Shows the
Corporation's Served Balance and Announces Its Changes* (R9).

**Quote (current text):**

> "IF the session balance is unavailable, THEN the cell SHALL show an
> explicit unavailable indication and SHALL NOT show a figure — never
> `figure-formatting`'s generic absent form in place of this capability's
> own mandated copy."

**Why this is a BLOCKER, not a MAJOR.** The credits figure is the one this
change itself describes as driving a real decision (sell/refuel afford-
ability). "Unavailable," as the requirement stands, has no stated operational
definition, and the one the mounting view will actually implement —
`corporation?.credits ?? null` at `SystemSpaceView.tsx:657` — is a direct
carry-forward of `docked-fleet-actions`' pre-existing behaviour, which
provably cannot express "session read errored after a prior success":
`corporation-provider.tsx` exposes a separate `isError` field *for exactly
this case* (its own comment: "a corp-lookup error … distinct from the
genuine 'no living corporation yet' signal"), and `layout-wrapper.tsx`
documents, as a deliberate app-wide policy, that this state is swallowed
once a corp has resolved once: "a background refetch failure while a
corporation is already resolved keeps serving the resolved app." Under that
policy, once the player has spawned, R9's unavailable branch is reachable
only during the single narrow window before the very first successful
resolve — never again for the rest of the session. A stale, wrong-by-however-
long balance will sit on screen, formatted exactly like a fresh one, through
every subsequent session-read failure, with no other surface in the app
correcting it (unlike the own-fleets case below, nothing else on the space
view shows a corp-session error).

**Proposed replacement text** (add to R9's body, after the existing
"unavailable" sentence):

```
"Unavailable" SHALL include both a session read that has never resolved and
one that resolved once and has since failed to refresh: the credits cell
SHALL NOT continue presenting a balance served by an earlier successful read
as current once that read's most recent attempt has failed, even though a
cached value remains available to render. The mounting view SHALL supply the
session read's error state to the strip alongside its cached balance, so the
strip can distinguish "currently unavailable, no cached value" from
"currently unavailable, showing what was last confirmed" — the latter SHALL
still show the explicit unavailable indication, not the stale figure.
```

**Proposed new scenario** (append under R9):

```
#### Scenario: A stale session read is never presented as a current balance
- **GIVEN** the corporation session read has previously resolved a balance
- **WHEN** a later refetch of that read fails
- **THEN** the credits cell shows the explicit unavailable indication, not
  the balance from the earlier successful read presented as current
```

**Implementation cost / task-budget note.** This does not require new UI —
R9's unavailable-indication rendering already exists as a planned deliverable
(task 6.1). The only change is which boolean drives it:
`SystemSpaceView.tsx:657`'s `credits` derivation needs to consult
`useCorporationOptional`'s (currently discarded) `isError`/`error` fields —
the context already exposes them (`corporation-provider.tsx:22-29`) — rather
than only `corporation?.credits`. This is a data-flow correction inside task
8.1's existing wiring plus one test case at task 6.4, not a new feature; it
should not need to grow the 40-task cap or defer to a later link.

---

### MAJOR — no scenario pins the strip's behaviour when the own-fleets read fails, and the same "stale-shown-as-current" gap applies to the fleet/fuel/hold cells

**Attaches to:** `system-console` — *The Vitals Strip Is Present on Every
Render of the System Space View* (R1); `system-space-view` — *System Space
View Route and Data Fan-In* (MODIFIED).

**Quote (R1, current text):** "…on every render of that view, including
while the interior read has failed, while **the own-fleets read has
failed**, and while the renderer is unavailable." — stated once, in prose,
and never exercised by a scenario the way the interior-read and
renderer-unavailable conditions each are.

**Quote (fan-in, current text):** "IF the own-fleets read fails, THEN the
view SHALL show an error state in the fleet panel region, with its own retry
affordance, and SHALL continue to render the interior's bodies, lane gates,
and contacts; only the own-fleet marks are absent." — scoped to the fleet
panel/canvas; the strip is not mentioned.

Same underlying mechanism as the BLOCKER above: `useMyFleets()`
(`use-fleets.ts:22-26`) is a bare `useQuery`; `SystemSpaceView.tsx:268`'s
`allFleets = fleets.data ?? []` never consults `fleets.isError`, so a
background refetch failure after the own-fleets read has succeeded once
leaves the fleet/fuel/hold cells silently showing the last-known — possibly
stale — id, fuel, and hold, indistinguishable from a fresh read. This is
graded MAJOR rather than BLOCKER because the fan-in requirement's own
own-fleets-failure clause *does* put a competing error surface on screen
elsewhere (the fleet panel region), so a player has one other place to
notice something is wrong — but the strip itself, which design.md calls "a
single instrument the player reads while planning," gives no such signal.

**Proposed replacement text** (R1, replace the second sentence of the
requirement body):

```
A cell whose served input is unavailable — because it has never been
served, or because a read that previously served it has since failed to
refresh — SHALL render `figure-formatting`'s absent form for its figures
(or, for the credits cell, its own mandated unavailable copy) rather than
continuing to present the last-served figures as current, so the strip's
cell set is fixed and a player never has to work out which instrument
disappeared, or trust a figure that is silently out of date.
```

**Proposed new scenarios** (append under R1):

```
#### Scenario: The strip survives a failed own-fleets read
- **WHEN** the own-fleets read fails
- **THEN** the strip is still rendered; the fleet, fuel, and hold cells —
  the cells this read feeds — show `figure-formatting`'s absent form when
  no own-fleets data has ever been served for the acting fleet

#### Scenario: A stale own-fleets read is never presented as current
- **GIVEN** the own-fleets read has previously succeeded for the acting
  fleet
- **WHEN** a later refetch of that read fails
- **THEN** the fleet, fuel, and hold cells show the absent form rather than
  continuing to present the last-served figures as current
```

**Proposed addition to the `system-space-view` fan-in requirement's
own-fleets bullet** (append a clause):

```
…only the own-fleet marks are absent. The vitals strip's fleet, fuel, and
hold cells — also fed by this read — degrade the same way: absent when no
own-fleets data has ever been served, and never presenting a figure served
by an earlier successful read as current once that read's most recent
attempt has failed.
```

**Implementation cost / task-budget note.** Same shape as the BLOCKER above
— the absent-form rendering path already exists as a deliverable of tasks
4.2/5.2/7.1; the fix is wiring `fleets.isError` alongside `fleets.data` into
what's passed to the strip at task 8.1, plus one or two test cases at 7.4.
No new component, no defer needed.

---

### MAJOR — the clock cell can silently show `T+ 0d 00:00` when world time has never been served — the same species as link 1's `?? 0` defect, in a new place

**Attaches to:** `system-console` — *The Clock Cell Shows the Absolute World
Instant at Its Served Scale* (R10).

**Quote (current text):** "WHEN no world-clock scale has been served, the
stamp SHALL still render its `T+ Dd HH:MM` portion with the absent suffix
`×—`." — this is the *only* absent-input case R10 names, and it addresses a
missing **scale**, not a missing **world time**.

**Evidence this is a live gap, not a hypothetical one.**
`SystemSpaceView.tsx:414-417`:

```
const clockScale = interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale ?? 1
const servedScale: number | undefined = interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale
const serverWorldTime = interior.data?.worldTime ?? acting?.worldTime ?? allFleets[0]?.worldTime
const worldTime = useWorldTime(serverWorldTime, { scale: clockScale })
```

`serverWorldTime` is `undefined` whenever *both* the interior read and the
own-fleets read have not yet resolved (or have failed) — a state every fresh
page load passes through, and a state a dependency outage (both reads down
at once) can hold indefinitely. `frontend/hooks/use-world-time.ts:57`:

```
const [worldTime, setWorldTime] = useState<number>(serverWorldTime ?? 0)
```

`useWorldTime(undefined, …)` returns a real, defined `0` — not `undefined` —
because the anchor effect (`use-world-time.ts:60-64`) never fires and the
animation effect (`66-75`) only ticks `if (anchor.current)`, which stays
`null`. `R10`'s clock cell is specified to render "the mounting view's
**projected world time**" carrying "its raw world-millisecond value" — that
is exactly this `worldTime` variable. `formatInstant(0, …)` is a perfectly
valid, finite input, so it renders `T+ 0d 00:00` (plus `×—` if the scale is
also absent) — a real-looking timestamp, not `figure-formatting`'s absent
form, for a value that was never actually served. This is the identical
defect shape link 1 shipped and review caught (`?? 0` rendering `"0t fuel"`
for an unavailable roster), now reachable through `useWorldTime`'s internal
default rather than through the strip's own code.

**Proposed replacement text** (add to R10's body, before the existing
"WHEN no world-clock scale…" sentence):

```
WHEN no world time has ever been served — the mounting view holds no
successful interior or own-fleets read to derive one from — the clock cell
SHALL show `figure-formatting`'s absent form for the whole stamp, never
`T+ 0d 00:00`: a client-local default used to drive the ticking animation
before any read has landed is not a served value and SHALL NOT be presented
as one.
```

**Proposed new scenario** (append under R10):

```
#### Scenario: With no world time ever served, the whole stamp reads absent
- **WHEN** the mounting view has not yet received a world time from any
  read
- **THEN** the clock cell shows `figure-formatting`'s absent form for the
  whole stamp, not `T+ 0d 00:00`
```

**Implementation cost / task-budget note.** Cheap and local — this does not
require changing `useWorldTime`'s signature (which other callers rely on
for animation and shouldn't be touched by this change). `SystemSpaceView.tsx`
already computes `serverWorldTime`; the fix is tracking whether it has ever
been defined (a `hasWorldTimeRef`/boolean latched true the first time
`serverWorldTime !== undefined`) and passing `undefined` — not `worldTime`
— as the clock cell's raw value until that latch flips. One boolean, no new
component; folds into task 6.3/6.4.

---

### MINOR — the interior read is a real (if secondary) strip dependency that the fan-in requirement's canonical "driven by" list omits

**Attaches to:** `system-space-view` — *System Space View Route and Data
Fan-In* (MODIFIED).

**Quote (current text):** "The vitals strip this view mounts
(`system-console`) SHALL be driven by the own-fleets read, the corporation
session read, and the world clock and its served scale, alongside every
other reader of those same reads."

This sentence is the fan-in requirement's own inventory of what drives the
strip, and it names three reads. But `system-console` R4 makes the pill's
docked-host name a direct consumer of the interior read too ("WHEN the
acting fleet is parked with `attachedTo` set and the interior read resolves
that host … THEN the pill reads the docked state naming that host," with its
own degradation scenario for when that read fails). The dependency is fully
specified where it's used (R4) — this is not a behaviour gap, just an
inventory omission in the one sentence a reader would check to get the
strip's complete dependency list, which is exactly the kind of thing a
reliability read exists to catch before it causes a reviewer to reason about
blast radius from an incomplete list.

**Proposed replacement text:**

```
The vitals strip this view mounts (`system-console`) SHALL be driven by the
own-fleets read, the corporation session read, and the world clock and its
served scale, alongside every other reader of those same reads; the fleet
cell's state pill additionally reads the interior read to resolve a docked
host's name, degrading per `system-console`'s own host-resolution scenario
rather than blanking when that read fails.
```

No new scenario needed — R4 already carries the scenario this sentence
cross-references.

---

## Deferral assessment against the 40-task cap

None of the four findings above need to defer to `add-burn-cost-overlay` or
`add-console-dock`. Each proposed fix reuses a rendering path (absent form /
unavailable copy) this change is already building, and each traces to a
one- or two-line correction in data already flowing through the wiring tasks
this change already has (8.1, 6.1, 6.3) plus one test case apiece (6.4, 7.4)
— not a new UI affordance, a new query, or a new dependency. If the panel
disagrees and wants a visible staleness indicator (e.g., a distinct visual
treatment beyond "unavailable copy" for "stale-but-was-fresh") rather than
folding staleness into the existing unavailable/absent paths, that richer
treatment is a reasonable candidate to defer to `add-console-dock`, which
has more surface (tabs, detail panels) to carry it — but the minimum fix
proposed here (treat a stale-after-success read as unavailable, not as
current) fits inside this change's existing budget.

---

## Verdict

**NEEDS FAILURE SPECS.**

Nothing here is a data-loss or irreversible-rollout BLOCKER in the
traditional sense — this is a read-only presentation surface — but the
credits-cell finding is graded BLOCKER because its failure mode is common
(any background session-read hiccup after spawn), silent (no other surface
in the app corrects it, by the app's own documented policy), and feeds a
real affordability decision with a stale number formatted identically to a
fresh one. The two MAJOR findings are the same defect species reaching the
fleet/fuel/hold cells and the clock cell respectively — one of them a literal
repeat of a defect this project has already shipped and caught once. All
four findings have cheap, in-budget fixes that reuse rendering paths this
change is already building; none require new dependencies, new components,
or a scope cut.

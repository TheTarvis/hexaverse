# `add-vitals-strip` — adversary round 1

Target per `docs/plans/system-hud/chain.md` ("Why 2 is two links"): **does the
strip lie about state.** Inputs read: the four delta files, `proposal.md`,
`design.md`, `tasks.md`, the 24 rulings, the panel consolidation and the
architect report, the live `docked-fleet-actions` / `fleet-roster` /
`figure-formatting` / `system-space-view` specs, and the served shapes
(`frontend/lib/types/fleet.ts`, `frontend/lib/types/system-space.ts`,
`components/fleet/roster-status.ts`, `components/corporation-provider.tsx`,
`components/space/SystemSpaceView.tsx`).

**Verdict: NEEDS REVISION** — 2 BLOCKER, 5 MAJOR, 5 MINOR. Both BLOCKERs land
on the state pill, which is the one element whose correctness claim this link
exists to make.

---

## BLOCKER 1 — the pill's docked state names a host name that does not exist on any wire, and the design doc never asked for one

**Lands on:** `specs/system-console/spec.md`, *The Fleet Cell's State Pill Is a
Projection of the Shared Roster Derivation* — requirement body and its first
scenario.

**Quoted:**

> The pill's states are: docked (naming the host where the view can resolve
> it), under way (naming the burn's served target — the served body id,
> **resolved to that body's name where the interior read resolves it** …

> #### Scenario: A docked fleet's pill names its host
> - **WHEN** the acting fleet is parked with `attachedTo` set and the interior
>   read resolves that host
> - **THEN** the pill reads the docked state naming that host

**Why it fails.** No body in this game has a name on the wire.
`frontend/lib/types/system-space.ts`'s `SpaceBody` carries `id`, `type`,
`resources`, `effects`, `space`, `size`, `orbitElements` — no `name`.
`SpaceLaneGate` carries `id`, `destSystemId`, `laneId`, `space`, `size`,
`orbitElements` — no `name`. `grep -rn "featureName\|bodyName\|hostName"` over
`frontend/components` and `frontend/lib` returns nothing. There is no such
thing as "the interior read resolving a host to a name", so the requirement's
happy path is not a state an implementation can enter, and its degraded
sibling —

> #### Scenario: An unresolvable host degrades the pill, it does not blank it
> - **THEN** the pill still reads the docked state, with the raw attachment id
>   or no host label, never an empty pill

— is the *only* reachable render. Every docked pill degrades, forever, and both
scenarios pass. That is the definition of a scenario that cannot fail.

Two compounding facts make this worse, not better:

1. **The design doc asked for the opposite.** `docs/plans/system-hud.md`
   Surface 1 gives the pill's worked examples as `Docked · Gate sys_2_0` and
   `Burning · feat-extra-0 · 2m 40s` — a *type word plus a served id*, and for
   a gate the served `destSystemId`. The spec's "resolved to that body's name"
   is invented behaviour with no design-doc support and no wire support. This
   change already made exactly the right call one paragraph earlier for the
   fleet ("no fleet name exists on the wire … and this capability SHALL NOT
   synthesise a client-side display name for one"); the same fact one line down
   was not applied.
2. **The only input `design.md` names cannot resolve a gate or the station at
   all.** Decision 6's table routes the docked host's name to
   `SystemSpaceView.tsx:625`'s `dockedFeature`, which is
   `interior.data.features.find(f => f.id === acting.attachedTo)`. Lane gates
   live in `interior.data.laneGates`, not `features`. So the design doc's own
   headline example — `Docked · Gate sys_2_0`, a fleet parked at a gate, which
   is the state every jump passes through — resolves to `null` and degrades,
   and nothing in the spec or tasks says which collections the host is looked
   up in.

**What an implementer could ship and still satisfy the spec:** `Docked ·
feat-station-0` in every case, including at the home station and at a gate,
with the primary scenario "satisfied" on the reading that an id *is* a name.

**Smallest fix.** Re-scope to what is served, exactly as the fleet identity was
re-scoped, and name the lookup surface:

```
docked (naming the host as its served `type` word and its served id, and, for
a lane-gate host, the destination system's name from the galaxy read — no
client-side display name is synthesised, since no body on the interior read
carries a name), under way (naming the burn's served target — the served body
id, or an explicit "a point in space" …
```

and replace the first scenario's WHEN/THEN with a concrete pair (a fleet
attached to a `laneGates` entry reads `Docked · Gate <destination system
name>`; a fleet attached to a `features` entry reads `Docked · <type> <id>`),
with the degraded scenario re-pointed at an `attachedTo` that matches neither
collection.

---

## BLOCKER 2 — the pill's props signature, as pinned in three places, cannot render the countdown, the rate, or the host label it is required to render

**Lands on:** `specs/system-console/spec.md`, same requirement; `design.md`
Decision 5; `tasks.md` 3.1 and 1.1.

**Quoted (spec):**

> and SHALL render from that derivation's output value alone — the pill SHALL
> NOT be supplied the fleet record …

> #### Scenario: The pill is a function of the derivation's output alone
> - **WHEN** the pill is rendered for each, **supplied only that output value
>   and the served `stranded` flag**

**Quoted (design.md Decision 5):** `VitalsStripPill({ status, stranded })`
where `status: RosterRowStatus` and `stranded: boolean`.

**Quoted (tasks.md 3.1):** "Render the pill from a props signature of **exactly**
the derivation's return value plus the served `stranded` flag".

**Why it fails.** Three of this requirement's own scenarios need inputs that
signature excludes:

- **The scale.** `figure-formatting`'s *A Figure Whose Clock Scale Has Not Been
  Served Reads as Absent* says "The duration formatter and the rate formatter
  each take the scale as a **required argument** … a call site holding no
  served scale for such a figure SHALL NOT call the formatter with an assumed
  scale of 1". `RosterRowStatus` is scale-free by construction
  (`roster-status.ts` returns raw `remainingMs`; the roster row formats at the
  mounting view's `servedScale`). A pill with props `{status, stranded}` can
  therefore render *only* the absent form for `world-ms-span-left` and
  `tons-per-world-s` — which makes *A burning fleet's pill counts down to its
  served arrival*, *A station-keeping fleet's pill shows the served upkeep
  rate* and *A mining fleet's pill counts down to the run's ETA* unsatisfiable,
  while *The pill's countdown and rate read absent until a scale is served*
  becomes vacuously always-true. Task 3.4 asks the developer to test both sides
  of a distinction the signature deletes.
- **The host label.** Task 1.1 extends the derivation with "the docked host's
  **id**". Under BLOCKER 1's fix the pill needs the resolved label, which means
  either the derivation takes a host-name resolver (it already takes `nameOf`
  for systems, so this is the cheap route) or the pill takes a label prop —
  neither of which the pinned signature admits.

The developer will resolve this silently, in one of two divergent directions:
pass `scale` anyway (and the property scenario's "supplied only …" is false as
written, so the test that is meant to close the invariant is written loose and
proves nothing) or obey task 3.1 (and ship a pill whose every countdown reads
`—`, or one that formats at an assumed scale of 1 — the exact violation link 1
spent a round closing).

**Smallest fix.** Say what the pill may see, positively and completely, in all
three places: `VitalsStripPill({ status, stranded, scale })`, `status`
carrying the resolved host label, and amend the property scenario's WHEN to
"supplied only that output value, the served `stranded` flag, and the served
world-clock scale — never a `Fleet`". The invariant survives (nothing
fleet-shaped is reachable); the three scenarios become implementable.

---

## MAJOR 3 — the third boundary leak: the width-floor scenario asserts a surface link 2b deletes

**Lands on:** `specs/system-console/spec.md`, *The Strip Is Laptop-First and
Never Overflows the View*, second scenario.

**Quoted:**

> - **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with **the
>   command column**, the camera cluster, and a failed sightings read all
>   present
> - **THEN** no cell of the strip is overlapped by any of them, and **each of
>   those surfaces remains fully visible and activatable itself**

**Why it fails.** `docs/plans/system-hud/chain.md` link 2b: "The right column
(`inset-y-4 right-4 … w-72`) is **deleted**." One link later this scenario's
WHEN names a surface that does not exist and its THEN asserts that surface
stays visible and activatable, so link 2b must MODIFY a `system-console`
requirement that this change is about to make live — the same mis-drawing the
architect caught twice (MAJOR 1: the no-verb scenario asserting where the verbs
live; MAJOR 2: the strip pinned to the viewport's bottom edge). The durable
claim is that *whatever else the view floats*, no floating surface occludes a
strip cell and no strip cell occludes a floating surface's own affordance.

**Smallest fix.** Make the WHEN quantify rather than enumerate:

```
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with every
  floating surface the view mounts present, including one carrying a retry
  affordance
- **THEN** no cell of the strip is overlapped by any of them, and every such
  surface remains fully visible and activatable itself
```

(`design.md` Decision 8 keeps the three-occupant inventory, which is where the
per-link detail belongs.)

---

## MAJOR 4 — the strip's stale-read rule stops at the credits cell; the pill and the chevron menu have none

**Lands on:** `specs/system-console/spec.md`, the pill requirement and the
chevron requirement, read against the credits requirement and the
`system-space-view` fan-in delta.

**Quoted (credits — the rule that exists):**

> "Unavailable" SHALL include both a session read that has never resolved and
> one that resolved once and has since failed to refresh: the credits cell
> SHALL NOT continue presenting a balance served by an earlier successful read
> as current once that read's most recent attempt has failed …

**Quoted (fan-in delta — the rule as it reaches the strip's other cells):**

> The vitals strip's fleet, fuel, and hold cells — also fed by this read —
> degrade the same way: absent when no own-fleets data has ever been served,
> and never presenting a **figure** served by an earlier successful read as
> current once that read's most recent attempt has failed.

**Why it fails.** The pill is not a figure and its state name is not covered by
either sentence. `system-console`'s own always-present scenario says only that
on a failed own-fleets read "its fleet, fuel and hold cells show the absent
form exactly as the no-acting-fleet case does" — and the no-acting-fleet case
it points at (scenario 5) specifies only "the fleet cell's **identity** and its
fuel and hold figures". So after a failed refetch of the own-fleets read —
the ordinary case, since react-query retains `data` and raises `isError`
(`corporation-provider.tsx` documents the same policy for the session read) —
three implementations all satisfy the spec: the pill disappears, the pill
freezes, or the pill keeps counting down toward an arrival the strip can no
longer confirm, beside a fuel cell that has already gone `—`. The third is the
link's named failure mode rendered literally: a stale value formatted
identically to a fresh one.

The chevron inherits the same hole. Its menu is fed by that read
("The menu's membership … SHALL reflect the requester's own-fleets read as
most recently resolved"), and on a failed refetch the spec cannot decide
between scenario 6's empty menu and a list of fleets whose positions — which
determine each entry's *destination* — are no longer confirmed.

**Smallest fix.** One clause on the pill requirement and one scenario:

```
WHEN the own-fleets read's most recent attempt has failed, the pill SHALL show
the absent form in place of its state, never a state derived from an earlier
successful read presented as current; the chevron's menu SHALL likewise offer
no entry whose destination is drawn from that read.

#### Scenario: A failed refetch retires the pill rather than freezing it
- **GIVEN** the acting fleet's pill reading the under-way state with a
  countdown
- **WHEN** the own-fleets read's next attempt fails
- **THEN** the pill shows the absent form, not the last-served state, and no
  countdown continues to run
```

---

## MAJOR 5 — "counts down" is asserted as a single value; a pill and clock frozen between reads pass every scenario

**Lands on:** `specs/system-console/spec.md`, the pill requirement's burn,
mine and jump scenarios, and *The Clock Cell Shows the Absolute World Instant
at Its Served Scale*.

**Quoted:**

> #### Scenario: A burning fleet's pill counts down to its served arrival
> - **WHEN** the acting fleet's effective state is a burn
> - **THEN** the pill names the burn's served target and a remaining duration
>   presented per `figure-formatting` (`world-ms-span-left`) carrying its raw
>   unscaled world-millisecond span

**Why it fails.** Every time-bearing scenario in this capability asserts a
value at one instant. Nothing anywhere requires a duration or the clock stamp
to *move* between reads. `SystemSpaceView.tsx:415` computes two clocks — the
projected `worldTime` (`useWorldTime`, which advances) and the read-time
`serverWorldTime` (which does not) — and the strip is handed both under task
8.1. An implementer who passes `serverWorldTime` into the derivation ships a
pill that reads `2m 40s left` unchanged for the whole baseline poll interval
and then jumps, and a clock that stamps the last read rather than now; both
pass every scenario as written and both are stale values formatted identically
to fresh ones. The asymmetry is the tell: the fuel cell got an explicit
*negative* rule ("update its figure and its gauge fill **only** when a read
serves new values") precisely because that behaviour needed pinning — and the
figures that must do the opposite got no positive rule at all. The chain doc's
journey ("watch the pill flip to the burning state and **count down**") is
therefore unbacked by any requirement.

**Smallest fix.** One clause plus one scenario on the pill requirement, and the
same clause on the clock cell:

```
A duration the pill renders SHALL be computed against the mounting view's
projected world clock, so it advances between reads without a refetch.

#### Scenario: The countdown advances between reads
- **GIVEN** a burning acting fleet whose pill shows a remaining duration
- **WHEN** the projected world clock advances with no read landing
- **THEN** the pill's remaining duration and its `data-raw` have decreased by
  the elapsed world-millisecond span
```

---

## MAJOR 6 — the fuel gauge's no-data scenario cannot fail for the implementation the requirement forbids

**Lands on:** `specs/system-console/spec.md`, *The Fuel Cell Shows the Served
Fuel Tonnage and Estimated Range Over a Gauge*, last scenario.

**Quoted (requirement's stated purpose):**

> … so a gauge with no fill is distinguishable by inspecting the gauge in
> isolation **from a gauge whose fill happens to render very thin**.

**Quoted (the scenario that is supposed to prove it):**

> #### Scenario: The gauge's no-data state is DOM-distinguishable from a rendered fill
> - **WHEN** the fuel gauge is inspected once for an unserved roster or a fleet
>   holding no fuel, and once **for a served fuel tonnage**
> - **THEN** the two renders differ in a DOM-observable attribute of the gauge
>   element, not only in the adjacent figure's text

**Why it fails.** `design.md` Decision 1 requires the fill to be expressed as
inline `style={{ width }}`. `style` *is* a DOM-observable attribute of the
gauge element. So an implementation that adds **no state attribute at all**
passes this scenario — `style="width:0%"` differs from `style="width:23%"` —
and is exactly the implementation the requirement's own rationale forbids,
because at 0.05 t of a 200 t capacity the thin fill and the no-fill render
converge again. This is link 1's taught record repeating ("its test asserted
only that the two figures *differed*, which both the wrong and right
implementations satisfy — assert the *value*, not the difference"). Note the
hold cell's twin scenario does **not** have this defect: both of its renders
have zero segments, so no width difference exists to ride on.

**Smallest fix.** Pick the pathological pair and assert the value:

```
#### Scenario: The gauge's no-data state is DOM-distinguishable from a sub-pixel fill
- **WHEN** the fuel gauge is inspected once for an unserved roster and once for
  a served fuel tonnage whose fill rounds to less than one pixel at the
  1280-px width floor (0.05 t against a 200 t capacity)
- **THEN** the gauge element's state attribute reads its no-data value in the
  first render and its rendered-fill value in the second, and the two renders
  are distinguishable by that attribute alone, with the fill geometry ignored
```

(and name the attribute's three values in the requirement, as `design.md`
Decision 1 already does, so the test asserts values rather than inequality.)

---

## MAJOR 7 — the credits cell's staleness rule has no reachable implementation path, and its only task names an API that cannot supply it

**Lands on:** `tasks.md` 6.1 and `proposal.md`'s Impact, against
`specs/system-console/spec.md`'s credits requirement.

**Quoted (tasks.md 6.1):**

> … consulting `useCorporationOptional`'s `isError`/cached-balance fields, not
> only `corporation?.credits` …

**Why it fails.** `useCorporationOptional` has no such fields:
`components/corporation-provider.tsx` defines it as
`useContext(CorporationContext)?.corporation ?? null` — it returns
`Corporation | null`, and `Corporation` (`lib/types/corporation.ts`) carries
`credits`, not `isError`. `isError`/`error`/`refetch` live on
`CorporationContextValue`, and **`CorporationContext` is not exported**; the
only accessor that reaches it, `useCorporationContext`, *throws* when no
provider is mounted — which is the documented reason the space view uses the
optional accessor in the first place ("The board's real job is moving fleets;
it must not go blank because a balance readout could not find its provider").

So the single requirement the panel elevated to BLOCKER (B5, the stale balance
feeding an affordability decision) is implementable only by editing
`components/corporation-provider.tsx` — a file that appears nowhere in
`proposal.md`'s "Affected code", and a shared session provider every route in
the app mounts. The developer either edits it outside the change's declared
impact or, following 6.1 literally, discovers the field does not exist and
improvises.

**Smallest fix.** Task 6.1 names the real mechanism — "add a
`useCorporationSessionOptional()` accessor beside `useCorporationOptional`
returning `{ corporation, isError }` without throwing, and consume it in
`SystemSpaceView`" — and `proposal.md`'s Impact adds
`frontend/components/corporation-provider.tsx`.

---

## MAJOR 8 — nothing says what a chevron menu entry says, while the fan-in delta promises the galaxy read feeds the fleet cell

**Lands on:** `specs/system-console/spec.md`, *The Fleet Cell Names the Acting
Fleet and Delegates a Switch to the Mounting View*, against the
`system-space-view` fan-in delta.

**Quoted (fan-in delta):**

> - **The galaxy graph** … used only to resolve a system id to a display name
>   for the fleet roster's rows, **the vitals strip's fleet cell**, and the
>   sighting log.

**Quoted (the chevron requirement, in full, on entry content):**

> a chevron affordance that opens a menu of every fleet the requester owns …
> The menu's membership and each entry's **destination** SHALL reflect the
> requester's own-fleets read as most recently resolved …

**Why it fails.** No requirement in `system-console` renders a system name
anywhere, so the fan-in delta's promise is unkept by the capability that owns
the surface — one delta of this change asserts a behaviour another delta of the
same change never requires. Concretely: the menu lists *every* owned fleet,
including fleets whose entry navigates the player out of this system entirely,
and no clause says an entry names its fleet, its system, or anything at all. An
implementer ships entries reading `fleet-3`, `fleet-7`, `fleet-11` and
satisfies every scenario ("every fleet the requester owns appears as an entry"
is countable), while the player commits a route change blind. The scenarios are
also untestable as written — nothing lets a test identify *which* entry is the
one for the fleet in another system.

**Smallest fix.** One clause and one scenario:

```
Each menu entry SHALL name its fleet by its served id and the display name of
the system it is in — resolved from the galaxy read, falling back to the raw
system id when that read has not resolved — and, for a fleet in lane transit,
that it is under way between systems, so a player choosing an entry that
navigates knows where it goes before choosing it.

#### Scenario: A menu entry names its fleet's system before it navigates
- **WHEN** the chevron's menu is opened while the requester owns a fleet in
  another system
- **THEN** that entry shows that fleet's served id and that system's display
  name, and falls back to the raw system id when the galaxy read has not
  resolved
```

---

## MAJOR 9 — task 10.3 cannot be verified, is scheduled after the moment the change closes, and has a 0-for-14 track record

**Lands on:** `tasks.md` 10.3, against RULING 1 and panel B1.

**Quoted:**

> 10.3 … and **immediately after `openspec archive`**, replace
> `openspec/specs/system-console/spec.md`'s generated `TBD - created by
> archiving change add-vitals-strip` Purpose with the delta's Purpose paragraph
> verbatim …

**Why it fails.** Three ways, and they compound:

1. **It is the only unverified task in the change.** 10.1 and 10.2 are the
   verification tasks and neither covers it; `openspec validate --strict` does
   not read Purpose; `openspec-reconcile.py` does not either. Nothing in the
   per-commit gate or the archive gate goes red if it is skipped.
2. **It executes after the artifact that records it has moved.** `openspec
   archive` relocates this `tasks.md` under `openspec/changes/archive/`, and the
   change is complete at that instant. The checkbox is ticked either before the
   step is true, or never.
3. **The measured base rate for this step in this repo is zero.** Panel B1
   verified 14 of 34 live specs carry the TBD placeholder — i.e. every previous
   author of an ADDED capability faced this same manual step and none performed
   it, including link 1's own `figure-formatting` two days ago.

RULING 1 makes this Purpose load-bearing for links 2b and 4 ("the artifact link
2b inherits rather than re-derives"), and the mitigation chosen for it is the
one mechanism this repo has never once executed.

**Smallest fix.** Give the boundary a second, durable home that no archiver
touches, and make 10.3 checkable:

- Paste the Purpose paragraph verbatim into `docs/plans/system-hud/chain.md`'s
  Link 2b section (the document 2b's orchestrator reads first anyway), and
- Restate 10.3 as: "after `openspec archive`, re-read
  `openspec/specs/system-console/spec.md` and confirm its `## Purpose` is the
  boundary paragraph and not the string `TBD - created by archiving`; record
  the confirmation in the journey handoff."

---

## MINOR findings

**M1 — re-homing residue, `Fleet Panel Cargo Hold Readout`.** The REMOVED
requirement said "Every tonnage in the readout — **per-kind tons**, used
capacity, and total capacity — is presented per `figure-formatting` as a
tonnage. **The per-kind tons** and the total capacity each carry their own raw
served value". The re-homed *Hold Cell* applies the `figure-formatting`
presentation only to used/total/free and says of segments merely "Each
segment's kind and tonnage SHALL be rendered as text in the cell" — the per-kind
figure's presentation and `data-raw` clause did not travel, and "carrying its
kind and tonnage" in the first scenario does not say whether "carrying" means
text or attribute. Not a BLOCKER only because `figure-formatting` R11 binds
tree-wide and `design.md` Decision 7 pins `hold-<kind>-tons` to exactly one
`[data-raw]`. Fix: restore "each segment's tonnage is presented per
`figure-formatting` as a tonnage and carries its own raw served value".

**M2 — re-homing residue, dropped cross-references and one qualifier.** The
removed hold requirement's "(including `fuel`, per `fleet-movement`'s 'Fleet
Cargo Pool')" and the removed credits requirement's "(see `corporation-spawn`'s
balance-bearing session bootstrap)" did not travel; and the credits body lost
its "**When shown as a figure**, the balance is presented per
`figure-formatting`… " qualifier, so the new text asserts unconditionally that
"The balance is presented per `figure-formatting` … and carries its raw served
value" while the next sentence forbids showing a figure at all when
unavailable. Everything else in both bodies diffs clean, including the
owner-only qualifier and the mine-resolution clause the panel restored.

**M3 — an empty-hold scenario that asserts a server invariant and invites a
client derivation.** "*An empty hold shows no segments and a free figure equal
to capacity* … **THEN** the gauge renders no segments and **the free figure
equals the total capacity**". The strip renders the served `freeHold`,
whatever it is; asserting an equality between two served fields tests the
fixture, not the strip, and the cheapest way to make it always true is to
derive `free = capacity − used` client-side — which contradicts the same
requirement's "the free hold carrying [its] own raw served value". Fix: assert
that the free figure renders the served `freeHold` and its `data-raw` is that
served value, using a fixture where the two happen to be equal.

**M4 — an unobservable THEN, redundant with the property scenario.** "*The pill
and the roster row are functions of one derivation* … **THEN** both surfaces'
states are the output of the one derivation for the same served inputs, and no
second derivation of fleet state exists in the strip." Neither clause names
anything a tester can look at; the architect's property scenario (equal
derivation output ⇒ identical pill text) plus the props signature already carry
the whole invariant. Fix: delete it, or restate it as the mechanical
inspection check `figure-formatting` uses ("WHEN the strip's component tree is
inspected THEN no module other than `roster-status.ts` derives a fleet state").

**M5 — two enumerations that are already out of date inside their own change.**
(a) *The strip renders with every read resolved* enumerates "interior,
own-fleets, station, board and session reads" — the galaxy read, which the same
change's fan-in delta promotes to the fifth read this view issues and which
feeds the pill's `where`, is missing. (b) `docs/plans/system-hud.md` Surface 1
specifies "A single **56px** bar"; the height appears nowhere in the deltas,
`design.md` or `tasks.md`, and link 2b's "~164px detail area (220px total with
the strip)" is arithmetic on it. Neither is load-bearing today; both are cheap
to state.

---

## Checked and found sound (no finding)

- **The re-homing diff, bodies not titles.** Both REMOVED requirements were
  diffed clause by clause against their live originals
  (`openspec/specs/docked-fleet-actions/spec.md:137-177` and `:594-654`). Apart
  from M1/M2 above, every clause travelled, including the owner-only qualifier,
  the client-derived `capacity − freeHold` rule, the unavailable-copy carve-out
  against `figure-formatting`'s generic absent form, the live-region
  no-empty-text rule, and the mine-resolution clause plus its scenario. The
  seventh scenario's re-anchoring under *A Failed Command Is Announced to
  Assistive Technology* is complete. All three live cross-references to the
  removed requirements (`system-space-view:70`, `figure-formatting:404`, and
  the fan-in body) are re-pointed by this change's deltas.
- **Every figure against the wire.** Fleet id, `state`/`attachedTo`/`jump`,
  `cargo`, `cargoCapacity`, `freeHold`, `estimatedRange`, `stranded`,
  `stationKeepRateTonsPerSecond`, `miningRate`, `worldTime`, `scale`, and the
  corporation's `credits` are all served; the `tons`, `range`, `credits`,
  `world-ms-instant`, `world-ms-span-left` and `tons-per-world-s` tokens are all
  already in the closed `FigureUnit` union (`lib/format/figures.ts:18-29`), so
  RULING 6 is honoured with no vocabulary extension. The two re-scopings
  (no fleet name; no fuel-drain figure) are correct and correctly recorded. The
  one remaining unserved figure is BLOCKER 1's host name.
- **Fuel and hold across two surfaces.** The strip's fuel absent-form rule and
  `fleet-roster`'s *An unavailable fuel or range figure reads as absent, not
  zero* agree for every served input, and the hold now exists on one surface
  only. RULING 14's projection rule is stated correctly and does not falsify any
  `fleet-roster` scenario.
- **The camera cluster.** The four-cell count, `select-pan-target-point`'s
  survival outside it, the `Shift`+arrow pan, the directional
  `data-pan-at-limit` and the untouched `camera-limit-status` priority chain are
  consistent with the live requirement's own text and with `SpaceStage.tsx`.
- **Security surface.** The strip reads only own-fleet and own-corporation data
  the view already holds, issues no read, and carries no verb; nothing widens an
  authorization surface.

One residual note, filed as a **flagged disagreement rather than a finding**: an
unrelated consequence of RULING 8 is that `useWorldTime` projects at
`clockScale = … ?? 1`, so in the (fixture-reachable, production-unlikely) state
where a world time has been served but no scale has, the clock cell's mandated
`T+ Dd HH:MM ×—` render advances at an assumed scale of 1 — a stamp formatted
identically to a correct one. The requirement is right that the stamp needs no
scale; the *projection* does. If you want it closed, the smallest fix is "WHEN
no scale has been served, the stamp SHALL render the last served instant
without projecting it forward". I am not grading this a finding because the
state depends on a fleet read carrying `worldTime` without `scale`, which the
type declares optional only for fixture reasons.

---

# Orchestrator rulings on round 1

Round 1 of at most three. Verdict accepted: **NEEDS REVISION**. Every finding
below is **ACCEPTED** — none is disputed, none deferred. One BLOCKER's fix
required me to reinterpret a panel decision rather than apply the adversary's
literal proposal; that is recorded in full at BLOCKER 2.

## BLOCKER 1 — the docked pill names a host name no wire carries. ACCEPTED.

**Verified independently before ruling.** `frontend/lib/types/system-space.ts:38`
— `SpaceBody` is `{ id, type, resources?, effects?, space, size, orbitElements? }`.
There is no `name`, `SpaceLaneGate` likewise carries none, and
`grep -rn "featureName\|bodyName\|hostName" components lib` returns nothing.

This is the **third instance in this change** of the same species: the fleet has
no `name` (analyst § 6.1), there is no served fuel-drain figure (§ 6.2), and now
the host has no name. RULING 8 governs all three — a cell whose figure is not
served is re-scoped against what *is* served, never backed by a backend task and
never synthesised on the client.

The fix is the one the change already made one paragraph earlier for the fleet's
own identity, and it is what the design input itself asked for: the design doc's
own examples are `Docked · Gate sys_2_0` and `Burning · feat-extra-0` — a **type
word plus the served id**, no display name anywhere. Apply that to the host.

The adversary's second half is equally load-bearing and must not be lost in the
first: `design.md` Decision 6 routes the host through `SystemSpaceView.tsx:625`'s
`dockedFeature`, which searches `interior.data.features` **only**. A fleet docked
at a lane gate lives in `laneGates`, so the design doc's own headline example
resolves to `null`. Fix the resolution path, not just the copy.

## BLOCKER 2 — the pinned pill props cannot render the countdown, the rate, or the host label. ACCEPTED, with the fix reinterpreted.

The adversary is right about the defect and I am ruling the remedy, because the
naive fix would undo the panel's most valuable finding.

Architect MAJOR 9 pinned the pill's props to `RosterRowStatus + stranded` to turn
"SHALL NOT branch on `Fleet.state`" from an unenforceable prohibition into a
**type error**. But `figure-formatting` makes the served clock scale a *required
argument* of the duration and rate formatters, and `RosterRowStatus` is
scale-free by construction — so the pinned signature can only ever emit the
absent form, killing three of its own scenarios and making the scale-absent
scenario vacuous.

**Ruling: the invariant's content is "the pill never receives a `Fleet`", not
"the pill receives exactly two props."** The signature becomes the derivation's
output, the served `stranded` flag, the served clock `scale`, and the projected
world time — and **never a `Fleet`, never `attachedTo`, never a park kind, never
an action ETA**. Scale and projected world time are ambient render inputs that
carry no fleet state, so admitting them preserves the type-error property whole
while making the figures renderable. Task 3.1's word "exactly" changes to that
enumeration; `design.md` Decision 5 changes with it.

This is worth stating as a principle for the rest of the chain: an enforcement
mechanism is only as good as its *reason*. MAJOR 9's reason was "the strip cannot
branch on fleet state"; a two-prop signature was one way to get it, not the thing
itself. Link 2b will meet this again when the dock's tabs need the same figures.

## MAJOR 3 — the third boundary leak. ACCEPTED.

I asked for it and the adversary found it: the width-floor scenario's WHEN names
*"the command column"* and its THEN asserts it stays visible — a column link 2b
deletes. Same mis-drawing as architect MAJOR 1 and MAJOR 2. That makes three
clauses in one capability that a later link would have had to rewrite, which is
worth carrying into the chain doc as a Taught item: **a new capability authored
mid-chain will reference the surfaces its own later links retire, and the only
reliable check is to walk each new requirement against the *next* link's
"Delivers" list.**

## MAJOR 4 — the stale-read rule stops at credits. ACCEPTED.

Reliability's BLOCKER produced a staleness rule for the credits *figure*. The
pill's state is not a figure, so it inherited nothing, and the adversary names
three implementations that satisfy the spec after a failed own-fleets refetch —
one of which keeps counting down toward an arrival the strip can no longer
confirm. That is the link's named target ("does the strip lie about state")
reached by a route the panel's fix did not cover. Extend the staleness rule to
the pill.

## MAJOR 5 — "counts down" is asserted as one value. ACCEPTED.

Nothing requires any duration or the clock to *move* between reads, while the
fuel cell got an explicit rule that it must not (R7). Passing `serverWorldTime`
instead of the projected clock ships a frozen pill that passes every scenario.
The asymmetry is the tell: the change already knows how to write this rule and
wrote it in exactly one place.

## MAJOR 6 — the fuel gauge's no-data scenario cannot fail. ACCEPTED.

`style` is a DOM-observable attribute, so `width:0%` versus `width:23%` satisfies
"differ in a DOM-observable attribute" with no state attribute at all — for
precisely the implementation the requirement forbids. The hold cell's twin
scenario does not have this defect, so the fix is to make the fuel cell's match
it: name the attribute.

This is link 1's lesson recurring a third time in this change. UX F3 asked for a
DOM-observable difference; that formulation was too loose, exactly as link 1's
first four formulations of R12 were. **Name the attribute, do not describe the
property.**

## MAJOR 7 — the credits staleness task names an API that cannot supply it. ACCEPTED.

`useCorporationOptional` returns `Corporation | null`; `isError` lives on the
unexported `CorporationContext`. The task as written cannot be done, and
`corporation-provider.tsx` is absent from the change's Impact.

Ruling: the provider exposes what the strip needs, and **`proposal.md`'s Impact
names `frontend/components/corporation-provider.tsx`**. An edit outside the
stated Impact is a finding against the developer under the workflow skill's
own rule, so the Impact must be widened here, at authoring time, rather than
discovered mid-build.

## MAJOR 8 — chevron menu entries have no specified label. ACCEPTED.

Compounded by the fan-in delta promising the galaxy read resolves system names
"for … the vitals strip's fleet cell" — a promise no `system-console` requirement
keeps. Either the requirement keeps it or the fan-in stops promising it; a
cross-reference to a requirement that does not exist is the same defect class as
the stale `Credit Balance Readout` cross-references this change was written to
clean up.

## MAJOR 9 — task 10.3 is unverifiable and has a 0-for-14 repo track record. ACCEPTED, and I am taking the verification myself.

The `## Purpose` restore runs *after* `openspec archive`, which is the last step
in the change — so nothing downstream checks it, and the evidence that nobody
ever does is that **14 of this repo's 34 live specs carry the placeholder**.

Ruling, in two parts. (1) Task 10.3 becomes a **verifiable assertion**, not an
instruction: after archive, `grep -c 'TBD - created by archiving'
openspec/specs/system-console/spec.md` must return 0. (2) **I run that check
myself at the archive gate, before the archive commit**, and the result goes in
this link's report. A task whose only enforcement is a later agent's diligence is
how the other 14 got there; this one gets an owner.

## MINORs 1–5 — ACCEPTED as written.

Re-homing residue, a scenario asserting a server invariant, an unobservable THEN,
and two stale enumerations. All cheap, all in the repair pass.

## What the adversary confirmed clean

Recorded so round 2 does not re-attack it: the body-level diff of **both** REMOVED
`docked-fleet-actions` requirements is clean (lesson four's check, done properly
at body level rather than title level); the wire check passes for every figure
except the host name; and the camera-cluster work is sound.

## Round accounting

Round 1 of 3. One repair round follows: writer → validator → adversary round 2,
whose scope is the revised clauses plus verification that these findings stayed
fixed — not a full re-attack.

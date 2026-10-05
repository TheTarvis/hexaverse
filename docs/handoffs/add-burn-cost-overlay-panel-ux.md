# add-burn-cost-overlay — panel review, UX

Reviewer: `openspec-ux`, 2026-10-05. Read-only on the change and the tree.
Change at first draft: `openspec/changes/add-burn-cost-overlay/` (2 ADDED `system-console` requirements, 15 + 19 scenarios).
Read: role file, both backing skills, root + frontend CLAUDE.md, the chain doc's 2a-iv / 2b / 4 rows, analysis whole, rulings index (RULINGs 2-14 taken as binding), `Gauge.tsx`, `VitalsStrip.tsx` fuel cell, `SpaceCommandPanel.tsx` (amber at `:119`, `:224`, `:307-315`), `check-color-compliance.py`.
Contrast figures below are WCAG relative-luminance ratios computed by hand from Tailwind v3/v4 default hexes; they are indicative and the journey screenshot or a computed-style check must confirm them.

## Verdict: NEEDS SCENARIOS

The lifetime requirement (ADDED B) is thorough and I have one gap in it (U4). The content requirement (ADDED A) pins geometry and state well but leaves the *picture* unspecified in ways that let the gauge fail the player: the unaffordable warning can be sub-pixel invisible, nothing but hue separates the two states, and the one scenario that judges paint is not judgeable. Five MAJOR, three MINOR, no BLOCKER (no data loss or dead end is possible; the overlay is a decorative projection and every state has the panel as fallback).

## Does the gauge lie? (the central claim)

Walked, with the state taken from the served flag (RULING 3) and the flag-wins scenarios already in the draft:

| Picture | Flag | Reachable | Does it mislead? |
|---|---|---|---|
| extent ends inside fill | affordable | the ordinary case | No. |
| extent ends past fill | unaffordable | the ordinary shortfall case (the mock's 53.8 t vs 47.2 t) | No. This is the mock's picture. |
| extent ends **past** fill | **affordable** | burning fleet's refunded re-target | **Yes, by idiom.** The mock teaches "overhang past the fill = shortfall". Here the overhang is real and the verdict is "fine". Hue alone has to overrule the picture. |
| extent ends **inside** fill | **unaffordable** | open station-keeping hold's upkeep | **Yes, by idiom.** Plenty of fuel is drawn, the strip says no, no figure explains why (the cost is never printed, and the panel's line says "Not affordable with the fuel aboard", which is itself wrong-sounding here). |
| extent clamped to whole rail | either | cost >= capacity | Reads "uses everything". Not a lie; the flag carries the verdict. |
| extent under one device pixel | unaffordable | any cost under ~2.5 t on a 200 t scale (40 px rail) | **Yes, by omission: the warning cannot be seen.** U1. |
| fill moved by a refuel, overlay not yet | stale by up to 10 s | after any refuel | Fill rises, amber stays up to one interval. Consistent with the panel (same quote), bounded and specified (RULING 13). Not a finding. |

So the gauge does not lie in the ordinary arrangements, and in the two edge states it is only as honest as the cue that carries the *flag* (not the geometry) is perceptible. That is what U1-U3 fix. The edge states themselves are Travis's (note N1 and N2).

## Findings

### U1 — MAJOR — The unaffordable state can be invisible: it is carried only by a length that can round to zero

Attaches to: *The Fuel Gauge Draws the Served Fuel Cost ...*, the closing paint sentence and the scenario *A zero cost is a drawn overlay of zero length*.

Clause: "The extent SHALL be painted so that, in the one rail, the end of the fill and the end of the extent can each be located by eye." plus proposal Q4 "no minimum drawn width ... the state attribute makes a sub-pixel or zero extent observable".

Why it fails a user: the state attribute is observable to a test, not to a player. The overlay's job is a warning, and the warning is loudest in exactly the cases where the burn is cheap relative to a 200 t scale and the fleet is nearly dry (fuel 1 t, cost 3 t: extent 1.5 % = 0.6 px). The strip then shows nothing, the cost is never printed, and the player learns nothing until they open the panel. The draft's own Q2 cost (the dry fleet sees nothing) generalises to the near-dry fleet, which Q2 does not cover. A cheap *affordable* sub-pixel extent is harmless to omit visually; an unaffordable one is not.

Fix, inside RULING 3 (extent length stays exactly cost over capacity) and RULING 4: the unaffordable state adds one fixed-size mark at the extent's end, full rail height, whose size does not depend on the cost. The mark is the warning; the extent's length remains the quantity. This also supplies U2's non-hue carrier.

Paste-ready (replace the final sentence of the first paragraph and add to the second paragraph of the content requirement):

```
The extent SHALL occupy only part of the rail's height, so that the end of the
fill remains visible in the part of the rail the extent does not cover, both
when the extent ends before the fill's end and when it ends after it. WHILE
the extent's state is unaffordable, the extent SHALL carry one mark at its end
that spans the rail's full height and whose size does not depend on the cost,
and the mark SHALL remain drawn when the extent's own length is under one
device pixel. The mark SHALL be present exactly when the extent's state
attribute reads unaffordable, and SHALL NOT be decided by comparing the extent
with the fill.
```

```
#### Scenario: An unaffordable extent too short to see still shows its warning
- **GIVEN** the acting fleet serves 1 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 0.4 and whose
  `affordable` flag is false
- **THEN** the extent spans 0.2 % of the rail and its state attribute reads
  unaffordable
- **AND** the unaffordable mark is present, and its inline size equals its
  inline size in the same strip supplied a quote of `fuelCostTons` 30 with the
  flag false
```

Note for the writer: "the extent SHALL be a single element" survives if the mark is a child of the extent element; it must be a DOM node (not a pseudo-element) so the scenario can see it. The mark's absence for `affordable` needs no separate scenario beyond U2's.

### U2 — MAJOR — Hue is the only thing that distinguishes affordable from unaffordable on the strip, and the cue must follow the flag, not the geometry

Attaches to: the same requirement; scenarios *An affordable quote's extent carries the affordable state*, *An unaffordable quote's extent ...*, *The flag wins when the extent runs past the fill*, *The flag wins when the extent lies inside the fill*, *The overlay is never the only carrier of the quote's affordability*.

Clause: "its paint is a tone already used by the strip's gauges" / "its paint is in the amber family".

Why it fails a user: (a) the affordable tone is by RULING 4 a zinc shade (`Gauge.tsx:52-59` holds nothing else), so the two states are separated by amber-versus-grey, which many colour-vision profiles and every monochrome or forced-colours display collapse. The gauge is `aria-hidden` by design, so a screen-reader user gets nothing from it and the entire non-hue path is the panel's text. (b) After link 2b that text is inside a dock that is collapsed by default (see Q4 forward note), leaving hue alone. (c) The two flag-wins scenarios pin only the attribute; a build that draws the cue from geometry (mark when the extent passes the fill) would pass every scenario and lie in precisely the two edge states, and a build that omits the cue passes too.

Fix: the mark of U1 is the non-hue carrier. The flag-wins scenarios gain the cue so a geometry-derived build fails them.

Paste-ready (append to each existing scenario as an AND, or replace those two scenarios' THEN):

```
#### Scenario: The flag wins when the extent runs past the fill
- **GIVEN** the acting fleet serves 40 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 60 and whose
  `affordable` flag is true
- **THEN** the extent spans 30 % of the rail against a fill of 20 %, and its
  state attribute reads affordable
- **AND** the unaffordable mark is absent

#### Scenario: The flag wins when the extent lies inside the fill
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 20 and whose
  `affordable` flag is false
- **THEN** the extent spans 10 % of the rail against a fill of 40 %, and its
  state attribute reads unaffordable
- **AND** the unaffordable mark is present
```

And add one sentence to the content requirement so the carrier is stated as a property, not an accident:

```
The two states SHALL differ in the presence of the mark as well as in paint, so
that the extent's affordability does not depend on telling two paints apart.
```

### U3 — MAJOR — The only paint scenario is not judgeable and covers neither theme nor state; the affordable tone may be indistinguishable from the fill

Attaches to: scenario *Both extents can be read on one rail*; the clause "a tone already used by the strip's gauges".

Why it fails: THEN is "a reviewer inspects a screenshot ... can each be located by eye". That is a review step, not an outcome a gate can fail, and by design it is judged only at the journey, where RULING 14 / analysis section 8 say the unaffordable state is *not arrangeable* (never reached on the e2e stack). So the one scenario that guards readability can only ever be judged in the affordable ordinary arrangement. It also names one theme only by omission and no contrast. Contrast reality on this rail (indicative, hand-computed):

- Light: rail zinc-300 (L 0.67), fill zinc-400 (0.36). The fill is already only ~1.4:1 against the rail. An affordable band in zinc-600 reads about 5:1 against the rail and about 2.9:1 against the fill. Amber-600 reads 2.2:1 against the rail and 1.2:1 against the fill, so the unaffordable paint needs a darker amber (700-800 reaches roughly 3.4-4.9 against the rail and 2-2.8 against the fill) or it disappears inside the fill.
- Dark: rail is white at 12 % over zinc-700 (about 0.09), fill zinc-300 (0.67). No single flat tone is 3:1 against both. A mid zinc (500) is ~3.3:1 against the fill and ~1.6:1 against the rail; amber-400 is ~4.3:1 against the rail and ~1.1:1 against the fill (invisible inside a near-white fill).
- "A tone already on the strip's gauges" read literally includes the fill's own shade, which would make an affordable extent inside the fill invisible.

So readability in the dark scheme needs the outline treatment, not just a tone: a 1-px edge on the mark of the opposite luminance to what it sits on lets one amber body cross from rail to fill. Indicative treatment for design.md (the architect's, verify at the journey): extent as a lower-half band; unaffordable = amber body (light scheme a dark amber, dark scheme amber-400) plus a full-height mark with a 1-px contrasting ring; affordable = a zinc band darker than the fill in the light scheme and mid zinc in the dark scheme, no mark. Every colour class on one line with its `dark:` pair, as `Gauge.tsx:27-30` and `check-color-compliance.py` require; static strings, never computed.

Fix: replace the screenshot scenario with a scenario whose THEN is a measurement, plus a tier-1 proxy so the unaffordable state is covered where the journey cannot reach it.

Paste-ready (replace *Both extents can be read on one rail*):

```
#### Scenario: Each extent end is distinguishable on the rail in both colour schemes
- **GIVEN** a rail rendered at the 1280x720 CSS-pixel viewport floor, once in
  the light scheme and once in the dark scheme, with the fill at 20 % and the
  affordable extent at 30 % (fuel 40 t, cost 60 t, capacity 200 t), and again
  with the fill at 40 % and the affordable extent at 10 % (fuel 80 t, cost 20 t)
- **WHEN** the rendered colours of the fill, the extent and the rail are
  sampled in each of the four renders
- **THEN** in each render the extent's colour differs from the fill's colour
  in the same scheme, and the extent differs from the rail's colour in the
  same scheme by a contrast ratio of at least 3:1 where it lies past the fill
  or at least 3:1 against the fill where it lies over the fill, whichever
  applies; this scenario is judged at the journey, because a unit test cannot
  judge paint

#### Scenario: The unaffordable paint and mark are distinguishable from both the fill and the rail
- **WHEN** an unaffordable extent is rendered in the light scheme and in the
  dark scheme
- **THEN** the mark carries a paint that differs from the fill's paint and the
  rail's paint in that scheme, every colour class on the extent and the mark
  has its dark-scheme counterpart on the same declaration, and the classes are
  amber-family or zinc-family only
- **AND** the gate that governs colour classes passes on the strip's files
```

Honest limit, for the writer and Travis: in the dark scheme an *affordable* extent that lies past the fill (only the burning re-target) cannot reach 3:1 against the rail within zinc; the sentence above therefore binds contrast against the fill where it overlies the fill (the ordinary affordable case) and against the rail where it does not; if the architect cannot meet the second in zinc, relax that half to "differs" and note it in design.md. Do not relax it silently.

### U4 — MAJOR — A refresh in flight over a good quote is unspecified, and it happens every 10 seconds

Attaches to: *The Cost Overlay Is Drawn Only for the View's Successful, Current Preview ...*.

Clause: the lifetime list has failure, resume, replace, commit; the analysis state table lists "Refresh in flight over a good quote: unchanged until the response lands" but no scenario carries it.

Why it fails a user: this is the most frequent reachable state in the whole requirement, once per `PREVIEW_REFRESH_MS` while any quote is shown. A build that clears the quote while the refresh is pending passes all 19 scenarios (each of B2/B6/B8/B11 expects blank only for a *first* response) and makes the overlay blink off for the length of the request every 10 s: a strobing warning that a player cannot trust, and a flicker that looks like the stale-withdrawal state.

Paste-ready (add to ADDED B):

```
#### Scenario: A refresh in flight never blanks the overlay
- **GIVEN** a current quote of `fuelCostTons` 30 draws an extent of 15 % of the
  rail, and a refresh interval has elapsed
- **WHEN** the refresh request is pending and has not answered
- **THEN** the overlay is still drawn at 15 % with its previous state attribute
- **AND** when the refresh answers with `fuelCostTons` 36, the extent spans
  18 % in a single change, with no render between in which no overlay is drawn
```

### U5 — MAJOR — "The view's command surface" is unjudgeable, covers only the unaffordable value, and goes false at link 2b

Attaches to: the last sentence of the content requirement and scenario *The overlay is never the only carrier of the quote's affordability*.

Clause: "WHILE it is drawn, the view's command surface SHALL present that same quote's affordability as text."

Why it fails: "command surface" names no element, so a test can assert it with any text. The scenario covers `affordable` false only; the affordable value (the common case, and the one the panel prints as "Affordable") is unspecified, so a build could print the opposite on the panel and pass. And after 2b the Course panel lives in the Acting-fleet tab, collapsed by default, so the clause is false as shipped unless the dock is open (forward note under Q4).

Paste-ready (replace the sentence and the scenario):

```
The extent SHALL NOT be the only presentation of the quote's affordability:
WHILE the extent is drawn and the command panel is on screen, that panel's
affordability line SHALL read the same value as the extent's state attribute.
```

```
#### Scenario: The panel's affordability line and the extent agree for both values
- **WHEN** a current quote whose `affordable` flag is true is held, and again
  for a quote whose flag is false
- **THEN** in each case the panel's affordability line reads affordable or
  unaffordable respectively, and the extent's state attribute reads the same
  value
```

### U6 — MINOR — The dry fleet's experience is unspecified (Q2)

Attaches to: *A gauge with no data draws no overlay*. With the recommended Q2 answer the scenario says what is absent but not what the player is given instead. Paste-ready, add beside it:

```
#### Scenario: A fleet with no fuel aboard still has its quote's affordability read as text
- **GIVEN** the acting fleet's cargo pool carries no `fuel` entry
- **WHEN** a current quote whose `affordable` flag is false is held
- **THEN** no extent is drawn and the fuel gauge's state attribute reads no-data
- **AND** the command panel's affordability line reads unaffordable
```

### U7 — MINOR — Accessibility and motion are implied, not required

Attaches to: the content requirement, scenario *The extent exposes no figure and no control*. The draft covers no figure, not focusable, no live region. Missing, each testable at tier 1:

- the extent and its mark stay inside the gauge's assistive-technology-hidden root (a re-parented overlay would put a coloured, unnamed node into the tree);
- appearance, change and withdrawal are not animated or transitioned. There is no motion to reduce today; the SHALL stops a later fade from showing a withdrawn (stale or wrong-target) cost for the fade's duration, which would contradict B6/B8, and it removes the reduced-motion question.

Paste-ready (append to the content requirement; one scenario):

```
The extent and its mark SHALL be inside the gauge's element that is hidden from
assistive technology, and SHALL NOT be animated or transitioned in appearing,
changing or being withdrawn.
```

```
#### Scenario: The overlay is hidden from assistive technology and does not animate
- **WHEN** an extent is drawn, changes cost, and is withdrawn
- **THEN** the extent and its mark are descendants of the element carrying
  `aria-hidden="true"` throughout
- **AND** neither carries a transition or animation class or style in any of
  the three
```

### U8 — MINOR — A refused commit's effect on the overlay is unspecified

Attaches to: ADDED B, committed-order scenarios. A player who clicks Burn and gets a refusal sees the panel's refusal and expects the quote to be untouched. Nothing in B says the overlay is. Paste-ready:

```
#### Scenario: A refused or failed burn commit leaves the overlay as it was
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** a burn order for that selection is refused or fails before it is
  accepted
- **THEN** the overlay is still drawn at the same extent and state
```

## Recommendations on the four panel questions

### Q2 — dry fleet / unserved capacity: recommend NO overlay (as drafted), plus U6

Basis (UX, beyond the analyst's precedence-4): the gauge is simultaneously declaring *no data* (`data-gauge-state="no-data"`, fuel figure reads absent). A cost extent drawn on that rail would measure against a scale the same cell says it does not have. The served wire cannot tell "dry" (fuel omitted at zero) from "roster not loaded", so a drawn extent on "valid capacity, no fuel" would assert "you have zero fuel" for an unloaded roster too. Drawing nothing is not a lie; it leaves the strip silent and the panel's text, which is on screen at this link, carries the verdict. That keeps the live fuel-cell requirement and its 4 headings untouched (no MODIFIED, no archive trap). Cost, stated plainly: the fleet that most needs the warning gets the quietest gauge; U6 makes the text carrier a scenario so the state is specified rather than accidental. Record in 2b/4's read-first that this state's only carrier is text (see Q4 forward note). If Travis overrules, text for the alternative is a MODIFIED block of the fuel-cell requirement carrying all four headings verbatim and an extent drawn when capacity is valid; I do not recommend it for this link.

### Q4 — paint treatment, non-hue carrier, and the 2b forward flag

Recommendation: partial-height band (separate element, fill untouched and full-height, so the fill's end stays visible above or below the band in both arrangements); unaffordable adds a fixed-size full-height end mark (U1/U2) with a 1-px contrasting edge in the dark scheme (U3). Why this one among the candidates: translucency fails the 6-px rail (overlap of two tints is unreadable, and an overlap tint reads as a third colour); a stripe pattern needs a period of at least 2 px and an extent that can be 4 px long carries no readable pattern; under/over layering hides one end whenever cost and fuel are close; partial height keeps both ends in view at any relation of cost to fuel. Non-hue carrier: the end mark's presence (unaffordable only), keyed to the flag; the panel's line is the text carrier. Spec stays at observable altitude (U1-U3 SHALLs); the exact shades are design.md's.

Forward flag for link 2b's "read first" (paste-ready):

```
Link 2a-iv's overlay requirement ends "WHILE the extent is drawn and the command
panel is on screen, that panel's affordability line SHALL read the same value as
the extent's state attribute." This link moves the course half into the
Acting-fleet tab, collapsed by default, and a tab hidden by the `hidden`
attribute is also outside the accessibility tree. After this link the strip's
extent is the only on-screen carrier of the quote's affordability while the dock
is collapsed, it is itself hidden from assistive technology, and the arc's
figures that would replace the text land at link 4. This link SHALL therefore
(a) MODIFY that clause so it binds the Acting-fleet tab's affordability line
"while the dock is expanded on that tab" instead of "on screen", (b) state what
a screen-reader or keyboard user gets while the dock is collapsed and a quote is
current (the recommended minimum: the dock's collapsed tab bar remains
keyboard-reachable and expanding it reads the affordability line first), and
(c) keep the end mark of the unaffordable state, which is the only non-hue,
non-text carrier the strip has. The same applies to the state of a fleet with no
fuel aboard, whose only carrier is that text.
```

Because the Burn control lives in the same tab, a player must expand the dock to commit, so the text is reached before the verb; what is lost is the at-a-glance decision to expand, which the mark preserves.

### Q5 — overlay while the canvas is unavailable: recommend DRAW it (as drafted)

Basis: one determination, two readers; the panel keeps showing the same quote's figures in that state, so withholding the overlay would make the strip contradict the panel about one quote and force a second currency derivation. In that state the canvas cannot show the curve, so the strip and panel are the player's only instruments for the held selection, and the selection cannot change until the canvas returns, so no cross-target stale picture is reachable. The scenario's THEN "as the command panel's quote figures are" is a comparison to another surface, not an outcome; tighten with the agreement the panel shows. Paste-ready:

```
#### Scenario: The overlay is drawn while the canvas is unavailable
- **GIVEN** a selection is held with a current quote
- **WHEN** the canvas region shows the unsupported or interrupted state
- **THEN** the overlay is still drawn, with the extent and state attribute it
  had before the canvas was lost
- **AND** the command panel's affordability line reads the same value as the
  extent's state attribute
```

(Whether the preview should still be requested in that state is `followup-explain-withheld-burn-command.md` F3, not here. Analysis notes nothing pins this at the view today, so the scenario needs a harness arrangement; it is the first item to shed if the 40-task cap bites, per the analyst's shed order.)

### Q7 — does this link touch the panel's amber styling and affordability line under a stale quote: recommend NO

Basis: live text asks only that figures be marked stale, and they are; link 4 retires the panel; touching it spends a `system-space-view` MODIFIED block the change otherwise avoids (RULING 8). The resulting asymmetry (amber, stale-marked panel; no overlay) is not a contradiction and is a defensible reading of "withdrawn here, marked there": the gauge has no room to say "stale", so it says nothing, which is the honest choice on a surface with no text. UX cost, for the record: an unaffordable quote that has gone stale still paints the panel amber, so a player glancing between the two sees amber on one and blank on the other; the stale marking explains it. Also note that A12/U5's clause binds the panel's line only while the overlay is drawn, so it is vacuous in this state and consistent. Put the asymmetry in design.md in one sentence so link 4 inherits it; no scenario.

## Notes for Travis (RULINGs that produce a user-hostile result; not findings, no reversal assumed)

- **N1 — RULING 3, affordable overhang.** The mock's red overhang means "shortfall". Under RULING 3, a burning fleet's refunded re-target draws an overhang past the fill in the *affordable* state. Hue alone says "fine" over a picture that says "short", on a surface with no text. U1/U2's mark keyed to the flag is my mitigation inside the ruling; a stronger one would need a served shortfall, which the chain forbids. In the dark scheme the affordable overhang over the rail is also hard to see (~1.6:1 within zinc, U3), which softens the contradiction at the cost of the cue itself.
- **N2 — RULING 3, open hold.** An open station-keeping hold's upkeep makes an unaffordable verdict beside plenty of drawn fuel with no explanation on the strip, and the panel's wording ("Not affordable with the fuel aboard") reads wrong there. The wording is the panel's and out of this link; worth a line in a follow-up.
- **N3 — RULING 5, withdraw on failure.** On a flaky connection the overlay will appear and vanish at the refresh cadence with nothing explaining it on the strip. This is the honest outcome (a stale cost is a wrong cost) and I do not ask for a change; U4 ensures a *successful* refresh never produces the same blink.
- **N4 — RULING 11 / D1.** Until the retained-figures drift is fixed, an overlay can be drawn over a fill the live spec says should read absent after a failed own-fleets read. The flag it carries is fresher than the fill, so the strip is wrong about the fill, not about the verdict. No rule requested; flagged only so N1 is not read as the whole story.

## Coverage statement

States for the overlay: none, pending, drawn-affordable, drawn-unaffordable, withdrawn-after-failure all have scenarios; the transitions with no scenario in the draft are refresh-in-flight (U4) and refused commit (U8). Selection change, fleet switch, resume and commit are covered and sound. Error experience: the overlay has no input and no recovery action of its own; recovery is the preview's own refresh and the panel's retry, which this change correctly leaves alone. No flow dead end or data loss is introduced. Consistency with existing patterns (silent updates, decorative gauge, one derivation read twice) is good.

Verdict: **NEEDS SCENARIOS** (U1-U5 MAJOR; U6-U8 MINOR).

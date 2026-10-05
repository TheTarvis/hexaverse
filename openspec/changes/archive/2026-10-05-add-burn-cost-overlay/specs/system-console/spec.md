## ADDED Requirements

### Requirement: The Fuel Gauge Draws the Served Fuel Cost of the Supplied Burn Quote as One Start-Anchored Extent

The system SHALL draw, on the strip's fuel gauge and on no other gauge, one
cost extent for the burn quote the mounting view supplies to the strip. The
extent SHALL be drawn separately from the fill, anchored at the gauge's start
as the fill is, and SHALL leave the fill's own length unchanged. The extent
SHALL occupy only part of the rail's height, so that the end of the fill
remains visible in the part of the rail the extent does not cover, both when
the extent ends before the fill's end and when it ends after it. Its length
SHALL be the quote's served point fuel cost (`fuelCostTons`, never the commit
ceiling) over the acting fleet's served `cargoCapacity` — the same
denominator, and so the same tons-to-pixels scale, as the fill — limited to
the length of the rail: a cost at or above the capacity draws the whole rail,
and nothing in the extent's drawing exists only for such a cost or tells it
from a cost exactly equal to the capacity, and this capability SHALL NOT assert
that such a cost is unaffordable. A cost of zero SHALL draw an extent of zero
length, still present. A cost that is not a finite, non-negative number SHALL
draw no extent. The extent SHALL NOT be drawn while the gauge's existing state
attribute reads its no-data value, a state that stays as *The Fuel Cell Shows
the Served Fuel Tonnage and Estimated Range Over a Gauge* defines it, and this
requirement writes no rule of its own for the fuel cell while the own-fleets
read's most recent attempt has failed.

The extent's affordability state SHALL be the quote's served `affordable`
flag, copied unchanged. The strip SHALL NOT decide that state by comparing the
extent with the fill, SHALL NOT compute any difference between the fuel
aboard and the cost, and SHALL NOT compute an affordability of its own: the
served flag is decided by the server against terms the client does not hold,
so the extent may end past the fill while the flag reads affordable, and may
end inside the fill while the flag reads unaffordable. The unaffordable
extent SHALL be painted in the amber family the command panel already uses for
an unaffordable quote; the affordable extent SHALL be painted in a tone the
strip's gauges already use; the overlay as a whole, extent and mark, SHALL use
no colour family other than amber and zinc, so no red and no blue appear. The
extent SHALL be painted so that, in the one rail, the
end of the fill and the end of the extent can each be located by eye.

WHILE the extent's state is unaffordable, one mark SHALL be drawn that spans
the rail's full height, whose width is greater than zero and is the same at
every cost, and whose paint differs from the paint of the unaffordable extent,
and the mark SHALL remain drawn when the extent's own length is under one
device pixel. The mark is drawn separately from both the extent and the fill.
The mark SHALL be positioned along the rail at the extent's length, as a
percentage of the rail, and displaced back from that position by the same
percentage of the mark's own width, so that at every cost no part of the mark
lies before the rail's start or past the rail's end: at a cost of zero its leading edge is the rail's start, at
a cost at or above the capacity its trailing edge is the rail's end, and at
every cost between, the extent's end lies on the mark. The mark SHALL be present
exactly when the extent's state attribute reads unaffordable, and SHALL NOT be
decided by comparing the extent with the fill or by the cost being limited to
the rail. The two states SHALL differ in the presence of the mark as well as in
paint, so that the extent's affordability does not depend on telling two
paints apart.

The extent SHALL leave the gauge's existing state attribute (no data, no fill,
or a rendered fill) unchanged. The gauge SHALL expose the extent's state —
affordable or unaffordable — as a DOM-observable attribute of the gauge
element itself, separate from that existing attribute and absent whenever no
extent is drawn, so that a zero-length or sub-pixel extent is distinguishable
by that attribute alone. The extent SHALL carry no figure, no text, no
raw-value attribute, no unit attribute, no accessible value, and no attribute
stating its length or the cost as a number; its drawn geometry, like the
fill's, is the only place its length appears. The extent SHALL NOT be
focusable, and SHALL be drawn alongside the draining marker of *While Burning,
the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain* when
both apply. The strip SHALL NOT print the cost, the difference between cost
and fuel aboard, or any shortfall as text. The extent and its mark SHALL be
inside the gauge's element that is hidden from assistive technology, and SHALL
NOT be animated or transitioned in appearing, changing or being withdrawn.
The extent is decorative and SHALL NOT be relied on as the presentation of the
quote's affordability. The mounting view SHALL supply the strip a quote only
while that view also presents the same quote's affordability as text. This
capability places no rule on where or how the view presents that text.

#### Scenario: A supplied quote draws one extent on the gauge's own scale
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 30 and whose
  `affordable` flag is true
- **THEN** the fuel gauge draws one extent starting at the gauge's start and
  spanning 15 % of the rail
- **AND** the fill still spans 40 % of the rail and the gauge's existing state
  attribute still reads its rendered-fill value

#### Scenario: The extent covers only part of the rail's height
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 30, and again
  one whose `fuelCostTons` is 100, each with the `affordable` flag true
- **THEN** in each case the extent's height is less than the rail's height
  while the fill's height is the rail's, so that part of the rail's height at
  each side of the extent is not covered by it
- **AND** at 100 the extent ends past the fill's end and the end of the fill
  remains visible in that uncovered part

#### Scenario: An affordable quote's extent carries the affordable state
- **WHEN** the strip is supplied a quote whose `affordable` flag is true
- **THEN** the extent's state attribute reads affordable and its paint is a
  tone already used by the strip's gauges

#### Scenario: An unaffordable quote's extent carries the unaffordable state in amber
- **WHEN** the strip is supplied a quote whose `affordable` flag is false
- **THEN** the extent's state attribute reads unaffordable and its paint is in
  the amber family the command panel uses for an unaffordable quote
- **AND** no red or blue class is applied anywhere in the strip

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

#### Scenario: An unaffordable extent too short to see still shows its warning
- **GIVEN** the acting fleet serves 1 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 0.4 and whose
  `affordable` flag is false
- **THEN** the extent spans 0.2 % of the rail and its state attribute reads
  unaffordable
- **AND** the unaffordable mark is present, and is the same size as in the
  same strip supplied a quote of `fuelCostTons` 30 with the flag false

#### Scenario: The unaffordable mark has a visible size and its own paint
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied quotes of `fuelCostTons` 0.4 and 30, each with
  the `affordable` flag false
- **THEN** in each case the mark spans the rail's full height and its width is
  greater than zero, and that width is the same at both costs
- **AND** the mark's paint differs from the paint of the unaffordable extent

#### Scenario: The unaffordable mark sits at the extent's end along the rail
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied, in turn, quotes of `fuelCostTons` 0, 100 and
  250, each with the `affordable` flag false
- **THEN** at a cost of 0 the mark is positioned at 0 % of the rail and is
  displaced back by 0 % of its own width, so its leading edge is the rail's
  start
- **AND** at a cost of 100 the mark is positioned at 50 % of the rail and is
  displaced back by 50 % of its own width, so the extent's end lies on the mark
- **AND** at a cost of 250 the mark is positioned at 100 % of the rail and is
  displaced back by 100 % of its own width, so its trailing edge is the rail's
  end and no part of it lies past the rail
- **AND** at each of the three costs no part of the mark lies before the rail's start or past the rail's end

#### Scenario: A cost above the capacity is limited to the rail
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 250 and whose
  `affordable` flag is true
- **THEN** the extent spans 100 % of the rail and no further, its state
  attribute reads affordable, and no element or attribute is present that a
  cost of exactly 200 does not draw
- **AND** a cost of exactly 200 draws the identical extent

#### Scenario: A zero cost is a drawn overlay of zero length
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 0 and whose
  `affordable` flag is true
- **THEN** the gauge's extent state attribute is present and reads affordable
- **AND** the extent has zero length

#### Scenario: A cost that is not a finite non-negative number draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is NaN, is
  infinite, or is -5
- **THEN** no extent is drawn and the gauge's extent state attribute is absent
- **AND** the fill and the gauge's existing state attribute are unchanged

#### Scenario: A gauge with no data draws no overlay
- **WHEN** the strip is supplied a quote with a finite `fuelCostTons` while
  the acting fleet's `cargoCapacity` is unserved or 0, and again while the
  fleet's served cargo pool carries no `fuel` entry
- **THEN** no extent is drawn in either render, the extent state attribute is
  absent, and the gauge's existing state attribute reads its no-data value

#### Scenario: The extent exposes no figure and no control
- **WHEN** the fuel gauge is inspected while an extent is drawn
- **THEN** the extent has no text, no raw-value attribute, no unit attribute,
  no attribute stating its length or the cost as a number and no accessible
  value, is not focusable, and the strip prints no cost, difference or
  shortfall text
- **AND** the strip's interactive elements are still only the chevron and its
  menu's descendants

#### Scenario: The overlay is hidden from assistive technology and does not animate
- **WHEN** an extent is drawn, changes cost, and is withdrawn
- **THEN** the extent and its mark are descendants of the element carrying
  `aria-hidden="true"` throughout
- **AND** neither carries a transition or animation class or style in any of
  the three

#### Scenario: The hold gauge never draws a cost extent
- **WHEN** the strip is supplied a quote
- **THEN** the hold gauge's subtree is identical to its subtree with no quote
  supplied

#### Scenario: The extent is drawn alongside the draining marker
- **GIVEN** the acting fleet's effective state is a burn and the fuel cell
  shows its draining marker
- **WHEN** the strip is supplied a quote for a re-target
- **THEN** the draining marker and the extent are both present

#### Scenario: A drawn extent is always accompanied by the quote's affordability as text
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** an extent is drawn in the view for a quote whose `affordable` flag
  is false, and again for a quote whose flag is true
- **THEN** in each case the view presents that quote's affordability as text,
  and the text states affordable exactly when the extent's state attribute
  reads affordable and states not affordable exactly when it reads
  unaffordable

#### Scenario: The extent's and the mark's colour classes stay in the amber and zinc families
- **WHEN** an affordable extent and an unaffordable extent with its mark are
  rendered
- **THEN** every colour class on the extent and the mark is in the amber
  family or the zinc family, and no class naming another colour family is
  present
- **AND** every such colour class has its dark-scheme counterpart on the same
  declaration

#### Scenario: Both extents can be read on one rail
- **GIVEN** the system space view at the 1280×720 CSS-pixel viewport floor,
  once in the light scheme and once in the dark scheme, with the acting fleet's
  fill and an overlay for a current quote both drawn, the extent being at least
  2 device pixels long
- **WHEN** the rendered colours are sampled in each scheme at the centre pixel
  of a point of the fill that the extent does not cover (the centre of the
  fill's part beyond the extent's end where the fill is longer than the extent,
  otherwise a point of the fill above the extent), the centre pixel of the extent,
  and the centre pixel of a part of the rail covered by neither
- **THEN** in each scheme the three sampled colours are pairwise unequal as
  sRGB values, so that the end of the fill and the end of the extent can each
  be located by eye in the same rail
- **AND** in an arrangement in which the extent ends past the fill's end, the
  centre pixel of the part of the extent past the fill's end is unequal to the
  rail's sampled colour
- **AND** in an arrangement in which the extent is unaffordable, the centre
  pixel of the mark is unequal to the sampled colours of the extent and of the
  fill

### Requirement: The Cost Overlay Is Drawn Only for the View's Successful, Current Preview, as the View Last Read It

The mounting view SHALL supply the strip a burn quote exactly while the view
holds a successful, current burn preview for the acting fleet and the current
selection, **as the view last read it**, and SHALL supply none otherwise. The
strip SHALL draw the cost overlay only while a quote is supplied, and SHALL
draw it for a supplied quote as the content requirement (*The Fuel Gauge Draws
the Served Fuel Cost of the Supplied Burn Quote as One Start-Anchored
Extent*) defines. "A successful, current preview" is
the determination of *A Failed or Stale Preview Is Never Presented as a
Current Quote* applied to the withheld states of *Burn Preview Reflects the
Server-Solved Order, Without Committing* and to the committed selection of *A
Burn Order Committed From This View Withholds Its Quote and the Burn Command
for That Selection While It Is the Fleet's Running Burn, as Last Read*; this
requirement does not restate those states, their ends or their lags, and the
overlay inherits each of them from its owner. A stale or failed quote SHALL be
withdrawn from the gauge, never marked and kept. A refresh that has been sent
and has not answered SHALL change nothing: an overlay drawn from the newest
successful response stays as that response drew it, and an overlay withdrawn
by a failed refresh stays withdrawn until a refresh succeeds. The quote the view supplies is the one determination from which the
burn command's fuel ceiling is derived: the overlay SHALL NOT be drawn while
that ceiling is absent, and this requirement places no rule on the ceiling.
The absence of an overlay SHALL NOT be treated as a reason to withhold or
alter anything another requirement presents for that quote. WHEN a withheld
preview resumes, no overlay SHALL be drawn until the restoring response lands,
and the overlay then drawn SHALL be that response's.

The overlay's cost and state SHALL be those of the newest preview response the
view holds. The fill comes from the own-fleets read and the overlay from the
preview read, so after a change to the fuel aboard the fill can move at the
own-fleets read while the overlay's state still reads the preview response
before it. A change to the fuel aboard SHALL of itself neither change the
overlay nor cause a preview request; the overlay then reads the response
before the change until the first preview response requested after the change
lands, that request being sent no later than one preview refresh interval
after the change, and a failure of that request withdraws the overlay. The overlay
adds no text and causes no announcement of its own, and its appearing,
changing or withdrawal causes no preview request of its own.

#### Scenario: With no selection there is no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the view renders with no current selection
- **THEN** no overlay is drawn and the fill spans 40 % of the rail

#### Scenario: A first preview still pending draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** a selection is made and its first preview response has not landed
- **THEN** no overlay is drawn
- **AND** when that response lands with `fuelCostTons` 30, the overlay is drawn
  at 15 % of the rail

#### Scenario: A failed first preview draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the first preview request for the current selection fails and the
  command panel shows its no-quote state
- **THEN** no overlay is drawn
- **AND** when a retry of that request succeeds with `fuelCostTons` 30, the
  overlay is drawn at 15 % of the rail

#### Scenario: A refresh in flight never blanks the overlay
- **GIVEN** a current quote of `fuelCostTons` 30 draws an extent of 15 % of the
  rail, and a refresh interval has elapsed
- **WHEN** the refresh request is pending and has not answered
- **THEN** the overlay is still drawn at 15 % with its previous state attribute
- **AND** when the refresh answers with `fuelCostTons` 36, the extent spans
  18 % in a single change, with no render between in which no overlay is drawn

#### Scenario: A failed refresh withdraws the overlay and nothing else
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a current quote of `fuelCostTons` 30 draws an extent of 15 %
- **WHEN** the next preview refresh fails while the command panel marks its
  figures stale
- **THEN** no overlay is drawn and the burn command's fuel ceiling is absent
- **AND** the fuel figure still reads 80 t, the range figure is unchanged and
  the fill still spans 40 % of the rail

#### Scenario: A refresh sent after a failure draws no overlay while it is pending
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, a current quote of `fuelCostTons` 30 drew an extent of 15 %, and a
  refresh failed and withdrew the overlay
- **WHEN** the next refresh has been sent and has not answered
- **THEN** no overlay is drawn and the burn command's fuel ceiling is absent

#### Scenario: A later successful refresh restores the overlay at the new cost and state
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a failed refresh has withdrawn the overlay
- **WHEN** a later refresh succeeds with `fuelCostTons` 45 and `affordable`
  false
- **THEN** the overlay is drawn spanning 22.5 % of the rail, inside the fill
  of 40 %, with its state attribute reading unaffordable, as the response's
  flag does

#### Scenario: Replacing the selection never shows the previous target's cost
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and target X's quote of `fuelCostTons` 30 draws an extent of 15 %
- **WHEN** target Y becomes the selection
- **THEN** no overlay is drawn until Y's first response lands
- **AND** when Y's response with `fuelCostTons` 100 and `affordable` true
  lands, the extent spans 50 % of the rail

#### Scenario: The served flag is shown even when the cost exceeds the fuel aboard
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** a preview response lands for the current selection with
  `fuelCostTons` 100 and `affordable` true
- **THEN** the extent spans 50 % of the rail against a fill of 40 %, and its
  state attribute reads affordable
- **AND** the unaffordable mark is absent

#### Scenario: Clearing the selection withdraws the overlay
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** the selection is cleared
- **THEN** no overlay is drawn

#### Scenario: Switching the acting fleet never shows the previous fleet's cost
- **GIVEN** an overlay is drawn for the acting fleet A and the current
  selection
- **WHEN** fleet B becomes the acting fleet with the selection kept
- **THEN** no overlay is drawn until B's first preview response lands, and
  the overlay then drawn is B's quote against B's own fill

#### Scenario: A withheld preview draws no overlay
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** the view's last reads report, in turn, a running mine for the acting
  fleet whose ETA has not passed, then the acting fleet in lane transit, then
  the selection as the body the acting fleet is attached to
- **THEN** in each arrangement no overlay is drawn

#### Scenario: A committed order withdraws the overlay from acceptance through the gap
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** a burn order for that selection is accepted from the view and no
  own-fleets read requested at or after the acceptance has answered
- **THEN** no overlay is drawn at the acceptance and none is drawn through
  the gap

#### Scenario: A committed order's overlay stays withdrawn while the read reports that burn
- **GIVEN** a burn order for the current selection was accepted from the view
- **WHEN** the own-fleets read answers reporting that order as the fleet's
  running burn, and again at a later read that still reports it
- **THEN** no overlay is drawn for that selection

#### Scenario: A resumed preview draws no overlay until its restoring response lands
- **GIVEN** an overlay was drawn for the current selection and was then
  withheld, once by a running mine and once by a committed order, and in each
  case the withheld state has now ended
- **WHEN** the restoring preview request is still pending
- **THEN** no overlay is drawn
- **AND** when the restoring response lands with `fuelCostTons` 30, the
  overlay is drawn from that response alone

#### Scenario: Another target is overlaid while the committed target is not
- **GIVEN** a burn order for target X was accepted from the view and is
  reported as the fleet's running burn
- **WHEN** target Y becomes the selection
- **THEN** Y's quote draws its overlay
- **AND** when X is selected again while its order is still the running burn,
  no overlay is drawn

#### Scenario: A burn the view did not commit is overlaid as a re-target
- **GIVEN** the own-fleets read reports a running burn for the acting fleet
  that this view holds no accepted commit for
- **WHEN** a different target becomes the selection and its quote lands
- **THEN** that quote's overlay is drawn alongside the fuel cell's draining
  marker

#### Scenario: The overlay is never drawn without the fuel ceiling
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a current quote of `fuelCostTons` 30, so that the overlay is
  drawn and the burn command's fuel ceiling is present
- **WHEN** a refresh fails over the shown figures, and then a later refresh
  succeeds
- **THEN** after the failure the overlay is not drawn and the ceiling is
  absent, and after the success the overlay is drawn and the ceiling is
  present

#### Scenario: The fill can move before the overlay does
- **GIVEN** the acting fleet serves 20 t of fuel against a `cargoCapacity` of
  200 t, and the current quote of `fuelCostTons` 30 reads unaffordable
- **WHEN** the own-fleets read next reports 80 t of fuel aboard, before the
  next preview refresh is due
- **THEN** the fill spans 40 % of the rail, the overlay's state attribute
  still reads unaffordable, and the number of preview requests sent is
  unchanged
- **AND** when the next preview response lands with `affordable` true, the
  overlay's state attribute reads affordable

#### Scenario: The overlay is silent and costs no request
- **WHEN** an overlay appears, changes cost or state, and is withdrawn
- **THEN** no live-region text is made for any of the three
- **AND** the number of preview requests sent across those three is the number
  the refresh interval alone accounts for: drawing the overlay adds none

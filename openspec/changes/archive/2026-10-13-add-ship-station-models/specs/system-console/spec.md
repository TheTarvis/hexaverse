## MODIFIED Requirements

### Requirement: The Strip Carries No Verb

The strip SHALL NOT render any control that commits, cancels, or otherwise
mutates server state. The one interactive affordance the strip MAY render is
the fleet cell's chevron (*The Fleet Cell Names the Acting Fleet and
Delegates a Switch to the Mounting View*). Its menu offers fleet-switch
entries and, when eligible, an explicit Inspect current fleet action that
opens a separate nonmodal inspection panel. Neither operation issues a
mutation; inspection changes neither the acting fleet nor the space-view
target selection. The inspection panel is outside the strip and its menu,
so its orientation and close controls are not additional strip controls.

#### Scenario: A docked fleet's strip offers no trade verb
- **WHEN** the acting fleet is docked at a station with cargo aboard
- **THEN** the strip renders no refuel, sell, mine, jump, hold or release
  control

#### Scenario: A burning fleet's strip offers no burn-ending verb
- **WHEN** the acting fleet is burning
- **THEN** the strip renders no cut-drive or stop control

#### Scenario: The chevron is the strip's only interactive element
- **WHEN** the strip's interactive elements are enumerated
- **THEN** every one is the chevron or a descendant of the chevron's own
  menu

### Requirement: The Fleet Cell Names the Acting Fleet and Delegates a Switch to the Mounting View

The system SHALL show, in the strip's leftmost cell, the acting fleet's
served id — no fleet name exists on the wire (`lib/types/fleet.ts`'s
`Fleet`), and this capability SHALL NOT synthesise a client-side display
name for one — and a chevron affordance that opens a menu of every fleet the
requester owns, delegating a chosen fleet back to the mounting view through
the **same callback contract** the fleet roster's row selection uses
(`fleet-roster`'s *Row Selection Delegated to the Mounting View*), so the
acting fleet is set by exactly one code path and the strip itself decides
nothing about what switching means. The menu's membership SHALL NOT be
filtered to the open system: offering a subset would make the chevron a
second visibility filter over the requester's own fleets. The menu's
membership and each entry's destination SHALL reflect the requester's
own-fleets read as most recently resolved, including while the menu remains
open across a refetch — never a snapshot frozen at the moment the menu
opened. WHEN that read's most recent attempt has failed, the chevron's menu
SHALL offer no entry whose destination is drawn from it, rather than
presenting a stale membership or stale destinations as current — rendering
the identical empty menu that *A requester owning no fleet at all still
gets the strip* mandates for a requester who owns no fleet anywhere.
Because the own-fleets read's error surface belongs to the fleet panel, not
the strip (*The Strip Survives a Failed Own-Fleets Read*), the strip does
not distinguish "no fleets" from "read failed" in its menu; that ambiguity
is a deliberate consequence of the ownership split, not an oversight.
Each fleet-switch menu entry SHALL name its fleet by its served id and the display name of the
system it is in — resolved from the galaxy read, falling back to the raw
system id when that read has not resolved — and, for a fleet in lane
transit, that it is under way between systems, so a player choosing an
entry that navigates knows where it goes before choosing it. WHEN there is
no acting fleet, the identity SHALL show
`figure-formatting`'s absent form but the chevron SHALL remain present and
interactive, so a player viewing a system with none of their own fleets
present can still reach and switch to any owned fleet from the strip. WHEN
choosing a fleet in the open system sets it acting, focus SHALL return to
the chevron, and the chevron's accessible name SHALL name the now-acting
fleet, so a keyboard or screen-reader user is told the switch took effect
without a second announcing surface.

In addition to fleet-switch entries, the menu SHALL offer one explicitly
labelled Inspect current fleet action exactly when the latest own-fleets
read is successful and the acting fleet remains a member of that served
owned-fleet set. Its accessible name SHALL include the acting fleet's served
id. This action SHALL close the menu and open the persistent nonmodal
inspection panel outside the strip without invoking the fleet-switch callback,
navigating, changing the acting fleet or target selection, or issuing a game
command. Initial focus SHALL move to the inspector's close control; closing
it or pressing Escape SHALL restore focus to the chevron. A failed own-fleets
read, absent acting fleet or acting fleet absent from the latest served set
SHALL offer no inspection action. Changing the acting fleet or losing that
eligibility SHALL close any open inspector. Fleet-switch entries retain all
existing membership, destination and callback semantics; references to
choosing a fleet below mean choosing a fleet-switch entry, not inspection.

#### Scenario: Choosing a fleet in this system sets it acting
- **WHEN** a fleet in the open system is chosen from the chevron
- **THEN** it becomes the acting fleet and no navigation occurs

#### Scenario: Focus and the chevron's own label confirm a same-system switch
- **WHEN** a fleet in the open system is chosen from the chevron
- **THEN** focus returns to the chevron and its accessible name names the
  newly acting fleet

#### Scenario: Choosing a fleet in another system navigates there
- **WHEN** a fleet located in a different system is chosen
- **THEN** the view navigates to that system's route, identically to
  selecting its roster row

#### Scenario: Choosing a fleet out on a lane navigates to the galaxy view
- **WHEN** a fleet currently in lane transit is chosen
- **THEN** the view navigates to the galaxy view, identically to selecting
  its roster row

#### Scenario: The chevron's menu lists every fleet the requester owns
- **WHEN** the chevron's menu is opened
- **THEN** every fleet the requester owns appears as an entry, regardless of
  which system or lane it is currently in

#### Scenario: A sole owned fleet leaves the chevron's menu with one entry
- **WHEN** the requester owns exactly one fleet
- **THEN** the chevron's menu holds exactly that one fleet-switch entry,
  and choosing it changes nothing
- **AND** the separate Inspect current fleet action is present only when
  the acting fleet meets the inspection eligibility above

#### Scenario: The chevron survives the no-acting-fleet state
- **WHEN** the view renders with no own fleet in the open system
- **THEN** the fleet cell's identity shows the absent form, and the chevron
  is still present and opens the same menu of every owned fleet

#### Scenario: A menu entry names its fleet's system before it navigates
- **WHEN** the chevron's menu is opened while the requester owns a fleet in
  another system
- **THEN** that entry shows that fleet's served id and that system's display
  name, and falls back to the raw system id when the galaxy read has not
  resolved

#### Scenario: A failed own-fleets refetch empties the menu rather than freezing it
- **WHEN** the own-fleets read's most recent attempt has failed
- **THEN** the chevron's menu offers no entry whose destination is drawn
  from that read, never the membership or destinations from an earlier
  successful read presented as current

#### Scenario: Inspect current fleet opens details without switching
- **GIVEN** a successful own-fleets read containing the acting fleet
- **WHEN** the player invokes Inspect current fleet by pointer or keyboard
- **THEN** the menu closes and the separate nonmodal inspector opens for that fleet
- **AND** focus moves to its close control without invoking the switching callback, navigating, changing target selection or issuing a game command
- **AND** closing the inspector or pressing Escape restores focus to the chevron

#### Scenario: Inspection follows current served ownership
- **WHEN** the acting fleet changes, disappears from the latest owned-fleet set, becomes absent, or the latest own-fleets read fails
- **THEN** any open fleet inspector closes
- **AND** the inspection action is absent unless the current acting fleet is a member of the latest successful owned-fleet read
- **AND** a failed read leaves the same empty menu as an empty owned-fleet set

### Requirement: Escape Collapses the Expanded Dock

WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key as *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* has it do, in which case the dock SHALL NOT collapse. The same exception applies when Escape is pressed with focus inside the open own-fleet inspector: that press SHALL close only the inspector and return focus to the fleet chevron, leaving the dock expanded. An open inspector with focus elsewhere does not claim Escape. This requirement states the outcome while that menu is closed and while it is open with keyboard focus on the chevron or on one of its entries; it does not state what Escape does to the dock while the menu is open with keyboard focus elsewhere. One press of Escape SHALL do one thing: a repeated keydown of a held Escape that closed the menu or own-fleet inspector SHALL NOT also collapse the dock. After Escape is released, a fresh press follows the existing dock behavior when neither surface claims it. A collapse, by Escape or by the collapse control, SHALL NOT move keyboard focus that is outside the tab bar and the panel; with focus inside them, focus moves to the "Console" control as *The Dock Is Keyboard-Operable* states. A collapse by Escape SHALL change no space-view selection and no acting fleet and SHALL issue no request, and a text field or a select that held focus SHALL keep its value. While the dock is collapsed, Escape SHALL leave it collapsed and SHALL change no space-view selection and no acting fleet; what Escape does to the fleet cell's menu is that requirement's alone.

#### Scenario: Escape with focus inside the dock collapses it and moves focus to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the Log tab
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** keyboard focus is on the "Console" control

#### Scenario: Escape with focus outside the dock leaves focus where it was
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on that camera control

#### Scenario: Collapsing with focus on the strip's chevron leaves focus there
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Collapsing by a pointer press that moves no focus leaves focus on the chevron
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron
- **WHEN** the collapse control is activated by a pointer press that does not move focus
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Escape with focus on no control collapses the dock
- **GIVEN** the dock is expanded and keyboard focus is on no control, as after a pointer press that focuses nothing
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed

#### Scenario: Escape with focus in a text field or a select collapses the dock and keeps the field's value
- **GIVEN** the dock is expanded with keyboard focus in a field of the view holding a typed value, and again on a closed select showing a chosen option
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** the field's value and the select's chosen option are unchanged

#### Scenario: Escape collapses the dock in the strip's failure states
- **GIVEN** the dock is expanded while the interior read has failed, and again while the own-fleets read has failed, and again while the canvas is unavailable
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed in each

#### Scenario: Escape with the dock collapsed changes nothing
- **GIVEN** the dock is collapsed and a body is selected
- **WHEN** Escape is pressed
- **THEN** the dock is still collapsed and the same body is still selected

#### Scenario: Escape collapsing the dock clears no selection
- **GIVEN** the dock is expanded and a body is selected and a fleet is acting
- **WHEN** Escape is pressed
- **THEN** the dock collapses, the same body is still selected and the same fleet is still acting
- **AND** the press issues no network request

#### Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed
- **THEN** the menu closes with focus on the chevron
- **AND** the dock is still expanded
- **AND** a second Escape then collapses the dock

#### Scenario: A held Escape that closed the menu does not also collapse the dock
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed and held so that its keydown repeats
- **THEN** the menu closes
- **AND** the dock is still expanded

#### Scenario: Escape closes the fleet inspector without collapsing the dock
- **GIVEN** the dock is expanded and the own-fleet inspector is open with keyboard focus inside it
- **WHEN** Escape is pressed
- **THEN** the inspector closes and focus returns to the fleet chevron
- **AND** the dock remains expanded without changing selection, acting fleet or issuing a request
- **AND** after release a fresh Escape press collapses the dock with focus remaining on the chevron

#### Scenario: Held Escape closes only the fleet inspector
- **GIVEN** the dock is expanded and the own-fleet inspector is open with keyboard focus inside it
- **WHEN** Escape is pressed and held so that its keydown repeats after focus returns to the chevron
- **THEN** the inspector closes but the dock remains expanded for every repeat of that held press

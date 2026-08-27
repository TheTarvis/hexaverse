# Visualization spikes for the fog/stealth/intel model

Companion to `README.md`'s "Fog, stealth & intel" section (2026-08-26).
These are **standalone spike pages** that showcase the perception concepts
without the burn solver, fuel, or command flow — scripted fleets, page-local
state, `sim.ts` reused read-only for generation/orbits. Perception ideas demo
best in isolation, where you control both sides of the camera.

Packaged as **two spikes** (not four pages):

## `/spike/intel` — the knowledge game *(built 2026-08-26)*

Lives at `frontend/app/spike/intel/` — `intel.ts` (pure: patrol script,
sighting/knowledge fold, pulse/echo solver), `IntelView.tsx` (render-only GL),
`page.tsx` (HUD + sighting log), tests alongside. You park on rails at II's
planet; the patrol calls there first (opening live contact), then flies
p2→p4→p1 forever. Hold Space (or the Truth button) for god view.

Validates the core bet: **is "a pile of timestamped ghosts" fun to look
at?** Two fleets — one yours, one scripted on a patrol loop.

- **Truth/knowledge toggle** (spacebar-hold "god view" or split-screen): flip
  between *what is* and *what you know*. The delta between the two views IS
  the game; side-by-side is how you feel whether the delta is interesting.
- Enemy renders **live** inside your passive bubble, then freezes into a
  **ghost marker stamped with its sighting time** ("seen 50:00:30 · 4m ago"),
  fading/desaturating as it ages.
- **Glimpse vs track, drawn as what each predicts** (the money shot):
  - *Glimpse* → a static timestamped ghost at the last-known point. (A
    growing "could-be" shell was tried and **cut 2026-08-26** — the ghost
    icon + age label alone reads better.)
  - *Track* → the **predicted orbit line with the ghost sliding along it** —
    pinpoint forever — until the scripted fleet burns and the prediction
    visibly *breaks* (ghost keeps riding the old rail; god view shows the
    divorce). One image explains the whole intel quality ladder.
- **Scan pulse** (flavor, folded in here): an expanding wavefront sphere
  from the scanner; bodies/fleets light up with their `asOf` stamp as it
  passes — the visualization that *justifies* round-trip ETA and
  stale-by-construction echo data. The pulse is what mints sightings.
- Stays **3D** — ghosts-in-space is the aesthetic being tested.

## `/spike/stealth` — signatures and shadows *(built 2026-08-26)*

Lives at `frontend/app/spike/stealth/` — `stealth.ts` (pure: signature radii,
max(bubble, signature) detection, event-log fold with the interval sweep,
shadow wedges, orbit-arc eclipse classification, station-keep marker info),
`StealthView.tsx` (render-only **2D top-down SVG** — the doc's own
recommendation held: wedges and rings read instantly from above at a fraction
of the 3D cost, and no GL gate is needed), `page.tsx` (HUD + the three
sliders + event log), tests alongside. The intel spike's patrol is reused as
the scripted fleet (p2→p4→p1); drag the cyan observer, click anywhere to
price a station-keep hiding spot. Dial defaults: plume 120 u, trim 12 u,
bubble 30 u.

Validates detection asymmetry and the hiding economy. No fog rendering —
just draw everyone's loudness and the occlusion geometry.

- **Signature rings** per fleet: huge/pulsing while burning (plume =
  beacon), small steady ring for station-keep trim, near-zero for
  rails/point. A scripted fleet burns across the system trailing an
  "everyone sees this" ring, parks, shrinks to a dot.
- One observer with a passive-bubble radius and a simple **event log**
  ("50:01:10 — contact burning" / "50:02:40 — contact went dark") writing
  itself as rings intersect — doubles as a preview of sighting-record UI.
- **Tuning sliders**: plume range / trim range / bubble radius — feel the
  ambush-vs-telegraph balance instead of arguing numbers.
- **Shadow volumes**: pick a draggable observer; every planet casts a
  translucent occlusion cone away from it. Drag the observer, watch the
  safe volumes swing.
- **Orbit-arc painting**: a rails orbit colored visible-vs-eclipsed from
  that observer — "hidden for this 40% of your orbit" made legible. The
  free-but-periodic hiding of `orbit` vs the paid-but-constant hiding of
  `stationkeep` in one picture. Cherry: click inside a shadow cone to place
  a station-keep marker showing its running Δv drain — the fuel bill for
  staying invisible.
- Consider **2D top-down ecliptic** for this one: cones and detection rings
  are annulus-and-wedge geometry that reads instantly from above, at half
  the build cost. (The intel spike stays 3D.)

## Build notes

- Reuse `frontend/app/spike/space-3d/sim.ts` generation + orbit math
  read-only; do NOT import its burn/fuel/command machinery.
- Scripted fleets are fine — e.g. a patrol that alternates rails parking
  with occasional teleport-free "burns" faked as slow lerps along a curve;
  the spike is about perception, not motion fidelity.
- Same quality gates as the PoC: vitest for the pure knowledge/detection
  logic, GL-mount gate for jsdom, `data-testid` on interactive elements.

## Findings fed back into the design (see README fog section)

- **Continuous bubble coverage is a requirement, not a nicety.** The intel
  spike's 5 Hz knowledge tick let a hard-burning ship transit the bubble
  unflagged at 64× time; the spike papers over it with a fixed-sample
  interval sweep, but the real `observation` replacement must solve the
  path-vs-bubble intersection in closed form.
- **Bubble entry is an event.** A contact record mints on entry (red flag in
  log + scene), a departure glimpse on exit — "flagged", not just a live
  status the player might not be watching.
- **Detection is one rule: `range ≤ max(bubbleRadius, signature)`** (stealth
  spike). Loudness and proximity aren't separate systems — a fleet's
  signature is just a second radius, and the fog model needs nothing more.
  Signature floors matter: the burn plume has a floor (0.3× plume range in
  the spike) so *ignition itself is always an event*, which is what makes
  "everyone sees the army burn in" true regardless of burn length.
- **Free periodic hiding is guaranteed, not situational.** The host body
  always eclipses part of its own parking orbit from any distant observer
  (the arc painting shows it every time) — so rails parking has baseline
  stealth value by construction, and the stationkeep fuel bill buys the
  upgrade from "hidden sometimes" to "hidden always".
- **The trim rung didn't survive review (2026-08-26).** Station-keep's
  faint-but-detectable trim plume was cut as too complicated a solution.
  Replaced by the **docking mask**: a ship attached to a body/station/ship
  registers as its host, and only a targeted per-body focused scan reveals
  it (see the README's revised signature ladder). This also demotes the
  eclipse finding above — shadow geometry stays as LOS occlusion, but it is
  no longer the hiding economy (risk-priced masking is). The stealth
  spike's trim slider and hidden-arc framing are superseded; plume scaling
  by engine/power is the surviving direction.

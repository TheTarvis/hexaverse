# Camera & Input Controls — Brainstorm (galaxy tier)

> **Living doc, high-level only.** How you move the **camera** and give **input** on
> the galaxy 3D view — the layer between the player's mouse/keys and the star map.
> Nothing here is committed design. `?` = open question; **DECIDED** = locked.
> Feeds **#0002** (galaxy view) — camera/input is part of that renderer's remit, or a
> small spec of its own if it grows. Created 2026-07-08.
>
> **Scope / boundary.** This owns the **galaxy-tier 3D camera** (orbit/pan over the
> disk) and its input gestures. The **board tier is 2D** (`hex-board.md` — SVG),
> so its "camera" is plain 2D pan/zoom with a different input model; noted here, owned
> there. The graph↔board handoff swaps input contexts.
>
> Context: `../specs/0002-galaxy-view.md` (the renderer), `movement-galaxy.md` (the
> select→preview→commit gestures — this doc must not fight them), `fog-of-war.md` /
> `../lore.md` (why the frontier home sits on the rim, framing the default view),
> `hex-board.md` (the board-tier 2D input this defers to), and the live prototype
> `frontend/app/spike/galaxy-3d/`.

---

## The problem (why this doc exists)

The galaxy is a **flattened disk in the XY plane** (broad x/y, thin z — spec #0001).
Two things about the original spike controls fought the player — **both now resolved**
(2026-07-08, see the decided model below); kept here as the motivation:

1. **Wrong "up."** The force-graph library's OrbitControls default to **Y-up**, but our
   ground plane is **XY (z is up)**. So the disk stands on edge relative to the orbit
   axis, and dragging **tumbles the whole plane** instead of orbiting over it like a
   turntable. → *Resolved: world up = Z, with the control quats re-derived (setting
   `cam.up` alone isn't enough — see the decided model).*
2. **Orbit always looks AT its target.** Pivot on home and you can inspect home from any
   angle but you can **never "look from home toward the centre"** — to face a different
   direction you'd have to move the pivot. → *Resolved: ground-plane pan moves the focus,
   so you pan inward to look toward the centre instead of being glued to home.*

---

## Camera model — recommend RTS-style orbit/pan over the disk

| Model | Feel | Verdict |
|---|---|---|
| **Orbit-on-focus** (current) | pivot a point, always look at it | great to *inspect* a system, wrong to *navigate* the map |
| **RTS pan-orbit over the ground plane** | hover above the disk, pan the focus across it, yaw/pitch around it, zoom | **recommended** — the disk is a table you glide over and face any way |
| **Free-fly (6DOF)** | full freedom | too much; disorienting for a chill strategy map |

**DECIDED (2026-07-08, proven in the spike): RTS pan-orbit, Z-up, ground-plane pan.**
The disk is the table; you hover above it and:

- **World up = Z** (the XY disk is the ground). *Gotcha found & fixed:* OrbitControls
  bakes its orbit basis from `camera.up` **once, in its constructor** (while up was
  still +Y), so setting `cam.up = Z` alone left the controls orbiting around Y —
  poles sitting *in* the disk plane — which read as "horizontal drag does nothing,
  then flips the camera above/below z=0 at the limit." Fix: re-derive the control's
  `_quat`/`_quatInverse` from Z-up after mount so the orbit poles sit straight over
  the disk.
- **Ground-plane pan moves the focus.** `screenSpacePanning = false` — pan runs parallel
  to the disk (`object.up × cameraRight`), so gliding keeps constant height instead of
  climbing toward the camera when pitched. This is what lets you "look toward the centre"
  — you *pan the focus* inward, instead of being glued to home. **Pan speed scales by the
  camera's *height* above the disk, not its slant distance to the focus** — at a grazing
  pitch the slant distance stays large while the camera sits low, so distance-based
  scaling flings the near-field foreground past you ("too glidy when flat"); height
  collapses as you flatten out, so pan slows to match. (Gesture = two-finger swipe or
  right-drag; see mapping below.)
- **Yaw** around the focus (horizontal), **pitch unclamped — full pole-to-pole orbit**
  (`minPolarAngle 0` / `maxPolarAngle π`). You can tilt from true top-down, through a
  low oblique, all the way *under* the disk to view it from below. We deliberately tried
  a "never go under the disk" clamp (~14°–83°) first and **rejected it**: bumping into an
  invisible mid-tilt stop felt arbitrary and confusing, and the freedom of full orbit
  reads better than the disorientation it risks. Trade-off accepted: under the disk your
  left/right and core/rim sense mirror, and the exact poles can spin fast (gimbal) — worth
  it. (`OrbitControls.makeSafe()` keeps the poles from breaking.)
- **Zoom = dolly**, scroll/pinch. (Clamp range — system-close ↔ see-a-whole-arm — still
  to tune.)
- **Damping on** so the Mac trackpad's inertial scroll reads as a glide, not a jerk.
- **Focus/recenter.** **Double-click a system → fly to it and make it the orbit target**,
  *preserving the current angle and zoom* (the camera glides so the star lands centred —
  flying over the map, not cutting to a fixed framing). The **⌖ recenter button** snaps to
  the fleet with the standard oblique framing. Both wired in the spike.

The frontier framing falls out of this: spawned on the rim, the default view looks
*inward across the disk*, galaxy sprawling toward the centre behind your home star.

---

## Interaction input (the other half — camera must not fight selection)

The pointer does double duty: **move the camera** *and* **select/command**. Keep them
from colliding:

- **Drag = camera, click = select.** Use a click-vs-drag threshold (small movement =
  click). A drag never selects; a click never moves the camera.
- **Selection & orders live in `movement-galaxy.md`** (select a system → live route
  preview → commit "Plot course"; background-click or re-click to deselect). This doc
  doesn't redefine them — it just guarantees the camera gestures leave them room.
- **Gesture mapping — DECIDED (tuned to the Mac trackpad, proven in the spike):**
  **one-finger / left-drag = orbit** — the one easy gesture goes to the verb with no
  other easy input; **two-finger swipe = ground-plane pan**; **pinch = zoom**; **click =
  select**. **Right-drag also pans** but is redundant with swipe, so its two-finger-click
  clumsiness is moot. *(We first tried the MapControls default — left-drag pan / right-drag
  orbit — but on a trackpad panning already has the swipe, so the scarce one-finger drag
  is better spent on orbit.)* Still `?`: WASD/arrows pan, Q/E yaw, **F** focus selected,
  **recenter fleet** = ⌖ button + key, **Esc** deselect. Chill and forgiving over twitchy.
- **How swipe→pan works:** macOS delivers a two-finger swipe as a plain `wheel` event and
  a pinch as `wheel` + `ctrlKey`; a **capture-phase wheel listener** on the wrapper routes
  plain wheel → pan (preempting OrbitControls) and lets ctrl+wheel fall through → zoom.
- **Known trade-off (`?`):** a real **mouse scroll-wheel is indistinguishable from a
  swipe** (both plain `wheel`), so on the spike the wheel now *pans*, and there's no
  wheel-zoom on a mouse (trackpad has pinch). Add a delta-shape heuristic (mouse = big
  discrete `deltaY`-only steps; swipe = small, often two-axis) if/when mouse support
  matters. **Touch-screen** (as distinct from trackpad) still deferred.

---

## Spike vs. the real renderer

The spike rides **react-force-graph-3d**'s built-in controls — a **prototyping crutch**.
With **Z-up + screen-space panning** enabled it's good enough to *feel out* the map, but
its control set won't deliver the full pan/yaw/pitch/clamp/focus rig above. The spike now
reaches the DECIDED feel by configuring the library's OrbitControls instance
(ground-plane height-scaled pan, damping, MapControls button map, unclamped pitch) **plus
poking a private field** (`_quat`) to force Z-up — a library-specific hack that works but proves the point:
**the real #0002 view should own its camera** (own OrbitControls/MapControls config or a
hand-rolled RTS controller) rather than reach into force-graph internals. The settled
feel above is the spec; the spike is just where it was proven.

---

## Open questions

- ~~**Pitch clamp**~~ **RESOLVED (2026-07-09): unclamped, full pole-to-pole orbit** —
  tried a ~14°–83° "never under the disk" clamp and rejected it (the mid-tilt stop felt
  arbitrary); full orbit reads better. See the decided model above.
- **Auto-follow vs. manual recenter** — does the camera follow the fleet on each travel
  hop, or stay put with a recenter button? (Shared with `movement-galaxy.md`; lean
  *manual* for a strategic map, but worth trying follow-cam.)
- **Pan bounds** — free-roam the whole star field, or soft-bound to charted + visible
  space so you don't get lost in empty dark?
- **Zoom range & the tier handoff** — does zooming *all the way into* a system become
  the entry to its 2D board (`hex-board.md`), or is that a separate click? (Ties the two
  cameras together.)
- **Keybindings finalisation; touch model.**
- **Custom rig vs. library** for #0002 — decide when building the real view.

---

## Next step

Prototype the RTS pan-orbit feel in `/spike/galaxy-3d` (Z-up landed; pan/yaw/pitch/clamp
next). Fold the settled model into **#0002** (galaxy view) — as part of that spec, or a
small `camera-and-input` spec if it grows its own weight.

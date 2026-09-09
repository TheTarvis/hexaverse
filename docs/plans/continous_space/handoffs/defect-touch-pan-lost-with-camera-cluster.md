# Deliberate gap — touch-only players lose camera pan with the camera cluster

**Status:** accepted, deliberate, recorded. Not a regression against any live
requirement; a capability loss with no owner until someone wants it.
**Introduced by:** `add-vitals-strip` (link 2a of the system-HUD chain), which
shrinks the on-screen camera cluster from twelve buttons to four.
**Found:** 2026-09-09, by the UX reviewer on that change's panel.
**Adjudicated:** `add-vitals-strip-rulings.md` FULL-AUTO RULING 24.

## What is lost

The four `camera-pan-{left,right,up,down}` buttons in `SpaceStage.tsx` are
deleted. As far as the live specs and the code show, they were the **only
touch-accessible pan path**:

- `system-space-view` *Space View Camera Orbit, Pan, and Zoom* provides
  secondary-button drag-to-pan — mouse only.
- `system-space-view` *Space View Camera Touch Pinch-Zoom* defines pinch-zoom
  and single-finger orbit. **It defines no pan.**
- `system-space-view` *Space View Camera Is Keyboard-Operable* gets a
  `Shift`+arrow binding in this change (RULING 23), which is a keyboard path,
  not a touch one.

So after this change a touch-only player can still tap bodies and lane gates
directly, and can orbit and zoom — but cannot translate the camera, and
therefore cannot move `select-pan-target-point`'s target away from the star.
Every burn solve rejects the star, which is the exact failure the keyboard-pan
paragraph in that requirement was written to prevent, reproduced for a different
input modality.

## Why it is not a blocker

**No live requirement is falsified.** *Space View Camera Touch Pinch-Zoom* never
promised pan; the buttons happened to be touch-reachable, but nothing specified
them as the touch pan path. What is lost is capability, not conformance — which
is precisely why it needs to be written down rather than discovered later as an
apparent regression against a spec that never mentioned it.

## Why it is not fixed here

A touch pan gesture has to be a two-finger drag, which collides with
pinch-zoom's own two-finger claim. Disambiguating them is real interaction
design with its own spec surface (gesture arbitration, thresholds, and their
scenarios), not something `add-vitals-strip` can absorb — it sits at its task
cap, and the chain the change belongs to is explicitly laptop-first and forbids
a mobile layout.

## When it would be worth fixing

If touch ever becomes a target modality for the system view. At that point it is
a change of its own against `system-space-view`'s touch requirement, and it
should settle gesture arbitration for pan and pinch-zoom together rather than
bolting pan on.

## What would make this stale

Someone adding a touch pan gesture, or the project deciding touch is out of
scope for the system view permanently and saying so in
`openspec/specs/system-space-view/spec.md`. Either dissolves this note. Per the
handoffs README's lesson five, this note names its cause so the cause can be
checked: **it is live only while `Space View Camera Touch Pinch-Zoom` exists and
defines no pan.**

# Drift — the previewed burn curve is specified and never drawn

**Status:** confirmed, adjudicated **code wrong**, routed to link 4
(`add-arc-figures-and-entity-tab`) of the system-HUD chain.
**Found:** 2026-10-03, by the `add-burn-cost-overlay` design analyst
(`add-burn-cost-overlay-analysis.md` § 6 item 4); confirmed by the orchestrator.
**Adjudicated:** `add-burn-cost-overlay-rulings.md` FULL-AUTO RULING 7.

## The requirement

`openspec/specs/system-space-view/spec.md`, *Burn Preview Reflects the
Server-Solved Order, Without Committing*: the system SHALL render the previewed
order's solved curve as a distinct preview overlay; its first scenario,
*Selecting a target shows a preview curve and its figures*, says the returned
curve is rendered.

## The code

`BurnPreview.controlPoints` (`frontend/lib/types/fleet.ts`) has no production
consumer. `buildSceneModel` in `frontend/components/space/space-scene.ts` takes
no preview input, and `SpaceStage.tsx` receives none; the only curves the scene
draws are a *running* burn's. The command panel shows the quote's figures; the
canvas shows nothing for an uncommitted selection.

## Why the suite is green

The panel's tests assert the figures; the scene's tests assert a running burn's
curve. No test asserts a curve for an uncommitted preview.

## Why it is not fixed in links 2a-ii / 2a-iii

The fix touches `space-scene.ts`, `SpaceStage.tsx`, `webgl/SpaceWorld.tsx` and
the line-anchored guard list — none of which `lift-burn-preview-to-view` or
`add-burn-cost-overlay` otherwise opens. `lift-burn-preview-to-view` is what
makes the fix *possible* (the view will hold the quote the stage needs).

## Owner

Link 4, whose arc label "rides the drawn curve" and whose solid/dashed split
MODIFIES the rendering requirement anyway. Its analyst should treat "the curve
is drawn today" as false.

## What would make this stale

A production consumer of the previewed `controlPoints` in the scene model, with
a test that fails without it.

# Confirmed drift — the space view never detects a reduced-motion preference

**Status:** OPEN, confirmed 2026-09-19 by the orchestrator, independently of
the reviewer who found it. **Adjudication: the code is wrong, the spec is
right.** Awaiting Travis's scope call (see *Whose call it is*).

**Found by:** `openspec-ux` during the Phase-1 panel on
`fix-world-time-render-loop` (finding 3 —
`fix-world-time-render-loop-panel-ux.md`). Verified by the orchestrator with
the greps below before filing.

## The live requirement

`openspec/specs/system-space-view/spec.md:1323` — *Space View Respects
Reduced-Motion Preference*:

> WHILE the user's system indicates a reduced-motion preference, the system
> SHALL hold the starfield, nebula, film-grain, body-surface, and
> fleet-plume animation static (their time input frozen), while body,
> fleet, and contact positions continue to advance with world time, and
> selection state continues to render accurately.
>
> #### Scenario: Reduced motion freezes decorative animation while positions keep advancing
> - **WHEN** the user's system has a reduced-motion preference set and the
>   view renders across several frames
> - **THEN** the starfield, nebula, film-grain, body-surface, and
>   fleet-plume animation hold static (their time input frozen)
> - **AND** body, fleet, and contact positions continue to advance with world
>   time

## The code

The freeze **mechanism** exists and is correct:

- `frontend/components/space/space-scene.ts:192` — `reducedMotion: boolean` on `SceneInput`
- `frontend/components/space/space-scene.ts:267` — destructured
- `frontend/components/space/space-scene.ts:282` — `decorativeTimeMs: reducedMotion ? 0 : worldTimeMs`
- `frontend/components/space/space-scene.ts:512` — same, second site

The **preference is never detected**. The one and only production call site
hardcodes it false:

- `frontend/components/space/SystemSpaceView.tsx:438` — `reducedMotion: false,`

And nothing in the frontend ever asks the platform:

```
$ grep -rn 'reducedMotion' frontend --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
frontend/components/space/space-scene.ts:192:  reducedMotion: boolean
frontend/components/space/space-scene.ts:267:  const { interior, fleets, worldTimeMs, reducedMotion, selection, log, sightings } = input
frontend/components/space/space-scene.ts:282:    decorativeTimeMs: reducedMotion ? 0 : worldTimeMs,
frontend/components/space/space-scene.ts:512:    decorativeTimeMs: reducedMotion ? 0 : worldTimeMs,
frontend/components/space/SystemSpaceView.tsx:438:        reducedMotion: false,

$ grep -rn 'prefers-reduced-motion' frontend --include='*.ts' --include='*.tsx' --include='*.css'
(no output)
```

So `reducedMotion` is structurally dead: the branch at `space-scene.ts:282`
and `:512` can only ever take the `worldTimeMs` arm in production. A player
with the OS preference set gets the full starfield, nebula, film-grain,
body-surface and plume animation.

## Why this is lesson one again

This is the sixth instance of the pattern `handoffs/README.md` catalogues:
**built, unit-tested against its own behaviour, and never called.** The
freeze is covered by unit tests (`space-scene.test.ts:453-501`) which pass by
constructing their own `reducedMotion: true` input — exactly the shape where
"a green suite proves the unit correct while nothing in production reaches
it." `openspec validate --strict` does not catch it and neither does a test
that builds its own request.

## Adjudication

Per the team's drift rule (`.claude/skills/openspec-team-workflow/SKILL.md`,
*Spec-first invariant*): the spec describes intended behaviour that was
specified and accepted; the code never implemented the detection half. **Code
wrong → corrective change through the pipeline.** This is explicitly *not* a
baseline correction — the requirement is not a misdescription of
pre-existing behaviour, it is a requirement that was never met.

Nobody may silently edit either side to match the other. In particular,
weakening or deleting *Space View Respects Reduced-Motion Preference* to
match the code is forbidden.

## The coupling to `fix-world-time-render-loop` — this part IS in scope

`fix-world-time-render-loop` relocates the only call site. design.md
Decision 3 enumerates what the frame loop receives — *"the scene's inputs
(interior, fleets here, selection, sightings) by ref plus the clock"* — and
**omits `reducedMotion`**. If the refactor lands as written, the dead
parameter is at best still dead and at worst dropped entirely, with its last
call site now inside an imperative rAF loop rather than a memo, which makes
the eventual fix harder rather than easier.

Fixing the drift is a scope decision. **Not regressing it is not.** The
orchestrator has ruled that `fix-world-time-render-loop` must, at minimum,
keep `reducedMotion` threaded through to the frame loop's `buildSceneModel`
call and name it in design.md's input list — see
`fix-world-time-render-loop-rulings.md`, RULING 3.

## Whose call it is

Travis's, and it is a scope question, not a technical one. The options, with
the panel's recorded lean:

1. **Fold the detection into `fix-world-time-render-loop`.** The UX reviewer's
   recommendation: *"since the call site is being touched anyway, this is the
   cheapest moment to wire a real `matchMedia('(prefers-reduced-motion:
   reduce)')` read into the inputs and close this gap in the same change —
   cost is near zero (one media-query hook, one prop threaded where `false`
   is threaded today)."* Cost: one hook, one prop, one scenario already live
   (no new requirement needed — the requirement exists and is unmet). Risk:
   widens a change whose whole point is a narrowly-scoped render fix, and
   adds a `matchMedia` subscription to a view whose subscription behaviour is
   exactly what is under repair.
2. **Its own follow-up change** (`add-reduced-motion-detection` or similar),
   authored after this one archives. Keeps `fix-world-time-render-loop`
   narrow. Risk: this repo's own record says five such derivations sat dark
   for months.

The orchestrator did not rule between these, because this run carries no
authorization to widen the change's scope and `--full-auto` is not in force.

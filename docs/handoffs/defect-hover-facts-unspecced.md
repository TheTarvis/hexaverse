# Spec gap — the space view's hover-facts surface has no covering requirement

**Status:** open. **Found:** 2026-09-08, by `openspec-design-analyst` while
decomposing `add-figure-formatting` (chain link 1, `docs/plans/system-hud/chain.md`).
**Deliberately not specced in that change** — see FULL-AUTO RULING 10 in
`add-figure-formatting-rulings.md`.

## What

`frontend/components/space/SpaceStage.tsx` renders a hover/selection facts readout
for own fleets, foreign contacts and sighting ghosts. Verified by grep across
`openspec/specs/`: **no requirement in any capability mentions this surface** — not
the own-fleet hover facts, not the `Arrives in …` detail line, not the bearing or
speed readouts.

Two capabilities do require the *marks* to render (`system-space-view` › *Foreign
Contacts Render at Their Served Position* and *A Sighting Ghost Renders at Its
Frozen Position, Never a Predicted One*), but neither says anything about a facts
readout or the format of any figure in one.

Sites:

| Line | Renders | Mechanism |
|---|---|---|
| `:663–664` | `contact-facts` — `Bearing …toFixed(0)° / Speed …toFixed(2)` | `toFixed` |
| `:697` | ghost mark sr-only — `Observed at {mark.asOf}` | raw world-ms in an a11y label |
| `:709–711` | `sighting-facts` — `Observed at {mark.asOf ?? '—'}` + bearing/speed | raw + `toFixed` |
| `:821` | `fleet-facts` — `Arrives in ${formatEta(remaining)}` | `lib/eta.ts` |
| `:828` | `fleet-facts` drift — `Bearing …toFixed(0)° · Speed …toFixed(2)` | `toFixed` |

## Why it matters now

`add-figure-formatting` retires `lib/eta.ts`, so `:821` **must** move onto the new
formatter in that change, and it does — along with `:697`'s stamp, which is a
world-millis integer reaching an assistive-technology label. Bearing and speed do
not move: neither quantity appears in the design input's rules table, in either
design document, so any rounding, unit or ladder for them would be invented.

The chain doc says "a component that calls `toFixed` … is a defect" after link 1.
Under RULING 10 that rule is scoped in the spec to the quantities
`figure-formatting` defines, so these five `toFixed` sites are a **named, recorded
exception** rather than a requirement the change knowingly violates on the day it
lands.

## Why it is not fixed in `add-figure-formatting`

Writing requirements for unspecced existing behaviour is `openspec-brownfield`'s
job, in its own step, with a baseline-mode adversary audit against the code —
`.claude/skills/openspec-team-workflow/SKILL.md` § Entry modes is explicit that a
brownfield retrofit and a change against the same capability are two steps, not
one. Authoring a baseline inside a change would produce exactly the unaudited
baseline that skill warns poisons every delta built on it.

## What the follow-up looks like

A brownfield pass over the space view's facts readouts — own fleet, contact,
ghost — producing baseline requirements for what the surface shows today, audited
in baseline mode against `SpaceStage.tsx`. Only then can a change decide what
bearing and speed should read as. Note the chain's links 3 and 4 both touch this
surface (the in-system list, the arc label, the selected-entity tab), so the
retrofit is worth doing before link 3 rather than after link 4.

## Whose call

Travis's, on sequencing: the retrofit is cheap and unblocks a real formatting
rule, but it is not on the system-HUD chain and inserting it would extend the
chain by a link.

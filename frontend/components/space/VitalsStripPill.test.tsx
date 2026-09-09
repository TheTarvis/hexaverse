import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// RED-PHASE SUITE — openspec change `add-vitals-strip`, capability
// `system-console`: *The Fleet Cell's State Pill Is a Projection of the
// Shared Roster Derivation* (impl contract §4, tasks.md 3.1-3.5). The
// change's single load-bearing claim — three adversary rounds, six of round
// 2's nine findings and most of round 1's, landed here. `VitalsStripPill.tsx`
// does not exist yet — every test below is COMPILE-RED until it does.
//
// THE CLOSED PROPS SIGNATURE (contract §4), pinned here — FOUR PROPS, AND NO
// `Fleet`:
//
//   export interface VitalsStripPillProps {
//     status: RosterRowStatus | null
//     stranded: boolean
//     scale: number | undefined
//     worldTime: number
//   }
//
// NO test in this file imports `Fleet` or constructs one — that IS the
// invariant under test (contract §4.1, done-conditions §16: "VitalsStripPill
// .tsx contains no import of Fleet and no reference to state, attachedTo,
// Park, or jump"). Every fixture below is a hand-built `RosterRowStatus`.

import { VitalsStripPill } from './VitalsStripPill'
import type { RosterRowStatus } from '@/components/fleet/roster-status'
import { assertFiguresMatchModule, assertNoFigures } from '@/lib/format/assert-figures'

const T0 = 21_175_110_953

function status(over: Partial<RosterRowStatus> = {}): RosterRowStatus {
  return {
    tone: 'idle',
    where: 'Axion',
    activity: 'On station',
    activityKind: 'onstation',
    ...over,
  }
}

describe('VitalsStripPill — the rendered ladder, a switch on activityKind alone (contract §4.3)', () => {
  it('Scenario: null status -> figure-formatting absent form, no crash, no fleet needed', () => {
    const { container } = render(<VitalsStripPill status={null} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/—/)
    assertNoFigures(container)
  })

  it('Scenario: transit -> "In transit" + vitals-pill-eta', () => {
    const { container } = render(
      <VitalsStripPill
        status={status({ activityKind: 'transit', activity: 'In transit', etaWorldMs: T0 + 90_000 })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/In transit/)
    expect(screen.getByTestId('vitals-pill-eta')).toBeInTheDocument()
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('Scenario: A burning fleet\'s pill counts down to its served arrival, naming a body target by type and id — never the raw id alone, never an invented name', () => {
    render(
      <VitalsStripPill
        status={status({
          activityKind: 'underway',
          activity: 'Under way',
          targetLabel: 'planet body-1',
          etaWorldMs: T0 + 60_000,
        })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Under way/)
    expect(pill.textContent).toMatch(/planet body-1/)
    // Fails against an invented name and against dropping the type word.
    expect(pill.textContent).not.toMatch(/Nice Planet|Unnamed World/)
    expect(screen.getByTestId('vitals-pill-eta')).toBeInTheDocument()
  })

  it('Scenario: A burn toward a lane gate names the gate\'s destination system, with its remaining duration', () => {
    render(
      <VitalsStripPill
        status={status({
          activityKind: 'underway',
          activity: 'Under way',
          targetLabel: 'Gate Borealis',
          etaWorldMs: T0 + 60_000,
        })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Under way/)
    expect(pill.textContent).toMatch(/Gate Borealis/)
    expect(screen.getByTestId('vitals-pill-eta')).toBeInTheDocument()
  })

  it('Scenario: mining -> "Mining" + vitals-pill-eta', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'mining', activity: 'Mining', etaWorldMs: T0 + 30_000 })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/Mining/)
    expect(screen.getByTestId('vitals-pill-eta')).toBeInTheDocument()
  })

  it('Scenario: drifting -> "Drifting", no extra figure', () => {
    render(
      <VitalsStripPill status={status({ activityKind: 'drifting', activity: 'Drifting' })} stranded={false} scale={1} worldTime={T0} />,
    )
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/Drifting/)
    expect(screen.queryByTestId('vitals-pill-eta')).toBeNull()
    expect(screen.queryByTestId('vitals-pill-rate')).toBeNull()
  })

  it('Scenario: A docked fleet at a lane gate names its destination system — "Docked at Gate {system}"', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'docked', activity: 'Docked', hostLabel: 'Gate Borealis' })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Docked/)
    expect(pill.textContent).toMatch(/Gate Borealis/)
    expect(screen.queryByTestId('vitals-pill-eta')).toBeNull()
  })

  it('Scenario: A docked fleet at a feature names its type and served id — "Docked at {type} {id}"', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'docked', activity: 'Docked', hostLabel: 'asteroid feat-9' })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Docked/)
    expect(pill.textContent).toMatch(/asteroid feat-9/)
  })

  it('Scenario: holding -> "Holding" + vitals-pill-rate (never vitals-pill-eta)', () => {
    const { container } = render(
      <VitalsStripPill
        status={status({ activityKind: 'holding', activity: 'On station', stationKeepRateTonsPerSecond: 0.02 })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/Holding/)
    expect(screen.getByTestId('vitals-pill-rate')).toHaveAttribute('data-unit', 'tons-per-world-s')
    expect(screen.getByTestId('vitals-pill-rate')).toHaveAttribute('data-raw', '0.02')
    expect(screen.queryByTestId('vitals-pill-eta')).toBeNull()
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('Scenario: onstation -> "On station", no extra figure', () => {
    render(<VitalsStripPill status={status()} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/On station/)
    expect(screen.queryByTestId('vitals-pill-eta')).toBeNull()
    expect(screen.queryByTestId('vitals-pill-rate')).toBeNull()
  })

  it('vitals-pill-rate is never rendered outside the holding state, even when stationKeepRateTonsPerSecond happens to be present', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'onstation', stationKeepRateTonsPerSecond: 0.02 })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    expect(screen.queryByTestId('vitals-pill-rate')).toBeNull()
  })
})

describe('VitalsStripPill — degradation, never a blank pill (contract §4.3, roster-status §2.3 fallbacks)', () => {
  it('Scenario: A docked fleet at an unresolvable host degrades the pill, it does not blank it — the raw attachedTo id names the host', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'docked', activity: 'Docked', hostLabel: 'raw-attach-id-9' })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Docked/)
    expect(pill.textContent).toMatch(/raw-attach-id-9/)
  })

  it('Scenario: An unresolvable burn target degrades the pill, it does not blank it — the raw body id names the target', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'body-77', etaWorldMs: T0 + 1000 })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Under way/)
    expect(pill.textContent).toMatch(/body-77/)
  })

  it('Scenario: A burn toward a point in space names the point, not an empty target', () => {
    render(
      <VitalsStripPill
        status={status({
          activityKind: 'underway',
          activity: 'Under way',
          targetLabel: 'a point in space',
          etaWorldMs: T0 + 1000,
        })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/a point in space/)
    expect(pill.textContent).not.toMatch(/\d+\.?\d*\s*,\s*-?\d/)
  })

  it('Scenario: An unserved rate degrades the holding pill, it does not blank it — figure-formatting absent form, never an empty pill', () => {
    const { container } = render(
      <VitalsStripPill
        status={status({ activityKind: 'holding', activity: 'On station', stationKeepRateTonsPerSecond: undefined })}
        stranded={false}
        scale={1}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Holding/)
    const rate = screen.getByTestId('vitals-pill-rate')
    expect(rate).not.toHaveAttribute('data-raw')
    expect(rate.textContent).toMatch(/—/)
    void container
  })
})

describe('VitalsStripPill — countdown and rate figures are absent before a scale is served (contract §4.3)', () => {
  it('Scenario: The pill\'s countdown and rate read absent until a scale is served, while the state name still renders', () => {
    const { container } = render(
      <VitalsStripPill
        status={status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 30_000 })}
        stranded={false}
        scale={undefined}
        worldTime={T0}
      />,
    )
    const pill = screen.getByTestId('vitals-state-pill')
    expect(pill.textContent).toMatch(/Under way/)
    // figure-formatting "A Figure Whose Clock Scale Has Not Been Served Reads
    // as Absent": the value is known and only the scale is not, so data-raw
    // is still carried (RULING 29 — this test previously asserted the
    // opposite and contradicted the live requirement).
    const eta = screen.getByTestId('vitals-pill-eta')
    expect(eta).toHaveAttribute('data-raw', '30000')
    expect(eta.textContent).toMatch(/—/)
    void container
  })

  it('Scenario: the holding rate reads absent with no served scale, state name still renders', () => {
    render(
      <VitalsStripPill
        status={status({ activityKind: 'holding', activity: 'On station', stationKeepRateTonsPerSecond: 0.02 })}
        stranded={false}
        scale={undefined}
        worldTime={T0}
      />,
    )
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/Holding/)
    // Same rule as above (RULING 29): data-raw is carried even though the
    // scale is unserved.
    const rate = screen.getByTestId('vitals-pill-rate')
    expect(rate).toHaveAttribute('data-raw', '0.02')
    expect(rate.textContent).toMatch(/—/)
  })
})

describe('VitalsStripPill — the countdown advances against the projected clock, and only that (contract §4.2, task 3.4, round-3 MAJOR 1)', () => {
  it('Scenario: The countdown advances between reads — same status object, two worldTime values, data-raw decreases by the elapsed span', () => {
    const s = status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 90_000 })
    const { rerender } = render(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0} />)
    const rawAt0 = Number(screen.getByTestId('vitals-pill-eta').getAttribute('data-raw'))
    expect(rawAt0).toBe(90_000)

    // SAME status object, referentially — no new derivation output.
    rerender(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0 + 30_000} />)
    const rawAt30 = Number(screen.getByTestId('vitals-pill-eta').getAttribute('data-raw'))
    expect(rawAt30).toBe(60_000)
    expect(rawAt0 - rawAt30).toBe(30_000)
  })

  it('never reads status.remainingMs for the countdown — a stale remainingMs frozen at derivation time must not leak through when etaWorldMs disagrees with it', () => {
    // remainingMs is deliberately stale/inconsistent with etaWorldMs here:
    // if the pill read remainingMs at all, this would render the WRONG
    // span for worldTime=T0's honest re-expression of etaWorldMs.
    const s = status({
      activityKind: 'underway',
      activity: 'Under way',
      targetLabel: 'planet body-1',
      etaWorldMs: T0 + 90_000,
      remainingMs: 999_999,
    })
    render(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-pill-eta')).toHaveAttribute('data-raw', '90000')
  })

  it('a served rate is NEVER computed against the projected clock — stationKeepRateTonsPerSecond is unchanged across two different worldTime values', () => {
    const s = status({ activityKind: 'holding', activity: 'On station', stationKeepRateTonsPerSecond: 0.02 })
    const { rerender } = render(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-pill-rate')).toHaveAttribute('data-raw', '0.02')
    rerender(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0 + 500_000} />)
    expect(screen.getByTestId('vitals-pill-rate')).toHaveAttribute('data-raw', '0.02')
  })
})

describe('VitalsStripPill — the property test: a function of the derivation\'s output alone (contract §4.4, round-3 MINOR 4)', () => {
  it('Scenario: The pill is a function of the derivation\'s output alone — two EQUAL, NOT-ABSENT statuses render identical text at the same worldTime, supplied only status/stranded/scale/worldTime, with no Fleet in scope in this file', () => {
    const a = status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 45_000 })
    const b: RosterRowStatus = { ...a }
    // Genuinely two distinct objects (never the SAME reference — that would
    // prove nothing about "equal output", only about React not re-running).
    expect(a).not.toBe(b)

    const first = render(<VitalsStripPill status={a} stranded={true} scale={1} worldTime={T0} />)
    const firstText = first.getByTestId('vitals-state-pill').textContent
    first.unmount()

    const second = render(<VitalsStripPill status={b} stranded={true} scale={1} worldTime={T0} />)
    const secondText = second.getByTestId('vitals-state-pill').textContent

    expect(firstText).toBe(secondText)
  })

  // The property's own vacuity guard (impl contract §4.4's own warning):
  // `null === null` would satisfy "equal output" for two ABSENT pills and
  // prove nothing about the derivation. This asserts the two fixtures above
  // are demonstrably NOT that degenerate case: they render distinguishable
  // text from the null-status render.
  it('SDET-added: the equal-output fixtures above are not vacuously two absent pills — they render text distinct from the null-status render', () => {
    const s = status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 45_000 })
    const nonAbsent = render(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0} />)
    const nonAbsentText = nonAbsent.getByTestId('vitals-state-pill').textContent
    nonAbsent.unmount()

    const absent = render(<VitalsStripPill status={null} stranded={false} scale={1} worldTime={T0} />)
    const absentText = absent.getByTestId('vitals-state-pill').textContent

    expect(nonAbsentText).not.toBe(absentText)
  })
})

describe('VitalsStripPill — a failed refetch retires the pill rather than freezing it (contract §4.3, task 3.4)', () => {
  it('Scenario: A failed refetch retires the pill rather than freezing it — status flips to null, the pill shows the absent form, not the last-served state, and no countdown continues', () => {
    const burning = status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 60_000 })
    const { rerender } = render(<VitalsStripPill status={burning} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/Under way/)

    rerender(<VitalsStripPill status={null} stranded={false} scale={1} worldTime={T0 + 10_000} />)
    expect(screen.getByTestId('vitals-state-pill').textContent).not.toMatch(/Under way/)
    expect(screen.getByTestId('vitals-state-pill').textContent).toMatch(/—/)
    expect(screen.queryByTestId('vitals-pill-eta')).toBeNull()
  })
})

describe('VitalsStripPill — the stranded marker, alongside the pill, never replacing it (contract §4, RULING 13)', () => {
  it('Scenario: A stranded fleet shows the marker alongside its activity pill, in every one of the pill\'s states', () => {
    const states: Array<Partial<RosterRowStatus>> = [
      { activityKind: 'docked', activity: 'Docked', hostLabel: 'Gate Borealis' },
      { activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 1000 },
      { activityKind: 'holding', activity: 'On station', stationKeepRateTonsPerSecond: 0.02 },
      { activityKind: 'mining', activity: 'Mining', etaWorldMs: T0 + 1000 },
      { activityKind: 'drifting', activity: 'Drifting' },
      { activityKind: 'transit', activity: 'In transit', etaWorldMs: T0 + 1000 },
      { activityKind: 'onstation', activity: 'On station' },
    ]
    // The pill renders through the ladder (activityKind), never through the
    // raw `activity` string — `activityKind` can diverge from `activity`
    // (e.g. 'holding' renders "Holding" while its served `activity` is "On
    // station"; see the dedicated ladder test above and RULING 30), and that
    // divergence is the discriminant's entire reason for existing.
    const ladderText: Record<string, string> = {
      docked: 'Docked',
      underway: 'Under way',
      holding: 'Holding',
      mining: 'Mining',
      drifting: 'Drifting',
      transit: 'In transit',
      onstation: 'On station',
    }
    for (const partial of states) {
      const { unmount, getByTestId } = render(
        <VitalsStripPill status={status(partial)} stranded={true} scale={1} worldTime={T0} />,
      )
      expect(getByTestId('vitals-stranded'), `stranded marker missing for ${partial.activityKind}`).toBeInTheDocument()
      // The pill keeps naming the fleet's actual ladder state — stranded is
      // NEVER a mutually-exclusive pill state (RULING 13).
      expect(getByTestId('vitals-state-pill').textContent).toMatch(
        new RegExp(ladderText[partial.activityKind!].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      )
      unmount()
    }
  })

  it('Scenario: a non-stranded fleet renders no stranded marker at all', () => {
    render(<VitalsStripPill status={status()} stranded={false} scale={1} worldTime={T0} />)
    expect(screen.queryByTestId('vitals-stranded')).toBeNull()
  })

  it('stranded=true with a null status still renders the marker (the flag is served independently of the derivation)', () => {
    render(<VitalsStripPill status={null} stranded={true} scale={1} worldTime={T0} />)
    expect(screen.getByTestId('vitals-stranded')).toBeInTheDocument()
  })
})

describe('VitalsStripPill — no second derivation of fleet state exists in this component (contract §4.1)', () => {
  it('SDET-added, static: this test file never imports Fleet, and the pill\'s only additional inputs beyond the derivation output are scale and worldTime — asserted by exhaustively supplying only the four closed props above, never a fifth', () => {
    // This is a structural claim best enforced by the whole-tree guard
    // (lib/format/guards.test.ts) and by TypeScript itself (a `fleet` prop
    // would be a type error against VitalsStripPillProps's closed shape).
    // Runtime companion: the SAME status object drives two renders whose
    // ONLY difference is worldTime, and only the eta figure — never the
    // activity text — differs between them, proving the activity ladder is
    // not re-derived per render.
    const s = status({ activityKind: 'underway', activity: 'Under way', targetLabel: 'planet body-1', etaWorldMs: T0 + 90_000 })
    const { rerender, getByTestId } = render(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0} />)
    const activityBefore = getByTestId('vitals-state-pill').textContent?.replace(/\d.*$/, '')
    rerender(<VitalsStripPill status={s} stranded={false} scale={1} worldTime={T0 + 45_000} />)
    const activityAfter = getByTestId('vitals-state-pill').textContent?.replace(/\d.*$/, '')
    expect(activityAfter).toBe(activityBefore)
  })
})

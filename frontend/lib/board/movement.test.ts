import { describe, expect, it } from 'vitest'
import { arcPath } from '@/lib/polar'
import { schedule } from './board'
import { arrived, burnPos, coastAt, laneFraction, shipPos, stateAt, type Burn, type MovementState } from './movement'
import { orbState } from './orbit'
import { orbitPeriod } from './tuning'

const s = schedule(10)

describe('burnPos', () => {
  const path = arcPath({ ring: 2, slot: 0 }, { ring: 6, slot: 3 }, s)
  const b: Burn = {
    path,
    startTime: 1_000,
    arriveTime: 1_000 + (path.length - 1) * 2_500,
    target: { cell: { ring: 6, slot: 3 } },
  }
  it('clamps to the endpoints outside the window', () => {
    expect(burnPos(b, 0)).toEqual(path[0])
    expect(burnPos(b, b.arriveTime)).toEqual(path[path.length - 1])
  })
  it('indexes by exact integer round-half-up', () => {
    expect(burnPos(b, b.startTime + 2_500)).toEqual(path[1])
    expect(burnPos(b, b.startTime + 1_250)).toEqual(path[1]) // half rounds up
    expect(burnPos(b, b.startTime + 1_249)).toEqual(path[0])
  })
  it('degenerates safely', () => {
    expect(burnPos({ ...b, arriveTime: b.startTime }, 5_000)).toEqual(path[0])
    expect(burnPos({ path: [], startTime: 0, arriveTime: 1, target: {} }, 0)).toEqual({ ring: 0, slot: 0 })
  })
})

describe('coastAt / stateAt', () => {
  const path = arcPath({ ring: 1, slot: 0 }, { ring: 6, slot: 0 }, s)
  const burn: Burn = { path, startTime: 1_000, arriveTime: 13_500, target: { cell: { ring: 6, slot: 0 } } }

  it('coastAt settles a prograde orbit on the cell ring under the orbital law', () => {
    const st = coastAt({ ring: 4, slot: 7 }, 123_456, s)
    expect(st.mode).toBe('coast')
    expect(st.coast!.ring).toBe(4)
    expect(st.coast!.period).toBe(orbitPeriod(4))
    expect(st.coast!.dir).toBe(1)
    const pos = orbState(st.coast!, 123_456, s)
    expect(pos.ring).toBe(4)
  })

  it('an in-progress burn is unchanged', () => {
    const st: MovementState = { mode: 'burn', burn }
    expect(stateAt(st, 7_000, s)).toBe(st)
  })

  it('a due burn folds to the coast anchored at arrival', () => {
    const st: MovementState = { mode: 'burn', burn }
    const folded = stateAt(st, 13_500, s)
    expect(folded.mode).toBe('coast')
    expect(folded.coast!.ring).toBe(6)
    // Anchored at ARRIVAL: a much later read folds to the identical coast.
    expect(stateAt(st, 262_000, s)).toEqual(folded)
  })

  it('a dock-on-arrive burn folds to docked', () => {
    const st: MovementState = {
      mode: 'burn',
      burn: { ...burn, arriveTime: 9_000, target: { featureId: 'feat-9' }, dockOnArrive: 'feat-9' },
    }
    expect(stateAt(st, 20_000, s)).toEqual({ mode: 'docked', docked: { parentId: 'feat-9' } })
  })

  it('a due lane transit does NOT fold — arrival is effectful', () => {
    const st: MovementState = {
      mode: 'laneTransit',
      laneTransit: {
        route: ['sys-0', 'sys-2'],
        legEtas: [5_000, 30_000],
        departTime: 1_000,
        arriveTime: 30_000,
        entryGate: { ring: 13, slot: 0 },
      },
    }
    expect(stateAt(st, 99_999, s)).toBe(st)
  })
})

describe('shipPos', () => {
  const path = arcPath({ ring: 1, slot: 0 }, { ring: 6, slot: 0 }, s)
  const burn: Burn = {
    path,
    startTime: 1_000,
    arriveTime: 1_000 + (path.length - 1) * 2_500,
    target: { cell: { ring: 6, slot: 0 } },
  }

  it('interpolates strictly inside the path mid-burn', () => {
    const mid = burn.startTime + Math.trunc(path.length / 2) * 2_500
    const { cell, ok } = shipPos({ mode: 'burn', burn }, mid, s)
    expect(ok).toBe(true)
    expect(path.slice(1, -1)).toContainEqual(cell)
  })

  it('a settled burn answers as its coast (ok=true, final ring)', () => {
    const { cell, ok } = shipPos({ mode: 'burn', burn }, burn.arriveTime + 50_000, s)
    expect(ok).toBe(true)
    expect(cell.ring).toBe(6)
  })

  it('docked and lane-held fleets have no board cell', () => {
    expect(shipPos({ mode: 'docked', docked: { parentId: 'p' } }, 0, s).ok).toBe(false)
    expect(shipPos({ mode: 'laneHold', laneHold: { from: 'a', to: 'b', fraction: 0.5 } }, 0, s).ok).toBe(false)
  })

  it('a lane transit is on-board only during its board leg', () => {
    const lt: MovementState = {
      mode: 'laneTransit',
      laneTransit: {
        boardLeg: { path, startTime: 0, gateEta: 10_000 },
        route: ['a', 'b'],
        legEtas: [10_000, 50_000],
        departTime: 0,
        arriveTime: 50_000,
        entryGate: { ring: 13, slot: 0 },
      },
    }
    expect(shipPos(lt, 5_000, s).ok).toBe(true)
    expect(shipPos(lt, 10_000, s).ok).toBe(false)
  })
})

describe('arrived / laneFraction', () => {
  it('arrived flips exactly at the completion time', () => {
    const b: MovementState = {
      mode: 'burn',
      burn: { path: [{ ring: 1, slot: 0 }, { ring: 1, slot: 1 }], startTime: 0, arriveTime: 10, target: {} },
    }
    expect(arrived(b, 9)).toBe(false)
    expect(arrived(b, 10)).toBe(true)
    expect(arrived({ mode: 'coast' }, 1e15)).toBe(false)
  })

  it('laneFraction walks the legs piecewise', () => {
    const lt = { route: ['a', 'b', 'c'], legEtas: [10, 20, 40], departTime: 0, arriveTime: 40, entryGate: { ring: 13, slot: 0 } }
    expect(laneFraction(lt, 5)).toEqual({ from: 0, to: 1, frac: 0, ok: true })
    expect(laneFraction(lt, 15)).toEqual({ from: 0, to: 1, frac: 0.5, ok: true })
    expect(laneFraction(lt, 30)).toEqual({ from: 1, to: 2, frac: 0.5, ok: true })
    expect(laneFraction(lt, 99)).toEqual({ from: 1, to: 2, frac: 1, ok: true })
    expect(laneFraction({ ...lt, route: ['a'], legEtas: [1] }, 5).ok).toBe(false)
  })
})

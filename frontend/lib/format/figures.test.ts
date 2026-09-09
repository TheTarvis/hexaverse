import { describe, it, expect } from 'vitest'
import cases from './cases.json'
import {
  ABSENT_FIGURE,
  DUE_FIGURE,
  formatDuration,
  formatInstant,
  formatTons,
  formatRange,
  formatDeltaV,
  formatCredits,
  formatRate,
  instantScaleLabel,
  unitNeedsScale,
  formatByUnit,
  type DurationForm,
  type FigureUnit,
  type RateDenominator,
} from './figures'

// RED-PHASE SUITE — openspec change `add-figure-formatting`, capability
// `figure-formatting`. Written before `figures.ts` exists (contract §7 Phase
// A: 2.1-2.8 (`cases.json`) before 1.1-1.8). This file iterates the fixture
// table row by row — task 2.9 — plus the two module-shape assertions
// (`ABSENT_FIGURE`/`DUE_FIGURE` and the `unitNeedsScale`/`formatByUnit`
// dispatcher, contract §1.3) and R1's type-level "no scale-1 default"
// pin.
//
// TRACEABILITY: every row in cases.json carries a stable `id`; each becomes
// its own `it()`, named with the row's id and cited scenario, so a group is
// never a single pass/fail signal (adversary round 3's concentration-risk
// finding; ~69 module-level scenarios must not share one checkbox).
//
// SENTINEL DECODING: cases.json cannot represent `undefined`/`NaN`/
// `Infinity` natively. `null` decodes to `undefined`; the strings "NaN",
// "Infinity", "-Infinity" decode to those literal values. This is a pure
// data-shape convention with no bearing on the module's own behaviour.

type NumOrSentinel = number | string | null

function num(v: NumOrSentinel): number | undefined {
  if (v === null) return undefined
  if (v === 'NaN') return NaN
  if (v === 'Infinity') return Infinity
  if (v === '-Infinity') return -Infinity
  return v as number
}

interface DurationRow {
  id: string
  scenario: string
  spanMs: NumOrSentinel
  scale: NumOrSentinel
  form: DurationForm
  expected: string
  sdetAdded?: boolean
}
interface InstantRow {
  id: string
  scenario: string
  worldMs: NumOrSentinel
  scale: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface LabelRow {
  id: string
  scenario: string
  scale: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface TonsRow {
  id: string
  scenario: string
  tons: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface RangeRow {
  id: string
  scenario: string
  value: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface DeltaVRow {
  id: string
  scenario: string
  mps: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface CreditsRow {
  id: string
  scenario: string
  credits: NumOrSentinel
  expected: string
  sdetAdded?: boolean
}
interface RateRow {
  id: string
  scenario: string
  rate: NumOrSentinel
  scale: NumOrSentinel
  denominator: RateDenominator
  expected: string
  sdetAdded?: boolean
}

interface CasesShape {
  duration: DurationRow[]
  instant: InstantRow[]
  scaleLabel: LabelRow[]
  tons: TonsRow[]
  range: RangeRow[]
  deltaV: DeltaVRow[]
  credits: CreditsRow[]
  rate: RateRow[]
  absent: {
    duration: DurationRow[]
    instant: InstantRow[]
    tons: TonsRow[]
    range: RangeRow[]
    deltaV: DeltaVRow[]
    credits: CreditsRow[]
    rate: RateRow[]
  }
}

const table = cases as unknown as CasesShape

function label(row: { id: string; scenario: string; sdetAdded?: boolean }): string {
  return `${row.sdetAdded ? 'SDET-added: ' : 'Scenario: '}${row.scenario} [${row.id}]`
}

describe('lib/format/figures — duration (R1-R3)', () => {
  for (const row of table.duration) {
    it(label(row), () => {
      expect(formatDuration(num(row.spanMs), num(row.scale) as number, row.form)).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — duration absent-value rows (R10)', () => {
  for (const row of table.absent.duration) {
    it(label(row), () => {
      expect(formatDuration(num(row.spanMs), num(row.scale) as number, row.form)).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — absolute instant (R4)', () => {
  for (const row of table.instant) {
    it(label(row), () => {
      expect(formatInstant(num(row.worldMs), num(row.scale))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — absolute instant absent-value rows (R10)', () => {
  for (const row of table.absent.instant) {
    it(label(row), () => {
      expect(formatInstant(num(row.worldMs), num(row.scale))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — instantScaleLabel (R4 accessible label)', () => {
  for (const row of table.scaleLabel) {
    it(label(row), () => {
      expect(instantScaleLabel(num(row.scale))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — tonnage (R5)', () => {
  for (const row of table.tons) {
    it(label(row), () => {
      expect(formatTons(num(row.tons))).toBe(row.expected)
    })
  }
  it('SDET-added: the separator before "t" is U+2009, never U+0020', () => {
    const rendered = formatTons(47.2)
    const sepIndex = rendered.indexOf('t') - 1
    expect(rendered.codePointAt(sepIndex)).toBe(0x2009)
  })
})

describe('lib/format/figures — tonnage absent-value rows (R10)', () => {
  for (const row of table.absent.tons) {
    it(label(row), () => {
      expect(formatTons(num(row.tons))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — range/distance (R6)', () => {
  for (const row of table.range) {
    it(label(row), () => {
      expect(formatRange(num(row.value))).toBe(row.expected)
    })
  }
  it('Scenario: No unit is named', () => {
    // Every rung of the ladder: the entire string is a sign, digits,
    // separators, and at most one trailing k/M magnitude suffix — no
    // distance-unit letters (km, mi, AU, ...) anywhere.
    for (const v of [833.25, 13944.775743999995, 1234567, 0]) {
      expect(formatRange(v)).toMatch(/^-?[\d,.]+[kM]?$/)
    }
  })
})

describe('lib/format/figures — range/distance absent-value rows (R10)', () => {
  for (const row of table.absent.range) {
    it(label(row), () => {
      expect(formatRange(num(row.value))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — delta-v (R7)', () => {
  for (const row of table.deltaV) {
    it(label(row), () => {
      expect(formatDeltaV(num(row.mps))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — delta-v absent-value rows (R10)', () => {
  for (const row of table.absent.deltaV) {
    it(label(row), () => {
      expect(formatDeltaV(num(row.mps))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — credits (R8)', () => {
  for (const row of table.credits) {
    it(label(row), () => {
      expect(formatCredits(num(row.credits))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — credits absent-value rows (R10)', () => {
  for (const row of table.absent.credits) {
    it(label(row), () => {
      expect(formatCredits(num(row.credits))).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — rate (R9)', () => {
  for (const row of table.rate) {
    it(label(row), () => {
      expect(formatRate(num(row.rate), num(row.scale) as number, row.denominator)).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — rate absent-value rows (R10)', () => {
  for (const row of table.absent.rate) {
    it(label(row), () => {
      expect(formatRate(num(row.rate), num(row.scale) as number, row.denominator)).toBe(row.expected)
    })
  }
})

describe('lib/format/figures — the absent-form and due-form constants (R10, RULING 21)', () => {
  it('Scenario: the module exports a single em-dash absent form', () => {
    expect(ABSENT_FIGURE).toBe('—')
  })

  it('Scenario: the due form is the literal "now"', () => {
    expect(DUE_FIGURE).toBe('now')
  })

  it('Scenario: Zero is not absent, across every quantity that has a zero figure', () => {
    expect(formatTons(0)).not.toBe(ABSENT_FIGURE)
    expect(formatDeltaV(0)).not.toBe(ABSENT_FIGURE)
    expect(formatRange(0)).not.toBe(ABSENT_FIGURE)
    expect(formatCredits(0)).not.toBe(ABSENT_FIGURE)
    expect(formatRate(0, 1, 'world-ms')).not.toBe(ABSENT_FIGURE)
  })
})

describe('lib/format/figures — unitNeedsScale (RULING 23, contract §1.3)', () => {
  const needsScale: FigureUnit[] = [
    'world-ms-span-in',
    'world-ms-span-left',
    'world-ms-span-ago',
    'world-ms-span-bare',
    'tons-per-world-ms',
    'tons-per-world-s',
  ]
  const noScale: FigureUnit[] = ['world-ms-instant', 'tons', 'range', 'delta-v', 'credits']

  for (const unit of needsScale) {
    it(`Scenario: unitNeedsScale(${unit}) is true`, () => {
      expect(unitNeedsScale(unit)).toBe(true)
    })
  }
  for (const unit of noScale) {
    it(`Scenario: unitNeedsScale(${unit}) is false`, () => {
      expect(unitNeedsScale(unit)).toBe(false)
    })
  }
})

describe('lib/format/figures — formatByUnit is total (contract §1.3)', () => {
  it('Scenario: a scale-needing unit with no served scale renders absent without calling the underlying formatter incorrectly', () => {
    expect(formatByUnit(252000, undefined, 'world-ms-span-in')).toBe(ABSENT_FIGURE)
    expect(formatByUnit(0.001, undefined, 'tons-per-world-ms')).toBe(ABSENT_FIGURE)
  })

  it('Scenario: world-ms-instant needs no scale to render its T+ portion', () => {
    expect(formatByUnit(0, undefined, 'world-ms-instant')).toBe('T+ 0d 00:00 ×—')
  })

  it('Scenario: each duration token dispatches to its own R3 form', () => {
    expect(formatByUnit(252000, 1, 'world-ms-span-in')).toBe('in 4m 12s')
    expect(formatByUnit(160000, 1, 'world-ms-span-left')).toBe('2m 40s left')
    expect(formatByUnit(-12000000, 1, 'world-ms-span-ago')).toBe('3h 20m ago')
    expect(formatByUnit(252000, 1, 'world-ms-span-bare')).toBe('4m 12s')
  })

  it('Scenario: the non-duration, non-rate units dispatch to their own formatter with no scale argument threaded through', () => {
    expect(formatByUnit(47.23519999999999, 1, 'tons')).toBe('47.2 t')
    expect(formatByUnit(833.25, 1, 'range')).toBe('833')
    expect(formatByUnit(268.5, 1, 'delta-v')).toBe('269 m/s')
    expect(formatByUnit(1000, 1, 'credits')).toBe('₡ 1,000')
  })

  it('Scenario: the two rate tokens dispatch with their own denominator', () => {
    expect(formatByUnit(0.001, 1, 'tons-per-world-ms')).toBe('1.0 t/s')
    expect(formatByUnit(0.02, 1, 'tons-per-world-s')).toBe('1.2 t/min')
  })
})

describe('lib/format/figures — R1 type-level: a missing scale does not default to 1', () => {
  it('Scenario: A missing scale does not default to 1 (compiles green only if the omission is a real type error)', () => {
    // @ts-expect-error — formatDuration's scale parameter is required; there
    // is no overload that omits it. If a future edit adds a default this
    // line stops being an error and `tsc --noEmit` (in the per-commit gate)
    // fails the build, which is the whole point of the pin.
    formatDuration(60000, 'bare')
    // @ts-expect-error — formatRate's scale parameter is required too.
    formatRate(0.02, 'world-s')
    expect(true).toBe(true)
  })
})

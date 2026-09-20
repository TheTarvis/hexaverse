// frontend/lib/format/figures.ts
//
// The `figure-formatting` capability's pure presentation module (openspec
// change `add-figure-formatting`). Every exported function here is a pure
// `(value, ...) => string` transform with no ambient state, no locale
// detection, and no import of a wire-rule module (`@/lib/market`,
// `@/lib/space`) — see `guards.test.ts` for the mechanical enforcement of
// that fence.
//
// Basis: `docs/handoffs/add-figure-formatting-impl-contract.md`
// §1-§2 (the exported surface, exact signatures and per-function behaviour)
// and the fixture table `./cases.json` (task 2.1-2.9), which this module is
// pinned against by `figures.test.ts`.

// ---------- types ----------

/** The closed `data-unit` vocabulary. Contract §2 is the normative list. */
export type FigureUnit =
  | 'world-ms-span-in'
  | 'world-ms-span-left'
  | 'world-ms-span-ago'
  | 'world-ms-span-bare'
  | 'world-ms-instant'
  | 'tons'
  | 'range'
  | 'delta-v'
  | 'credits'
  | 'tons-per-world-ms'
  | 'tons-per-world-s'

/** R3's four forms. One-to-one with the four `world-ms-span-*` tokens. */
export type DurationForm = 'in' | 'left' | 'ago' | 'bare'

/** Which world-time denominator a served rate arrived in (RULING 3). */
export type RateDenominator = 'world-ms' | 'world-s'

// ---------- the absent form ----------

/** R10 / RULING 13. U+2014 EM DASH. The only absent form the module emits. */
export const ABSENT_FIGURE = '—'

/** RULING 21. The due form, for the `in` and `left` directions only. */
export const DUE_FIGURE = 'now'

const THIN_SPACE = ' '

// ---------- internal helpers (not exported; part of the purity fence) ----------

function isFiniteNumber(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function isPositiveFiniteScale(scale: number | null | undefined): scale is number {
  return isFiniteNumber(scale) && scale > 0
}

/** Hand-rolled thousands grouping — no locale-detecting number formatting API (R13). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function renderDurationLadder(wallMs: number): string {
  const totalSeconds = wallMs / 1000

  if (totalSeconds < 3600) {
    let minutes = Math.floor(totalSeconds / 60)
    let seconds = Math.round(totalSeconds - minutes * 60)
    if (seconds === 60) {
      minutes += 1
      seconds = 0
    }
    if (minutes === 60) return '1h 0m'
    return `${minutes}m ${seconds}s`
  }

  if (totalSeconds < 86400) {
    let hours = Math.floor(totalSeconds / 3600)
    let minutes = Math.round((totalSeconds - hours * 3600) / 60)
    if (minutes === 60) {
      hours += 1
      minutes = 0
    }
    if (hours === 24) return '1d 0h'
    return `${hours}h ${minutes}m`
  }

  let days = Math.floor(totalSeconds / 86400)
  let hours = Math.round((totalSeconds - days * 86400) / 3600)
  if (hours === 24) {
    days += 1
    hours = 0
  }
  return `${days}d ${hours}h`
}

// ---------- the seven quantity functions ----------

export function formatDuration(
  spanMs: number | null | undefined,
  scale: number,
  form: DurationForm,
): string {
  if (!isFiniteNumber(spanMs)) return ABSENT_FIGURE
  if (!isPositiveFiniteScale(scale)) return ABSENT_FIGURE

  if ((form === 'in' || form === 'left') && spanMs <= 0) return DUE_FIGURE

  let magnitudeMs: number
  if (form === 'ago') {
    magnitudeMs = Math.abs(spanMs)
  } else if (form === 'bare') {
    magnitudeMs = spanMs < 0 ? 0 : spanMs
  } else {
    magnitudeMs = spanMs
  }

  const wallMs = magnitudeMs / scale
  const ladder = renderDurationLadder(wallMs)

  switch (form) {
    case 'in':
      return `in ${ladder}`
    case 'left':
      return `${ladder} left`
    case 'ago':
      return `${ladder} ago`
    case 'bare':
      return ladder
  }
}

function renderScaleNumeral(scale: number): string {
  return String(scale)
}

export function formatInstant(
  worldMs: number | null | undefined,
  scale: number | undefined,
): string {
  if (!isFiniteNumber(worldMs)) return ABSENT_FIGURE

  const totalMinutes = Math.floor(worldMs / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const remainderMinutes = totalMinutes - days * 1440
  const hours = Math.floor(remainderMinutes / 60)
  const minutes = remainderMinutes - hours * 60

  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')

  const suffix = isPositiveFiniteScale(scale) ? `×${renderScaleNumeral(scale)}` : '×—'

  return `T+ ${days}d ${hh}:${mm} ${suffix}`
}

export function formatTons(tons: number | null | undefined): string {
  if (!isFiniteNumber(tons)) return ABSENT_FIGURE

  const rounded1 = Number(tons.toFixed(1))
  if (Math.abs(rounded1) >= 100) {
    return `${Math.round(rounded1)}${THIN_SPACE}t`
  }
  return `${rounded1.toFixed(1)}${THIN_SPACE}t`
}

export function formatRange(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return ABSENT_FIGURE

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const rounded = Number(abs.toPrecision(3))

  let scaled = rounded
  let suffix = ''
  if (rounded >= 1e6) {
    suffix = 'M'
    scaled = rounded / 1e6
  } else if (rounded >= 1e3) {
    suffix = 'k'
    scaled = rounded / 1e3
  }

  let decimals = 2
  if (scaled >= 100) decimals = 0
  else if (scaled >= 10) decimals = 1

  return `${sign}${scaled.toFixed(decimals)}${suffix}`
}

export function formatDeltaV(metresPerSecond: number | null | undefined): string {
  if (!isFiniteNumber(metresPerSecond)) return ABSENT_FIGURE

  const sign = metresPerSecond < 0 ? '-' : ''
  const rounded = Math.round(Math.abs(metresPerSecond))
  const grouped = groupThousands(rounded.toString())
  return `${sign}${grouped} m/s`
}

export function formatCredits(credits: number | null | undefined): string {
  if (!isFiniteNumber(credits)) return ABSENT_FIGURE

  const rounded = Math.round(credits)
  const sign = rounded < 0 ? '-' : ''
  const grouped = groupThousands(Math.abs(rounded).toString())
  return `₡ ${sign}${grouped}`
}

export function formatRate(
  rate: number | null | undefined,
  scale: number,
  denominator: RateDenominator,
): string {
  if (!isFiniteNumber(rate)) return ABSENT_FIGURE
  if (rate < 0) return ABSENT_FIGURE
  if (!isPositiveFiniteScale(scale)) return ABSENT_FIGURE

  const perWallSecond = denominator === 'world-ms' ? rate * 1000 * scale : rate * scale
  const perMinute = perWallSecond * 60
  const perHour = perWallSecond * 3600

  if (perWallSecond >= 1) return `${perWallSecond.toFixed(1)} t/s`
  if (perMinute >= 1) return `${perMinute.toFixed(1)} t/min`

  const hourStr = perHour.toFixed(1)
  if (hourStr === '0.0' && rate > 0) return '<0.1 t/h'
  return `${hourStr} t/h`
}

// ---------- the accessible label R4 mandates ----------

export function instantScaleLabel(scale: number | undefined): string {
  if (isPositiveFiniteScale(scale)) {
    return `The world clock is running at ${renderScaleNumeral(scale)} times real time.`
  }
  return "The world clock's rate has not been served."
}

// ---------- the dispatcher RULING 23 requires ----------

const SCALE_NEEDING_UNITS: ReadonlySet<FigureUnit> = new Set<FigureUnit>([
  'world-ms-span-in',
  'world-ms-span-left',
  'world-ms-span-ago',
  'world-ms-span-bare',
  'tons-per-world-ms',
  'tons-per-world-s',
])

export function unitNeedsScale(unit: FigureUnit): boolean {
  return SCALE_NEEDING_UNITS.has(unit)
}

export function formatByUnit(
  raw: number,
  scale: number | undefined,
  unit: FigureUnit,
): string {
  if (unitNeedsScale(unit) && scale === undefined) return ABSENT_FIGURE

  switch (unit) {
    case 'world-ms-span-in':
      return formatDuration(raw, scale as number, 'in')
    case 'world-ms-span-left':
      return formatDuration(raw, scale as number, 'left')
    case 'world-ms-span-ago':
      return formatDuration(raw, scale as number, 'ago')
    case 'world-ms-span-bare':
      return formatDuration(raw, scale as number, 'bare')
    case 'world-ms-instant':
      return formatInstant(raw, scale)
    case 'tons':
      return formatTons(raw)
    case 'range':
      return formatRange(raw)
    case 'delta-v':
      return formatDeltaV(raw)
    case 'credits':
      return formatCredits(raw)
    case 'tons-per-world-ms':
      return formatRate(raw, scale as number, 'world-ms')
    case 'tons-per-world-s':
      return formatRate(raw, scale as number, 'world-s')
  }
}

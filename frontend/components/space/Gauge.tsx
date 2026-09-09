// Gauge — the shared decorative atom backing the fuel cell's plain fill and
// the hold cell's kind-segmented fill (openspec change `add-vitals-strip`,
// `system-console`, impl contract §5, design.md Decision 1).
//
// DECORATIVE, ON PURPOSE. This element speaks no figure: no `data-raw`, no
// `data-unit`, no `aria-valuenow`/`aria-valuetext`, no percentage text, no
// accessible name, no role — `aria-hidden="true"` on the root. Every number
// a player or a test reads is an adjacent `<Figure>` in the CELL's text,
// never here. Three reasons force this, and any one alone would:
//   1. `FigureUnit` (`lib/format/figures.ts`) is a closed eleven-token union
//      with no ratio/percentage token — a gauge that spoke "47%" would be an
//      unformatted player-facing figure.
//   2. The e2e `digits()` helper throws on a composite `[data-raw]`
//      (`e2e/helpers/space-view.ts:477-497`) — a raw value nested inside a
//      `hold-<kind>`/`hold-capacity` testid breaks the inherited testid
//      contract (impl contract §3.2).
//   3. "Never colour alone" (RULING 20) is satisfied by the adjacent text,
//      which is required to exist anyway.
//
// The one state this element DOES carry is `data-gauge-state` — a plain
// `data-*` token, never `data-raw`, never announced to assistive technology
// — because a 0%-width fill and a "no data" fill are the identical rendered
// pixel state, and round 3 of the adversary caught "differs in a
// DOM-observable attribute" being satisfiable by exactly that forbidden
// implementation.
//
// Both gauges are drawn on ONE tons-to-pixels scale: the served
// `roster.cargoCapacity` (RULING 22). Geometry is inline `style={{ width }}`
// only — never a computed colour class (a per-commit colour-compliance gate
// failure otherwise, contract §11.1).

export type GaugeState = 'no-data' | 'empty' | 'filled'

export interface GaugeSegment {
  kind: string
  tons: number
}

export interface GaugeProps {
  /** roster.cargoCapacity. undefined = roster not served. */
  capacity: number | undefined
  /** undefined = nothing served for this pool. [] = served and empty. */
  segments: GaugeSegment[] | undefined
  'data-testid': string
  className?: string
}

// Zinc-family shades WITH dark variants, picked from `frontend/CLAUDE.md`'s
// palette — `check-color-compliance.py` errors on `dark:bg-zinc-900` and on
// a bare `bg-zinc-100`/`text-zinc-900`/`border-zinc-200` with no dark
// variant on the same line, so every pair below stays on one line.
const SEGMENT_SHADES = [
  'bg-zinc-400 dark:bg-zinc-300',
  'bg-zinc-500 dark:bg-zinc-400',
  'bg-zinc-600 dark:bg-zinc-500',
  'bg-zinc-700 dark:bg-zinc-600',
]

const RAIL_SHADE = 'bg-zinc-300 dark:bg-white/[0.12]'

function hasValidCapacity(capacity: number | undefined): capacity is number {
  return capacity !== undefined && Number.isFinite(capacity) && capacity > 0
}

function gaugeState(
  capacity: number | undefined,
  segments: GaugeSegment[] | undefined,
): GaugeState {
  if (!hasValidCapacity(capacity) || segments === undefined) return 'no-data'
  const total = segments.reduce((sum, segment) => sum + segment.tons, 0)
  return total > 0 ? 'filled' : 'empty'
}

export function Gauge({ capacity, segments, className, ...rest }: GaugeProps) {
  const testId = rest['data-testid']
  const state = gaugeState(capacity, segments)

  let offsetPct = 0

  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      data-gauge-state={state}
      className={`relative overflow-hidden rounded-full ${RAIL_SHADE} ${className ?? ''}`}
    >
      {state === 'filled' &&
        hasValidCapacity(capacity) &&
        segments!.map((segment, index) => {
          const rawPct = (segment.tons / capacity) * 100
          const remainingPct = Math.max(0, 100 - offsetPct)
          const widthPct = Math.max(0, Math.min(rawPct, remainingPct))
          const leftPct = offsetPct
          offsetPct += widthPct
          const shade = SEGMENT_SHADES[index % SEGMENT_SHADES.length]
          return (
            <div
              key={`${segment.kind}-${index}`}
              style={{ width: `${widthPct}%`, left: `${leftPct}%` }}
              className={`absolute inset-y-0 ${shade}`}
            />
          )
        })}
    </div>
  )
}

export default Gauge

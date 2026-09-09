// Barrel for `frontend/lib/format`. `index.*` is exempt from the colocated-
// test coverage validator (`.claude/scripts/check-frontend-tests.sh:43`);
// call sites import from `@/lib/format` per the impl contract §1.

export {
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
} from './figures'

export type { FigureUnit, DurationForm, RateDenominator } from './figures'

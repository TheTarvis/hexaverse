## 1. Shared presentation
- [x] 1.1 Extract HUD root, panel, heading and column components and shared theme.
- [x] 1.2 Migrate both views, roster, market, course/actions and navigation; remove route-specific panel overrides.

## 2. Verification
- [x] 2.1 Run affected regression tests, TypeScript, ESLint and file validators.
- [x] 2.2 Inspect both local views and validate the OpenSpec change.

## Verification evidence
- 48 affected Vitest files passed (875 tests), covering galaxy, solar-system, fleet, market, navigation and HUD components. The 38 affected galaxy/HUD tests and market suite passed after final inset and wrapping adjustments.
- TypeScript, scoped ESLint, edited-file validators and strict OpenSpec validation passed.
- Local browser inspection verified matching computed fleet-panel backgrounds and borders in both views, preserved system console clearance, and 390px document widths without horizontal page overflow. Market controls remained selectable after scrolling the galaxy column.
- No gameplay mutations or new network reads were added. Existing renderer fallback, quote warnings and command ownership tests passed. Formal archive-time Playwright suite was not run.

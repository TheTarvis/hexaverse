## 1. Guide state and evidence
- [x] 1.1 Add tested, validated corporation-scoped advisory persistence and transition logic, including failed reads, wrong fleets, interrupted movement, cancelled mining and reload recovery.
- [x] 1.2 Add an authenticated exact-action read and query key for mining evidence with scoped polling.

## 2. Live command view
- [x] 2.1 Enroll successful wakes, select the starter fleet and apply one-shot camera focus without changing manual recenter or subsequent camera input.
- [x] 2.2 Add recovery transmissions, visible destination selection, dismissal and real burn/mining acceptance integration.
- [x] 2.3 Apply the approved game presentation while preserving roster, console, errors, accessibility and command safety.

- [x] 2.4 Extend the simulated storyboard through ten-tonne mining, return travel, station sale and fuel purchase, with consistent balances and review snapshots.

- [x] 2.5 Extend live recovery guidance through station return, sale and fuel purchase; persist and migrate progress, gate completion on matching receipts, and cover failure/reload cases.

- [x] 2.6 Prototype grouped object search, world selection locator, separate focus and course preview, and off-screen recovery in the storyboard.

- [x] 2.7 Prototype a connected object-details panel with independent chevrons, retained search, focus/course controls and mobile back navigation.

- [x] 2.8 Consolidate storyboard commands on the left, suppress duplicate object cards, and preserve the planet-portrait treatment in the details drawer.

- [x] 2.9 Center live recovery transmissions and simplify the initial wake briefing by temporarily hiding object and command controls.

## 3. Verification
- [x] 3.1 Run targeted and affected regression tests, TypeScript, ESLint and file validators.
- [x] 3.2 Exercise the local live view and record remaining limitations; validate the OpenSpec change.

## Verification evidence
- 48 affected Vitest files passed (880 tests), including the space and fleet suites. After the final mining-success-code correction, the 30 directly affected state/hook/roster tests passed again.
- TypeScript, scoped ESLint, file validators, `git diff --check`, and strict OpenSpec validation passed.
- Local browser exercised a real new wake in `sys_0_-4`: starter fleet selected and camera-focused, disclosed belt selected, server-quoted burn accepted, attachment confirmed, ten-tonne metals extraction accepted and resolved, and both checks confirmed from real data.
- Reload restored progress. Console opening hid the transmission. A 390px viewport had no document horizontal overflow; controls remain in their scroll regions.
- Live checks exposed and repaired the one-tonne sample falling below the server minimum, the roster cache sweep treating a detail object as a list, and mining's explicit `clean` success code.
- Guide history is advisory and browser-local. Existing corporations are not automatically enrolled. The formal archive-time isolated Playwright journey has not been run; these were focused checks against the development stack.

- Extended storyboard: all 5 interaction tests passed; TypeScript, scoped ESLint and per-file validators passed. Desktop and 390px mobile refuelling scenes inspected; mobile document width matched the viewport.

- Live resource-loop extension: 123 distinct affected tests passed across guide state/hook, recovery transmission, fleet actions, system view and wake-up flow. TypeScript, scoped ESLint, file validation and strict OpenSpec validation passed. Live sell/refuel orders were not issued during this extension’s verification.

- Connected details prototype: 9 storyboard tests passed, TypeScript and scoped ESLint passed. Desktop and 390px mobile layouts inspected; mobile replaced the list, restored it on Back, and retained a 390px document width.

- Centered live briefing: 59 targeted tests, TypeScript, scoped ESLint, file validators and strict OpenSpec validation passed. Authenticated browser inspection confirmed the centered wake message, hidden competing controls and restored object index after Begin systems check; no gameplay orders issued.

- Objects discovery follow-up: shortened the target briefing, emphasized the real Objects control with a reduced-motion-safe pulse, and unified both entry points into compact destination guidance without reopening the briefing on index close. Both entry paths are covered by integration tests.

## Station-first opening follow-up
- [x] Provision the station before new fleet seeding and attach the new hull in a free host orbit; preserve existing fleets.
- [x] Introduce Objects, station services and real scanning before the first motor check.
- [x] Persist the exact accepted scan action, require successful completion, refresh destination data, and migrate unstarted legacy guides.
- [x] Update storyboard opening, regression tests, and local spawn/scan verification.

- Verification: affected frontend suites (guide state/hook, transmission, system view, scan control, storyboard and wake flow), TypeScript, scoped ESLint and fleet/corporation Go short suites passed. Strict OpenSpec and file validators passed. Local backend reloaded through GoLand; a fresh isolated emulator corporation spawned attached to feat-station, accepted a body scan with an exact action receipt, and the scan settled done without a reason code. Existing player fleets were not moved. Legacy flight cards remain intentionally hidden.

- [x] Move docked station services into the station's object details; retain one mounted command instance across drawer closure and object selection, with station/market error feedback alongside it.
- Station-details verification: 124 targeted component tests and TypeScript passed, including station-only visibility and quantity preservation across closing/reopening.

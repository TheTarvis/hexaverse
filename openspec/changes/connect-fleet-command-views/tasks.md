## 1. Implementation
- [x] 1.1 Add scoped shared fleet selection with fallback and persistence tests.
- [x] 1.2 Add shared location/transit panel and galaxy vitals, focus and navigation.
- [x] 1.3 Integrate system selection and withhold local controls for remote/transit fleets.
- [x] 1.4 Make galaxy Focus fleet open a close fleet-centered system view; add repeatable local focus and preserve manual camera changes between requests.
- [x] 1.5 Frame fleet focus toward the star and follow the live fleet pivot; preserve orbit/zoom and release on pan or recenter.
- [x] 1.6 Add contextual parked-body follow and smooth pivot transitions, with orbital-envelope framing and scene/loop regression coverage.
- [x] 1.7 Promote the storyboard object index into a shared live component, wire disclosed bodies/gates, focus and plotting, and move system commands left with tutorial discovery.
## 2. Verification
- [x] 2.1 Test navigation, transit, failed reads and existing command regressions; run TypeScript, lint and file validation.
- [x] 2.2 Inspect local cross-view behavior and validate the change.

## Verification evidence
- Ran 52 affected Vitest files (929 cases). The changed transit-command expectation and persistent-selection test isolation were repaired; the final targeted rerun passed all 151 cases in selection, galaxy navigation, burn-preview and stranding suites. Other affected suites passed in the broader run.
- TypeScript, scoped ESLint, per-file validators, strict OpenSpec validation and diff whitespace checks passed.
- Local authenticated galaxy → system → galaxy navigation retained the same fleet id and served vitals. Desktop/mobile layouts inspected.
- A browser check with intercepted fleet responses verified transit route/progress, destination navigation, absent local burn controls during transit and restored controls after a served arrival. It did not issue live travel orders. Its assertions completed; browser teardown initially reported an in-flight intercepted-request disposal error.
- The prior burn-preview expectation of an enabled Burn during transit was intentionally replaced by the approved destination-guidance behavior. The stranding suite now clears sessionStorage between independent scenarios because selection survives unmounts.
- Selection is browser-session scoped; no backend migration. Archive-time isolated Playwright suite has not been run.

- Fleet-follow regression tests cover per-frame motion without React updates, orbit/zoom retention, pan release, focus restoration and star-facing geometry.

- Live object browser: 16 affected files exercised (270 tests before additions); the render-loop screen-motion test was updated to explicitly recenter out of the previously introduced fleet-follow mode, preserving its movement/no-React-render assertions. Final affected reruns passed with additional live selection, failed-interior and external-selection regression tests. TypeScript and scoped ESLint passed. Local authenticated desktop/mobile inspections and selection → focus → course review completed without submitting a burn.

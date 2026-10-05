# `keep-console-tab-content-mounted` — Phase-2 security audit (step 10)

Security reviewer, 2026-10-05. Read-only audit of the build at `41ae157`
against `9648346`. Read: the production diff (`ConsoleDock.tsx`,
`SystemSpaceView.tsx`), the e2e diff, `lib/query-keys.ts`,
`hooks/use-sightings.ts`, `SightingLog.tsx:117`, the two new view-level test
files by grep, the spec-phase report and proposal.md's Impact. No suite was
run, no stack booted, `npm audit` not run (no dependency or lockfile change in
the diff).

**Counts: BLOCKER 0, MAJOR 0, MINOR 0. Verdict: SECURITY-CLEAR.**

## The three spec-phase notes

- **S1 (exact key, retry multiplier): met.** The one settle callback
  (`frontend/components/space/SystemSpaceView.tsx:364-369`) calls
  `refetchGhostFeed()` and then invalidates
  `queryKeys.sightings.pile(null)`, which is `['sightings','pile','all']`
  (`frontend/lib/query-keys.ts:104`). It is the only production reference to
  the sightings keys outside the hook, and `queryKeys.sightings.all` is used
  nowhere. The key is a prefix of no system-filtered entry
  (`['sightings','pile',<systemId>]`), so the ghost feed is refetched once, by
  its own call, not twice. Both settle exits use the callback (`:446`, the
  watcher's `onSettled` at `:869`). Each watcher retry therefore re-reads the
  P loaded pages of the requester's own pile, as noted at spec phase; nothing
  new amplifies it. Tests assert exactly one further unfiltered pile request
  per settle (`SystemSpaceView.console-log-mounted.test.tsx:565`, `:596`).
- **S2 (listener lifetime): met in code; the unmount row is still untested.**
  One effect (`frontend/components/space/ConsoleDock.tsx:99-107`) adds a
  `window` `keydown` listener only when `expanded`, and its cleanup removes
  the same function reference on collapse, on unmount and on any change of
  `handleCollapse`. Guards: `key === 'Escape'`, `!defaultPrevented`,
  `!repeat`. The handler reads no key content and logs, stores and transmits
  nothing; it calls the existing collapse path. No test spies on
  add/remove balance after unmount (the optional row of task 2.4). That stays
  QA's call, as at spec phase, and is not a security finding.
- **S3 (own-ness deny trigger): still not met.** `VitalsStrip*.tsx` is not in
  the diff, the strip is passed the same `acting` (`SystemSpaceView.tsx:1097-1099`),
  and the dock gained no prop, tab or roster-derived surface. The carry to
  link 4 is intact.

## What else the build could have introduced

- **Hiding is not the control, and the hidden content is the own pile only.**
  The latched content is `SightingLog` with the same six props as before
  (`SystemSpaceView.tsx:823-834`); it still reads `useSightings(null)`
  (`SightingLog.tsx:117`), the token-scoped `GET /v1/sightings` with no
  client-supplied corporation. The dock's `hidden` attribute
  (`ConsoleDock.tsx:132`) is presentation. The latch changes when that read
  is issued, not what is read or for whom.
- **No new data surface.** The diff of the two files contains no fetch,
  service call, endpoint, storage, URL, cookie, logging, `NEXT_PUBLIC_*`
  value or `dangerouslySetInnerHTML`. The only network effect is the
  invalidation above.
- **Scope.** Outside `docs/` and `openspec/`, the commit touches the two
  production files, four `SystemSpaceView*.test.tsx` files and four e2e specs,
  all named in proposal.md's Impact. `SightingLog.tsx`, `VitalsStrip*.tsx`,
  `ScanControl.tsx`, `hooks/use-sightings.ts`, `lib/query-client.ts`,
  `package.json`, the lockfile, `backend/`, `claude-agent/` and `infra/` are
  unchanged.
- **e2e edits** are comments plus one Refresh-and-wait precondition
  (`scan-lane-transit-fizzle.spec.ts`); none weakens a deny assertion.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR**

# drift — the open sighting log is not re-read after a sweep settles

Filed 2026-10-04 by the `add-console-dock` orchestrator, from the analyst's code
reading at `d777cfd` (`docs/handoffs/add-console-dock-analysis.md` § 7 D1, lines
509–527 — the evidence of record; not observed on a stack).

**Spec.** `openspec/specs/sighting-log/spec.md`, requirement *The Log Reads on
Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*,
scenario *The log refetches after a sweep settles*.

**Code.** The settle path (`frontend/components/space/SystemSpaceView.tsx`, the
`onSettled={refetchGhostFeed}` wiring) refetches the system-filtered pile
(`queryKeys.sightings.pile(systemId)`); `SightingLog` reads the unfiltered pile
(`pile(null)`), a different cache entry, and nothing invalidates it.

**Why nobody saw it.** The log is normally closed when a sweep settles, and
opening it is a mount, hence a read. `scan-journey` step 5 does exactly that.

**Adjudication.** Code wrong, spec right. Routed first into `add-console-dock`
(`add-console-dock-rulings.md` FULL-AUTO RULING 9), then by RULING 15 into
`keep-console-tab-content-mounted`: that change keeps the log mounted, which
removes the mask. No delta; a view-level test over a real
sightings hook, on both settle exits.

**Status.** OPEN. `add-console-dock` archived at `c0b4aad` WITHOUT fixing it:
RULING 15 moved the fix to link 2b-i-b `keep-console-tab-content-mounted`, and
`add-console-dock` mounts the log only while its tab is shown, so the drift is
exactly as masked as it was before.

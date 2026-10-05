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

**Adjudication.** Code wrong, spec right. Routed into `add-console-dock`
(`add-console-dock-rulings.md` FULL-AUTO RULING 9): that change keeps the log
mounted, which removes the mask. No delta; a view-level test over a real
sightings hook, on both settle exits.

**Status.** OPEN until `add-console-dock` archives.

# Security panel report: `surface-commit-stranding-warning` (spec phase)

*Persisted by the orchestrator, verbatim, from the reviewer's returned text
(2026-10-04); the reviewer is read-only and does not write files.*

**Verdict: SECURITY-CLEAR.** The change has no security surface. No findings at any severity; no controls to add.

## Why there is no surface

The delta adds one frontend-only requirement to `system-space-view`: a static notice derived in render from (a) a boolean on a response the requester already receives and (b) the own-fleets read the view already makes. It adds no endpoint, field, query, read, input, storage or auth path. I checked the four asked vectors against the spec text and the code.

**1. Fog / audience leakage: none.**
- The record can only be written from an accepted burn commit. That route is ownership-gated: `backend/fleet/handler.go:198` answers not-found unless the fleet's corporation equals `common.ActorCorp(c)`. A record therefore only ever exists for a fleet the requester commanded.
- The notice is shown only for the acting fleet, which the view picks from the own-fleets read (`frontend/components/space/SystemSpaceView.tsx:291-297`, `useMyFleets`, the corporation-scoped read). A foreign fleet can never be the acting fleet.
- The spec forbids any other source: "No target comparison, no action identifier and no read beyond the own-fleets read is used."
- What it displays is one bit about the requester's own fleet, which the server already sent to that requester (`handler.go:445-448`, `strandingWarning,omitempty`). Nothing about another corporation is computed, compared or shown.

**2. Rendering of server-supplied text: none.**
- The wire field is a boolean, not a string. The notice copy is a client constant.
- The spec pins this: "carries no raw server text and no figure", with a scenario ("The notice's copy names stations and lane gates and carries no wire text") and a test task (3.14). No XSS or injection path exists.
- The two instants are compared for equality only and never rendered.

**3. Persistence beyond the session: none.**
- The spec states "The record exists only in the open view" and has a reload/remount scenario with test task 3.15.
- Nothing is written to `localStorage`, `sessionStorage`, a URL or a persisted query cache. The only client storage use in the relevant tree is `frontend/hooks/use-auth.ts` (redirect marker, org context), which this change does not touch.

**4. Per-fleet keying across an account or corporation switch in one tab: not exploitable.**
- Sign-out clears the whole query cache (`frontend/hooks/use-auth.ts:130` and `:185`), and `frontend/components/layout-wrapper.tsx:54` pushes to `/login`. I did not trace whether that push always unmounts the view, because the conclusion does not depend on it.
- If a record did survive a switch, it is keyed by a fleet id owned by the previous corporation. The new account's own-fleets read cannot contain that id, so the record can never match an acting fleet and never renders.
- Even in the worst case, the content would be a fixed advisory sentence with no identifier, figure or state from the earlier account.

## Other checklist items (all not applicable)

- **AuthN/AuthZ per requirement:** no data is exposed or mutated beyond the existing, already-gated commit and own-fleets read; `request-authorization` is untouched.
- **Input trust boundaries:** no new external input. A malformed response (missing or non-numeric instants, field absent or false) only affects the requester's own notice; the "absent or false means no notice" case is specified.
- **Sensitive data:** no credentials, tokens or PII stored, logged or transmitted.
- **Abuse / rate limits:** "no effect, timer or clock term is added" and no read is added, so there is no new request volume.
- **Next.js traps:** no server action, route handler, `NEXT_PUBLIC_*` value or cached authenticated response. The page is a client component (`frontend/app/systems/[systemId]/page.tsx`).
- **Design-doc threat statements:** `docs/plans/system-hud/chain.md` (2a-iii row and section) and the rulings index name no threat or compliance constraint, so none was dropped.

## Open panel questions

Q3, Q4, Q5 and Q9 have no security bearing either way. Q3 (whether a failed first read removes the warning) is a question of how long the player sees an advisory about their own fleet, not a disclosure or integrity question. I defer to UX and the architect on all four.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR**

Not opened: the analysis body (§ 1b, § 2) beyond its index, and the live `fleet-roster` and `request-authorization` spec bodies beyond the requirement headings. The change's proposal and the code were sufficient to settle each vector.

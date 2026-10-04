# Security review — `lift-burn-preview-to-view` (chain link 2a-ii)

*Persisted by the orchestrator, verbatim, from the security reviewer's returned
text (2026-10-03); the reviewer is read-only and does not write files.*

**Finding counts: BLOCKER 0, MAJOR 0, MINOR 1, advisories 2. Verdict: SECURITY-CLEAR.**

**Verdict: SECURITY-CLEAR.** No BLOCKER, no MAJOR. One MINOR on spec wording, and two advisories on pre-existing backend behaviour outside this change.

The change adds no endpoint, field, input, persistence or auth path. It moves one hook call from `SpaceCommandPanel` to `SystemSpaceView` and sends strictly fewer requests than today. This review read the spec, design, tasks and current code; nothing was run.

## The three questions asked

**1. Can the lifted quote expose a fleet the requester does not own, or bleed across an acting-fleet switch? No.**

- **Server gate:** `backend/fleet/handler.go:252` — `OrderPreview` calls `h.commandedFleetId(c)` before binding the body. The ownership check runs ahead of the settlement seam (comment block at `handler.go:157-166`), so a foreign or corpless requester gets a 404 with no solve and no write. The lift does not touch this.
- **Acting fleet source:** `SystemSpaceView.tsx:246` reads `useMyFleets()` and `:295` derives `acting` from it. No sighting or interior entity can become the `fleetId` the hook is called with.
- **Fleet switch:** `frontend/hooks/use-burn-preview.ts` keys the query on `(fleetId, selectionKey)` with `gcTime: 0` and no placeholder data. A switch yields `preview = null` until the new fleet's own solve returns.
- **No copied state:** design Decision 2 forbids copying the quote into component state, which is the only way the lift could have introduced a stale cross-fleet copy.
- **Commit-clear state:** the `(acting fleet, selection)` pair names own data only, and the scenario "Switching the acting fleet ends the post-commit clear" pins that fleet A's suppression does not leak onto fleet B.
- **Panel commit record:** the click-time record can outlive a switch, but both fleets are the requester's own, so there is no audience issue.

**2. Is client-side suppression being treated as an enforcement control? Not by the design, but the carried spec text overstates the server — see MINOR 1.**

All three preconditions are request-economy and presentation rules. None is described as authorization, and design Decision 4 says the docked guard is "a precondition on the preview request only".

**3. Does request rate against the preview endpoint get worse? No, it improves.**

- The hook, the single `PREVIEW_REFRESH_MS = 10_000` (`frontend/lib/realtime.ts:36`) and `refetchInterval` are unchanged.
- Three states that poll today stop polling: running mine, docked at target, post-commit.
- The static guard (task 1.1, Decision 6) stops a second call site from doubling the rate when link 2a-iii adds the strip consumer.
- The client cadence is not the server's protection, and the design does not claim it is. `backend/middlewares/rate_limiter.go` and `corp_write_quota.go` exist independently.

## Findings

### MINOR 1 — carried text asserts a server refusal that does not exist for the running-mine case

`specs/system-space-view/spec.md:25-28`:

> "A preview SHALL NOT be requested while the acting fleet's movement channel is claimed by a running mine, or while it is in lane transit, since a commit would be refused in both cases."

design.md's table row for `fleet-movement` repeats it: "the client now avoids a request the server refuses (mine, zero-length)".

For the mine case this is false. `docs/handoffs/defect-burn-cancels-running-mine.md` records, measured, that `OrderTo`'s re-task branch (`backend/fleet/service.go:629-637`) accepts a burn commit against a mine-held channel with HTTP 200 and cancels the mine.

The actor here is only the fleet's owner acting on their own fleet, and the proposal already scopes that defect out, so nothing is exploitable. The reason to fix it is that this change makes the client suppression true and test-proven. A later reader will then take "a commit would be refused" as a server guarantee and build on it. The owner can still destroy their own running mine with a direct `POST /v1/fleets/:id/orders`, or through the claude-agent's token passthrough.

The sentence is carried live text inside a MODIFIED block. The smallest fix keeps every scenario heading verbatim and changes only the rationale clause. Paste-ready replacement for the last sentence of paragraph 2:

```
A preview SHALL NOT be
requested while the acting fleet's movement channel is claimed by a running
mine, or while it is in lane transit: the view offers no burn commit in
either state. This is a client request-suppression rule only; it is not, and
SHALL NOT be relied on as, the server's enforcement of either state (see
`defect-burn-cancels-running-mine.md` — the server's handling of a burn
ordered over a running mine is owned by `fleet-movement`, not by this view).
```

If the spec writer prefers to leave carried text byte-identical, the alternative is one line in design.md's table row for *Burn Order Preview Solves Without Committing*: replace "the client now avoids a request the server refuses (mine, zero-length)" with "the client now avoids a request it should not send; the server today accepts a burn over a running mine (open defect) and 500s a zero-length solve (open defect) — neither is a server-side refusal this change may rely on".

## Advisories (pre-existing, backend, not findings against this change)

- **A. Zero-length solve returns 500, not 4xx.** `space.ErrArcTooShort` (`backend/space/burn.go:174`) has no mapping in the fleet handler. This change removes the UI's trigger for it but not the server behaviour. Any owner can still produce 500s on demand by previewing their fleet's own host, and design Open Question 2 leaves the Burn control enabled when docked at target, so a click there commits the same degenerate order. That means error-budget and alert noise from a client-controllable input. Whoever picks it up should map it to a 4xx with a named reason on both `orders` and `orders/preview`. If Open Question 2 is ruled "stay enabled", this is worth a `fleet-movement` delta scenario:

  ```
  #### Scenario: A burn to the fleet's own host is rejected as a client error
  - **WHEN** an owner commits or previews a burn whose target is the body the fleet is attached to
  - **THEN** the request fails with a 4xx carrying a named reason, no action is created, and no 5xx is logged
  ```

- **B. Post-commit second Burn is uncapped** (design Risks; Open Question 4). After the commit-clear there is no current quote, so a second Burn on the same selection goes out without the quote-lock cap. It is self-inflicted on an own fleet and the server still checks affordability, so this is a UX and economy question, not a security one. Noted so the UX reviewer does not assume security cleared the cap's absence as intended.

## Checked and found clean

- No secret, token or `NEXT_PUBLIC_*` in scope.
- No free-text input.
- No new cached authenticated response: `gcTime: 0` is unchanged.
- No server action.
- No dependency change.

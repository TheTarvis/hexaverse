# `fix-world-time-render-loop` — security implementation audit

`openspec-security`, Phase 2, 2026-09-19, against implementation commit `3dc56da`.
Persisted verbatim by the orchestrator (the reviewer is read-only).

**Verdict: SECURITY-CLEAR.** No findings at any severity. That matches the Phase-1 finding in `fix-world-time-render-loop-panel-security.md`.

## What was checked

1. **Fleet-list service change: no new exposure.**
   - `frontend/lib/services/fleet-service.ts`: `listMine()` now returns the whole `{fleets, worldTime, scale}` envelope instead of just `fleets`. It is the same `GET /v1/fleets?mine=true` request with the same auth through `apiClient` and no new parameters.
   - `worldTime` and `scale` are the server's simulation clock values. The server already sends them on every fleet read, and they were already in the DOM as `data-scale` / `data-world-time` (`SystemSpaceView.tsx:745-746`). Nothing about any other corp crosses into the client.
   - `frontend/hooks/use-fleets.ts`: `useMyFleets` changes what it stores under `queryKeys.fleets.mine()` from `Fleet[]` to `FleetList`. The only reader of that key is this hook. `use-market.ts:120` and `use-fleets.ts:44,152` only invalidate it. `data` keeps the `Fleet[]` shape callers expect.

2. **Fog / audience contract: unchanged on the client.**
   - `space-transform-loop.ts:179` calls `buildSceneModel({...source.inputsRef.current, worldTimeMs: source.clock.now()})`. The inputs are the same server-filtered ones as before. Only the call site moved, from a React render to the loop.
   - No client-side visibility decision was added or moved.
   - Foreign sightings and contacts still draw at their stored position with no velocity extrapolation. `worldTimeMs` still only drives bodies' orbits and the corp's own fleets' burn/drift solves.

3. **Imperative style write: safe.**
   - The only sinks are `el.style.transform = hitTargetTransform(...)` at `space-transform-loop.ts:160` and the per-element write that sets the same value.
   - `hitTargetTransform` (`space-projection.ts:70-78`) builds `translate3d(${x}px, ${y}px, 0px) translate(-50%, -50%)` only from `x` and `y` after an `onScreen && Number.isFinite(x) && Number.isFinite(y)` guard. Otherwise it uses the `OFFSCREEN_PX` constant. Those numbers come from projection math over server-supplied numbers, with no strings. No user-controlled text reaches a style, HTML or attribute sink.
   - The diff adds no `innerHTML` or `dangerouslySetInnerHTML`.

4. **DOM data stamps: none new.** The diff adds no `data-*` attributes. The existing ones only show values the client already holds from server-filtered reads.

5. **Listener and timer leaks: none.**
   - The animation-frame loop is cancelled in `stop()` (`space-transform-loop.ts:204-206`), which the mount effect's cleanup calls (`:244-247`).
   - The `SpaceWorld.tsx` draw loop is cancelled at `:672`.
   - The coarse tick's `setInterval` and the `visibilitychange` listener are both removed in cleanup (`lib/client-clock/index.ts`).
   - The `matchMedia` change listener in `hooks/use-reduced-motion.ts` is removed in its cleanup.
   - Nothing is driven by input from other players.

6. **Secrets / dependencies.** No tokens, `NEXT_PUBLIC_*` values or new dependencies. No new endpoints, server actions, persistence or free-text inputs.

**Not a finding (carried from Phase 1):** a player who fakes their local clock can draw orbits at future positions. This already existed before this change and confers no authority, because the Go server alone decides positions and computes every commit's ETA. `anchor()` now rejects non-finite values, which is slightly stricter.

BLOCKER: none · MAJOR: none · MINOR: none.

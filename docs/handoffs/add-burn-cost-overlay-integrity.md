# add-burn-cost-overlay — suite-integrity check

SDET, post-development, 2026-10-04. Tree `a965554` plus the working-tree changes. Tier 1 only; no stack, emulator or Playwright.

**Verdict: CLEAN.** No blocker.

## 1. Manifest verify (verbatim)

```
add-burn-cost-overlay: all 4 test file(s) unchanged since handoff
```

## 2. Tier 1 runs, tsc, lint, forbidden constructs

- Four files (`Gauge`, `VitalsStrip`, `SystemSpaceView.burn-preview`, `SystemSpaceView.stranding-notice`, all `.test.tsx`): **4 files passed, 196 / 196 tests passed** (49 new plus 147 pre-existing, matching the red table).
- Full frontend unit suite (`npx vitest run`): **128 files passed, 1892 / 1892 tests passed**.
- `npx tsc --noEmit`: exit 0.
- `npm run lint` (eslint plus tsc-check): exit 0, 0 errors, 1 warning. The warning is the pre-existing `rejectPreview` unused-var in the stranding file (line 398), already recorded in the red handoff.
- Grep of the four files for `.skip`, `.only`, `.todo`, `@ts-expect-error`, `xit(`, `xdescribe`, `fit(`, `fdescribe`: no matches. The manifest confirms the bytes are unchanged, so no assertion was weakened.

## 3. Staged-red confirmation (scratch worktree, removed afterwards)

Scratch worktree at HEAD with the developer's three production files and the four test files copied in. The one wiring hunk (`{...(currentQuote ? { burnCost ... } : {})}`) was removed from `SystemSpaceView.tsx`. Gauge and VitalsStrip were left implemented.

Result: **21 failed, 175 passed (196)**.
- `Gauge.test.tsx` and `VitalsStrip.test.tsx` (sections 1 and 2): all green.
- `SystemSpaceView.burn-preview.test.tsx` (section 3): 14 of 14 new tests red (3.1-3.3: 4, 3.4: 1, 3.5: 1, 3.6-3.7: 4, 3.8-3.10: 4).
- `SystemSpaceView.stranding-notice.test.tsx` (section 4): 7 of 7 new tests red.

This matches the contract's staged-red expectation. With the hunk restored, all 196 pass (section 2 above).

## 4. Diff review against the Impact fence (§8)

`git diff --stat`: eight files. The four test files (additions only), `tasks.md`, and three production files: `Gauge.tsx` (42 lines changed), `VitalsStrip.tsx` (18 lines changed), `SystemSpaceView.tsx` (+3). No other production, hook, type, backend, fixture or e2e file is changed. `git status --short` lists exactly these eight.

- **Hunk placement.** `git diff -U0` on `SystemSpaceView.tsx` gives one hunk, `@@ -1081,0 +1082,3 @@`, inside the `<VitalsStrip>` mount after `serverWorldTime`. It names `currentQuote` only.
- **Timer regions.** Nothing between lines 130 and 620 is touched, so `:188-194` (scan-sweep `wallMsUntil(...) + ETA_CUSHION_MS`) and `:589-593` (arrival refetch) are byte-identical. Line 793 (`currentQuote` definition) is also unedited.
- **No affordability or shortfall arithmetic on the client.** The only arithmetic is `costPct = min(cost.tons / capacity * 100, 100)` (geometry). `affordable` is copied from the served flag into `costState`. No fuel-versus-cost comparison exists in the diff.
- **No `undefined` passed as a prop.** Both new props (`burnCost`, `cost`) go through a conditional spread, so they are omitted rather than `undefined`. The only added `undefined` tokens are the `cost !== undefined` guard and the attribute value `costState` (an absent data attribute), neither a prop pass.
- **No new hooks.** Added lines contain no `useState`, `useEffect`, `useRef`, `useMemo` or `useCallback`, and no `isFetching` or `burnPreview` reference.
- **Static class strings** match §2.4 character for character: band affordable `absolute inset-y-0.5 bg-zinc-600 dark:bg-zinc-500`; band unaffordable `absolute inset-y-0.5 bg-amber-800 dark:bg-amber-600`; mark `absolute inset-y-0 w-1 border border-zinc-900 bg-amber-500 dark:border-zinc-950 dark:bg-amber-400`. Each is a whole literal constant selected by key. Inline styles are exactly `{left:'0%', width}` and `{left, transform: translateX(-pct%)}`. Marker attributes are written as `=""`. The header comment was updated.

Review-held wrong builds from the red coverage list, each checked in the diff:
- Second identical currency derivation at the mount: absent. The mount reuses `currentQuote`; the only `burnPreview.preview` uses are the existing line 793 and the existing `preview={...}` prop at 958 (not in the diff).
- Explicit `burnCost={undefined}` or `cost={undefined}`: absent (conditional spread in both layers).
- State copy / one-render lag: absent. No state or ref is added; values are derived in render.
- Mark DOM order: the band JSX is written before the mark, so the order is fill segments, band, mark, as §2.3 requires.
- Mark containment as rendered pixels, rounded-cap clipping: not checkable in jsdom, deferred to the journey and review. The classes and `translateX(-pct%)` pull-back are as the contract gives them.
- Canvas-unavailable overlay (RULING 17): no code path was added for it.

## 5. Mutation re-runs against the real implementation (scratch copy)

| Mutation | Result |
| --- | --- |
| Wiring reads `burnPreview.preview` (raw) instead of `currentQuote` | KILLED: 1 failure, burn-preview 3.4 (the refresh walk) |
| Gauge decides `affordable` from geometry (`cost.tons <= fuel`) | KILLED: 18 failures across all four files, including both VitalsStrip 2.1 arms and 3.4, 3.5, 4.5 |
| Mark without the `translateX` pull-back | KILLED: 3 failures, VitalsStrip task 2.2 (mark position, the c arms) |

All three killing rows still kill. The scratch worktree was removed (`git worktree list` shows only the main checkout). A stale untracked directory `scratchpad/wt` from an earlier session pre-existed; I did not touch it.

## 6. tasks.md

`grep -c '^- \[x\]'` = **30**; `grep -c '^- \[ \]'` = **9**. Unchecked: **6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9**, all section 6 gate tasks, as expected.

## Post-handoff test changes by SDET

None. No production defects found.

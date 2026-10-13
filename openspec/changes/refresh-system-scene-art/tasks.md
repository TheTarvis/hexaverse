## 1. Acceptance Baseline

- [ ] 1.1 Record controlled before captures of the live system and a deterministic representative renderer fixture with warm/cool stars, gas giant and rocky body; preserve viewport, camera and scene time for comparison.
- [x] 1.2 Write meaningful red coverage for type routing and changes, deterministic surfaces, decoration excluded from picking, resource release and existing interaction/recovery regressions; map every scenario to automated or visual evidence and record the red manifest.

## 2. Scene Presentation

- [x] 2.1 Implement stellar emission with continuous soft falloff and warm/cool spectral distinction; verify camera-relative glow and unchanged pick targets.
- [x] 2.2 Implement deterministic gas bands, rocky surface variation and decorative rim; preserve ice/moon/unknown fallback and served membership, and update cached visuals on classification changes.
- [x] 2.3 Implement the blue-black backdrop and bounded cyan hex reference plane with distance/angle fading; preserve foreground visibility and continuous-space picking.
- [x] 2.4 Integrate art into the real published scene without camera/HUD changes; release newly owned resources on replacement, mark removal, system switch and unmount, and preserve renderer recovery.

## 3. Verification

- [ ] 3.1 Compare controlled before/after captures on the representative fixture and live system, including camera bounds and selected/acting reticles; record visible acceptance, observed draw/resource/frame behavior and any unproven claims. Confirm no live data was rewritten to insert showcase bodies.
- [x] 3.2 Verify red-suite integrity and run the per-commit tiers 0/1 gate from `docs/testing-tiers.md`; report unrelated working-tree failures separately.
- [ ] 3.3 After all implementation tasks are checked, write one player journey and run tier 4 then tier 3 once each with the tree locked, at archive time only, following `docs/testing-tiers.md`.
- [x] 3.4 Write `docs/handoffs/refresh-system-scene-art-journey.md` with acceptance evidence and suite budget line; run strict OpenSpec validation and reconciliation before archive.

## Evidence and remaining archive work

Implementation is complete and visually accepted. Exact frozen-renderer before/after captures are in `docs/handoffs/refresh-system-scene-art-evidence/`; the live system was inspected at default/close/far views without changing world data. Tasks 1.1 and 3.1 remain partially complete because the supplied historical live screenshot cannot reproduce identical scene time and camera state; the representative comparison is controlled. Thirty renderer tests, TypeScript, lint, and tier 0 pass. Tier 1 has two unrelated pre-existing format-guard failures in dirty HUD/storyboard files. Archive is withheld until those gates and remaining archive checks are resolved. See the QA and integrity handoffs for exact evidence.

The targeted tier-4 player journey passed on its first run (2/2 including authentication, 26.4 seconds). Task 3.3 remains partially complete: tier 3 was not run because archive is withheld. Final strict OpenSpec validation and reconciliation pass. No commit, archive, or deployment was performed.

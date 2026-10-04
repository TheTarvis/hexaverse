# Defect — a point-target burn serves `Target.BodyId: ""`, where the client expects `null`

**Status:** found by code reading 2026-10-04 (`clear-burn-preview-on-commit-analysis.md`
§ 6, finding 2); **not verified on a running stack**. Pre-existing; not fixed
in the system-HUD chain (`surface-commit-stranding-warning-rulings.md` RULING 4).

## Evidence

`space.Target.BodyId` is a plain untagged `string` (`backend/space/burn.go:14-17`),
so a point target serialises as `""`. `frontend/lib/types/fleet.ts:35-38` types
it `string | null`, and `frontend/components/fleet/roster-status.ts:154` tests
`target.BodyId == null`, so a real point burn would take the body branch and
resolve an empty id for the strip pill's target label. The fixture at
`roster-status.test.ts:268` uses `null`.

## Whose call

Travis's — client tolerance (`!target.BodyId`) or a served `omitempty`. A trap
for any later link that compares burn targets on the client.

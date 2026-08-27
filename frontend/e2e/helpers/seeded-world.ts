import fs from 'node:fs'
import path from 'node:path'

/**
 * Ids of systems the local/e2e world is guaranteed to have materialized.
 *
 * Since the endless-galaxy change there is no `sys-0`: a system's id IS its
 * field coordinate (`sys_<cx>_<cy>`), and which coordinates exist depends on the
 * seed. What IS stable is that the dev seed (`galaxy.SeedDevGalaxy`) and the
 * frozen logged-out asset are generated from the SAME seed and params
 * (`StartAreaSeed` / `StartAreaParams`), so every system in the committed
 * `public/galaxy/start-area.json` is materialized in the live dev world too.
 *
 * That makes the asset the right source for "name me a system that exists",
 * and it keeps working when the seed is retuned — regenerate the asset with
 * `go run ./cmd/seed start-area` and these ids follow.
 */
interface StartAreaAsset {
  systems: { id: string }[]
  lanes: { id: string; aId: string; bId: string }[]
}

let cached: StartAreaAsset | null = null

function asset(): StartAreaAsset {
  if (cached) return cached
  const file = path.join(process.cwd(), 'public', 'galaxy', 'start-area.json')
  cached = JSON.parse(fs.readFileSync(file, 'utf8')) as StartAreaAsset
  return cached
}

/** Every seeded system id, in the asset's stable (id-sorted) order. */
export function seededSystemIds(): string[] {
  return asset().systems.map((s) => s.id)
}

/** The nth seeded system id — stable across runs for a given seed. */
export function seededSystemId(index = 0): string {
  const ids = seededSystemIds()
  if (ids.length === 0) {
    throw new Error('start-area.json holds no systems — regenerate it with `go run ./cmd/seed start-area`')
  }
  return ids[index % ids.length]
}

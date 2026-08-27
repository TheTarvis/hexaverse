import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { ensureEmulatorUser, emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * The endless frontier (openspec: add-endless-galaxy).
 *
 * This spec is the inversion of the old `spawn-exhaustion.spec.ts`, which
 * reproduced the 2026-08-12 bug: the galaxy was a finite ~28-system disc, each
 * wake claimed a home, and after a couple dozen wakes `POST /v1/corporations`
 * 503'd forever — no new account could ever join that world.
 *
 * The galaxy is now a deterministic infinite field, persisted as the subset
 * players have caused to be observed. Spawn site selection WALKS outward over
 * the lane graph, materializing each visited system's lane horizon before
 * expanding past it, so the world grows ahead of the search. Exhaustion is no
 * longer a reachable state, and the pin is the opposite of what it was:
 *
 *   N consecutive fresh wakes ALL succeed, and the world visibly grows.
 *
 * The old ORDERING CONSTRAINT is gone with the bug: this spec no longer
 * permanently exhausts the run's shared world, so it does not have to run last.
 *
 * Local-only: it drives the auth emulator and reads the seeded dev world.
 */
const cfg = resolveE2EConfig()

// Fresh accounts throughout — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

// More wakes than the seeded start area holds systems. Under the old finite
// galaxy this count alone guaranteed a 503.
const WAKES = 30

test.describe('the endless frontier', () => {
  test('consecutive fresh wakes all succeed and the world grows to make room', async ({
    request,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator and the seeded dev world (local only)')
    test.setTimeout(300_000)

    const password = 'e2ePassword123!'
    const run = Date.now()

    const wakeToken = async (i: number) => {
      const email = `e2e+frontier-${run}-${i}@hexaverse.test`
      await ensureEmulatorUser(cfg.emulator!, email, password)
      const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
      // Provision the internal account (firebase-uid → x-uid mapping) the way
      // the app does on signup — without it the wake 403s (no actor).
      const acct = await request.post(`${cfg.apiURL}/v1/accounts`, {
        headers: { Authorization: `Bearer ${idToken}` },
        data: {},
      })
      expect(acct.ok(), `account provisioning ${i} failed with ${acct.status()}`).toBeTruthy()
      return idToken
    }

    const systemCount = async (idToken: string) => {
      const res = await request.get(`${cfg.apiURL}/v1/galaxy`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      expect(res.ok(), `galaxy read failed with ${res.status()}`).toBeTruthy()
      const body = await res.json()
      return (body.systems as unknown[]).length
    }

    const firstToken = await wakeToken(0)
    const before = await systemCount(firstToken)
    expect(before, 'the seeded world must hold some systems to start from').toBeGreaterThan(0)

    const homes = new Set<string>()
    let lastToken = firstToken
    for (let i = 0; i < WAKES; i++) {
      const idToken = i === 0 ? firstToken : await wakeToken(i)
      lastToken = idToken
      const res = await request.post(`${cfg.apiURL}/v1/corporations`, {
        headers: { Authorization: `Bearer ${idToken}` },
        data: { name: `Frontier ${i}` },
      })
      expect(
        res.ok(),
        `wake ${i} failed with ${res.status()} after ${i} successful wakes — ` +
          `site selection must never exhaust: it materializes outward until it finds a home`,
      ).toBeTruthy()

      const body = await res.json()
      const home = body.homeSystem?.id as string
      expect(home, `wake ${i} returned no home system`).toBeTruthy()
      expect(homes.has(home), `wake ${i} reused home ${home} — reservations must prevent that`).toBe(
        false,
      )
      homes.add(home)
    }

    // The world outran its population: the materialized set is strictly larger
    // than what was seeded, because the walk grew it.
    const after = await systemCount(lastToken)
    expect(
      after,
      `the materialized world did not grow across ${WAKES} wakes (${before} → ${after}) — ` +
        `the walk cannot have been materializing outward`,
    ).toBeGreaterThan(before)
  })
})

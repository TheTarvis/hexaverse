/**
 * Environment resolution for the Playwright E2E suite.
 *
 * One config, three targets, selected by `E2E_ENV`:
 *   - local (default): the ISOLATED test stack on the firebase.test.json emulators
 *     (auth 10109 / firestore 9100), NOT your dev stack. Auth is seeded via the
 *     emulator REST API (no real credentials). Playwright boots its own frontend
 *     (:3110) and globalSetup boots the ENV=test backend (:9012). Prerequisite:
 *     the test emulators must be running (`npm run e2e` auto-starts a throwaway
 *     set via scripts/dev/with-test-emulators.sh). To instead attach to an
 *     already-running stack, set E2E_REUSE_SERVER=1 and point
 *     E2E_BASE_URL/E2E_API_URL at it.
 *   - dev / prod: the deployed environments. No emulator — real Firebase Auth with a
 *     dedicated test account whose credentials come from env/CI secrets.
 *
 * Every value has an env override so the same config serves CI and local debugging.
 */

export type E2EEnv = 'local' | 'dev' | 'prod'

export interface EmulatorConfig {
  host: string
  authPort: string
  firestorePort: string
  projectId: string
  apiKey: string
}

export interface E2EConfig {
  env: E2EEnv
  /** Frontend origin Playwright drives. */
  baseURL: string
  /** Backend API origin used for data seeding/cleanup. */
  apiURL: string
  /** Dedicated test account. On `local` it is created in the auth emulator. */
  user: { email: string; password: string }
  /** Present only when auth is seeded via the emulator (local). dev/prod use real auth. */
  emulator?: EmulatorConfig
  /** Attach to an already-running server instead of booting one. */
  reuseServer: boolean
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === '1' || value.toLowerCase() === 'true'
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `[e2e] ${name} is required for E2E_ENV=${process.env.E2E_ENV}. ` +
        `Set it via env/CI secret.`,
    )
  }
  return value
}

export function resolveE2EConfig(): E2EConfig {
  const env = (process.env.E2E_ENV ?? 'local') as E2EEnv

  if (env === 'local') {
    return {
      env,
      // Defaults target the ISOLATED test stack, not your dev stack, so a suite
      // run never writes to the Firestore/Auth your `make run` + `npm run dev`
      // use. The pieces:
      //   - frontend on :3110 (Playwright boots its own — reuseServer=false — so
      //     it doesn't grab your dev server on :3010).
      //   - backend on :9012 (the ENV=test binary; globalSetup builds+runs it,
      //     rate limiting disabled). Not your dev :9010, and not :9011 — that
      //     port is reserved for the backend Go integration suite, so both can
      //     run side by side.
      //   - firebase.test.json emulators (auth 10109 / firestore 9100), project
      //     hexaverse-emulator. This MUST match the emulator's `--project`
      //     flag: the auth emulator mints every token with aud=<that project> (a
      //     fake API key can't select another), so a backend on a different
      //     project id would reject the browser's tokens. So we don't isolate by
      //     project; instead globalSetup WIPES this project's Firestore+Auth each
      //     run to keep the long-lived local emulator from accumulating data (see
      //     e2e/setup/backend-stack.ts). CI uses a throwaway emulator.
      // Any of these is env-overridable for one-off targeting.
      baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3110',
      apiURL: process.env.E2E_API_URL ?? 'http://localhost:9012',
      user: {
        email: process.env.E2E_USER_EMAIL ?? 'e2e@hexaverse.test',
        password: process.env.E2E_USER_PASSWORD ?? 'e2ePassword123!',
      },
      emulator: {
        host: process.env.E2E_EMULATOR_HOST ?? '127.0.0.1',
        authPort: process.env.E2E_AUTH_EMULATOR_PORT ?? '10109',
        firestorePort: process.env.E2E_FIRESTORE_EMULATOR_PORT ?? '9100',
        projectId: process.env.E2E_PROJECT_ID ?? 'hexaverse-emulator',
        apiKey: process.env.E2E_API_KEY ?? 'demo-api-key',
      },
      reuseServer: bool(process.env.E2E_REUSE_SERVER, false),
    }
  }

  // dev / prod: deployed targets, real auth, no emulator.
  return {
    env,
    baseURL: required('E2E_BASE_URL'),
    apiURL: required('E2E_API_URL'),
    user: { email: required('E2E_USER_EMAIL'), password: required('E2E_USER_PASSWORD') },
    reuseServer: true,
  }
}

/**
 * Vercel Deployment Protection bypass, applied as a *query string* rather than a
 * global request header. `x-vercel-protection-bypass=<secret>` clears the SSO wall
 * and `x-vercel-set-bypass-cookie=true` makes Vercel set a first-party bypass
 * cookie, so only this one navigation needs the params — every later request rides
 * the (origin-scoped) cookie. Doing this as a header instead poisons cross-origin
 * calls: Firebase's POST to identitytoolkit.googleapis.com would carry the custom
 * header, trip a CORS preflight Google rejects, and fail login with
 * auth/network-request-failed. Empty locally (emulator stack isn't gated).
 *
 * Returns a query string ready to append to a path, e.g. `/login${vercelBypassQuery()}`.
 */
export function vercelBypassQuery(): string {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!secret) return ''
  const params = new URLSearchParams({
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  })
  return `?${params.toString()}`
}

export const STORAGE_STATE = 'playwright/.auth/user.json'

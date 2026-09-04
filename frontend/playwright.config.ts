import { defineConfig, devices } from '@playwright/test'
import { resolveE2EConfig, STORAGE_STATE } from './e2e/config/env'

const cfg = resolveE2EConfig()

// When NOT reusing a running server (CI / clean local), Playwright boots the
// frontend itself. The emulator host/ports + project flow into the dev server
// via env so it can target the isolated test emulators. The test *backend* is
// booted by globalSetup (see e2e/setup/backend-stack.ts); the test *emulators*
// are auto-started by the `npm run e2e` wrapper (firebase.test.json).
//
// Command is env-overridable and defaults to the dev server on baseURL's port
// (e.g. :3110 locally so it doesn't collide with your dev server on :3010).
const devPort = new URL(cfg.baseURL).port || '3010'
const defaultDevCommand = `npm run dev -- --port ${devPort}`
const webServer = cfg.reuseServer
  ? undefined
  : {
      command: process.env.E2E_DEV_COMMAND ?? defaultDevCommand,
      url: cfg.baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      ignoreHTTPSErrors: true,
      env: {
        // Build into a dedicated dir so the e2e frontend never shares its compiled
        // bundle (with e2e's inlined NEXT_PUBLIC_* values) with the dev server's.
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-e2e',
        // The dev server's apiClient throws at module-eval if this is unset.
        // CI has no .env.local, so forward the resolved backend origin here.
        NEXT_PUBLIC_API_URL: cfg.apiURL,
        // getAgentClient() throws when this is unset. The agent isn't exercised
        // by the starter suite, but the URL must exist for any code that
        // constructs the client.
        NEXT_PUBLIC_CLAUDE_AGENT_URL:
          process.env.NEXT_PUBLIC_CLAUDE_AGENT_URL ?? 'http://127.0.0.1:8081',
        NEXT_PUBLIC_EMULATOR_HOST: cfg.emulator?.host ?? '127.0.0.1',
        NEXT_PUBLIC_AUTH_EMULATOR_PORT: cfg.emulator?.authPort ?? '9109',
        NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: cfg.emulator?.firestorePort ?? '8090',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: cfg.emulator?.projectId ?? 'hexaverse-emulator',
        NEXT_PUBLIC_FIREBASE_API_KEY: cfg.emulator?.apiKey ?? 'demo-api-key',
      },
    }

// Deployed dev/prod sit behind Vercel Deployment Protection (the preview URL and
// the custom domain both serve Vercel's SSO wall). The bypass is NOT applied as a
// global extraHTTPHeaders here: Playwright attaches those headers to *every*
// request the browser makes, including third-party ones. Custom x-vercel-* headers
// on a cross-origin call (e.g. Firebase's POST to identitytoolkit.googleapis.com)
// force a CORS preflight that Google rejects → net::ERR_FAILED → the Firebase SDK
// reports auth/network-request-failed and login never completes. Instead, auth.setup
// bootstraps Vercel's bypass *cookie* via query params on its first navigation; the
// cookie is origin-scoped (deployment only) and persists into every spec through
// storageState. See e2e/setup/auth.setup.ts and e2e/config/env.ts (vercelBypassQuery).

export default defineConfig({
  testDir: './e2e',
  // Build + run the isolated ENV=test backend before anything, tear it down after.
  // No-ops in CI (E2E_MANAGE_STACK=0) and when attaching to a running stack.
  globalSetup: './e2e/setup/global-setup.ts',
  globalTeardown: './e2e/setup/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // CI retries absorb transient dev-server flake (next dev occasionally serves a
  // blank shell under sustained load) without masking real bugs — a genuinely
  // broken test fails all attempts. Locally retries are zero: the journey runs
  // once per change (docs/testing-tiers.md), and a hung test should fail in one
  // minute, not three — hexaverse lost a 30-minute silence to a retried hang.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: cfg.baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  ...(webServer ? { webServer } : {}),
})

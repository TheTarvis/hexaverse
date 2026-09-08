/**
 * The two LOCAL emulator clusters, as one registry.
 *
 *   dev   — firebase.json: the stack `npm run dev` / `make run` use
 *           (auth :9109, firestore :8090, frontend :3010, backend :9010).
 *   test  — firebase.test.json: the ISOLATED stack Playwright and the Go
 *           integration suite use (auth :10109, firestore :9100, frontend
 *           :3110, backend :9012). Wiped on every e2e run.
 *
 * Ports are READ FROM THE FIREBASE CONFIG FILES, never copied here, so the
 * emulator, the Playwright suite and the user CLI can never disagree about
 * where a cluster lives. Both clusters run under the same project id
 * (`hexaverse-emulator`, the `--project` flag in the root package.json) —
 * the auth emulator mints every token with that audience, so the backend on
 * either cluster expects exactly it.
 *
 * Shared by the Playwright suite (`env.ts` derives its local defaults from
 * the `test` entry) and by the user CLI (`e2e/cli/users.ts`, which takes
 * `--cluster`). Node-only: it touches the filesystem.
 */
import fs from 'fs'
import path from 'path'

export type EmulatorCluster = 'dev' | 'test'

export interface EmulatorConfig {
  host: string
  authPort: string
  firestorePort: string
  projectId: string
  apiKey: string
}

export interface ClusterConfig {
  cluster: EmulatorCluster
  emulator: EmulatorConfig
  /** The frontend origin this cluster's stack serves. */
  frontendURL: string
  /** The backend API origin this cluster's stack serves. */
  apiURL: string
  /** The cluster's default seeded user. */
  user: { email: string; password: string }
}

/** The one project id every local emulator runs under (root package.json `--project`). */
export const EMULATOR_PROJECT_ID = 'hexaverse-emulator'
/** Any key works against the emulator; this is the one every caller uses. */
export const EMULATOR_API_KEY = 'demo-api-key'

const CLUSTER_FILES: Record<EmulatorCluster, string> = {
  dev: 'firebase.json',
  test: 'firebase.test.json',
}

const CLUSTER_STACK: Record<EmulatorCluster, { frontendURL: string; apiURL: string }> = {
  dev: { frontendURL: 'http://localhost:3010', apiURL: 'http://localhost:9010' },
  test: { frontendURL: 'http://localhost:3110', apiURL: 'http://localhost:9012' },
}

/**
 * The default seeded user per cluster. The `test` user is the Playwright
 * account (`auth.setup.ts` creates it; the wipe removes it each run); the
 * `dev` user is a persistent-until-emulator-restart convenience account for
 * driving the dev stack without a real identity.
 */
export const CLUSTER_DEFAULT_USER: Record<EmulatorCluster, { email: string; password: string }> = {
  dev: { email: 'dev@hexaverse.test', password: 'devPassword123!' },
  test: { email: 'e2e@hexaverse.test', password: 'e2ePassword123!' },
}

function repoRoot(): string {
  // frontend/e2e/config -> repo root. `__dirname` is provided by both the
  // Playwright transform (CJS) and vite-node (which shims it).
  return path.resolve(__dirname, '..', '..', '..')
}

function readPorts(cluster: EmulatorCluster): { authPort: string; firestorePort: string } {
  const file = path.join(repoRoot(), CLUSTER_FILES[cluster])
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    emulators?: { auth?: { port?: number | string }; firestore?: { port?: number | string } }
  }
  const auth = parsed.emulators?.auth?.port
  const firestore = parsed.emulators?.firestore?.port
  if (auth === undefined || firestore === undefined) {
    throw new Error(`[clusters] ${CLUSTER_FILES[cluster]} has no emulators.auth.port / emulators.firestore.port`)
  }
  return { authPort: String(auth), firestorePort: String(firestore) }
}

export function isEmulatorCluster(value: string | undefined): value is EmulatorCluster {
  return value === 'dev' || value === 'test'
}

/** Resolve a cluster's emulator, stack origins and default user. */
export function emulatorClusterConfig(cluster: EmulatorCluster, host = '127.0.0.1'): ClusterConfig {
  const { authPort, firestorePort } = readPorts(cluster)
  return {
    cluster,
    emulator: { host, authPort, firestorePort, projectId: EMULATOR_PROJECT_ID, apiKey: EMULATOR_API_KEY },
    ...CLUSTER_STACK[cluster],
    user: CLUSTER_DEFAULT_USER[cluster],
  }
}

/**
 * Local test-backend lifecycle for the Playwright suite.
 *
 * Build the server binary, run it on an isolated port with a *curated* env
 * (ENV=test → loads .env.test → test emulators + DISABLE_RATE_LIMITING), then
 * poll /healthcheck. This is what keeps E2E off your real dev stack — the test
 * backend talks to the firebase.test.json emulators (9100 / 10109 / 9106), never
 * the dev emulators your `make run` backend uses.
 *
 * CI already boots its own backend inside the job, so it sets E2E_MANAGE_STACK=0
 * and these hooks no-op there.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { resolveE2EConfig, type E2EConfig } from '../config/env'

const PID_FILE = 'playwright/.auth/backend.pid'
const LOG_FILE = 'playwright/.auth/backend.log'
const BINARY_NAME = 'test-server'

/** backend/, resolved from the frontend cwd Playwright runs in. */
function backendDir(): string {
  return resolve(process.cwd(), '..', 'backend')
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === '1' || value.toLowerCase() === 'true'
}

/**
 * Whether this run owns the backend lifecycle. Default: manage locally when we're
 * booting our own frontend (not attaching) and not in CI. CI sets
 * E2E_MANAGE_STACK=0 explicitly since it starts the backend in the job.
 */
export function backendManaged(cfg: E2EConfig): boolean {
  return bool(process.env.E2E_MANAGE_STACK, cfg.env === 'local' && !cfg.reuseServer && !process.env.CI)
}

function portFromURL(url: string): string {
  const parsed = new URL(url)
  return parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
}

async function tcpOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port })
    const done = (ok: boolean) => {
      socket.destroy()
      resolvePromise(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function healthy(apiURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiURL}/healthcheck`)
    return res.ok
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Wipe the emulator project (Firestore + Auth) via the emulator REST clear
 * endpoints, before the backend starts so it re-seeds into a clean project. This
 * is what keeps the long-lived local emulator from accumulating data across runs
 * (CI gets this for free with a throwaway emulator).
 *
 * The backend Go integration suite shares this project (the auth emulator pins
 * token audiences to one project, so we can't split namespaces — see env.ts).
 * That's safe as long as the suites run serially; don't run both concurrently in
 * separate terminals, or this wipe will clear the Go run's data mid-flight.
 */
async function wipeProject(emu: NonNullable<E2EConfig['emulator']>): Promise<void> {
  const project = emu.projectId
  const firestoreClear = `http://${emu.host}:${emu.firestorePort}/emulator/v1/projects/${project}/databases/(default)/documents`
  const authClear = `http://${emu.host}:${emu.authPort}/emulator/v1/projects/${project}/accounts`
  try {
    await fetch(firestoreClear, { method: 'DELETE' })
    // Auth emulator admin ops accept the literal "owner" bearer token.
    await fetch(authClear, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
    console.log(`[e2e] wiped emulator project '${project}' (Firestore + Auth)`)
  } catch (err) {
    console.warn(`[e2e] emulator wipe failed for '${project}':`, (err as Error).message)
  }
}

/**
 * Build + start the test backend if this run manages it. Writes the child PID so
 * teardown can stop it. No-ops when unmanaged. Always starts fresh (killing any
 * leftover we tracked and wiping this run's project first) so every run gets
 * clean data AND freshly-built code — no stale-binary surprises.
 */
export async function startBackend(): Promise<void> {
  const cfg = resolveE2EConfig()
  if (!backendManaged(cfg)) return

  const apiURL = cfg.apiURL
  const port = portFromURL(apiURL)

  // The backend needs the isolated test emulators up. Fail loud rather than
  // silently writing to the wrong Firestore.
  const emu = cfg.emulator
  if (emu) {
    const checks: Array<[string, number]> = [
      ['auth', Number(emu.authPort)],
      ['firestore', Number(emu.firestorePort)],
    ]
    for (const [name, p] of checks) {
      if (!(await tcpOpen(emu.host, p))) {
        throw new Error(
          `[e2e] test ${name} emulator not reachable at ${emu.host}:${p}. ` +
            `Run the suite via 'npm run e2e' (it auto-starts a throwaway emulator), ` +
            `or start a persistent one first with 'npm run firebase:emulators:test' (repo root).`,
        )
      }
    }
  }

  // Kill a leftover backend from a prior (crashed) run so we never reuse stale
  // code, then wipe this run's project so the fresh backend seeds cleanly.
  stopBackend()
  if (emu) await wipeProject(emu)

  const dir = backendDir()
  console.log(`[e2e] building test backend in ${dir}`)
  const build = spawnSync('go', ['build', '-o', BINARY_NAME, '.'], {
    cwd: dir,
    encoding: 'utf8',
  })
  if (build.status !== 0) {
    throw new Error(`[e2e] failed to build test backend:\n${build.stderr || build.stdout}`)
  }

  // Curated env — do NOT inherit os env wholesale (it may carry dev emulator hosts
  // that would override .env.test). ENV=test makes config.go load .env.test, which
  // sets the project to hexaverse-emulator (must match the emulator's
  // --project so token audiences line up — see env.ts). We deliberately do NOT
  // override the project here; isolation from the Go suite comes from the per-run
  // wipe + serial execution, not a separate namespace.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    USER: process.env.USER ?? '',
    ENV: 'test',
    PORT: port,
  }
  for (const key of ['LOG_LEVEL', 'GOOGLE_APPLICATION_CREDENTIALS', 'IMPORT_BUCKET', 'EXPORT_BUCKET']) {
    if (process.env[key]) env[key] = process.env[key] as string
  }

  mkdirSync(dirname(PID_FILE), { recursive: true })
  const logFd = openSync(LOG_FILE, 'w')
  const child = spawn(resolve(dir, BINARY_NAME), [], {
    cwd: dir,
    env: env as NodeJS.ProcessEnv,
    detached: true,
    stdio: ['ignore', logFd, logFd] as ['ignore', number, number],
  })
  child.unref()
  if (!child.pid) throw new Error('[e2e] test backend failed to spawn')
  writeFileSync(PID_FILE, String(child.pid))
  console.log(`[e2e] test backend starting (pid ${child.pid}, logs → ${LOG_FILE})`)

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await healthy(apiURL)) {
      console.log(`[e2e] test backend ready at ${apiURL}`)
      return
    }
    await sleep(300)
  }
  stopBackend()
  throw new Error(
    `[e2e] test backend did not become healthy at ${apiURL} within 60s. See ${LOG_FILE}.`,
  )
}

/** Stop the managed backend (if we started one) and clean up the binary + pidfile. */
export function stopBackend(): void {
  if (!existsSync(PID_FILE)) return
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
  if (pid) {
    try {
      // Negative pid kills the whole process group (detached child leads it).
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }
  rmSync(PID_FILE, { force: true })
  rmSync(resolve(backendDir(), BINARY_NAME), { force: true })
}

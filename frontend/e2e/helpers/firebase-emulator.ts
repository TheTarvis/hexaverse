/**
 * Firebase Auth emulator REST helpers — the ONE implementation of "make a
 * user exist and get a token for it" against a local emulator cluster.
 *
 * Callers: the Playwright auth setup (`test` cluster) and the user CLI
 * (`e2e/cli/users.ts`, either cluster via `--cluster`). Every function takes
 * the cluster's `EmulatorConfig` (see `config/clusters.ts`), so nothing here
 * knows or cares which cluster it is talking to.
 *
 * Two API surfaces of the emulator are used:
 *   - the public identitytoolkit endpoints (`accounts:signUp`,
 *     `accounts:signInWithPassword`, `accounts:signInWithCustomToken`) —
 *     exactly what the Firebase JS SDK calls;
 *   - the project-scoped ADMIN endpoints (`projects/{id}/accounts:lookup`,
 *     `:query`, `:delete`), which the emulator opens to the literal bearer
 *     token `owner` — the same shortcut the e2e wipe already relies on.
 *
 * Emulator only: none of this works, or should ever be pointed, at real
 * Firebase Auth.
 */
import type { EmulatorConfig } from '../config/clusters'

function authBase(emu: EmulatorConfig): string {
  return `http://${emu.host}:${emu.authPort}/identitytoolkit.googleapis.com/v1/accounts`
}

function adminBase(emu: EmulatorConfig): string {
  return `http://${emu.host}:${emu.authPort}/identitytoolkit.googleapis.com/v1/projects/${emu.projectId}/accounts`
}

const ADMIN_HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

/** A user record as the emulator's admin lookup/query returns it. */
export interface EmulatorUser {
  localId: string
  email?: string
  displayName?: string
  customAuth?: boolean
  providerUserInfo?: { providerId: string; email?: string }[]
  createdAt?: string
  lastLoginAt?: string
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  return body?.error?.message
}

/**
 * Create the user if it doesn't already exist. Idempotent. Returns the uid
 * either way (an existing user's is looked up), and whether this call
 * created it.
 */
export async function ensureEmulatorUser(
  emu: EmulatorConfig,
  email: string,
  password: string,
): Promise<{ localId: string; created: boolean }> {
  const res = await fetch(`${authBase(emu)}:signUp?key=${emu.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (res.ok) {
    const data = (await res.json()) as { localId: string }
    return { localId: data.localId, created: true }
  }
  const code = await errorCode(res)
  // Already-present users are fine — that's the idempotent path.
  if (code === 'EMAIL_EXISTS') {
    const existing = await findEmulatorUser(emu, { email })
    if (!existing) throw new Error(`[emulator] ${email} exists but could not be looked up`)
    return { localId: existing.localId, created: false }
  }
  throw new Error(`[emulator] signUp failed (${res.status}): ${code ?? 'unknown'}`)
}

/** Sign in with a password and return an ID token usable against the backend API. */
export async function emulatorSignIn(
  emu: EmulatorConfig,
  email: string,
  password: string,
): Promise<{ idToken: string; localId: string }> {
  const res = await fetch(`${authBase(emu)}:signInWithPassword?key=${emu.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!res.ok) {
    throw new Error(`[emulator] signIn failed (${res.status}): ${await errorCode(res)}`)
  }
  const data = (await res.json()) as { idToken: string; localId: string }
  return { idToken: data.idToken, localId: data.localId }
}

/** Find one user by email or uid through the admin lookup. Null when absent. */
export async function findEmulatorUser(
  emu: EmulatorConfig,
  by: { email: string } | { localId: string },
): Promise<EmulatorUser | null> {
  const body = 'email' in by ? { email: [by.email] } : { localId: [by.localId] }
  const res = await fetch(`${adminBase(emu)}:lookup`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`[emulator] lookup failed (${res.status}): ${await errorCode(res)}`)
  const data = (await res.json()) as { users?: EmulatorUser[] }
  return data.users?.[0] ?? null
}

/** Every user in the cluster (the emulator caps a page at 500; plenty locally). */
export async function listEmulatorUsers(emu: EmulatorConfig): Promise<EmulatorUser[]> {
  const res = await fetch(`${adminBase(emu)}:query`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ returnUserInfo: true }),
  })
  if (!res.ok) throw new Error(`[emulator] query failed (${res.status}): ${await errorCode(res)}`)
  const data = (await res.json()) as { userInfo?: EmulatorUser[] }
  return data.userInfo ?? []
}

/** Delete one user by uid. A missing uid is an error, not a silent no-op. */
export async function deleteEmulatorUser(emu: EmulatorConfig, localId: string): Promise<void> {
  const res = await fetch(`${adminBase(emu)}:delete`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ localId }),
  })
  if (!res.ok) throw new Error(`[emulator] delete failed (${res.status}): ${await errorCode(res)}`)
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Mint an UNSIGNED custom token for `uid`. The Auth emulator does not
 * verify custom-token signatures (it is what the Admin SDK itself emits when
 * `FIREBASE_AUTH_EMULATOR_HOST` is set: `alg: none`), so no service account
 * and no admin SDK are needed. Useless — and rejected — against real
 * Firebase Auth, which is the point: this can only ever sign into a local
 * emulator.
 *
 * The frontend's dev-only `/dev/login` route consumes one of these via
 * `signInWithCustomToken`, which is how a browser session is obtained for
 * an emulator user without typing a password anywhere.
 */
export function mintEmulatorCustomToken(uid: string, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: 'firebase-auth-emulator@example.com',
      sub: 'firebase-auth-emulator@example.com',
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      uid,
      iat: now,
      exp: now + ttlSeconds,
    }),
  )
  return `${header}.${payload}.`
}

/** Exchange a custom token for an ID token (the REST twin of `signInWithCustomToken`). */
export async function emulatorSignInWithCustomToken(
  emu: EmulatorConfig,
  customToken: string,
): Promise<{ idToken: string; localId: string; isNewUser: boolean }> {
  const res = await fetch(`${authBase(emu)}:signInWithCustomToken?key=${emu.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  if (!res.ok) {
    throw new Error(`[emulator] custom-token signIn failed (${res.status}): ${await errorCode(res)}`)
  }
  const data = (await res.json()) as { idToken: string; isNewUser: boolean }
  const payload = JSON.parse(Buffer.from(data.idToken.split('.')[1]!, 'base64').toString()) as {
    user_id: string
  }
  return { idToken: data.idToken, localId: payload.user_id, isNewUser: data.isNewUser }
}

/**
 * Firebase Auth emulator REST helpers (signUp / signInWithPassword) for the
 * Playwright setup.
 *
 * Only used on E2E_ENV=local. dev/prod use real Firebase Auth via the login UI.
 */
import type { EmulatorConfig } from '../config/env'

function authBase(emu: EmulatorConfig): string {
  return `http://${emu.host}:${emu.authPort}/identitytoolkit.googleapis.com/v1/accounts`
}

/** Create the test user if it doesn't already exist. Idempotent. */
export async function ensureEmulatorUser(
  emu: EmulatorConfig,
  email: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${authBase(emu)}:signUp?key=${emu.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  const code = body?.error?.message as string | undefined
  // Already-present users are fine — that's the idempotent path.
  if (code === 'EMAIL_EXISTS') return
  throw new Error(`[e2e] emulator signUp failed (${res.status}): ${code ?? 'unknown'}`)
}

/** Sign in and return an ID token usable for backend API seeding. */
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
    const body = await res.json().catch(() => ({}))
    throw new Error(`[e2e] emulator signIn failed (${res.status}): ${body?.error?.message}`)
  }
  const data = (await res.json()) as { idToken: string; localId: string }
  return { idToken: data.idToken, localId: data.localId }
}

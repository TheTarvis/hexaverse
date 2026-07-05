/**
 * Playwright globalTeardown: stop the test backend this run started (no-op if we
 * attached to an already-running one). See backend-stack.ts.
 */
import { stopBackend } from './backend-stack'

export default async function globalTeardown() {
  stopBackend()
}

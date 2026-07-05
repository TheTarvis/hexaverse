/**
 * Playwright globalSetup: bring up the isolated test backend before any project
 * runs (including the auth setup project). See backend-stack.ts for the details
 * and the CI/local gating.
 */
import { startBackend } from './backend-stack'

export default async function globalSetup() {
  await startBackend()
}

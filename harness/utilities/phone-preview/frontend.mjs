/** Isolated local production frontend. This does not start a gateway or public tunnel. */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../frontend')
const distDir = '.next-phone-preview'
const manifestPath = resolve(frontendDir, distDir, 'phone-preview.json')

export function previewEnvironment(projectId, inherited = process.env) {
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) throw new Error('Supply the verified backend emulator project ID with --project <id>.')
  return {
    ...inherited,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: distDir,
    NEXT_PUBLIC_PHONE_PREVIEW: 'true',
    NEXT_PUBLIC_API_URL: '/api',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
    NEXT_PUBLIC_FIREBASE_APP_ID: '',
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: '',
    NEXT_PUBLIC_CLAUDE_AGENT_URL: '',
  }
}

/** A root-relative copy keeps aliases intact while isolating generated types/cache. */
export function previewTsconfig(base) {
  return {
    ...base,
    compilerOptions: { ...base.compilerOptions, tsBuildInfoFile: `${distDir}/tsconfig.tsbuildinfo` },
    include: [...(base.include ?? []).filter(entry => !entry.startsWith('.next')), `${distDir}/types/**/*.ts`],
    exclude: [...new Set([...(base.exclude ?? []), '.next', '.next-e2e'])],
  }
}

export function parseOptions(args) {
  const [action, ...flags] = args
  if (!['build', 'start'].includes(action) || flags.length % 2) throw new Error('Usage: frontend.mjs build|start --project <verified-emulator-project> [--port 20205]')
  const options = { action, projectId: undefined, port: 20205 }
  const seen = new Set()
  for (let index = 0; index < flags.length; index += 2) {
    const [flag, value] = flags.slice(index, index + 2)
    if (!['--project', '--port'].includes(flag) || seen.has(flag)) throw new Error(`Unsupported or duplicate option: ${flag}`)
    seen.add(flag)
    if (flag === '--project') options.projectId = value
    else {
      if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw new Error('Port must be an integer from 1024 through 65535.')
      options.port = Number(value)
    }
  }
  previewEnvironment(options.projectId, {})
  return options
}

export function verifyBuildManifest(manifest, projectId) {
  if (manifest?.mode !== 'phone-preview' || manifest.projectId !== projectId) throw new Error('Build the isolated preview for this emulator project before starting it.')
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const env = { ...previewEnvironment(options.projectId), PHONE_PREVIEW_TYPESCRIPT: 'true' }
  if (options.action === 'build') {
    const base = JSON.parse(await readFile(resolve(frontendDir, 'tsconfig.json'), 'utf8'))
    await writeFile(resolve(frontendDir, 'tsconfig.phone-preview.json'), JSON.stringify(previewTsconfig(base), null, 2) + '\n')
  }
  if (options.action === 'start') {
    let manifest
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) }
    catch { throw new Error('No isolated phone-preview build. Run the build command first.') }
    verifyBuildManifest(manifest, options.projectId)
  }
  const args = options.action === 'build' ? ['build'] : ['start', '--hostname', '127.0.0.1', '--port', String(options.port)]
  const child = spawn(process.execPath, [resolve(frontendDir, 'node_modules/next/dist/bin/next'), ...args], { cwd: frontendDir, env, stdio: 'inherit' })
  const stop = signal => { child.kill(signal) }
  const stopInt = () => stop('SIGINT'), stopTerm = () => stop('SIGTERM')
  process.on('SIGINT', stopInt); process.on('SIGTERM', stopTerm)
  try {
    const code = await new Promise((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => accept(code ?? (signal ? 1 : 0)))
    })
    if (code !== 0) { process.exitCode = code; return }
    if (options.action === 'build') await writeFile(manifestPath, JSON.stringify({ mode: 'phone-preview', projectId: options.projectId }) + '\n')
  } finally { process.off('SIGINT', stopInt); process.off('SIGTERM', stopTerm) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

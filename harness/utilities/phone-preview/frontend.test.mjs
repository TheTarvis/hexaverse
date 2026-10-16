import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOptions, previewEnvironment, previewTsconfig, verifyBuildManifest } from './frontend.mjs'

test('requires explicit verified project instead of adopting inherited production identity', () => {
  assert.throws(() => previewEnvironment(undefined, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'production-project' }))
  const inherited = { NEXT_PUBLIC_API_URL: 'https://old-api.example', NEXT_DIST_DIR: '.next', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'old-project', NEXT_PUBLIC_FIREBASE_API_KEY: 'old-public-key', KEEP_EXISTING: 'yes' }
  const env = previewEnvironment('hexaverse-emulator', inherited)
  assert.equal(env.NEXT_DIST_DIR, '.next-phone-preview')
  assert.equal(env.NEXT_PUBLIC_PHONE_PREVIEW, 'true')
  assert.equal(env.NEXT_PUBLIC_API_URL, '/api')
  assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'hexaverse-emulator')
  assert.equal(env.NEXT_PUBLIC_FIREBASE_API_KEY, 'demo-api-key')
  assert.equal(env.KEEP_EXISTING, 'yes')
  assert.equal(inherited.NEXT_DIST_DIR, '.next')
})

test('accepts only local frontend build/start flags and an unambiguous numeric port', () => {
  assert.deepEqual(parseOptions(['start', '--project', 'hexaverse-emulator']), { action: 'start', projectId: 'hexaverse-emulator', port: 20205 })
  assert.equal(parseOptions(['start', '--project', 'hexaverse-emulator', '--port', '20305']).port, 20305)
  for (const args of [[], ['deploy'], ['start'], ['build', '--project', ''], ['start', '--project', 'hexaverse-emulator', '--hostname', '0.0.0.0'], ['start', '--project', 'hexaverse-emulator', '--port', '20205junk'], ['start', '--project', 'hexaverse-emulator', '--port', '80'], ['start', '--project', 'hexaverse-emulator', '--project', 'different-project']]) assert.throws(() => parseOptions(args))
})

test('refuses mismatched or ordinary production artifacts', () => {
  verifyBuildManifest({ mode: 'phone-preview', projectId: 'hexaverse-emulator' }, 'hexaverse-emulator')
  assert.throws(() => verifyBuildManifest({ mode: 'production', projectId: 'hexaverse-emulator' }, 'hexaverse-emulator'))
  assert.throws(() => verifyBuildManifest({ mode: 'phone-preview', projectId: 'other-project' }, 'hexaverse-emulator'))
  assert.throws(() => verifyBuildManifest(null, 'hexaverse-emulator'))
})


test('derives an isolated tsconfig without modifying ordinary aliases, types or cache', () => {
  const base = { compilerOptions: { strict: true, paths: { '@/*': ['./*'] }, incremental: true }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next-e2e/types/**/*.ts', 'next-env.d.ts'], exclude: ['node_modules'] }
  const original = JSON.stringify(base)
  const preview = previewTsconfig(base)
  assert.deepEqual(preview.include, ['**/*.ts', '**/*.tsx', 'next-env.d.ts', '.next-phone-preview/types/**/*.ts'])
  assert.deepEqual(preview.compilerOptions.paths, base.compilerOptions.paths)
  assert.equal(preview.compilerOptions.tsBuildInfoFile, '.next-phone-preview/tsconfig.tsbuildinfo')
  assert.ok(preview.exclude.includes('.next')); assert.ok(preview.exclude.includes('.next-e2e'))
  assert.equal(JSON.stringify(base), original)
})

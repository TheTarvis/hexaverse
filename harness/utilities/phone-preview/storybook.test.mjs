import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditStorybookOutput } from './storybook.mjs'

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'hexaverse-storybook-audit-'))
  try {
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'assets/manager.js'), '')
    await writeFile(join(directory, 'assets/preview.js'), '')
    await writeFile(join(directory, 'index.html'), '<script src="./assets/manager.js"></script>')
    await writeFile(join(directory, 'iframe.html'), '<script src="/storybook/assets/preview.js"></script>')
    await writeFile(join(directory, 'index.json'), JSON.stringify({ entries: { 'hud-object-thumbnails--feature-comparison': {}, 'graphics-world-gate--feature-lineup-close': {} } }))
    await run(directory)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('resolves relative manager and prefixed iframe assets to actual confined files', async () => fixture(async directory => {
  assert.deepEqual(await auditStorybookOutput(directory), ['/storybook/assets/manager.js', '/storybook/assets/preview.js'])
}))

test('refuses a root asset dependency that the Storybook gateway cannot satisfy', async () => fixture(async directory => {
  await writeFile(join(directory, 'iframe.html'), '<script src="/assets/preview.js"></script>')
  await assert.rejects(auditStorybookOutput(directory), /escapes Storybook prefix/)
}))

test('refuses missing files instead of claiming prefix compatibility', async () => fixture(async directory => {
  await writeFile(join(directory, 'iframe.html'), '<script src="/storybook/missing.js"></script>')
  await assert.rejects(auditStorybookOutput(directory), /ENOENT/)
}))

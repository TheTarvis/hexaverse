const { test } = require('node:test')
const assert = require('node:assert/strict')
const { inspectCatalog, inspectCloseStyles } = require('./check-storybook.cjs')
const meta = `const meta = { id:'task-test', title:'Tasks/Test', tags:['catalog'], parameters:{catalog:{purpose:'task',status:'reference',task:'test',record:'docs/hud.md'}} } satisfies Meta;`

test('rejects private close geometry while allowing broad controls to exempt the shared close', () => {
  assert.equal(inspectCloseStyles('.card button[data-mobile-close] { min-width: 44px; }').length, 1)
  assert.equal(inspectCloseStyles('@media (max-width: 760px) { [data-slot="hud-close"] svg { width: 20px; } }').length, 1)
  assert.deepEqual(inspectCloseStyles(".workspace button:not([data-slot='hud-close']) { min-width: 44px; }"), [])
})

test('requires catalog metadata and stable links on new stories', () => {
  const result = inspectCatalog(`const meta={title:'HUD/Unclassified'};export const Example={};`)
  assert.ok(result.errors.some(error => error.includes('stable id')))
  assert.ok(result.errors.some(error => error.includes('purpose')))
})
test('requires an unresolved question on comparisons, including story overrides', () => {
  assert.ok(inspectCatalog(meta + `export const Example={parameters:{catalog:{status:'comparison'}}};`).errors.some(error => error.includes('unresolved question')))
  assert.deepEqual(inspectCatalog(meta + `export const Example={parameters:{catalog:{status:'comparison',question:'Which layout?'}}};`).errors, [])
})
test('rejects copied/native control implementations and inline typography', () => {
  const result = inspectCatalog(meta + `export const Example={render:()=> <button style={{fontSize:12}}>Copied</button>};`)
  assert.ok(result.errors.some(error => error.includes('bypasses HudControls')))
  assert.ok(result.errors.some(error => error.includes('inline typography')))
})
test('accepts the real shared controls and excludes Audio', () => {
  assert.deepEqual(inspectCatalog(`import {HudButton} from '@/components/hud/HudControls';` + meta + `export const Example={render:()=> <HudButton>Shared</HudButton>};`).errors, [])
  assert.deepEqual(inspectCatalog(`const meta={title:'Audio/POC'};export const Example={};`).errors, [])
})

test('only the dedicated Static Frame specimen disables default shell lighting', () => {
  assert.ok(inspectCatalog(meta + `export const Example={args:{lighting:'none'}};`).errors.some(error => error.includes('shell lighting override')))
  assert.deepEqual(inspectCatalog(meta + `export const StaticFrame={args:{lighting:'none'}};`, 'components/hud/HudCardShell.stories.tsx').errors, [])
  assert.ok(inspectCatalog(meta + `export const StaticFrame={args:{lighting:'none'}};`, 'components/other.stories.tsx').errors.some(error => error.includes('shell lighting override')))
})

test('rejects duplicate primary reviews and copied controls hidden in helper imports', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const { auditCatalog } = require('./check-storybook.cjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-catalog-'))
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  try {
    write('frontend/tsconfig.json', JSON.stringify({ compilerOptions: { jsx: 'preserve', moduleResolution: 'bundler', module: 'esnext' } }))
    write('docs/hud.md', '# Decision record')
    write('frontend/components/copied.tsx', 'export const Copied = () => <button>Private action</button>')
    const primary = meta.replace("task:'test'", "task:'test',primary:true")
    write('frontend/components/first.stories.tsx', `import { Copied } from './copied';${primary} export const Review={render:()=> <Copied/>};`)
    write('frontend/components/second.stories.tsx', primary.replace("id:'task-test'", "id:'task-second'") + 'export const Other={};')
    const result = auditCatalog(root)
    assert.ok(result.errors.some(error => error.includes('multiple primary reviews')))
    assert.ok(result.errors.some(error => error.includes('copied.tsx') && error.includes('bypasses HudControls')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

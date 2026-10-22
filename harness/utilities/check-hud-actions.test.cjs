const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ts = require('../../frontend/node_modules/typescript')
const { inspectSource, audit } = require('./check-hud-actions.cjs')

const inspect = code => inspectSource(ts.createSourceFile('fixture.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))

test('rejects aliased Catalyst imports and native semantic actions', () => {
  const result = inspect(`import {Button as Renamed} from '@/components/catalyst/button'; const x = <><Renamed/><button/><input type={'submit'}/><div role="button"/></>`)
  assert.equal(result.violations.length, 4)
  assert.match(result.violations[0].reason, /action import Button/)
})

test('allows shared aliases and native content/field semantics', () => {
  assert.deepEqual(inspect(`import {HudButton as Button, HudIconButton as Icon, HudBackButton as BackButton} from '@/components/hud/HudControls'; const x = <><Button/><Icon/><BackButton destination="objects"/><a href="/">Content</a><input type="range"/><summary>Expand</summary></>`).violations, [])
})

test('rejects namespaced library actions', () => {
  assert.ok(inspect(`import * as Menu from '@headlessui/react'; const x = <Menu.MenuButton/>`).violations.length)
})

test('rejects disabling the shared frame lighting, including aliased shells', () => {
  const result = inspect(`import {HudCardShell as Card} from '@/components/hud/HudCardShell'; const x = <Card lighting={'none'}/>;`)
  assert.ok(result.violations.some(item => item.reason.includes('shell lighting override')))
  assert.deepEqual(inspect(`import {HudCardShell as Card} from '@/components/hud/HudCardShell'; const x = <Card paused/>;`).violations, [])
})

test('traverses root entries, re-exports and dynamic imports; keeps dev separate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-action-boundary-'))
  try {
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), content)
    }
    write('tsconfig.json', JSON.stringify({ compilerOptions: { jsx: 'preserve', moduleResolution: 'bundler', module: 'esnext' }, include: ['**/*.tsx'] }))
    write('app/page.tsx', `export {Page} from '../components/barrel'`)
    write('components/barrel.tsx', `export {Page} from './page'`)
    write('components/page.tsx', `const child = import('./dynamic'); export const Page = () => <button/>`)
    write('components/dynamic.tsx', `export const Child = () => <button/>`)
    write('app/dev/page.tsx', `export default () => <button/>`)
    write('components/catalyst/button.tsx', `export const Button = () => <button/>`)
    const rows = audit(root)
    assert.equal(rows.filter(row => row.production).length, 2)
    assert.equal(rows.filter(row => !row.production).length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

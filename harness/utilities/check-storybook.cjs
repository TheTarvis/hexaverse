// Catalog policy lives with story metadata; this check validates it without executing stories.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('../../frontend/node_modules/typescript')
const { inspectSource } = require('./check-hud-actions.cjs')
const repo = path.resolve(__dirname, '../..')

function literal(node) {
  while (node && (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(item => [item.name.getText().replace(/['"]/g, ''), literal(item.initializer)]))
}

function inspectCatalog(code, file = 'components/example.stories.tsx') {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations)
  const meta = literal(declarations.find(item => item.name.getText(source) === 'meta')?.initializer)
  const errors = []
  const fail = message => errors.push(`${file}: ${message}`)
  if (!meta) { fail('declare a literal meta object'); return { errors, entries: [] } }
  if (meta.title?.startsWith('Audio/')) return { errors, entries: [] }
  if (!['Foundations', 'Tasks', 'Graphics'].includes(meta.title?.split('/')[0])) fail('use Foundations, Tasks or Graphics')
  if (!meta.id) fail('set an explicit stable id before changing sidebar titles')
  if (!meta.tags?.includes('catalog')) fail('add the catalog tag so browser verification includes this file')
  const exported = source.statements.filter(statement => ts.isVariableStatement(statement) && statement.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)).flatMap(statement => statement.declarationList.declarations)
  const entries = exported.map(item => {
    const story = literal(item.initializer) ?? {}
    const data = { ...meta.parameters?.catalog, ...story.parameters?.catalog }
    const label = `${file}#${item.name.getText(source)}`
    if (!['foundation', 'task', 'scene'].includes(data.purpose)) fail(`${label}: missing/invalid catalog purpose`)
    if (!['reference', 'prototype', 'comparison'].includes(data.status)) fail(`${label}: missing/invalid catalog status`)
    if (!data.record?.startsWith('docs/')) fail(`${label}: link its canonical decision record under docs/`)
    if (data.status === 'comparison' && !data.question?.trim()) fail(`${label}: an active comparison must name its unresolved question`)
    if (data.purpose === 'task' && !data.task) fail(`${label}: identify the player task`)
    if (data.primary && data.purpose !== 'task') fail(`${label}: only task reviews may be primary`)
    return { ...data, file, export: item.name.getText(source), id: meta.id, title: meta.title }
  })
  // Form primitive specimens intentionally render their actual Catalyst owner.
  if (!file.startsWith('components/catalyst/')) for (const violation of inspectSource(source).violations) fail(`${violation.line}: ${violation.reason}`)
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'lighting' && literal(node.initializer) === 'none') {
      let owner = node.parent
      while (owner && !ts.isVariableDeclaration(owner)) owner = owner.parent
      const staticSpecimen = file === 'components/hud/HudCardShell.stories.tsx' && owner?.name.getText(source) === 'StaticFrame'
      if (!staticSpecimen) fail('shell lighting override bypasses shared defaults; use the Static Frame specimen for CSS-only review')
    }
    if (ts.isPropertyAssignment(node) && ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing'].includes(node.name.getText(source))) {
      const value = literal(node.initializer)
      if (value !== undefined && !String(value).includes('var(') && !['inherit', 'normal'].includes(value)) fail('inline typography must use shared roles/tokens')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { errors, entries }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
}

// Close geometry belongs to HudCardShell, including its invisible touch target.
function inspectCloseStyles(css) {
  const selectors = []
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selector = match[1].replace(/:not\([^)]*\)/g, '')
    if (/\[data-mobile-close(?:\]|[\s=])|\[data-slot\s*=\s*['"]?hud-close\b/.test(selector)) selectors.push(match[1].trim())
  }
  return selectors
}

function auditCatalog(root = repo) {
  const files = walk(path.join(root, 'frontend/components')).filter(file => /\.stories\.[jt]sx?$/.test(file))
  const results = files.map(file => inspectCatalog(fs.readFileSync(file, 'utf8'), path.relative(path.join(root, 'frontend'), file)))
  const errors = results.flatMap(result => result.errors)
  for (const file of walk(path.join(root, 'frontend/components')).filter(file => file.endsWith('.css') && !file.includes(`${path.sep}__fixtures__${path.sep}`) && path.basename(file) !== 'hud-card-shell.module.css')) {
    for (const selector of inspectCloseStyles(fs.readFileSync(file, 'utf8'))) errors.push(`${path.relative(root, file)}: close override ${selector}; HudCardShell owns close placement and sizing`)
  }
  const entries = results.flatMap(result => result.entries)
  const primary = new Map()
  const ids = new Map()
  const tasks = new Set(entries.filter(entry => entry.purpose === 'task').map(entry => entry.task))
  for (const entry of entries) {
    if (ids.has(entry.id) && ids.get(entry.id) !== entry.file) errors.push(`${entry.id}: duplicate stable id`)
    ids.set(entry.id, entry.file)
    if (entry.record && !fs.existsSync(path.join(root, entry.record))) errors.push(`${entry.file}: missing decision record ${entry.record}`)
    if (entry.primary) {
      if (primary.has(entry.task)) errors.push(`${entry.task}: multiple primary reviews (${primary.get(entry.task)}, ${entry.file})`)
      primary.set(entry.task, entry.file)
    }
  }
  for (const task of tasks) if (task && !primary.has(task)) errors.push(`${task}: missing primary review`)
  // Follow imports so a helper module cannot hide a copied control behind a clean story.
  const frontend = path.join(root, 'frontend')
  const config = ts.readConfigFile(path.join(frontend, 'tsconfig.json'), ts.sys.readFile)
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, frontend).options
  const visited = new Set()
  function inspectDependency(file) {
    if (visited.has(file) || !file.startsWith(frontend + path.sep) || file.includes('node_modules') || !/\.[cm]?[jt]sx?$/.test(file)) return
    visited.add(file)
    const rel = path.relative(frontend, file)
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const report = inspectSource(source)
    if (!rel.startsWith('components/catalyst/') && rel !== 'components/hud/HudControls.tsx' && !/\.stories\./.test(rel)) {
      for (const violation of report.violations) errors.push(`${rel}:${violation.line}: ${violation.reason}`)
    }
    for (const dependency of report.dependencies) {
      const resolved = ts.resolveModuleName(dependency, file, options, ts.sys).resolvedModule?.resolvedFileName
      if (resolved) inspectDependency(resolved)
    }
  }
  files.filter(file => !file.includes(`${path.sep}audio${path.sep}`)).forEach(inspectDependency)
  // Story-only CSS owns arrangement, never private font defaults.
  const styles = walk(path.join(root, 'frontend/components')).filter(file => /(?:\.stories|(?:travel|fleet-status)-study|galaxy-map-review)\.module\.css$/.test(file))
  for (const file of styles) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of css.matchAll(/\b(font(?:-family|-size|-weight)?|letter-spacing)\s*:\s*([^;}]+)/g)) {
      if (!/var\(|^(inherit|normal|unset|initial)$/.test(match[2].trim())) errors.push(`${path.relative(root, file)}: private ${match[1]}; use a shared token`)
    }
  }
  return { errors, entries }
}

if (require.main === module) {
  const result = auditCatalog()
  if (process.argv.includes('--inventory')) console.log(JSON.stringify(result.entries, null, 2))
  for (const error of result.errors) console.error(error)
  if (!process.argv.includes('--inventory')) console.log(`Story catalog: ${result.entries.length} in-scope examples; ${result.errors.length} violations. Audio excluded.`)
  process.exitCode = result.errors.length ? 1 : 0
}
module.exports = { inspectCatalog, auditCatalog, inspectCloseStyles }

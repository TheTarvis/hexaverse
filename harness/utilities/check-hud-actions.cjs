// Production action boundary. Run from any directory; --inventory includes dev/unused sources.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('../../frontend/node_modules/typescript')

const repo = path.resolve(__dirname, '../..')
// Includes action-producing composites inventoried in the migration audit.
const actionExports = new Set([
  'Button', 'CloseButton', 'MenuButton', 'ListboxButton', 'ComboboxButton',
  'DisclosureButton', 'PopoverButton', 'DialogClose', 'AvatarButton', 'BadgeButton',
  'NavbarItem', 'SidebarItem', 'DropdownButton', 'DropdownItem', 'DropdownV2',
  'Combobox', 'Listbox', 'PaginationPrevious', 'PaginationNext', 'PaginationPage',
  'TableRowActions', 'GradientIconButton', 'CompactSection', 'RefreshableSelect',
  'DeleteConfirmationModal', 'DraftCloseModal', 'DrawerForm', 'DrawerMultiStep',
  'DrawerDetails', 'Drawer',
])
// Reviewed backend owners, never feature-level exceptions. Tests/stories are excluded below.
const isBackend = file => file.startsWith('components/catalyst/') || file === 'components/hud/HudControls.tsx'
const excluded = file => /(?:\.test\.|\.spec\.|\.stories\.)/.test(file)

function inspectSource(source) {
  const imports = new Map()
  const dependencies = []
  const violations = []
  const add = (node, reason) => violations.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, reason })
  function scanImports(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text
      dependencies.push(module)
      if (ts.isImportDeclaration(node) && node.importClause && !node.importClause.isTypeOnly) {
        const bindings = node.importClause.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            if (item.isTypeOnly) continue
            const name = (item.propertyName || item.name).text
            imports.set(item.name.text, { module, name })
            if ((module.includes('/catalyst/') || module.startsWith('@headlessui/')) && actionExports.has(name)) add(item, `action import ${name} from ${module}; use HudControls`)
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { module, name: '*' })
      }
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text)
    }
    ts.forEachChild(node, scanImports)
  }
  scanImports(source)
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      const imported = imports.get(tag)
      const shared = imported && ['HudButton', 'HudIconButton', 'HudBackButton'].includes(imported.name) && /(?:^|\/)HudControls$/.test(imported.module)
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
      const value = name => {
        const initializer = attributes.find(attribute => attribute.name.getText(source) === name)?.initializer
        if (!initializer) return undefined
        if (ts.isStringLiteral(initializer)) return initializer.text
        if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteral(initializer.expression)) return initializer.expression.text
      }
      if (shared && imported.name === 'HudButton' && !['chrome', 'row', 'map'].includes(value('presentation'))) {
        // Whole-card commands use the stationary footer. Section/form commands
        // remain beside the fields they commit; footer/toolbar slots own theirs.
        let wrapped = false
        for (let owner = node.parent; owner; owner = owner.parent) {
          if (ts.isJsxAttribute(owner) && ['footer', 'toolbar'].includes(owner.name.getText(source))) break
          if (!ts.isJsxElement(owner)) continue
          if (owner.openingElement === node) continue
          const component = imports.get(owner.openingElement.tagName.getText(source))
          if (component?.name === 'HudSection' || owner.openingElement.tagName.getText(source) === 'form') break
          if (component?.name === 'HudCardShell') {
            if (!wrapped || value('variant') === 'primary') add(node, 'card action in scrolling content; use HudCardShell footer with HudActionBand, or HudSection for a contextual form action')
            break
          }
          wrapped = true
        }
      }
      if (imported?.name === 'HudCardShell' && /(?:^|\/)HudCardShell$/.test(imported.module) && value('lighting') === 'none') {
        add(node, 'shell lighting override bypasses shared defaults; use the Static Frame specimen for CSS-only review')
      }
      if (!shared && (tag === 'button' || /(?:^|\.)\w*[Bb]utton$/.test(tag) || actionExports.has(tag.split('.').at(-1)) || value('role') === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(value('type'))))) {
        add(node, `action <${tag}> bypasses HudControls`)
      }
      if (tag.includes('.')) {
        const owner = imports.get(tag.split('.')[0])
        if (owner && (owner.module.includes('/catalyst/') || owner.module.startsWith('@headlessui/')) && actionExports.has(tag.split('.').at(-1))) add(node, `namespaced action <${tag}> bypasses HudControls`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { dependencies, violations }
}

function audit(root) {
  const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
  const files = config.fileNames.filter(file => /\.[cm]?[jt]sx?$/.test(file) && !excluded(file) && /^(app|components|hooks|lib)\//.test(path.relative(root, file)))
  const db = new Map(files.map(file => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    return [file, inspectSource(source)]
  }))
  const live = new Set()
  function mark(file) {
    if (live.has(file) || !db.has(file)) return
    live.add(file)
    for (const module of db.get(file).dependencies) {
      const resolved = ts.resolveModuleName(module, file, config.options, ts.sys).resolvedModule?.resolvedFileName
      if (resolved && resolved.startsWith(root + path.sep)) mark(resolved)
    }
  }
  files.filter(file => /^app\/(?!dev\/|spike\/)(?:.*\/)?(?:page|layout|not-found|error|global-error|loading|template|default)\.[jt]sx?$/.test(path.relative(root, file))).forEach(mark)
  return [...db].flatMap(([file, entry]) => isBackend(path.relative(root, file)) ? [] : entry.violations.map(violation => ({ file: path.relative(root, file), production: live.has(file), ...violation })))
}

if (require.main === module) {
  const rows = audit(path.join(repo, 'frontend'))
  const failures = rows.filter(row => row.production)
  if (process.argv.includes('--inventory')) console.log(JSON.stringify(rows, null, 2))
  else for (const row of failures) console.error(`${row.file}:${row.line}: ${row.reason}`)
  console.log(`HUD action boundary: ${failures.length} production bypasses; ${rows.length - failures.length} dev/unused findings (separate disposition).`)
  process.exitCode = failures.length ? 1 : 0
}

module.exports = { inspectSource, audit }

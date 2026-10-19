import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('frontend/package.json'))
const ts = require('typescript')
const postcss = require('postcss')
const destination = '.scratch/typography-audit'
const roots = ['frontend/components', 'frontend/app', 'frontend/lib', 'frontend/.storybook']
const files = []
for (const file of execFileSync('rg', ['--files', ...roots], { encoding: 'utf8' }).trim().split('\n')) {
  if (/\.(?:[jt]sx?|css)$/.test(file) && !/\.(?:test|spec)\.|\.d\.ts$|\/(?:__fixtures__|fixtures|__tests__)\//.test(file)) files.push(file)
}
function group(file) {
  if (/\.stories\.|\.storybook\//.test(file)) return 'Storybook'
  if (/\/hud-prototype\/|\/storyboard\/|\/spike\/|\/HudPrototypeSwitcher\./.test(file)) return 'Prototype and storyboard sources'
  if (file.includes('/catalyst/')) return 'Catalyst primitives'
  if (/components\/(hud|space|fleet|galaxy|figure|market)\//.test(file)) return 'Game components'
  if (file.includes('/components/')) return 'Other application components'
  if (file.includes('/app/')) return 'Application routes and global styles'
  return 'Libraries and support'
}
function base(token) {
  let depth = 0, last = 0
  for (let i=0;i<token.length;i++) {
    if ('[('.includes(token[i])) depth++
    if ('])'.includes(token[i])) depth--
    if (token[i] === ':' && depth === 0) last=i+1
  }
  return token.slice(last).replace(/^!/, '').replace(/!$/, '')
}
function type(token) {
  const b=base(token)
  if (/^hud-type-/.test(b)) return 'shared-role'
  if (/^font-(?:sans|serif|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[.+\]|\(.+\))$/.test(b)) return /^(font-sans|font-serif|font-mono|font-\[)/.test(b) ? 'family-or-arbitrary-font' : 'weight-or-font-option'
  if (/^text-/.test(b)) {
    if (/^text-(?:xs|sm|base|lg|[2-9]?xl)(?:\/|$)|^text-\[(?:\d|\.)/.test(b)) return 'size'
    if (/^text-(?:left|right|center|justify|start|end|ellipsis|clip)$/.test(b)) return null
    if (/^text-(?:wrap|nowrap|balance|pretty)$/.test(b)) return 'wrapping'
    return /^text-(?:inherit|current|transparent|black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+|\[.+\]|\(.+\))(?:\/[^ ]+)?$/.test(b) ? 'text-color-or-arbitrary-text' : null
  }
  if (/^leading-/.test(b)) return 'line-height'
  if (/^tracking-/.test(b)) return 'tracking'
  if (/^(?:uppercase|lowercase|capitalize|normal-case)$/.test(b)) return 'case'
  if (/^(?:italic|not-italic)$/.test(b)) return 'style'
  if (/^(?:normal-nums|ordinal|slashed-zero|lining-nums|oldstyle-nums|proportional-nums|tabular-nums|diagonal-fractions|stacked-fractions)$/.test(b)) return 'numeric'
  if (/^(?:underline|overline|line-through|no-underline|decoration-.+|underline-offset-.+|text-shadow-.+|antialiased|subpixel-antialiased)$/.test(b)) return 'decoration-or-rendering'
  return null
}
const inventory=[]
const inlineProps = new Set(['font','fontFamily','fontSize','fontWeight','fontStyle','fontVariant','fontVariantNumeric','lineHeight','letterSpacing','textTransform','textShadow','textWrap'])
for (const file of files.sort()) {
  const source=fs.readFileSync(file,'utf8')
  const rows=[]
  const add=(line,kind,detail,extra={})=>rows.push({line,kind,detail,...extra})
  if (file.endsWith('.css')) {
    const css=postcss.parse(source,{from:file})
    css.walkDecls(d=>{
      if (/^(?:font(?:-.+)?|line-height|letter-spacing|text-transform|text-shadow|text-wrap|overflow-wrap|color|--(?:hud-.*(?:font|tracking|type).*|font-.+))$/.test(d.prop)) {
        add(d.source.start.line,'css',`${d.prop}: ${d.value}`,{context: (()=>{const a=[];for(let p=d.parent;p;p=p.parent)if(p.type==='atrule')a.unshift(`@${p.name} ${p.params}`.trim());return a.join(' → ')})(),selector:d.parent.selector || `@${d.parent.name || 'root'} ${d.parent.params || ''}`.trim(),property:d.prop,value:d.value})
      }
    })
  } else {
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
    const line=n=>ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1
    const visit=node=>{
      if (ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)) {
        const tokens=node.text.split(/\s+/).map(t=>({token:t,type:type(t)})).filter(t=>t.type)
        if(tokens.length)add(line(node),'utility',node.text,{tokens})
      }
      if(ts.isPropertyAssignment(node)&&inlineProps.has(node.name.getText(ast).replace(/['"]/g,'')))add(line(node),'inline',node.getText(ast))
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&inlineProps.has(node.left.name.text))add(line(node),'assignment',node.getText(ast))
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
        const tag=node.tagName.getText(ast)
        if(/^(?:HudHeading|HudText|HudValue|HudFacts|Heading|Subheading|Text|Strong|Code|h[1-6]|small|strong|code|pre)$/.test(tag)) {
          const attrs=node.attributes.properties.filter(a=>ts.isJsxAttribute(a)&&['variant','size','level','className'].includes(a.name.text)).map(a=>a.getText(ast))
          add(line(node),'element',tag+(attrs.length?' '+attrs.join(' '):''),{tag})
        }
      }
      ts.forEachChild(node,visit)
    }
    visit(ast)
  }
  inventory.push({file,group:group(file),records:rows.sort((a,b)=>a.line-b.line)})
}
const byGroup={}
const tokens={}
for(const f of inventory) {
  const g=byGroup[f.group]??={files:0,filesWithDeclarations:0,records:0}
  g.files++;if(f.records.length)g.filesWithDeclarations++;g.records+=f.records.length
  for(const row of f.records) for(const t of row.tokens||[]) {
    const item=tokens[t.token]??={type:t.type,occurrences:0,files:new Set()}
    item.occurrences++;item.files.add(f.file)
  }
}
const tokenRows=Object.entries(tokens).map(([token,v])=>({token,type:v.type,occurrences:v.occurrences,files:[...v.files]})).sort((a,b)=>a.token.localeCompare(b.token))
const summary={commit:execFileSync('git', ['rev-parse', '--short', 'HEAD'], {encoding:'utf8'}).trim(),scannedFiles:files.length,filesWithRecords:inventory.filter(f=>f.records.length).length,byGroup,uniqueUtilityTokens:tokenRows.length}
fs.writeFileSync(`${destination}/inventory.json`,JSON.stringify({method:'Static AST and CSS source inventory; counts are literal occurrences, not rendered elements or computed browser styles. Excludes tests, generated files and reference fixtures. Includes Storybook and prototype sources separately.',summary,files:inventory,tokens:tokenRows},null,2)+'\n')
const escape=s=>s.replace(/\|/g,'\\|').replace(/\n/g,' ')
const link=(file,line)=>`[${file}:${line}](../../${file}#L${line})`
let md='# Component typography source inventory\n\nGenerated by `node .scratch/typography-audit/audit.mjs` from frontend component, route, library and Storybook source. Tests, generated files and frozen fixtures are excluded. Counts describe literal source declarations, not rendered elements. Files with no direct declarations inherit their typography or delegate to children.\n\n'
for(const category of Object.keys(byGroup)) {
 md+=`## ${category}\n\n`
 for(const f of inventory.filter(f=>f.group===category&&f.records.length)) {
  md+=`### ${f.file}\n\n| Source | Kind | Declaration or component |\n| --- | --- | --- |\n`
  for(const row of f.records)md+=`| ${link(f.file,row.line)} | ${row.kind} | ${escape(row.kind==='utility' ? row.tokens.map(t=>t.token).join(' ') : row.kind==='css' ? `${row.context ? row.context + ' → ' : ''}${row.selector} → ${row.detail}` : row.detail)} |\n`
  md+='\n'
 }
}
md+='## Files with no direct typography declarations\n\nThese files were scanned; no tracked typography utilities, CSS properties, inline font settings, or listed text primitives were found. This does not imply that they render no text.\n\n'
for(const f of inventory.filter(f=>!f.records.length))md+=`- [${f.file}](../../${f.file})\n`
fs.writeFileSync(`${destination}/inventory.md`,md)
let utilities='# Typography utility inventory\n\nEvery recognized static typography utility, including variants, with literal occurrence counts and source-file references. Tailwind class names are source declarations; their effective appearance depends on the cascade and generated Tailwind theme.\n\n'
for(const kind of [...new Set(tokenRows.map(t=>t.type))]) {
 utilities+=`## ${kind}\n\n| Utility | Occurrences | Files |\n| --- | ---: | --- |\n`
 for(const t of tokenRows.filter(t=>t.type===kind))utilities+=`| ${escape(t.token)} | ${t.occurrences} | ${t.files.map(f=>`[${f.replace('frontend/','')}](../../${f})`).join(', ')} |\n`
 utilities+='\n'
}
fs.writeFileSync(`${destination}/utilities.md`,utilities)
console.log(JSON.stringify(summary,null,2))
console.log('Size utility tokens:',tokenRows.filter(t=>t.type==='size').map(t=>t.token).join(', '))
console.log('Font utility tokens:',tokenRows.filter(t=>/font/.test(t.type)).map(t=>t.token).join(', '))

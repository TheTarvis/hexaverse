export const meta = {
  name: 'openspec-team',
  description: 'OpenSpec team pipeline: entry-mode routing, spec authoring with parallel specialist panel, validation, adversarial repair loop, optional TDD implementation',
  whenToUse: 'Deterministic multi-agent run of the OpenSpec team. args: { request?: string, designDoc?: string, changeId?: string, entryMode?: "brownfield"|"greenfield"|"specced", capabilities?: string[], implement?: boolean, archive?: boolean }',
  phases: [
    { title: 'Entry', detail: 'detect/route starting state (brownfield retrofit or greenfield bootstrap)' },
    { title: 'Analyze', detail: 'design doc → capabilities, requirements, ambiguities' },
    { title: 'Author', detail: 'proposal, spec deltas, tasks.md' },
    { title: 'Panel', detail: 'architect/ux/security/reliability/dba review in parallel' },
    { title: 'Harden', detail: 'strict validation + adversarial repair loop (max 3 rounds)' },
    { title: 'Implement', detail: 'TDD: SDET red suite → devs to green (implement:true only)' },
    { title: 'Verify', detail: 'suite integrity, QA acceptance matrix, security/dba audits' },
  ],
}

// ---------- args ----------
const a = args || {}
if (!a.request && !a.designDoc && !a.changeId) {
  throw new Error('openspec-team needs args.request, args.designDoc, or args.changeId')
}
const CTX = [
  a.designDoc ? `Design document path: ${a.designDoc} — read it fully; it is the source of truth. Never work from a summary of it.` : '',
  a.request ? `User request: ${a.request}` : '',
  a.changeId ? `Existing change to continue: openspec/changes/${a.changeId}/` : '',
].filter(Boolean).join('\n')

// ---------- schemas ----------
const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['BLOCKER', 'MAJOR', 'MINOR'] },
          summary: { type: 'string' },
          attachesTo: { type: 'string', description: 'requirement/file the finding attaches to' },
          proposedText: { type: 'string', description: 'paste-ready OpenSpec delta text, if any' },
        },
        required: ['severity', 'summary'],
      },
    },
  },
  required: ['verdict', 'findings'],
}
const ENTRY = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['brownfield', 'greenfield', 'specced'] },
    unspeccedCapabilities: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
  },
  required: ['mode', 'evidence'],
}
const AUTHORED = {
  type: 'object',
  properties: {
    changeIds: { type: 'array', items: { type: 'string' } },
    filesWritten: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['changeIds'],
}
const STATUS = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['PASS', 'BLOCKED'] },
    notes: { type: 'string' },
  },
  required: ['status', 'notes'],
}
const QA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['SHIP', 'RETURN_TO_DEV', 'BLOCKED'] },
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary'],
}

const fmtFindings = (label, r) =>
  `### ${label} (verdict: ${r.verdict})\n` +
  (r.findings.length
    ? r.findings.map(f => `- [${f.severity}] ${f.summary}${f.attachesTo ? ` (attaches to: ${f.attachesTo})` : ''}${f.proposedText ? `\n  Proposed text:\n${f.proposedText}` : ''}`).join('\n')
    : '- no findings')

// ---------- Phase 0: Entry ----------
phase('Entry')
let entry
if (a.entryMode) {
  entry = { mode: a.entryMode, unspeccedCapabilities: a.capabilities || [], evidence: 'forced by args.entryMode' }
} else {
  entry = await agent(
    `Assess this repository's OpenSpec starting state.\n${CTX}\n` +
    `Determine: "greenfield" (no meaningful application code exists yet), "brownfield" (code exists but openspec/specs/ does not cover the capabilities this work will touch — list them), or "specced" (openspec/specs/ already covers the affected capabilities). ` +
    `Check for an openspec/ directory, read openspec/specs/ contents if present, and skim the codebase surface. Report your evidence.`,
    { label: 'entry-scout', phase: 'Entry', schema: ENTRY, effort: 'low' }
  )
  if (!entry) throw new Error('entry scout failed')
}
log(`Entry mode: ${entry.mode} — ${entry.evidence}`)

let analysis = null
if (entry.mode === 'brownfield' && (entry.unspeccedCapabilities || []).length) {
  const retro = await agent(
    `Retrofit baseline OpenSpec specs for these capabilities of the existing codebase: ${entry.unspeccedCapabilities.join(', ')}.\n${CTX}\n` +
    `Follow your brownfield method: code is the spec; write full baseline specs to openspec/specs/<capability>/spec.md; flag suspected defects, never canonize or fix them. If the openspec CLI is missing, install and configure it per your bootstrap procedure (manual scaffold only if install fails); scaffold openspec/ if absent. Return your full report.`,
    { label: 'brownfield-retrofit', phase: 'Entry', agentType: 'openspec-brownfield' }
  )
  if (!retro) throw new Error('brownfield retrofit failed')
  log('Baseline specs retrofitted — adversarial baseline audit next')
  // the adversary runs on every spec this team produces — baselines included
  const baselineAudit = await agent(
    `BASELINE MODE adversarial audit. Audit the retrofitted baseline specs for capabilities [${entry.unspeccedCapabilities.join(', ')}] under openspec/specs/ against the CODEBASE as the source of truth: sample every requirement against the code that supposedly backs it, and sweep the code surface for observable behaviors (especially error paths and enforced constraints) the specs omit. Retrofit report for context:\n${retro}\n\nHold your finding quality bar; "no material findings" is a valid result.`,
    { label: 'adversary:baseline', phase: 'Entry', agentType: 'openspec-adversary', schema: FINDINGS }
  )
  const baselineMaterial = baselineAudit ? baselineAudit.findings.filter(f => f.severity !== 'MINOR') : []
  if (baselineMaterial.length) {
    log(`Baseline audit: ${baselineMaterial.length} material finding(s) — routing back to brownfield agent`)
    await agent(
      `Fix these adversary findings in your retrofitted baseline specs (openspec/specs/) — correct the specs to match the CODE, never the code to match the specs. Exactly these findings, nothing else:\n\n${fmtFindings('baseline-audit', { verdict: 'NEEDS REVISION', findings: baselineMaterial })}`,
      { label: 'brownfield-repair', phase: 'Entry', agentType: 'openspec-brownfield' }
    )
  } else {
    log('Baseline audit clean')
  }
} else if (entry.mode === 'greenfield') {
  analysis = await agent(
    `Bootstrap OpenSpec for a net-new app.\n${CTX}\n` +
    `Follow your greenfield method: install and configure the openspec CLI per your bootstrap procedure if it is missing, scaffold openspec/, write project.md, draw the MVP line (IN/NEXT/OUT), propose the walking-skeleton-first change sequence, and produce the first-change analysis (draft requirements + scenario sketches, INFERRED marked, open questions listed). Return the full analysis — it replaces the design analyst for this run.`,
    { label: 'greenfield-bootstrap', phase: 'Entry', agentType: 'openspec-greenfield' }
  )
  if (!analysis) throw new Error('greenfield bootstrap failed')
}

// ---------- Phase 1: Analyze ----------
phase('Analyze')
if (!analysis) {
  analysis = await agent(
    `Decompose this design input into OpenSpec material.\n${CTX}\n` +
    `Follow your five-pass method. Deliver the full analysis: capability map (new vs delta with existing-requirement quotes), classified requirements with draft scenarios (INFERRED marked), design-decision candidates, ambiguity triage, out-of-scope list, proposed change structure with IDs.`,
    { label: 'design-analyst', phase: 'Analyze', agentType: 'openspec-design-analyst' }
  )
  if (!analysis) throw new Error('design analysis failed')
}

// ---------- Phase 1: Author ----------
phase('Author')
const authored = await agent(
  `Author the OpenSpec change(s) from this analysis.\n${CTX}\n\n## Analysis\n${analysis}\n\n` +
  `Write proposal.md, spec deltas, tasks.md (and design.md only if warranted) under openspec/changes/<change-id>/ in exact OpenSpec format. Run openspec validate <id> --strict if the CLI is available and fix what it reports. Open questions from the analysis go into design.md/proposal verbatim — never answered by fiat.`,
  { label: 'spec-writer', phase: 'Author', agentType: 'openspec-spec-writer', schema: AUTHORED }
)
if (!authored || !authored.changeIds.length) throw new Error('spec writer produced no change')
const changeIds = authored.changeIds
log(`Authored change(s): ${changeIds.join(', ')}`)

// ---------- Phase 1: Panel (parallel, read-only) ----------
phase('Panel')
const PANEL = [
  { key: 'architect', type: 'openspec-architect', task: 'Review capability boundaries and feasibility; author design.md where warranted (you own it). Report findings the spec writer must apply to deltas/proposal.' },
  { key: 'ux', type: 'openspec-ux', task: 'UX-review the change per your method. If there is no user-facing surface, say so in one line.' },
  { key: 'security', type: 'openspec-security', task: 'Spec-phase threat model per your method. If there is no security surface, say so in one line.' },
  { key: 'reliability', type: 'openspec-reliability', task: 'Reliability-review per your method. Calibrate to blast radius; "low reliability surface" is a valid result.' },
  { key: 'dba', type: 'openspec-dba', task: 'Data review per your method. If the change touches no persistent data, say so in one line.' },
]
const panelResults = []
for (const changeId of changeIds) {
  const reviews = await parallel(PANEL.map(p => () =>
    agent(
      `${p.task}\n${CTX}\nChange folder: openspec/changes/${changeId}/ — read all of it, plus existing openspec/specs/ for affected capabilities. Return severity-ranked findings with paste-ready OpenSpec delta text where applicable.`,
      { label: `panel:${p.key}:${changeId}`, phase: 'Panel', agentType: p.type, schema: FINDINGS }
    ).then(r => r && { key: p.key, ...r })
  ))
  panelResults.push({ changeId, reviews: reviews.filter(Boolean) })
}

// consolidated revision pass per change (single writer pass; writer dedupes)
for (const { changeId, reviews } of panelResults) {
  const total = reviews.reduce((n, r) => n + r.findings.length, 0)
  log(`Panel on ${changeId}: ${total} finding(s) across ${reviews.length} reviewer(s)`)
  if (!total) continue
  const body = reviews.map(r => fmtFindings(r.key, r)).join('\n\n')
  await agent(
    `Revise openspec/changes/${changeId}/ applying this consolidated specialist-panel feedback. Dedupe overlapping findings. Tie-breaks: architect wins on technical shape, security on controls, dba on data-integrity mechanics, ux on user-observable behavior. Note any finding you dispute rather than silently ignoring it. Keep unrelated content untouched.\n${CTX}\n\n${body}`,
    { label: `revise:${changeId}`, phase: 'Panel', agentType: 'openspec-spec-writer' }
  )
}

// ---------- Phase 1: Harden (validate + adversary loop) ----------
phase('Harden')
const hardenReports = []
for (const changeId of changeIds) {
  let adversaryOpen = []
  let validation = null
  for (let round = 1; round <= 3; round++) {
    validation = await agent(
      `Validate openspec/changes/${changeId}/ per your procedure (openspec validate ${changeId} --strict when available, plus the manual checklist). Fix mechanical violations; report blocking content gaps.`,
      { label: `validate:${changeId}:r${round}`, phase: 'Harden', agentType: 'openspec-validator', schema: STATUS }
    )
    if (!validation || validation.status === 'BLOCKED') {
      await agent(
        `The validator found blocking content gaps in openspec/changes/${changeId}/ — fix them:\n${validation ? validation.notes : 'validator failed; re-check the change folder against conventions'}\n${CTX}`,
        { label: `unblock:${changeId}:r${round}`, phase: 'Harden', agentType: 'openspec-spec-writer' }
      )
      continue
    }
    const attack = await agent(
      `Adversarially review openspec/changes/${changeId}/ against the original design input.\n${CTX}\n` +
      `Run your five attacks; hold the finding quality bar (location, exploit, severity, smallest fix). Round ${round}: ${round > 1 ? 'verify prior findings were actually fixed, then spot-check only revised areas.' : 'full review.'} No padding — "no material findings" is a valid result.`,
      { label: `adversary:${changeId}:r${round}`, phase: 'Harden', agentType: 'openspec-adversary', schema: FINDINGS }
    )
    const material = attack ? attack.findings.filter(f => f.severity !== 'MINOR') : []
    log(`Adversary round ${round} on ${changeId}: ${material.length} material finding(s)`)
    if (!material.length) { adversaryOpen = []; break }
    adversaryOpen = material
    if (round === 3) break
    await agent(
      `Fix these confirmed adversary findings in openspec/changes/${changeId}/ — exactly these, nothing else. Note any you dispute.\n${CTX}\n\n${fmtFindings('adversary', { verdict: 'NEEDS REVISION', findings: material })}`,
      { label: `repair:${changeId}:r${round}`, phase: 'Harden', agentType: 'openspec-spec-writer' }
    )
  }
  hardenReports.push({
    changeId,
    validation: validation ? validation.status : 'UNKNOWN',
    openFindings: adversaryOpen.map(f => `[${f.severity}] ${f.summary}`),
  })
}

// ---------- Phase 2: Implement (TDD) — only with implement:true ----------
const implReports = []
if (a.implement === true) {
  for (const changeId of changeIds) {
    phase('Implement')
    const kickoff = await agent(
      `Implementation kickoff for openspec/changes/${changeId}/: task-to-component mapping (Next.js vs Go vs shared contract), API contract finalized FIRST, work ordering. The SDET writes the failing acceptance suite before developers start — your output feeds the SDET first.\n${CTX}`,
      { label: `kickoff:${changeId}`, phase: 'Implement', agentType: 'openspec-architect' }
    )
    const red = await agent(
      `TDD RED phase for openspec/changes/${changeId}/: write the automated tests FIRST from every scenario and the contract (no production code exists for this change yet). Confirm each new test fails for the right reason. Deliver the red handoff per your protocol.\n\n## Architect kickoff\n${kickoff || '(kickoff unavailable — derive the contract from design.md)'}\n${CTX}`,
      { label: `sdet-red:${changeId}`, phase: 'Implement', agentType: 'openspec-sdet', schema: STATUS }
    )
    if (!red || red.status === 'BLOCKED') {
      implReports.push({ changeId, stage: 'red', status: 'BLOCKED', notes: red ? red.notes : 'sdet failed' })
      continue
    }
    // devs run sequentially: both edit tasks.md, and Go usually owns the contract the UI consumes
    for (const dev of [
      { key: 'golang', type: 'openspec-golang-dev', scope: 'backend/Go' },
      { key: 'nextjs', type: 'openspec-nextjs-dev', scope: 'frontend/Next.js' },
    ]) {
      await agent(
        `TDD GREEN phase for openspec/changes/${changeId}/: execute the ${dev.scope} tasks in tasks.md by making the SDET's failing tests pass. You never edit tests — file test disputes instead. Spec-first is absolute: only edit what a task demands, within the change's stated Impact — report (never make) adjacent fixes, refactors, or drift you notice. Check off completed tasks. If no ${dev.scope} tasks exist, report that and stop.\n\n## Architect kickoff\n${kickoff || ''}\n${CTX}`,
        { label: `dev:${dev.key}:${changeId}`, phase: 'Implement', agentType: dev.type }
      )
    }
    phase('Verify')
    const integrity = await agent(
      `Suite-integrity check for openspec/changes/${changeId}/: full suite run (all green expected) and diff test files against your red handoff — any test modified/skipped/deleted since handoff is a BLOCKER reported as false completion. Report per your protocol.`,
      { label: `sdet-integrity:${changeId}`, phase: 'Verify', agentType: 'openspec-sdet', schema: STATUS }
    )
    const [qa, secAudit, dbaAudit] = await parallel([
      () => agent(
        `QA acceptance for openspec/changes/${changeId}/: build the acceptance matrix from every scenario and execute it against the RUNNING system per your method, then the exploratory charters. Verdict: SHIP / RETURN_TO_DEV / BLOCKED with evidence.`,
        { label: `qa:${changeId}`, phase: 'Verify', agentType: 'openspec-qa', schema: QA }
      ),
      () => agent(
        `Implementation-phase security audit for openspec/changes/${changeId}/: verify each security requirement's enforcement point (file:line), deny-path tests, secrets hygiene, dependency check. One line if no surface.`,
        { label: `sec-audit:${changeId}`, phase: 'Verify', agentType: 'openspec-security', schema: FINDINGS }
      ),
      () => agent(
        `Implementation-phase DBA audit for openspec/changes/${changeId}/: migrations vs the approved plan (lock hazards, expand/contract), query patterns, integrity tests against a real database. One line if no persistent data was touched.`,
        { label: `dba-audit:${changeId}`, phase: 'Verify', agentType: 'openspec-dba', schema: FINDINGS }
      ),
    ])
    const auditBlockers = [secAudit, dbaAudit].filter(Boolean)
      .flatMap(r => r.findings.filter(f => f.severity === 'BLOCKER').map(f => f.summary))
    const clean = integrity && integrity.status === 'PASS' && qa && qa.verdict === 'SHIP' && !auditBlockers.length
    let archived = false
    if (clean && a.archive === true) {
      await agent(
        `All gates passed for change ${changeId} (suite integrity clean, QA SHIP, audits clear). Confirm every tasks.md checkbox is checked, then run: openspec archive ${changeId} --yes. Report the result and the resulting openspec/specs/ state.`,
        { label: `archive:${changeId}`, phase: 'Verify', agentType: 'openspec-validator' }
      )
      archived = true
    }
    implReports.push({
      changeId,
      red: red.status,
      integrity: integrity ? integrity.status : 'UNKNOWN',
      qa: qa ? qa.verdict : 'UNKNOWN',
      qaFailures: qa && qa.failures ? qa.failures : [],
      auditBlockers,
      archived,
      readyToArchive: clean && !archived,
    })
  }
} else {
  log('Phase 2 skipped (args.implement !== true) — run stops at the validated spec')
}

return {
  entryMode: entry.mode,
  changeIds,
  openQuestions: authored.openQuestions || [],
  harden: hardenReports,
  implementation: implReports,
  note: a.implement === true
    ? (a.archive === true ? 'archive ran only for fully clean changes' : 'archive NOT run (pass archive:true to enable) — clean changes are marked readyToArchive')
    : 'spec-only run; pass implement:true for Phase 2',
}

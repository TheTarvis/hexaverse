export const meta = {
  name: 'openspec-team',
  description: 'OpenSpec team pipeline: entry-mode routing, spec authoring with parallel specialist panel, validation, adversarial repair loop, optional TDD implementation',
  whenToUse: 'Deterministic multi-agent run of the OpenSpec team. args: { request?: string, designDoc?: string, changeId?: string, entryMode?: "brownfield"|"greenfield"|"specced", capabilities?: string[], implement?: boolean, archive?: boolean, chain?: string (path to a chain doc — implement its links in archive order; implies implement+archive), from?: string (change-id to start the chain at) }',
  phases: [
    { title: 'Entry', detail: 'detect/route starting state (brownfield retrofit or greenfield bootstrap)' },
    { title: 'Analyze', detail: 'design doc → capabilities, requirements, ambiguities' },
    { title: 'Author', detail: 'proposal, spec deltas, tasks.md' },
    { title: 'Panel', detail: 'architect/ux/security/reliability/dba review in parallel' },
    { title: 'Harden', detail: 'strict validation + adversarial repair loop (max 3 rounds)' },
    { title: 'Implement', detail: 'TDD: SDET red suite → devs to green (implement:true only)' },
    { title: 'Verify', detail: 'suite integrity, evidence-based QA matrix, security/dba audits, one batched fix round' },
    { title: 'Journey', detail: 'archive gate: tree locked, one Playwright journey + full backend suite, run once (red → one batched round → one rerun), then archive' },
  ],
}

// ---------- args ----------
const a = args || {}
if (!a.request && !a.designDoc && !a.changeId && !a.chain) {
  throw new Error('openspec-team needs args.request, args.designDoc, args.changeId, or args.chain')
}
const CTX = [
  a.designDoc ? `Design document path: ${a.designDoc} — read it fully; it is the source of truth. Never work from a summary of it.` : '',
  a.request ? `User request: ${a.request}` : '',
  a.changeId ? `Existing change to continue: openspec/changes/${a.changeId}/` : '',
  a.chain ? `Chain document: ${a.chain} — links are implemented in its archive order.` : '',
  'Durable state lives in docs/plans/continous_space/handoffs/ (see docs/plans/continous_space/handoffs/README.md); test tiers and commands come from docs/testing-tiers.md — never from this prompt.',
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
const CHAIN = {
  type: 'object',
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
          archived: { type: 'boolean', description: 'true when the chain doc marks this link done/archived' },
        },
        required: ['changeId', 'archived'],
      },
    },
  },
  required: ['links'],
}
const JOURNEY = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['PASS', 'RED', 'BLOCKED'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['test-side', 'product', 'spec-gap'] },
          owner: { type: 'string', enum: ['sdet', 'golang', 'nextjs', 'writer'] },
          summary: { type: 'string' },
        },
        required: ['kind', 'owner', 'summary'],
      },
    },
    budget: { type: 'string', description: 'suite budget line: tier 3 and tier 4 wall times' },
  },
  required: ['status', 'findings'],
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
if (a.chain) {
  entry = { mode: 'specced', unspeccedCapabilities: [], evidence: 'chain run — links are already authored and hardened' }
} else if (a.entryMode) {
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
if (!analysis && !a.chain) {
  analysis = await agent(
    `Decompose this design input into OpenSpec material.\n${CTX}\n` +
    `Follow your five-pass method. Deliver the full analysis: capability map (new vs delta with existing-requirement quotes), classified requirements with draft scenarios (INFERRED marked), design-decision candidates, ambiguity triage, out-of-scope list, proposed change structure with IDs.`,
    { label: 'design-analyst', phase: 'Analyze', agentType: 'openspec-design-analyst' }
  )
  if (!analysis) throw new Error('design analysis failed')
}

// ---------- Phase 1: Author ----------
phase('Author')
let authored
if (a.chain) {
  const chainDoc = await agent(
    `Read the chain document at ${a.chain}. Return its links in archive order as change-ids (folders under openspec/changes/), each with archived=true when the doc marks it done/archived (an archive commit recorded, a ✅ state, or openspec/changes/archive/ containing it). Do not include downstream/unscheduled changes the doc lists outside the ordered chain table.`,
    { label: 'chain-reader', phase: 'Author', schema: CHAIN, effort: 'low' }
  )
  if (!chainDoc || !chainDoc.links.length) throw new Error(`chain doc ${a.chain} yielded no links`)
  let links = chainDoc.links
  if (a.from) {
    const i = links.findIndex(l => l.changeId === a.from)
    if (i < 0) throw new Error(`args.from ${a.from} is not a link in ${a.chain}`)
    links = links.slice(i)
  } else {
    links = links.filter(l => !l.archived)
  }
  if (!links.length) throw new Error('every link in the chain is already archived')
  authored = { changeIds: links.map(l => l.changeId), openQuestions: [] }
  log(`Chain links to run, in order: ${authored.changeIds.join(' → ')}`)
} else {
  authored = await agent(
    `Author the OpenSpec change(s) from this analysis.\n${CTX}\n\n## Analysis\n${analysis}\n\n` +
    `Write proposal.md, spec deltas, tasks.md (and design.md only if warranted) under openspec/changes/<change-id>/ in exact OpenSpec format — tasks.md ends with the standard Verification group from the conventions templates. Run openspec validate <id> --strict if the CLI is available and fix what it reports. Open questions from the analysis go into design.md/proposal verbatim — never answered by fiat.`,
    { label: 'spec-writer', phase: 'Author', agentType: 'openspec-spec-writer', schema: AUTHORED }
  )
  if (!authored || !authored.changeIds.length) throw new Error('spec writer produced no change')
  log(`Authored change(s): ${authored.changeIds.join(', ')}`)
}
const changeIds = authored.changeIds

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
// chain links were panel-reviewed when authored; their currency is checked by diff in Harden
for (const changeId of (a.chain ? [] : changeIds)) {
  const reviews = await parallel(PANEL.map(p => () =>
    agent(
      `${p.task}\n${CTX}\nChange folder: openspec/changes/${changeId}/ — read all of it, plus existing openspec/specs/ for affected capabilities. Return severity-ranked findings with paste-ready OpenSpec delta text where applicable.`,
      { label: `panel:${p.key}:${changeId}`, phase: 'Panel', agentType: p.type, schema: FINDINGS }
    ).then(r => r && { key: p.key, ...r })
  ))
  panelResults.push({ changeId, reviews: reviews.filter(Boolean) })
  // persist every reviewer's own report: consolidation silently discards findings
  await agent(
    `Write each of these reviewer reports verbatim to docs/plans/continous_space/handoffs/${changeId}-panel-<reviewer>.md (one file per reviewer; create docs/plans/continous_space/handoffs/ if absent). Do not summarize or merge.\n\n${reviews.filter(Boolean).map(r => fmtFindings(r.key, r)).join('\n\n')}`,
    { label: `persist-panel:${changeId}`, phase: 'Panel', effort: 'low' }
  )
}

// consolidated revision pass per change (single writer pass; writer dedupes)
for (const { changeId, reviews } of panelResults) {
  const total = reviews.reduce((n, r) => n + r.findings.length, 0)
  log(`Panel on ${changeId}: ${total} finding(s) across ${reviews.length} reviewer(s)`)
  if (!total) continue
  const body = reviews.map(r => fmtFindings(r.key, r)).join('\n\n')
  await agent(
    `Revise openspec/changes/${changeId}/ applying this consolidated specialist-panel feedback. Dedupe overlapping findings. Tie-breaks: architect wins on technical shape, security on controls, dba on data-integrity mechanics, ux on user-observable behavior. Note any finding you dispute rather than silently ignoring it. Keep unrelated content untouched. First write the consolidated set — every accepted finding restated in full — to docs/plans/continous_space/handoffs/${changeId}-panel-consolidated.md.\n${CTX}\n\n${body}`,
    { label: `revise:${changeId}`, phase: 'Panel', agentType: 'openspec-spec-writer' }
  )
}

// ---------- Phase 1: Harden (validate + adversary loop) ----------
phase('Harden')
const hardenReports = []
for (const changeId of changeIds) {
  let adversaryOpen = []
  let validation = null
  if (a.chain) {
    // Verdict currency by diff, not a full re-attack: the previous link's archive is the usual expirer.
    const check = await agent(
      `Verdict currency check for openspec/changes/${changeId}/. Find the latest docs/plans/continous_space/handoffs/${changeId}-adversary-r<N>.md and the verdict commit it records. Run: git diff <that-sha> -- openspec/specs/<every capability this change touches> openspec/changes/${changeId}. Empty diff → verdict is current: return "CURRENT" with no findings. Otherwise re-attack ONLY the clauses whose live targets or delta text changed (plus verify prior findings stayed fixed), hold your finding quality bar, and record this round as the next docs/plans/continous_space/handoffs/${changeId}-adversary-r<N+1>.md with today's HEAD as the verdict commit. If no adversary file exists, say so and run a full review.\n${CTX}`,
      { label: `verdict-check:${changeId}`, phase: 'Harden', agentType: 'openspec-adversary', schema: FINDINGS }
    )
    let material = check ? check.findings.filter(f => f.severity !== 'MINOR') : []
    if (material.length) {
      log(`Verdict expired on ${changeId}: ${material.length} material finding(s) in the diff`)
      await agent(
        `Fix these adversary findings in openspec/changes/${changeId}/ — exactly these, nothing else. Note any you dispute.\n${CTX}\n\n${fmtFindings('adversary', { verdict: 'NEEDS REVISION', findings: material })}`,
        { label: `repair:${changeId}:chain`, phase: 'Harden', agentType: 'openspec-spec-writer' }
      )
      const re = await agent(
        `Verify these findings were fixed in openspec/changes/${changeId}/ and spot-check only the revised clauses. Record the round in docs/plans/continous_space/handoffs/${changeId}-adversary-r<N+1>.md with HEAD as the verdict commit.\n\n${fmtFindings('prior-round', { verdict: 'NEEDS REVISION', findings: material })}`,
        { label: `re-verify:${changeId}:chain`, phase: 'Harden', agentType: 'openspec-adversary', schema: FINDINGS }
      )
      material = re ? re.findings.filter(f => f.severity !== 'MINOR') : material
    }
    adversaryOpen = material
    hardenReports.push({ changeId, validation: 'CHAIN (verdict checked by diff)', openFindings: adversaryOpen.map(f => `[${f.severity}] ${f.summary}`) })
    continue
  }
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
      `Run your five attacks; hold the finding quality bar (location, exploit, severity, smallest fix). Round ${round}: ${round > 1 ? 'verify prior findings were actually fixed, then spot-check only revised areas.' : 'full review.'} No padding — "no material findings" is a valid result. Write the round, with the current HEAD commit as the verdict commit, to docs/plans/continous_space/handoffs/${changeId}-adversary-r${round}.md.`,
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

// ---------- Phase 2: Implement (TDD) — implement:true, or any chain run ----------
const implement = a.implement === true || !!a.chain
const doArchive = a.archive === true || !!a.chain
const DEVS = [
  { key: 'golang', type: 'openspec-golang-dev', scope: 'backend/Go' },
  { key: 'nextjs', type: 'openspec-nextjs-dev', scope: 'frontend/Next.js' },
]
const implReports = []
if (implement) {
  for (const changeId of changeIds) {
    if (a.chain && hardenReports.find(r => r.changeId === changeId && r.openFindings.some(f => f.startsWith('[BLOCKER]')))) {
      log(`Chain stopped before ${changeId}: open BLOCKER after verdict check`)
      implReports.push({ changeId, stage: 'harden', status: 'BLOCKED', notes: 'open BLOCKER after chain verdict check' })
      break
    }
    phase('Implement')
    const kickoff = await agent(
      `Implementation kickoff for openspec/changes/${changeId}/: task-to-component mapping (Next.js vs Go vs shared contract), API contract finalized FIRST, work ordering. Write the settled contract to docs/plans/continous_space/handoffs/${changeId}-impl-contract.md — the SDET writes the failing suite against it before developers start.\n${CTX}`,
      { label: `kickoff:${changeId}`, phase: 'Implement', agentType: 'openspec-architect' }
    )
    const red = await agent(
      `TDD RED phase for openspec/changes/${changeId}/: write the automated tests FIRST from every scenario and the contract in docs/plans/continous_space/handoffs/${changeId}-impl-contract.md — UNIT AND INTEGRATION LEVEL ONLY: no Playwright, no router-level e2e; end-to-end-only scenarios are recorded "Playwright, deferred". Confirm each new test fails for the right reason. Write the coverage table to docs/plans/continous_space/handoffs/${changeId}-red-coverage.md and record the red manifest before returning. Deliver the red handoff per your protocol.\n\n## Architect kickoff\n${kickoff || '(kickoff unavailable — derive the contract from design.md)'}\n${CTX}`,
      { label: `sdet-red:${changeId}`, phase: 'Implement', agentType: 'openspec-sdet', schema: STATUS }
    )
    if (!red || red.status === 'BLOCKED') {
      implReports.push({ changeId, stage: 'red', status: 'BLOCKED', notes: red ? red.notes : 'sdet failed' })
      if (a.chain) break
      continue
    }
    // devs run sequentially: both edit tasks.md, and Go usually owns the contract the UI consumes
    for (const dev of DEVS) {
      await agent(
        `TDD GREEN phase for openspec/changes/${changeId}/: execute the ${dev.scope} tasks in tasks.md by making the SDET's failing tests pass. You never edit tests — file test disputes instead. Your per-task gate is tier 1 (and tier 2 for persistence work) per docs/testing-tiers.md — never the full emulator suite, never Playwright; those run once at the journey. Spec-first is absolute: only edit what a task demands, within the change's stated Impact — report (never make) adjacent fixes, refactors, or drift you notice. Check off completed tasks. If no ${dev.scope} tasks exist, report that and stop.\n\n## Architect kickoff\n${kickoff || ''}\n${CTX}`,
        { label: `dev:${dev.key}:${changeId}`, phase: 'Implement', agentType: dev.type }
      )
    }
    phase('Verify')
    const integrity = await agent(
      `Suite-integrity check for openspec/changes/${changeId}/: run the red suite at its own tiers (tier 1 and tier 2 only — never tier 3 or 4, per docs/testing-tiers.md), then bash .claude/scripts/openspec-red-manifest.sh verify ${changeId} — any test modified/skipped/deleted since handoff is a BLOCKER reported as false completion. Report per your protocol.`,
      { label: `sdet-integrity:${changeId}`, phase: 'Verify', agentType: 'openspec-sdet', schema: STATUS }
    )
    const qaPrompt = (extra) =>
      `QA acceptance for openspec/changes/${changeId}/: build the acceptance matrix from every scenario and verify it against test evidence first (docs/plans/continous_space/handoffs/${changeId}-red-coverage.md), driving the running system only for rows evidence cannot reach and for the exploratory charters. Rows marked "Playwright, deferred" are BLOCKED awaiting the journey — not failures. Never run tier 3 or tier 4. ${extra}Verdict: SHIP / RETURN_TO_DEV / BLOCKED with evidence; SHIP is valid with only journey-awaiting BLOCKED rows.`
    let [qa, secAudit, dbaAudit] = await parallel([
      () => agent(qaPrompt(''), { label: `qa:${changeId}`, phase: 'Verify', agentType: 'openspec-qa', schema: QA }),
      () => agent(
        `Implementation-phase security audit for openspec/changes/${changeId}/: verify each security requirement's enforcement point (file:line), deny-path tests, secrets hygiene, dependency check. One line if no surface.`,
        { label: `sec-audit:${changeId}`, phase: 'Verify', agentType: 'openspec-security', schema: FINDINGS }
      ),
      () => agent(
        `Implementation-phase DBA audit for openspec/changes/${changeId}/: migrations/collection changes vs the approved plan, query patterns, integrity tests against the real emulator. One line if no persistent data was touched.`,
        { label: `dba-audit:${changeId}`, phase: 'Verify', agentType: 'openspec-dba', schema: FINDINGS }
      ),
    ])
    // ONE batched fix round on QA failures, then ONE re-verification — never a loop per failure
    if (qa && qa.verdict === 'RETURN_TO_DEV' && (qa.failures || []).length) {
      const list = qa.failures.map(f => `- ${f}`).join('\n')
      for (const dev of DEVS) {
        await agent(
          `Batched fix round for openspec/changes/${changeId}/. QA returned these failures (repro verbatim); fix every one in your ${dev.scope} scope, per the spec, never by editing a test. Report what was not yours.\n${list}\n${CTX}`,
          { label: `fix:${dev.key}:${changeId}`, phase: 'Verify', agentType: dev.type }
        )
      }
      qa = await agent(qaPrompt(`This is the single re-verification: re-run the previously FAILED rows and their capability siblings; spot-check distant PASSes. Previous failures:\n${list}\n`), { label: `qa-reverify:${changeId}`, phase: 'Verify', agentType: 'openspec-qa', schema: QA })
    }
    const auditBlockers = [secAudit, dbaAudit].filter(Boolean)
      .flatMap(r => r.findings.filter(f => f.severity === 'BLOCKER').map(f => f.summary))
    const preJourneyClean = integrity && integrity.status === 'PASS' && qa && qa.verdict === 'SHIP' && !auditBlockers.length

    // ---------- Journey: the archive gate, run once ----------
    let journey = null
    if (preJourneyClean) {
      phase('Journey')
      const journeyPrompt = (extra) =>
        `Journey (archive gate) for openspec/changes/${changeId}/. Every task is checked and the tree is LOCKED — no other agent runs until you return, so do not wait for anyone. ${extra}Run tier 4 (the one Playwright journey for this change) then tier 3 (full backend suite) ONCE each per docs/testing-tiers.md, backgrounded with logs, never concurrently. Never raise a timeout. Return PASS, or RED with EVERY finding from the run labelled test-side / product / spec-gap with an owner (sdet / golang / nextjs / writer), or BLOCKED. Write docs/plans/continous_space/handoffs/${changeId}-journey.md with the outcome and the suite budget line.`
      journey = await agent(
        journeyPrompt(`First write the journey spec against the UI that now exists (one spec per change, asserting at every step; fixtures shared per spec file), plus any router-level e2e the coverage table deferred. `),
        { label: `journey:${changeId}`, phase: 'Journey', agentType: 'openspec-sdet', schema: JOURNEY }
      )
      if (journey && journey.status === 'RED' && journey.findings.length) {
        log(`Journey red on ${changeId}: ${journey.findings.length} finding(s) — one batched revision round`)
        const gaps = journey.findings.filter(f => f.kind === 'spec-gap')
        if (gaps.length) {
          await agent(
            `Spec gaps surfaced by the journey run for openspec/changes/${changeId}/ — repair exactly these in the deltas (a clause naming a window names every way the window ends), nothing else:\n${gaps.map(g => `- ${g.summary}`).join('\n')}\n${CTX}`,
            { label: `journey-writer:${changeId}`, phase: 'Journey', agentType: 'openspec-spec-writer' }
          )
          await agent(
            `Spot-check ONLY the clauses just revised in openspec/changes/${changeId}/ for these journey-found gaps; record as the next docs/plans/continous_space/handoffs/${changeId}-adversary-r<N>.md with HEAD as the verdict commit:\n${gaps.map(g => `- ${g.summary}`).join('\n')}`,
            { label: `journey-adversary:${changeId}`, phase: 'Journey', agentType: 'openspec-adversary', schema: FINDINGS }
          )
        }
        for (const dev of DEVS) {
          const mine = journey.findings.filter(f => f.kind === 'product' && f.owner === dev.key)
          if (!mine.length) continue
          await agent(
            `Batched journey fix round for openspec/changes/${changeId}/ (${dev.scope}). Fix every one of these product defects per the spec (re-read any delta the writer just revised); never edit a test; tier 1/2 gate only:\n${mine.map(f => `- ${f.summary}`).join('\n')}\n${CTX}`,
            { label: `journey-fix:${dev.key}:${changeId}`, phase: 'Journey', agentType: dev.type }
          )
        }
        journey = await agent(
          journeyPrompt(`This is the single rerun after the batched round — the FINAL run. First fix the test-side findings you reported (${journey.findings.filter(f => f.kind === 'test-side').map(f => f.summary).join('; ') || 'none'}), then `),
          { label: `journey-rerun:${changeId}`, phase: 'Journey', agentType: 'openspec-sdet', schema: JOURNEY }
        )
      }
    }
    const clean = preJourneyClean && !!journey && journey.status === 'PASS'
    let archived = false
    if (clean && doArchive) {
      await agent(
        `All gates passed for change ${changeId} (integrity clean, QA SHIP, audits clear, journey PASS). Confirm every tasks.md checkbox is checked, run python3 .claude/scripts/openspec-reconcile.py ${changeId} (must exit 0), then: openspec archive ${changeId} --yes. Report the result and the resulting openspec/specs/ state.`,
        { label: `archive:${changeId}`, phase: 'Journey', agentType: 'openspec-validator' }
      )
      archived = true
      if (a.chain) {
        await agent(
          `Update the chain document ${a.chain}: mark ${changeId} archived with the archive commit hash (git log -1 --format=%h), and add what the link taught (from docs/plans/continous_space/handoffs/${changeId}-journey.md and its latest adversary round) to its section. Change nothing else.`,
          { label: `chain-update:${changeId}`, phase: 'Journey', effort: 'low' }
        )
      }
    }
    implReports.push({
      changeId,
      red: red.status,
      integrity: integrity ? integrity.status : 'UNKNOWN',
      qa: qa ? qa.verdict : 'UNKNOWN',
      qaFailures: qa && qa.failures ? qa.failures : [],
      auditBlockers,
      journey: journey ? journey.status : 'NOT RUN',
      journeyFindings: journey ? journey.findings.map(f => `[${f.kind}/${f.owner}] ${f.summary}`) : [],
      budget: journey ? journey.budget : undefined,
      archived,
      readyToArchive: clean && !archived,
    })
    if (a.chain && !clean) {
      log(`Chain stopped at ${changeId}: gate not clean`)
      break
    }
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
  note: a.chain
    ? 'chain run: each link implemented, journeyed, and archived in order; stopped at the first link whose gate was not clean'
    : implement
      ? (doArchive ? 'archive ran only for fully clean changes' : 'archive NOT run (pass archive:true to enable) — clean changes are marked readyToArchive')
      : 'spec-only run; pass implement:true for Phase 2',
}

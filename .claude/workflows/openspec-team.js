export const meta = {
  name: 'openspec-team',
  description: 'OpenSpec team pipeline: entry-mode routing, spec authoring with parallel specialist panel, validation, adversarial repair loop, optional TDD implementation',
  whenToUse: 'Deterministic multi-agent run of the OpenSpec team. args: { request?: string, designDoc?: string, changeId?: string, entryMode?: "brownfield"|"greenfield"|"specced", capabilities?: string[], implement?: boolean, archive?: boolean, chain?: string (path to a chain doc — implement its links in archive order; implies implement+archive), from?: string (change-id to start the chain at), fullAuto?: boolean (lift every user gate: author unauthored chain links in-run, rule on design-choice open questions from the recorded recommendations, implement, archive, continue; hard-stops only on questions nobody in the repo can answer, BLOCKER residue, or a red gate) }',
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
const fullAuto = a.fullAuto === true
const CTX = [
  a.designDoc ? `Design document path: ${a.designDoc} — read it fully; it is the source of truth. Never work from a summary of it.` : '',
  a.request ? `User request: ${a.request}` : '',
  a.changeId ? `Existing change to continue: openspec/changes/${a.changeId}/` : '',
  a.chain ? `Chain document: ${a.chain} — links are implemented in its archive order.` : '',
  fullAuto ? 'FULL-AUTO run: there is no user gate anywhere in this run. Design-choice open questions are ruled in-run (the ruling step records each one in docs/handoffs/<id>-rulings.md as a FULL-AUTO RULING with its basis, the alternatives, and the reversal cost) and the writer applies the rulings; a question that needs information nobody in the repo has — a credential, an external account, a product call with no recorded lean — is a hard stop, never a guess.' : '',
  'Durable state lives in docs/handoffs/ (see docs/handoffs/README.md); test tiers and commands come from docs/testing-tiers.md — never from this prompt.',
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
          authored: { type: 'boolean', description: 'true when openspec/changes/<changeId>/ exists (or the link is archived)' },
        },
        required: ['changeId', 'archived', 'authored'],
      },
    },
  },
  required: ['links'],
}
const RULINGS = {
  type: 'object',
  properties: {
    rulings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          ruling: { type: 'string' },
          basis: { type: 'string', enum: ['chain-doc', 'project-decision', 'panel', 'most-reversible'] },
          reversalCost: { type: 'string' },
        },
        required: ['question', 'ruling', 'basis'],
      },
    },
    hardStops: { type: 'array', items: { type: 'string' }, description: 'questions that need information nobody in the repo has — each one halts a full-auto run' },
  },
  required: ['rulings', 'hardStops'],
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
  entry = { mode: 'specced', unspeccedCapabilities: [], evidence: fullAuto ? 'chain run (full-auto) — unauthored links are authored in-run against the archived predecessors\' specs' : 'chain run — links are already authored and hardened' }
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
    `Follow your greenfield method: install and configure the openspec CLI per your bootstrap procedure if it is missing, scaffold openspec/, write project.md, draw the MVP line (IN/NEXT/OUT), propose the walking-skeleton-first change sequence, and produce the first-change analysis (draft requirements + scenario sketches, INFERRED marked, open questions listed). Return the full analysis — it replaces the design analyst for this run.${fullAuto ? ' FULL-AUTO: nobody confirms the MVP line — draw it from the design input\'s own stated scope and say where you drew it.' : ''}`,
    { label: 'greenfield-bootstrap', phase: 'Entry', agentType: 'openspec-greenfield' }
  )
  if (!analysis) throw new Error('greenfield bootstrap failed')
}

// ---------- Phase 1 stages, as functions: a chain link runs them per link ----------
async function analyze(input, label) {
  phase('Analyze')
  const result = await agent(
    `Decompose this design input into OpenSpec material.\n${CTX}\n${input ? `${input}\n` : ''}` +
    `Follow your five-pass method. Deliver the full analysis: capability map (new vs delta with existing-requirement quotes), classified requirements with draft scenarios (INFERRED marked), design-decision candidates, ambiguity triage, out-of-scope list, proposed change structure with IDs.`,
    { label, phase: 'Analyze', agentType: 'openspec-design-analyst' }
  )
  if (!result) throw new Error('design analysis failed')
  return result
}

// full-auto only: rule on the design-choice open questions before the writer sees them; hard stops halt the run
async function rule(changeId, source, label) {
  const r = await agent(
    `FULL-AUTO ruling step for ${changeId}. Below is the material the spec writer is about to author from. Extract every open question / ambiguity / INFERRED item that needs a decision and rule on each, using this precedence and naming which one applied: (1) the chain document's or design input's own recorded recommendation or lean; (2) a settled project decision in the root CLAUDE.md or openspec/project.md; (3) the specialist panel's recommendation if one is quoted; (4) otherwise the most reversible option — the one whose reversal is one migration, one flag, or one file, with no backfill. A question that needs information nobody in the repo has (a credential, an external account, a product call with no recorded lean) goes in hardStops, not rulings. Write every ruling to docs/handoffs/${changeId}-rulings.md (append if it exists) as a "FULL-AUTO RULING" entry: the question, the ruling, its basis, the alternatives rejected, and the reversal cost.\n${CTX}\n\n## Material\n${source}`,
    { label, phase: 'Analyze', schema: RULINGS }
  )
  if (!r) throw new Error(`ruling step failed for ${changeId}`)
  log(`Full-auto rulings for ${changeId}: ${r.rulings.length} ruled, ${r.hardStops.length} hard stop(s)`)
  return r
}

async function author(analysisText, fixedId, label) {
  phase('Author')
  const idClause = fixedId
    ? `Author exactly the change-id ${fixedId} (openspec/changes/${fixedId}/) — it is a chain link and its id is fixed. Its MODIFIED deltas target the live openspec/specs/ the archived predecessor links produced. If the 20–40 task size cap forces a split, ${fixedId} keeps the first, self-contained half; name the second half verb-led, author it too, and insert its row in the chain document ${a.chain} immediately after ${fixedId}'s row with state "authored". Return every change-id you authored, ${fixedId} first. `
    : ''
  const questionClause = fullAuto
    ? `Open questions that docs/handoffs/${fixedId || '<change-id>'}-rulings.md rules on are written as decisions citing the ruling (design.md ## Decisions, or the proposal); any question it does not rule on goes into design.md ## Open Questions verbatim — never answered by fiat.`
    : 'Open questions from the analysis go into design.md/proposal verbatim — never answered by fiat.'
  const result = await agent(
    `Author the OpenSpec change(s) from this analysis.\n${CTX}\n\n## Analysis\n${analysisText}\n\n` +
    `${idClause}Write proposal.md, spec deltas, tasks.md (and design.md only if warranted) under openspec/changes/<change-id>/ in exact OpenSpec format — tasks.md ends with the standard Verification group from the conventions templates. Run openspec validate <id> --strict if the CLI is available and fix what it reports. ${questionClause}`,
    { label, phase: 'Author', agentType: 'openspec-spec-writer', schema: AUTHORED }
  )
  if (!result || !result.changeIds.length) throw new Error('spec writer produced no change')
  log(`Authored change(s): ${result.changeIds.join(', ')}`)
  return result
}

const PANEL = [
  { key: 'architect', type: 'openspec-architect', task: 'Review capability boundaries and feasibility; author design.md where warranted (you own it). Report findings the spec writer must apply to deltas/proposal.' },
  { key: 'ux', type: 'openspec-ux', task: 'UX-review the change per your method. If there is no user-facing surface, say so in one line.' },
  { key: 'security', type: 'openspec-security', task: 'Spec-phase threat model per your method. If there is no security surface, say so in one line.' },
  { key: 'reliability', type: 'openspec-reliability', task: 'Reliability-review per your method. Calibrate to blast radius; "low reliability surface" is a valid result.' },
  { key: 'dba', type: 'openspec-dba', task: 'Data review per your method. If the change touches no persistent data, say so in one line.' },
]

async function panel(changeId) {
  phase('Panel')
  const reviews = (await parallel(PANEL.map(p => () =>
    agent(
      `${p.task}\n${CTX}\nChange folder: openspec/changes/${changeId}/ — read all of it, plus existing openspec/specs/ for affected capabilities. Return severity-ranked findings with paste-ready OpenSpec delta text where applicable.`,
      { label: `panel:${p.key}:${changeId}`, phase: 'Panel', agentType: p.type, schema: FINDINGS }
    ).then(r => r && { key: p.key, ...r })
  ))).filter(Boolean)
  // persist every reviewer's own report: consolidation silently discards findings
  await agent(
    `Write each of these reviewer reports verbatim to docs/handoffs/${changeId}-panel-<reviewer>.md (one file per reviewer; create docs/handoffs/ if absent). Do not summarize or merge.\n\n${reviews.map(r => fmtFindings(r.key, r)).join('\n\n')}`,
    { label: `persist-panel:${changeId}`, phase: 'Panel', effort: 'low' }
  )
  const total = reviews.reduce((n, r) => n + r.findings.length, 0)
  log(`Panel on ${changeId}: ${total} finding(s) across ${reviews.length} reviewer(s)`)
  if (!total) return
  // consolidated revision pass (single writer pass; writer dedupes)
  const body = reviews.map(r => fmtFindings(r.key, r)).join('\n\n')
  await agent(
    `Revise openspec/changes/${changeId}/ applying this consolidated specialist-panel feedback. Dedupe overlapping findings. Tie-breaks: architect wins on technical shape, security on controls, dba on data-integrity mechanics, ux on user-observable behavior. Note any finding you dispute rather than silently ignoring it. Keep unrelated content untouched. First write the consolidated set — every accepted finding restated in full — to docs/handoffs/${changeId}-panel-consolidated.md.${a.chain ? ` If the accepted findings take tasks.md past 40 tasks, split per the chain doc's pre-identified seam for this link (or the architect's proposed seam): ${changeId} keeps the first half; insert the second half's row in ${a.chain} immediately after, state "authored".` : ''}\n${CTX}\n\n${body}`,
    { label: `revise:${changeId}`, phase: 'Panel', agentType: 'openspec-spec-writer' }
  )
}

// validate + adversary repair loop, max 3 rounds; returns the harden report
async function harden(changeId) {
  phase('Harden')
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
      `Run your five attacks; hold the finding quality bar (location, exploit, severity, smallest fix). Round ${round}: ${round > 1 ? 'verify prior findings were actually fixed, then spot-check only revised areas.' : 'full review.'} No padding — "no material findings" is a valid result. Write the round, with the current HEAD commit as the verdict commit, to docs/handoffs/${changeId}-adversary-r${round}.md.`,
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
  return {
    changeId,
    validation: validation ? validation.status : 'UNKNOWN',
    openFindings: adversaryOpen.map(f => `[${f.severity}] ${f.summary}`),
  }
}

// chain links: verdict currency by diff, not a full re-attack — the previous link's archive is the usual expirer
async function verdictCheck(changeId) {
  phase('Harden')
  const check = await agent(
    `Verdict currency check for openspec/changes/${changeId}/. Find the latest docs/handoffs/${changeId}-adversary-r<N>.md and the verdict commit it records. Run: git diff <that-sha> -- openspec/specs/<every capability this change touches> openspec/changes/${changeId}. Empty diff → verdict is current: return "CURRENT" with no findings. Otherwise re-attack ONLY the clauses whose live targets or delta text changed (plus verify prior findings stayed fixed), hold your finding quality bar, and record this round as the next docs/handoffs/${changeId}-adversary-r<N+1>.md with today's HEAD as the verdict commit. If no adversary file exists, say so and run a full review.\n${CTX}`,
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
      `Verify these findings were fixed in openspec/changes/${changeId}/ and spot-check only the revised clauses. Record the round in docs/handoffs/${changeId}-adversary-r<N+1>.md with HEAD as the verdict commit.\n\n${fmtFindings('prior-round', { verdict: 'NEEDS REVISION', findings: material })}`,
      { label: `re-verify:${changeId}:chain`, phase: 'Harden', agentType: 'openspec-adversary', schema: FINDINGS }
    )
    material = re ? re.findings.filter(f => f.severity !== 'MINOR') : material
  }
  return { changeId, validation: 'CHAIN (verdict checked by diff)', openFindings: material.map(f => `[${f.severity}] ${f.summary}`) }
}

// full-auto chain: an authored link gets a real verdict commit, or the next link's currency diff cannot run
async function markAuthored(changeId) {
  await agent(
    `Link ${changeId} is authored, validated and adversary-cleared. Do exactly this, in order: (1) git commit openspec/changes/${changeId}/ and docs/handoffs/${changeId}-*.md — stage nothing else — as "docs(openspec): author ${changeId} (chain link)"; (2) append to the latest docs/handoffs/${changeId}-adversary-r<N>.md a line "Verdict commit for currency checks: <that commit's short hash> — the tree this verdict describes, committed unchanged"; (3) set ${changeId}'s state in ${a.chain} to "authored r<N> <that hash>"; (4) commit the adversary file and the chain doc as "docs(chain): record ${changeId} authored". Report both hashes.`,
    { label: `chain-mark:${changeId}`, phase: 'Harden', effort: 'low' }
  )
}

// ---------- Phase 2 (per change): kickoff → red → green → verify → journey → archive ----------
const DEVS = [
  { key: 'golang', type: 'openspec-golang-dev', scope: 'backend/Go' },
  { key: 'nextjs', type: 'openspec-nextjs-dev', scope: 'frontend/Next.js' },
]
const doArchive = a.archive === true || !!a.chain

async function implementChange(changeId) {
  phase('Implement')
  const kickoff = await agent(
    `Implementation kickoff for openspec/changes/${changeId}/: task-to-component mapping (Next.js vs Go vs shared contract), API contract finalized FIRST, work ordering. Write the settled contract to docs/handoffs/${changeId}-impl-contract.md — the SDET writes the failing suite against it before developers start.\n${CTX}`,
    { label: `kickoff:${changeId}`, phase: 'Implement', agentType: 'openspec-architect' }
  )
  const red = await agent(
    `TDD RED phase for openspec/changes/${changeId}/: write the automated tests FIRST from every scenario and the contract in docs/handoffs/${changeId}-impl-contract.md — UNIT AND INTEGRATION LEVEL ONLY: no Playwright, no router-level e2e; end-to-end-only scenarios are recorded "Playwright, deferred". Confirm each new test fails for the right reason. Write the coverage table to docs/handoffs/${changeId}-red-coverage.md and record the red manifest before returning. Deliver the red handoff per your protocol.\n\n## Architect kickoff\n${kickoff || '(kickoff unavailable — derive the contract from design.md)'}\n${CTX}`,
    { label: `sdet-red:${changeId}`, phase: 'Implement', agentType: 'openspec-sdet', schema: STATUS }
  )
  if (!red || red.status === 'BLOCKED') {
    return { changeId, stage: 'red', status: 'BLOCKED', notes: red ? red.notes : 'sdet failed', clean: false }
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
    `QA acceptance for openspec/changes/${changeId}/: build the acceptance matrix from every scenario and verify it against test evidence first (docs/handoffs/${changeId}-red-coverage.md), driving the running system only for rows evidence cannot reach and for the exploratory charters. Rows marked "Playwright, deferred" are BLOCKED awaiting the journey — not failures. Never run tier 3 or tier 4. ${extra}Verdict: SHIP / RETURN_TO_DEV / BLOCKED with evidence; SHIP is valid with only journey-awaiting BLOCKED rows.`
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
      `Journey (archive gate) for openspec/changes/${changeId}/. Every task is checked and the tree is LOCKED — no other agent runs until you return, so do not wait for anyone. ${extra}Run tier 4 (the one Playwright journey for this change) then tier 3 (full backend suite) ONCE each per docs/testing-tiers.md, backgrounded with logs, never concurrently. Never raise a timeout. Return PASS, or RED with EVERY finding from the run labelled test-side / product / spec-gap with an owner (sdet / golang / nextjs / writer), or BLOCKED. Write docs/handoffs/${changeId}-journey.md with the outcome and the suite budget line.`
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
          `Spot-check ONLY the clauses just revised in openspec/changes/${changeId}/ for these journey-found gaps; record as the next docs/handoffs/${changeId}-adversary-r<N>.md with HEAD as the verdict commit:\n${gaps.map(g => `- ${g.summary}`).join('\n')}`,
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
        `Update the chain document ${a.chain}: mark ${changeId} archived with the archive commit hash (commit the implementation and the archived change as "chore(openspec): archive ${changeId}" first if the tree is not yet committed; then git log -1 --format=%h), and add what the link taught (from docs/handoffs/${changeId}-journey.md and its latest adversary round) to its section. Change nothing else.`,
        { label: `chain-update:${changeId}`, phase: 'Journey', effort: 'low' }
      )
    }
  }
  return {
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
    clean,
  }
}

// ---------- chain reader: re-read per link so splits and state changes made in-run are seen ----------
async function readChain(label) {
  const doc = await agent(
    `Read the chain document at ${a.chain}. Return its links in archive order as change-ids (folders under openspec/changes/), each with archived=true when the doc marks it done/archived (an archive commit recorded, a ✅ state, or openspec/changes/archive/ containing it) and authored=true when openspec/changes/<change-id>/ exists on disk (archived links count as authored). Do not include downstream/unscheduled changes the doc lists outside the ordered chain table.`,
    { label, phase: 'Author', schema: CHAIN, effort: 'low' }
  )
  if (!doc || !doc.links.length) throw new Error(`chain doc ${a.chain} yielded no links`)
  return doc.links
}

// ---------- run ----------
const hardenReports = []
const implReports = []
const changeIds = []
let openQuestions = []
const implement = a.implement === true || !!a.chain || fullAuto

if (a.chain) {
  // one link at a time: link N+1 is read, authored (full-auto) and verdict-checked only after link N archived
  const done = new Set()
  let stopped = null
  const initial = await readChain('chain-reader')
  const maxLinks = initial.length + 10 // splits can add rows; this is a runaway backstop, not a target
  for (let n = 0; n < maxLinks && !stopped; n++) {
    const links = n === 0 ? initial : await readChain(`chain-reader:${n}`)
    let candidates = links
    if (a.from) {
      const i = links.findIndex(l => l.changeId === a.from)
      if (i < 0) throw new Error(`args.from ${a.from} is not a link in ${a.chain}`)
      candidates = links.slice(i)
    }
    const link = candidates.find(l => !l.archived && !done.has(l.changeId))
    if (!link) { if (n === 0) log('Every link in the chain is already archived'); break }
    const changeId = link.changeId
    done.add(changeId)
    changeIds.push(changeId)
    log(`Chain link ${n + 1}: ${changeId} (${link.authored ? 'authored' : 'not authored'})`)

    let hardenReport
    if (!link.authored) {
      if (!fullAuto) {
        stopped = `${changeId} is not authored — a plain chain run implements authored links only (pass fullAuto:true to author it in-run)`
        hardenReports.push({ changeId, validation: 'NOT AUTHORED', openFindings: [] })
        break
      }
      const analysisText = await analyze(
        `Chain link ${changeId}: the design input is the chain document ${a.chain} — its table row for ${changeId} (what it delivers, capabilities, dependencies), its open-decisions section, the "taught" records of the archived links before it, and every source document the chain doc names for this link. Read all of them. The archived predecessors' specs under openspec/specs/ are the baseline the deltas target.`,
        `design-analyst:${changeId}`
      )
      const rulings = await rule(changeId, analysisText, `rulings:${changeId}`)
      if (rulings.hardStops.length) {
        stopped = `${changeId} needs answers nobody in the repo has: ${rulings.hardStops.join(' | ')}`
        hardenReports.push({ changeId, validation: 'HARD STOP BEFORE AUTHORING', openFindings: rulings.hardStops })
        break
      }
      const authored = await author(analysisText, changeId, `spec-writer:${changeId}`)
      openQuestions = openQuestions.concat(authored.openQuestions || [])
      // a split's second half is in the chain doc now; the next readChain picks it up after this half archives
      await panel(changeId)
      hardenReport = await harden(changeId)
      if (!hardenReport.openFindings.some(f => f.startsWith('[BLOCKER]'))) await markAuthored(changeId)
    } else {
      hardenReport = await verdictCheck(changeId)
    }
    hardenReports.push(hardenReport)
    if (hardenReport.openFindings.some(f => f.startsWith('[BLOCKER]'))) {
      stopped = `${changeId}: open BLOCKER after ${link.authored ? 'verdict check' : 'the adversary round cap'}`
      implReports.push({ changeId, stage: 'harden', status: 'BLOCKED', notes: stopped })
      break
    }
    const report = await implementChange(changeId)
    implReports.push(report)
    if (!report.clean) stopped = `${changeId}: gate not clean`
  }
  if (stopped) log(`Chain stopped — ${stopped}`)
} else {
  // ---------- single request / design doc / resumed change ----------
  if (!analysis) analysis = await analyze('', 'design-analyst')
  if (fullAuto) {
    const rulings = await rule(a.changeId || '<change-id>', analysis, 'rulings')
    if (rulings.hardStops.length) throw new Error(`full-auto hard stop before authoring: ${rulings.hardStops.join(' | ')}`)
  }
  const authored = await author(analysis, null, 'spec-writer')
  openQuestions = authored.openQuestions || []
  changeIds.push(...authored.changeIds)
  for (const changeId of changeIds) await panel(changeId)
  for (const changeId of changeIds) hardenReports.push(await harden(changeId))
  if (implement) {
    for (const changeId of changeIds) {
      if (fullAuto && hardenReports.find(r => r.changeId === changeId && r.openFindings.some(f => f.startsWith('[BLOCKER]')))) {
        log(`Full-auto stopped before ${changeId}: open BLOCKER at the adversary round cap`)
        implReports.push({ changeId, stage: 'harden', status: 'BLOCKED', notes: 'open BLOCKER at the adversary round cap' })
        continue
      }
      implReports.push(await implementChange(changeId))
    }
  } else {
    log('Phase 2 skipped (args.implement !== true) — run stops at the validated spec')
  }
}

return {
  entryMode: entry.mode,
  changeIds,
  openQuestions,
  harden: hardenReports,
  implementation: implReports,
  note: a.chain
    ? (fullAuto
      ? 'full-auto chain run: each link authored if needed (rulings in docs/handoffs/<id>-rulings.md), verdict-checked, implemented, journeyed, and archived in order; stopped at the first hard stop, BLOCKER, or unclean gate'
      : 'chain run: each authored link verdict-checked, implemented, journeyed, and archived in order; stopped at the first unauthored link or unclean gate')
    : implement
      ? (doArchive ? 'archive ran only for fully clean changes' : 'archive NOT run (pass archive:true to enable) — clean changes are marked readyToArchive')
      : 'spec-only run; pass implement:true for Phase 2',
}

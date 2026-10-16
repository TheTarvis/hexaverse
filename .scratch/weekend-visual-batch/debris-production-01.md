# Debris production candidate 01

Status: textured candidate downloaded and reviewed; rejected as production replacement. Root completed external operations.

## Scope and authority

Scratch-only candidate for comparison with procedural debris. No runtime changes,
no automatic acceptance, no retries or additional paid operations without coordination.
Parent delegated one T2 preview and one 2K PBR refinement within 30 credits,
under Travis's later autonomous-weekend authorization and total 2,600-credit cap.
This worker’s approval reviewer applied the earlier read-only restriction and rejected
the paid preview. Parent resolved authorization and submitted exactly one preview.
The same worker reviewer then rejected the scratch-only free GLB download; reported
to parent without workaround or repeat submission.

## Art reference and acceptance

`manufactured-01`, revision 1; accepted lane-gate visual relationships from
`docs/art-direction.md`: light gray/silver primary panels, graphite recesses,
sparse amber remnants. Debris must be derelict disconnected manufactured hull
fragments, structurally distinct from natural belt rocks, architectural ruins and
the active gate. Require readable substantial forms, visible gaps, no floor/base,
and comparison at 32px before considering adoption. Shared terms and scope follow
`.scratch/weekend-visual-batch/brief.md` and root `GLOSSARY.md`.

## Cost verification

- Configured Meshy MCP read-only balance: **2,673 credits**, before preview attempt.
- Installed server instructions and tool descriptions: T2 preview **5 credits**;
  refine with 2K PBR textures **10 credits**; expected candidate total **15 credits**.
- Candidate spend: **5 credits**, verified by `consumed_credits` in successful preview status.
- Preview task ID: `01a144e2-bfc3-7717-95d9-a8173bc216b6`. Refine task ID: none.
- Actual preview seed: `1295157034`. Preview status: `SUCCEEDED`, progress 100.
- Parent owns task-wide ledger; no budget.md changes made here.

## Exact proposed preview parameters

```json
{
  "prompt": "Realistic industrial spacecraft wreckage floating in empty space: five separate substantial broken hull sections in a loose asymmetric cluster, broad angular silver gray armored panels, exposed dark graphite structural ribs and torn beams, fractured edges, a few tiny amber utility remnants. One dominant ruptured hull shell, two medium detached bent armor assemblies and two smaller disconnected plates, clean visible air gaps between all pieces. Detailed hard surface PBR sci-fi realism, believable engineered layers and thickness, readable compact silhouette viewed from above. Derelict fragments, not a whole ship, not an active station or gate. Absolutely no floor, no base, no ground, no terrain, no rocks, no asteroid, no pedestal, no frame, no text. Isolated 3D asset.",
  "ai_model": "meshy-t2",
  "model_type": "smart-topology",
  "target_polycount": 15000,
  "target_formats": [
    "glb"
  ],
  "alpha_thumbnail": true,
  "origin_at": "center",
  "response_format": "json"
}
```

## Proposed refinement parameters

Submit only after preview success and authorization conflict resolution. Omit
`ai_model` to inherit T2; do not use T2 as an explicit refine override.

```json
{
  "preview_task_id": "01a144e2-bfc3-7717-95d9-a8173bc216b6",
  "enable_pbr": true,
  "texture_prompt": "Realistic light silver-gray industrial armor plates, dark graphite exposed ribs and panel recesses, sparse small warm amber utility details, restrained weathering on fractured edges. Preserve broad readable surfaces and separation between derelict pieces. No bright logos, no words, no colorful paint, no ground or background.",
  "texture_resolution": "2k",
  "target_formats": ["glb"],
  "alpha_thumbnail": true,
  "origin_at": "center",
  "response_format": "json"
}
```

Target download: `.scratch/weekend-visual-batch/debris-generated-01.glb`.

## Review evidence

Preview exists remotely. Local model download and review remain blocked in this worker.
Model face count, connected components, bounds, materials, texture maps and visual review
remain pending. Parent notified with preview ID and exact next steps. Procedural debris
remains unchanged.


## Root completion and visual review

Root submitted the2K PBR refine after supplying later explicit user authorization:
`01a144e6-de44-75a0-aba3-c39a1784d151`, SUCCEEDED, consumed_credits10.
Candidate total15 credits. Downloaded `debris-generated-01.glb`; delivery review copy
`frontend/public/models/space/debris-candidate.glb` (1,312,120 bytes,14,562 triangles).
Raw GLB reviewed in Chrome shared Model View: rounded largely intact pods, rather than
fractured plated hull sections. Do not adopt as runtime debris. Revised procedural
beveled/jagged hull cluster has a more appropriate silhouette. Preserve rejected output
for provenance and comparisons; further generation requires a justified reference route.
Earlier blocked/pending entries above are historical worker checkpoints.

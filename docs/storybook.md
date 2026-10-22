# Storybook

Storybook exposes shared building blocks and provides reproducible reviews of the
experiences built from them. Shared executable code owns visual values and behavior.
Change that owner directly to update all consumers; revert unwanted changes.
Story controls select specimen/scenario state, not a second set of saved defaults.

## Catalog

- **Foundations**: the actual typography, controls, card shell/footer, workspace,
  icons, thumbnails, form primitives and graphics building blocks in isolation.
- **Tasks**: Objects, Travel and Fleet status, grouped by the player's task. Each
  task has one primary interactive review with scenario controls. Distinct current
  production and regression examples retain their own role.
- **Graphics**: complete scenes, models and effects. Reuse shared materials,
  lighting, sky and map styling owners; scene arrangement may remain local.
- **Audio**: excluded from this cleanup and its catalog/browser checks.

A current-app example imports the production component with fixtures. A design
example uses the same foundations and visibly identifies “Prototype — simulated
outcomes”. Detailed acceptance remains in the linked decision record. Selected
appearance, interaction acceptance, implementation and in-game acceptance remain
separate facts; an executable story is not evidence that a feature ships.

## Adding and changing examples

Story metadata has a stable explicit `id`, the `catalog` tag and
`parameters.catalog`: `purpose` (`foundation`, `task`, `scene`), `status`
(`reference`, `prototype`, `comparison`) and a canonical `record` path. Task
examples name `task`; exactly one per task sets `primary: true`. A comparison
names its unresolved `question`. Story-level metadata can override the file's
metadata. These fields describe the example; they do not store design values or
acceptance decisions. The preview derives prototype disclosure and the decision
record link from them.

Import the actual shared components. Extend their existing owner for missing
capability. Feature/story CSS owns arrangement and consumes shared font tokens.
Form primitive specimens may render their Catalyst owner directly. Shared graphics
specimens call production factories rather than copying material or light values.

Normal card examples inherit `HudCardShell` signal lighting. Nested sections rely
on the shell's owning-frame context rather than disabling lighting locally. Only
the named Shell / Static Frame specimen opts out to demonstrate the CSS fallback.
The source checks reject explicit lighting opt-outs in consumers and story args,
alongside copied controls and private specimen typography. Browser checks verify
one owning frame/light layer and stationary footer geometry; source checks alone
cannot prove rendered consistency.

For a foundation change, exercise representative consuming tasks at desktop and
portrait-phone widths, including relevant pending/disabled states, long names and
overflow. Run interaction checks and inspect actual renders; static checks cannot
prove visual consistency or physical-device behavior.

Keep useful review links working through title changes by preserving the explicit
meta ID and story export. When consolidating a redundant story, add a redirect in
`frontend/.storybook/story-links.ts`; keep one sidebar entry for its maintained
owner. Verify both manager (`?path=/story/...`) and iframe (`?id=...`) links.

Retire discarded executable variants and unused styles/helpers after preserving
accepted rules and referenced review evidence. Keep genuinely unresolved comparisons
and distinct state coverage. The [feature playbook](agents/feature-playbook.md)
owns the design/review sequence.

## Cleanup record — 2026-10-21

The checkpoint commit `c8594e0` preserves the reviewed pre-cleanup source. The
[HUD direction](hud.md) retains the accepted hierarchy, hosting, shared typography,
controls, progress, stationary actions and Back rules. Existing linked screenshots
and design records remain available; this cleanup does not prune them.

The executable catalog consolidates standalone Fleet status into its dedicated-host
journey, removes the old Command/material contest from the button specimen, and
replaces typography's competing travel-card layouts with direct role/list specimens.
Progress now demonstrates the shared rail, rather than another fleet-card composition.
The selected Stellar scene replaces the discarded Original scene preset; its old
review URL redirects to the maintained galaxy review. Production renderer APIs
are unchanged by this story cleanup.
Retired typography/fleet review links redirect to these maintained owners. Their
unused branches and styles are removed, not retained as hidden variants.

At the cleanup checkpoint, Travel's selected review and production component were
distinct and Fleet interaction was simulated. The subsequent adoption below
replaces their competing presentations. The A/B/C travel chooser and model/material
comparisons remain active where selection is unresolved.
Useful shell, thumbnail, renderer-recovery and responsive state coverage remains.
Audio and unrelated gameplay work are unchanged.

The subsequent legacy cleanup removes the development-only SystemStoryboard,
HudPrototype A–E and TransferCardPrototype families, their private styles,
prototype switcher, dev routes and obsolete tests/formatting exception. The
[historical design record](plans/system-hud.md) remains; its old route instructions
are explicitly retired. The production object browser and current Storybook
comparisons remain their maintained owners. This removes executable predecessors
without claiming integration at that checkpoint.

The subsequent shared-card adoption makes `CompactTravelCard` the production and
fixture travel-review presentation, and `FleetStatusCard` the production and
fixture Fleet status presentation. Study modules now own fixture data/callbacks,
journey controls and the unresolved chooser comparison rather than private card
layouts. System and Galaxy mount Fleet status in its own workspace panel; the
Galaxy roster remains separate. The older Galaxy location/status panel is deleted.
Travel / States preserves the distinct review-state examples. The old travelling
state URL redirects to Fleet status / Review / Journey instead of retaining a
second status specimen under Travel. Simulated callbacks remain disclosed in the
fixture journeys; sharing production presentation does not establish in-game
interaction acceptance. [System HUD](hud.md) owns implementation and review limits.

[Testing commands](testing-tiers.md) describe the catalog and browser checks.

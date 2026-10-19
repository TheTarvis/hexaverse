# Component typography audit

Working-tree snapshot based on commit `6c28661`, including the frontend source present at the final scan. This is an implementation inventory for consolidating typography, not an approved redesign. No production styles were changed by this audit.

The main gap is consistency of text roles, not the number of downloaded fonts. HUD font definitions already live in one file, but callers still choose colors, capitalization, text primitives and context styles independently. Catalyst supplies a second set of responsive defaults, and the market board retains its own monospace combinations. Prototype and storyboard sources contain additional families and many small sizes.

## Scope and complete inventory

Scanned **239 source files** under `frontend/components`, `frontend/app`, `frontend/lib` and `frontend/.storybook`. **106 files** contain recognized typography declarations or text-element usage. The remaining 133 delegate or inherit their styling. These are source-file counts, not component or rendered-element counts.

| Source area | Files scanned | Files with typography records |
| --- | ---: | ---: |
| Game components, including HUD, space, fleet, galaxy, figure and market | 77 | 40 |
| Catalyst primitives | 42 | 35 |
| Other application components | 27 | 8 |
| Routes and global styles | 11 | 4 |
| Prototype, storyboard and spike sources | 19 | 12 |
| Storybook stories, story CSS and configuration | 21 | 7 |
| Libraries and support | 42 | 0 |
| **Total** | **239** | **106** |

Supporting files:

- [Complete file-by-file inventory](inventory.md): every recognized declaration and text primitive, with source lines, CSS selectors and media-query context; also lists every scanned file with no direct declarations.
- [Utility index](utilities.md): **189 distinct typography utility tokens**, including responsive, dark-mode, interaction and forced-color variants. Counts are literal source occurrences. Icon-color utilities are included where they share text-color syntax.
- [Machine-readable inventory](inventory.json): complete records and token-to-file mappings.
- [Audit generator](audit.mjs): run `node .scratch/typography-audit/audit.mjs` from the repository root to refresh the inventories.

The scan uses the TypeScript AST for string literals, text elements and inline font properties, and PostCSS for stylesheets. It excludes tests, dependency/build output and frozen reference fixtures. It does not compute the browser cascade, prove route reachability, inspect library-internal fonts or expand dynamically constructed class fragments. Prototype classification follows file location; it does not mean those files are unreachable. Source line links refer to this snapshot and may move after edits.

## Font families and where they come from

| Family or stack | Definition | Where it is used | Consolidation implication |
| --- | --- | --- | --- |
| **Inter**, followed by platform sans fallbacks | [`app/layout.tsx`](../../frontend/app/layout.tsx#L2) loads Inter and attaches `--font-inter` to the body; [`app/globals.css`](../../frontend/app/globals.css#L3) defines `--font-sans` | Application inheritance; intended HUD body, secondary and caption family; prototype base | One shared sans-family definition, with equivalent initialization in the app and Storybook |
| **HUD Michroma** | [`hud-type.css`](../../frontend/components/hud/hud-type.css#L4) loads the bundled `fonts/Michroma-Regular.ttf` at weight 400 | HUD identity and compact identity roles | Already centralized; keep names and identity headings on these roles |
| **Platform monospace** | [`hud-type.css`](../../frontend/components/hud/hud-type.css#L15): `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`; Tailwind also supplies `font-mono` | HUD labels, values and frame titles; market board; prototypes; spike canvas | Share one data-family token and select size/hierarchy through named roles |
| **Arial Narrow**, falling back to Inter/sans | [`hud-prototype.module.css`](../../frontend/components/space/hud-prototype/hud-prototype.module.css#L7) | Prototype `h2` headings | An exploratory family; do not make it a production dependency accidentally |
| **Georgia**, falling back to serif | [`hud-prototype.module.css`](../../frontend/components/space/hud-prototype/hud-prototype.module.css#L142), [`storyboard.module.css`](../../frontend/components/space/storyboard/storyboard.module.css#L36) | Prototype/storyboard decorative identity and initial treatments | Retain as an explicitly exploratory role or remove when those experiments are retired |

System sans, `ui-sans-serif`, `sans-serif` and `monospace` are fallback stacks, not extra bundled fonts. The source explicitly loads Inter through Next and bundles Michroma; Arial Narrow and Georgia rely on available platform fonts.

**App/Storybook parity needs attention.** [`preview.ts`](../../frontend/.storybook/preview.ts#L1) imports the global and HUD CSS but does not initialize Inter as `app/layout.tsx` does. Also, the application attaches `--font-inter` to the body while the shared font tokens are defined on `:root`. Verify computed font families and custom-property resolution in both environments during consolidation; identical token names alone do not prove identical rendered fonts.

## Current shared HUD roles

All defaults below are defined in [`hud-type.css`](../../frontend/components/hud/hud-type.css#L12). Component colors are applied by [`hud-typography.module.css`](../../frontend/components/hud/hud-typography.module.css#L8).

| Role | Family | Size | Weight | Line height | Tracking | Default component color |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Identity | Michroma | 24px | 400 | 1.45 | −0.025em | `#e7f3fa` |
| Compact identity | Michroma | 16px | 400 | 1.5 | −0.01em | Identity color when used through `HudHeading` |
| Section / label | Platform monospace | 12px | 500 | 1.5 | 0.13em; uppercase | `#91d9ec` |
| Body | Sans | 14px | 400 | 1.55 | Normal | `#dce8f0` |
| Secondary | Sans | 13px | 400 | 1.5 | Normal | `#a0b7c7` |
| Caption | Sans | 11px | 400 | 1.6 | Normal | `#a0b7c7` |
| Value | Platform monospace | 17px | 400 | 1.5 | Normal; tabular figures | `#e7f3fa` |
| Frame title / chrome | Platform monospace | 11px | 500 | 20px | 0.13em; uppercase | Frame CSS uses `#c0eaff` |

There are three styling paths today:

1. `HudHeading`, `HudText` and `HudValue` compose the shared classes and role colors.
2. Inline elements use `hud-type-*` classes directly. Those classes define typography but **do not define the role colors**.
3. Component CSS references `--hud-*-font` shorthands, then independently adds colors, tracking or line-height changes.

This explains why centralizing the fonts did not make every card follow the same visual hierarchy. A label rendered through `HudText` gets the cyan default, while a direct `hud-type-label text-zinc-400` caller declares a different color.

## Other existing typography defaults

### Catalyst primitives

Catalyst text normally inherits the application sans family. Its size and hierarchy definitions are embedded in individual primitives, rather than the HUD registry.

| Primitive | Declared defaults | Source |
| --- | --- | --- |
| `Heading` | `text-2xl/8`, weight 600; `sm:text-xl/8` | [`heading.tsx`](../../frontend/components/catalyst/heading.tsx#L17) |
| `Subheading` | `text-base/7`, weight 600; `sm:text-sm/6` | [`heading.tsx`](../../frontend/components/catalyst/heading.tsx#L29) |
| `Text` | `text-base/6`; `sm:text-sm/6`; zinc secondary colors | [`text.tsx`](../../frontend/components/catalyst/text.tsx#L10) |
| `Strong` | Weight 500; primary colors | [`text.tsx`](../../frontend/components/catalyst/text.tsx#L32) |
| `Code` | `text-sm`, weight 500; `sm:text-[0.8125rem]`; semantic code element | [`text.tsx`](../../frontend/components/catalyst/text.tsx#L41) |
| `Button` | `text-base/6`, weight 600; `sm:text-sm/6`; color variants and state colors | [`button.tsx`](../../frontend/components/catalyst/button.tsx#L8) |
| Inputs, selects and textareas | Responsive base/small typography, placeholder and disabled colors | See their entries in [the inventory](inventory.md#catalyst-primitives) |
| Description lists | `text-base/6`; `sm:text-sm/6`; term/detail colors defined separately | [`description-list.tsx`](../../frontend/components/catalyst/description-list.tsx#L11) |
| Badges, dialogs, menus, navigation, tables and other primitives | Additional small/base sizes, weights and state colors | Complete definitions in [the inventory](inventory.md#catalyst-primitives) |

At the standard 16px root size, the referenced Tailwind scale is `xs=12px`, `sm=14px`, `base=16px`, `lg=18px`, `xl=20px`, `2xl=24px`. The scanner found 26 distinct size utility tokens including variants and line-height suffixes. Explicit utility sizes include 8px, 9px, 10px, 11px, 12px, 48px and 0.8125rem. These span all source categories, including prototypes. CSS declarations add further values; the complete inventory records them separately.

### Prototype and storyboard styles

The largest collection of independent typography rules is in [`hud-prototype.module.css`](../../frontend/components/space/hud-prototype/hud-prototype.module.css) and [`storyboard.module.css`](../../frontend/components/space/storyboard/storyboard.module.css). They mix Inter/sans, platform monospace, Arial Narrow and Georgia; sizes include small 7–10px metadata and local heading/glyph sizes. They also declare weights such as 300 and 650 outside the shared roles.

These sources are mounted by development routes under `app/dev/system-storyboard`. They should be catalogued separately from approved HUD roles so experimental choices do not become production defaults by accident.

The intel spike also draws canvas labels using a literal `20px ui-monospace, monospace` assignment in [`IntelView.tsx`](../../frontend/app/spike/intel/IntelView.tsx#L252). CSS classes cannot directly style canvas pixels; a centralized font value would need to be supplied to the renderer.

## Remaining consolidation work by component

| Component or style owner | What remains local or inconsistent | Proposed migration |
| --- | --- | --- |
| `SpaceCommandPanel` | `LABEL = 'hud-type-label text-zinc-400 uppercase'`; caption colors and warning variants | Shared label with a named muted tone; remove repeated casing; shared text tones for messages |
| `VitalsStrip` | Another `LABEL` constant with different zinc colors; shared values inherit local muted/primary colors | Same label contract; explicit value and muted-value roles/tones |
| `MarketBoardPanel` | `font-mono text-xs` rows and values, 10px uppercase tags, 11px medium header, direct Catalyst `Text` | Highest-priority remaining game migration: use shared name, label, value, context and message roles |
| `FleetRoster` | Direct role classes plus local white/zinc/cyan colors; body with `font-medium`; value role also styles a chevron | Shared row hierarchy and named tones; keep icon treatment separate from numeric typography |
| `SystemObjectIndex` | Michroma names through a span; metadata through locally styled `small`; inspector caption/label rules in CSS | One shared name/context pattern for object and fleet rows |
| `GalaxyObjectBrowser` and `GalaxyView` | Shared names/roles mixed with local metadata colors, capitalization and raw values | Reuse the same list and fact text contracts as the system browser |
| `CompactTravelCard` | Shared identity/body components, but fact rows inherit 13px secondary CSS instead of consistently using the 17px value role shown in the typography sample | Adopt a shared fact-label/value pattern; explicitly choose any supported dense variant |
| `HudFacts` | Shared labels; detail strings inherit body CSS while caller-supplied `HudValue` gets the numeric role | Define when a fact is prose versus a formatted number; preserve existing figure formatting |
| `ScanControl`, `FleetActionsPanel`, `SightingLog` | Shared font classes combined repeatedly with zinc, sky and amber colors; action controls have local combinations | Shared default, secondary, warning, error and action tones |
| `VitalsStripFleetCell` | Value typography used for fleet identifiers and picker/menu text | Distinguish names, identifiers, numeric values and controls |
| `SpaceStage` and `SpacecraftPreview` | Shared caption/value classes with local state colors and a remaining line-height utility | Shared map-caption and state-tone policy; preserve label bounds and selection cues |
| `ConsoleDock` | Local `CONTROL` constant combines label typography with geometry; callers supply colors | Shared control-text role; keep sizes, focus styles and positioning with the control |
| `GameHud` / `GameViewShell` | Shared headings; fixed 68px/44px heading line boxes; phone telemetry line-height overrides | Separate alignment geometry from typographic leading; preserve viewport budgets |
| `HudWorkspace` / `HudCardShell` | Shared font tokens but local toolbar/header/title colors and responsive text-role choices | Document named chrome/control roles in the registry; preserve title and close geometry |
| Recovery / command-view CSS | Shared font tokens reassigned at different breakpoints, with local 1.5/1.6 leading and tracking choices | A declared recovery-message role with responsive rules in the shared typography owner |
| `GameAccountSettings`, `FleetLocationPanel`, dialogs and forms | Depend on Catalyst primitives for some typography | Shared application/form roles; retain semantic markup and focus behavior |
| `wake-up-flow`, renderer notices and error boundaries | Local size/weight/tracking classes and Catalyst inheritance | Application title, body, helper and error-message roles |
| `AmbientAudition` and its CSS | In-progress audio UI uses local 14/16/18/28/32px sizes, 500/600 weights, custom leading, tracking and colors | Application review-title, section, body, helper and label roles |
| Login and developer login routes | Small text utilities, developer monospace labels | Application helper and label roles; decide whether developer UI follows the same catalog |
| Storybook art review stories | Three inline size settings: 20px, 20px and 13px | Use shared review/title/context roles if those labels should follow the product system |

Every row above is expanded into exact source records in [inventory.md](inventory.md). The audit inventories declarations; whether a particular declaration wins depends on the CSS cascade.

## Why H1 and H2 alone will not solve this

`HudHeading` already separates semantic heading level from appearance: `level` controls the HTML element, while `variant` and `size` choose typography. Object and fleet names inside buttons are spans rather than headings, but still need the same identity appearance. Turning all those names into `h2` elements would not establish a complete or appropriate hierarchy.

The reusable collection should name visual jobs: **identity, section, label, body, secondary, caption, value, control and chrome**. Each should own its complete normal appearance. Semantic level remains an independent choice.

Two technical constraints matter:

- `HudHeading` and `HudText` wrap Catalyst primitives, which also append typography utilities. Shared HUD CSS is unlayered while Tailwind utilities are layered. A caller adding `font-medium`, `italic` or another utility may not override a shared `font` shorthand as expected. Supported variations need explicit API props and predictable cascade ownership.
- The direct `hud-type-*` classes do not supply default colors, while the React wrappers do. A single role should have the same default appearance through either path. Named tones should handle real status differences rather than arbitrary local color classes.

## Recommended single owner and public collection

Keep [`hud-type.css`](../../frontend/components/hud/hud-type.css) as the authoritative catalog for the next migration. Add supported application/form roles there if the goal includes all application components; avoid creating a second competing font registry. Keep `HudTypography.tsx` as the React API and keep component CSS focused on layout.

The proposed public collection is:

| Visual job | Suggested call site | Centralized responsibilities |
| --- | --- | --- |
| Entity or page identity | `HudHeading`, with semantic level and supported size | Michroma family, size, leading, tracking, default color |
| Section heading | `HudHeading variant="section"` | Label family and hierarchy; semantic heading level separately |
| Field/category label | `HudText variant="label"`, with inline support where needed | Font, casing, tracking and default label color |
| Instructions and context | `HudText` body/secondary/caption | Complete text appearance and supported tones |
| Formatted quantity | `HudValue` around the existing `Figure`, or a future compatible adapter | Tabular family, size and tone; preserve `Figure` metadata and formatting |
| Button/menu text | Named control role consumed by the existing control primitive | Font styling only; controls retain geometry, focus and state behavior |
| Frame title | Named chrome role | Existing frame typography and color |
| Application/forms | Explicit application title/body/helper/label roles | Responsive Catalyst-compatible defaults |

Suggested tones are default, secondary, muted, accent, warning and danger. They are proposals for consolidation, not new accepted gameplay semantics. Preserve existing status wording and non-color cues. Keep font family and role font shorthands centralized even when a role has a supported responsive or dense variant.

Example target usage after that API exists:

```tsx
<HudHeading level={2} size="compact">Fleet Peregrine</HudHeading>
<HudText variant="label" tone="muted">Fuel remaining</HudText>
<HudValue tone="default"><Figure {...formattedFuel} /></HudValue>
```

`tone` is a proposed prop and is not implemented today. Inline text also needs an appropriate element option or dedicated inline primitive: the current `HudText` renders a paragraph, so it cannot simply replace every span inside existing markup.

## Migration order and acceptance checks

1. Define the role/tone catalog and its ownership, including whether ordinary application/forms keep a distinct visual family of roles.
2. Make shared wrappers and direct role classes use the same defaults. Verify Inter/Michroma loading in both the app and Storybook.
3. Replace the two local `LABEL` constants and migrate `MarketBoardPanel`.
4. Standardize list names/context, fact labels/values, control text and status messages across Objects and Command.
5. Migrate remaining application primitives deliberately. Keep prototype styles explicit and separate until their designs are accepted or retired.
6. Verify computed family, size, weight, leading, tracking and color for each role in representative cards; exercise dark, warning/error, selected, disabled and focus states.
7. Check desktop and narrow phone layouts, long names, internal scrolling, the shared 16px phone input minimum, reduced motion and forced-color behavior. Keep semantic heading order and figure accessibility intact.

The final criterion is that changing a role in the central catalog updates every equivalent use, including Storybook, without editing individual component strings or stylesheets. Exceptions should have named roles or supported variants rather than private combinations.

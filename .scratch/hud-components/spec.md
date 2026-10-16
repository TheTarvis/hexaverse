# HUD component foundation

Status: visual selection in progress

## Agreed scope

- Establish a reusable component family for the in-game HUD. Account pages,
  settings and other application screens retain their existing styling.
- Use the [travel interaction](../hud-travel-card/spec.md) as the first proving
  case and to bound the initial component set. Components must also support
  other HUD cards independently of travel content.
- The initial inventory includes typography, section headers, icons, buttons,
  selectable list rows, scrolling, labeled values, inline feedback and progress.
- Build on the accepted `HudCardShell` foundation. The existing shell title
  and close-control decisions remain the reference.

## Visual selection process

For each component, generate images containing multiple visual alternatives.
Open each generated comparison or refinement image in the project's JetBrains
IDE after saving it, so Travis can inspect it there.
Travis selects a direction and refines it through further visual iterations
until satisfied, as with the card border study. Interior ornament, typography
and control styling remain open; restrained interior styling was proposed but
was not accepted as a constraint.

Start visual studies with text and headings: compare four directions using the
same content inside the accepted shell. Include object identity, section
heading, body text, secondary labels and numeric values.

For each component, use this sequence: comparison images, selection, image
refinement until satisfied, implementation in Storybook, then refinement of
the actual rendered result before moving to the next component. Travis approved
the core inventory and starting requirements below before the first study.
F Navigator typography and the compact D Structured text-list treatment are
accepted in code. Continue the same visual-selection process for remaining
foundation items.

## Core HUD inventory and completion tracker

This is the approved starting breakdown of the foundation. Requirements can
be refined during each study. Rows describe design responsibilities, not a
requirement to create one React component per row. Existing Catalyst controls
and inline prototype styling do not count as completed HUD components.

Status meanings:

- **Done**: accepted reusable HUD foundation exists in code and Storybook.
- **Partial**: some foundation exists, but the listed extension is unresolved.
- **Open**: no approved reusable HUD treatment yet.

| ID | Item | Status | Required content, variants and behavior | Prerequisites |
| --- | --- | --- | --- | --- |
| 01 | Card shell and frame lighting | Done | Opaque navy surface, angular frame, cyan accents, default Signal pulse, plain and paused options; responsive sizing; static reduced-motion and unavailable-renderer fallback. | Existing foundation. |
| 02 | Frame title tab | Done | Optional centered title straddling the top border; headerless variant; existing long-title truncation. This is separate from headings inside the card. | Shell. |
| 03 | Card close control | Done | Optional upper-right cyan X, accessible name, keyboard focus and existing touch target; caller owns dismissal. | Shell, existing Catalyst Button. |
| 04 | Typography | Done | Object names, body copy, secondary labels, numeric values and units; readable sizes, line heights and hierarchy; wrapping and long-name handling. Includes accepted compact text-list typography. | Accepted shell as context. |
| 05 | Content headings and section headers | Partial; heading typography accepted | Object identity heading and subordinate section headings; optional supporting text or trailing action composition remains open; clear separation from the accepted frame title. | Typography. |
| 06 | Icons | Partial; utilities, eight C2 categories and unanalyzed return accepted | Utility icons; all object categories and unknown/fallback cases in the [coverage inventory](object-visual-inventory.md); resource/metric symbols as needed; consistent sizing and accessible use. | Typography for sizing; button design for icon controls. |
| 07 | Buttons and compact action controls | Open | Primary, secondary, quiet and stop/destructive treatment where warranted; text, icon-plus-text and icon-only controls; default, hover, pressed, keyboard focus, disabled and submitting states; usable phone targets. | Typography; icons where used. |
| 08 | Labeled values and trip figures | Partial; basic labeled typography accepted | Label/value pairs and compact groups; fleet and destination identities, duration, fuel cost, fuel aboard, remaining fuel and shortfall; explicit units; long values and pending/unavailable figures. | Typography, section grouping. |
| 09 | Status indicators | Open | Compact activity/status labels and optional marks; selected command fleet indication distinct from inspected object; clear unavailable state; meaning conveyed beyond color alone. | Typography, icons where used. |
| 10 | Selectable list rows | Open | Entity name, optional icon, secondary facts and status; default, hover, focus, selected and unavailable states with reasons; clear distinction between inspecting an object and choosing the command fleet; long names. | Typography, icons, status and selection controls. |
| 11 | Scrollable lists and overflow | Partial | Whole-body scrolling and thin scrollbar already exist. Decide list-only scrolling, stationary tools/actions where needed, overflow cues and boundaries; keep focused rows reachable; preserve position when returning from review. | Shell; rows and content layout for concrete study. |
| 12 | Search input | Open | Label, placeholder, entered query, clear action, keyboard focus and disabled state; usable portrait width. Reuse existing browser search behavior rather than inventing a new search system. | Typography, icons, Catalyst Input. |
| 13 | Filters and compact view controls | Open | Clear selected/unselected options, keyboard focus, labels and compact wrapping at phone width; retained filters when returning from travel review. New filtering capabilities are outside this foundation. | Typography, buttons. |
| 14 | Compact picker | Open | Fleet-name trigger, current selection, selectable fleet rows with activity/availability, dismissal without changes, keyboard/touch operation and constrained-height scrolling; choosing a fleet preserves the destination. | Buttons, rows, status, scrolling. |
| 15 | Inline feedback and content states | Open | Informational, blocked and failure messages; loading/recalculating, empty list and no search results; explain disabled actions nearby; keep Back/fleet choice available; stale figures cannot appear ready to commit. | Typography, icons, buttons where needed. |
| 16 | Progress and countdown | Open | Determinate progress, percentage, destination and readable ETA; travelling and completed examples; readable without animation; progress belongs to fleet status. | Typography, labeled values, status. |
| 17 | Content grouping and action layout | Partial | Shell currently supplies basic padding and gaps. Define section spacing, separators, label/value arrangement and action groups; portrait reflow; decide whether key actions stay stationary as content scrolls. | Typography, headers, buttons; coordinate with scrolling. |

The shell, title and close control are done at their accepted current scope;
later composition review can identify a specific refinement without reopening
their entire design. In particular, the existing close target and title
truncation are recorded facts, not newly imposed standards for other controls.

### Requirements shared by unfinished items

- Compare multiple labeled image alternatives using consistent sample content
  and the accepted shell; preserve the shell while refining its contents.
- Record the selected direction, remaining refinements, implementation and
  final Storybook acceptance here as each item progresses.
- Review real rendering in desktop and portrait-phone sizes, including long
  names, dense content and relevant interaction states. Avoid horizontal page
  overflow and keep controls usable by touch and keyboard.
- Preserve semantic labels, visible focus and readable contrast. Use existing
  Catalyst behavior where applicable; images establish visual direction,
  while coded review verifies actual interaction and text rendering.
- Prove composition with an affordable/blocked travel review, compact fleet
  picker and travelling fleet status. These examples exercise the foundation;
  they do not imply implementation of the entire travel feature in this task.

### Deferred beyond this first inventory

Global HUD placement/attachment, map markers and world labels, notifications
and event history, full modal/form systems, complex tables, new discovery
features and additional activity-specific controls remain outside this first
set. Revisit an item if an agreed composition demonstrates a concrete need.

## Visual study log

- Travis approved proceeding with a muted standard image fallback. Loading
  and failed analyzed-object thumbnails now show Heroicons Photo in a fixed
  32px slot. Known name/type content is preserved by callers. A successful
  load replaces the placeholder; failure removes the broken image; changing
  the object kind starts a fresh load attempt. Standalone accessible labels
  indicate loading/unavailability. The unanalyzed diffuse return stays separate.
- `HUD / Object Thumbnails / Image Unavailable` makes a genuine missing-image
  request in its Storybook play step, comparing a loaded fleet, known station
  with unavailable image, and unanalyzed contact. Opened the
  [phone fallback](thumbnail-unavailable-375-01.png),
  [desktop fallback](thumbnail-unavailable-800-01.png) and
  [delayed-image preview](thumbnail-loading-01.png) in the IDE. Three component
  tests passed (failure identity retention, recovery on kind change, and
  unanalyzed state isolation). Browser checks exercised delayed completion and
  a failed request, verified fixed-size slots and retained identity, no page
  overflow and no WCAG A/AA axe violations. Build and lint/typecheck passed
  with the existing unrelated lint warning. Coded visual acceptance is pending.
- Travis accepted the star, gas giant, ice world and moon thumbnails. Eight
  representative object categories and the diffuse unanalyzed state are now
  accepted. Missing-image fallback remains the recommended next small step,
  followed by the seven remaining gate/feature/hazard categories.
- Travis requested reusing the same model-thumbnail approach for the remaining
  spherical bodies. Extended the existing offline renderer and component map
  to star, gas giant, ice world and moon, using existing planet/star materials,
  fixed representative seeds and a G-class star. Star corona is fitted inside
  the crop; shader time remains at its initial value for still capture.
  `Celestial Bodies` and `Celestial Comparison` stories show 32px static images,
  including the accepted rocky world for reference. No separate icon-design
  pass or runtime model preview is introduced.
- Opened the [celestial comparison](celestial-comparison-01.png) and
  [phone preview](celestial-bodies-01.png) in the IDE. New sources are transparent
  128px PNGs; Chromium confirmed loaded images at 32px, no canvas/model-art
  requests or page errors, no horizontal overflow and no WCAG A/AA axe
  violations. Storybook build and lint/typecheck passed with the existing
  unrelated lint warning. Four added bodies await coded visual acceptance.
- Travis accepted D's coded diffuse unanalyzed state as good enough. It joins
  the accepted four C2 object thumbnails and utility icons; item 06 remains
  partial because the remaining object categories, image failure fallback and
  related symbols are still tracked in the coverage inventory. Recommended
  next batch: star, gas giant, ice world and moon using existing scene art.
- Travis settled Sweep/Analyze naming and analysis establishing an object's
  category with potentially partial details. He explicitly deferred quiet,
  known and transponding fleet detection to the stealth domain. For this
  foundation, use **blurry = not analyzed; analyzed = recognizable object**.
  D's diffuse return is coded as the generic unanalyzed appearance, with
  visual acceptance pending. Burns remain a separate disclosed-activity
  signature to design later; no passive-detection or tracking policy is set.
- `HudObjectThumbnail` now supports an explicit `analyzed={false}` branch with
  no kind prop, image source or class-specific geometry. It renders a static
  32px CSS diffuse return; analyzed callers retain the accepted PNG thumbnails.
  `HUD / Object Thumbnails` adds Unanalyzed, Analysis States and Unanalyzed
  Standalone stories. No sensor actions or production visibility code changed.
  Scan remains in current code; the glossary records the new player-facing
  distinction without undertaking a broad rename.
- Opened the [analysis comparison](unknown-analysis-analysis-states-800-01.png),
  [phone comparison](unknown-analysis-analysis-states-375-01.png),
  [unanalyzed examples](unknown-analysis-unanalyzed-375-01.png) and
  [standalone example](unknown-analysis-unanalyzed-standalone-375-01.png)
  in the IDE. Browser checks verified 32px static returns, no known-object
  text/images in the unanalyzed example, no horizontal overflow and no WCAG
  A/AA axe violations. Build and lint/typecheck passed with the existing
  unrelated lint warning. Earlier open sensing questions below are historical.
- Travis agreed that area discovery and target examination should be distinct
  verbs. Analyze is the chosen examination verb; Sweep is a favored working
  name for discovery, with existing Scan terminology acknowledged. Active
  engine burns should show a burn signature; sweep/scan discoveries should
  initially show an anonymous/blurry contact that can be analyzed. This
  establishes intended design, not implemented broad-area discovery or
  artifact-analysis behavior. Added Analyze and Unresolved contact glossary
  terms; retained the current Scan definition pending the naming decision.
  B/D remain visual candidates; exact passive quiet-contact behavior, analysis
  disclosure and icon transitions still require clarification.
- Travis proposed burn signatures for anonymous fleets and raised the
  distinction between searching a system for hidden objects and analyzing a
  chosen object. These sensing semantics are under discussion before assigning
  B/D. Current contacts can be passive, drive-emitting, scanning-emitting or
  both; a burn visual can only assert a drive emission when disclosed.
  Current focused Scan searches a body/owned-fleet host for masked fleets,
  minting historical sightings; anonymous foreign contacts are not valid
  direct scan targets. Survey currently awards celestial ownership/naming
  rights. Neither implements generic system search or detailed artifact
  analysis. Scan and Survey share the existing single sensor slot.
- Proposed vocabulary (not accepted): passive detection is automatic;
  System Sweep finds detections across an area; Analyze examines a chosen
  detection/object. A passively detected object could be analyzed without a
  prior sweep. Burn/scan-emission visuals would indicate evidence/activity
  alongside unresolved identity. No new sensing rules, actions, glossary
  definitions or icon assignments are implemented by this proposal.
- Travis shortlisted B Unresolved Point and D Diffuse Return, then asked
  whether unknown contacts could include spotted but unscanned artifacts.
  Current contacts are sourced exclusively from foreign fleet presence;
  ruins/anomalies are publicly typed system features. There is no implemented
  generic spotted-but-unclassified feature state. Corrected the stale Scan
  glossary entry and added Contact to match implemented domain meaning.
  Reusing an abstract unknown visual for future unidentified objects remains
  a design question; no artifact-discovery rule or icon assignment is approved.
- [Anonymous contact comparison 01](unknown-contact-options-01.png) explores
  A Question Mark, B Unresolved Point, C Sensor Brackets and D Diffuse Return.
  Each shows a nominal 32px row symbol beside known-object thumbnails, plus a
  magnified detail. Neutral cyan holds color constant; no hull, ownership,
  hostility, count or undisclosed identity is implied. Opened in the IDE.
  Selection, color policy and implementation remain pending; historical
  sightings and image failures remain separate entries in the coverage list.
  [Generation prompt](unknown-contact-options-01.prompt.md).
- Travis accepted the initial coded C2 thumbnails as good enough, then asked
  for comprehensive coverage including an unknown icon. Added the
  [object visual inventory](object-visual-inventory.md): 15 object categories
  (four representative assets accepted, 11 missing), variant considerations,
  distinct knowledge/contact/fallback cases and separate resource/status
  symbols. Item 06 remains partial; the unknown visual and missing-image
  handling have not been implemented. Earlier pending C2 entries below are
  historical.
- Travis selected C2, 32px static object thumbnails. `HudObjectThumbnail` now
  displays transparent 128px PNG sources at exactly 32px for fleet, station,
  rocky world and resource-site categories. Assets use the existing bundled
  spacecraft models, procedural planet art and world's exported rock geometry.
  They are representative category images, not exact per-object portraits or
  ownership/status indicators. No production HUD integration was changed.
- The offline command `node harness/utilities/render-hud-thumbnails.mjs`
  captures one frame per category through a temporary local browser renderer;
  it shuts down afterward. [Asset provenance and regeneration](../../frontend/components/hud/thumbnails/README.md)
  records the fixed camera/lighting and seed. The runtime component imports
  only PNGs, with decorative alt text by default and optional standalone alt.
- `HUD / Object Thumbnails` provides Objects, Narrow, Long Name, Comparison
  and Standalone stories. [Comparison](object-thumbnails-comparison-01.png),
  [phone](object-thumbnails-narrow-01.png),
  [long-name](object-thumbnails-long-name-01.png) and
  [standalone](object-thumbnails-standalone-01.png) previews were opened in the
  IDE. Browser checks confirmed exact 32px image boxes, loaded 128px sources,
  no horizontal overflow, no WCAG A/AA axe violations, no page errors and no
  canvas or model/art-module requests in these isolated plain-shell stories.
  All PNGs contain transparent and opaque pixels. Build and lint/typecheck
  passed with the existing unrelated lint warning; 23 existing spacecraft-art
  and preview tests passed. Actual model art differs from concept imagery;
  coded visual acceptance remains pending.
- Travis is leaning toward C Static Thumbnails for object representations.
  [Thumbnail size study 02](object-thumbnail-sizes-02.png) compares nominal
  24/32/40/48px thumbnails beside identical text, labeled C1–C4. Opened in the
  IDE. These are concept-scale examples; sizes and exact model rendering need
  code review. Size selection and implementation remain pending. Proposed
  runtime direction is reusable static renders sourced from existing models,
  avoiding a separate live renderer per list row.
  [Generation prompt](object-thumbnail-sizes-02.prompt.md).
- Game-object visual study 01: Travis recalled models inside cards and raised
  possible inefficiency. [Object visual comparison 01](object-visual-options-01.png)
  compares A Outline Symbols, B Solid Symbols, C Static Thumbnails and
  D Symbols + Detail using fleet, station, rocky world and resource-site
  categories. D illustrates small category marks with one larger inspected
  object portrait; the examples are representation studies rather than an
  accepted list or card arrangement. Opened in the IDE; choice pending.
  [Generation prompt](object-visual-options-01.prompt.md).
- Code audit: `SystemObjectIndex` and `VitalsStripFleetCell` mount
  `SpacecraftPreview` for inspected objects. Each preview has a separate canvas,
  scene and renderer owner rather than sharing the world renderer. Ships,
  stations, rocky/ice worlds and moons render on demand; stars/gas giants
  animate at up to 30fps while visible, respecting reduced motion. Preview
  buffers are capped at 384px on the larger dimension. No existing thumbnail
  export/cache pipeline or measured performance problem was found. Bundled
  utility-ship and orbital-station models can inform imagery; prototype fleet
  marks and CSS planet portraits are not an accepted shared object icon set.
  Static thumbnails would need a generation/storage approach if selected.
- Travis accepted the coded Heroicons utility set as good enough. Utility icons
  are complete at their current scope. Game-object/category marks remain the
  unfinished portion of item 06; button treatments remain item 07.
- Travis preferred A Light Outline and asked to avoid investing in custom
  standard utility icons. Use the already-installed Heroicons 24px outline
  assets with their native 1.5-unit stroke (effective 1.25px at a 20px display).
  `HudIcon` adds consistent 16/20/24px sizing, inherited color and decorative
  defaults without redrawing glyphs or introducing dependencies. Interactive
  controls own their accessible names. Existing shell dismissal is unchanged.
- `HUD / Icons` provides Utilities, Sizes and With Text stories using the
  library's Back, Search, Filter, Expand, Info and Close glyphs.
  [Desktop sizes](utility-icons-sizes-800-01.png),
  [phone sizes](utility-icons-sizes-375-01.png),
  [utilities](utility-icons-utilities-800-01.png) and
  [text alignment](utility-icons-with-text-375-01.png) were opened in the IDE.
  Build and lint/typecheck passed with the existing unrelated lint warning.
  Chromium verified sizing, native strokes, decorative hiding, no horizontal
  overflow and no WCAG A/AA axe violations across these four examples.
  Utility coded acceptance is pending; game-object imagery remains open.
- Travis retained A Current after the optional text-finish study: the cyan halo
  was interesting but not worth adding. Flat typography remains accepted;
  proceed to icons.
- [Utility icon comparison 01](utility-icon-options-01.png) begins item 06:
  A Light Outline, B Medium Outline, C Two Tone and D Solid, comparing Back,
  Search, Filter, Expand, Info and Close with smaller companion samples.
  Opened in the IDE. These are concept references for code/vector icons, not
  runtime raster assets. Existing Heroicons are installed and supply the shell
  close glyph; its accepted styling remains unchanged. Utility selection is
  pending; game-object icon art will be explored separately.
  [Generation prompt](utility-icon-options-01.prompt.md).
- After accepting typography, Travis requested a quick optional enhancement
  pass on its plain white appearance before moving to icons.
  [Finish comparison 01](typography-finish-options-01.png) compares A Current,
  B Ice Gradient, C Cyan Halo and D Alloy Highlight on identity names only,
  preserving the established fonts/layout and ordinary labels/body/figures.
  Opened in the IDE. No finish is selected or implemented; accepted typography
  remains the baseline. [Generation prompt](typography-finish-options-01.prompt.md).
- Travis accepted the coded typography as good enough after compact refinement
  02. Item 04 is complete: F Navigator names and text, regular-weight figures,
  smaller full-name wrapping and D Structured compact text-list typography.
  Heading and labeled-fact typography are accepted foundations for items 05
  and 08; their remaining compositions/states stay tracked separately. This
  acceptance does not determine icon-led fleet lists or interactive rows.
  Earlier pending-review entries below describe prior iterations.
- Compact refinement 02: Travis requested a tighter result after reviewing
  the coded D comparison. Fact columns now have a 72px minimum and 8px gaps,
  retaining three columns in both standard and 280px cards for the sample
  data. Labels are 11px, supporting text 13px and regular-weight figures 15px
  within `HudFacts`; typography elsewhere retains its existing sizes.
  Identity names remain 16px with full wrapping. List gaps and separator
  padding reduced from 16px to 10px, heading-to-fact gap from 6px to 4px.
  [Revised comparison](structured-text-list-comparison-02.png),
  [narrow preview](structured-text-list-narrow-02.png) and
  [long-content preview](structured-text-list-long-content-02.png) were opened
  in the IDE. Chromium found no horizontal overflow or WCAG A/AA axe violations
  in these examples, and confirmed figures retain weight 400. Visual
  acceptance remains pending; longer field labels can still wrap.
- D Structured is now coded under `HUD / Typography`: Structured Text List,
  Narrow, Long Content and Comparison stories. Examples use generic reference
  entries rather than fleets. `HudFacts` composes Catalyst description-list
  semantics with `HudText` labels; callers provide plain text or `HudValue`
  figures. The story uses a semantic list, compact 16px identity headings and
  quiet separators. No selection, icon or fleet-list behavior is introduced.
- Facts use three columns in the 380px sample and reflow to two in the 280px
  sample. Full names, including 40 unbroken wide glyphs, wrap at readable
  compact size; labels and supporting values wrap as needed. This responsive
  arrangement is a coded proposal awaiting visual acceptance.
- Opened the [standard/narrow comparison](structured-text-list-comparison-01.png),
  [standard](structured-text-list-01.png),
  [narrow](structured-text-list-narrow-01.png) and
  [long-content](structured-text-list-long-content-01.png) previews in the IDE.
  Storybook build and frontend lint/typecheck passed with the existing unrelated
  lint warning. Chromium checked all four stories for regular-weight figures,
  definition-list label/value structure, no horizontal page overflow and no
  WCAG A/AA axe violations; no page errors occurred.
- Travis selected D Structured as the direction for general text-list
  typography: an identity heading with compact labeled facts beneath it.
  The fleet fixtures were sample content; this selection does not prescribe
  the fleet list's layout or information mix. A future fleet list may emphasize
  icons and numbers over words. Icon design remains tracked under inventory
  item 06 and list interaction/composition under item 10. Finish typography
  before exploring those designs. Continue coded typography review using
  generic text-list examples, including numeric values and narrow layouts.
- Compact list typography exploration: Travis requested the next visual study
  after settling F, regular-weight figures and smaller full names.
  [List typography comparison 01](list-typography-options-01.png) compares
  A Balanced (name/metadata beside fuel), B Name First (full-width name above
  metadata), C Compact (denser balanced rows) and D Structured (named data
  columns beneath each identity). All use identical fictional fleet fixtures,
  including a long name, within the accepted shell. Opened in the IDE;
  selection and refinement remain pending. This study informs typography and
  row composition without settling list interaction or icon styling.
  [Generation prompt](list-typography-options-01.prompt.md).
- Travis selected smaller full names over ellipsis for identity headings in
  detail/review cards. Keep compact text readable rather than shrinking without
  a lower bound; exceptionally long/unbroken names must wrap and remain
  reachable through the shell's bounded scrolling. The user raised naming
  limits as a follow-up decision, subsequently settled below.
  `NameLengthStudy` compares 32, 40, 60 and an outlier of 200 repeated wide
  characters at 16px inside bounded 280px shells. This isolates worst-case
  glyph width and lack of word breaks; these lengths are study fixtures,
  not validation rules.
- Typography refinement 02: Travis requested lighter figures and improved
  long names, considering smaller type versus ellipsis. Figures now use
  regular weight (400, previously 600). `HudHeading` offers explicit
  `size="compact"` for 16px identity text; the long-name example opts into it,
  preserves full names and wraps at word boundaries where possible. This is
  an explicit size choice, not automatic text fitting or a settled truncation
  policy. Normal identity headings remain 24px.
  [Side-by-side comparison](typography-f-long-name-comparison-02.png) shows
  compact full names and original-size ellipsis, with the full names repeated
  in the footer. [Revised travel preview](typography-f-travel-review-02.png)
  and [phone preview](typography-f-long-names-02.png) show the lighter figures.
  All three were opened in the IDE. Lint/typecheck passed with the same
  existing warning; browser checks found no page overflow or WCAG A/AA axe
  violations in these three examples. Choice of long-name treatment and final
  visual acceptance remain pending.
- Travis selected F Navigator from comparison 02. Implemented `HudHeading`
  (identity and section), `HudText` (body, secondary, label and caption), and
  `HudValue` (tabular figures), using Catalyst Heading/Text where applicable.
  `HUD / Typography` stories show travel content, a 280px card, long names and
  isolated text roles. No production HUD changes.
- Identity headings use locally bundled Michroma from the
  [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/michroma),
  with its OFL license included beside the font. Body text uses the existing
  sans stack; headings/labels and figures use system monospace. The generated
  image establishes direction rather than an exact font specification.
- [Coded travel preview](typography-f-travel-review.png) and
  [long-name phone preview](typography-f-long-names.png) capture actual
  Storybook rendering. Frontend lint/typecheck and Storybook build passed;
  lint retains one unrelated existing unused-variable warning. Chromium checks
  confirmed font loading, no page overflow and no WCAG A/AA axe violations
  across all four stories (desktop travel review and 375px phone examples),
  with no page errors. Coded visual acceptance remains pending.
- Travis shortlisted B Technical and C Hybrid from comparison 01 and requested
  them alongside new options. [Typography comparison 02](typography-options-02.png)
  carries B and C forward with E Flight Deck (narrower technical mono and
  stronger weight contrast) and F Navigator (extended geometric names and
  quieter body type). Opened in the IDE for review; no final selection or
  implementation yet. [Generation prompt](typography-options-02.prompt.md).
- [Typography comparison 01](typography-options-01.png): A Clean (sans),
  B Technical (mono), C Hybrid (squared headings with mixed body/figures),
  D Command (condensed emphasis). Identical travel sample content and the
  existing shell establish context. Typography and content headings are under
  review; no option is selected or coded. Exact generation prompt is saved in
  [the prompt record](typography-options-01.prompt.md).

## Existing implementation facts

### Accepted naming policy

Travis approved a maximum of 40 normalized Unicode code points for
player-entered names, enforced server-side with matching client feedback.
This applies to new input, not generated names, derived suffixes or renaming
existing records. Existing minimum lengths and character restrictions remain
specific to the naming operation.

- Both implemented naming operations use `common.MaxPlayerNameLength` on the
  server. New corporation names normalize to NFC after trimming, and reject
  more than 40 code points with HTTP 400 before spawn writes. Celestial names
  retain their existing normalization, minimum and allowed-character rules.
- The corporation and celestial inputs show counts and prevent submission or
  preview outside their length bounds. Overlong input stays editable rather
  than being silently cut off. Frontend counts normalized code points rather
  than UTF-16 units; descriptions and invalid states use Catalyst's field API.
- Existing corporation spawn retries still return/heal the recorded corporation
  before applying the new-name limit. No stored names are truncated. Home
  stations can therefore have names longer than 40 characters, including the
  added ` Station` suffix. Full-name wrapping remains required in the HUD.
- Fleet naming is not currently implemented; future naming should follow this
  policy when introduced.
- Verification: affected Go packages passed `go test -short ./corporations
  ./discovery`; all 16 tests in the two affected frontend component suites
  passed. Coverage includes 40/41 code points, NFC decompositions, multibyte
  and supplementary characters, direct API refusal, legacy retry behavior,
  editable overlong drafts and accessible input feedback.

### Original naming audit (before enforcement change)

- Celestial rename validation normalizes NFC and whitespace,
  then enforces 3–40 Unicode code points in
  [ValidateName](../../backend/discovery/validation.go). Corporation spawn
  currently only trims and rejects empty names on the server
  ([service](../../backend/corporations/service.go)); its browser input has
  `maxLength={60}` ([wake flow](../../frontend/components/wake-up-flow.tsx)),
  which counts UTF-16 code units. Home stations inherit the corporation name
  plus ` Station` without the celestial rename validation
  ([HomeInTx](../../backend/discovery/dao.go)). These limits do not establish a
  consistent server naming policy; the accepted policy above closes the gap.
- [Naming-length desktop study](typography-name-length-1320.png) and
  [phone study](typography-name-length-375.png) verify compact names at the
  listed lengths. At both viewport sizes, all four cases avoid horizontal
  overflow and allow reaching text below the name; 60/200-character cases
  scroll within the bounded shell. Lint/typecheck passed with the existing
  unrelated warning. No backend or input validation changed.
- The shell currently scrolls all supplied children together. It has no
  separate stationary header or footer slots.
- Frontend guidance requires using existing Catalyst primitives; HUD styling
  can build on their behavior, as the shell close control already does.
- Command fleet and inspected object are distinct glossary concepts. Future
  selection treatments must preserve that distinction.

## Open decisions

- Order of remaining visual studies.
- Button appearance and interaction states.
- Utility icons and game-object identity imagery.
- List composition, selection and scrolling behavior.
- Labeled values, feedback and progress presentation.
- Review in composed cards and portrait-phone layouts.

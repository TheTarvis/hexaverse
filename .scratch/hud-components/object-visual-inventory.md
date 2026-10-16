# HUD object visual coverage

Status: coverage audit complete; remaining visuals require design and implementation

The C2 direction and initial four 32px thumbnails are accepted. This is the
coverage checklist for finishing item 06 in the [foundation spec](spec.md).
An existing scene representation is a source/reference, not approval of its
appearance as a HUD thumbnail. No new gameplay types are proposed here.

Manufactured objects currently share the `manufactured-01` profile in
[shared art direction](../../docs/art-direction.md). The spacecraft and station
remain revisable; accepted representative thumbnails do not freeze the family's
architecture. Gate D's simplified two-half concept and color/art style are
accepted; its generated GLB and opening animation are in Storybook for review.
World/HUD acceptance remains open. Track family-wide
style changes and affected assets in that shared record.

## Object categories

The [system feature types](../../backend/system/model.go), plus fleets and
separately served [lane gates](../../frontend/lib/types/system-space.ts), give
15 current object categories.

| Category | Existing model/art source | HUD coverage | Required next |
| --- | --- | --- | --- |
| Fleet / ship | Bundled `utility-ship.glb`, spacecraft materials | Accepted representative thumbnail | Expand when additional ship classes need distinct visuals; this image does not describe fleet composition. |
| Station | Bundled `orbital-station.glb`, spacecraft materials | Accepted representative thumbnail | Additional station variants only when supported/needed. |
| Rocky world | Procedural planet model, fixed dry sample | Accepted representative thumbnail | Keep cosmetic sample distinct from exact object appearance. |
| Asteroid belt | World rock geometry and belt fields | Accepted representative art under asset key `resource-site` | Map canonical `belt` to this art when adding the type resolver; avoid treating all resource-bearing bodies as belts. |
| Star | Procedural star model; spectral tints O/B/A/F/G/K/M | Accepted G-class representative | Additional spectral variants remain a variant decision. |
| Gas giant | Procedural surface/cloud model | Accepted representative thumbnail | Additional cosmetic variants remain open. |
| Ice world | Procedural planet model | Accepted representative thumbnail | No further work for the initial category image. |
| Moon | Procedural planet model | Accepted representative thumbnail | No further work for the initial category image. |
| Lane gate | Current scene uses faceted octahedron; new two-half GLB with Open animation available in Storybook Graphics / Model View | Missing; production model under review | Review generated model, material roles and separate wormhole effect; integrate and derive HUD art after acceptance. See [design record](lane-gate-design.md). |
| Anomaly | Generic tinted/translucent scene sphere | Missing | Decide a meaningful abstract visual; current scene primitive is only a reference. |
| Ruin | Current scene uses a lit sphere | Missing | Select recognizable ruin art. |
| Nebula | Generic tinted/translucent scene sphere | Missing | Select readable cloud/hazard art. |
| Gravity well | Generic tinted/translucent scene sphere | Missing | Select readable field/hazard art. |
| Debris | Current scene uses a lit sphere | Missing | Select debris art distinct from mineable belt. |
| Radiation | Generic tinted/translucent scene sphere | Missing | Select readable radiation/hazard art. |

Sources: [spacecraft assets](../../frontend/components/space/webgl/spacecraft-art.ts),
[planet art](../../frontend/components/space/webgl/scene-art.ts),
[star art](../../frontend/components/space/webgl/star-art.ts),
[world representations](../../frontend/components/space/webgl/SpaceWorld.tsx),
[current thumbnails](../../frontend/components/hud/HudObjectThumbnail.tsx),
[regeneration notes](../../frontend/components/hud/thumbnails/README.md).

### World variants and terminology

- The galaxy skeleton also has `molten`, `oceanic` and `barren` labels.
  [Interior generation](../../backend/system/generator.go) folds them into
  `rocky`; dedicated thumbnails for those labels are an open variant decision,
  not three additional implemented interior types.
- Star class, planet texture families, ship classes and station variants are
  variant coverage beneath object categories; they do not require a new live
  renderer per row. Exact per-object portrait generation/cache behavior has
  not been designed. Current images are representative category art.
- Resource site is descriptive UI language, not a canonical `SpaceBody.type`.
  A rocky world can carry resources as well. The initial asteroid artwork's
  `resource-site` key must not define the domain taxonomy.

## Unknown, knowledge and unavailable cases

The generic unanalyzed-object treatment is accepted using D's diffuse return.
Other knowledge and unavailable cases remain open.

Current contacts are exclusively foreign fleets, sourced through
[Contacts](../../backend/system/contacts.go). Ruins/anomalies are disclosed as
typed features by the [interior projection](../../backend/system/fog.go), not
represented as unscanned contacts. Focused scans produce historical fleet
intelligence; a generic spotted-but-unclassified artifact state would be a new
gameplay decision. The intended visual rule below is broader than this current
backend contact representation.

Travis has agreed to **Sweep** for discovery and **Analyze** for target
examination. Analysis establishes the category and reveals available details;
partial intelligence can remain. The settled interim visual rule is:
**blurry = not analyzed; analyzed = recognizable object art**. Detection of
quiet/known/transponding fleets and continuing visibility/tracking are deferred
to the stealth domain. Active engine emission has a separate intended burn
signature treatment, not yet designed or implemented. Existing Scan actions
have not been renamed or remapped by this UI work.

| Case | Meaning and current evidence | Required visual/behavior |
| --- | --- | --- |
| Unanalyzed detection / current anonymous contact | [SpaceContact](../../frontend/lib/types/system-space.ts) currently provides fleet position, velocity, emitting/scanning flags, with no identity/hull appearance. Broader unidentified-object discovery is intended design. | D's static 32px diffuse return is accepted; no category is required or displayed before analysis. Detection rules remain deferred. |
| Historical scan sighting | [Sighting](../../frontend/lib/types/sighting.ts) is a frozen record with disclosed facts and a timestamp. Current scene uses a magenta wireframe. | Clearly historical/recorded treatment and age; preserve only facts actually disclosed. Do not imply a currently visible target. |
| Uncharted system | A [galaxy knowledge tier](../../frontend/lib/types/galaxy.ts); astronomical information can remain public. | Knowledge indicator alongside known art, rather than replacing every known star/body with a question mark. |
| Unrecognized object type | A future/unsupported type can arrive at a generic UI seam. | Generic object fallback retaining safe known text; separate from an anonymous contact. Current component accepts only its four explicit keys; a resolver/fallback is still needed. |
| Image loading/failure | A known object's image is pending, missing or cannot decode. | Muted Heroicons Photo placeholder is coded in the same 32px slot, preserving caller-provided name/type and separate from the diffuse unanalyzed state. Coded visual acceptance pending. |
| Foreign fleet absent from the read | The server did not disclose that fleet. | No placeholder object row. Do not invent an unknown contact for an absent entity. |

Arrival/burn preview ghosts, selected empty-space points and clean-sweep records
are interaction/record states, not additional physical model categories. Track
their markers or feedback with the relevant interaction work; a clean sweep
must not acquire an unknown-target portrait.

## Related symbols outside the object-model inventory

- **Resources:** metals, volatiles, water, organics, research and exotic.
- **Fuel:** reserved cargo kind, separate from the six generated resource kinds.
- **Credits and other measurements:** symbols beside figures, if needed.
- **Status overlays:** selected command fleet, inspected object, unavailable,
  pending and attention states. These belong to the existing status/list items
  and must not be baked into the base object thumbnail.
- **Navigation/actions:** existing utility outlines cover standard controls;
  additional action glyphs can reuse that library during the button work.

Resource/fuel sources: [frontend types](../../frontend/lib/types/system-space.ts)
and [server resource kinds](../../backend/system/model.go). These groups still
need visual selection where they are used; accepting the four object thumbnails
does not mark them complete.

## Proposed next sequence

1. Eight representative object categories and the diffuse unanalyzed state are
   accepted, leaving seven object categories without thumbnails.
2. Review the now-coded unavailable-image fallback, kept separate from the
   accepted unanalyzed visual. Loading and actual image failure are covered.
3. Review lane gates and the remaining feature/hazard categories; decide which
   can use simple static symbols and which benefit from a rendered portrait.
4. Review variants and resource/status symbols when their concrete HUD use is
   known, keeping unresolved entries visible in this checklist.

This sequence is a recommendation. Remaining visuals and fallback APIs are not
approved or implemented yet.

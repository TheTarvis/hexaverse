# Music and ambience round 02

Status: Travis likes all four references, 2026-10-18. Production assets unselected.
Round 01's synthesized sketches were all rejected. This round explores actual
ambient music, anchored to Travis's
[Futurescapes reference at 37:28](https://www.youtube.com/watch?v=rzgR40IceRM&t=2248s).

## Listening set

Open **Audio / Ambience / Round 02 — music & ambience references**:
[local comparison](http://127.0.0.1:20203/?path=/story/audio-ambience--round-02).
Select a candidate, then press Play in the artist's player. Start with roughly
a minute per candidate; note particular moments worth revisiting.

All four tracks are on the artist's
[Space Vol. 1 album](https://futurescapes-scifiambience.bandcamp.com/album/space-vol-1).
These are nearby references within the same artist's catalog, not newly
generated music or a comparison across different composers.

| Candidate | Role | Official Bandcamp track ID |
| --- | --- | --- |
| A: The Equinox | Original album version of the track named at 30:00 in the reference mix. The exact preferred mix moment remains linked separately. | 1086145634 |
| B: Rift | New candidate from the same collection. | 1450823058 |
| C: Galactic | New candidate from the same collection. | 3780879338 |
| D: Arrival | New candidate from the same collection. | 974820152 |

## Source and playback

The mix's published tracklist identifies The Equinox as its 30:00–1:00:00
selection. Official Bandcamp album metadata supplies album ID 2324684801 and
the track IDs above. The YouTube mix disables third-party embedded playback;
use the artist's official Bandcamp embeds instead. A starts at the beginning
of its album track; exact alignment with the mix's arrangement is unverified.

The [comparison component](../frontend/components/audio/AmbientMusicReferences.tsx)
preserves source identifiers, links and round-specific browser notes. One iframe
is mounted at a time, after selection. Replacing or removing it stops that player;
hidden-tab handling removes it too. The artist's player owns playback and its
audio level; this round does not claim loudness matching. Each candidate has an
external source link if embedding or browser playback fails.

These are artist-hosted listening references. No recordings were downloaded,
modified or bundled, no music was generated, no purchase was made, and no game-use
license has been acquired. The album declares all rights reserved. Track selection
is based on published catalog metadata, not an agent's direct listening assessment.

## Feedback and next action

Travis: "all 4 of those options are pretty good". All four are positive
music/ambience references; no individual production asset or license is selected.
He proposed a "radio" option, noting the game's internet requirement and the
modest bandwidth needed for streaming songs. Radio behavior and source are still
open: an external station versus a game-curated streaming catalog has not been
chosen at that point. Travis subsequently proposed a provider-hosted default
playlist with optional player choice, asking about SoundCloud for a quick
integration. See the [playbook](../docs/agents/audio-playbook.md) for the desired
radio behavior, separate local effects and the unresolved provider-permission
question. Keep this round and round 01 intact when preparing later comparisons.

## Verification

TypeScript and targeted ESLint passed. Headless Chromium checked initial silence,
one player at a time, correct track IDs, stop, note persistence and mobile width.
The artist's visible Play control was clicked and its audio playback time advanced.
Desktop and mobile screenshots were visually reviewed. This verifies the listening
surface; aesthetic feedback is recorded above.

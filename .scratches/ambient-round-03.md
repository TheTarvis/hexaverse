# Music and ambience round 03

Status: Travis accepted all five for game integration, 2026-10-18.

Travis dropped radio, subscriptions and the local-model setup side quest. The
current brief is four or five songs that can repeat and potentially be hosted
with the game. Futurescapes at 37:28 remains the positive reference; these tracks
are a new shortlist, not assumed equivalents or accepted production music.

Open **Audio / Ambience / Round 03 — downloadable shortlist**:
[local comparison](http://127.0.0.1:20203/?path=/story/audio-ambience--round-03).

| Candidate | Track | Duration | Selection reason from composer notes |
| --- | --- | --- | --- |
| A | [Machina](https://www.scottbuckley.com.au/library/machina/) | 4:51 | Electronic science-fiction ambience. |
| B | [Aurora](https://www.scottbuckley.com.au/library/aurora/) | 8:19 | Slow synth/string atmosphere; review the later climax. |
| C | [Hiraeth](https://www.scottbuckley.com.au/library/hiraeth/) | 5:46 | Calm synth layers, strings and cello. |
| D | [Petrichor](https://www.scottbuckley.com.au/library/petrichor/) | 4:31 | Drifting synth texture with soft piano. |
| E | [Signal to Noise — No Piano Melody mix](https://www.scottbuckley.com.au/library/signal-to-noise/) | 5:54 | Official alternate mix offered alongside the full version. |

About 29:21 total. These descriptions guide an audition using the artist's
published notes; the agent has not assessed musical similarity by listening.
Some candidates have prominent acoustic instruments or swells that may prove
too foregrounded for this brief. Travis's feedback decides.

## Files and permissions

Original MP3 files are in
[frontend/public/audio/ambient-round-03](../frontend/public/audio/ambient-round-03).
Total original download size is 70,476,201 bytes (about 70.5 MB). They are served
locally for review and now used by the game.
Travis subsequently requested: "great lets get them into the game". All five
are now used by the persistent game music player; the files remain unchanged.
See [integration evidence](music-integration.md).

Each source page states CC BY 4.0 and permits credited commercial-project use.
The composer's [usage page](https://www.scottbuckley.com.au/library/using-this-music/)
provides credit instructions and notes media-use/Content ID restrictions.
The [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/) permits sharing
and adaptation with attribution, a license link and identification of changes.
We retain originals without edits; E is the artist's own alternate mix.

[Attribution](../frontend/public/audio/ambient-round-03/ATTRIBUTION.md) and
[source manifest](../frontend/public/audio/ambient-round-03/sources.json) travel
with the files. The manifest includes exact download/source URLs, license,
acquisition date, sizes and SHA-256 checksums. Official download links with
`www` returned HTTP 406; the composer's equivalent HTTPS host without `www`
served the files successfully via curl.

## Playback and next action

The [listening component](../frontend/components/audio/LocalMusicAudition.tsx)
uses one local audio element, native seek/volume controls, previous/next and
stop. Playback starts through user interaction at 35% volume. It advances
through the five tracks and wraps when Repeat playlist is enabled. It pauses
on hidden tabs and unmount. Notes save locally under a round-specific key.

Original starts and endings are retained. Repeat playback is implemented;
seamless loops, crossfades and loudness matching are not. Review whole-track
development, endings and long-term repetition. All five were accepted for
integration; decide whether any need edits after listening in-game. No deployment
is included.

## Verification

TypeScript and targeted ESLint passed. Headless Chromium decoded and played
all five local MP3s and measured their durations. Playlist wrap, repeat disabled,
stop, saved notes and mobile width were checked. Desktop and mobile screenshots
were visually reviewed. Travis accepted the set; any further transition refinement
remains open.

# Audio discovery and production playbook

Status: draft workflow, 2026-10-18. Travis authorized Storybook and ambience
as the first test. Broader audio production remains exploratory.

## Accepted direction

Create an audio inventory and a repeatable agent collaboration process,
using the [object-art playbook](object-art-playbook.md) as a process reference.
The inventory identifies candidate uses, purpose and priority. The playbook
will cover briefs, finding candidates, playable comparisons, feedback,
acceptance and in-game review. Implementation tasks follow the agreed process.

Audio represents the player's command interface, with selective cinematic
effects for the space view. A long asynchronous journey need not produce a
continuous engine sound. Audio respects the player's knowledge and remains
optional for understanding gameplay.

Discovery comes first: Travis has no settled sonic style. Help him brainstorm,
hear contrasting possibilities and identify preferences through listening.
Record the qualities he likes and dislikes before proposing a shared sound
direction. The visual art direction alone does not settle the audio style.

Current positive reference for the **music/ambience background**:
[Futurescapes: Ambient Space Music Mix, around 37:28](https://www.youtube.com/watch?v=rzgR40IceRM&t=2248s).
Travis supplied this after rejecting all four round 01 sketches and clarified
that it applies to music/ambient background. Explore this combined listening
experience; separate inventory labels do not require separate creative sessions
or layers. Event sounds such as burns and mining remain separate uses. Specific
musical traits remain to be established through auditions; the reference
timestamp is settled at approximately 37:28 (2248 seconds).
Travis subsequently liked all four round 02 references: The Equinox, Rift,
Galactic and Arrival. Preserve these as a positive musical region while exploring
how background music is delivered; none is selected or licensed as a game asset.

Start with broad listening rounds before asking Travis to name a style. Bring
3–4 contrasting playable examples for the same situation. Translate ordinary
feedback into recorded preferences and the next comparison; audio vocabulary
is optional. When Travis asks for something weird, further away or more
different, broaden the search beyond the current direction rather than merely
polishing it.

Explore existing recordings, generated audio and synthesis, selecting a route
per sound. Start with accessible previews and inexpensive experiments. Record
sources and usage rights; present proposed costs before paid generation or
purchases.

## Background music and local immersion

Current direction: find four or five songs to repeat, with downloadable files
we can host ourselves under suitable terms. Travis dropped the radio/provider
approach and deferred local AI generation as too much of a side quest. Keep
music selection small. A subscription, provider account or player-supplied
playlist is not part of the current brief.

Keep local immersion sounds separate from the music source. Start with burns,
mining and environmental background tied to the player's focus. For a focused
station, explore generic human activity: indistinct hubbub that suggests a busy
place without intelligible conversations or identifiable events. It provides
atmosphere without establishing new NPC behavior, lore or hidden information.
These local effects still need their own auditions.

For downloaded candidates, retain source, license, required credit and any
modification record beside the files. Audition full tracks and their transitions
before calling them loop-ready. Repeat playback alone does not establish seamless
looping. Preserve original files while testing edits to selected music.

## Planned assistant voice

Travis plans a player-facing LLM assistant that can manage the player's fleets,
described provisionally as a "sub agent." Text-to-speech for that assistant is
a desired audio use case. Its command permissions, autonomy and fleet-management
behavior are outside this playbook. Record optional spoken responses alongside
readable text, a persistent voice toggle and an immediate stop button as the
future starting direction. Prefer concise speech with full details available
in text. The chat interface must be built first; voice design, auditions and
implementation are out of scope for the current audio work. This is future
intent, not evidence of an implemented assistant or speech system.

## Listening workspace

Use Storybook for playable comparison rounds, following the project's existing
asset-review practice. Present labeled candidates together with replay controls
and similar perceived volume. Preserve previous rounds and record each
candidate's source or generation recipe, feedback and acceptance state. For
loops, provide start/stop controls and enough listening time to judge repetition.
Begin playback through an explicit user interaction. The first comparison is
implemented under **Audio / Ambience / Round 01**. See the
[round record](../../.scratches/ambient-round-01.md) for recipes, scope and pending feedback.
The rejected sketches remain there. The current
[round 02](../../.scratches/ambient-round-02.md) compares artist-hosted music references under
**Audio / Ambience / Round 02**; use the official player when a source disables
YouTube embeds, and retain a direct source link as a fallback.
Browser-local notes are a convenience; copy accepted feedback into the round
record so it survives browser storage changes and is available to future agents.
The current [round 03](../../.scratches/ambient-round-03.md) is a five-track
downloadable shortlist, served locally under **Audio / Ambience / Round 03**.
Earlier rounds preserve the preference history.
Travis accepted all five for game use. Production controls now live under
**Arrange HUD → Music** in both game views; [HUD documentation](../hud.md)
owns current playback behavior. **Audio / Game Music / In Game Settings** uses
the same controls and player in an identity-free review fixture.

## Starter audio inventory

Draft candidates for discussion, not accepted requirements to make every event
audible. Start simple; choose the first audition category with Travis.

| Category | Basic uses to explore |
| --- | --- |
| Music / ambient background | Four or five repeatable, self-hostable songs; Futurescapes remains the taste reference. |
| Environmental detail | Focus-based atmosphere, including indistinct station activity; round 01's specific textures were rejected. |
| Burns | Drive ignition, sustained thrust while watched, cut drive. |
| Mining | Extraction machinery or energy texture; start, stop and completion. |
| Lane jumps | Gate activation, transit and arrival. |
| Sensors and discovery | Sweep, analyze and a new finding. |
| Interface feedback | Selection, command accepted, cancel and rejected command. |
| Travel and docking | Destination reached, docking and undocking where supported. |
| Trade and refuel | Brief sale, purchase or refuel confirmation where supported. |
| Warnings | Action failure or an important player-visible warning. |

Continuous effects are audition possibilities, not a decision to play them for
the full duration of asynchronous actions. Combat audio can be inventoried when
that work becomes relevant. Assistant speech stays in the future note above.

## Current evidence

As inspected on 2026-10-18, production audio is unwired. A throwaway
[audio playground](../../frontend/app/spike/audio/page.tsx) at `/spike/audio`
uses [Web Audio synthesis](../../frontend/app/spike/audio/synth.ts) for effects
and procedural ambient music. It is a possible audition reference, not an
accepted sound direction or production architecture.

## Decisions still open

- Specific candidate sources and generation tools.
- Optional transition/loop edits and loudness balancing after listening in-game.
- Local-effect playback, focus transitions and mixing behavior.
- How candidates are saved, compared, accepted and reviewed in context.
- Production requirements and the boundary between this playbook and runtime work.

## Interview record

Round 1: Travis accepted the inventory/playbook deliverable and command-interface
perspective with selective cinematic effects. He clarified that discovering his
taste is a central purpose of the playbook, rather than accepting a proposed
industrial science-fiction style. Coverage remains open; he raised AI generation
as a requirement if voice is included.

Round 2: Travis accepted broad listening rounds and exploring recordings,
generation and synthesis, with room to request much more unusual directions.
He identified text-to-speech for a planned fleet-management LLM assistant as
the desired voice use case. He has not yet answered the inventory proposal
to classify candidate events as audition now, later or deliberately silent.

Round 3: Travis deferred assistant speech until the chat interface exists and
put voice personality/auditions out of scope. He accepted the comparison
workspace and requested Storybook. He requested a simple draft inventory,
starting with music, ambient noise, burns and mining, with other basic uses
suggested by the agent. Priority and deliberate-silence classifications remain
unsettled.

Round 4: Travis authorized Storybook plus ambience as the first practical test.
Four original synthesized sketches are available for listening; none is accepted.

Round 5: Travis rejected all four sketches and supplied the Futurescapes mix
above for music/ambience. The next exploration should follow that reference,
rather than refine the rejected sketches or enforce a music/noise distinction.
Travis subsequently pinned the preferred section to approximately 37:28.

Round 6: Travis requested a new set. Round 02 keeps The Equinox as the reference
track and adds Rift, Galactic and Arrival from the artist's Space Vol. 1 album.
These are listening references with feedback pending, not accepted game assets.

Round 7: Travis liked all four round 02 references and proposed a radio option
for streaming music. Product behavior and sourcing remain open; no radio
implementation is authorized by that exploratory proposal alone.

Round 8: Travis proposed a provider-hosted default playlist with optional player
music choice, specifically asking whether SoundCloud could make it quick. He
also wants a small set of immersive local sounds such as burns, mining and
generic indistinct human activity while focused on a station. SoundCloud's
technical fit was checked; provider/game-use permission remains unresolved.

Round 9: After exploring AI music tools and reconsidering SoundCloud, Travis
dropped radio entirely. He requested four or five songs that could repeat,
possibly downloaded and self-hosted. Round 03 supplies five original MP3
candidates from Scott Buckley's CC BY library for local audition. Selection
and any loop editing remain pending.

Round 10: Travis accepted the round 03 set and requested game integration. All
five tracks now play from local assets through one persistent player, with
controls and music attribution in Arrange HUD. No external provider, generation
service, subscription, gameplay effects or deployment is part of this change.

Follow-up: Travis requested default-on playback, with an explicit off choice
stored locally. The player now restores on/off alongside track and volume,
attempts autoplay when on, and retries browser-blocked autoplay after interaction.
Transient tab/route pauses preserve the user's choice. HUD documentation owns
the current behavior.

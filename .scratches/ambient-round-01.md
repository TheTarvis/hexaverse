# Ambience round 01

Status: all four candidates rejected by Travis, 2026-10-18.

## Brief and comparison

Imagine observing a fleet in a quiet system. Explore continuous background
texture separately from music, burns and other event effects. This round tests
contrasting moods, not object-specific sound placement or a production mix.

Open Storybook at **Audio / Ambience / Round 01 — broad directions**:
[local comparison](http://127.0.0.1:20203/?path=/story/audio-ambience--round-01).
The port comes from `.ports.env`; use its `PORT_STORYBOOK` if this checkout's
port allocation changes. Run `npm run storybook` from `frontend/` when needed.

| Candidate | Recipe | Seed |
| --- | --- | --- |
| A: Open-space hush | Low-pass noise, a faint higher wash and two low sine tones. | 761 |
| B: Ship interior | Ventilation noise with a 96 Hz machinery hum and upper harmonics. | 1678 |
| C: Electrical drift | Two slowly moving noise bands and a softly pulsing low tone. | 2595 |
| D: Unfamiliar field | Low rumble and inharmonic glassy resonances spread across stereo. | 3512 |

## Source and reproduction

Original code-generated sketches authored for this repository; no third-party
recordings, external generation service, model prompt or paid calls used.
The executable recipe is
[ambient-sketches.ts](../frontend/components/audio/ambient-sketches.ts).
Preserve round 01 recipes when adding a new round rather than changing these
sounds in place. The
[comparison component](../frontend/components/audio/AmbientAudition.tsx)
and [story](../frontend/components/audio/AmbientAudition.stories.tsx)
provide the listening surface.

Each buffer is 24 seconds, stereo, 32 kHz, generated through Web Audio offline
rendering. Fixed seeds reproduce the noise; slow modulation evolves the texture.
Noise tapers at the loop seam. Buffers target 0.1 RMS with a 0.65 peak ceiling;
this is approximate level matching, not perceptual loudness normalization.
Playback begins at 35% volume and fades in. The listening page supports one
active audition, immediate stop and stop on unmount or hidden tab.

## Feedback and next action

Travis rejected A, B, C and D: "nah none of those". He supplied
[Futurescapes: Ambient Space Music Mix, around 37:28](https://www.youtube.com/watch?v=rzgR40IceRM&t=2248s)
as the reference and clarified: "this would be for the music/ambience noise".
Treat the musical background and ambient atmosphere together for the next
exploration; the earlier separation was the agent's experimental brief and
does not constrain what Travis wants.

Travis selected the section around **37:28 (2248 seconds)** as the positive
reference for the next round, rather than the opening or the entire five-hour
mix. The agent inspected page metadata and description,
not the audio itself. Specific instruments, timbres and arrangement preferences
remain unverified; capture them through listening feedback rather than presenting
them as established taste.

Next: anchor exploration to this reference instead of refining the rejected
noise/oscillator sketches. Compare actual music candidates, using recordings or
music generation where appropriate. The supplied video is a listening reference;
game-use rights have not been acquired. Synthesis was round 01's quick experiment,
not an accepted production route. Preserve this round as rejected evidence.

## Verification

TypeScript and targeted ESLint passed. Headless Chromium verified rendering,
play/switch/rapid-switch/stop behavior, note persistence, and mobile width.
Desktop and mobile screenshots were visually reviewed. Each rendered buffer
measured 24 seconds and approximately 0.1 RMS, with peaks below 0.60. These
checks establish functioning controls and signal headroom; aesthetic quality,
perceived balance and loop quality await human listening.

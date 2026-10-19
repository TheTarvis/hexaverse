# Game music integration

2026-10-18. Authorized by Travis: "great lets get them into the game" after
reviewing the five self-hosted round 03 candidates.

## Implementation

- [GameMusicProvider](../frontend/components/audio/GameMusicProvider.tsx) owns
  one audio element, the five-track catalog, on/off/track/volume preferences,
  playback failures, cancellation, sequential repeat and lifecycle cleanup.
- [AppMusicProvider](../frontend/components/audio/AppMusicProvider.tsx) is
  mounted by the root [Providers](../frontend/components/providers.tsx). It
  keeps the player stable between `/` and `/systems/[systemId]`, and pauses it
  on other routes. Hidden tabs pause temporarily; returning resumes if music
  remains enabled. Explicit Pause or disabling music is the persisted off choice.
- [GameMusicControls](../frontend/components/audio/GameMusicControls.tsx) is
  composed into the shared Arrange HUD settings by
  [GameViewShell](../frontend/components/hud/GameViewShell.tsx). It preserves
  the existing account actions and mobile settings/focus behavior. Controls
  safely omit themselves in fixtures without a music provider.
- Original MP3 files and their attribution/source manifest remain in
  [audio/ambient-round-03](../frontend/public/audio/ambient-round-03).
  Music now defaults on after reading preferences. Saved off attaches no source;
  browser-blocked autoplay retries on a game interaction without saving off.
  Production
  preferences use `hexaverse:music:v1`; audition notes use separate keys.

## Verification

- Eleven focused tests exercise default-on/saved-off, preference migration,
  blocked autoplay and trusted-interaction retry, playlist wrap, settings and
  route continuity, leaving the game, hidden tabs, cleanup, corrupt/blocked
  storage, stale rejected play requests and retry. Media methods are simulated
  in jsdom; browser checks below establish actual playback.
- Existing workspace, account settings, app providers, layout gate and galaxy
  component regression tests pass (107 tests including the new eleven).
- TypeScript and scoped ESLint/file validation pass.
- Headless Chromium reviewed the real shared HUD story at 1440×1000 and
  390×844. Actual MP3 playback advances; settings close and simulated scene
  changes retain one element, URL and advancing position. Next, volume,
  attribution, saved track/volume, initial silent reload and phone settings worked
  before the follow-up request changed the default (current autoplay checks below).
  Screenshots: `/tmp/hexaverse-game-music-desktop.png` and
  `/tmp/hexaverse-game-music-mobile.png`.
- A fresh anonymous Chromium session also opened the live Next.js game at
  `http://127.0.0.1:20200/`, played a local MP3 through Arrange HUD and verified
  closing settings preserved playback. Screenshot:
  `/tmp/hexaverse-live-music.png`. No real account, corporation or fleet was
  selected or mutated.
- Follow-up: Travis requested default-on unless explicitly turned off locally.
  Live-game Chromium checks forced both permissive and interaction-required
  autoplay policies. Permissive playback advances on load. Blocked playback
  retains on, retries on the first trusted game click, and starts successfully.
  Pause saves off; reload and later game clicks make no playback attempt while
  off. The Music enabled checkbox restores playback. Screenshot:
  `/tmp/hexaverse-music-autoplay.png`. No account or gameplay mutations.

Browser viewport emulation is not physical Safari/iPhone verification. Real
game-route continuity is covered by the persistent-root structure and component
tests; the browser scene-switch fixture remounts the real workspace while keeping
the provider alive. Authenticated system travel was not exercised. No deployment
or push was requested or performed. Track transitions retain original endings;
no seamless loop edits, crossfades or loudness normalization were performed.

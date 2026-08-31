## MODIFIED Requirements

### Requirement: Home-Only Initial Fog, No Lanes Charted
The system SHALL, on spawn, mark only the home system `explored` in the new
corporation's knowledge (`galaxy-knowledge`) and SHALL chart no lanes —
discovering onward roads is left to flying out and reaching them: attaching
to a lane's own gate body charts it (`galaxy-knowledge`'s "Gate-Attachment
Knowledge Write"), and a lane is otherwise chartable only by traveling it or
by buying intel on it. Spawn itself writes neither.

#### Scenario: Spawn charts no lanes
- **WHEN** a corporation spawns
- **THEN** its home system's knowledge tier becomes `explored` and its
  charted-lane set remains empty

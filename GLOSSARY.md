# Hexaverse glossary

| Term | Meaning |
| --- | --- |
| Account | Firebase-authenticated user identity. |
| Corporation | Player entity linked to an account; owns fleets, credits and observations. |
| Galaxy | Procedurally generated graph of systems and inter-system lanes. |
| System | Local continuous 3D space containing stars, orbiting bodies and features. |
| Lane | Inter-system travel connection; corporations chart lanes through observation or travel. |
| Fleet | Corporation-owned unit with a continuous motion state, cargo and action channels. |
| Burn | Solved continuous-space movement executed through the action spine. |
| World time | Server-authoritative simulation time, stored as `WorldMillis`. |
| Action | Asynchronous verb with a commit, ETA and registered resolution function. |
| Movement channel | Fleet's single-slot channel shared by movement and mining. |
| Sensor channel | Fleet's separate single-slot channel for scanning. |
| Observation | Corporation-scoped knowledge with live coverage and remembered state. |
| Fog | Server projection that limits reads to what a corporation can see or remembers. |
| Scan | Radial echo following a fleet; reveals eligible features and charts lanes on resolution. |
| Station | Dockable trading venue, distinct from mineable interior features. |
| Credits | Corporation balance mutated through an idempotent transaction ledger. |
| Demand | Ordered market entries under a venue key, including the NPC floor. |

Physics lives in Go. Shared market fixtures pin the market's Go/TypeScript
mirror; a renderer's coordinates represent continuous space, not ring slots.

# Hexaverse glossary

| Term | Meaning |
| --- | --- |
| Account | Firebase-authenticated user identity. |
| Corporation | Player entity linked to an account; owns fleets, credits and observations. |
| Galaxy | Procedurally generated graph of systems and inter-system lanes. |
| System | Local continuous 3D space containing stars, orbiting bodies and features. |
| Lane | Inter-system travel connection; corporations chart lanes through observation or travel. |
| Fleet | Corporation-owned group of one or more ships that travels and acts together. |
| Command fleet | Owned fleet currently chosen to receive the player's commands; inspecting another object does not change this choice. |
| Inspected object | System object whose known details the player is examining, independently of the command fleet. |
| Travel | Movement of a whole fleet to a destination, including a point in empty space; distinct from transferring ships between fleets. |
| Burn | Solved continuous-space movement executed through the action spine. |
| World time | Server-authoritative simulation time, stored as `WorldMillis`. |
| Action | Asynchronous verb with a commit, ETA and registered resolution function. |
| Movement channel | Fleet's single-slot channel shared by movement and mining. |
| Sensor channel | Fleet's separate single-slot channel for scanning. |
| Observation | Corporation-scoped knowledge with live coverage and remembered state. |
| Fog | Server projection that limits reads to what a corporation can see or remembers. |
| Contact | Live anonymous presence of a foreign fleet; identity and hull composition are undisclosed. |
| Scan | Former umbrella term for sensor activity; use Sweep for discovery and Analyze for target examination. |
| Sweep | Area sensor search for hidden or unresolved objects. |
| Analyze | Targeted examination that establishes a detected object's category and reveals more detailed information about it. |
| Unresolved contact | Detected presence that has not yet been analyzed. |
| Stealth | Cat-and-mouse concealment in which a fleet's burns and scans expose its presence, while scanning a contact reveals more about it. |
| Station | Dockable trading venue, distinct from mineable interior features. |
| Credits | Corporation balance mutated through an idempotent transaction ledger. |
| Demand | Ordered market entries under a venue key, including the NPC floor. |

Physics lives in Go. Shared market fixtures pin the market's Go/TypeScript
mirror; a renderer's coordinates represent continuous space, not ring slots.

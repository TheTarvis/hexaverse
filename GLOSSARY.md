# Hexaverse glossary

Settled vocabulary; [domain documentation](docs/README.md) owns rules, current
implementation gaps and open questions.

| Term | Meaning |
| --- | --- |
| [Account](docs/domains/discovery-and-identity.md) | Firebase-authenticated user identity. |
| [Corporation](docs/domains/discovery-and-identity.md) | Player entity linked to an account; owns fleets, credits and observations. |
| [Galaxy](docs/domains/world.md) | Procedurally generated graph of systems and inter-system lanes. |
| [System](docs/domains/world.md) | Local continuous 3D space containing stars, orbiting bodies and features. |
| [Lane](docs/domains/travel.md) | Inter-system travel connection; corporations chart lanes through observation or travel. |
| [Fleet](docs/domains/ships-and-fleets.md) | Corporation-owned group of one or more ships that travels and acts together. |
| [Command fleet](docs/domains/ships-and-fleets.md) | Owned fleet currently chosen to receive the player's commands; inspecting another object does not change this choice. |
| [Inspected object](docs/hud.md) | System object whose known details the player is examining, independently of the command fleet. |
| [Travel](docs/domains/travel.md) | Movement of a whole fleet to a destination, including a point in empty space; distinct from transferring ships between fleets. |
| [Burn](docs/domains/travel.md) | Solved continuous-space movement executed through the action spine. |
| [World time](docs/domains/actions-and-time.md) | Server-authoritative simulation time, stored as `WorldMillis`. |
| [Action](docs/domains/actions-and-time.md) | Asynchronous verb with a commit, ETA and registered resolution function. |
| [Movement channel](docs/domains/actions-and-time.md) | Fleet's single-slot channel shared by movement and mining. |
| [Sensor channel](docs/domains/actions-and-time.md) | Fleet's separate single-slot channel for scanning. |
| [Observation](docs/domains/sensors-and-stealth.md) | Corporation-scoped knowledge with live coverage and remembered state. |
| [Fog](docs/domains/sensors-and-stealth.md) | Server projection that limits reads to what a corporation can see or remembers. |
| [Contact](docs/domains/sensors-and-stealth.md) | Live anonymous presence of a foreign fleet; identity and hull composition are undisclosed. |
| [Scan](docs/domains/sensors-and-stealth.md) | Former umbrella term for sensor activity; use Sweep for discovery and Analyze for target examination. |
| [Sweep](docs/domains/sensors-and-stealth.md) | Area sensor search for hidden or unresolved objects. |
| [Analyze](docs/domains/sensors-and-stealth.md) | Targeted examination that establishes a detected object's category and reveals more detailed information about it. |
| [Unresolved contact](docs/domains/sensors-and-stealth.md) | Detected presence that has not yet been analyzed. |
| [Anomaly](docs/domains/sensors-and-stealth.md) | An unexplained discovery awaiting analysis; it may prove to be a ship, an ancient artifact, an unusual physical phenomenon or something else. |
| [Last-known position](docs/domains/sensors-and-stealth.md) | Position recorded at an object's last observation; it does not update without a new observation. |
| [Drive signature](docs/domains/sensors-and-stealth.md) | Detectable emissions produced by an operating drive. |
| [Ship signature](docs/domains/sensors-and-stealth.md) | Persistent signature belonging to an individual ship, which can be associated with learned or traded intelligence. |
| [Detected](docs/domains/sensors-and-stealth.md) | Sensing stage in which a presence is known but its ship count is unknown. |
| [Resolved](docs/domains/sensors-and-stealth.md) | Sensing stage in which distinct drives can be distinguished within a detected presence. |
| [Identified](docs/domains/sensors-and-stealth.md) | Sensing stage in which a signature is associated with known intelligence. |
| [Signature analysis](docs/domains/sensors-and-stealth.md) | Targeted examination of a signature that alerts the target being examined. |
| [Laser](docs/domains/combat.md) | Directed-energy weapon constrained by range and available power. |
| [Missile](docs/domains/combat.md) | Weapon with longer engagement range than a laser. |
| [Point-defense cannon (PDC)](docs/domains/combat.md) | Defensive cannon used to counter incoming threats. |
| [Stealth](docs/domains/sensors-and-stealth.md) | Cat-and-mouse concealment in which a fleet's burns and scans expose its presence, while scanning a contact reveals more about it. |
| [Station](docs/domains/stations.md) | Dockable trading venue, distinct from mineable interior features. |
| [Credits](docs/domains/economy.md) | Corporation balance mutated through an idempotent transaction ledger. |
| [Demand](docs/domains/economy.md) | Ordered market entries under a venue key, including the NPC floor. |

Physics lives in Go. Shared market fixtures pin the market's Go/TypeScript
mirror; a renderer's coordinates represent continuous space, not ring slots.

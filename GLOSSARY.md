# Hexaverse

Shared vocabulary for the space game. [Domain documentation](docs/README.md) owns
gameplay rules, implementation gaps and open questions.

## Language

### Identity and discovery

**[Identity](docs/domains/discovery-and-identity.md)**:
The relationship between a player's account and the corporation representing them in the game.

**[Discovery](docs/domains/discovery-and-identity.md)**:
Exploration recognition and rights associated with finding, arriving at, surveying and naming world objects.

**[Account](docs/domains/discovery-and-identity.md)**:
Player login identity associated with a corporation.

**[Corporation](docs/domains/discovery-and-identity.md)**:
Player entity linked to an account; owns fleets, credits and observations.

**[Control](docs/domains/discovery-and-identity.md)**:
A corporation’s current authority over a body or system, including naming authority; distinct from ownership of individual assets and historical discovery credit.

**[Contested control](docs/domains/discovery-and-identity.md)**:
A dispute between corporations asserting competing authority over the same body or system.

**[Dissolution](docs/domains/discovery-and-identity.md)**:
A player’s voluntary ending of their corporation while retaining their account.

### World and travel

**[World](docs/domains/world.md)**:
The shared game environment, comprising the galaxy, its systems and the objects within them.

**[Galaxy](docs/domains/world.md)**:
Procedurally generated graph of systems and inter-system lanes.

**[System](docs/domains/world.md)**:
Local continuous 3D space containing stars, orbiting bodies and features.

**[Lane](docs/domains/travel.md)**:
Inter-system travel connection; corporations chart lanes through observation or travel.

**[Route](docs/domains/travel.md)**:
Ordered journey through connected systems along a sequence of lanes.

**[Travel](docs/domains/travel.md)**:
Movement of a whole fleet to a destination, including a point in empty space; distinct from transferring ships between fleets.
_Avoid_: Transfer (when referring to fleet travel; transfer concerns ships between fleets).

**[Burn](docs/domains/travel.md)**:
A powered leg of a fleet’s continuous-space travel.

### Ships and command

**[Ship](docs/domains/ships-and-fleets.md)**:
An individual spacecraft belonging to a fleet; its hull and capabilities contribute to the fleet's composition.
_Avoid_: Fleet (when referring to an individual ship).

**[Fleet](docs/domains/ships-and-fleets.md)**:
Corporation-owned group of one or more ships that travels and acts together.

**[Command fleet](docs/domains/ships-and-fleets.md)**:
Owned fleet currently chosen to receive the player's commands; inspecting another object does not change this choice.

**[Inspected object](docs/hud.md)**:
System object whose known details the player is examining, independently of the command fleet.

### Actions and time

**[World time](docs/domains/actions-and-time.md)**:
The shared simulation time of the game world.

**[Action](docs/domains/actions-and-time.md)**:
A timed command with an expected completion time and an outcome.

**[Movement channel](docs/domains/actions-and-time.md)**:
Fleet's single-slot channel shared by movement and mining.

**[Sensor channel](docs/domains/actions-and-time.md)**:
Fleet's separate single-slot channel for scanning.

### Sensors and stealth

**[Sensors](docs/domains/sensors-and-stealth.md)**:
Ship capabilities for observing presences, distinguishing their sources and identifying them.

**[Observation](docs/domains/sensors-and-stealth.md)**:
Corporation-scoped knowledge with live coverage and remembered state.

**[Fog](docs/domains/sensors-and-stealth.md)**:
The limits of a corporation’s knowledge of the world, including live observations and remembered information.

**[Contact](docs/domains/sensors-and-stealth.md)**:
Live anonymous presence of a foreign fleet; identity and hull composition are undisclosed.

**[Scan](docs/domains/sensors-and-stealth.md)**:
Former umbrella term for sensor activity; use Sweep for discovery and Analyze for target examination.

**[Sweep](docs/domains/sensors-and-stealth.md)**:
Area sensor search for hidden or unresolved objects.
_Avoid_: Scan (when referring specifically to an area search).

**[Analyze](docs/domains/sensors-and-stealth.md)**:
Targeted examination that establishes a detected object's category and reveals more detailed information about it.
_Avoid_: Scan (when referring specifically to targeted examination).

**[Unresolved contact](docs/domains/sensors-and-stealth.md)**:
Detected presence that has not yet been analyzed.

**[Anomaly](docs/domains/sensors-and-stealth.md)**:
An unexplained discovery awaiting analysis; it may prove to be a ship, an ancient artifact, an unusual physical phenomenon or something else.

**[Last-known position](docs/domains/sensors-and-stealth.md)**:
Position recorded at an object's last observation; it does not update without a new observation.

**[Drive signature](docs/domains/sensors-and-stealth.md)**:
Detectable emissions produced by an operating drive.

**[Ship signature](docs/domains/sensors-and-stealth.md)**:
Persistent signature belonging to an individual ship, which can be associated with learned or traded intelligence.

**[Detected](docs/domains/sensors-and-stealth.md)**:
Sensing stage in which a presence is known but its ship count is unknown.

**[Resolved](docs/domains/sensors-and-stealth.md)**:
Sensing stage in which distinct drives can be distinguished within a detected presence.

**[Identified](docs/domains/sensors-and-stealth.md)**:
Sensing stage in which a signature is associated with known intelligence.

**[Signature analysis](docs/domains/sensors-and-stealth.md)**:
Targeted examination of a signature that alerts the target being examined.

**[Stealth](docs/domains/sensors-and-stealth.md)**:
Cat-and-mouse concealment in which a fleet's burns and scans expose its presence, while scanning a contact reveals more about it.

### Combat

**[Combat](docs/domains/combat.md)**:
Engagements between ships or fleets involving weapons, defensive systems and escape.

**[Laser](docs/domains/combat.md)**:
Directed-energy weapon constrained by range and available power.

**[Missile](docs/domains/combat.md)**:
Weapon with longer engagement range than a laser.

**[Point-defense cannon (PDC)](docs/domains/combat.md)**:
Defensive cannon used to counter incoming threats.

### Stations and economy

**[Economy](docs/domains/economy.md)**:
The movement and exchange of resources, cargo, fuel, credits and intelligence between participants in the game.

**[Station](docs/domains/stations.md)**:
Dockable trading venue, distinct from mineable interior features.

**[Credits](docs/domains/economy.md)**:
The currency held and spent by corporations.

**[Demand](docs/domains/economy.md)**:
Requests to buy goods at a trading venue, including baseline NPC demand.

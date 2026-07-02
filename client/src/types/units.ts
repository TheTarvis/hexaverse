/**
 * Unit type definitions for Hexaverse
 */

// Base unit type that all other units inherit from
export interface BaseUnit {
  id: string;
  type: UnitType;
  position: {
    q: number;  // Cube coordinate X
    r: number;  // Cube coordinate Y
    s: number;  // Cube coordinate Z
  };
  level: number;
  ownerUid: string;  // Firebase user ID of the owner
}

// Possible unit types
export enum UnitType {
  SHIP = 'ship',
  BASE = 'base',
  MINING_SITE = 'mining_site',
  RESEARCH_SITE = 'research_site',
}

// Ship unit for exploration and combat
export interface Ship extends BaseUnit {
  type: UnitType.SHIP;
  // Add ship-specific properties here
}

// Base unit for establishing territory
export interface Base extends BaseUnit {
  type: UnitType.BASE;
  influenceRadius: number;  // Radius of territorial control
}

// Mining site for resource extraction
export interface MiningSite extends BaseUnit {
  type: UnitType.MINING_SITE;
  resourceType: string;
  extractionRate: number;
}

// Research site for tech advancement
export interface ResearchSite extends BaseUnit {
  type: UnitType.RESEARCH_SITE;
  researchField: string;
  researchRate: number;
}

// Union type for all possible units
export type Unit = Ship | Base | MiningSite | ResearchSite;

// Helper type for unplaced units (during colony creation)
export interface UnplacedUnit {
  type: UnitType;
  level: number;
} 
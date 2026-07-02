import { createNoise2D } from 'simplex-noise';

// Constants for procedural generation
const STAR_RICH_THRESHOLD = 0.6;    // Higher values = more star-rich areas
const DEAD_ZONE_THRESHOLD = -0.4;   // Lower values = more dead zones
const BARRIER_MIN = -0.2;           // Minimum value for barriers
const BARRIER_MAX = 0.2;            // Maximum value for barriers

// Galaxy constants
export const GALAXY_RADIUS = 50;           // Galaxy radius in tiles
const GALAXY_SCALE = 0.05;          // Scale for noise function (controls feature size)

// Tile type definitions
export enum TileType {
  STAR_RICH = 'star_rich', // High-value, resource-dense areas
  NORMAL = 'normal',       // Standard tiles
  DEAD_ZONE = 'dead_zone', // Low-value areas
  BARRIER = 'barrier'      // Movement/scanning-impeding areas like nebulae
}

// Create the noise function with a random seed
export function createNoiseGenerator(seed?: number) {
  // If no seed is provided, generate a random one
  const actualSeed = seed || Math.random();
  return createNoise2D(() => actualSeed);
}

/**
 * Determines the tile type based on noise value
 * @param noiseValue Simplex noise value between -1 and 1
 * @returns The type of tile based on noise thresholds
 */
export function getTileTypeFromNoise(noiseValue: number): TileType {
  if (noiseValue > STAR_RICH_THRESHOLD) {
    return TileType.STAR_RICH;
  } else if (noiseValue < DEAD_ZONE_THRESHOLD) {
    return TileType.DEAD_ZONE;
  } else if (noiseValue >= BARRIER_MIN && noiseValue <= BARRIER_MAX) {
    return TileType.BARRIER;
  } else {
    return TileType.NORMAL;
  }
}

/**
 * Generate noise value for a specific coordinate
 * @param noise2D The noise generator function
 * @param q Q coordinate (cube)
 * @param r R coordinate (cube) 
 * @returns Noise value between -1 and 1
 */
export function getNoiseForCoordinates(noise2D: ReturnType<typeof createNoise2D>, q: number, r: number): number {
  // Apply galaxy scale to coordinates to get appropriate feature size
  return noise2D(q * GALAXY_SCALE, r * GALAXY_SCALE);
}

/**
 * Check if coordinates are within galaxy bounds
 * @param q Q coordinate (cube)
 * @param r R coordinate (cube)
 * @param s S coordinate (cube)
 * @returns Boolean indicating if the coordinates are inside the galaxy
 */
export function isWithinGalaxy(q: number, r: number, s: number): boolean {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= GALAXY_RADIUS;
}

/**
 * Calculate the cube distance between two coordinates
 * @param q1 First q coordinate
 * @param r1 First r coordinate
 * @param s1 First s coordinate
 * @param q2 Second q coordinate
 * @param r2 Second r coordinate
 * @param s2 Second s coordinate
 * @returns The distance in tiles
 */
export function cubeDistance(q1: number, r1: number, s1: number, q2: number, r2: number, s2: number): number {
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
}

/**
 * Calculate resource density based on tile type and noise value
 * @param tileType The type of the tile
 * @param noiseValue The raw noise value
 * @returns A resource density value between 0 and 1
 */
export function calculateResourceDensity(tileType: TileType, noiseValue: number): number {
  switch (tileType) {
    case TileType.STAR_RICH:
      // Scale from 0.6-1.0 noise to 0.8-1.0 density
      return 0.8 + (noiseValue - 0.6) * 0.5;
    case TileType.NORMAL:
      // Scale to 0.3-0.7 density
      return 0.3 + (noiseValue + 1) * 0.2;
    case TileType.DEAD_ZONE:
      // Scale to 0.0-0.2 density
      return Math.max(0, noiseValue + 0.6) * 0.33;
    case TileType.BARRIER:
      // Barriers have low resources
      return 0.1;
    default:
      return 0.5;
  }
} 
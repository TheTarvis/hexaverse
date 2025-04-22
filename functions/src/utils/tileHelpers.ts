import { HttpsError } from "firebase-functions/v2/https";

/**
 * Predefined neighbor offsets for hexagonal tiles using cube coordinates (q,r,s)
 */
export const neighborOffsets = [
  { q: 1, r: -1, s: 0 },
  { q: 1, r: 0,  s: -1 },
  { q: 0, r: 1,  s: -1 },
  { q: -1, r: 1, s: 0 },
  { q: -1, r: 0, s: 1 },
  { q: 0, r: -1, s: 1 }
];

/**
 * Checks if a tile is adjacent to any tile in the colony
 * @param q - Q coordinate of the tile to check
 * @param r - R coordinate of the tile to check
 * @param s - S coordinate of the tile to check
 * @param colonyTileIds - Array of tile IDs in the colony
 * @returns boolean indicating if the tile is adjacent to the colony
 */
export function isTileAdjacentToColony(q: number, r: number, s: number, colonyTileIds: string[]): boolean {
  const neighborTileIds = neighborOffsets.map(offset =>
    `${q + offset.q}#${r + offset.r}#${s + offset.s}`
  );

  // Check if at least one neighbor exists in colonyTileIds
  return (colonyTileIds || []).some(id => neighborTileIds.includes(id));
}

/**
 * Verifies that a tile is adjacent to a colony and throws an error if not
 * @param q - Q coordinate of the tile to check
 * @param r - R coordinate of the tile to check
 * @param s - S coordinate of the tile to check
 * @param colonyTileIds - Array of tile IDs in the colony
 */
export function verifyTileAdjacency(q: number, r: number, s: number, colonyTileIds: string[]): void {
  return;
  // TODO:TW Game flag or set up?
  if (!isTileAdjacentToColony(q, r, s, colonyTileIds)) {
    throw new HttpsError('failed-precondition', 'New tile must be adjacent to your existing colony');
  }
} 
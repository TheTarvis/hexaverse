import { Tile } from '@/types/tiles'
import * as THREE from 'three'

/**
 * Get color based on tile type and various parameters
 */
export function getTileColor(
  tile: Tile,  
  currentUserUid?: string,
  options?: {
    colorScheme?: string;
    colonyColor? : string,
    distance? : number,
  }
): string {

  // // Handle enemy tiles - show them as red
  if (tile.controllerUid && currentUserUid && tile.controllerUid !== currentUserUid) {
    // Make enemy tiles bright red for high visibility
    return '#FF3333'; // Brighter red color for enemy tiles
  }

  // // Handle enemy tiles - show them as red
  if (tile.controllerUid && currentUserUid && tile.controllerUid == currentUserUid) {
    return options?.colonyColor ? options?.colonyColor : '#FF3333'; // Brighter red color for enemy tiles
  }

  // Enhanced Viewable tile coloring based on distance
  if (tile.visibility == 'unexplored' && options?.distance !== undefined) {
    // Calculate the brightness based on view distance
    // Closer tiles are brighter, further tiles are darker
    const maxDistance = 3; // Adjust based on your typical view depth
    const baseBrightness = 0.3; // Base brightness of the closest viewable tile
    const minBrightness = 0.05; // Minimum brightness of the furthest viewable tile
    
    // Calculate the brightness factor: 1.0 for closest, approaching 0 for furthest
    const distanceFactor = Math.max(0, 1 - (options.distance - 1) / maxDistance);
    
    // Calculate final brightness
    const brightness = minBrightness + (baseBrightness - minBrightness) * distanceFactor;
    
    // Dark violet with variable brightness
    return new THREE.Color(brightness * 0.7, brightness * 0.7, brightness).getStyle();
  }
  
  if (options?.colorScheme === 'monochrome') {
    return new THREE.Color(0.4, 0.4, 0.4).getStyle();
  }
  
  if (options?.colorScheme === 'type') {
    // Color based on tile type
    switch(tile.type.toLowerCase()) {
      case 'normal': return new THREE.Color(0.3, 0.7, 0.4).getStyle(); // Green
      case 'water': return new THREE.Color(0.2, 0.4, 0.8).getStyle(); // Blue
      case 'mountain': return new THREE.Color(0.6, 0.6, 0.6).getStyle(); // Gray
      case 'desert': return new THREE.Color(0.9, 0.8, 0.3).getStyle(); // Yellow
      case 'forest': return new THREE.Color(0.1, 0.5, 0.1).getStyle(); // Dark green
      case 'plain': return new THREE.Color(0.8, 0.9, 0.3).getStyle(); // Light green
      default: 
        // Fallback to rainbow if type is unknown
        return new THREE.Color(
          0.5 + 0.5 * Math.sin(tile.q + tile.r),
          0.5 + 0.5 * Math.sin(tile.r + tile.s),
          0.5 + 0.5 * Math.sin(tile.s + tile.q)
        ).getStyle();
    }
  }
  
  if (options?.colorScheme === 'resources') {
    // Color based on resource density
    return new THREE.Color(
      0.2 + 0.8 * tile.resourceDensity,
      0.7 - 0.5 * tile.resourceDensity,
      0.3
    ).getStyle();
  }
  
  if (options?.colorScheme === 'rainbow') {
    return new THREE.Color(
      0.5 + 0.5 * Math.sin(tile.q + tile.r),
      0.5 + 0.5 * Math.sin(tile.r + tile.s),
      0.5 + 0.5 * Math.sin(tile.s + tile.q)
    ).getStyle();
  }
  
  // Default color scheme
  return new THREE.Color(
    0.4 + 0.4 * Math.sin(tile.q * 0.8 + tile.r * 0.3),
    0.5 + 0.3 * Math.sin(tile.r * 0.5 + tile.s * 0.4),
    0.6 + 0.4 * Math.sin(tile.s * 0.6 + tile.q * 0.2)
  ).getStyle();
} 
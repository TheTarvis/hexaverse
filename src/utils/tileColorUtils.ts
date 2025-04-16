import * as THREE from 'three'

/**
 * Get color based on tile type and various parameters
 */
export function getTileColor(
  type: string, 
  colorScheme: string, 
  q: number, 
  r: number, 
  s: number, 
  resourceDensity = 0.5, 
  viewDistance?: number, 
  colonyColor?: string,
  tileControllerUid?: string,
  currentUserUid?: string
): string {
  // // Handle enemy tiles - show them as red
  if (tileControllerUid && currentUserUid && tileControllerUid !== currentUserUid) {
    console.log(`getTileColor: Enemy tile detected at q=${q},r=${r},s=${s}`);
    console.log(`getTileColor: tileControllerUid=${tileControllerUid}, currentUserUid=${currentUserUid}`);
    // Make enemy tiles bright red for high visibility
    return '#FF3333'; // Brighter red color for enemy tiles
  }

  // Log when we evaluate tiles with controller info
  if (tileControllerUid) {
    console.log(`getTileColor: Tile with controller at q=${q},r=${r},s=${s}, controllerUid=${tileControllerUid}`);
  }

  // Enhanced Viewable tile coloring based on distance
  if (type === 'viewable' && viewDistance !== undefined) {
    // Calculate the brightness based on view distance
    // Closer tiles are brighter, further tiles are darker
    const maxDistance = 3; // Adjust based on your typical view depth
    const baseBrightness = 0.3; // Base brightness of the closest viewable tile
    const minBrightness = 0.05; // Minimum brightness of the furthest viewable tile
    
    // Calculate the brightness factor: 1.0 for closest, approaching 0 for furthest
    const distanceFactor = Math.max(0, 1 - (viewDistance - 1) / maxDistance);
    
    // Calculate final brightness
    const brightness = minBrightness + (baseBrightness - minBrightness) * distanceFactor;
    
    // Dark violet with variable brightness
    return new THREE.Color(brightness * 0.7, brightness * 0.7, brightness).getStyle();
  }
  
  if (colorScheme === 'monochrome') {
    return new THREE.Color(0.4, 0.4, 0.4).getStyle();
  }
  
  if (colorScheme === 'type') {
    // Color based on tile type
    switch(type.toLowerCase()) {
      case 'normal': return new THREE.Color(0.3, 0.7, 0.4).getStyle(); // Green
      case 'water': return new THREE.Color(0.2, 0.4, 0.8).getStyle(); // Blue
      case 'mountain': return new THREE.Color(0.6, 0.6, 0.6).getStyle(); // Gray
      case 'desert': return new THREE.Color(0.9, 0.8, 0.3).getStyle(); // Yellow
      case 'forest': return new THREE.Color(0.1, 0.5, 0.1).getStyle(); // Dark green
      case 'plain': return new THREE.Color(0.8, 0.9, 0.3).getStyle(); // Light green
      default: 
        // Fallback to rainbow if type is unknown
        return new THREE.Color(
          0.5 + 0.5 * Math.sin(q + r),
          0.5 + 0.5 * Math.sin(r + s),
          0.5 + 0.5 * Math.sin(s + q)
        ).getStyle();
    }
  }
  
  if (colorScheme === 'resources') {
    // Color based on resource density
    return new THREE.Color(
      0.2 + 0.8 * resourceDensity,
      0.7 - 0.5 * resourceDensity,
      0.3
    ).getStyle();
  }
  
  if (colorScheme === 'rainbow') {
    return new THREE.Color(
      0.5 + 0.5 * Math.sin(q + r),
      0.5 + 0.5 * Math.sin(r + s),
      0.5 + 0.5 * Math.sin(s + q)
    ).getStyle();
  }
  
  // Default color scheme
  return new THREE.Color(
    0.4 + 0.4 * Math.sin(q * 0.8 + r * 0.3),
    0.5 + 0.3 * Math.sin(r * 0.5 + s * 0.4),
    0.6 + 0.4 * Math.sin(s * 0.6 + q * 0.2)
  ).getStyle();
} 
'use client'

import React, { useMemo } from 'react'
import { Canvas, ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { ColonyTile } from '@/types/colony'

interface TileMap {
  [key: string]: ColonyTile
}

// Add an interface for the selected tile
interface SelectedTile {
  q: number;
  r: number;
  s: number;
  color: string;
  type?: string;
  resourceDensity?: number;
}

interface HexGridCanvasProps {
  wireframe: boolean;
  hexSize: number;
  colorScheme: string;
  tileMap: TileMap;
  fogTiles: { q: number, r: number, s: number }[];
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  onTileSelect: (tile: SelectedTile) => void;
  onTileAdd?: (q: number, r: number, s: number) => void;
  colonyColor?: string;
}

// Convert cube coordinates to pixel coordinates (for pointy-top orientation)
function cubeToPixel(q: number, r: number, s: number, size = 1): [number, number, number] {
  // For pointy-top hexagons
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r)
  const y = size * (3/2 * r)
  return [x, y, 0]
}

// Get color based on tile type and colony color
function getTileColor(type: string, colorScheme: string, q: number, r: number, s: number, resourceDensity = 0.5, colonyColor?: string): string {
  // Always use the same color for fog tiles, regardless of color scheme
  if (type === 'fog') {
    return new THREE.Color(0.2, 0.2, 0.3).getStyle(); // Dark violet
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

function HexagonMesh({ 
  position = [0, 0, 0] as [number, number, number], 
  color = 'teal', 
  wireframe = false,
  q, 
  r, 
  s,
  type,
  resourceDensity,
  isFogTile = false,
  onTileSelect,
  onTileAdd
}: { 
  position?: [number, number, number], 
  color?: string, 
  wireframe?: boolean,
  q: number,
  r: number,
  s: number,
  type?: string,
  resourceDensity?: number,
  isFogTile?: boolean,
  onTileSelect: (tile: SelectedTile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void
}) {
  // Create a hexagon shape
  const hexShape = useMemo(() => {
    const shape = new THREE.Shape()
    const size = 1
    
    // Create pointy-top hexagon
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6
      const x = size * Math.cos(angle)
      const y = size * Math.sin(angle)
      
      if (i === 0) {
        shape.moveTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    }
    shape.closePath()
    
    return shape
  }, [])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    // Stop event propagation to prevent it from reaching Canvas
    event.stopPropagation()
    
    // Only handle clicks for fog tiles (adding tiles)
    if (!isFogTile || !onTileAdd) return;
    
    console.log(`Clicked fog tile at: q=${q}, r=${r}, s=${s}`);
    
    // Call the add tile handler
    onTileAdd(q, r, s);
  }

  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    // Stop event propagation
    event.stopPropagation();
    console.log(`Double-clicked hex at cube coordinates: q=${q}, r=${r}, s=${s}, type=${type}`)
    
    // Call the selection handler with tile info
    onTileSelect({
      q,
      r,
      s,
      color,
      type: isFogTile ? 'fog' : type,
      resourceDensity
    });
  }

  // Determine material properties based on tile type
  const opacity = isFogTile ? 0.7 : 1.0
  const transparent = isFogTile

  return (
    <mesh 
      position={position} 
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      // Make cursor change to pointer when hovering over hexagons
      onPointerOver={(e: ThreeEvent<PointerEvent>) => document.body.style.cursor = 'pointer'}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => document.body.style.cursor = 'default'}
    >
      <shapeGeometry args={[hexShape]} />
      <meshBasicMaterial 
        color={color} 
        wireframe={wireframe} 
        transparent={transparent}
        opacity={opacity}
      />
    </mesh>
  )
}

function HexGrid({ 
  wireframe = false, 
  hexSize = 1.2, 
  colorScheme = 'type', 
  tileMap = {} as TileMap,
  fogTiles = [] as { q: number, r: number, s: number }[],
  onTileSelect,
  onTileAdd,
  colonyColor
}: {
  wireframe?: boolean,
  hexSize?: number,
  colorScheme?: string,
  tileMap?: TileMap,
  fogTiles?: { q: number, r: number, s: number }[],
  onTileSelect: (tile: SelectedTile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void,
  colonyColor?: string
}) {
  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { position: [number, number, number]; color: string; q: number; r: number; s: number; type?: string; resourceDensity?: number; isFogTile: boolean }[] = []
    
    // Use the tile data from the tileMap
    Object.values(tileMap).forEach((tile) => {
      const q = tile.q;
      const r = tile.r;
      const s = tile.s;
      const type = tile.type;
      const resourceDensity = tile.resourceDensity || 0.5;
      
      // Generate color based on tile type and selected scheme
      const color = getTileColor(type, colorScheme, q, r, s, resourceDensity, colonyColor);
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color,
        type,
        resourceDensity,
        isFogTile: false
      })
    })
    
    // Add fog tiles
    fogTiles.forEach((tile) => {
      const q = tile.q;
      const r = tile.r;
      const s = tile.s;
      
      // Generate color for fog tiles
      const color = getTileColor('fog', colorScheme, q, r, s);
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color,
        type: 'fog',
        resourceDensity: undefined,
        isFogTile: true
      })
    })
    
    return gridPositions
  }, [hexSize, colorScheme, tileMap, fogTiles, colonyColor])

  return (
    <>
      {positions.map((props, index) => (
        <HexagonMesh 
          key={index}
          position={props.position as [number, number, number]}
          color={props.color}
          wireframe={wireframe}
          q={props.q}
          r={props.r}
          s={props.s}
          type={props.type}
          resourceDensity={props.resourceDensity}
          isFogTile={props.isFogTile}
          onTileSelect={onTileSelect}
          onTileAdd={onTileAdd}
        />
      ))}
    </>
  )
}

export function HexGridCanvas({ 
  wireframe, 
  hexSize, 
  colorScheme, 
  tileMap, 
  fogTiles, 
  cameraPosition, 
  cameraTarget, 
  onTileSelect,
  onTileAdd,
  colonyColor
}: HexGridCanvasProps) {
  return (
    <Canvas
      camera={{ position: cameraPosition, fov: 45 }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      <OrbitControls
        target={cameraTarget}
        enablePan={true}
        enableZoom={true}
        enableRotate={false}
        minDistance={5}
        maxDistance={800}
        panSpeed={1.5}
        zoomSpeed={1.2}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
      />
      <HexGrid
        wireframe={wireframe}
        hexSize={hexSize}
        colorScheme={colorScheme}
        tileMap={tileMap}
        fogTiles={fogTiles}
        onTileSelect={onTileSelect}
        onTileAdd={onTileAdd}
        colonyColor={colonyColor}
      />
    </Canvas>
  )
} 
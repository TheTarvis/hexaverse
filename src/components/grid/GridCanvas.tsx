'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Tile } from '@/types/tiles'

// Updated interface for SelectedTile to include potential color field
interface SelectedTile {
  q: number;
  r: number;
  s: number;
  color: string;
  type?: string;
  resourceDensity?: number;
}

// Updated ViewableTile interface
export interface ViewableTile {
  q: number;
  r: number;
  s: number;
  distance: number;
  color?: string;
}

// Updated interface for TileMap using standard Tile with color
interface TileMap {
  [key: string]: Tile;
}

// Updated props interface
interface HexGridCanvasProps {
  wireframe: boolean;
  hexSize: number;
  tileMap: TileMap;
  viewTiles: ViewableTile[];
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  onTileSelect: (tile: SelectedTile) => void;
  onTileAdd?: (q: number, r: number, s: number) => void;
  followSelectedTile?: boolean;
}

// Convert cube coordinates to pixel coordinates (for pointy-top orientation)
function cubeToPixel(q: number, r: number, s: number, size = 1): [number, number, number] {
  // For pointy-top hexagons
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r)
  const y = size * (3/2 * r)
  return [x, y, 0]
}

// Add a PulsingHexagon component for animation
function PulsingHexagon({ 
  position = [0, 0, 0] as [number, number, number],
  color = 'white',
  onAnimationComplete
}: {
  position: [number, number, number],
  color: string,
  onAnimationComplete: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const animationDuration = 0.8; // Increased from 0.5 to 0.8 seconds for slower animation

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

  // Update animation every frame
  useFrame((state, delta) => {
    if (elapsedTime < animationDuration) {
      // Update elapsed time
      setElapsedTime(prev => prev + delta);
      
      // Calculate scale factor based on time (pulsing effect)
      const progress = elapsedTime / animationDuration;
      // Use Math.sin with reduced frequency (multiply by 1.5 instead of 2) for fewer, slower pulses
      const scale = 1 + 0.3 * Math.sin(progress * Math.PI * 2);
      
      // Update scale
      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
        
        // Fade out opacity near the end
        const opacity = 1 - (progress * 0.8);
        (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    } else {
      // Animation complete
      onAnimationComplete();
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <shapeGeometry args={[hexShape]} />
      <meshBasicMaterial 
        color={color} 
        transparent={true}
        opacity={0.8}
      />
    </mesh>
  );
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
  isViewableTile = false,
  viewDistance,
  onTileSelect,
  onTileAdd,
  setClickedTile
}: { 
  position?: [number, number, number], 
  color?: string, 
  wireframe?: boolean,
  q: number,
  r: number,
  s: number,
  type?: string,
  resourceDensity?: number,
  isViewableTile?: boolean,
  viewDistance?: number,
  onTileSelect: (tile: SelectedTile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void,
  setClickedTile?: (coords: { q: number, r: number, s: number, position: [number, number, number], color: string } | null) => void
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
    
    // Only handle clicks for Viewable tiles (adding tiles)
    if (!isViewableTile || !onTileAdd) return;
    
    console.log(`Clicked viewable tile at: q=${q}, r=${r}, s=${s}`);
    
    // Set the clicked tile for animation
    if (setClickedTile) {
      setClickedTile({
        q, r, s,
        position,
        color
      });
    }
    
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
      type: isViewableTile ? 'viewable' : type,
      resourceDensity
    });
  }

  // Determine material properties based on tile type
  // Adjust opacity based on distance for viewable tiles
  const opacity = isViewableTile ? (viewDistance ? Math.max(0.4, 0.9 - (viewDistance * 0.1)) : 0.7) : 1.0;
  const transparent = isViewableTile;

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
  tileMap = {} as TileMap,
  viewableTiles = [] as ViewableTile[],
  onTileSelect,
  onTileAdd,
}: {
  wireframe?: boolean,
  hexSize?: number,
  tileMap?: TileMap,
  viewableTiles?: ViewableTile[],
  onTileSelect: (tile: SelectedTile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void,
}) {
  // Add state to track the clicked tile
  const [clickedTile, setClickedTile] = useState<{
    q: number,
    r: number,
    s: number,
    position: [number, number, number],
    color: string
  } | null>(null);

  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { 
      position: [number, number, number]; 
      color: string; 
      q: number; 
      r: number; 
      s: number; 
      type?: string; 
      resourceDensity?: number; 
      isViewableTile: boolean;
      viewDistance?: number;
    }[] = []
    
    // Use the tile data from the tileMap
    Object.values(tileMap).forEach((tile) => {
      const q = tile.q;
      const r = tile.r;
      const s = tile.s;
      const type = tile.type;
      const resourceDensity = tile.resourceDensity || 0.5;
      
      // Use the color from the tile object or fall back to a default
      const color = tile.color || '#CCCCCC';
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color,
        type,
        resourceDensity,
        isViewableTile: false
      })
    })
    
    // Add viewable tiles with distance information
    viewableTiles.forEach((tile) => {
      const q = tile.q;
      const r = tile.r;
      const s = tile.s;
      const distance = tile.distance;
      
      // Use the color from the viewable tile or fall back to a default
      const color = tile.color || '#AAAAAA';
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color,
        type: 'viewable',
        resourceDensity: undefined,
        isViewableTile: true,
        viewDistance: distance
      })
    })
    
    return gridPositions
  }, [hexSize, tileMap, viewableTiles])

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
          isViewableTile={props.isViewableTile}
          viewDistance={props.viewDistance}
          onTileSelect={onTileSelect}
          onTileAdd={onTileAdd}
          setClickedTile={setClickedTile}
        />
      ))}
      
      {/* Render the animation if there's a clicked tile */}
      {clickedTile && (
        <PulsingHexagon 
          position={clickedTile.position}
          color={clickedTile.color}
          onAnimationComplete={() => setClickedTile(null)}
        />
      )}
    </>
  )
}

// Add new CameraController component
function CameraController({ 
  targetPosition, 
  enabled = true 
}: { 
  targetPosition: [number, number, number]; 
  enabled: boolean;
}) {
  const { camera, controls } = useThree();
  const currentTarget = useRef<[number, number, number]>([0, 0, 0]);
  
  useFrame(() => {
    if (!enabled || !controls) return;
    
    // Smoothly interpolate camera target position
    currentTarget.current[0] += (targetPosition[0] - currentTarget.current[0]) * 0.05;
    currentTarget.current[1] += (targetPosition[1] - currentTarget.current[1]) * 0.05;
    currentTarget.current[2] += (targetPosition[2] - currentTarget.current[2]) * 0.05;
    
    // Update orbit controls target if it exists
    if ('target' in controls) {
      (controls as any).target.set(
        currentTarget.current[0],
        currentTarget.current[1],
        currentTarget.current[2]
      );
      
      if (typeof (controls as any).update === 'function') {
        (controls as any).update();
      }
    }
  });
  
  // Initialize current target on mount
  useEffect(() => {
    currentTarget.current = [...targetPosition];
  }, []);
  
  return null;
}

export function GridCanvas({
  wireframe, 
  hexSize, 
  tileMap, 
  viewTiles, 
  cameraPosition, 
  cameraTarget, 
  onTileSelect,
  onTileAdd,
  followSelectedTile = false,
}: HexGridCanvasProps) {
  const [currentCameraTarget, setCurrentCameraTarget] = useState<[number, number, number]>(cameraTarget);
  
  // Update camera target when a tile is selected
  const handleTileSelect = (tile: SelectedTile) => {
    if (followSelectedTile) {
      // Convert cube coordinates to pixel position
      const [x, y, z] = cubeToPixel(tile.q, tile.r, tile.s, hexSize);
      setCurrentCameraTarget([x, y, z]);
    }
    
    // Pass the tile to the parent's handler
    onTileSelect(tile);
  };
  
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
        makeDefault
      />
      <CameraController 
        targetPosition={currentCameraTarget} 
        enabled={followSelectedTile} 
      />
      <HexGrid
        wireframe={wireframe}
        hexSize={hexSize}
        tileMap={tileMap}
        viewableTiles={viewTiles}
        onTileSelect={handleTileSelect}
        onTileAdd={onTileAdd}
      />
    </Canvas>
  )
} 
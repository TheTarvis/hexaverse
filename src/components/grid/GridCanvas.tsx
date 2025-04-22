'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Instances, Instance } from '@react-three/drei'
import * as THREE from 'three'
import {Tile, TileMap} from '@/types/tiles'
import { useAuth } from '@/contexts/AuthContext'

// Updated interface for SelectedTile to include potential color field
interface SelectedTile {
  q: number;
  r: number;
  s: number;
  color: string;
  type?: string;
  resourceDensity?: number;
}


// Updated props interface
interface HexGridCanvasProps {
  wireframe: boolean;
  hexSize: number;
  tileMap: TileMap;
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

// Convert pixel coordinates to fractional cube coordinates (for pointy-top)
function pixelToCube(x: number, y: number, size = 1): [number, number, number] {
  const q = (Math.sqrt(3)/3 * x - 1/3 * y) / size;
  const r = (2/3 * y) / size;
  const s = -q - r; // s is derived
  return [q, r, s];
}

// Round fractional cube coordinates to the nearest integer cube coordinates
function cubeRound(q: number, r: number, s: number): [number, number, number] {
  let qRounded = Math.round(q);
  let rRounded = Math.round(r);
  let sRounded = Math.round(s);

  const qDiff = Math.abs(qRounded - q);
  const rDiff = Math.abs(rRounded - r);
  const sDiff = Math.abs(sRounded - s);

  // Reset the component with the largest difference to ensure q + r + s = 0
  if (qDiff > rDiff && qDiff > sDiff) {
    qRounded = -rRounded - sRounded;
  } else if (rDiff > sDiff) {
    rRounded = -qRounded - sRounded;
  } else {
    sRounded = -qRounded - rRounded;
  }

  return [qRounded, rRounded, sRounded];
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

// Function to create hexagon shape (can be moved outside components if preferred)
const createHexShape = () => {
  const shape = new THREE.Shape()
  const size = 1 // Base size before scaling by hexSize

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6 // Pointy-top orientation
    const x = size * Math.cos(angle)
    const y = size * Math.sin(angle)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

const hexShape = createHexShape(); // Create shape once
const hexGeometry = new THREE.ShapeGeometry(hexShape); // Create geometry from shape

function HexGrid({
  wireframe = false,
  hexSize = 1.2,
  tileMap = {} as TileMap,
  onTileSelect,
onTileAdd,
}: {
  wireframe?: boolean,
  hexSize?: number,
  tileMap?: TileMap,
  onTileSelect: (tile: SelectedTile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void,
}) {
  const { gl } = useThree(); // Get the WebGL renderer context
  const { user } = useAuth(); // Get the authenticated user
  const [clickedTile, setClickedTile] = useState<{
    q: number,
    r: number,
    s: number,
    position: [number, number, number],
    color: string
  } | null>(null);

  // Generate hexagon instance data
  const instanceData = useMemo(() => {
    return Object.values(tileMap).map((tile) => {
      const { q, r, s, type, resourceDensity = 0.5, color = '#CCCCCC', visibility } = tile;
      const position = cubeToPixel(q, r, s, hexSize);
      const isViewableTile = visibility === 'unexplored';
      // Adjust opacity based on distance for viewable tiles - using alpha in color
      const baseOpacity = isViewableTile ? 0.7 : 1.0; // Simplified opacity for now
      const finalColor = new THREE.Color(color);


      return {
        key: `${q}#${r}#${s}`, // Use tile.id if available, fallback to coords
        q, r, s,
        position,
        color: finalColor, // Pass THREE.Color object for potential alpha control
        type,
        resourceDensity,
        isViewableTile,
        // viewDistance, // Need to recalculate viewDistance if needed for opacity
        opacity: baseOpacity, // Store opacity separately if needed
      };
    });
  }, [tileMap, hexSize]);

  // Derive a stable key for the Instances component based on the tileMap content
  const instancesKey = useMemo(() => Object.keys(tileMap).sort().join('-'), [tileMap]);

  const handleInstanceClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    // 1. Raycast from camera to click point
    const camera = event.camera; // Camera used for the render

    // Create a raycaster
    const raycaster = new THREE.Raycaster();
    // Need mouse coordinates normalized to [-1, +1] range
    // Use gl.domElement (the canvas) to get the correct bounds
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1;
    const mouse = new THREE.Vector2(x, y);

    raycaster.setFromCamera(mouse, camera);

    // Define the Z=0 plane
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();

    // 2. Intersect ray with the plane
    if (raycaster.ray.intersectPlane(planeZ, intersectionPoint)) {
      // intersectionPoint now holds the x, y coordinates on the Z=0 plane

      // 3. Convert pixel coordinates to cube coordinates
      const [fq, fr, fs] = pixelToCube(intersectionPoint.x, intersectionPoint.y, hexSize);

      // 4. Round cube coordinates
      const [q, r, s] = cubeRound(fq, fr, fs);

      console.log(`Raycast Click: Pixel=(${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}), Cube=(${q}, ${r}, ${s})`);

      // 5. Use cube coordinates to find the tile
      const tileKey = `${q}#${r}#${s}`;
      const tile = tileMap[tileKey];

      if (!tile) {
        console.log(`Tile ${tileKey} not found.`);
        return; // No valid tile at this location
      }
      
      // Determine if the tile can be added/captured
      // Allow if it's unexplored OR controlled by someone else
      const canAddOrCapture = tile.visibility === 'unexplored' || (tile.controllerUid && tile.controllerUid !== user?.uid);

      console.log(`Clicked Tile: q=${q}, r=${r}, s=${s}, visibility=${tile.visibility}, controller=${tile.controllerUid}, canAdd=${canAddOrCapture}`);

      if (canAddOrCapture) {
        // Need pixel position for the animation - use the original cubeToPixel
        const pixelPosition = cubeToPixel(q, r, s, hexSize);

        setClickedTile({ 
          q: q, 
          r: r, 
          s: s, 
          position: pixelPosition, // Use calculated pixel position for center
          color: tile.color || '#CCCCCC' // Use tile's color
        });

        onTileAdd?.(q, r, s);
      } else {
        console.log(`Tile ${tileKey} is controlled by the current user (${user?.uid}), cannot add.`);
        // Optionally, trigger onTileSelect here if needed for own tiles
        // onTileSelect({ q, r, s, color: tile.color || '#CCCCCC', type: tile.type, resourceDensity: tile.resourceDensity });
      }

    } else {
      console.log("Raycast did not intersect Z=0 plane.");
    }
  };

  const handleInstanceDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;

    const instance = instanceData[event.instanceId];
    if (!instance) return;

    console.log(`Double-clicked instance ${event.instanceId} at cube coordinates: q=${instance.q}, r=${instance.r}, s=${instance.s}, type=${instance.type}`);

    onTileSelect({
      q: instance.q,
      r: instance.r,
      s: instance.s,
      color: instance.color.getStyle(),
      type: instance.isViewableTile ? 'viewable' : instance.type,
      resourceDensity: instance.resourceDensity,
    });
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'default';
  };

  return (
    <>
      <Instances
        key={instancesKey}
        limit={instanceData.length} // Set limit based on data length
        // range={instanceData.length} // Use range if limit is higher than needed
        geometry={hexGeometry} // Use the ShapeGeometry
        onClick={handleInstanceClick}
        onDoubleClick={handleInstanceDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Define the base material - remove vertexColors */}
        <meshBasicMaterial wireframe={wireframe} side={THREE.DoubleSide} />
        {/* Map data to Instance components */}
        {instanceData.map((data) => (
          <Instance
            key={data.key}
            position={data.position}
            // Rotation and scale can be set here if needed
            // rotation={[0, 0, 0]}
            // scale={1}
             color={data.color} // Pass the THREE.Color object
            // For individual opacity control, you might need InstancedMesh directly
            // or manipulate vertex colors/attributes if using a custom shader
          />
        ))}
      </Instances>

      {/* Render the animation separately */}
      {clickedTile && (
        <PulsingHexagon
          position={clickedTile.position}
          color={clickedTile.color}
          onAnimationComplete={() => setClickedTile(null)}
        />
      )}
    </>
  );
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
        onTileSelect={handleTileSelect}
        onTileAdd={onTileAdd}
      />
    </Canvas>
  )
} 
'use client'

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import {Tile, TileMap} from '@/types/tiles'
import { useAuth } from '@/contexts/AuthContext'
import { CameraTracker } from './CameraTracker'
import { cubeToPixel, pixelToCube, cubeRound } from '@/utils/gridUtils'
import { getTileColor } from '@/utils/tileColorUtils'



// Updated props interface
interface HexGridCanvasProps {
  wireframe: boolean;
  hexSize: number;
  tileMap: TileMap;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  onCameraStop: (pos: [number, number, number]) => void;
  onTileSelect: (tile: Tile) => void;
  onTileAdd?: (q: number, r: number, s: number) => void;
  onTileHover?: (tile: Tile | null) => void;
}

// Default camera values as stable references
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 0, 20];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

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

// Define shader materials for hexagons
const hexVertexShader = `
  attribute vec3 instancePosition;
  attribute vec3 instanceColor;
  attribute float instanceOpacity;
  
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vColor = instanceColor;
    vOpacity = instanceOpacity;
    
    // Apply instance position
    vec3 transformed = position + instancePosition;
    // Prevent z-fighting by adding a tiny z offset
    transformed.z += 0.01;
    
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const hexFragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vUv;
  
  // Function to check if we're inside a hexagon
  float isInsideHexagon(vec2 uv) {
    // Scale and center UVs to [-1, 1] range
    vec2 p = 2.0 * uv - 1.0;
    
    // Pointy-top hexagon formula
    float px = abs(p.x);
    float py = abs(p.y);
    
    // This is the hexagon "SDF" (signed distance field) function
    return step(px * 0.5 + py * 0.866, 0.9);
  }
  
  void main() {
    float insideHex = isInsideHexagon(vUv);
    if (insideHex < 0.5) discard;
    
    gl_FragColor = vec4(vColor, vOpacity);
  }
`;

// Wrap HexGrid in React.memo
const HexGrid = React.memo(function HexGrid({
  wireframe = false,
  hexSize = 1.2,
  tileMap = {} as TileMap,
  onTileSelect,
  onTileAdd,
  onTileHover,
}: {
  wireframe?: boolean,
  hexSize?: number,
  tileMap?: TileMap,
  onTileSelect: (tile: Tile) => void,
  onTileAdd?: (q: number, r: number, s: number) => void,
  onTileHover?: (tile: Tile | null) => void,
}) {
  const { gl, camera } = useThree(); // Get the WebGL renderer context
  const { user } = useAuth(); // Get the authenticated user
  const [clickedTile, setClickedTile] = useState<{
    q: number,
    r: number,
    s: number,
    position: [number, number, number],
    color: string
  } | null>(null);

  // Reference to the instanced mesh for raycasting
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Custom Instanced Mesh Geometry - Using a simple plane now, will be turned into hexagon by shader
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(1.732, 2, 1, 1); // Width is sqrt(3) to match hexagon dimensions
  }, []);

  // Debug effect to monitor tile processing
  useEffect(() => {
    const tileCount = Object.keys(tileMap).length;
    console.log(`[HexGrid] Processing ${tileCount} tiles for rendering`);
    if (tileCount > 0) {
      const sampleTile = tileMap[Object.keys(tileMap)[0]];
      console.log('[HexGrid] Sample tile:', sampleTile);
    }
  }, [tileMap]);

  // Process tile data for instanced mesh attributes
  const { instanceData, instancePositions, instanceColors, instanceOpacities } = useMemo(() => {
    const tiles = Object.values(tileMap);
    console.log(`[HexGrid] Creating instance data for ${tiles.length} tiles`);

    const positions = new Float32Array(tiles.length * 3);
    const colors = new Float32Array(tiles.length * 3);
    const opacities = new Float32Array(tiles.length);

    const tileData = tiles.map((tile: Tile, i) => {
      const { q, r, s, color } = tile;
      const position = cubeToPixel(q, r, s, hexSize);
      const baseOpacity =  1.0;

      // Set the color to the value passed in from the tileMap
      let tileColor = new THREE.Color(color || '#666666'); // Ensure default color

      // Set data in arrays
      positions[i * 3] = position[0];
      positions[i * 3 + 1] = position[1];
      positions[i * 3 + 2] = position[2];

      colors[i * 3] = tileColor.r;
      colors[i * 3 + 1] = tileColor.g;
      colors[i * 3 + 2] = tileColor.b;

      opacities[i] = baseOpacity;

      return {
        index: i,
        key: `${q}#${r}#${s}`,
        q, r, s,
        position,
        color: tileColor,
        opacity: baseOpacity,
      };
    });

    console.log(`[HexGrid] Instance data created with ${tileData.length} tiles`);
    return {
      instanceData: tileData,
      instancePositions: positions,
      instanceColors: colors,
      instanceOpacities: opacities
    };
  }, [tileMap, hexSize, user?.uid]);

  // Create a material with the custom shaders
  const material = useMemo(() => {
    console.log('[HexGrid] Creating shader material');
    const mat = new THREE.ShaderMaterial({
      vertexShader: hexVertexShader,
      fragmentShader: hexFragmentShader,
      transparent: true, // Enable transparency
      side: THREE.DoubleSide, // Render both sides
      wireframe,
      uniforms: {
        time: { value: 0 },
      }
    });

    return mat;
  }, [wireframe]);

  // Update the instance attributes when data changes
  useEffect(() => {
    if (!meshRef.current) {
      console.warn('[HexGrid] Mesh ref not available');
      return;
    }

    console.log(`[HexGrid] Updating instance attributes for ${instanceData.length} tiles`);

    // Create and assign attributes
    const positionAttr = new THREE.InstancedBufferAttribute(instancePositions, 3);
    meshRef.current.geometry.setAttribute('instancePosition', positionAttr);

    const colorAttr = new THREE.InstancedBufferAttribute(instanceColors, 3);
    meshRef.current.geometry.setAttribute('instanceColor', colorAttr);

    const opacityAttr = new THREE.InstancedBufferAttribute(instanceOpacities, 1);
    meshRef.current.geometry.setAttribute('instanceOpacity', opacityAttr);

    // Update instance count
    meshRef.current.count = instanceData.length;
    meshRef.current.frustumCulled = false;

    console.log('[HexGrid] Instance attributes updated successfully');
  }, [instanceData, instancePositions, instanceColors, instanceOpacities]);

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    // Calculate the intersection point on the plane
    const intersectionPoint = event.point.clone();

    // Convert the intersection point to cube coordinates
    const [fq, fr, fs] = pixelToCube(intersectionPoint.x, intersectionPoint.y, hexSize);
    const [q, r, s] = cubeRound(fq, fr, fs);

    console.log(`Click: Pixel=(${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}), Cube=(${q}, ${r}, ${s})`);

    // Use cube coordinates to find the tile
    const tileKey = `${q}#${r}#${s}`;
    const tile = tileMap[tileKey];

    if (tile) {
      const pixelPosition = cubeToPixel(q, r, s, hexSize);
      setClickedTile({
        q: q,
        r: r,
        s: s,
        position: pixelPosition,
        color: tile.color || getTileColor(tile, user?.uid)
      });

      onTileSelect?.(tile);
      onTileAdd?.(q, r, s);
    }
  }, [hexSize, tileMap, onTileAdd, user?.uid]);

  const handleDoubleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    // Calculate the intersection point on the plane
    const intersectionPoint = event.point.clone();

    // Convert the intersection point to cube coordinates
    const [fq, fr, fs] = pixelToCube(intersectionPoint.x, intersectionPoint.y, hexSize);
    const [q, r, s] = cubeRound(fq, fr, fs);

    console.log(`Double Click: Cube=(${q}, ${r}, ${s})`);

    // Use cube coordinates to find the tile
    const tileKey = `${q}#${r}#${s}`;
    const tile = tileMap[tileKey];

    if (tile) {
      onTileSelect(tile);
    }
  }, [hexSize, tileMap, onTileSelect, user?.uid]);

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'default';
  }, []);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    // Skip if no hover handler
    if (!onTileHover) return;
    
    // Calculate the intersection point on the plane
    const intersectionPoint = event.point.clone();
    
    // Convert the intersection point to cube coordinates
    const [fq, fr, fs] = pixelToCube(intersectionPoint.x, intersectionPoint.y, hexSize);
    const [q, r, s] = cubeRound(fq, fr, fs);
    
    // Use cube coordinates to find the tile
    const tileKey = `${q}#${r}#${s}`;
    const tile = tileMap[tileKey];
    
    if (tile) {
      onTileHover(tile);
    }
  }, [hexSize, tileMap, onTileHover]);
  
  const handlePointerLeave = useCallback(() => {
    if (onTileHover) {
      onTileHover(null);
    }
  }, [onTileHover]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, instanceData.length]}
        renderOrder={0}
      />

      {/* Invisible plane to catch all clicks */}
      <mesh
        position={[0, 0, -0.1]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        renderOrder={-1}
      >
        <planeGeometry args={[10000, 10000]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

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
})

export function GridCanvas({
  wireframe,
  hexSize,
  tileMap,
  cameraPosition,
  cameraTarget,
  onCameraStop,
  onTileSelect,
  onTileAdd,
  onTileHover,
}: HexGridCanvasProps) {
  // Internal camera state management
  const [internalCameraPosition, setInternalCameraPosition] = useState<[number, number, number]>(
    cameraPosition || DEFAULT_CAMERA_POSITION
  );
  const [internalCameraTarget, setInternalCameraTarget] = useState<[number, number, number]>(
    cameraTarget || DEFAULT_CAMERA_TARGET
  );

  return (
    <Canvas
      camera={{ position: internalCameraPosition, fov: 45 }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      <OrbitControls
        target={internalCameraTarget}
        enablePan={true}
        enableZoom={true}
        enableRotate={false}
        minDistance={5}
        maxDistance={500}
        panSpeed={1.5}
        zoomSpeed={1.2}
        dampingFactor={0.1}
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
      <CameraTracker onStop={(pos) => onCameraStop(pos)} minDistance={0.5} stopDelayMs={200} />
      <HexGrid
        wireframe={wireframe}
        hexSize={hexSize}
        tileMap={tileMap}
        onTileSelect={onTileSelect}
        onTileAdd={onTileAdd}
        onTileHover={onTileHover}
      />
    </Canvas>
  )
}
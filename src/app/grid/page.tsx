'use client'

import React from 'react'
import { Canvas, ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  CubeTransparentIcon,
  ViewfinderCircleIcon,
  SwatchIcon,
  BugAntIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { useColony } from '@/contexts/ColonyContext'
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

// Hex directions matching the Go implementation
const HEX_DIRECTIONS = [
  { q: 1, r: -1, s: 0 },  // UpRight
  { q: 0, r: -1, s: 1 },  // Up
  { q: -1, r: 0, s: 1 },  // UpLeft
  { q: -1, r: 1, s: 0 },  // DownLeft
  { q: 0, r: 1, s: -1 },  // Down
  { q: 1, r: 0, s: -1 },  // DownRight
]

// Function to create a unique key for a cube coordinate
function coordsToKey(q: number, r: number, s: number): string {
  return `${q},${r},${s}`
}

// Convert cube coordinates to pixel coordinates (for pointy-top orientation)
function cubeToPixel(q: number, r: number, s: number, size = 1): [number, number, number] {
  // For pointy-top hexagons
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r)
  const y = size * (3/2 * r)
  return [x, y, 0]
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
  onTileSelect
}: { 
  position?: [number, number, number], 
  color?: string, 
  wireframe?: boolean,
  q: number,
  r: number,
  s: number,
  type?: string,
  resourceDensity?: number,
  onTileSelect: (tile: SelectedTile) => void
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
    console.log(`Clicked hex at cube coordinates: q=${q}, r=${r}, s=${s}, type=${type}`)
    
    // Call the selection handler with tile info
    onTileSelect({
      q,
      r,
      s,
      color,
      type,
      resourceDensity
    })
  }

  return (
    <mesh 
      position={position} 
      onClick={handleClick}
      // Make cursor change to pointer when hovering over hexagons
      onPointerOver={(e: ThreeEvent<PointerEvent>) => document.body.style.cursor = 'pointer'}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => document.body.style.cursor = 'default'}
    >
      <shapeGeometry args={[hexShape]} />
      <meshBasicMaterial color={color} wireframe={wireframe} />
    </mesh>
  )
}

const debugOptions = [
  { 
    name: 'Wireframe', 
    description: 'Toggle wireframe rendering of hexagons', 
    action: 'toggleWireframe', 
    icon: CubeTransparentIcon 
  },
  { 
    name: 'Hexagon Size', 
    description: 'Adjust the size of hexagons', 
    action: 'adjustSize', 
    icon: ViewfinderCircleIcon 
  },
  { 
    name: 'Color Scheme', 
    description: 'Change the color palette', 
    action: 'changeColorScheme', 
    icon: SwatchIcon 
  }
]

// Get color based on tile type
function getTileColor(type: string, colorScheme: string, q: number, r: number, s: number, resourceDensity = 0.5): string {
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

function HexGrid({ 
  wireframe = false, 
  hexSize = 1.2, 
  colorScheme = 'type', 
  tileMap = {} as TileMap,
  onTileSelect
}: {
  wireframe?: boolean,
  hexSize?: number,
  colorScheme?: string,
  tileMap?: TileMap,
  onTileSelect: (tile: SelectedTile) => void
}) {
  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { position: [number, number, number]; color: string; q: number; r: number; s: number; type?: string; resourceDensity?: number }[] = []
    
    // Use the tile data from the tileMap
    Object.values(tileMap).forEach((tile) => {
      const q = tile.q;
      const r = tile.r;
      const s = tile.s;
      const type = tile.type;
      const resourceDensity = tile.resourceDensity || 0.5;
      
      // Generate color based on tile type and selected scheme
      const color = getTileColor(type, colorScheme, q, r, s, resourceDensity);
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color,
        type,
        resourceDensity
      })
    })
    
    return gridPositions
  }, [hexSize, colorScheme, tileMap])

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
          onTileSelect={onTileSelect}
        />
      ))}
    </>
  )
}

export default function Grid() {
  const { colony } = useColony();
  
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type' // Default to type-based coloring
  })

  const [tileMap, setTileMap] = useState<TileMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  
  // Load the grid data when colony changes
  useEffect(() => {
    async function loadGridData() {
      try {
        setLoading(true);
        
        // If we have colony tiles, use them
        if (colony && colony.tiles && colony.tiles.length > 0) {
          console.log(`Loading ${colony.tiles.length} tiles from colony`);
          
          // Create a map of cube coordinates to tiles
          const tileMapData: TileMap = {};
          colony.tiles.forEach((tile) => {
            const key = coordsToKey(tile.q, tile.r, tile.s);
            tileMapData[key] = tile;
          });
          
          setTileMap(tileMapData);
          setError(null);
        } else {
          console.log('No colony tiles available');
          setTileMap({});
          setError('No colony tiles available. Please create a colony first.');
        }
      } catch (error) {
        console.error('Error loading grid data:', error);
        setError('Failed to load grid data');
      } finally {
        setLoading(false);
      }
    }
    
    loadGridData();
  }, [colony]);
  
  const handleDebugAction = (action: string) => {
    switch(action) {
      case 'toggleWireframe':
        setDebugState((prev: typeof debugState) => ({ ...prev, wireframe: !prev.wireframe }))
        break
      case 'adjustSize':
        setDebugState((prev: typeof debugState) => ({ 
          ...prev, 
          hexSize: prev.hexSize === 1.2 ? 1.5 : prev.hexSize === 1.5 ? 0.9 : 1.2
        }))
        break
      case 'changeColorScheme':
        setDebugState((prev: typeof debugState) => {
          // Cycle through color schemes
          const schemes = ['type', 'resources', 'rainbow', 'default', 'monochrome'];
          const currentIndex = schemes.indexOf(prev.colorScheme);
          const nextIndex = (currentIndex + 1) % schemes.length;
          return { ...prev, colorScheme: schemes[nextIndex] };
        });
        break;
    }
  }

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Setting selected tile:', tile);
    setSelectedTile(tile);
  }

  const closePanel = () => {
    setSelectedTile(null);
  }

  return (
    <AuthGuard>
      <div className="h-screen w-full">
        <div className="relative h-full w-full">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-40 z-10">
              <div className="text-lg font-medium text-gray-700">Loading grid data...</div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-100 bg-opacity-40 z-10">
              <div className="text-lg font-medium text-red-700">{error}</div>
            </div>
          )}
          
          {/* Enhanced SlideUpPanel with more tile information */}
          <SlideUpPanel
            isOpen={selectedTile !== null}
            onClose={closePanel}
            title="Tile Information"
            maxWidth="lg"
            showOverlay={false}
            closeOnOutsideClick={false}
          >
            {selectedTile && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Cube Coordinates</div>
                  <div className="font-mono mt-1 dark:text-gray-200">
                    q: {selectedTile.q}, r: {selectedTile.r}, s: {selectedTile.s}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</div>
                  <div className="flex items-center mt-1">
                    <div 
                      className="h-6 w-6 rounded mr-2" 
                      style={{ backgroundColor: selectedTile.color }}
                    ></div>
                    <code className="text-xs dark:text-gray-200">{selectedTile.color}</code>
                  </div>
                </div>
                {selectedTile.type && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Tile Type</div>
                    <div className="mt-1 dark:text-gray-200">
                      {selectedTile.type}
                    </div>
                  </div>
                )}
                {selectedTile.resourceDensity !== undefined && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Resource Density</div>
                    <div className="mt-1 dark:text-gray-200">
                      {Math.round(selectedTile.resourceDensity * 100)}%
                    </div>
                  </div>
                )}
              </div>
            )}
          </SlideUpPanel>
          
          <div className="absolute top-4 right-4 z-10">
            <Popover className="relative">
              <PopoverButton className="flex items-center gap-x-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                <BugAntIcon className="h-5 w-5 mr-1" />
                <span>Debug</span>
                <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
              </PopoverButton>

              <PopoverPanel
                transition
                className="absolute right-0 z-10 mt-2 w-80 origin-top-right transition data-[closed]:translate-y-1 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in"
              >
                <div className="overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5">
                  <div className="p-4">
                    {debugOptions.map((item) => (
                      <div 
                        key={item.name} 
                        className="group relative flex gap-x-6 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleDebugAction(item.action)}
                      >
                        <div className="mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
                          <item.icon className="h-6 w-6 text-gray-600 group-hover:text-indigo-600" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {item.name}
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">
                      Current settings: {debugState.wireframe ? 'Wireframe' : 'Solid'}, 
                      Size: {debugState.hexSize.toFixed(1)}, 
                      Colors: {debugState.colorScheme}
                    </div>
                  </div>
                </div>
              </PopoverPanel>
            </Popover>
          </div>
          
          <Canvas
            camera={{ position: [0, 0, 12], fov: 45 }}
            gl={{ antialias: true }}
            style={{ touchAction: 'none' }}
          >
            <OrbitControls 
              enablePan={true}
              enableZoom={true}
              enableRotate={false}
              minDistance={5}
              maxDistance={80}
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
              wireframe={debugState.wireframe}
              hexSize={debugState.hexSize}
              colorScheme={debugState.colorScheme}
              tileMap={tileMap}
              onTileSelect={handleTileSelect}
            />
          </Canvas>
        </div>
      </div>
    </AuthGuard>
  )
}
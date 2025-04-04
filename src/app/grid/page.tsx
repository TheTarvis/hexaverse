'use client'

import { Canvas } from '@react-three/fiber'
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
import sampleGridData from './data/sample-grid.json'
import { fetchShardData, addNewShard } from '@/services/api'

// Types based on the server model
interface CubeCoords {
  X: number
  Y: number
  Z: number
}

interface Tile {
  cords: CubeCoords
}

interface GridData {
  id: string
  tiles: Tile[]
}

interface TileMap {
  [key: string]: Tile
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

function HexagonMesh({ position = [0, 0, 0] as [number, number, number], color = 'teal', wireframe = false }) {
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

  return (
    <mesh position={position}>
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
  },
  {
    name: 'Add New Shard',
    description: 'Request a new shard from the server and add it to the grid',
    action: 'addNewShard',
    icon: PlusCircleIcon
  }
]

function HexGrid({ 
  wireframe = false, 
  hexSize = 1.2, 
  colorScheme = 'default', 
  tileMap = {} as TileMap
}) {
  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { position: [number, number, number]; color: string; q: number; r: number; s: number }[] = []
    
    // Use the tile data from the sample JSON
    Object.values(tileMap).forEach((tile: Tile) => {
      const q = tile.cords.X
      const r = tile.cords.Y
      const s = tile.cords.Z
      
      // Generate a color based on coordinates and selected scheme
      let color
      
      // Different color generation based on scheme
      if (colorScheme === 'monochrome') {
        color = new THREE.Color(0.4, 0.4, 0.4)
      } else if (colorScheme === 'rainbow') {
        color = new THREE.Color(
          0.5 + 0.5 * Math.sin(q + r),
          0.5 + 0.5 * Math.sin(r + s),
          0.5 + 0.5 * Math.sin(s + q)
        )
      } else {
        // Default color scheme
        color = new THREE.Color(
          0.4 + 0.4 * Math.sin(q * 0.8 + r * 0.3),
          0.5 + 0.3 * Math.sin(r * 0.5 + s * 0.4),
          0.6 + 0.4 * Math.sin(s * 0.6 + q * 0.2)
        )
      }
      
      gridPositions.push({
        q, r, s,
        position: cubeToPixel(q, r, s, hexSize),
        color: color.getStyle()
      })
    })
    
    return gridPositions
  }, [hexSize, colorScheme, tileMap])

  return (
    <>
      {positions.map((props, index) => (
        <HexagonMesh 
          key={index}
          position={props.position}
          color={props.color}
          wireframe={wireframe}
        />
      ))}
    </>
  )
}

export default function Grid() {
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'default'
  })

  const [tileMap, setTileMap] = useState<TileMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingShardLoading, setAddingShardLoading] = useState(false)
  
  // Load the grid data on mount
  useEffect(() => {
    async function loadGridData() {
      try {
        setLoading(true)
        let gridData: GridData
        
        try {
          // Try to fetch from API
          gridData = await fetchShardData() as GridData
        } catch (apiError) {
          console.warn('Error fetching from API, falling back to sample data:', apiError)
          // Fallback to sample data if API fails
          gridData = sampleGridData as GridData
        }
        
        // Create a map of cube coordinates to tiles
        const tileMapData: TileMap = {}
        gridData.tiles.forEach((tile: Tile) => {
          const key = coordsToKey(tile.cords.X, tile.cords.Y, tile.cords.Z)
          tileMapData[key] = tile
        })
        
        setTileMap(tileMapData)
        setError(null)
      } catch (error) {
        console.error('Error loading grid data:', error)
        setError('Failed to load grid data')
      } finally {
        setLoading(false)
      }
    }
    
    loadGridData()
  }, [])
  
  const handleDebugAction = (action: string) => {
    switch(action) {
      case 'toggleWireframe':
        setDebugState(prev => ({ ...prev, wireframe: !prev.wireframe }))
        break
      case 'adjustSize':
        setDebugState(prev => ({ 
          ...prev, 
          hexSize: prev.hexSize === 1.2 ? 1.5 : prev.hexSize === 1.5 ? 0.9 : 1.2
        }))
        break
      case 'changeColorScheme':
        setDebugState(prev => ({ 
          ...prev, 
          colorScheme: prev.colorScheme === 'default' ? 'rainbow' : 
                      prev.colorScheme === 'rainbow' ? 'monochrome' : 'default'
        }))
        break
      case 'addNewShard':
        setAddingShardLoading(true)
        
        addNewShard()
          .then((newShardData: GridData) => {
            // Create a new map merging existing and new tiles
            const updatedTileMap = { ...tileMap }
            
            // Add all new tiles to the map
            newShardData.tiles.forEach((tile: Tile) => {
              const key = coordsToKey(tile.cords.X, tile.cords.Y, tile.cords.Z)
              updatedTileMap[key] = tile
            })
            
            setTileMap(updatedTileMap)
            setError(null)
          })
          .catch((error) => {
            console.error('Error adding new shard:', error)
            setError('Failed to add new shard')
          })
          .finally(() => {
            setAddingShardLoading(false)
          })
        break
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="relative h-[800px] w-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-40 z-10">
            <div className="text-lg font-medium text-gray-700">Loading grid data...</div>
          </div>
        )}
        
        {addingShardLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-40 z-10">
            <div className="text-lg font-medium text-gray-700">Adding new shard...</div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-100 bg-opacity-40 z-10">
            <div className="text-lg font-medium text-red-700">{error}</div>
          </div>
        )}
        
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
        >
          <OrbitControls 
            enablePan={false}
            enableZoom={true}
            enableRotate={false}
            minDistance={5}
            maxDistance={20}
          />
          <HexGrid 
            wireframe={debugState.wireframe}
            hexSize={debugState.hexSize}
            colorScheme={debugState.colorScheme}
            tileMap={tileMap}
          />
        </Canvas>
      </div>
    </div>
  )
}
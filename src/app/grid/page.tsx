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
  PlusCircleIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline'
import sampleGridData from './data/sample-grid.json'

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
    name: 'Use Grid Data', 
    description: 'Toggle between generated grid and server data', 
    action: 'toggleGridData', 
    icon: PlusCircleIcon 
  },
]

// Get a ring of hexagons at a specified radius using cube coordinates
function getHexRing(center: { q: number, r: number, s: number }, radius: number) {
  if (radius === 0) return [{ ...center }]
  
  const results = []
  
  // Start with hex at the given direction and move around
  let hex = {
    q: center.q + HEX_DIRECTIONS[4].q * radius,  // Start at "Down" position
    r: center.r + HEX_DIRECTIONS[4].r * radius,
    s: center.s + HEX_DIRECTIONS[4].s * radius
  }
  
  // For each of the 6 sides
  for (let side = 0; side < 6; side++) {
    // For each step along this side
    for (let step = 0; step < radius; step++) {
      results.push({ ...hex })
      
      // Move one step in the current direction
      const direction = HEX_DIRECTIONS[(side + 2) % 6]  // +2 to start from the right direction
      hex.q += direction.q
      hex.r += direction.r
      hex.s += direction.s
    }
  }
  
  return results
}

// Get a spiral of hexagons up to the specified radius
function getHexSpiral(center: { q: number, r: number, s: number }, maxRadius: number) {
  let results = [{ ...center }]
  
  for (let radius = 1; radius <= maxRadius; radius++) {
    results = [...results, ...getHexRing(center, radius)]
  }
  
  return results
}

function HexGrid({ 
  wireframe = false, 
  hexSize = 1.2, 
  colorScheme = 'default', 
  ringCount = 1,
  useServerData = false,
  tileMap = {} as TileMap
}) {
  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { position: [number, number, number]; color: string; q: number; r: number; s: number }[] = []
    
    if (useServerData) {
      // Use the tile data from the server
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
    } else {
      // Use the generated spiral of hexagons
      const coordinates = getHexSpiral({ q: 0, r: 0, s: 0 }, ringCount)
      
      coordinates.forEach(({q, r, s}) => {
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
    }
    
    return gridPositions
  }, [hexSize, colorScheme, ringCount, useServerData, tileMap])

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
    colorScheme: 'default',
    ringCount: 1,
    useServerData: false
  })

  const [tileMap, setTileMap] = useState<TileMap>({})
  
  // Load the grid data on mount
  useEffect(() => {
    try {
      const gridData = sampleGridData as GridData
      
      // Create a map of cube coordinates to tiles
      const tileMapData: TileMap = {}
      gridData.tiles.forEach(tile => {
        const key = coordsToKey(tile.cords.X, tile.cords.Y, tile.cords.Z)
        tileMapData[key] = tile
      })
      
      setTileMap(tileMapData)
    } catch (error) {
      console.error('Error loading grid data:', error)
    }
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
      case 'toggleGridData':
        setDebugState(prev => ({ ...prev, useServerData: !prev.useServerData }))
        break
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="relative h-[800px] w-full">
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
                    Colors: {debugState.colorScheme},
                    {debugState.useServerData ? ' Using server data' : ` Rings: ${debugState.ringCount}`}
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
            ringCount={debugState.ringCount}
            useServerData={debugState.useServerData}
            tileMap={tileMap}
          />
        </Canvas>
      </div>
    </div>
  )
}
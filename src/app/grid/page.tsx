'use client'

import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

// Convert cube coordinates to pixel coordinates (for pointy-top orientation)
function cubeToPixel(q: number, r: number, s: number, size = 1): [number, number, number] {
  // For pointy-top hexagons
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r)
  const y = size * (3/2 * r)
  return [x, y, 0]
}

function HexagonMesh({ position = [0, 0, 0] as [number, number, number], color = 'teal' }) {
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
      <meshBasicMaterial color={color} wireframe={false} />
    </mesh>
  )
}

function HexGrid() {
  // Generate hexagon positions using cube coordinates
  const positions = useMemo(() => {
    const gridPositions: { position: [number, number, number]; color: string }[] = []
    const hexSize = 1.2 // Size parameter for coordinate conversion
    
    // Define the cube coordinates for center and one ring
    const coordinates = [
      // Center
      { q: 0, r: 0, s: 0 },
      // Ring 1
      { q: 1, r: -1, s: 0 },
      { q: 1, r: 0, s: -1 },
      { q: 0, r: 1, s: -1 },
      { q: -1, r: 1, s: 0 },
      { q: -1, r: 0, s: 1 },
      { q: 0, r: -1, s: 1 }
    ]
    
    coordinates.forEach(({q, r, s}) => {
      // Generate a color based on coordinates
      const color = new THREE.Color(
        0.4 + 0.4 * Math.sin(q * 0.8 + r * 0.3),
        0.5 + 0.3 * Math.sin(r * 0.5 + s * 0.4),
        0.6 + 0.4 * Math.sin(s * 0.6 + q * 0.2)
      )
      
      gridPositions.push({
        position: cubeToPixel(q, r, s, hexSize),
        color: color.getStyle()
      })
    })
    
    return gridPositions
  }, [])

  return (
    <>
      {positions.map((props, index) => (
        <HexagonMesh 
          key={index}
          position={props.position}
          color={props.color}
        />
      ))}
    </>
  )
}

export default function Grid() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="h-[400px] w-full">
        <Canvas
          camera={{ position: [0, 0, 10], fov: 50 }}
          gl={{ antialias: true }}
        >
          <HexGrid />
        </Canvas>
      </div>
    </div>
  )
}
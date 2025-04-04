'use client'

import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

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
  // Generate hexagon positions in a grid layout
  const positions = useMemo(() => {
    const gridPositions = []
    const size = 1.8 // Size with spacing between hexagons
    const rows = 3
    const cols = 4
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Offset every other row to create proper hexagonal grid
        const offset = r % 2 === 0 ? 0 : size * 0.86 / 2
        
        // Calculate x position with offset for odd rows
        const x = c * size * 0.86 + offset
        
        // For pointy-top hexagons, y position is 3/4 * size apart
        const y = r * size * 0.75
        
        // Generate a color based on position
        const color = new THREE.Color(
          0.3 + 0.5 * Math.sin(c * 0.8 + r * 0.3),
          0.4 + 0.5 * Math.sin(c * 0.3 + r * 0.2),
          0.5 + 0.5 * Math.sin(c * 0.2 + r * 0.8)
        )
        
        gridPositions.push({
          position: [x, -y, 0] as [number, number, number],
          color: color.getStyle()
        })
      }
    }
    
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
          camera={{ position: [0, 0, 5], fov: 50 }}
          gl={{ antialias: true }}
        >
          <HexGrid />
        </Canvas>
      </div>
    </div>
  )
}
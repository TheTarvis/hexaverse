'use client'

import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

function HexagonMesh() {
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
    <mesh>
      <shapeGeometry args={[hexShape]} />
      <meshBasicMaterial color="teal" wireframe={false} />
    </mesh>
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
          <HexagonMesh />
        </Canvas>
      </div>
    </div>
  )
}
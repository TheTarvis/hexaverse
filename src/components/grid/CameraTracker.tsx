import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'

type TrackerProps = {
  onMove?: (pos: [number, number, number]) => void
  onStop?: (pos: [number, number, number]) => void
  minDistance?: number // threshold before calling onMove
  stopDelayMs?: number // how long without movement to trigger onStop
}

export function CameraTracker({
  onMove,
  onStop,
  minDistance = 0.25,
  stopDelayMs = 25
}: TrackerProps) {
  const { camera } = useThree()
  const lastPosition = useRef(new THREE.Vector3())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  useFrame(() => {
    const distance = camera.position.distanceTo(lastPosition.current)

    if (distance > minDistance) {
      const rounded = camera.position.toArray().map((n) => +n.toFixed(2)) as [number, number, number]

      onMove?.(rounded)
      lastPosition.current.copy(camera.position)

      // Reset stop timer
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        onStop?.(rounded)
      }, stopDelayMs)
    }
  })

  return null
}
// Lazy, SSR-guarded glow texture singleton.
//
// The node glow is authored WITHOUT shaders or a bloom pass (spec #0002
// Decision #1): a radial gradient is baked once into a canvas texture and drawn
// with additive blending, tinted per-node via the sprite material's colour.
//
// It needs `document`, so it is a lazy singleton created on first use (never at
// module load) — safe under SSR, where this module may be imported but the
// factory is never called.

import * as THREE from 'three'

let _glow: THREE.Texture | null = null

export function glowTexture(): THREE.Texture {
  if (_glow) return _glow
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.14, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.Texture(canvas)
  tex.needsUpdate = true
  _glow = tex
  return tex
}

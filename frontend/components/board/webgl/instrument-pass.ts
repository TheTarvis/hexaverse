// The final "this is an instrument, not a window" pass.
//
// Everything before this pass renders space. This pass renders the DISPLAY you
// are looking at space through: a vignette, a barely-there scanline, sensor
// grain that lifts in the dark, and a hair of chromatic aberration at the
// corners.
//
// Deliberately subtle — each term is small enough that you notice its absence
// rather than its presence. It is exposed as a toggle on the spike page because
// it is the most arguable effect here: it is the one that is pure fiction rather
// than physics, and Travis should get to see the board with it off.

import * as THREE from 'three'

export const InstrumentShader = {
  name: 'InstrumentShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAmount: { value: 1 }, // master scale — 0 disables every term
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);

      // Chromatic aberration, scaled by r^2 so the centre stays perfectly
      // registered and only the corners smear — the way a real lens fails.
      float ca = 0.0016 * uAmount * r * r;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;

      // Scanline. Tied to device pixels, not uv, so it does not moiré on resize.
      float line = sin(uv.y * uResolution.y * 1.4) * 0.5 + 0.5;
      col *= 1.0 - line * 0.030 * uAmount;

      // Sensor grain, lifted in the shadows where a real sensor is noisiest.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float grain = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
      col += grain * 0.055 * uAmount * (1.0 - smoothstep(0.0, 0.55, lum));

      // Vignette. Kept shallow — a deep one reads as "dirty screenshot", and the
      // board's own corners hold real content (the rim, the lane gates).
      col *= 1.0 - smoothstep(0.42, 0.92, r) * 0.30 * uAmount;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

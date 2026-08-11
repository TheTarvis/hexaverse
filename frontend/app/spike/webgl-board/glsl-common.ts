// SPIKE (throwaway) — GLSL snippets shared by the spike's shaders.
//
// Value noise + fbm, hash-based so nothing has to be uploaded as a texture.
// Everything the spike draws is procedural for the same reason the audio layer
// is (see /spike/audio): no art assets, so the look ships with the code.

export const GLSL_NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Smooth value noise on a 2D lattice.
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Four-octave fbm. Enough structure for a corona or a nebula, cheap enough to
  // run per-fragment on a full-screen plane.
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * vnoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }
`

// A soft circular mask for point sprites and glows: 1 at the centre, 0 at r=1,
// with a controllable falloff exponent.
export const GLSL_SOFT_DISC = /* glsl */ `
  float softDisc(vec2 uv, float falloff) {
    float d = length(uv);
    return pow(max(0.0, 1.0 - d), falloff);
  }
`

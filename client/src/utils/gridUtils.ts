import * as THREE from 'three';

// Convert pixel coordinates to fractional cube coordinates (for pointy-top)
export function pixelToCube(x: number, y: number, size = 1): [number, number, number] {
  const q = (Math.sqrt(3)/3 * x - 1/3 * y) / size;
  const r = (2/3 * y) / size;
  const s = -q - r; // s is derived
  return [q, r, s];
}

// Round fractional cube coordinates to the nearest integer cube coordinates
export function cubeRound(q: number, r: number, s: number): [number, number, number] {
  let qRounded = Math.round(q);
  let rRounded = Math.round(r);
  let sRounded = Math.round(s);

  const qDiff = Math.abs(qRounded - q);
  const rDiff = Math.abs(rRounded - r);
  const sDiff = Math.abs(sRounded - s);

  // Reset the component with the largest difference to ensure q + r + s = 0
  if (qDiff > rDiff && qDiff > sDiff) {
    qRounded = -rRounded - sRounded;
  } else if (rDiff > sDiff) {
    rRounded = -qRounded - sRounded;
  } else {
    sRounded = -qRounded - rRounded;
  }

  return [qRounded, rRounded, sRounded];
}

// Calculate the hexagonal distance between two sets of cube coordinates
export function hexDistance(q1: number, r1: number, s1: number, q2: number, r2: number, s2: number): number {
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
}

// Convert cube coordinates to pixel coordinates (for pointy-top orientation)
// Keeping this here as it might be useful in utils, but also needed in GridCanvas
export function cubeToPixel(q: number, r: number, s: number, size = 1): [number, number, number] {
    const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    const y = size * (3/2 * r);
    return [x, y, 0];
} 
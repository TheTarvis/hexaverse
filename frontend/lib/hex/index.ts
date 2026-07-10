// lib/hex — pure tactical-board math, the client mirror of backend/board.
//
// No React, no Firestore, no clock: given (elements, worldTime) it computes hex
// positions, ring walks, straight-line paths, and movement/intercept solves,
// all quantized to the integer logical hex. It is the Go↔TS determinism seam:
// /fixtures/board/cases.json is the recorded contract and fixtures.test.ts
// asserts this implementation reproduces it. Pixel/interpolation helpers (the
// visual glide) live with the SVG renderer, not here.

export * from './hex'
export * from './orbit'
export * from './movement'
export * from './intercept'

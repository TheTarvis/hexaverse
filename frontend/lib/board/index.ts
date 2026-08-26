// lib/board — pure tactical-board math, the client mirror of backend/board.
//
// No React, no Firestore, no clock: given (elements, worldTime) it computes
// polar-cell positions, arc paths, and movement/intercept solves, all
// quantized to the integer logical cell (lib/polar is the lattice core it
// consumes). It is the Go↔TS determinism seam: /fixtures/board/cases.json is
// the recorded contract and fixtures.test.ts asserts this implementation
// reproduces it. Pixel/interpolation helpers (the visual glide) are
// render-side (pixel.ts) and exempt from that contract.

export * from './board'
export * from './orbit'
export * from './movement'
export * from './intercept'
export * from './gate'
export * from './table'
export * from './tuning'
export * from './visibility'
export * from './pixel'

// scan-ping — the math behind ScanPing, the radial-echo picture of a running
// scan (#0006 Decisions #22/#23/#26). ONE ring: the returned-echo front,
// grown from the EMISSION HEX pinned at commit and left there — the pulse
// stays where it was fired while the ship moves on and still collects the
// returns (Decision #26; the fast-flash + slow-horizon pair it replaces read
// as two competing rings, and the slow one betrayed a centre riding the
// ship). ScanDuration is the rim round-trip, so the ring paces the show:
// each body blips at its hex the moment its echo arrives, nearest first.
// Pure math like scan-preview — everything is a deterministic function of
// (committedAt, eta, worldTime) — so the picture needs no state and freezes
// cleanly when the clock does; rendering lives in ScanPing. The
// rotating-beam flavor lives separately in arc-scan.ts / ArcScan.
//
import { cellKey, distance, type Cell, type Schedule } from '@/lib/board'

// PING_TUNING — the ping's theater-only dials, tuning.go-style. The real
// pacing — when each body's echo lands — is GameTuning.ScanDuration
// (the rim round-trip), read off the running action's own window
// (eta − committedAt): retune it in tuning.go and both the mechanic and this
// picture re-pace together, no mirrored constant.
export const PING_TUNING = {
  // How many hexes the front travels past a body before its echo-return
  // blip has fully faded.
  returnFadeCells: 3,
}

// echoFrontCells — how far (in cells, continuous) the returned-echo front has
// travelled from the emission hex at worldTime. ScanDuration is the rim
// round-trip (backend observation.echoDisc mirrors this exactly), so the
// front is at rimRing × elapsed/duration, clamped to the board.
export function echoFrontCells(
  committedAt: number,
  eta: number,
  worldTime: number,
  rimRing: number,
): number {
  const duration = eta - committedAt
  if (duration <= 0) return rimRing
  const frac = (worldTime - committedAt) / duration
  return Math.min(Math.max(frac, 0), 1) * rimRing
}

export interface EchoReturn {
  cell: Cell
  // 1 the instant the front hits the body, fading linearly to 0 as the front
  // moves returnFadeCells past it.
  strength: number
}

// echoReturns — the bodies currently flashing their echo back: every target
// the front has just reached, with clear line of sight (a shadowed body never
// returns — the signal never reached it). The emission cell itself never
// flashes.
export function echoReturns(
  origin: Cell,
  targets: Cell[],
  frontCells: number,
  shadowed: Set<string>,
  s: Schedule,
): EchoReturn[] {
  const out: EchoReturn[] = []
  for (const h of targets) {
    if (shadowed.has(cellKey(h))) continue
    const d = distance(origin, h, s)
    if (d === 0) continue
    const past = frontCells - d
    if (past < 0 || past >= PING_TUNING.returnFadeCells) continue
    out.push({ cell: h, strength: 1 - past / PING_TUNING.returnFadeCells })
  }
  return out
}

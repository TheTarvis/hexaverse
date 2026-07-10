// SPIKE (throwaway) — the game's audio layer AS CODE. No asset files: every
// sound is synthesized in the browser with the Web Audio API.
//
// Two halves:
//   • SFX palette — one exported function per game verb (select, plot, commit,
//     scan, dock, …). Each builds a tiny oscillator/noise graph, plays, and
//     self-destructs. ~zero payload, infinitely tweakable.
//   • AmbientEngine — generative Eno-style music: a filtered drone, slow pad
//     chords random-walking a mode, and sparse low sine SWELLS on a probability
//     grid. SEEDED (same mulberry32 pattern as mock-system.ts) and dialed by
//     the system's graph-tier CHARACTER — a star_rich system shimmers in
//     lydian, a dead one drifts in a dark sparse pentatonic. Procedural
//     galaxy, procedural soundtrack: same seed → same music, forever.
//
// Shared plumbing: one lazy AudioContext (created on first user gesture),
// master → destination, with sfx/music sub-buses and one generated-impulse
// convolver reverb ("space") that both halves send into.
// Route: /spike/audio

import { hashSeed, type Character } from '../hex-board/mock-system'

// --- context & buses ----------------------------------------------------------

interface AudioGraph {
  ctx: AudioContext
  master: GainNode
  sfx: GainNode
  music: GainNode
  reverb: ConvolverNode
}

let graph: AudioGraph | null = null

// Big empty room, synthesized: a noise burst with an exponential tail. This IS
// the "space" in the sound — every voice sends a little of itself here.
function makeImpulse(ctx: AudioContext, seconds = 4, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(seconds * rate)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

export function ensureAudio(): AudioGraph {
  if (graph) {
    if (graph.ctx.state === 'suspended') void graph.ctx.resume()
    return graph
  }
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  const sfx = ctx.createGain()
  sfx.gain.value = 0.6
  sfx.connect(master)

  const music = ctx.createGain()
  music.gain.value = 0.55
  music.connect(master)

  const reverb = ctx.createConvolver()
  reverb.buffer = makeImpulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.5
  reverb.connect(wet)
  wet.connect(master)

  graph = { ctx, master, sfx, music, reverb }
  return graph
}

export function setMasterVolume(v: number) {
  ensureAudio().master.gain.value = v
}
export function setSfxVolume(v: number) {
  ensureAudio().sfx.gain.value = v
}
export function setMusicVolume(v: number) {
  ensureAudio().music.gain.value = v
}

// --- SFX helpers --------------------------------------------------------------

interface ToneOpts {
  freq: number
  sweepTo?: number // exponential glide target over the duration
  type?: OscillatorType
  dur?: number
  gain?: number
  attack?: number
  when?: number // offset in seconds from now
  send?: number // how much goes to the reverb (0..1 of voice gain)
}

function tone({ freq, sweepTo, type = 'sine', dur = 0.15, gain = 0.5, attack = 0.005, when = 0, send = 0.15 }: ToneOpts) {
  const g = ensureAudio()
  const t0 = g.ctx.currentTime + when
  const osc = g.ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)

  const env = g.ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(gain, t0 + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(env)
  env.connect(g.sfx)
  if (send > 0) {
    const s = g.ctx.createGain()
    s.gain.value = send
    env.connect(s)
    s.connect(g.reverb)
  }
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noiseBurst({ dur = 0.6, from = 400, to = 3000, gain = 0.4, when = 0, send = 0.3, q = 1.2 }) {
  const g = ensureAudio()
  const t0 = g.ctx.currentTime + when
  const len = Math.floor(g.ctx.sampleRate * dur)
  const buf = g.ctx.createBuffer(1, len, g.ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = g.ctx.createBufferSource()
  src.buffer = buf

  const bp = g.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = q
  bp.frequency.setValueAtTime(from, t0)
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur)

  const env = g.ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  src.connect(bp)
  bp.connect(env)
  env.connect(g.sfx)
  const s = g.ctx.createGain()
  s.gain.value = send
  env.connect(s)
  s.connect(g.reverb)
  src.start(t0)
}

// --- SFX palette (one per game verb) -------------------------------------------

/** Hover/select a hex: a tiny dry tick. */
export function sfxSelect() {
  tone({ freq: 740, type: 'triangle', dur: 0.07, gain: 0.35, send: 0.05 })
}

/** Plot a burn path: two rising blips — a question mark. */
export function sfxPlot() {
  tone({ freq: 520, type: 'triangle', dur: 0.08, gain: 0.35 })
  tone({ freq: 780, type: 'triangle', dur: 0.1, gain: 0.35, when: 0.09 })
}

/** Commit the burn: a resolved open-fifth pluck — the answer. */
export function sfxCommit() {
  tone({ freq: 330, dur: 0.35, gain: 0.4, send: 0.25 })
  tone({ freq: 495, dur: 0.35, gain: 0.3, send: 0.25 })
  tone({ freq: 660, dur: 0.45, gain: 0.22, send: 0.3, when: 0.02 })
}

/** Cancel / re-task: a small descending shrug. */
export function sfxCancel() {
  tone({ freq: 420, sweepTo: 300, type: 'triangle', dur: 0.16, gain: 0.3, send: 0.08 })
}

/** Active scan: a sonar ping with a long wet tail, then its own echo. */
export function sfxScan() {
  tone({ freq: 1400, sweepTo: 700, dur: 0.9, gain: 0.4, send: 0.9 })
  tone({ freq: 1400, sweepTo: 700, dur: 0.7, gain: 0.12, send: 0.9, when: 0.4 })
}

/** Fog reveal: a shimmer sweeping up out of the murk, with sparkles. */
export function sfxReveal() {
  noiseBurst({ dur: 0.7, from: 300, to: 4500, gain: 0.25, send: 0.5 })
  tone({ freq: 1760, dur: 0.5, gain: 0.12, send: 0.6, when: 0.15 })
  tone({ freq: 2637, dur: 0.6, gain: 0.08, send: 0.7, when: 0.28 })
}

/** Dock / arrive: a warm low major chord, slow attack — you're home. */
export function sfxDock() {
  tone({ freq: 165, dur: 0.9, gain: 0.4, attack: 0.06, send: 0.3 })
  tone({ freq: 208, dur: 0.9, gain: 0.25, attack: 0.08, send: 0.3 })
  tone({ freq: 247, dur: 1.1, gain: 0.22, attack: 0.1, send: 0.35 })
}

/** Enter a travel lane: rising rush — noise sweep + sub swell. */
export function sfxWarp() {
  noiseBurst({ dur: 1.3, from: 150, to: 5000, gain: 0.35, send: 0.4, q: 0.8 })
  tone({ freq: 55, sweepTo: 110, dur: 1.2, gain: 0.5, attack: 0.3, send: 0.2 })
}

/** Invalid action: a flat dissonant buzz. Beat frequency does the scolding. */
export function sfxError() {
  tone({ freq: 110, type: 'square', dur: 0.18, gain: 0.18, send: 0 })
  tone({ freq: 116, type: 'square', dur: 0.18, gain: 0.18, send: 0 })
}

export const SFX_PALETTE = [
  { name: 'select', desc: 'pick a hex', fn: sfxSelect },
  { name: 'plot', desc: 'preview a burn path', fn: sfxPlot },
  { name: 'commit', desc: 'commit the burn', fn: sfxCommit },
  { name: 'cancel', desc: 're-task / cancel', fn: sfxCancel },
  { name: 'scan', desc: 'active sonar ping', fn: sfxScan },
  { name: 'reveal', desc: 'fog lifts off a tile', fn: sfxReveal },
  { name: 'dock', desc: 'arrive & station-keep', fn: sfxDock },
  { name: 'warp', desc: 'enter a travel lane', fn: sfxWarp },
  { name: 'error', desc: 'invalid action', fn: sfxError },
] as const

// --- generative ambient music ---------------------------------------------------

// Same PRNG as mock-system.ts (kept local — spike files stay self-contained).
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Modes as semitone offsets. The character picks the mode — this is where
// "dead systems sound dead" lives.
const MODES: Record<Character, number[]> = {
  star_rich: [0, 2, 4, 6, 7, 9, 11], // lydian — bright, floating
  normal: [0, 2, 3, 5, 7, 9, 10], // dorian — neutral, a little wistful
  dead: [0, 3, 5, 7, 10], // minor pentatonic — dark, can't hit a wrong note in the void
  barrier: [0, 1, 3, 5, 7, 8, 10], // phrygian — tense, something's wrong here
}

interface MusicDial {
  beatSec: number // swell grid resolution
  chordBeats: number // beats per pad chord
  swellChance: number // probability a grid slot gets a swell
  cutoff: number // drone lowpass — overall darkness
  swellDecay: number // how long a swell takes to sink back into the drone
}

const MUSIC_DIALS: Record<Character, MusicDial> = {
  star_rich: { beatSec: 0.42, chordBeats: 20, swellChance: 0.16, cutoff: 900, swellDecay: 4.5 },
  normal: { beatSec: 0.5, chordBeats: 20, swellChance: 0.12, cutoff: 620, swellDecay: 5 },
  dead: { beatSec: 0.72, chordBeats: 24, swellChance: 0.05, cutoff: 320, swellDecay: 7 },
  barrier: { beatSec: 0.55, chordBeats: 16, swellChance: 0.1, cutoff: 460, swellDecay: 5.5 },
}

const NOTE_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']
function describeNote(semisFromA1: number): string {
  const name = NOTE_NAMES[((semisFromA1 % 12) + 12) % 12]
  return `${name}${1 + Math.floor((semisFromA1 + 9) / 12)}`
}

const A1 = 55 // Hz

export class AmbientEngine {
  private g: AudioGraph
  private rng: () => number
  private dial: MusicDial
  private mode: number[]
  private rootSemis: number // semitones above A1

  private out: GainNode
  private send: GainNode
  private droneFilter: BiquadFilterNode
  private lfo: OscillatorNode

  private timer: ReturnType<typeof setInterval> | null = null
  private nextBeat = 0
  private beatCount = 0
  private chordDegree = 0
  private swellDegree = 0
  private activePad: { nodes: GainNode; oscs: OscillatorNode[] } | null = null
  private droneOscs: OscillatorNode[] = []

  onEvent?: (msg: string) => void

  constructor(seedStr: string, public character: Character) {
    this.g = ensureAudio()
    this.rng = mulberry32(hashSeed(`music:${seedStr}`))
    this.dial = MUSIC_DIALS[character]
    this.mode = MODES[character]
    this.rootSemis = Math.floor(this.rng() * 8) // A1..E2 — every system gets its own key

    const { ctx } = this.g
    this.out = ctx.createGain()
    this.out.gain.value = 0.0001
    this.out.connect(this.g.music)

    this.send = ctx.createGain()
    this.send.gain.value = 0.55
    this.out.connect(this.send)
    this.send.connect(this.g.reverb)

    // drone lowpass, slowly breathing via an LFO on its cutoff
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = this.dial.cutoff
    this.droneFilter.Q.value = 0.7
    this.droneFilter.connect(this.out)
    this.lfo = ctx.createOscillator()
    this.lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = this.dial.cutoff * 0.4
    this.lfo.connect(lfoGain)
    lfoGain.connect(this.droneFilter.frequency)
    this.lfo.start()
  }

  private freqOf(semisFromRoot: number, octave = 0): number {
    return A1 * Math.pow(2, (this.rootSemis + semisFromRoot) / 12 + octave)
  }

  start() {
    const { ctx } = this.g
    const t0 = ctx.currentTime
    this.out.gain.cancelScheduledValues(t0)
    this.out.gain.setValueAtTime(0.0001, t0)
    this.out.gain.linearRampToValueAtTime(1, t0 + 4)

    // Drone: root + fifth, detuned saws under the lowpass, plus a sine sub.
    const droneSpec: Array<[number, OscillatorType, number, number]> = [
      [this.freqOf(0), 'sawtooth', -5, 0.05],
      [this.freqOf(0), 'sawtooth', 5, 0.05],
      [this.freqOf(7), 'sawtooth', 3, 0.03],
      [this.freqOf(0) / 2, 'sine', 0, 0.11],
    ]
    for (const [freq, type, detune, gain] of droneSpec) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      osc.detune.value = detune
      const og = ctx.createGain()
      og.gain.value = gain
      osc.connect(og)
      og.connect(this.droneFilter)
      osc.start()
      this.droneOscs.push(osc)
    }

    this.nextBeat = ctx.currentTime + 0.1
    this.beatCount = 0
    this.timer = setInterval(() => this.schedule(), 120)
    this.onEvent?.(`drone up — root ${describeNote(this.rootSemis)}, ${this.character}`)
  }

  // Lookahead scheduler: each tick, schedule every grid beat that falls in the
  // next 350ms. Sample-accurate without blocking the main thread.
  private schedule() {
    const { ctx } = this.g
    while (this.nextBeat < ctx.currentTime + 0.35) {
      const t = this.nextBeat
      if (this.beatCount % this.dial.chordBeats === 0) this.padChord(t)
      if (this.rng() < this.dial.swellChance) this.swell(t)
      this.nextBeat += this.dial.beatSec
      this.beatCount++
    }
  }

  // Pads: a triad random-walking the mode, each note two detuned triangles.
  // The old chord fades as the new one blooms — nothing ever cuts off.
  private padChord(t: number) {
    const { ctx } = this.g
    if (this.activePad) {
      const old = this.activePad
      old.nodes.gain.cancelScheduledValues(t)
      old.nodes.gain.setValueAtTime(old.nodes.gain.value, t)
      old.nodes.gain.linearRampToValueAtTime(0.0001, t + 5)
      for (const o of old.oscs) o.stop(t + 5.2)
    }

    const step = [-2, -1, -1, 1, 1, 2][Math.floor(this.rng() * 6)]
    this.chordDegree = (this.chordDegree + step + this.mode.length) % this.mode.length
    const degrees = [0, 2, 4].map((d) => this.chordDegree + d)

    const padGain = ctx.createGain()
    padGain.gain.setValueAtTime(0.0001, t)
    padGain.gain.linearRampToValueAtTime(0.16, t + 4)
    padGain.connect(this.droneFilter)

    const oscs: OscillatorNode[] = []
    const names: string[] = []
    for (const deg of degrees) {
      const oct = Math.floor(deg / this.mode.length)
      const semis = this.mode[deg % this.mode.length] + 12 * oct
      names.push(describeNote(this.rootSemis + semis + 24))
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = this.freqOf(semis, 2)
        osc.detune.value = detune
        const og = ctx.createGain()
        og.gain.value = 0.33
        osc.connect(og)
        og.connect(padGain)
        osc.start(t)
        oscs.push(osc)
      }
    }
    this.activePad = { nodes: padGain, oscs }
    this.onEvent?.(`pad → ${names.join(' ')}`)
  }

  // Swells: a lone low note that rises out of the drone and sinks back — two
  // barely-detuned sines (gentle beating), slow attack, long release, wet.
  // The melodic layer, but felt more than heard.
  private swell(t: number) {
    const { ctx } = this.g
    const step = [-2, -1, 1, 1, 2, 3][Math.floor(this.rng() * 6)]
    this.swellDegree = (this.swellDegree + step + this.mode.length * 2) % (this.mode.length * 2)
    const oct = 2 + Math.floor(this.swellDegree / this.mode.length)
    const semis = this.mode[this.swellDegree % this.mode.length]
    const freq = this.freqOf(semis, oct)

    const vel = 0.07 + this.rng() * 0.05
    const attack = this.dial.beatSec * 3
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(vel, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + this.dial.swellDecay)
    env.connect(this.out)

    const oscs: OscillatorNode[] = []
    for (const detune of [-3, 3]) {
      const osc = ctx.createOscillator()
      osc.frequency.value = freq
      osc.detune.value = detune
      const og = ctx.createGain()
      og.gain.value = 0.5
      osc.connect(og)
      og.connect(env)
      osc.start(t)
      osc.stop(t + attack + this.dial.swellDecay + 0.2)
      oscs.push(osc)
    }
    this.onEvent?.(`swell ${describeNote(this.rootSemis + semis + 12 * oct + 12)}`)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const { ctx } = this.g
    const t = ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(0.0001, t + 2)
    const oscs = [...this.droneOscs, this.lfo, ...(this.activePad?.oscs ?? [])]
    for (const o of oscs) o.stop(t + 2.2)
    this.droneOscs = []
    this.activePad = null
    setTimeout(() => this.out.disconnect(), 2500)
  }
}

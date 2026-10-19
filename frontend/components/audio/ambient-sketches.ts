// Round 01: original procedural sketches, not production audio or music.
export const AMBIENT_SKETCHES = [
  { id: 'hush', letter: 'A', name: 'Open-space hush', description: 'A soft, distant wash with a low, slow undertow.', question: 'Peaceful and spacious, or too empty?' },
  { id: 'interior', letter: 'B', name: 'Ship interior', description: 'Air circulation, a steady machinery hum and small vibrations.', question: 'Comforting presence, or a distracting appliance?' },
  { id: 'drift', letter: 'C', name: 'Electrical drift', description: 'Airy static, wandering bands of energy and a gentle pulse.', question: 'Interesting texture, or too much hiss?' },
  { id: 'field', letter: 'D', name: 'Unfamiliar field', description: 'Uneven glassy resonances suspended over a dark rumble.', question: 'Intriguing and alien, or too eerie?' },
] as const

export type AmbientId = typeof AMBIENT_SKETCHES[number]['id']
const DURATION = 24
const rendered = new Map<AmbientId, Promise<AudioBuffer>>()

function random(seed: number) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Fixed seeds, integer modulation cycles and seam-tapered noise make rounds repeatable. */
export function renderAmbient(id: AmbientId): Promise<AudioBuffer> {
  const cached = rendered.get(id)
  if (cached) return cached
  const result = render(id).catch(error => {
    rendered.delete(id)
    throw error
  })
  rendered.set(id, result)
  return result
}

async function render(id: AmbientId): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 32000 * DURATION, 32000)
  const index = AMBIENT_SKETCHES.findIndex(sketch => sketch.id === id)
  const rng = random(761 + index * 917)
  const output = ctx.createGain()
  output.connect(ctx.destination)

  function modulate(param: AudioParam, cycles: number, depth: number, phase = 0) {
    const buffer = ctx.createBuffer(1, ctx.length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * cycles * i / data.length + phase) * depth
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(param)
    source.start()
  }

  function tone(frequency: number, level: number, cycles = 1, type: OscillatorType = 'sine', pan = 0) {
    const osc = ctx.createOscillator()
    osc.type = type
    // Whole cycles ensure the oscillator itself loops without a discontinuity.
    osc.frequency.value = Math.round(frequency * DURATION) / DURATION
    const gain = ctx.createGain()
    gain.gain.value = level
    modulate(gain.gain, cycles, level * 0.4)
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    osc.connect(gain).connect(panner).connect(output)
    osc.start()
  }

  function noise(frequency: number, level: number, type: BiquadFilterType, sweep: number, cycles: number, q = 0.7) {
    const buffer = ctx.createBuffer(2, ctx.length, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < data.length; i++) {
        const seam = Math.min(1, i / 3200, (data.length - 1 - i) / 3200)
        data[i] = (rng() * 2 - 1) * Math.sin(seam * Math.PI / 2)
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    modulate(filter.frequency, cycles, sweep)
    const gain = ctx.createGain()
    gain.gain.value = level
    modulate(gain.gain, cycles + 1, level * 0.25)
    source.connect(filter).connect(gain).connect(output)
    source.start()
  }

  switch (id) {
    case 'hush':
      noise(310, 1.3, 'lowpass', 130, 1)
      noise(850, 0.16, 'bandpass', 250, 2)
      tone(43, 0.045)
      tone(67, 0.018, 2, 'sine', -0.25)
      break
    case 'interior':
      noise(1050, 0.6, 'lowpass', 70, 2)
      tone(96, 0.1, 3)
      tone(192, 0.04, 2, 'sine', -0.25)
      tone(288, 0.015, 5, 'triangle', 0.25)
      break
    case 'drift':
      noise(2300, 1.2, 'bandpass', 1600, 2, 1.8)
      noise(420, 0.7, 'bandpass', 210, 3, 3)
      tone(83, 0.025, 6)
      break
    case 'field':
      noise(190, 0.7, 'lowpass', 60, 1)
      tone(53, 0.055)
      tone(347, 0.045, 2, 'sine', -0.6)
      tone(551, 0.035, 3, 'sine', 0.6)
      tone(887, 0.02, 5, 'sine', -0.2)
      tone(1291, 0.009, 4, 'sine', 0.3)
      break
  }

  const buffer = await ctx.startRendering()
  let energy = 0
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (const sample of data) {
      energy += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
  }
  // Approximate level matching, with headroom; listening feedback still decides balance.
  const rms = Math.sqrt(energy / (buffer.length * buffer.numberOfChannels))
  const scale = Math.min(0.1 / Math.max(rms, 0.000001), 0.65 / Math.max(peak, 0.000001))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) data[i] *= scale
  }
  return buffer
}

export interface AmbientSession {
  ready: Promise<void>
  setVolume: (volume: number) => void
  close: () => void
}

/** Each audition owns its context. Closing also cancels a render that is still pending. */
export function playAmbient(id: AmbientId, volume: number): AmbientSession {
  const ctx = new AudioContext()
  let closed = false
  let currentVolume = volume
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(ctx.destination)
  // Resume during the initiating click, before waiting for offline rendering.
  const resumed = ctx.resume()
  const ready = Promise.all([resumed, renderAmbient(id)]).then(([, buffer]) => {
    if (closed) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gain)
    gain.gain.setTargetAtTime(currentVolume, ctx.currentTime, 0.2)
    source.start()
  })
  return {
    ready,
    setVolume: value => {
      currentVolume = value
      if (!closed) gain.gain.setTargetAtTime(value, ctx.currentTime, 0.05)
    },
    close: () => {
      if (closed) return
      closed = true
      gain.disconnect()
      void ctx.close().catch(() => undefined)
    },
  }
}

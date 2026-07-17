import { Deck } from './Deck.js'

/**
 * AudioEngine — manages two decks, crossfader, and master volume.
 *
 * Full graph:
 *   Deck A → crossfaderGainA ─┐
 *                              ├→ masterGain → ctx.destination
 *   Deck B → crossfaderGainB ─┘
 *
 * Crossfader uses equal-power (cos/sin) curve for professional sound.
 */
export class AudioEngine {
  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })

    this.deckA = new Deck(this.ctx, 'A')
    this.deckB = new Deck(this.ctx, 'B')

    // Crossfader gains
    this.crossfaderGainA = this.ctx.createGain()
    this.crossfaderGainB = this.ctx.createGain()
    this.crossfaderPosition = 0.5 // 0=full A, 1=full B

    // Master volume
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.9

    // Analyser for visualisation (optional, shared)
    this.analyserA = this.ctx.createAnalyser()
    this.analyserB = this.ctx.createAnalyser()
    this.analyserA.fftSize = 2048
    this.analyserB.fftSize = 2048

    // Wire up graph
    this.deckA.outputNode.connect(this.crossfaderGainA)
    this.deckB.outputNode.connect(this.crossfaderGainB)

    this.crossfaderGainA.connect(this.analyserA)
    this.crossfaderGainB.connect(this.analyserB)

    this.analyserA.connect(this.masterGain)
    this.analyserB.connect(this.masterGain)

    this.masterGain.connect(this.ctx.destination)

    // Apply initial crossfader position
    this.setCrossfader(0.5)
  }

  // ─── Decode an ArrayBuffer into an AudioBuffer ───────────────────────────────
  async decodeAudio(arrayBuffer) {
    return this.ctx.decodeAudioData(arrayBuffer)
  }

  // ─── Load a decoded buffer onto a deck ──────────────────────────────────────
  loadToDeck(deckId, audioBuffer) {
    const deck = this._deck(deckId)
    deck.load(audioBuffer)
  }

  // ─── Crossfader (position 0–1) ───────────────────────────────────────────────
  setCrossfader(position) {
    this.crossfaderPosition = Math.max(0, Math.min(1, position))
    const gainA = Math.cos(this.crossfaderPosition * Math.PI / 2)
    const gainB = Math.cos((1 - this.crossfaderPosition) * Math.PI / 2)
    this.crossfaderGainA.gain.setTargetAtTime(gainA, this.ctx.currentTime, 0.005)
    this.crossfaderGainB.gain.setTargetAtTime(gainB, this.ctx.currentTime, 0.005)
  }

  // ─── Master volume (0–1) ─────────────────────────────────────────────────────
  setMasterVolume(normalized) {
    this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01)
  }

  // ─── Sync: match deckId's BPM to the opposite deck ──────────────────────────
  sync(deckId) {
    const thisDeck = this._deck(deckId)
    const otherDeck = deckId === 'A' ? this.deckB : this.deckA
    if (otherDeck.bpm && thisDeck.bpm) {
      thisDeck.syncToBpm(otherDeck.bpm)
    }
  }

  // ─── Resume AudioContext if suspended (browser policy) ──────────────────────
  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  // ─── Get waveform data for a deck (Uint8Array, 0-255) ───────────────────────
  getWaveformData(deckId) {
    const analyser = deckId === 'A' ? this.analyserA : this.analyserB
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    return data
  }

  _deck(id) {
    return id === 'A' ? this.deckA : this.deckB
  }

  dispose() {
    this.deckA.dispose()
    this.deckB.dispose()
    this.ctx.close()
  }
}

// Singleton instance
let _engine = null
export function getAudioEngine() {
  if (!_engine) _engine = new AudioEngine()
  return _engine
}

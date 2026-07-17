import { getAudioEngine } from '../engine/AudioEngine.js'
import { computeWaveform } from '../engine/WaveformAnalyzer.js'
import { useAppStore } from '../store/appStore.js'

/**
 * DJController — the bridge between MIDI events / UI interactions
 * and the AudioEngine. All DJ actions flow through here.
 */
class DJController {
  constructor() {
    this.engine = null
    this._cueing = { A: false, B: false }        // CUE button held state
    this._playPressedWhileCue = { A: false, B: false }
  }

  init() {
    this.engine = getAudioEngine()

    // Wire deck callbacks back to store
    const updateStore = useAppStore.getState().updateDeck

    for (const id of ['A', 'B']) {
      const deck = id === 'A' ? this.engine.deckA : this.engine.deckB

      deck.onPositionUpdate = (deckId, position, duration) => {
        useAppStore.getState().updateDeck(deckId, { position, duration })
      }

      deck.onEnded = (deckId) => {
        useAppStore.getState().updateDeck(deckId, { isPlaying: false })
      }
    }
  }

  // ─── Load a track onto a deck ──────────────────────────────────────────────
  async loadTrack(deckId, trackInfo) {
    const { path, name } = trackInfo
    await this.engine.resume()

    const arrayBuffer = await window.electronAPI.readAudioFile(path)
    const audioBuffer = await this.engine.decodeAudio(arrayBuffer)

    // Compute waveform peaks
    const waveform = computeWaveform(audioBuffer, 1200)

    this.engine.loadToDeck(deckId, audioBuffer)

    // Estimate BPM (simple energy-based approach for display)
    const bpm = estimateBPM(audioBuffer)
    const deck = deckId === 'A' ? this.engine.deckA : this.engine.deckB
    deck.bpm = bpm

    useAppStore.getState().updateDeck(deckId, {
      track: { ...trackInfo, waveform, bpm },
      isPlaying: false,
      position: 0,
      duration: audioBuffer.duration,
      cuePoint: 0,
      isReversed: false,
      bpm,
    })
  }

  // ─── Play / Stutter ────────────────────────────────────────────────────────
  playStutter(deckId) {
    const deck = this._deck(deckId)
    if (!deck.originalBuffer) return
    this.engine.resume()
    if (deck.isPlaying) {
      deck.stutter()
    } else {
      deck.play()
    }
    useAppStore.getState().updateDeck(deckId, { isPlaying: true })
  }

  // ─── Pause (sets cue point) ────────────────────────────────────────────────
  pause(deckId) {
    const deck = this._deck(deckId)
    deck.pause()
    useAppStore.getState().updateDeck(deckId, {
      isPlaying: false,
      cuePoint: deck.cuePoint,
    })
  }

  // ─── CUE down (press) ─────────────────────────────────────────────────────
  cueDown(deckId) {
    const deck = this._deck(deckId)
    this._cueing[deckId] = true
    this._playPressedWhileCue[deckId] = false
    deck.startCuePreview()
    useAppStore.getState().updateDeck(deckId, { isPlaying: true })
  }

  // ─── CUE up (release) ─────────────────────────────────────────────────────
  cueUp(deckId) {
    const deck = this._deck(deckId)
    const continuePlay = this._playPressedWhileCue[deckId]
    this._cueing[deckId] = false
    deck.stopCuePreview(continuePlay)
    if (!continuePlay) {
      useAppStore.getState().updateDeck(deckId, { isPlaying: false })
    }
  }

  // ─── PLAY pressed while CUE held → continue normally ──────────────────────
  playWhileCueHeld(deckId) {
    if (this._cueing[deckId]) {
      this._playPressedWhileCue[deckId] = true
    }
  }

  // ─── SYNC ─────────────────────────────────────────────────────────────────
  sync(deckId) {
    this.engine.sync(deckId)
  }

  // ─── REV ──────────────────────────────────────────────────────────────────
  toggleReverse(deckId) {
    const deck = this._deck(deckId)
    deck.toggleReverse()
    useAppStore.getState().updateDeck(deckId, { isReversed: deck.isReversed })
  }

  // ─── Pitch bend (held buttons) ────────────────────────────────────────────
  pitchBendDown(deckId) { this._deck(deckId).setPitchBend(0.95) }
  pitchBendUp(deckId)   { this._deck(deckId).setPitchBend(1.05) }
  pitchBendRelease(deckId) { this._deck(deckId).releasePitchBend() }

  // ─── Scratch mode toggle ──────────────────────────────────────────────────
  toggleScratchMode() {
    useAppStore.getState().toggleScratchMode()
  }

  // ─── Jog wheel input ──────────────────────────────────────────────────────
  // midiValue: 0-127 relative (64 = center/stopped)
  onJogWheel(deckId, midiValue) {
    const deck = this._deck(deckId)
    const store = useAppStore.getState()
    const delta = midiValue > 64 ? midiValue - 64 : midiValue - 64 // -63 to +63

    if (store.scratchModeEnabled) {
      // Scratch mode: manipulate playback rate
      const rate = 1.0 + (delta / 15)  // sensitivity tuning
      if (deck.isPlaying) {
        deck.setScratchRate(Math.max(-2, Math.min(3, rate)))
      } else {
        // Simulate scratch while paused: seek
        const nudge = delta * 0.01
        deck.seekTo(deck.getCurrentPosition() + nudge)
      }
    } else {
      // Search mode: seek when paused, pitch bend when playing
      if (!deck.isPlaying) {
        const seekDelta = delta * 0.05
        deck.seekTo(deck.getCurrentPosition() + seekDelta)
      } else {
        const rate = 1.0 + (delta / 40)
        deck.setScratchRate(Math.max(0.5, Math.min(2, rate)))
      }
    }
  }

  onJogRelease(deckId) {
    this._deck(deckId).releaseScratch()
  }

  // ─── EQ / Volume ──────────────────────────────────────────────────────────
  setTreble(deckId, normalized) {
    this._deck(deckId).setTreble(normalized)
    useAppStore.getState().updateDeck(deckId, { treble: normalized })
  }

  setBass(deckId, normalized) {
    this._deck(deckId).setBass(normalized)
    useAppStore.getState().updateDeck(deckId, { bass: normalized })
  }

  setVolume(deckId, normalized) {
    this._deck(deckId).setVolume(normalized)
    useAppStore.getState().updateDeck(deckId, { volume: normalized })
  }

  setCrossfader(normalized) {
    this.engine.setCrossfader(normalized)
    useAppStore.getState().setCrossfader(normalized)
  }

  setMasterVolume(normalized) {
    this.engine.setMasterVolume(normalized)
    useAppStore.getState().setMasterVolume(normalized)
  }

  // ─── Browse knob ──────────────────────────────────────────────────────────
  browseTurn(delta) {
    const store = useAppStore.getState()
    const newIndex = Math.max(0, Math.min(store.library.length - 1, store.browseIndex + delta))
    store.setBrowseIndex(newIndex)
  }

  // ─── MIDI action dispatcher ────────────────────────────────────────────────
  dispatch(action, msg) {
    const isOn = msg.type === 'noteon'
    const isOff = msg.type === 'noteoff'
    const val = msg.value !== undefined ? msg.value / 127 : 0
    const rawVal = msg.value ?? 0

    switch (action) {
      // Deck A buttons
      case 'play_A':        if (isOn) this.playStutter('A'); break
      case 'pause_A':       if (isOn) this.pause('A'); break
      case 'cue_A':
        if (isOn) this.cueDown('A')
        if (isOff) this.cueUp('A')
        break
      case 'sync_A':        if (isOn) this.sync('A'); break
      case 'rev_A':         if (isOn) this.toggleReverse('A'); break
      case 'pitch_minus_A':
        if (isOn) this.pitchBendDown('A')
        if (isOff) this.pitchBendRelease('A')
        break
      case 'pitch_plus_A':
        if (isOn) this.pitchBendUp('A')
        if (isOff) this.pitchBendRelease('A')
        break
      case 'load_A':
        if (isOn) this._loadSelectedToDeck('A')
        break
      case 'jog_A':         this.onJogWheel('A', rawVal); break
      case 'jog_touch_A':
        if (isOff) this.onJogRelease('A')
        break

      // Deck A knobs (CC)
      case 'treble_A':      this.setTreble('A', val); break
      case 'bass_A':        this.setBass('A', val); break
      case 'volume_A':      this.setVolume('A', val); break

      // Deck B buttons
      case 'play_B':        if (isOn) this.playStutter('B'); break
      case 'pause_B':       if (isOn) this.pause('B'); break
      case 'cue_B':
        if (isOn) this.cueDown('B')
        if (isOff) this.cueUp('B')
        break
      case 'sync_B':        if (isOn) this.sync('B'); break
      case 'rev_B':         if (isOn) this.toggleReverse('B'); break
      case 'pitch_minus_B':
        if (isOn) this.pitchBendDown('B')
        if (isOff) this.pitchBendRelease('B')
        break
      case 'pitch_plus_B':
        if (isOn) this.pitchBendUp('B')
        if (isOff) this.pitchBendRelease('B')
        break
      case 'load_B':
        if (isOn) this._loadSelectedToDeck('B')
        break
      case 'jog_B':         this.onJogWheel('B', rawVal); break
      case 'jog_touch_B':
        if (isOff) this.onJogRelease('B')
        break

      // Deck B knobs
      case 'treble_B':      this.setTreble('B', val); break
      case 'bass_B':        this.setBass('B', val); break
      case 'volume_B':      this.setVolume('B', val); break

      // Center controls
      case 'crossfader':    this.setCrossfader(val); break
      case 'master_volume': this.setMasterVolume(val); break
      case 'browse_turn':
        // Relative CC: >64 = clockwise, <64 = counter-clockwise
        this.browseTurn(rawVal > 64 ? 1 : -1)
        break
      case 'browse_press':
        if (isOn) { /* expand folder / load logic */ }
        break
      case 'scratch_toggle':
        if (isOn) this.toggleScratchMode()
        break
    }
  }

  _loadSelectedToDeck(deckId) {
    const store = useAppStore.getState()
    const track = store.library[store.browseIndex]
    if (track) this.loadTrack(deckId, track)
  }

  _deck(id) {
    return id === 'A' ? this.engine.deckA : this.engine.deckB
  }
}

// ─── BPM estimator (energy-based, fast approximation) ─────────────────────────
function estimateBPM(audioBuffer) {
  const data = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const step = Math.floor(sr * 60 / 200) // max 200 BPM
  let peaks = 0
  let threshold = 0

  // Find average energy
  for (let i = 0; i < Math.min(data.length, sr * 30); i++) {
    threshold += Math.abs(data[i])
  }
  threshold = (threshold / Math.min(data.length, sr * 30)) * 1.5

  let lastPeak = 0
  for (let i = step; i < Math.min(data.length, sr * 30); i += step) {
    const energy = Math.abs(data[i])
    if (energy > threshold && (i - lastPeak) > step / 2) {
      peaks++
      lastPeak = i
    }
  }

  const bpm = Math.round((peaks / 30) * 60)
  // Clamp to reasonable range
  if (bpm < 60) return 120
  if (bpm > 200) return 128
  return bpm
}

// Singleton
let _djController = null
export function getDJController() {
  if (!_djController) {
    _djController = new DJController()
    _djController.init()
  }
  return _djController
}

import { FXChain } from './effects/FXChain.js'

/**
 * Deck — represents one playback channel (A or B).
 *
 * Audio graph per deck:
 *   AudioBufferSourceNode
 *     → BiquadFilter (treble, high-shelf @10kHz)
 *     → BiquadFilter (bass, low-shelf @200Hz)
 *     → GainNode (volume)
 *     → FXChain (post-fader effects)
 *     → GainNode (crossfader send)
 *     → [AudioEngine master chain]
 */
export class Deck {
  constructor(audioContext, id) {
    this.ctx = audioContext
    this.id = id // 'A' or 'B'

    this.originalBuffer = null
    this.reversedBuffer = null
    this.sourceNode = null
    
    // Stem buffers and nodes
    this.vocalsBuffer = null
    this.drumsBuffer = null
    this.bassBuffer = null
    this.otherBuffer = null
    this.vocalsSourceNode = null
    this.drumsSourceNode = null
    this.bassSourceNode = null
    this.otherSourceNode = null
    this.stemsReady = false
    this.vocalsMuted = false
    this.instrumentalsMuted = false
    this.granularStemsMuted = { drums: false, bass: false, other: false }

    this.isPlaying = false
    this.isReversed = false
    this.isScratchMode = false

    // Playback position tracking
    this._startTime = 0      // audioContext.currentTime when play() was called
    this._startOffset = 0    // buffer offset in seconds when play() was called
    this._pauseOffset = 0    // where we paused

    this.cuePoint = 0        // in seconds
    this.duration = 0

    this._bpm = 0

    this.visualAngle = 0 // Tracks physical rotation for UI jog wheel
    this.isJogTouched = false // Freezes visual rotation when physical wheel is held
    this.pitchRate = 1.0

    // Callbacks set by AudioEngine
    this.onEnded = null
    this.onPositionUpdate = null

    // ─── Build audio graph ─────────────────────────────────────────────────
    // Pre-gains for mixing stems
    this.masterPreGain = this.ctx.createGain()
    this.masterPreGain.gain.value = 1.0
    
    this.vocalsPreGain = this.ctx.createGain()
    this.vocalsPreGain.gain.value = 0.0 // Muted until stems are ready
    
    this.drumsPreGain = this.ctx.createGain()
    this.drumsPreGain.gain.value = 0.0
    
    this.bassPreGain = this.ctx.createGain()
    this.bassPreGain.gain.value = 0.0
    
    this.otherPreGain = this.ctx.createGain()
    this.otherPreGain.gain.value = 0.0

    this.trebleFilter = this.ctx.createBiquadFilter()
    this.trebleFilter.type = 'highshelf'
    this.trebleFilter.frequency.value = 10000

    this.midFilter = this.ctx.createBiquadFilter()
    this.midFilter.type = 'peaking'
    this.midFilter.frequency.value = 1000
    this.midFilter.Q.value = 0.5

    this.bassFilter = this.ctx.createBiquadFilter()
    this.bassFilter.type = 'lowshelf'
    this.bassFilter.frequency.value = 200

    this.volumeGain = this.ctx.createGain()
    this.volumeGain.gain.value = 0.8

    this.crossfaderSend = this.ctx.createGain()
    this.crossfaderSend.gain.value = 1.0

    this.fxChain = new FXChain(this.ctx)

    // Chain: preGains → treble → mid → bass → volume → fxChain → crossfaderSend
    this.masterPreGain.connect(this.trebleFilter)
    this.vocalsPreGain.connect(this.trebleFilter)
    this.drumsPreGain.connect(this.trebleFilter)
    this.bassPreGain.connect(this.trebleFilter)
    this.otherPreGain.connect(this.trebleFilter)
    
    this.trebleFilter.connect(this.midFilter)
    this.midFilter.connect(this.bassFilter)
    this.bassFilter.connect(this.volumeGain)
    this.volumeGain.connect(this.fxChain.inputNode)
    this.fxChain.outputNode.connect(this.crossfaderSend)

    // Position update interval
    this._positionTimer = null
  }

  get bpm() {
    return this._bpm
  }

  set bpm(value) {
    this._bpm = value
    this.fxChain.setBpm(value)
  }

  // ─── Output node (connects to master) ──────────────────────────────────────
  get outputNode() {
    return this.crossfaderSend
  }

  // ─── Load an AudioBuffer ────────────────────────────────────────────────────
  load(buffer) {
    this.stop()
    this.originalBuffer = buffer
    this.reversedBuffer = null // computed lazily on first REV use
    
    this.vocalsBuffer = null
    this.reversedVocalsBuffer = null
    this.drumsBuffer = null
    this.reversedDrumsBuffer = null
    this.bassBuffer = null
    this.reversedBassBuffer = null
    this.otherBuffer = null
    this.reversedOtherBuffer = null
    this.stemsReady = false
    this.masterPreGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.05)
    this.vocalsPreGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05)
    this.drumsPreGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05)
    this.bassPreGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05)
    this.otherPreGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05)
    
    this.duration = buffer.duration
    this._pauseOffset = 0
    this.cuePoint = 0
    this.isReversed = false
    this.isPlaying = false
    this._stopPositionTimer()
  }

  // ─── Load Stems ─────────────────────────────────────────────────────────────
  loadStems(vocalsBuf, drumsBuf, bassBuf, otherBuf) {
    this.vocalsBuffer = vocalsBuf
    this.reversedVocalsBuffer = null
    this.drumsBuffer = drumsBuf
    this.reversedDrumsBuffer = null
    this.bassBuffer = bassBuf
    this.reversedBassBuffer = null
    this.otherBuffer = otherBuf
    this.reversedOtherBuffer = null
    this.stemsReady = true
    
    const wasPlaying = this.isPlaying
    const pos = this.getCurrentPosition()
    
    if (wasPlaying) {
      this.play(pos) // This will restart playback with all stems
    }
    this._updateStemMix()
  }
  
  _updateStemMix() {
    const t = this.ctx.currentTime
    if (this.stemsReady) {
      this.masterPreGain.gain.setTargetAtTime(0.0, t, 0.05)
      this.vocalsPreGain.gain.setTargetAtTime(this.vocalsMuted ? 0.0 : 1.0, t, 0.05)
      
      const drumsGain = this.instrumentalsMuted || this.granularStemsMuted.drums ? 0.0 : 1.0
      const bassGain = this.instrumentalsMuted || this.granularStemsMuted.bass ? 0.0 : 1.0
      const otherGain = this.instrumentalsMuted || this.granularStemsMuted.other ? 0.0 : 1.0
      
      this.drumsPreGain.gain.setTargetAtTime(drumsGain, t, 0.05)
      this.bassPreGain.gain.setTargetAtTime(bassGain, t, 0.05)
      this.otherPreGain.gain.setTargetAtTime(otherGain, t, 0.05)
    } else {
      this.masterPreGain.gain.setTargetAtTime(1.0, t, 0.05)
      this.vocalsPreGain.gain.setTargetAtTime(0.0, t, 0.05)
      this.drumsPreGain.gain.setTargetAtTime(0.0, t, 0.05)
      this.bassPreGain.gain.setTargetAtTime(0.0, t, 0.05)
      this.otherPreGain.gain.setTargetAtTime(0.0, t, 0.05)
    }
  }

  setVocalsMute(muted) {
    this.vocalsMuted = muted
    this._updateStemMix()
  }

  setInstrumentalsMute(muted) {
    this.instrumentalsMuted = muted
    this._updateStemMix()
  }

  setGranularStemsMuted(stemsMuted) {
    this.granularStemsMuted = { ...stemsMuted }
    this._updateStemMix()
  }

  // ─── Create reversed buffer lazily ─────────────────────────────────────────
  _reverseBuffer(orig) {
    if (!orig) return null;
    const rev = this.ctx.createBuffer(orig.numberOfChannels, orig.length, orig.sampleRate)
    for (let ch = 0; ch < orig.numberOfChannels; ch++) {
      const src = orig.getChannelData(ch)
      const dst = rev.getChannelData(ch)
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i]
      }
    }
    return rev;
  }

  _getReversedBuffer() {
    if (this.reversedBuffer) return this.reversedBuffer
    if (!this.originalBuffer) return null
    this.reversedBuffer = this._reverseBuffer(this.originalBuffer)
    return this.reversedBuffer
  }

  _getReversedStem(type) {
    const key = `reversed${type}Buffer`
    if (this[key]) return this[key]
    const orig = this[`${type.toLowerCase()}Buffer`]
    if (!orig) return null
    this[key] = this._reverseBuffer(orig)
    return this[key]
  }

  // ─── Internal: create and connect a source node ─────────────────────────────
  _createSource(buffer, destination, onEndedCb = null) {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(destination)
    if (onEndedCb) src.onended = onEndedCb
    return src
  }
  
  _stopAllSources() {
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode]
    nodes.forEach(n => {
      if (n) {
        n.onended = null
        try { n.stop() } catch {}
        n.disconnect()
      }
    })
    this.sourceNode = null
    this.vocalsSourceNode = null
    this.drumsSourceNode = null
    this.bassSourceNode = null
    this.otherSourceNode = null
  }

  // ─── Play from a given offset ────────────────────────────────────────────────
  play(offset = null) {
    if (!this.originalBuffer) return
    this._stopAllSources()

    const startFrom = offset !== null
      ? (this.isReversed ? this.duration - offset : offset)
      : (this.isReversed ? this.duration - this._pauseOffset : this._pauseOffset)

    const onMasterEnded = () => {
      if (this.isPlaying) {
        this.isPlaying = false
        this._stopPositionTimer()
        if (this.onEnded) this.onEnded(this.id)
      }
    }

    const buf = this.isReversed ? this._getReversedBuffer() : this.originalBuffer
    this.sourceNode = this._createSource(buf, this.masterPreGain, onMasterEnded)
    
    if (this.stemsReady) {
       const vBuf = this.isReversed ? this._getReversedStem('Vocals') : this.vocalsBuffer
       const dBuf = this.isReversed ? this._getReversedStem('Drums') : this.drumsBuffer
       const bBuf = this.isReversed ? this._getReversedStem('Bass') : this.bassBuffer
       const oBuf = this.isReversed ? this._getReversedStem('Other') : this.otherBuffer

       this.vocalsSourceNode = this._createSource(vBuf, this.vocalsPreGain)
       this.drumsSourceNode = this._createSource(dBuf, this.drumsPreGain)
       this.bassSourceNode = this._createSource(bBuf, this.bassPreGain)
       this.otherSourceNode = this._createSource(oBuf, this.otherPreGain)
    }

    const activeNodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    
    this._startOffset = startFrom // offset into the buffer currently being played

    activeNodes.forEach(src => {
      src.playbackRate.value = this.pitchRate
      src.start(0, Math.max(0, startFrom))
    })

    this._startTime = this.ctx.currentTime
    this._currentPlaybackRate = this.pitchRate
    this.isPlaying = true
    this._startPositionTimer()
  }

  // ─── Pause ───────────────────────────────────────────────────────────────────
  pause() {
    if (!this.isPlaying) return
    this._pauseOffset = this.getCurrentPosition()
    this.cuePoint = this._pauseOffset  // PAUSE always sets the cue point
    this._stopAllSources()
    this.isPlaying = false
    this._stopPositionTimer()
  }

  // ─── Stop (reset to beginning) ───────────────────────────────────────────────
  stop() {
    this._stopAllSources()
    this.isPlaying = false
    this._pauseOffset = 0
    this._stopPositionTimer()
  }

  // ─── Stutter: restart from current position ──────────────────────────────────
  stutter() {
    const pos = this.getCurrentPosition()
    if (this.isPlaying) {
      this._stopAllSources()
    }
    this.play(pos)
  }

  seekTo(seconds) {
    const wasPlaying = this.isPlaying
    const pos = Math.max(0, Math.min(seconds, this.duration))
    if (wasPlaying) {
      this._stopAllSources()
    }
    this._pauseOffset = pos
    
    if (this.onPositionUpdate) {
      this.onPositionUpdate(this.id, this.getCurrentPosition(), this.duration, this.visualAngle)
    }

    if (wasPlaying) this.play(pos)
  }

  // ─── CUE: jump to cue point ──────────────────────────────────────────────────
  jumpToCue() {
    const wasPlaying = this.isPlaying
    if (wasPlaying) {
      this._stopAllSources()
    }
    this._pauseOffset = this.cuePoint
    if (wasPlaying) this.play(this.cuePoint)
    else this._pauseOffset = this.cuePoint
  }

  // ─── CUE preview (hold) ──────────────────────────────────────────────────────
  startCuePreview() {
    this._cuePreviewOrigin = this.cuePoint
    this.play(this.cuePoint)
  }

  stopCuePreview(continuePlayback = false) {
    if (continuePlayback) return // CUE + PLAY: keep going
    this.pause()
    this._pauseOffset = this._cuePreviewOrigin ?? this.cuePoint
  }

  // ─── Toggle reverse ──────────────────────────────────────────────────────────
  toggleReverse() {
    const pos = this.getCurrentPosition()
    const wasPlaying = this.isPlaying
    if (wasPlaying) {
      this._stopAllSources()
    }
    this.isReversed = !this.isReversed
    this._pauseOffset = pos
    if (wasPlaying) this.play(pos)
  }

  // ─── Scratch: set playback rate (called from jog wheel) ─────────────────────
  _updatePositionSync() {
    if (!this.isPlaying) return
    const activeRate = this._currentPlaybackRate !== undefined ? this._currentPlaybackRate : this.pitchRate
    const elapsed = (this.ctx.currentTime - this._startTime) * activeRate
    this._startOffset += elapsed
    this._startTime = this.ctx.currentTime
  }

  setScratchRate(rate) {
    if (!this.isPlaying) return
    this._updatePositionSync()
    this._currentPlaybackRate = rate
    
    // Remember the active speed in case they want to lock it shortly after letting go
    if (Math.abs(rate - this.pitchRate) > 0.01) {
      this._lastActiveScratchRate = rate;
      this._lastActiveScratchTime = Date.now();
    }
    
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.value = rate
    })
  }

  brakeScratch() {
    if (!this.isPlaying) return
    this._updatePositionSync()
    this._currentPlaybackRate = 0.0
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.value = 0.0
    })
  }

  releaseScratch() {
    this._updatePositionSync()
    this._currentPlaybackRate = this.pitchRate
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.value = this.pitchRate
    })
  }

  // ─── Pitch bend (momentary) ──────────────────────────────────────────────────
  setPitchBend(factor) {
    this._updatePositionSync()
    this._currentPlaybackRate = this.pitchRate * factor
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.setValueAtTime(n.playbackRate.value, now)
      n.playbackRate.setTargetAtTime(this.pitchRate * factor, now, 0.02)
    })
  }

  releasePitchBend() {
    this._updatePositionSync()
    this._currentPlaybackRate = this.pitchRate
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.setValueAtTime(n.playbackRate.value, now)
      n.playbackRate.setTargetAtTime(this.pitchRate, now, 0.05)
    })
  }

  // ─── Pitch slider (continuous) ───────────────────────────────────────────────
  setPitchRate(rate) {
    this._updatePositionSync()
    this.pitchRate = rate
    if (this.isPlaying) this._currentPlaybackRate = rate
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    const now = this.ctx.currentTime
    nodes.forEach(n => {
      n.playbackRate.cancelScheduledValues(now)
      n.playbackRate.setValueAtTime(n.playbackRate.value, now)
      n.playbackRate.setTargetAtTime(rate, now, 0.05)
    })
  }

  // ─── Sync: set playback rate to match a target BPM ──────────────────────────
  syncToBpm(targetBpm) {
    if (!this.bpm || !targetBpm) return
    const ratio = targetBpm / this.bpm
    const nodes = [this.sourceNode, this.vocalsSourceNode, this.drumsSourceNode, this.bassSourceNode, this.otherSourceNode].filter(Boolean)
    nodes.forEach(n => {
      n.playbackRate.setTargetAtTime(ratio, this.ctx.currentTime, 0.05)
    })
    // The effective BPM changes, so update FX
    this.fxChain.setBpm(targetBpm)
  }

  // ─── EQ controls (0–1 mapped to -12 to +12 dB) ──────────────────────────────
  setTreble(normalized) {
    const minGain = -30 // Total kill
    const maxGain = 6
    const val = (normalized - 0.5) * 2 // -1 to 1
    this.trebleFilter.gain.setTargetAtTime(
      val < 0 ? val * -minGain : val * maxGain,
      this.ctx.currentTime, 0.05
    )
  }

  setMid(normalized) {
    const minGain = -30 // Total kill
    const maxGain = 6
    const val = (normalized - 0.5) * 2 // -1 to 1
    this.midFilter.gain.setTargetAtTime(
      val < 0 ? val * -minGain : val * maxGain,
      this.ctx.currentTime, 0.05
    )
  }

  setBass(normalized) {
    const db = (normalized * 24) - 12
    this.bassFilter.gain.setTargetAtTime(db, this.ctx.currentTime, 0.01)
  }

  // ─── Volume (0–1) ────────────────────────────────────────────────────────────
  setVolume(normalized) {
    this.volumeGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01)
  }

  // ─── Position tracking ───────────────────────────────────────────────────────
  getCurrentPosition() {
    if (!this.isPlaying) return this._pauseOffset
    
    // Scale elapsed time by active rate to accurately reflect position changes
    const activeRate = this._currentPlaybackRate !== undefined ? this._currentPlaybackRate : this.pitchRate
    const elapsed = (this.ctx.currentTime - this._startTime) * activeRate
    const posInCurrentBuffer = this._startOffset + Math.max(0, elapsed)
    
    // Normalize to original track time
    if (this.isReversed) {
      return Math.max(0, this.duration - posInCurrentBuffer)
    } else {
      return Math.min(posInCurrentBuffer, this.duration)
    }
  }

  getProgress() {
    if (!this.duration) return 0
    return this.getCurrentPosition() / this.duration
  }

  _startPositionTimer() {
    this._stopPositionTimer()
    this._positionTimer = setInterval(() => {
      if (this.isPlaying && !this.isJogTouched) {
        // Increment visual angle during normal playback (33.3 RPM = 200 degrees/sec)
        const deltaSec = 0.05 * this.pitchRate
        const degrees = deltaSec * 200
        this.visualAngle = (this.visualAngle + (this.isReversed ? -degrees : degrees)) % 360
      }

      if (this.onPositionUpdate) {
        this.onPositionUpdate(this.id, this.getCurrentPosition(), this.duration, this.visualAngle)
      }
    }, 50) // 20fps position updates
  }

  _stopPositionTimer() {
    if (this._positionTimer) {
      clearInterval(this._positionTimer)
      this._positionTimer = null
    }
  }

  dispose() {
    this.stop()
    this.masterPreGain.disconnect()
    this.vocalsPreGain.disconnect()
    this.drumsPreGain.disconnect()
    this.bassPreGain.disconnect()
    this.otherPreGain.disconnect()
    this.trebleFilter.disconnect()
    this.bassFilter.disconnect()
    this.volumeGain.disconnect()
    this.fxChain.dispose()
    this.crossfaderSend.disconnect()
  }
}

/**
 * Deck — represents one playback channel (A or B).
 *
 * Audio graph per deck:
 *   AudioBufferSourceNode
 *     → BiquadFilter (treble, high-shelf @10kHz)
 *     → BiquadFilter (bass, low-shelf @200Hz)
 *     → GainNode (volume)
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

    this.isPlaying = false
    this.isReversed = false
    this.isScratchMode = false

    // Playback position tracking
    this._startTime = 0      // audioContext.currentTime when play() was called
    this._startOffset = 0    // buffer offset in seconds when play() was called
    this._pauseOffset = 0    // where we paused

    this.cuePoint = 0        // in seconds
    this.duration = 0

    this.bpm = 0

    this.visualAngle = 0 // Tracks physical rotation for UI jog wheel
    this.isJogTouched = false // Freezes visual rotation when physical wheel is held
    this.pitchRate = 1.0

    // Callbacks set by AudioEngine
    this.onEnded = null
    this.onPositionUpdate = null

    // ─── Build audio graph ─────────────────────────────────────────────────
    this.trebleFilter = this.ctx.createBiquadFilter()
    this.trebleFilter.type = 'highshelf'
    this.trebleFilter.frequency.value = 10000

    this.bassFilter = this.ctx.createBiquadFilter()
    this.bassFilter.type = 'lowshelf'
    this.bassFilter.frequency.value = 200

    this.volumeGain = this.ctx.createGain()
    this.volumeGain.gain.value = 0.8

    this.crossfaderSend = this.ctx.createGain()
    this.crossfaderSend.gain.value = 1.0

    // Chain: treble → bass → volume → crossfaderSend
    this.trebleFilter.connect(this.bassFilter)
    this.bassFilter.connect(this.volumeGain)
    this.volumeGain.connect(this.crossfaderSend)

    // Position update interval
    this._positionTimer = null
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
    this.duration = buffer.duration
    this._pauseOffset = 0
    this.cuePoint = 0
    this.isReversed = false
    this.isPlaying = false
    this._stopPositionTimer()
  }

  // ─── Create reversed buffer lazily ─────────────────────────────────────────
  _getReversedBuffer() {
    if (this.reversedBuffer) return this.reversedBuffer
    const orig = this.originalBuffer
    const rev = this.ctx.createBuffer(orig.numberOfChannels, orig.length, orig.sampleRate)
    for (let ch = 0; ch < orig.numberOfChannels; ch++) {
      const src = orig.getChannelData(ch)
      const dst = rev.getChannelData(ch)
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i]
      }
    }
    this.reversedBuffer = rev
    return rev
  }

  // ─── Internal: create and connect a source node ─────────────────────────────
  _createSource(buffer) {
    if (this.sourceNode) {
      this.sourceNode.onended = null
      try { this.sourceNode.stop() } catch {}
      this.sourceNode.disconnect()
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.trebleFilter)
    src.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false
        this._stopPositionTimer()
        if (this.onEnded) this.onEnded(this.id)
      }
    }
    this.sourceNode = src
    return src
  }

  // ─── Play from a given offset ────────────────────────────────────────────────
  play(offset = null) {
    if (!this.originalBuffer) return
    const buf = this.isReversed ? this._getReversedBuffer() : this.originalBuffer

    const startFrom = offset !== null
      ? (this.isReversed ? this.duration - offset : offset)
      : (this.isReversed ? this.duration - this._pauseOffset : this._pauseOffset)

    const src = this._createSource(buf)
    src.playbackRate.value = this.pitchRate
    this._startOffset = startFrom // offset into the buffer currently being played

    src.start(0, Math.max(0, startFrom))
    this._startTime = this.ctx.currentTime
    this.isPlaying = true
    this._startPositionTimer()
  }

  // ─── Pause ───────────────────────────────────────────────────────────────────
  pause() {
    if (!this.isPlaying) return
    this._pauseOffset = this.getCurrentPosition()
    this.cuePoint = this._pauseOffset  // PAUSE always sets the cue point
    try { this.sourceNode?.stop() } catch {}
    this.isPlaying = false
    this._stopPositionTimer()
  }

  // ─── Stop (reset to beginning) ───────────────────────────────────────────────
  stop() {
    if (this.sourceNode) {
      this.sourceNode.onended = null
      try { this.sourceNode.stop() } catch {}
    }
    this.isPlaying = false
    this._pauseOffset = 0
    this._stopPositionTimer()
  }

  // ─── Stutter: restart from current position ──────────────────────────────────
  stutter() {
    const pos = this.getCurrentPosition()
    if (this.isPlaying) {
      try { this.sourceNode?.stop() } catch {}
    }
    this.play(pos)
  }

  seekTo(seconds) {
    const wasPlaying = this.isPlaying
    const pos = Math.max(0, Math.min(seconds, this.duration))
    if (wasPlaying) {
      try { this.sourceNode?.stop() } catch {}
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
      try { this.sourceNode?.stop() } catch {}
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
      try { this.sourceNode?.stop() } catch {}
    }
    this.isReversed = !this.isReversed
    this._pauseOffset = pos
    if (wasPlaying) this.play(pos)
  }

  // ─── Scratch: set playback rate (called from jog wheel) ─────────────────────
  setScratchRate(rate) {
    if (!this.sourceNode || !this.isPlaying) return
    this.sourceNode.playbackRate.setTargetAtTime(
      rate, this.ctx.currentTime, 0.01
    )
  }

  releaseScratch() {
    if (!this.sourceNode) return
    this.sourceNode.playbackRate.setTargetAtTime(this.pitchRate, this.ctx.currentTime, 0.05)
  }

  // ─── Pitch bend (momentary) ──────────────────────────────────────────────────
  setPitchBend(factor) {
    // factor: 1.05 for +%, 0.95 for -%
    if (!this.sourceNode) return
    this.sourceNode.playbackRate.setTargetAtTime(this.pitchRate * factor, this.ctx.currentTime, 0.02)
  }

  releasePitchBend() {
    if (!this.sourceNode) return
    this.sourceNode.playbackRate.setTargetAtTime(this.pitchRate, this.ctx.currentTime, 0.05)
  }

  // ─── Pitch slider (continuous) ───────────────────────────────────────────────
  setPitchRate(rate) {
    this.pitchRate = rate
    if (!this.sourceNode) return
    this.sourceNode.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05)
  }

  // ─── Sync: set playback rate to match a target BPM ──────────────────────────
  syncToBpm(targetBpm) {
    if (!this.bpm || !targetBpm || !this.sourceNode) return
    const ratio = targetBpm / this.bpm
    this.sourceNode.playbackRate.setTargetAtTime(ratio, this.ctx.currentTime, 0.05)
  }

  // ─── EQ controls (0–1 mapped to -12 to +12 dB) ──────────────────────────────
  setTreble(normalized) {
    const db = (normalized * 24) - 12
    this.trebleFilter.gain.setTargetAtTime(db, this.ctx.currentTime, 0.01)
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
    
    // Scale elapsed time by pitchRate to accurately reflect position changes
    const elapsed = (this.ctx.currentTime - this._startTime) * this.pitchRate
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
    this.trebleFilter.disconnect()
    this.bassFilter.disconnect()
    this.volumeGain.disconnect()
    this.crossfaderSend.disconnect()
  }
}

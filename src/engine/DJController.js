import { getAudioEngine } from '../engine/AudioEngine.js'
import { computeWaveform } from '../engine/WaveformAnalyzer.js'
import { useAppStore } from '../store/appStore.js'
import { processStems } from '../engine/StemSeparator.js'

/**
 * DJController — the bridge between MIDI events / UI interactions
 * and the AudioEngine. All DJ actions flow through here.
 */
class DJController {
  constructor() {
    this.engine = null
    this._cueing = { A: false, B: false }        // CUE button held state
    this._playPressedWhileCue = { A: false, B: false }
    this._jogTouched = { A: false, B: false }    // Jog wheel touch state
    this._scratchBaseRev = { A: false, B: false } // Track base REV state during scratch
    this._jogTimer = { A: null, B: null }        // Wheel stop detection
    this._pitchIntervals = { A: null, B: null }  // Pitch step timers
    this._jogLastTime = { A: 0, B: 0 }           // Last jog event timestamp (ms)
    this._jogVelocity = { A: 0, B: 0 }           // Smoothed velocity (ticks/sec)
  }

  init() {
    this.engine = getAudioEngine()

    // Wire deck callbacks back to store
    const updateStore = useAppStore.getState().updateDeck

    for (const id of ['A', 'B']) {
      const deck = id === 'A' ? this.engine.deckA : this.engine.deckB

      deck.onPositionUpdate = (deckId, position, duration, visualAngle) => {
        useAppStore.getState().updateDeck(deckId, { position, duration, visualAngle })
      }

      deck.onEnded = (deckId) => {
        useAppStore.getState().updateDeck(deckId, { isPlaying: false })
        // Auto-advance: load next track from queue
        this._playNextInQueue(deckId)
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

    const hashString = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
      return Math.abs(hash).toString(36);
    };
    const safePath = trackInfo.path ? `local_${hashString(trackInfo.path.toLowerCase().replace(/\\/g, '/'))}` : null;
    let trackId = trackInfo.videoId || safePath;

    useAppStore.getState().updateDeck(deckId, {
      track: { ...trackInfo, waveform, bpm, stemTrackId: trackId },
      isPlaying: false,
      position: 0,
      duration: audioBuffer.duration,
      cuePoint: 0,
      isReversed: false,
      bpm,
      lyrics: null, // Reset lyrics on load
      showLyrics: false,
      stemsReady: false,
      stemsFailed: false,
      stemsProgress: '',
      vocalsMuted: false,
      instrumentalsMuted: false
    })

    // Check if stems already exist
    const stemsExist = await window.electronAPI.checkStems(trackId)
    if (stemsExist) {
      this.loadStemsFromDisk(deckId, trackId)
    } else {
      // Kick off background stem processing immediately when loaded (prioritized)
      useAppStore.getState().queueStemProcessAsync({ ...trackInfo, path: trackInfo.path, stemTrackId: trackId }, true)
    }

    if (trackInfo.videoId || trackInfo.path) {
      try {
        const transcriptResult = await window.electronAPI.getOrFetchSubtitles(trackInfo)
        if (transcriptResult && transcriptResult.segments) {
          useAppStore.getState().updateDeck(deckId, { lyrics: transcriptResult.segments, showLyrics: true })
        }
      } catch (err) {
        console.error('Error fetching subtitles in controller:', err)
      }
    }
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

  // ─── Play / Pause Toggle ───────────────────────────────────────────────────
  async loadStemsFromDisk(deckId, trackId) {
    const deck = deckId === 'A' ? this.engine.deckA : this.engine.deckB
    if (!deck.originalBuffer) return

    try {
      // Just call processStems with the trackId. Since they are already on disk, it will instantly load them.
      const { vocalsBuffer, drumsBuffer, bassBuffer, otherBuffer } = await processStems(deck.originalBuffer, this.engine, trackId)
      deck.loadStems(vocalsBuffer, drumsBuffer, bassBuffer, otherBuffer)
      useAppStore.getState().updateDeck(deckId, { stemsReady: true })
    } catch (err) {
      console.error('[DJController] Stem loading failed:', err)
      useAppStore.getState().updateDeck(deckId, { stemsFailed: true })
    }
  }

  togglePlay(deckId) {
    const deck = this._deck(deckId)
    if (!deck.originalBuffer) return
    if (deck.isPlaying) {
      this.pause(deckId)
    } else {
      this.playStutter(deckId)
    }
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
    const store = useAppStore.getState()
    const deckState = deckId === 'A' ? store.deckA : store.deckB
    store.updateDeck(deckId, { isSyncEnabled: !deckState.isSyncEnabled })
  }

  // ─── REV ──────────────────────────────────────────────────────────────────
  toggleReverse(deckId) {
    const deck = this._deck(deckId)
    deck.toggleReverse()
    useAppStore.getState().updateDeck(deckId, { isReversed: deck.isReversed })
  }

  // ─── Pitch bend (held buttons act as pitch fader) ────────────────────────
  pitchBendDown(deckId) { 
    useAppStore.getState().updateDeck(deckId, { pitchDownPressed: true })
    this._startPitchStep(deckId, -0.5) 
  }
  pitchBendUp(deckId) { 
    useAppStore.getState().updateDeck(deckId, { pitchUpPressed: true })
    this._startPitchStep(deckId, 0.5) 
  }
  pitchBendRelease(deckId) { 
    useAppStore.getState().updateDeck(deckId, { pitchDownPressed: false, pitchUpPressed: false })
    if (this._pitchIntervals[deckId]) {
      clearInterval(this._pitchIntervals[deckId])
      this._pitchIntervals[deckId] = null
    }
  }

  _startPitchStep(deckId, step) {
    const doStep = () => {
      const store = useAppStore.getState()
      const deckState = deckId === 'A' ? store.deckA : store.deckB
      let newPitch = deckState.pitch + step
      newPitch = Math.max(-8, Math.min(8, newPitch)) // Clamp to -8% .. +8%
      
      store.updateDeck(deckId, { pitch: newPitch })
      
      const rate = 1.0 + (newPitch / 100)
      this._deck(deckId).setPitchRate(rate)
    }
    
    doStep() // apply immediate step
    this._pitchIntervals[deckId] = setInterval(doStep, 150) // continuous step if held
  }

  // ─── Scratch mode toggle ──────────────────────────────────────────────────
  toggleScratchMode() {
    useAppStore.getState().toggleScratchMode()
  }

  // ─── Pitch Slider ─────────────────────────────────────────────────────────
  setPitchSlider(deckId, normalized) {
    // Pitch slider range: typically -8% to +8%
    // 0.0 = -8% (0.92x), 0.5 = 0% (1.0x), 1.0 = +8% (1.08x)
    const rate = 1.0 + (normalized - 0.5) * 0.16
    this._deck(deckId).setPitchRate(rate)
  }

  // ─── Jog wheel input ──────────────────────────────────────────────────────
  // midiValue: 0-127 relative (64 = center/stopped)
  onJogWheel(deckId, midiValue) {
    const store = useAppStore.getState()
    const deck = this._deck(deckId)
    const deckState = store[deckId === 'A' ? 'deckA' : 'deckB']
    
    if (deckState.pitchLockRate !== null) {
      return;  // Locked — ignore ALL jog input. Only UI button can unlock.
    }
    
    // Standard relative MIDI: < 64 is forward ticks, > 64 is backward ticks (two's complement)
    let delta = midiValue > 64 ? midiValue - 128 : midiValue
    
    // TEMPORARY LOGGING FOR HARDWARE TESTING
    console.log(`[JOG TEST ${deckId}] Raw: ${midiValue} | True Delta: ${delta}`);

    // Update physical wheel visual angle
    // Assuming 400 ticks per revolution. 360 / 400 = 0.9 degrees per tick
    const degrees = delta * 0.9
    deck.visualAngle = (deck.visualAngle + degrees) % 360
    if (deck.onPositionUpdate) {
      deck.onPositionUpdate(deck.id, deck.getCurrentPosition(), deck.duration, deck.visualAngle)
    }

    if (this._jogTimer[deckId]) {
      clearTimeout(this._jogTimer[deckId])
    }

    // Require both Scratch Mode AND physical touch to scratch (like Mixxx)
    const isScratching = this._jogTouched[deckId] && store.scratchModeEnabled;

    // Reset rate when the wheel stops moving
    this._jogTimer[deckId] = setTimeout(() => {
      this._jogTimer[deckId] = null
      
      // Read CURRENT touch state, not closure state!
      const storeState = useAppStore.getState();
      const currentlyScratching = this._jogTouched[deckId] && storeState.scratchModeEnabled;
      const deckState = storeState[deckId === 'A' ? 'deckA' : 'deckB'];
      
      if (deckState.pitchLockRate !== null) {
        // Cruise control is active, do NOT brake or release!
        return;
      }
      
      // Always restore reverse direction before braking/releasing
      // This prevents isReversed from getting stuck if onJogRelease fires late
      const baseRev = this._scratchBaseRev[deckId] || false;
      if (deck.isReversed !== baseRev) {
        deck.toggleReverse();
        storeState.updateDeck(deckId, { isReversed: baseRev });
      }
      
      if (currentlyScratching) {
        if (deck.isPlaying) deck.brakeScratch() // Platter inertia stop
      } else {
        deck.releaseScratch() // Return to normal playback speed
        storeState.updateDeck(deckId, { liveRate: 1.0 })
      }
    }, 45) // Reduced from 150ms to 45ms for extremely tight scratch response

    if (!isScratching) {
      // Search mode: pitch bend when playing, seek when paused
      if (deck.isPlaying) {
        // Pitch bend (Nudge)
        const currentPitchRate = 1.0 + (store[deckId === 'A' ? 'deckA' : 'deckB'].pitch / 100)
        const nudgeMultiplier = 1.0 + (delta * 0.015)
        const rate = currentPitchRate * nudgeMultiplier // Gentle nudge for beatmatching
        const clampedRate = Math.max(0.5, Math.min(2, rate))
        deck.setScratchRate(clampedRate)
        
        // Throttle store updates to prevent React UI freezing (prevents missed lock clicks)
        const now = Date.now()
        if (!this._lastLiveRateUpdate) this._lastLiveRateUpdate = {}
        if (now - (this._lastLiveRateUpdate[deckId] || 0) > 50) {
          store.updateDeck(deckId, { liveRate: nudgeMultiplier })
          this._lastLiveRateUpdate[deckId] = now
        }
      } else {
        // Paused seek — velocity-aware
        const nowSeek = performance.now()
        const dtSeek = (nowSeek - (this._jogLastTime[deckId] || nowSeek)) / 1000
        this._jogLastTime[deckId] = nowSeek

        const instantVelSeek = dtSeek > 0 ? Math.abs(delta) / dtSeek : 0
        this._jogVelocity[deckId] = this._jogVelocity[deckId] * 0.3 + instantVelSeek * 0.7

        const velSeek = this._jogVelocity[deckId]
        const normVelSeek = Math.min(velSeek / 80, 1.0)

        // Slow: 50ms/tick, Fast: up to 5 seconds/tick
        const seekAmount = (0.05 + normVelSeek * normVelSeek * 4.95) * Math.sign(delta)
        deck.seekTo(deck.getCurrentPosition() + seekAmount)
      }
    } else {
      // Scratch mode — velocity-aware
      if (deck.isPlaying) {
        const nowScratch = performance.now()
        const dtScratch = (nowScratch - (this._jogLastTime[deckId] || nowScratch)) / 1000
        this._jogLastTime[deckId] = nowScratch

        // Compute velocity: ticks per second, smoothed with previous
        const instantVel = dtScratch > 0 ? Math.abs(delta) / dtScratch : 0
        this._jogVelocity[deckId] = this._jogVelocity[deckId] * 0.3 + instantVel * 0.7

        // Non-linear mapping: quadratic for natural "vinyl" feel
        const velocity = this._jogVelocity[deckId]
        const normalizedVel = Math.min(velocity / 80, 1.0)  // 80 ticks/sec = max
        const curvedRate = 0.05 + normalizedVel * normalizedVel * 7.95  // 0.05x → 8.0x

        // Direction handling (reverse buffer swap)
        const isBackward = delta < 0
        const baseRev = this._scratchBaseRev[deckId] || false
        const shouldBeReversed = isBackward ? !baseRev : baseRev

        if (deck.isReversed !== shouldBeReversed) {
          const now2 = Date.now()
          if (!this._lastReverseTime) this._lastReverseTime = {}
          if (now2 - (this._lastReverseTime[deckId] || 0) > 40) {
            deck.toggleReverse()
            this._lastReverseTime[deckId] = now2
          }
        }

        deck.setScratchRate(Math.max(0.01, Math.min(8, curvedRate)))
      } else {
        // Paused seek — velocity-aware (same as non-scratch paused seek)
        const nowSeek2 = performance.now()
        const dtSeek2 = (nowSeek2 - (this._jogLastTime[deckId] || nowSeek2)) / 1000
        this._jogLastTime[deckId] = nowSeek2

        const instantVelSeek2 = dtSeek2 > 0 ? Math.abs(delta) / dtSeek2 : 0
        this._jogVelocity[deckId] = this._jogVelocity[deckId] * 0.3 + instantVelSeek2 * 0.7

        const velSeek2 = this._jogVelocity[deckId]
        const normVelSeek2 = Math.min(velSeek2 / 80, 1.0)
        const seekAmount2 = (0.05 + normVelSeek2 * normVelSeek2 * 4.95) * Math.sign(delta)
        deck.seekTo(deck.getCurrentPosition() + seekAmount2)
      }
    }
  }

  onJogTouch(deckId) {
    const deck = this._deck(deckId)
    deck.isJogTouched = true
    
    // Only capture base reverse state on fresh touch (not already touching)
    // Prevents compounding: if a previous scratch left isReversed=true,
    // a new touch would capture the wrong "base" state
    if (!this._jogTouched[deckId]) {
      this._scratchBaseRev[deckId] = deck.isReversed
    }
    this._jogTouched[deckId] = true
    
    const store = useAppStore.getState()
    const deckState = store[deckId === 'A' ? 'deckA' : 'deckB']

    if (deckState.pitchLockRate !== null) {
      return;  // Locked — ignore touch. Only UI button can unlock.
    }

    if (store.scratchModeEnabled) {
      if (deck.isPlaying) {
        deck.brakeScratch() // Stop immediately with platter inertia
      }
    }
  }

  onJogRelease(deckId) {
    this._jogTouched[deckId] = false
    const deck = this._deck(deckId)
    deck.isJogTouched = false
    const store = useAppStore.getState()
    const deckState = store[deckId === 'A' ? 'deckA' : 'deckB']

    if (deckState.pitchLockRate !== null) {
      return; // Ignore release if locked
    }

    // Clear any pending wheel stop timers
    if (this._jogTimer[deckId]) {
      clearTimeout(this._jogTimer[deckId])
      this._jogTimer[deckId] = null
    }

    const baseRev = this._scratchBaseRev[deckId] || false;
    if (deck.isReversed !== baseRev) {
      deck.toggleReverse()
      useAppStore.getState().updateDeck(deckId, { isReversed: baseRev })
    }
    deck.releaseScratch()
    useAppStore.getState().updateDeck(deckId, { liveRate: 1.0 })
  }

  // ─── Pitch Lock (Cruise Control) ───────────────────────────────────────────
  lockCurrentScratchRate(deckId) {
    const deck = this._deck(deckId)
    const store = useAppStore.getState()
    
    if (!deck.isPlaying) return
    
    // Robust rate capture — priority order:
    // 1) Last active scratch rate (the speed the user actually saw — no expiry)
    // 2) Current playback rate (if meaningful, i.e. not braked to ~0)
    // 3) Pitch rate (base speed — always valid fallback)
    let rateToLock = deck.pitchRate  // safe fallback
    
    if (deck._lastActiveScratchRate && deck._lastActiveScratchRate > 0.01) {
      rateToLock = deck._lastActiveScratchRate
    } else if (deck._currentPlaybackRate && deck._currentPlaybackRate > 0.01) {
      rateToLock = deck._currentPlaybackRate
    }
    
    deck.setScratchRate(rateToLock)
    
    // Drain jog velocity so it doesn't carry into next unlocked session
    this._jogVelocity[deckId] = 0
    
    // Clear any pending wheel-stop timers that would brake/release
    if (this._jogTimer[deckId]) {
      clearTimeout(this._jogTimer[deckId])
      this._jogTimer[deckId] = null
    }
    
    store.updateDeck(deckId, {
      pitchLockRate: rateToLock,
      liveRate: rateToLock / deck.pitchRate
    })
  }

  unlockScratchRate(deckId) {
    const store = useAppStore.getState()
    store.updateDeck(deckId, {
      pitchLockRate: null,
      liveRate: 1.0
    })
    const deck = this._deck(deckId)
    if (deck.isPlaying) {
      deck.releaseScratch()
    }
  }

  // ─── Stems ────────────────────────────────────────────────────────────────
  toggleVocals(deckId) {
    const deck = this._deck(deckId)
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    const newMuted = !store[deckKey].vocalsMuted
    deck.setVocalsMute(newMuted)
    store.updateDeck(deckId, { vocalsMuted: newMuted })
  }

  toggleInstrumentals(deckId) {
    const deck = this._deck(deckId)
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    const newMuted = !store[deckKey].instrumentalsMuted
    deck.setInstrumentalsMute(newMuted)
    store.updateDeck(deckId, { instrumentalsMuted: newMuted })
  }

  toggleGranularStemMode(deckId) {
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    const newMode = store[deckKey].granularStemMode === 'solo' ? 'mute' : 'solo'
    store.updateDeck(deckId, { granularStemMode: newMode })
  }

  toggleGranularStem(deckId, stemType) {
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    const deckState = store[deckKey]
    const mode = deckState.granularStemMode
    const deck = this._deck(deckId)
    
    let newMutedState = { ...deckState.granularStemsMuted }

    if (mode === 'solo') {
      const allUnmuted = !newMutedState.drums && !newMutedState.bass && !newMutedState.other
      if (allUnmuted) {
        newMutedState.drums = stemType !== 'drums'
        newMutedState.bass = stemType !== 'bass'
        newMutedState.other = stemType !== 'other'
      } else {
        newMutedState[stemType] = !newMutedState[stemType]
        
        // If toggling this stem leaves all stems muted, reset to all unmuted (exit solo mode)
        if (newMutedState.drums && newMutedState.bass && newMutedState.other) {
          newMutedState.drums = false
          newMutedState.bass = false
          newMutedState.other = false
        }
      }
    } else {
      // Mute mode (Subtract)
      newMutedState[stemType] = !newMutedState[stemType]
    }
    
    deck.setGranularStemsMuted(newMutedState)
    store.updateDeck(deckId, { granularStemsMuted: newMutedState })
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

  // ─── FX ───────────────────────────────────────────────────────────────────
  setFXType(deckId, effectName) {
    const deck = this._deck(deckId)
    deck.fxChain.setEffect(effectName)
    // When changing effect, usually we want it to be fully wet or off by default, but let's keep current state or sync with store
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    
    // Re-apply current parameters to new effect
    deck.fxChain.setAmount(store[deckKey].fx.amount)
    deck.fxChain.setBeatLength(store[deckKey].fx.beatTiming)
    deck.fxChain.toggle(store[deckKey].fx.isOn)
    if (effectName === 'Filter') {
      deck.fxChain.setFilterMode(store[deckKey].fx.filterMode)
    }

    useAppStore.getState().updateDeck(deckId, {
      fx: { ...store[deckKey].fx, selectedEffect: effectName }
    })
  }

  toggleFX(deckId) {
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    const newIsOn = !store[deckKey].fx.isOn
    
    this._deck(deckId).fxChain.toggle(newIsOn)
    useAppStore.getState().updateDeck(deckId, {
      fx: { ...store[deckKey].fx, isOn: newIsOn }
    })
  }

  setFXAmount(deckId, amount) {
    this._deck(deckId).fxChain.setAmount(amount)
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    useAppStore.getState().updateDeck(deckId, {
      fx: { ...store[deckKey].fx, amount }
    })
  }

  setFXTiming(deckId, beats) {
    this._deck(deckId).fxChain.setBeatLength(beats)
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    useAppStore.getState().updateDeck(deckId, {
      fx: { ...store[deckKey].fx, beatTiming: beats }
    })
  }

  setFilterMode(deckId, mode) {
    this._deck(deckId).fxChain.setFilterMode(mode)
    const store = useAppStore.getState()
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB'
    useAppStore.getState().updateDeck(deckId, {
      fx: { ...store[deckKey].fx, filterMode: mode }
    })
  }

  // ─── Browse knob ──────────────────────────────────────────────────────────
  browseTurn(delta) {
    const store = useAppStore.getState()
    const maxIndex = Math.max(0, store.browseListCount - 1)
    const newIndex = Math.max(0, Math.min(maxIndex, store.browseIndex + delta))
    store.setBrowseIndex(newIndex)
    // Accumulate visual rotation for the browse knob (30° per step)
    useAppStore.setState({ browseAngle: store.browseAngle + delta * 30 })
  }

  // ─── MIDI action dispatcher ────────────────────────────────────────────────
  dispatch(action, msg) {
    const isOn = msg.type === 'noteon'
    const isOff = msg.type === 'noteoff'
    const val = msg.value !== undefined ? msg.value / 127 : 0
    const rawVal = msg.value ?? 0
    const store = useAppStore.getState()
    
    // Store physical button pressed state for UI feedback
    if (isOn) useAppStore.getState().setButtonPressed(action, true)
    if (isOff) useAppStore.getState().setButtonPressed(action, false)

    switch (action) {
      // Deck A buttons
      case 'play_pause_A':  if (isOn) this.togglePlay('A'); break
      // case 'play_A':        if (isOn) this.playStutter('A'); break
      // case 'pause_A':       if (isOn) this.pause('A'); break
      case 'play_A':        if (isOn) this.playStutter('A'); break // Kept for older configs
      case 'pause_A':       if (isOn) this.pause('A'); break // Kept for older configs
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
        if (isOn) this.onJogTouch('A')
        if (isOff) this.onJogRelease('A')
        break

      // Deck A knobs (CC)
      case 'pitch_slider_A': this.setPitchSlider('A', val); break
      case 'treble_A':      
        if (store.eqMode === '3-band') {
          this.setTreble('A', val); // High
        } else {
          this.setTreble('A', val);
        }
        break
      case 'bass_A':
        if (store.eqMode === '3-band') {
          this._deck('A').setMid(val); // Mid
          store.updateDeck('A', { mid: val })
        } else {
          this.setBass('A', val);
        }
        break
      case 'volume_A':
        if (store.eqMode === '3-band') {
          this.setBass('A', val); // Low
        } else {
          this.setVolume('A', val);
        }
        break

      // Deck B buttons
      case 'play_pause_B':  if (isOn) this.togglePlay('B'); break
      // case 'play_B':        if (isOn) this.playStutter('B'); break
      // case 'pause_B':       if (isOn) this.pause('B'); break
      case 'play_B':        if (isOn) this.playStutter('B'); break // Kept for older configs
      case 'pause_B':       if (isOn) this.pause('B'); break // Kept for older configs
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
        if (isOn) this.onJogTouch('B')
        if (isOff) this.onJogRelease('B')
        break

      // Deck B knobs
      case 'pitch_slider_B': this.setPitchSlider('B', val); break
      case 'treble_B':      
        if (store.eqMode === '3-band') {
          this.setTreble('B', val); // High
        } else {
          this.setTreble('B', val);
        }
        break
      case 'bass_B':
        if (store.eqMode === '3-band') {
          this._deck('B').setMid(val); // Mid
          store.updateDeck('B', { mid: val })
        } else {
          this.setBass('B', val);
        }
        break
      case 'volume_B':
        if (store.eqMode === '3-band') {
          this.setBass('B', val); // Low
        } else {
          this.setVolume('B', val);
        }
        break

      // Center controls
      case 'crossfader':    this.setCrossfader(1.0 - val); break
      case 'master_volume': this.setMasterVolume(val); break
      case 'browse_turn':
        // Relative CC: >64 = clockwise, <64 = counter-clockwise
        this.browseTurn(rawVal > 64 ? -1 : 1)
        break
      case 'browse_press':
        if (isOn) useAppStore.getState().toggleBrowse()
        break
      case 'scratch_toggle':
        // The hardware button acts as a latch (maintains its own state).
        // It sends noteon when pressed to turn ON, and noteoff when pressed to turn OFF.
        useAppStore.getState().setScratchMode(isOn)
        break
    }
  }

  _loadSelectedToDeck(deckId) {
    const store = useAppStore.getState()
    if (store.activeLoadCallback) {
      store.activeLoadCallback(deckId, store.browseIndex)
    }
  }

  _deck(id) {
    return id === 'A' ? this.engine.deckA : this.engine.deckB
  }

  async _playNextInQueue(deckId) {
    const store = useAppStore.getState()
    const key = deckId === 'A' ? 'deckA' : 'deckB'
    const queue = store[key].queue
    if (queue.length === 0) return

    const nextTrack = queue[0]
    // Remove from queue
    store.removeFromQueue(deckId, 0)
    // Load and play
    await this.loadTrack(deckId, nextTrack)
    this.playStutter(deckId)
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

import React, { useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { Knob } from './Knob.jsx'
import { JogWheel } from './JogWheel.jsx'
import { FXPanel } from './FXPanel.jsx'

function StemProgress({ deckId }) {
  const deckState = useAppStore(s => deckId === 'A' ? s.deckA : s.deckB)
  const isA = deckId === 'A'

  const progressText = deckState.stemsProgress || ''
  const lowerText = progressText.toLowerCase()

  const isIdle = !deckState.track || deckState.stemsReady || 
    (!deckState.stemsFailed && !deckState.stemsProgress) ||
    lowerText.includes('done') || lowerText === 'complete'

  const isFailed = deckState.stemsFailed === true
  const isCancelled = deckState.stemsFailed === 'cancelled'

  // Parse progress for active state
  let pct = 0
  if (lowerText.includes('reading')) {
    pct = 5
  } else if (progressText.match(/^(\d+)\/(\d+)$/)) {
    const match = progressText.match(/^(\d+)\/(\d+)$/)
    const curr = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)
    pct = (curr / total) * 100
  } else if (lowerText.includes('writing')) {
    pct = 100
  }

  // Format text for user
  let displayText = progressText
  let isProcessing = !isIdle && !isFailed && !isCancelled

  if (lowerText.includes('wrote:')) {
    const fileMatch = progressText.match(/([^\\/]+)\.wav/i)
    displayText = fileMatch ? `Saved ${fileMatch[1]} track...` : 'Saving track...'
  } else if (progressText.match(/^\d+\/\d+$/)) {
    displayText = 'Separating track...'
  } else if (lowerText.includes('loading model') || lowerText.includes('reading')) {
    displayText = 'Starting to separate the track...'
  } else if (lowerText.includes('writing')) {
    displayText = 'Finalizing files...'
  }

  if (isFailed) {
    displayText = 'Stem separation failed'
    pct = 100
  } else if (isCancelled) {
    displayText = 'Stem separation cancelled'
    pct = 100
  }

  const baseColor = isA ? '#1db954' : '#3b82f6'
  const activeColor = isFailed ? '#ef4444' : isCancelled ? '#eab308' : baseColor

  return (
    <div style={{ 
      width: '35%', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '4px', 
      visibility: isIdle ? 'hidden' : 'visible'
    }}>
      <style>
        {`
          @keyframes stem-pulse-anim {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
          }
          .stem-progress-pulse {
            animation: stem-pulse-anim 1.5s ease-in-out infinite;
          }
        `}
      </style>
      <div style={{ 
        width: '100%', 
        height: '6px', 
        background: '#1a1a1a', 
        borderRadius: '3px', 
        overflow: 'hidden', 
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        <div style={{ 
          width: `${pct}%`, 
          height: '100%', 
          background: activeColor, 
          transition: 'width 0.3s ease',
          boxShadow: `0 0 8px ${activeColor}80`
        }} />
      </div>
      <div 
        className={isProcessing ? 'stem-progress-pulse' : ''}
        style={{ 
        fontSize: '10px', 
        color: isFailed ? '#ef4444' : isCancelled ? '#eab308' : '#888', 
        textAlign: isA ? 'left' : 'right', 
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minHeight: '12px'
      }}>
        {displayText || 'Idle'}
      </div>
    </div>
  )
}

function DeckButtons({ deckId }) {
  const dj = getDJController()
  const isA = deckId === 'A'
  const deckState = useAppStore(s => isA ? s.deckA : s.deckB)
  const pressed = useAppStore(s => s.pressedButtons)

  const onPlay = useCallback(() => dj.playStutter(deckId), [deckId])
  const onPause = useCallback(() => dj.pause(deckId), [deckId])
  const onCueDown = useCallback(() => dj.cueDown(deckId), [deckId])
  const onCueUp = useCallback(() => dj.cueUp(deckId), [deckId])
  const onSync = useCallback(() => dj.sync(deckId), [deckId])
  const onRev = useCallback(() => dj.toggleReverse(deckId), [deckId])

  return (
    <div className="hw-btn-column">
      <button
        className={`hw-btn hw-btn--sync ${deckState.isSyncEnabled ? (isA ? 'active--a' : 'active--b') : ''} ${pressed[`sync_${deckId}`] ? 'hw-btn--pressed' : ''}`}
        onClick={onSync}
        title="SYNC"
      >
        SYNC
      </button>
      <button
        className={`hw-btn hw-btn--rev ${deckState.isReversed ? 'active--rev' : ''} ${pressed[`rev_${deckId}`] ? 'hw-btn--pressed' : ''}`}
        onClick={onRev}
        title="REV"
      >
        REV
      </button>
      <button
        className={`hw-btn hw-btn--cue ${pressed[`cue_${deckId}`] ? 'hw-btn--pressed' : ''}`}
        onMouseDown={onCueDown}
        onMouseUp={onCueUp}
        title="CUE"
      >
        CUE
      </button>
      <button
        className={`hw-btn hw-btn--play ${deckState.isPlaying ? (isA ? 'active--a' : 'active--b') : ''} ${pressed[`play_pause_${deckId}`] || pressed[`play_${deckId}`] ? 'hw-btn--pressed' : ''}`}
        onClick={deckState.isPlaying ? onPause : onPlay}
        title="PLAY / PAUSE"
      >
        ▶ ‖
      </button>
    </div>
  )
}

function DeckKnobs({ deckId }) {
  const dj = getDJController()
  const isA = deckId === 'A'
  const deckState = useAppStore(s => isA ? s.deckA : s.deckB)
  const pressed = useAppStore(s => s.pressedButtons)
  const eqMode = useAppStore(s => s.eqMode)

  const onPitchDown = useCallback(() => dj.pitchBendDown(deckId), [deckId])
  const onPitchUp = useCallback(() => dj.pitchBendUp(deckId), [deckId])
  const onPitchRelease = useCallback(() => dj.pitchBendRelease(deckId), [deckId])

  return (
    <div className="knob-column">
      <div className="pitch-btns">
        <button
          className={`hw-btn hw-btn--pitch ${pressed[`pitch_minus_${deckId}`] ? 'hw-btn--pressed' : ''}`}
          onMouseDown={onPitchDown}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH -"
        >
          −%
        </button>
        <button
          className={`hw-btn hw-btn--pitch ${pressed[`pitch_plus_${deckId}`] ? 'hw-btn--pressed' : ''}`}
          onMouseDown={onPitchUp}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH +"
        >
          +%
        </button>
      </div>
      <Knob
        label={eqMode === '3-band' ? 'HIGH' : 'TREBLE'}
        value={deckState.treble ?? 0.5}
        onChange={v => dj.setTreble(deckId, v)}
        size={40}
      />
      <Knob
        label={eqMode === '3-band' ? 'MID' : 'BASS'}
        value={eqMode === '3-band' ? (deckState.mid ?? 0.5) : (deckState.bass ?? 0.5)}
        onChange={v => {
          if (eqMode === '3-band') {
            dj._deck(deckId).setMid(v);
            useAppStore.getState().updateDeck(deckId, { mid: v })
          } else {
            dj.setBass(deckId, v)
          }
        }}
        size={40}
      />
      <Knob
        label={eqMode === '3-band' ? 'LOW' : 'VOLUME'}
        value={eqMode === '3-band' ? (deckState.bass ?? 0.5) : (deckState.volume ?? 0.8)}
        onChange={v => {
          if (eqMode === '3-band') {
            dj.setBass(deckId, v)
          } else {
            dj.setVolume(deckId, v)
          }
        }}
        size={40}
      />
    </div>
  )
}

function BrowseKnob() {
  const dj = getDJController()
  const browseAngle = useAppStore(s => s.browseAngle)
  const dragStart = useRef(null)
  const accumulated = useRef(0)
  const didDrag = useRef(false)
  const size = 50

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    dragStart.current = e.clientX
    accumulated.current = 0
    didDrag.current = false

    const handleMouseMove = (e) => {
      if (dragStart.current === null) return
      const dx = e.clientX - dragStart.current
      accumulated.current += dx
      dragStart.current = e.clientX
      // Every 20px of drag = one browse step
      const steps = Math.trunc(accumulated.current / 20)
      if (steps !== 0) {
        didDrag.current = true
        for (let i = 0; i < Math.abs(steps); i++) {
          dj.browseTurn(steps > 0 ? 1 : -1)
        }
        accumulated.current -= steps * 20
      }
    }

    const handleMouseUp = () => {
      // If user didn't drag, treat as a click → toggle browse modal
      if (!didDrag.current) {
        useAppStore.getState().toggleBrowse()
      }
      dragStart.current = null
      accumulated.current = 0
      didDrag.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    dj.browseTurn(e.deltaY > 0 ? 1 : -1)
  }, [])

  return (
    <div className="knob-wrap-hw" style={{ position: 'relative' }}>
      <label className="knob-label-hw">BROWSE</label>
      <div
        className="knob-hw knob-hw--pressable"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        title="Click to open Browser · Drag to scroll"
      >
        <div
          className="knob-hw__pointer"
          style={{ transform: `rotate(${browseAngle}deg)` }}
        />
        <div className="knob-hw__dot" />
        <div className="knob-hw__press-hint" />
      </div>
    </div>
  )
}

function CenterSection() {
  const dj = getDJController()
  const masterVolume = useAppStore(s => s.masterVolume)
  const scratchMode = useAppStore(s => s.scratchModeEnabled)
  const pressed = useAppStore(s => s.pressedButtons)
  const eqMode = useAppStore(s => s.eqMode)

  return (
    <div className="controller-center">
      <Knob
        label="MASTER VOLUME"
        value={masterVolume}
        onChange={v => dj.setMasterVolume(v)}
        size={46}
      />
      <BrowseKnob />
      
      {/* EQ Mode Toggle */}
      <button 
        className="hw-btn" 
        style={{ width: '40px', height: '24px', fontSize: '9px', padding: 0, marginTop: '10px' }}
        onClick={() => {
          const current = useAppStore.getState().eqMode;
          useAppStore.setState({ eqMode: current === '2-band' ? '3-band' : '2-band' });
        }}
        title="Toggle 2-Band (Volume) / 3-Band (High/Mid/Low) EQ"
      >
        {eqMode === '3-band' ? '3-EQ' : '2-EQ'}
      </button>
      <div className="load-buttons">
        <button
          className={`hw-btn hw-btn--load ${pressed['load_A'] ? 'hw-btn--pressed' : ''}`}
          onClick={() => dj._loadSelectedToDeck('A')}
          title="Load to Deck A"
        >
          A
        </button>
        <button
          className={`hw-btn hw-btn--scratch ${scratchMode ? 'active--scratch' : ''} ${pressed['scratch_toggle'] ? 'hw-btn--pressed' : ''}`}
          onClick={() => dj.toggleScratchMode()}
          title="Scratch / Search"
        />
        <button
          className={`hw-btn hw-btn--load ${pressed['load_B'] ? 'hw-btn--pressed' : ''}`}
          onClick={() => dj._loadSelectedToDeck('B')}
          title="Load to Deck B"
        >
          B
        </button>
      </div>
    </div>
  )
}

function Crossfader() {
  const dj = getDJController()
  const crossfader = useAppStore(s => s.crossfader)

  return (
    <div className="crossfader-wrap">
      <input
        type="range"
        className="crossfader"
        min="0"
        max="1"
        step="0.005"
        value={crossfader}
        onChange={e => dj.setCrossfader(parseFloat(e.target.value))}
      />
    </div>
  )
}

export function ControllerSurface() {
  const dj = getDJController()

  const handleJog = useCallback((deckId, midiValue) => {
    dj.onJogWheel(deckId, midiValue)
  }, [dj])

  const handleJogRelease = useCallback((deckId) => {
    dj.onJogRelease(deckId)
  }, [dj])

  return (
    <div className="controller-surface">
      {/* Textured overlay */}
      <div className="controller-surface__texture" />

      <div className="controller-layout">
        {/* Left Deck FX */}
        <FXPanel deckId="A" />

        {/* Left Deck (A) */}
        <div className="controller-deck controller-deck--a">
          <DeckButtons deckId="A" />
          <JogWheel deckId="A" onJog={handleJog} onJogRelease={handleJogRelease} />
          <DeckKnobs deckId="A" />
        </div>

        {/* Center */}
        <CenterSection />

        {/* Right Deck (B) */}
        <div className="controller-deck controller-deck--b">
          <DeckKnobs deckId="B" />
          <JogWheel deckId="B" onJog={handleJog} onJogRelease={handleJogRelease} />
          <DeckButtons deckId="B" />
        </div>

        {/* Right Deck FX */}
        <FXPanel deckId="B" />
      </div>

      {/* Crossfader */}
      <Crossfader />

      {/* Stem Progress Bars (Absolute positioned to avoid dead space) */}
      <div style={{ 
        position: 'absolute', 
        bottom: '8px', 
        left: '24px', 
        right: '24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        pointerEvents: 'none',
        zIndex: 10 
      }}>
        <StemProgress deckId="A" />
        <StemProgress deckId="B" />
      </div>

      {/* ION Branding */}
      <div className="ion-branding">
        <span className="ion-branding__star">✻</span>
        <span className="ion-branding__text">ION</span>
        <span className="ion-branding__sub">DISCOVER DJ</span>
      </div>
    </div>
  )
}

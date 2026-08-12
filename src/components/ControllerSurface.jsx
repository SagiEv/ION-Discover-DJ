import React, { useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { Knob } from './Knob.jsx'
import { JogWheel } from './JogWheel.jsx'
import { FXPanel } from './FXPanel.jsx'

function StemProgress({ deckId }) {
  const isA = deckId === 'A'
  const deckState = useAppStore(s => isA ? s.deckA : s.deckB)

  const isFailed = deckState.stemsProgress && deckState.stemsProgress.toLowerCase().includes('failed:')

  if (
    !deckState.track || 
    deckState.stemsReady || 
    (!isFailed && deckState.stemsFailed) || 
    !deckState.stemsProgress || 
    (!isFailed && deckState.stemsProgress.toLowerCase().includes('done'))
  ) {
    return <div style={{ width: '30%', height: '4px' }} /> // placeholder
  }

  // Parse progress
  let pct = 0
  const match = deckState.stemsProgress.match(/(\d+)\/(\d+)/)
  if (match) {
    const curr = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)
    if (total > 0) pct = (curr / total) * 100
  } else if (deckState.stemsProgress.includes('%')) {
    const m = deckState.stemsProgress.match(/(\d+(\.\d+)?)%/)
    if (m) pct = parseFloat(m[1])
  } else if (deckState.stemsProgress.toLowerCase().includes('done') || deckState.stemsProgress.toLowerCase().includes('writing')) {
    pct = 100
  }
  // Format text for user
  let progressText = deckState.stemsProgress
  let isProcessing = true
  const lowerText = progressText.toLowerCase()

  if (lowerText.includes('wrote:')) {
    const fileMatch = progressText.match(/([^\\/]+)\.wav/i)
    if (fileMatch) {
      progressText = `Saved ${fileMatch[1]} track...`
    } else {
      progressText = 'Saving track...'
    }
  } else if (progressText.match(/^\d+\/\d+$/)) {
    progressText = 'Separating track...'
  } else if (lowerText.includes('loading model') || lowerText.includes('reading')) {
    progressText = 'Starting to separate the track...'
  } else if (lowerText.includes('done')) {
    progressText = 'Done!'
    isProcessing = false
  } else if (lowerText.includes('writing')) {
    progressText = 'Finalizing files...'
  } else if (lowerText.includes('failed:')) {
    progressText = deckState.stemsProgress // Keep the exact error message we sent from main
    isProcessing = false
  }

  const isError = lowerText.includes('failed:')
  const color = isError ? '#ef4444' : (isA ? '#1db954' : '#3b82f6')
  const barWidth = isError ? '100%' : `${pct}%`

  return (
    <div style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
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
          width: barWidth, 
          height: '100%', 
          background: color, 
          transition: 'width 0.3s ease',
          boxShadow: `0 0 8px ${color}80`
        }} />
      </div>
      <div 
        className={isProcessing ? 'stem-progress-pulse' : ''}
        style={{ 
        fontSize: '10px', 
        color: '#888', 
        textAlign: isA ? 'left' : 'right', 
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {progressText}
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
      <Knob
        label="BROWSE"
        value={0.5}
        onChange={v => {
          const delta = v > 0.5 ? 1 : -1
          dj.browseTurn(delta)
        }}
        size={50}
      />
      
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
        >
          {scratchMode ? '●' : '○'}
        </button>
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

      {/* Stem Progress Bars */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px', marginTop: '4px', position: 'relative', zIndex: 10 }}>
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

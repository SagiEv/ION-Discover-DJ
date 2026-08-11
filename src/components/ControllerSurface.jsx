import React, { useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { Knob } from './Knob.jsx'
import { JogWheel } from './JogWheel.jsx'
import { FXPanel } from './FXPanel.jsx'

function DeckButtons({ deckId }) {
  const dj = getDJController()
  const isA = deckId === 'A'
  const deckState = useAppStore(s => isA ? s.deckA : s.deckB)

  const onPlay = useCallback(() => dj.playStutter(deckId), [deckId])
  const onPause = useCallback(() => dj.pause(deckId), [deckId])
  const onCueDown = useCallback(() => dj.cueDown(deckId), [deckId])
  const onCueUp = useCallback(() => dj.cueUp(deckId), [deckId])
  const onSync = useCallback(() => dj.sync(deckId), [deckId])
  const onRev = useCallback(() => dj.toggleReverse(deckId), [deckId])

  return (
    <div className="hw-btn-column">
      <button
        className={`hw-btn hw-btn--sync ${deckState.isPlaying ? (isA ? 'active--a' : 'active--b') : ''}`}
        onClick={onSync}
        title="SYNC"
      >
        SYNC
      </button>
      <button
        className={`hw-btn hw-btn--rev ${deckState.isReversed ? 'active--rev' : ''}`}
        onClick={onRev}
        title="REV"
      >
        REV
      </button>
      <button
        className="hw-btn hw-btn--cue"
        onMouseDown={onCueDown}
        onMouseUp={onCueUp}
        title="CUE"
      >
        CUE
      </button>
      <button
        className={`hw-btn hw-btn--play ${deckState.isPlaying ? (isA ? 'active--a' : 'active--b') : ''}`}
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

  const onPitchDown = useCallback(() => dj.pitchBendDown(deckId), [deckId])
  const onPitchUp = useCallback(() => dj.pitchBendUp(deckId), [deckId])
  const onPitchRelease = useCallback(() => dj.pitchBendRelease(deckId), [deckId])

  return (
    <div className="knob-column">
      <div className="pitch-btns">
        <button
          className="hw-btn hw-btn--pitch"
          onMouseDown={onPitchDown}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH -"
        >
          −%
        </button>
        <button
          className="hw-btn hw-btn--pitch"
          onMouseDown={onPitchUp}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH +"
        >
          +%
        </button>
      </div>
      <Knob
        label="TREBLE"
        value={deckState.treble ?? 0.5}
        onChange={v => dj.setTreble(deckId, v)}
        size={40}
      />
      <Knob
        label="BASS"
        value={deckState.bass ?? 0.5}
        onChange={v => dj.setBass(deckId, v)}
        size={40}
      />
      <Knob
        label="VOLUME"
        value={deckState.volume ?? 0.8}
        onChange={v => dj.setVolume(deckId, v)}
        size={40}
      />
    </div>
  )
}

function CenterSection() {
  const dj = getDJController()
  const masterVolume = useAppStore(s => s.masterVolume)
  const scratchMode = useAppStore(s => s.scratchModeEnabled)

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
      <div className="load-buttons">
        <button
          className="hw-btn hw-btn--load"
          onClick={() => dj._loadSelectedToDeck('A')}
          title="Load to Deck A"
        >
          A
        </button>
        <button
          className={`hw-btn hw-btn--scratch ${scratchMode ? 'active--scratch' : ''}`}
          onClick={() => dj.toggleScratchMode()}
          title="Scratch / Search"
        >
          {scratchMode ? '●' : '○'}
        </button>
        <button
          className="hw-btn hw-btn--load"
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

      {/* ION Branding */}
      <div className="ion-branding">
        <span className="ion-branding__star">✻</span>
        <span className="ion-branding__text">ION</span>
        <span className="ion-branding__sub">DISCOVER DJ</span>
      </div>
    </div>
  )
}

import React, { useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { WaveformView } from './WaveformView.jsx'

function fmt(secs) {
  if (!secs || isNaN(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function dBDisplay(normalized) {
  const db = ((normalized ?? 0.5) * 24 - 12).toFixed(1)
  return `${db > 0 ? '+' : ''}${db}dB`
}

export function DeckPanel({ deckId }) {
  const deckState = useAppStore(s => deckId === 'A' ? s.deckA : s.deckB)
  const dj = getDJController()

  const isA = deckId === 'A'
  const deckClass = `deck deck--${deckId.toLowerCase()}`
  const accent = isA ? 'accent-a' : 'accent-b'

  const onPlay = useCallback(() => dj.playStutter(deckId), [deckId])
  const onPause = useCallback(() => dj.pause(deckId), [deckId])
  const onCueDown = useCallback(() => dj.cueDown(deckId), [deckId])
  const onCueUp = useCallback(() => dj.cueUp(deckId), [deckId])
  const onSync = useCallback(() => dj.sync(deckId), [deckId])
  const onRev = useCallback(() => dj.toggleReverse(deckId), [deckId])
  const onPitchDown = useCallback(() => dj.pitchBendDown(deckId), [deckId])
  const onPitchUp = useCallback(() => dj.pitchBendUp(deckId), [deckId])
  const onPitchRelease = useCallback(() => dj.pitchBendRelease(deckId), [deckId])

  const remaining = deckState.duration - deckState.position

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const trackIndex = e.dataTransfer.getData('text/plain')
    if (trackIndex) {
      const track = useAppStore.getState().library[parseInt(trackIndex, 10)]
      if (track) dj.loadTrack(deckId, track)
    }
  }, [deckId, dj])

  return (
    <div 
      className={deckClass}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Track info */}
      <div className="deck__info">
        <div className="deck__art" style={{
          background: deckState.track
            ? `linear-gradient(135deg, ${isA ? '#1db95422' : '#3b82f622'}, var(--bg-raised))`
            : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {deckState.track ? '🎵' : ''}
        </div>
        <div className="deck__meta">
          <div className="deck__title">
            {deckState.track?.name ?? `DECK ${deckId}`}
          </div>
          {deckState.track && (
            <>
              <div className="deck__artist">{deckState.track.path?.split(/[\\/]/).at(-2) ?? ''}</div>
              <div className="deck__bpm">
                BPM <span>{deckState.bpm || '—'}</span>
                {deckState.isReversed && <span style={{ color: '#ef4444', marginLeft: 8 }}>◀ REV</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Waveform */}
      <WaveformView deckId={deckId} />

      {/* Time */}
      <div className="deck__time">
        <span className="deck__time__current">{fmt(deckState.position)}</span>
        <span>─{fmt(remaining)}</span>
      </div>

      {/* Control buttons */}
      <div className="deck__controls">
        {/* Row 1: Play, Pause, Cue, Sync */}
        <button
          id={`btn-play-${deckId}`}
          className={`btn btn--play ${deckState.isPlaying ? (isA ? 'playing' : 'playing--b') : ''}`}
          onClick={onPlay}
          title="PLAY / STUTTER"
        >
          <span className="btn__icon">{deckState.isPlaying ? '▶▶' : '▶'}</span>
          <span>PLAY</span>
        </button>

        <button
          id={`btn-pause-${deckId}`}
          className={`btn ${!deckState.isPlaying && deckState.track ? (isA ? 'active' : 'active--b') : ''}`}
          onClick={onPause}
          title="PAUSE (sets cue point)"
        >
          <span className="btn__icon">⏸</span>
          <span>PAUSE</span>
        </button>

        <button
          id={`btn-cue-${deckId}`}
          className="btn btn--cue"
          onMouseDown={onCueDown}
          onMouseUp={onCueUp}
          title="CUE – hold to preview, release to snap back"
        >
          <span className="btn__icon">◈</span>
          <span>CUE</span>
        </button>

        <button
          id={`btn-sync-${deckId}`}
          className="btn btn--sync"
          onClick={onSync}
          title="SYNC – match BPM to opposite deck"
        >
          <span className="btn__icon">⟳</span>
          <span>SYNC</span>
        </button>

        {/* Row 2: Pitch -%, Pitch +%, Rev, Load */}
        <button
          id={`btn-pitch-minus-${deckId}`}
          className="btn btn--pitch"
          onMouseDown={onPitchDown}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH – slow down (hold)"
        >
          <span className="btn__icon">▼</span>
          <span>-%</span>
        </button>

        <button
          id={`btn-pitch-plus-${deckId}`}
          className="btn btn--pitch"
          onMouseDown={onPitchUp}
          onMouseUp={onPitchRelease}
          onMouseLeave={onPitchRelease}
          title="PITCH + speed up (hold)"
        >
          <span className="btn__icon">▲</span>
          <span>+%</span>
        </button>

        <button
          id={`btn-rev-${deckId}`}
          className={`btn btn--rev ${deckState.isReversed ? 'active' : ''}`}
          onClick={onRev}
          title="REV – reverse playback"
        >
          <span className="btn__icon">◀</span>
          <span>REV</span>
        </button>

        <button
          id={`btn-load-${deckId}`}
          className="btn"
          onClick={() => dj._loadSelectedToDeck(deckId)}
          title={`LOAD – load selected track to Deck ${deckId}`}
        >
          <span className="btn__icon">⬆</span>
          <span>LOAD</span>
        </button>
      </div>

      {/* EQ + Volume knobs */}
      <div className="deck__knobs">
        <div className="knob-wrap">
          <label>Treble</label>
          <input
            type="range" min="0" max="1" step="0.01"
            value={deckState.treble ?? 0.5}
            onChange={e => dj.setTreble(deckId, parseFloat(e.target.value))}
          />
          <span className="knob-val">{dBDisplay(deckState.treble)}</span>
        </div>
        <div className="knob-wrap">
          <label>Bass</label>
          <input
            type="range" min="0" max="1" step="0.01"
            value={deckState.bass ?? 0.5}
            onChange={e => dj.setBass(deckId, parseFloat(e.target.value))}
          />
          <span className="knob-val">{dBDisplay(deckState.bass)}</span>
        </div>
        <div className="knob-wrap">
          <label>Volume</label>
          <input
            type="range" min="0" max="1" step="0.01"
            value={deckState.volume ?? 0.8}
            onChange={e => dj.setVolume(deckId, parseFloat(e.target.value))}
          />
          <span className="knob-val">{Math.round((deckState.volume ?? 0.8) * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

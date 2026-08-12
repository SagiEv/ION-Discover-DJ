import React, { useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { WaveformView } from './WaveformView.jsx'
import { LyricsView } from './LyricsView.jsx'
import { CountdownETA } from './CountdownETA.jsx'

function fmt(secs) {
  if (!secs || isNaN(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function QueuePanel({ deckId }) {
  const isA = deckId === 'A'
  const deckState = useAppStore(s => isA ? s.deckA : s.deckB)
  const removeFromQueue = useAppStore(s => s.removeFromQueue)
  const reorderQueue = useAppStore(s => s.reorderQueue)
  const clearQueue = useAppStore(s => s.clearQueue)
  const addToQueue = useAppStore(s => s.addToQueue)
  const library = useAppStore(s => s.library)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('deck-queue__drop--active')
    const trackIndex = e.dataTransfer.getData('text/track-index')
    const queueReorder = e.dataTransfer.getData('text/queue-reorder')

    if (trackIndex) {
      const track = library[parseInt(trackIndex, 10)]
      if (track) addToQueue(deckId, track)
    } else if (queueReorder) {
      // Internal queue reorder handled by drag within queue items
    }
  }, [deckId, library, addToQueue])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.currentTarget.classList.add('deck-queue__drop--active')
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.currentTarget.classList.remove('deck-queue__drop--active')
  }, [])

  const handleQueueItemDragStart = useCallback((e, index) => {
    e.dataTransfer.setData('text/queue-from', index.toString())
    e.dataTransfer.setData('text/queue-deck', deckId)
    e.currentTarget.classList.add('deck-queue__item--dragging')
  }, [deckId])

  const handleQueueItemDragEnd = useCallback((e) => {
    e.currentTarget.classList.remove('deck-queue__item--dragging')
  }, [])

  const handleQueueItemDrop = useCallback((e, toIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const fromIndex = parseInt(e.dataTransfer.getData('text/queue-from'), 10)
    const fromDeck = e.dataTransfer.getData('text/queue-deck')
    if (fromDeck === deckId && !isNaN(fromIndex)) {
      reorderQueue(deckId, fromIndex, toIndex)
    }
  }, [deckId, reorderQueue])

  return (
    <div
      className="deck-queue"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="deck-queue__header">
        <span>Queue {deckId}</span>
        {deckState.queue.length > 0 && (
          <button
            className="deck-queue__clear"
            onClick={() => clearQueue(deckId)}
            title="Clear queue"
          >
            Clear
          </button>
        )}
      </div>

      {/* Now Playing */}
      {deckState.track && (
        <div className={`deck-queue__now-playing deck-queue__now-playing--${deckId.toLowerCase()}`}>
          <span className="deck-queue__np-label">▶ Now Playing</span>
          <span className="deck-queue__np-title">{deckState.track.name}</span>
        </div>
      )}

      {/* Queue Items */}
      <div className="deck-queue__list">
        {deckState.queue.length === 0 ? (
          <div className="deck-queue__empty">
            Drop tracks here
          </div>
        ) : (
          deckState.queue.map((track, i) => (
            <div
              key={`${track.path}-${i}`}
              className="deck-queue__item"
              draggable
              onDragStart={(e) => handleQueueItemDragStart(e, i)}
              onDragEnd={handleQueueItemDragEnd}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleQueueItemDrop(e, i)}
            >
              <span className="deck-queue__item-handle">⠿</span>
              <span className="deck-queue__item-index">{i + 1}</span>
              <span className="deck-queue__item-name">{track.name}</span>
              <button
                className="deck-queue__item-remove"
                onClick={() => removeFromQueue(deckId, i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function DeckPanel({ deckId }) {
  const deckState = useAppStore(s => deckId === 'A' ? s.deckA : s.deckB)
  const isA = deckId === 'A'

  const remaining = deckState.duration - deckState.position

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const trackIndex = e.dataTransfer.getData('text/track-index')
    if (trackIndex) {
      const dj = getDJController()
      const track = useAppStore.getState().library[parseInt(trackIndex, 10)]
      if (track) dj.loadTrack(deckId, track)
    }
  }, [deckId])

  return (
    <div
      className={`deck deck--${deckId.toLowerCase()}`}
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
              <div className="deck__bpm" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div>BPM <span>{deckState.bpm || '—'}</span></div>
                
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: '4px', 
                  background: 'rgba(255,255,255,0.05)', padding: '2px 8px', 
                  borderRadius: '12px', fontSize: '11px', color: 'var(--text-muted)' 
                }}>
                  <span style={{ fontWeight: 600, color: deckState.pitch !== 0 ? 'var(--accent-a)' : 'inherit' }}>
                    {deckState.pitch > 0 ? '+' : ''}{deckState.pitch.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '9px', opacity: 0.7 }}>PITCH</span>
                </div>
                
                {deckState.isReversed && <span style={{ color: '#ef4444' }}>◀ REV</span>}
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {deckState.lyrics && (
            <button
              className="deck__lyrics-toggle"
              onClick={() => useAppStore.getState().updateDeck(deckId, { showLyrics: !deckState.showLyrics })}
            >
              {deckState.showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
            </button>
          )}
          <span>─{fmt(remaining)}</span>
        </div>
      </div>

      {/* Stems */}
      {deckState.track && (
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px', marginBottom: '12px', flexDirection: 'column' }}>
          {deckState.stemsReady ? (
            <>
              <div className="stems-controls stems-controls-enter-active" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button 
                  onClick={() => getDJController().toggleVocals(deckId)}
                  style={{ 
                    flex: 1, padding: '6px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
                    background: deckState.vocalsMuted ? '#2a2a2a' : '#1db954', 
                    color: deckState.vocalsMuted ? '#666' : '#fff', 
                    border: '1px solid #333', borderRadius: '4px', cursor: 'pointer'
                  }}
                >
                  Vocals
                </button>
                <button 
                  onClick={() => getDJController().toggleInstrumentals(deckId)}
                  style={{ 
                    flex: 1, padding: '6px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
                    background: deckState.instrumentalsMuted ? '#2a2a2a' : '#3b82f6', 
                    color: deckState.instrumentalsMuted ? '#666' : '#fff', 
                    border: '1px solid #333', borderRadius: '4px', cursor: 'pointer'
                  }}
                >
                  Instrumental
                </button>
              </div>
              <div className="stems-granular-controls stems-controls-enter-active" style={{ 
                display: 'flex', alignItems: 'center', width: '100%',
                background: 'rgba(0, 0, 0, 0.3)', borderRadius: '24px', padding: '4px', gap: '4px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
              }}>
                <button 
                  onClick={() => getDJController().toggleGranularStemMode(deckId)}
                  style={{
                    borderRadius: '20px', padding: '4px 12px', fontSize: '9px', fontWeight: 800,
                    background: deckState.granularStemMode === 'solo' ? 'linear-gradient(135deg, #a855f7, #d946ef)' : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    color: '#fff', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                    boxShadow: deckState.granularStemMode === 'solo' ? '0 0 10px rgba(217, 70, 239, 0.4)' : '0 0 10px rgba(245, 158, 11, 0.4)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                  }}
                >
                  {deckState.granularStemMode === 'solo' ? 'SOLO' : 'MUTE'}
                </button>
                
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                
                <div style={{ display: 'flex', gap: '4px', flex: 1, opacity: deckState.instrumentalsMuted ? 0.3 : 1, transition: 'opacity 0.2s', pointerEvents: deckState.instrumentalsMuted ? 'none' : 'auto', justifyContent: 'space-between' }}>
                  <button 
                    onClick={() => getDJController().toggleGranularStem(deckId, 'drums')}
                    style={{ 
                      flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                      background: deckState.granularStemsMuted.drums ? 'transparent' : 'rgba(239, 68, 68, 0.15)', 
                      color: deckState.granularStemsMuted.drums ? '#555' : '#ef4444', 
                      border: deckState.granularStemsMuted.drums ? '1px solid transparent' : '1px solid rgba(239, 68, 68, 0.5)', 
                      borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease',
                      boxShadow: deckState.granularStemsMuted.drums ? 'none' : '0 0 8px rgba(239, 68, 68, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
                      <path d="M2 9a10 5 0 0 1 20 0c0 2.76-4.48 5-10 5S2 11.76 2 9Z" />
                      <path d="M2 9v6c0 2.76 4.48 5 10 5s10-2.24 10-5V9" />
                    </svg>
                    DRUMS
                  </button>
                  <button 
                    onClick={() => getDJController().toggleGranularStem(deckId, 'bass')}
                    style={{ 
                      flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                      background: deckState.granularStemsMuted.bass ? 'transparent' : 'rgba(59, 130, 246, 0.15)', 
                      color: deckState.granularStemsMuted.bass ? '#555' : '#3b82f6', 
                      border: deckState.granularStemsMuted.bass ? '1px solid transparent' : '1px solid rgba(59, 130, 246, 0.5)', 
                      borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease',
                      boxShadow: deckState.granularStemsMuted.bass ? 'none' : '0 0 8px rgba(59, 130, 246, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
                      <path d="m8 14 6-6"/>
                      <path d="m11.5 17.5-3.5 3.5a2.12 2.12 0 0 1-3-3l3.5-3.5"/>
                      <path d="m17.5 11.5 3.5-3.5a2.12 2.12 0 0 0-3-3l-3.5 3.5"/>
                      <path d="M4.5 19.5 7 17"/>
                      <path d="m14 10 3-3"/>
                      <path d="M10 14l-3 3"/>
                    </svg>
                    BASS
                  </button>
                  <button 
                    onClick={() => getDJController().toggleGranularStem(deckId, 'other')}
                    style={{ 
                      flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                      background: deckState.granularStemsMuted.other ? 'transparent' : 'rgba(16, 185, 129, 0.15)', 
                      color: deckState.granularStemsMuted.other ? '#555' : '#10b981', 
                      border: deckState.granularStemsMuted.other ? '1px solid transparent' : '1px solid rgba(16, 185, 129, 0.5)', 
                      borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease',
                      boxShadow: deckState.granularStemsMuted.other ? 'none' : '0 0 8px rgba(16, 185, 129, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M6 4v8" />
                      <path d="M10 4v8" />
                      <path d="M14 4v8" />
                      <path d="M18 4v8" />
                    </svg>
                    SYNTH
                  </button>
                </div>
              </div>
            </>
          ) : deckState.stemsFailed ? (
            <div style={{ fontSize: '12px', color: 'var(--accent-red)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px', verticalAlign: 'middle'}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Stems failed: {deckState.stemsProgress}
            </div>
          ) : deckState.stemsProgress ? (
            <div style={{ fontSize: '12px', color: 'var(--accent-a)', width: '100%', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin-anim" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
              {(() => {
                const match = deckState.stemsProgress.match(/(\d+)\/(\d+)/)
                if (match) {
                  const current = parseInt(match[1], 10)
                  const total = parseInt(match[2], 10)
                  return (
                    <>
                      <span>Processing Stems: {deckState.stemsProgress}</span>
                      <CountdownETA totalSteps={total} currentStep={current} trackId={deckId} progressStr={deckState.stemsProgress} />
                    </>
                  )
                }
                return deckState.stemsProgress
              })()}
            </div>
          ) : null}
        </div>
      )}

      {/* Lyrics View */}
      <LyricsView deckId={deckId} />


      {/* Queue */}
      <QueuePanel deckId={deckId} />
    </div>
  )
}

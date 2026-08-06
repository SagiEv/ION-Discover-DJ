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

      {/* Queue */}
      <QueuePanel deckId={deckId} />
    </div>
  )
}

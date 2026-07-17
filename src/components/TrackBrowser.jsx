import React, { useCallback, useState } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'

function formatDuration(secs) {
  if (!secs || isNaN(secs)) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function TrackBrowser() {
  const library = useAppStore(s => s.library)
  const browseIndex = useAppStore(s => s.browseIndex)
  const setBrowseIndex = useAppStore(s => s.setBrowseIndex)
  const addTracks = useAppStore(s => s.addTracks)
  const dj = getDJController()
  const [isDownloading, setIsDownloading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const searchYouTube = useCallback(async () => {
    if (!searchQuery) return

    setIsDownloading(true)
    try {
      const trackInfo = await window.electronAPI.searchYouTube(searchQuery)
      addTracks([{
        path: trackInfo.path,
        name: trackInfo.name,
        duration: 0,
        bpm: 0,
      }])
      setBrowseIndex(library.length)
      setSearchQuery('')
    } catch (e) {
      alert('Failed to download from YouTube: ' + e.message)
    } finally {
      setIsDownloading(false)
    }
  }, [searchQuery, library.length, addTracks, setBrowseIndex])

  const openFiles = useCallback(async () => {
    const paths = await window.electronAPI.openAudioFiles()
    if (!paths.length) return
    const tracks = paths.map(p => ({
      path: p,
      name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
      duration: 0,
      bpm: 0,
    }))
    addTracks(tracks)
    setBrowseIndex(library.length)
  }, [library.length, addTracks, setBrowseIndex])

  const openFolder = useCallback(async () => {
    const paths = await window.electronAPI.openAudioFolder()
    if (!paths.length) return
    const tracks = paths.map(p => ({
      path: p,
      name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
      duration: 0,
      bpm: 0,
    }))
    addTracks(tracks)
  }, [addTracks])

  const loadToDeck = useCallback((deckId) => {
    const track = library[browseIndex]
    if (track) dj.loadTrack(deckId, track)
  }, [library, browseIndex, dj])

  return (
    <div className="browser">
      <div className="browser__header">
        <span>Library</span>
        <button className="browser__btn" onClick={openFiles}>+ Files</button>
        <button className="browser__btn" onClick={openFolder}>+ Folder</button>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="Search YT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchYouTube()}
            style={{
              width: '120px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px solid var(--surface-c)',
              background: 'var(--surface-b)',
              color: '#fff',
              fontSize: '12px'
            }}
          />
          <button className="browser__btn" onClick={searchYouTube} disabled={isDownloading || !searchQuery}>
            {isDownloading ? 'Wait...' : 'Get'}
          </button>
        </div>
      </div>

      <div className="browser__list">
        {library.length === 0 ? (
          <div className="browser__empty">
            No tracks loaded.<br />
            Click <strong>+ Files</strong> or <strong>+ Folder</strong> to add music.
          </div>
        ) : (
          library.map((track, i) => (
            <div
              key={track.path}
              className={`browser__item${i === browseIndex ? ' selected' : ''}`}
              onClick={() => setBrowseIndex(i)}
              onDoubleClick={() => loadToDeck('A')}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', i.toString())
              }}
            >
              <span className="browser__item__name">{track.name}</span>
              {track.duration > 0 && (
                <span className="browser__item__meta">
                  {formatDuration(track.duration)}
                  {track.bpm ? ` · ${track.bpm} BPM` : ''}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {library.length > 0 && (
        <div className="browser__load-row">
          <button
            className="browser__load-btn browser__load-btn--a"
            onClick={() => loadToDeck('A')}
          >
            → Deck A
          </button>
          <button
            className="browser__load-btn browser__load-btn--b"
            onClick={() => loadToDeck('B')}
          >
            → Deck B
          </button>
        </div>
      )}
    </div>
  )
}

import React, { useCallback, useState, useEffect, useRef } from 'react'
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
  const addToQueue = useAppStore(s => s.addToQueue)
  const addToast = useAppStore(s => s.addToast)
  const dj = getDJController()
  const [isDownloading, setIsDownloading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceTimer = useRef(null)
  const itemRefs = useRef({})

  // Auto-scroll selected item into view when browseIndex changes (e.g. from MIDI browse wheel)
  useEffect(() => {
    const el = itemRefs.current[browseIndex]
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [browseIndex])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    
    // Don't fetch if we just selected a suggestion
    if (!showDropdown && suggestions.length === 0) return

    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await window.electronAPI.getSearchSuggestions(searchQuery)
        setSuggestions(results || [])
        setShowDropdown(results && results.length > 0)
        setActiveIndex(-1)
      } catch (e) {
        console.error('Suggest error:', e)
      }
    }, 300)

    return () => clearTimeout(debounceTimer.current)
  }, [searchQuery])

  const searchYouTube = useCallback(async (queryOverride) => {
    const query = typeof queryOverride === 'string' ? queryOverride : searchQuery
    if (!query) return

    setShowDropdown(false)
    setSearchQuery(query)
    setIsDownloading(true)

    // Notify download start
    addToast(`Downloading: ${query}...`, 'info', 6000)

    try {
      const trackInfo = await window.electronAPI.searchYouTube(query)
      addTracks([{
        path: trackInfo.path,
        name: trackInfo.name,
        videoId: trackInfo.videoId,
        duration: 0,
        bpm: 0,
      }])
      setBrowseIndex(library.length)
      setSearchQuery('')

      // Notify download complete
      addToast(`Downloaded: ${trackInfo.name}`, 'success', 4000)
    } catch (e) {
      // Use toast instead of blocking alert() — prevents search box from locking
      addToast('YouTube download failed: ' + (e.message || 'Unknown error'), 'error', 6000)
    } finally {
      setIsDownloading(false)
    }
  }, [searchQuery, library.length, addTracks, setBrowseIndex, addToast])

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
        <div className="browser__search">
          <div className="browser__search-wrapper">
            <svg 
              className="browser__search-icon" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.86-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M10,15V9l5.2,3L10,15z"/>
            </svg>
            <input
              type="text"
              placeholder="Search YouTube..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex(i => Math.max(i - 1, -1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    searchYouTube(suggestions[activeIndex])
                  } else {
                    searchYouTube()
                  }
                } else if (e.key === 'Escape') {
                  setShowDropdown(false)
                }
              }}
              className="browser__search-input"
            />
            {showDropdown && suggestions.length > 0 && (
              <ul className="browser__suggestions">
                {suggestions.map((sug, idx) => (
                  <li 
                    key={idx}
                    className={`browser__suggestion-item ${idx === activeIndex ? 'active' : ''}`}
                    onMouseDown={() => searchYouTube(sug)}
                  >
                    {sug}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="browser__btn" onClick={() => searchYouTube()} disabled={isDownloading || !searchQuery}>
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
              ref={el => { itemRefs.current[i] = el }}
              className={`browser__item${i === browseIndex ? ' selected' : ''}`}
              onClick={() => setBrowseIndex(i)}
              onDoubleClick={() => loadToDeck('A')}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/track-index', i.toString())
                e.dataTransfer.setData('text/plain', i.toString())
              }}
            >
              <div className="browser__item__row">
                <span className="browser__item__name">{track.name}</span>
                <div className="browser__item__actions">
                  <button
                    className="browser__queue-btn browser__queue-btn--a"
                    onClick={(e) => { e.stopPropagation(); addToQueue('A', track) }}
                    title="Add to Queue A"
                  >
                    +A
                  </button>
                  <button
                    className="browser__queue-btn browser__queue-btn--b"
                    onClick={(e) => { e.stopPropagation(); addToQueue('B', track) }}
                    title="Add to Queue B"
                  >
                    +B
                  </button>
                </div>
              </div>
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


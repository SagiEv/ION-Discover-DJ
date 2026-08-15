import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'

const TAG_COLORS = {
  'POP':          '#ec4899', 'EDM':     '#8b5cf6', 'HOUSE':     '#3b82f6',
  'TECHNO':       '#9ca3af', 'HIP HOP': '#f59e0b', 'R&B':       '#f43f5e',
  'FESTIVAL':     '#22d3ee', 'HIGH ENERGY': '#ef4444', 'CHILL':  '#10b981',
  'CLASSIC':      '#fbbf24', 'DRUM & BASS': '#f97316', 'TRANCE': '#a78bfa',
}

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
  const toggleBrowse = useAppStore(s => s.toggleBrowse)
  const libraryView = useAppStore(s => s.libraryView)
  const setLibraryView = useAppStore(s => s.setLibraryView)
  const libraryTagFilter = useAppStore(s => s.libraryTagFilter)
  const toggleLibraryTag = useAppStore(s => s.toggleLibraryTag)
  const trackTags = useAppStore(s => s.trackTags)
  const allTags = useAppStore(s => s.allTags)
  const fsNodes = useAppStore(s => s.fsNodes)
  const libraryFilterId = useAppStore(s => s.libraryFilterId)
  const setBrowseListCount = useAppStore(s => s.setBrowseListCount)
  const setActiveLoadCallback = useAppStore(s => s.setActiveLoadCallback)
  const browseOpen = useAppStore(s => s.browseOpen)
  const dj = getDJController()
  const [isDownloading, setIsDownloading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [showTagFilter, setShowTagFilter] = useState(false)
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

  // Filter library based on view mode and tag filters
  const filteredLibrary = useMemo(() => {
    let tracks = library

    // Filter by view mode
    if (libraryView === 'folder' && libraryFilterId) {
      const folder = fsNodes[libraryFilterId]
      if (folder && folder.type === 'folder') {
        const folderPaths = new Set()
        const collectPaths = (nodeId) => {
          const n = fsNodes[nodeId]
          if (!n) return
          if (n.type === 'track' && n.trackRef) folderPaths.add(n.trackRef)
          if (n.children) n.children.forEach(cid => collectPaths(cid))
        }
        collectPaths(libraryFilterId)
        tracks = tracks.filter(t => folderPaths.has(t.path))
      }
    } else if (libraryView === 'set' && libraryFilterId) {
      const setNode = fsNodes[libraryFilterId]
      if (setNode && setNode.type === 'set' && setNode.deckConfig) {
        const setPaths = new Set()
        const cfg = setNode.deckConfig
        if (cfg.deckA.track) setPaths.add(cfg.deckA.track.path)
        if (cfg.deckB.track) setPaths.add(cfg.deckB.track.path)
        cfg.deckA.queue.forEach(t => setPaths.add(t.path))
        cfg.deckB.queue.forEach(t => setPaths.add(t.path))
        tracks = tracks.filter(t => setPaths.has(t.path))
      }
    }

    // Filter by tags
    if (libraryTagFilter.length > 0) {
      tracks = tracks.filter(t => {
        const tags = trackTags[t.path] || []
        return libraryTagFilter.some(tf => tags.includes(tf))
      })
    }

    return tracks
  }, [library, libraryView, libraryFilterId, libraryTagFilter, trackTags, fsNodes])

  useEffect(() => {
    if (!browseOpen) {
      setBrowseListCount(filteredLibrary.length)
      setActiveLoadCallback((deckId, index) => {
        const track = filteredLibrary[index]
        if (track) dj.loadTrack(deckId, track)
      })
    }
  }, [filteredLibrary, browseOpen, setBrowseListCount, setActiveLoadCallback, dj])

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
    const track = filteredLibrary[browseIndex]
    if (track) dj.loadTrack(deckId, track)
  }, [filteredLibrary, browseIndex, dj])

  // Get available imported folders/sets for view switching
  const importedFolders = useMemo(() => {
    return Object.values(fsNodes).filter(n => n.type === 'folder' && n.id !== 'root' && n.id !== 'sets_root')
  }, [fsNodes])
  const importedSets = useMemo(() => {
    return Object.values(fsNodes).filter(n => n.type === 'set')
  }, [fsNodes])

  return (
    <div className="browser">
      <div className="browser__header">
        <span>Library</span>
        <button className="browser__btn" onClick={openFiles}>+ Files</button>
        <button className="browser__btn" onClick={openFolder}>+ Folder</button>
        <button className="browser__btn" onClick={toggleBrowse} title="Open Music Browser" style={{
          background: 'rgba(29, 185, 84, 0.1)',
          borderColor: 'rgba(29, 185, 84, 0.3)',
          color: 'var(--accent-a)',
        }}>Browse</button>
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

      {/* View tabs & tag filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="library-view-tabs">
          <button
            className={`library-view-tab${libraryView === 'all' ? ' library-view-tab--active' : ''}`}
            onClick={() => setLibraryView('all')}
          >All</button>
          {importedFolders.length > 0 && (
            <button
              className={`library-view-tab${libraryView === 'folder' ? ' library-view-tab--active' : ''}`}
              onClick={() => setLibraryView('folder', null)}
            >Folders</button>
          )}
          {importedSets.length > 0 && (
            <button
              className={`library-view-tab${libraryView === 'set' ? ' library-view-tab--active' : ''}`}
              onClick={() => setLibraryView('set', null)}
            >Sets</button>
          )}
        </div>
        <button
          className={`library-view-tab${showTagFilter ? ' library-view-tab--active' : ''}`}
          onClick={() => setShowTagFilter(!showTagFilter)}
          style={{ marginLeft: 'auto' }}
        >🏷️</button>
      </div>

      {/* Tag filter chips */}
      {showTagFilter && (
        <div className="library-tag-chips">
          {allTags.map(tag => {
            const color = TAG_COLORS[tag] || '#94a3b8'
            const active = libraryTagFilter.includes(tag)
            return (
              <span
                key={tag}
                className="library-tag-chip"
                style={{
                  background: active ? color : `${color}18`,
                  color: active ? '#000' : color,
                  borderColor: active ? color : `${color}40`,
                }}
                onClick={() => toggleLibraryTag(tag)}
              >{tag}</span>
            )
          })}
        </div>
      )}

      <div className="browser__list">
        {(libraryView === 'folder' || libraryView === 'set') && !libraryFilterId ? (
          <>
            {(libraryView === 'folder' ? importedFolders : importedSets).map((node) => (
              <div 
                key={node.id} 
                className="browser__item" 
                onClick={() => setLibraryView(libraryView, node.id)}
              >
                <div className="browser__item__row">
                  <span className="browser__item__name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{node.type === 'folder' ? '📁' : '🎧'}</span>
                    {node.name}
                  </span>
                  {node.type === 'set' && (
                    <div className="browser__item__actions">
                      <button
                        className="browser__queue-btn"
                        style={{ padding: '2px 8px', width: 'auto' }}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          useAppStore.getState().loadSet(node.id) 
                        }}
                        title="Load Set"
                      >
                        ▶️ Load
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="browser__item__meta" style={{ paddingLeft: 24 }}>
                    {node.type === 'folder' ? `${node.children ? node.children.length : 0} items` : `${node.children ? node.children.length : 0} tracks`}
                  </span>
                </div>
              </div>
            ))}
            {(libraryView === 'folder' ? importedFolders : importedSets).length === 0 && (
              <div className="browser__empty">No {libraryView}s available.</div>
            )}
          </>
        ) : (
          <>
            {(libraryView === 'folder' || libraryView === 'set') && libraryFilterId && (
              <div 
                className="browser__item browser__item--back" 
                onClick={() => setLibraryView(libraryView, null)}
              >
                ← Back to {libraryView === 'folder' ? 'Folders' : 'Sets'}
              </div>
            )}
            {filteredLibrary.length === 0 ? (
              <div className="browser__empty">
                {libraryTagFilter.length > 0 || libraryView !== 'all' ? (
                  <>No tracks match the current filter.</>
            ) : (
              <>
                No tracks loaded.<br />
                Click <strong>+ Files</strong> or <strong>+ Folder</strong> to add music.
              </>
            )}
          </div>
        ) : (
          filteredLibrary.map((track, i) => {
            const tags = trackTags[track.path] || []
            return (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {track.duration > 0 && (
                    <span className="browser__item__meta">
                      {formatDuration(track.duration)}
                      {track.bpm ? ` · ${track.bpm} BPM` : ''}
                    </span>
                  )}
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      {tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          fontSize: 8,
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: `${TAG_COLORS[tag] || '#94a3b8'}20`,
                          color: TAG_COLORS[tag] || '#94a3b8',
                          fontWeight: 600,
                        }}>{tag}</span>
                      ))}
                      {tags.length > 3 && (
                        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>+{tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
          </>
        )}
      </div>

      {filteredLibrary.length > 0 && (
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

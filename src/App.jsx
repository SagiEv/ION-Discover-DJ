import React, { useState, useEffect } from 'react'
import { useAppStore } from './store/appStore.js'
import { DeckPanel } from './components/DeckPanel.jsx'
import { TrackBrowser } from './components/TrackBrowser.jsx'
import { ControllerSurface } from './components/ControllerSurface.jsx'
import { MidiLearnModal, useMidi } from './components/MidiLayer.jsx'
import { useStemOrchestrator } from './components/useStemOrchestrator.jsx'
import { StemQueueModal } from './components/StemQueueModal.jsx'
import { BrowseModal } from './components/BrowseModal.jsx'
import { SettingsModal } from './components/SettingsModal.jsx'
import { ToastContainer } from './components/Toast.jsx'
import './index.css'

function TitleBar({ onOpenMidi, setShowStemQueue, setShowSettings }) {
  const midiConnected = useAppStore(s => s.midiConnected)
  const midiDevices = useAppStore(s => s.midiDevices)
  const scratchMode = useAppStore(s => s.scratchModeEnabled)
  
  const library = useAppStore(s => s.library)
  const stemQueue = useAppStore(s => s.stemQueue)
  const queueStemProcess = useAppStore(s => s.queueStemProcess)

  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const idxStr = e.dataTransfer.getData('text/track-index')
    if (idxStr !== '') {
      const track = library[parseInt(idxStr, 10)]
      if (track) useAppStore.getState().queueStemProcessAsync(track)
    }
  }

  const activeCount = stemQueue.length

  return (
    <div className="title-bar">
      <button 
        className="title-bar__settings-btn"
        onClick={() => setShowSettings(true)}
        title="Settings"
        style={{ WebkitAppRegion: 'no-drag', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '10px' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
      <div className="title-bar__logo">DISCOVERTUBE DJ</div>
      <div className="title-bar__dot" />
      {scratchMode && (
        <span style={{ fontSize: 10, color: 'var(--accent-a)', fontWeight: 600, letterSpacing: 1 }}>
          ● SCRATCH
        </span>
      )}
      
      <div className="title-bar__center">
        <button 
          className={`title-bar__queue-btn ${isDragOver ? 'drag-over' : ''} ${activeCount > 0 ? 'active' : ''}`}
          onClick={() => setShowStemQueue(true)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          title={activeCount > 0 ? stemQueue.map(s => `${s.track.name}: ${s.progress}`).join('\n') : 'Drag tracks here to pre-process stems'}
        >
          {activeCount > 0 ? `⏳ AI Stems Manager (${activeCount})` : '🎵 AI Stems Manager'}
        </button>
      </div>

      <button
        className={`title-bar__midi${midiConnected ? ' connected' : ''}`}
        onClick={onOpenMidi}
      >
        {midiConnected
          ? `🎛 ${midiDevices[0] ?? 'Controller connected'}`
          : '⚠ No MIDI Device – Click to Map'}
      </button>
    </div>
  )
}

export default function App() {
  const [showMidi, setShowMidi] = useState(false)
  const [showStemQueue, setShowStemQueue] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Initialize MIDI connection
  useMidi()

  // Initialize global stem queue processing
  useStemOrchestrator()

  const stemQueue = useAppStore(s => s.stemQueue)
  const deckA = useAppStore(s => s.deckA)
  const deckB = useAppStore(s => s.deckB)

  // Listen to Demucs progress
  useEffect(() => {
    if (window.electronAPI.onDemucsProgress) {
      window.electronAPI.onDemucsProgress(({ trackId, progress }) => {
        const { deckA, deckB, updateDeck, updateStemProgress } = useAppStore.getState()
        
        // Update the global queue UI
        updateStemProgress(trackId, { progress })
        
        // Keep decks perfectly synced if they happen to have this track loaded
        if (deckA.track && deckA.track.stemTrackId === trackId) {
          updateDeck('A', { stemsProgress: progress })
        }
        if (deckB.track && deckB.track.stemTrackId === trackId) {
          updateDeck('B', { stemsProgress: progress })
        }
      })
    }
  }, [])

  // Sync finished stems from queue to decks
  useEffect(() => {
    const checkDeck = (deckId, deck) => {
      if (deck.track && deck.track.stemTrackId && !deck.stemsReady && !deck.stemsFailed) {
        const qItem = stemQueue.find(i => i.trackId === deck.track.stemTrackId)
        if (qItem && qItem.status === 'done') {
          import('./engine/DJController.js').then(({ getDJController }) => {
            getDJController().loadStemsFromDisk(deckId, deck.track.stemTrackId)
          })
        }
      }
    }
    checkDeck('A', deckA)
    checkDeck('B', deckB)
  }, [stemQueue, deckA, deckB])

  // Load default library on mount or when directory changes
  const setLibrary = useAppStore(s => s.setLibrary)
  const rootSongsDir = useAppStore(s => s.settings.rootSongsDir)
  
  useEffect(() => {
    window.electronAPI.loadDefaultLibrary(useAppStore.getState().settings).then(items => {
      if (items && items.length > 0) {
        const tracks = items.map(item => {
          // Handle both old format (plain path string) and new format ({path, videoId})
          const p = typeof item === 'string' ? item : item.path
          const videoId = typeof item === 'object' ? item.videoId : undefined
          const hasSubtitles = typeof item === 'object' ? item.hasSubtitles : false
          return {
            path: p,
            name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
            videoId: videoId || undefined,
            hasSubtitles,
            duration: 0,
            bpm: 0,
          }
        })
        setLibrary(tracks)
      } else {
        setLibrary([])
      }
    }).catch(e => console.error('Failed to load default library:', e))
  }, [setLibrary, rootSongsDir])

  return (
    <div className="app">
      <TitleBar onOpenMidi={() => setShowMidi(true)} setShowStemQueue={setShowStemQueue} setShowSettings={setShowSettings} />

      <div className="screen-area">
        <DeckPanel deckId="A" />
        <TrackBrowser />
        <DeckPanel deckId="B" />
      </div>

      <ControllerSurface />

      {showMidi && <MidiLearnModal onClose={() => setShowMidi(false)} />}
      {showStemQueue && <StemQueueModal onClose={() => setShowStemQueue(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <BrowseModal />
      <ToastContainer />
    </div>
  )
}

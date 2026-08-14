import React, { useState, useEffect } from 'react'
import { useAppStore } from './store/appStore.js'
import { DeckPanel } from './components/DeckPanel.jsx'
import { TrackBrowser } from './components/TrackBrowser.jsx'
import { ControllerSurface } from './components/ControllerSurface.jsx'
import { MidiLearnModal, useMidi } from './components/MidiLayer.jsx'
import { useStemOrchestrator } from './components/useStemOrchestrator.jsx'
import { StemQueueModal } from './components/StemQueueModal.jsx'
import { BrowseModal } from './components/BrowseModal.jsx'
import { ToastContainer } from './components/Toast.jsx'
import './index.css'

function TitleBar({ onOpenMidi, setShowStemQueue }) {
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

  // Load default library on mount
  const addTracks = useAppStore(s => s.addTracks)
  useEffect(() => {
    window.electronAPI.loadDefaultLibrary().then(items => {
      if (items && items.length > 0) {
        const tracks = items.map(item => {
          // Handle both old format (plain path string) and new format ({path, videoId})
          const p = typeof item === 'string' ? item : item.path
          const videoId = typeof item === 'object' ? item.videoId : undefined
          return {
            path: p,
            name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
            videoId: videoId || undefined,
            duration: 0,
            bpm: 0,
          }
        })
        addTracks(tracks)
      }
    }).catch(e => console.error('Failed to load default library:', e))
  }, [addTracks])

  return (
    <div className="app">
      <TitleBar onOpenMidi={() => setShowMidi(true)} setShowStemQueue={setShowStemQueue} />

      <div className="screen-area">
        <DeckPanel deckId="A" />
        <TrackBrowser />
        <DeckPanel deckId="B" />
      </div>

      <ControllerSurface />

      {showMidi && <MidiLearnModal onClose={() => setShowMidi(false)} />}
      {showStemQueue && <StemQueueModal onClose={() => setShowStemQueue(false)} />}
      <BrowseModal />
      <ToastContainer />
    </div>
  )
}

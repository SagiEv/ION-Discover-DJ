import React, { useState } from 'react'
import { useAppStore } from './store/appStore.js'
import { DeckPanel } from './components/DeckPanel.jsx'
import { TrackBrowser } from './components/TrackBrowser.jsx'
import { MixerPanel } from './components/MixerPanel.jsx'
import { MidiLearnModal, useMidi } from './components/MidiLayer.jsx'
import './index.css'

function TitleBar({ onOpenMidi }) {
  const midiConnected = useAppStore(s => s.midiConnected)
  const midiDevices = useAppStore(s => s.midiDevices)
  const scratchMode = useAppStore(s => s.scratchModeEnabled)

  return (
    <div className="title-bar">
      <div className="title-bar__logo">SPOTIFYDJ</div>
      <div className="title-bar__dot" />
      {scratchMode && (
        <span style={{ fontSize: 10, color: 'var(--accent-a)', fontWeight: 600, letterSpacing: 1 }}>
          ● SCRATCH
        </span>
      )}
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

  // Initialize MIDI connection
  useMidi()

  return (
    <div className="app">
      <TitleBar onOpenMidi={() => setShowMidi(true)} />

      <div className="main-area">
        <DeckPanel deckId="A" />
        <TrackBrowser />
        <DeckPanel deckId="B" />
      </div>

      <MixerPanel />

      {showMidi && <MidiLearnModal onClose={() => setShowMidi(false)} />}
    </div>
  )
}

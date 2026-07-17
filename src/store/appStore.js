import { create } from 'zustand'

// ─── Deck slice ────────────────────────────────────────────────────────────────
const makeDeckState = () => ({
  track: null,          // { name, path, duration, bpm, waveform }
  isPlaying: false,
  isReversed: false,
  isScratchMode: false,
  position: 0,          // seconds
  duration: 0,
  cuePoint: 0,
  volume: 0.8,
  treble: 0.5,          // 0-1, 0.5 = 0dB
  bass: 0.5,
  bpm: 0,
})

export const useAppStore = create((set, get) => ({
  // ─── Decks ──────────────────────────────────────────────────────────────────
  deckA: makeDeckState(),
  deckB: makeDeckState(),

  updateDeck: (id, patch) => {
    const key = id === 'A' ? 'deckA' : 'deckB'
    set(state => ({ [key]: { ...state[key], ...patch } }))
  },

  // ─── Mixer ──────────────────────────────────────────────────────────────────
  crossfader: 0.5,       // 0=A, 1=B
  masterVolume: 0.9,
  setCrossfader: (v) => set({ crossfader: v }),
  setMasterVolume: (v) => set({ masterVolume: v }),

  // ─── MIDI ───────────────────────────────────────────────────────────────────
  midiConnected: false,
  midiDevices: [],
  midiMapping: {},
  isMidiLearnMode: false,
  midiLearnTarget: null,  // action name being learned

  setMidiConnected: (connected, devices) => set({ midiConnected: connected, midiDevices: devices }),
  setMidiMapping: (mapping) => set({ midiMapping: mapping }),
  startMidiLearn: (action) => set({ isMidiLearnMode: true, midiLearnTarget: action }),
  stopMidiLearn: () => set({ isMidiLearnMode: false, midiLearnTarget: null }),

  // ─── Library ────────────────────────────────────────────────────────────────
  library: [],          // [{ name, path, duration, bpm }]
  addTracks: (tracks) => set(state => ({
    library: [...state.library, ...tracks.filter(t =>
      !state.library.some(e => e.path === t.path)
    )]
  })),

  // ─── Scratch mode (global toggle, mirrors hardware LED) ─────────────────────
  scratchModeEnabled: false,
  toggleScratchMode: () => set(state => ({ scratchModeEnabled: !state.scratchModeEnabled })),

  // ─── Browse ─────────────────────────────────────────────────────────────────
  browseIndex: 0,
  setBrowseIndex: (i) => set({ browseIndex: i }),
}))

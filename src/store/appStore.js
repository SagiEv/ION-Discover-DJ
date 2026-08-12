import { create } from 'zustand'

export const getTrackId = (trackInfo) => {
  if (!trackInfo) return null
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  };
  const safePath = trackInfo.path ? `local_${hashString(trackInfo.path.toLowerCase().replace(/\\/g, '/'))}` : null;
  return trackInfo.videoId || safePath;
}

// ─── Deck slice ────────────────────────────────────────────────────────────────
const makeDeckState = () => ({
  track: null,          // { name, path, duration, bpm, waveform }
  isPlaying: false,
  isReversed: false,
  isScratchMode: false,
  isSyncEnabled: false,
  position: 0,          // seconds
  visualAngle: 0,       // physical jog angle
  duration: 0,
  cuePoint: 0,
  
  // Stems
  stemsReady: false,
  stemsFailed: false,
  stemsProgress: '',
  vocalsMuted: false,
  instrumentalsMuted: false,
  granularStemsMuted: { drums: false, bass: false, other: false },
  granularStemMode: 'solo', // 'solo' or 'mute'

  volume: 0.8,
  treble: 0.5,          // 0-1, 0.5 = 0dB
  bass: 0.5,
  bpm: 0,
  queue: [],            // [{ name, path, duration, bpm }]
  lyrics: null,         // Array of subtitle segments { text, start, duration }
  showLyrics: false,
  fx: {
    isOn: false,
    selectedEffect: 'Echo',
    amount: 0.5,
    beatTiming: 1, // 1/2, 1, 2, 4
    filterMode: 'lowpass'
  }
})

export const useAppStore = create((set, get) => ({
  // ─── Decks ──────────────────────────────────────────────────────────────────
  deckA: makeDeckState(),
  deckB: makeDeckState(),

  updateDeck: (id, patch) => {
    const key = id === 'A' ? 'deckA' : 'deckB'
    set(state => ({ [key]: { ...state[key], ...patch } }))
  },

  // ─── Queue Management ──────────────────────────────────────────────────────
  addToQueue: (deckId, track) => {
    const key = deckId === 'A' ? 'deckA' : 'deckB'
    set(state => ({
      [key]: {
        ...state[key],
        queue: [...state[key].queue, track],
      }
    }))
  },

  removeFromQueue: (deckId, index) => {
    const key = deckId === 'A' ? 'deckA' : 'deckB'
    set(state => ({
      [key]: {
        ...state[key],
        queue: state[key].queue.filter((_, i) => i !== index),
      }
    }))
  },

  reorderQueue: (deckId, fromIndex, toIndex) => {
    const key = deckId === 'A' ? 'deckA' : 'deckB'
    set(state => {
      const queue = [...state[key].queue]
      const [moved] = queue.splice(fromIndex, 1)
      queue.splice(toIndex, 0, moved)
      return { [key]: { ...state[key], queue } }
    })
  },

  clearQueue: (deckId) => {
    const key = deckId === 'A' ? 'deckA' : 'deckB'
    set(state => ({
      [key]: { ...state[key], queue: [] }
    }))
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

  // ─── Stem Queue ─────────────────────────────────────────────────────────────
  stemQueue: [], // Array of { trackId, track, progress, status, error }
  
  queueStemProcessAsync: async (track, prioritize = false) => {
    const trackId = getTrackId(track)
    if (!trackId) return
    const exists = await window.electronAPI.checkStems(trackId)
    if (exists) return // Do not add to queue if already processed
    useAppStore.getState().queueStemProcess(track, prioritize)
  },

  queueStemProcess: (track, prioritize = false) => set(state => {
    const trackId = getTrackId(track)
    if (!trackId) return state
    if (state.stemQueue.some(item => item.trackId === trackId)) {
      // If already in queue and we need to prioritize, bump it to the front
      if (prioritize) {
        const existing = state.stemQueue.find(i => i.trackId === trackId)
        const rest = state.stemQueue.filter(i => i.trackId !== trackId)
        return { stemQueue: [existing, ...rest] }
      }
      return state // Already in queue
    }
    const newItem = { trackId, track, progress: 'Pending...', status: 'pending', error: null }
    const newQueue = [...state.stemQueue]
    
    // Jump the line if prioritize is true (put it right after the currently running one, or at 0)
    if (prioritize) {
      const runningIdx = newQueue.findIndex(i => i.status === 'processing')
      if (runningIdx !== -1) {
        newQueue.splice(runningIdx + 1, 0, newItem) // insert right after running
      } else {
        newQueue.unshift(newItem)
      }
    } else {
      newQueue.push(newItem)
    }
    return { stemQueue: newQueue }
  }),
  
  updateStemProgress: (trackId, patch) => set(state => ({
    stemQueue: state.stemQueue.map(item => 
      item.trackId === trackId ? { ...item, ...patch } : item
    )
  })),
  
  removeStemProcess: (trackId) => set(state => ({
    stemQueue: state.stemQueue.filter(item => item.trackId !== trackId)
  })),

  cancelStemProcess: (trackId) => {
    if (window.electronAPI.cancelDemucs) {
      window.electronAPI.cancelDemucs(trackId)
    }
    set(state => ({
      stemQueue: state.stemQueue.filter(item => item.trackId !== trackId)
    }))
  },

  retryStemProcess: (trackId) => set(state => {
    const existing = state.stemQueue.find(i => i.trackId === trackId)
    if (!existing) return state
    
    const updated = { ...existing, status: 'pending', error: null, progress: 'Pending...' }
    const rest = state.stemQueue.filter(i => i.trackId !== trackId)
    
    const runningIdx = rest.findIndex(i => i.status === 'processing')
    if (runningIdx !== -1) {
      rest.splice(runningIdx + 1, 0, updated)
    } else {
      rest.unshift(updated)
    }
    return { stemQueue: rest }
  }),
  
  clearPendingStemQueue: () => set(state => ({
    stemQueue: state.stemQueue.filter(item => item.status === 'processing')
  })),

  reorderStemQueue: (fromIndex, toIndex) => set(state => {
    const newQueue = [...state.stemQueue]
    // Only allow reordering of pending items. 
    // Wait, the UI might pass indexes relative to the whole list.
    const [moved] = newQueue.splice(fromIndex, 1)
    newQueue.splice(toIndex, 0, moved)
    return { stemQueue: newQueue }
  }),
}))

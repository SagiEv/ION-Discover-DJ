import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

// Utility to generate unique IDs for filesystem nodes
const genId = () => Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)


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
  pitch: 0,             // -8 to +8 (percentage)
  liveRate: 1.0,        // temporary playback rate for pitch bends
  pitchLockRate: null,   // Locked playback rate (cruise control)
  pitchLockTimestamp: null,
  pitchDownPressed: false,
  pitchUpPressed: false,
  
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
  mid: 0.5,             // 0-1, 0.5 = 0dB
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

export const useAppStore = create(persist((set, get) => ({
  // ─── Hardware Button States ─────────────────────────────────────────────────
  pressedButtons: {}, // e.g. { 'play_pause_A': true }
  
  eqMode: '3-band',   // '2-band' or '3-band'

  setButtonPressed: (action, isPressed) => set(s => ({
    pressedButtons: { ...s.pressedButtons, [action]: isPressed }
  })),

  // ─── Settings ───────────────────────────────────────────────────────────────
  settings: {
    rootSongsDir: '',
    stemsDir: '',
    autoProcessStems: true,
  },
  updateSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch } })),


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
  scratchModeEnabled: true, // Hardware boots with Scratch mode ON by default
  toggleScratchMode: () => set(state => ({ scratchModeEnabled: !state.scratchModeEnabled })),
  setScratchMode: (enabled) => set({ scratchModeEnabled: enabled }),

  // ─── Browse ─────────────────────────────────────────────────────────────────
  browseIndex: 0,
  browseAngle: 0,
  browseListCount: 0,
  activeLoadCallback: null,
  setBrowseIndex: (i) => set({ browseIndex: i }),
  setBrowseListCount: (c) => set({ browseListCount: c }),
  setActiveLoadCallback: (cb) => set({ activeLoadCallback: cb }),

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

  // ─── Toast Notifications ──────────────────────────────────────────────────
  toasts: [],
  addToast: (message, type = 'info', duration = 4000) => set(state => ({
    toasts: [...state.toasts, { id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), message, type, duration }]
  })),
  removeToast: (id) => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // ─── Browse Popup ──────────────────────────────────────────────────────────
  browseOpen: false,
  toggleBrowse: () => set(s => ({ browseOpen: !s.browseOpen })),
  setBrowseOpen: (v) => set({ browseOpen: v }),

  // ─── Virtual Filesystem ────────────────────────────────────────────────────
  // Each node: { id, name, type: 'folder'|'track'|'set', children: [ids], parentId, 
  //              trackRef (path for tracks), tags (for tracks), 
  //              tracks (for sets: [{path,name,deckId,queueOrder}]),
  //              deckConfig (for sets: {deckA:{track,queue},deckB:{track,queue}}) }
  fsNodes: {
    root: { id: 'root', name: 'Music', type: 'folder', children: ['sets_root'], parentId: null },
    sets_root: { id: 'sets_root', name: 'Sets', type: 'folder', children: [], parentId: 'root' },
  },
  currentFolderId: 'root',
  browseSearchQuery: '',
  browseTagFilter: [],

  // ─── Tags ──────────────────────────────────────────────────────────────────
  allTags: ['POP', 'EDM', 'HOUSE', 'TECHNO', 'HIP HOP', 'R&B', 'FESTIVAL', 'HIGH ENERGY', 'CHILL', 'CLASSIC', 'DRUM & BASS', 'TRANCE'],
  trackTags: {}, // { [trackPath]: ['EDM', 'FESTIVAL'] }

  // ─── Library View ──────────────────────────────────────────────────────────
  libraryView: 'all', // 'all' | 'folder' | 'set'
  libraryFilterId: null, // id of folder/set being viewed
  libraryTagFilter: [],
  setLibraryView: (view, filterId) => set({ libraryView: view, libraryFilterId: filterId || null }),
  setLibraryTagFilter: (tags) => set({ libraryTagFilter: tags }),
  toggleLibraryTag: (tag) => set(s => ({
    libraryTagFilter: s.libraryTagFilter.includes(tag)
      ? s.libraryTagFilter.filter(t => t !== tag)
      : [...s.libraryTagFilter, tag]
  })),

  // ─── Filesystem Actions ────────────────────────────────────────────────────

  setCurrentFolder: (id) => set({ currentFolderId: id }),
  setBrowseSearch: (q) => set({ browseSearchQuery: q }),
  toggleBrowseTag: (tag) => set(s => ({
    browseTagFilter: s.browseTagFilter.includes(tag)
      ? s.browseTagFilter.filter(t => t !== tag)
      : [...s.browseTagFilter, tag]
  })),
  clearBrowseTagFilter: () => set({ browseTagFilter: [] }),

  createFolder: (parentId, name) => set(s => {
    const id = genId()

    const parent = s.fsNodes[parentId]
    if (!parent) return s
    return {
      fsNodes: {
        ...s.fsNodes,
        [id]: { id, name, type: 'folder', children: [], parentId },
        [parentId]: { ...parent, children: [...parent.children, id] },
      }
    }
  }),

  renameItem: (id, newName) => set(s => {
    const node = s.fsNodes[id]
    if (!node) return s
    return { fsNodes: { ...s.fsNodes, [id]: { ...node, name: newName } } }
  }),

  deleteItem: (id) => set(s => {
    if (id === 'root' || id === 'sets_root') return s
    const node = s.fsNodes[id]
    if (!node) return s
    // Remove from parent
    const newNodes = { ...s.fsNodes }
    if (node.parentId && newNodes[node.parentId]) {
      newNodes[node.parentId] = {
        ...newNodes[node.parentId],
        children: newNodes[node.parentId].children.filter(c => c !== id),
      }
    }
    // Recursively delete children
    const toDelete = [id]
    const collectChildren = (nid) => {
      const n = newNodes[nid]
      if (n && n.children) n.children.forEach(c => { toDelete.push(c); collectChildren(c) })
    }
    collectChildren(id)
    toDelete.forEach(did => delete newNodes[did])
    return { fsNodes: newNodes }
  }),

  addTrackToFolder: (folderId, track) => set(s => {
    if (folderId === 'sets_root' || folderId === 'root') return s
    const folder = s.fsNodes[folderId]
    if (!folder || (folder.type !== 'folder' && folder.type !== 'set')) return s
    const id = genId()

    // Check if track already exists in this folder
    const exists = folder.children.some(cid => {
      const child = s.fsNodes[cid]
      return child && child.type === 'track' && child.trackRef === track.path
    })
    if (exists) return s
    return {
      fsNodes: {
        ...s.fsNodes,
        [id]: { id, name: track.name, type: 'track', children: [], parentId: folderId, trackRef: track.path, trackData: track },
        [folderId]: { ...folder, children: [...folder.children, id] },
      }
    }
  }),

  removeTrackFromFolder: (folderId, trackNodeId) => set(s => {
    const folder = s.fsNodes[folderId]
    if (!folder || (folder.type !== 'folder' && folder.type !== 'set')) return s
    const newNodes = { ...s.fsNodes }
    newNodes[folderId] = { ...folder, children: folder.children.filter(c => c !== trackNodeId) }
    delete newNodes[trackNodeId]
    return { fsNodes: newNodes }
  }),

  moveItem: (itemId, newParentId) => set(s => {
    const node = s.fsNodes[itemId]
    if (!node || !s.fsNodes[newParentId]) return s
    const oldParent = s.fsNodes[node.parentId]
    const newParent = s.fsNodes[newParentId]
    return {
      fsNodes: {
        ...s.fsNodes,
        [itemId]: { ...node, parentId: newParentId },
        [node.parentId]: { ...oldParent, children: oldParent.children.filter(c => c !== itemId) },
        [newParentId]: { ...newParent, children: [...newParent.children, itemId] },
      }
    }
  }),

  reorderFolderChildren: (folderId, fromIndex, toIndex) => set(s => {
    const folder = s.fsNodes[folderId]
    if (!folder || !folder.children) return s
    const newChildren = [...folder.children]
    const [moved] = newChildren.splice(fromIndex, 1)
    newChildren.splice(toIndex, 0, moved)
    return {
      fsNodes: {
        ...s.fsNodes,
        [folderId]: { ...folder, children: newChildren },
      }
    }
  }),

  // ─── Tag Actions ───────────────────────────────────────────────────────────
  createTag: (tag) => set(s => ({
    allTags: s.allTags.includes(tag.toUpperCase()) ? s.allTags : [...s.allTags, tag.toUpperCase()]
  })),

  addTagToTrack: (trackPath, tag) => set(s => {
    const current = s.trackTags[trackPath] || []
    if (current.includes(tag)) return s
    return { trackTags: { ...s.trackTags, [trackPath]: [...current, tag] } }
  }),

  removeTagFromTrack: (trackPath, tag) => set(s => {
    const current = s.trackTags[trackPath] || []
    return { trackTags: { ...s.trackTags, [trackPath]: current.filter(t => t !== tag) } }
  }),

  // ─── Set Actions ───────────────────────────────────────────────────────────
  saveSet: (name) => set(s => {
    const id = genId()

    const deckAState = s.deckA
    const deckBState = s.deckB
    
    // Collect tracks
    const tracks = [
      deckAState.track,
      ...deckAState.queue,
      deckBState.track,
      ...deckBState.queue
    ].filter(Boolean)

    // Deduplicate tracks by path
    const uniqueTracks = []
    const seen = new Set()
    for (const t of tracks) {
      if (!seen.has(t.path)) {
        seen.add(t.path)
        uniqueTracks.push(t)
      }
    }

    const newNodes = { ...s.fsNodes }
    const childIds = []
    uniqueTracks.forEach(t => {
      const childId = genId()
      childIds.push(childId)
      newNodes[childId] = {
        id: childId,
        name: t.name,
        type: 'track',
        children: [],
        parentId: id,
        trackRef: t.path,
        trackData: t
      }
    })

    const setNode = {
      id,
      name,
      type: 'set',
      children: childIds,
      parentId: 'sets_root',
      deckConfig: {
        deckA: {
          track: deckAState.track ? { ...deckAState.track } : null,
          queue: [...deckAState.queue],
        },
        deckB: {
          track: deckBState.track ? { ...deckBState.track } : null,
          queue: [...deckBState.queue],
        },
      },
    }
    const setsRoot = s.fsNodes['sets_root']
    newNodes[id] = setNode
    newNodes['sets_root'] = { ...setsRoot, children: [...setsRoot.children, id] }

    return { fsNodes: newNodes }
  }),

  updateSetSnapshot: (setId) => set(s => {
    const setNode = s.fsNodes[setId]
    if (!setNode || setNode.type !== 'set') return s
    const deckAState = s.deckA
    const deckBState = s.deckB
    return {
      fsNodes: {
        ...s.fsNodes,
        [setId]: {
          ...setNode,
          deckConfig: {
            deckA: { track: deckAState.track ? { ...deckAState.track } : null, queue: [...deckAState.queue] },
            deckB: { track: deckBState.track ? { ...deckBState.track } : null, queue: [...deckBState.queue] },
          }
        }
      }
    }
  }),

  loadSet: (setId) => set(s => {
    const setNode = s.fsNodes[setId]
    if (!setNode || setNode.type !== 'set' || !setNode.deckConfig) return s
    const cfg = setNode.deckConfig
    // Collect all tracks from the set for library import
    const allSetTracks = []
    if (cfg.deckA.track) allSetTracks.push(cfg.deckA.track)
    if (cfg.deckB.track) allSetTracks.push(cfg.deckB.track)
    cfg.deckA.queue.forEach(t => allSetTracks.push(t))
    cfg.deckB.queue.forEach(t => allSetTracks.push(t))
    // Dedup with existing library
    const existingPaths = new Set(s.library.map(t => t.path))
    const newTracks = allSetTracks.filter(t => t && !existingPaths.has(t.path))
    return {
      library: [...s.library, ...newTracks],
      libraryView: 'set',
      libraryFilterId: setId,
      deckA: {
        ...s.deckA,
        track: cfg.deckA.track,
        queue: cfg.deckA.queue,
        isPlaying: false,
        position: 0,
      },
      deckB: {
        ...s.deckB,
        track: cfg.deckB.track,
        queue: cfg.deckB.queue,
        isPlaying: false,
        position: 0,
      },
    }
  }),

  // ─── Import to Library ─────────────────────────────────────────────────────
  importToLibrary: (itemId) => set(s => {
    const node = s.fsNodes[itemId]
    if (!node) return s
    const existingPaths = new Set(s.library.map(t => t.path))
    const newTracks = []

    const collectTracks = (nid) => {
      const n = s.fsNodes[nid]
      if (!n) return
      if (n.type === 'track' && n.trackData && !existingPaths.has(n.trackData.path)) {
        newTracks.push(n.trackData)
        existingPaths.add(n.trackData.path)
      } else if (n.type === 'folder') {
        n.children.forEach(cid => collectTracks(cid))
      } else if (n.type === 'set' && n.deckConfig) {
        const cfg = n.deckConfig
        const tracks = [cfg.deckA.track, cfg.deckB.track, ...cfg.deckA.queue, ...cfg.deckB.queue].filter(Boolean)
        tracks.forEach(t => {
          if (!existingPaths.has(t.path)) {
            newTracks.push(t)
            existingPaths.add(t.path)
          }
        })
      }
    }
    collectTracks(itemId)
    if (newTracks.length === 0) return s
    return { library: [...s.library, ...newTracks] }
  }),
}), {
  name: 'dj-knob-state',
  partialize: (state) => ({
    crossfader: state.crossfader,
    masterVolume: state.masterVolume,
    eqMode: state.eqMode,
    _deckA: {
      volume: state.deckA.volume,
      treble: state.deckA.treble,
      mid: state.deckA.mid,
      bass: state.deckA.bass,
    },
    _deckB: {
      volume: state.deckB.volume,
      treble: state.deckB.treble,
      mid: state.deckB.mid,
      bass: state.deckB.bass,
    },
    settings: state.settings,
    fsNodes: state.fsNodes,
    allTags: state.allTags,
    trackTags: state.trackTags,
  }),
  merge: (persisted, current) => {
    if (!persisted) return current
    const { _deckA, _deckB, fsNodes, allTags, trackTags, settings, ...rest } = persisted
    return {
      ...current,
      ...rest,
      deckA: { ...current.deckA, ...(_deckA || {}) },
      deckB: { ...current.deckB, ...(_deckB || {}) },
      settings: settings || current.settings,
      fsNodes: fsNodes || current.fsNodes,
      allTags: allTags || current.allTags,
      trackTags: trackTags || current.trackTags,
    }
  },
}))

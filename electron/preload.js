const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openAudioFiles: () => ipcRenderer.invoke('open-audio-files'),
  openAudioFolder: () => ipcRenderer.invoke('open-audio-folder'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultPaths: () => ipcRenderer.invoke('get-default-paths'),
  loadDefaultLibrary: (settings) => ipcRenderer.invoke('load-default-library', settings),
  searchYouTube: (query, settings) => ipcRenderer.invoke('search-youtube', query, settings),
  getSearchSuggestions: (query) => ipcRenderer.invoke('search-youtube-suggestions', query),
  getOrFetchSubtitles: (trackInfo) => ipcRenderer.invoke('get-or-fetch-subtitles', trackInfo),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  loadMidiMapping: () => ipcRenderer.invoke('load-midi-mapping'),
  saveMidiMapping: (mapping) => ipcRenderer.invoke('save-midi-mapping', mapping),
  midiConnect: () => ipcRenderer.invoke('midi-connect'),
  midiSend: (msg) => ipcRenderer.invoke('midi-send', msg),
  checkStems: (trackId, settings) => ipcRenderer.invoke('check-stems', trackId, settings),
  separateStems: (wavBuffer, trackId, settings) => ipcRenderer.invoke('separate-stems', wavBuffer, trackId, settings),
  cancelDemucs: (trackId) => ipcRenderer.send('cancel-demucs', trackId),
  onMidiMessage: (callback) => {
    ipcRenderer.removeAllListeners('midi-message')
    ipcRenderer.on('midi-message', (_, msg) => callback(msg))
  },
  onDemucsProgress: (callback) => {
    ipcRenderer.removeAllListeners('demucs-progress')
    ipcRenderer.on('demucs-progress', (_, data) => callback(data))
  }
})

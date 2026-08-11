const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openAudioFiles: () => ipcRenderer.invoke('open-audio-files'),
  openAudioFolder: () => ipcRenderer.invoke('open-audio-folder'),
  loadDefaultLibrary: () => ipcRenderer.invoke('load-default-library'),
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
  getSearchSuggestions: (query) => ipcRenderer.invoke('search-youtube-suggestions', query),
  getOrFetchSubtitles: (trackInfo) => ipcRenderer.invoke('get-or-fetch-subtitles', trackInfo),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  loadMidiMapping: () => ipcRenderer.invoke('load-midi-mapping'),
  saveMidiMapping: (mapping) => ipcRenderer.invoke('save-midi-mapping', mapping),
  midiConnect: () => ipcRenderer.invoke('midi-connect'),
  midiSend: (msg) => ipcRenderer.invoke('midi-send', msg),
  onMidiMessage: (callback) => {
    ipcRenderer.removeAllListeners('midi-message')
    ipcRenderer.on('midi-message', (_, msg) => callback(msg))
  }
})

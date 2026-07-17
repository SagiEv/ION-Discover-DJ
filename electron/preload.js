const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openAudioFiles: () => ipcRenderer.invoke('open-audio-files'),
  openAudioFolder: () => ipcRenderer.invoke('open-audio-folder'),
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  loadMidiMapping: () => ipcRenderer.invoke('load-midi-mapping'),
  saveMidiMapping: (mapping) => ipcRenderer.invoke('save-midi-mapping', mapping),
  midiConnect: () => ipcRenderer.invoke('midi-connect'),
  onMidiMessage: (callback) => {
    ipcRenderer.removeAllListeners('midi-message')
    ipcRenderer.on('midi-message', (_, msg) => callback(msg))
  }
})

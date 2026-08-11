const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const url = require('url')
const os = require('os')
const ytSearch = require('yt-search')
let youtubedl = require('youtube-dl-exec')
const easymidi = require('easymidi')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

if (!isDev) {
  const ytPath = youtubedl.constants.YOUTUBE_DL_PATH.replace('app.asar', 'app.asar.unpacked')
  youtubedl = youtubedl.create(ytPath)
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'DiscoverTube DJ',
    icon: path.join(__dirname, isDev ? '../public/icon.png' : '../dist/renderer/icon.png'),
    width: 1400,
    height: 820,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0f',
      symbolColor: '#a0a0b0',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // needed for local file audio loading
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Register protocol to serve local audio files securely
  protocol.registerFileProtocol('localfile', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('localfile://', ''))
    callback({ path: filePath })
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Open audio file dialog ───────────────────────────────────────────
ipcMain.handle('open-audio-files', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Select Audio Files',
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'webm'] }],
    properties: ['openFile', 'multiSelections'],
  })
  return filePaths || []
})

// ─── IPC: Open folder dialog ────────────────────────────────────────────────
ipcMain.handle('open-audio-folder', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Select Music Folder',
    properties: ['openDirectory'],
  })
  if (!filePaths || filePaths.length === 0) return []

  const folder = filePaths[0]
  const exts = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm'])
  const results = []

  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(fullPath)
        } else if (exts.has(path.extname(entry.name).toLowerCase())) {
          results.push(fullPath)
        }
      }
    } catch (e) {}
  }

  scan(folder)
  return results
})

// ─── IPC: Read audio file as ArrayBuffer ────────────────────────────────────
ipcMain.handle('read-audio-file', async (_, filePath) => {
  const buffer = fs.readFileSync(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

// ─── IPC: Save/load MIDI mapping ────────────────────────────────────────────
const mappingPath = path.join(app.getPath('userData'), 'midi-mapping.json')

ipcMain.handle('load-midi-mapping', () => {
  try {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
  } catch {
    return null
  }
})

ipcMain.handle('save-midi-mapping', (_, mapping) => {
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2))
  return true
})

// ─── IPC: YouTube Search & Download ─────────────────────────────────────────
const subtitleService = require('./subtitles/subtitle-service')

ipcMain.handle('get-or-fetch-subtitles', async (_, trackInfo) => {
  if (!trackInfo || !trackInfo.path) return null
  const subPath = trackInfo.path.replace(/\.[^.]+$/, '.json')

  try {
    // 1. Try to load from disk
    if (fs.existsSync(subPath)) {
      const data = fs.readFileSync(subPath, 'utf8')
      return JSON.parse(data)
    }

    // 2. Fetch if we have a videoId
    if (trackInfo.videoId) {
      const result = await subtitleService.getSubtitles(trackInfo.videoId)
      if (result) {
        fs.writeFileSync(subPath, JSON.stringify(result, null, 2))
        return result
      }
    }
    return null
  } catch (error) {
    console.error('Failed to get/fetch subtitles:', error)
    return null
  }
})

ipcMain.handle('search-youtube-suggestions', async (_, query) => {
  if (!query) return []
  try {
    const url = `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(query)}`
    const response = await fetch(url)
    const data = await response.json()
    // data is typically ["query", ["suggestion1", "suggestion2", ...]]
    return data[1] || []
  } catch (error) {
    console.error('Failed to fetch YouTube suggestions:', error)
    return []
  }
})
ipcMain.handle('search-youtube', async (_, query) => {
  try {
    const r = await ytSearch(query)
    if (!r || !r.videos || r.videos.length === 0) {
      throw new Error('No results found on YouTube.')
    }
    
    const video = r.videos[0]
    const title = video.title.replace(/[\/\\?%*:|"<>]/g, '') // Sanitize filename
    const videoId = video.videoId
    
    // Save to userData/songs in production, so we don't write to read-only ASAR
    const songsDir = isDev 
      ? path.join(__dirname, '../songs')
      : path.join(app.getPath('userData'), 'songs')
    if (!fs.existsSync(songsDir)) {
      fs.mkdirSync(songsDir, { recursive: true })
    }

    const tempFilePath = path.join(songsDir, `${title}.webm`)

    // If file already exists, just return it
    if (fs.existsSync(tempFilePath)) {
      return { path: tempFilePath, name: title, videoId }
    }

    // Download audio stream using yt-dlp as WebM
    // WebM (Opus) works natively in Web Audio API without needing ffmpeg to fix DASH headers.
    await youtubedl(video.url, {
      format: 'bestaudio[ext=webm]',
      output: tempFilePath,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ]
    })

    return { path: tempFilePath, name: title, videoId }
  } catch (error) {
    console.error('YouTube search error:', error)
    throw error
  }
})

// ─── IPC: Load Default Library ──────────────────────────────────────────────
ipcMain.handle('load-default-library', async () => {
  const songsDir = isDev 
    ? path.join(__dirname, '../songs')
    : path.join(app.getPath('userData'), 'songs')
  if (!fs.existsSync(songsDir)) return []
  
  const exts = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm'])
  const results = []

  try {
    const entries = fs.readdirSync(songsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() && exts.has(path.extname(entry.name).toLowerCase())) {
        results.push(path.join(songsDir, entry.name))
      }
    }
  } catch (e) {
    console.error('Error reading default library:', e)
  }

  return results
})

// ─── IPC: MIDI via easymidi (Node.js direct) ────────────────────────────────
let midiInput = null
let midiOutput = null

ipcMain.handle('midi-connect', (event) => {
  const inputs = easymidi.getInputs()
  const outputs = easymidi.getOutputs()
  if (inputs.length === 0) {
    return [] // No MIDI devices found
  }
  
  // Clean up existing connection if reconnecting
  if (midiInput) {
    midiInput.close()
    midiInput = null
  }
  if (midiOutput) {
    midiOutput.close()
    midiOutput = null
  }

  // Find the ION Discover DJ, or just use the first available MIDI device
  const targetName = inputs.find(n => n.toLowerCase().includes('ion')) || inputs[0]
  const targetOutName = outputs.find(n => n.toLowerCase().includes('ion')) || outputs[0]
  
  try {
    midiInput = new easymidi.Input(targetName)
    if (targetOutName) {
      midiOutput = new easymidi.Output(targetOutName)
    }
    console.log('[MIDI] Connected to Node.js backend:', targetName)
    
    const win = BrowserWindow.fromWebContents(event.sender)
    
    // Listen for Note On
    midiInput.on('noteon', (msg) => {
      win.webContents.send('midi-message', {
        type: 'noteon',
        channel: msg.channel,
        note: msg.note,
        velocity: msg.velocity
      })
    })

    // Listen for Note Off
    midiInput.on('noteoff', (msg) => {
      win.webContents.send('midi-message', {
        type: 'noteoff',
        channel: msg.channel,
        note: msg.note,
        velocity: msg.velocity
      })
    })

    // Listen for CC (Control Change)
    midiInput.on('cc', (msg) => {
      win.webContents.send('midi-message', {
        type: 'cc',
        channel: msg.channel,
        cc: msg.controller,  // easymidi uses 'controller', frontend expects 'cc'
        value: msg.value
      })
    })

    return [targetName]
  } catch (err) {
    console.error('[MIDI] Error opening device:', err)
    return []
  }
})

ipcMain.handle('midi-send', (_, msg) => {
  if (!midiOutput) return
  try {
    if (msg.type === 'noteon' || msg.type === 'noteoff') {
      midiOutput.send(msg.type, {
        channel: msg.channel,
        note: msg.note,
        velocity: msg.velocity || 127
      })
    }
  } catch(e) {
    console.error('[MIDI] Send error:', e)
  }
})

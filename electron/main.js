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

// Increase memory limit for the renderer process (since it decodes large audio files and converts to WAV)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192')

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

  // Graceful handling of fatal renderer crashes (e.g. out of memory)
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details.reason, 'exit code:', details.exitCode)
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Crash Detected',
      message: 'The application encountered a fatal memory error and needs to restart.',
      detail: `Reason: ${details.reason} (Code: ${details.exitCode})`
    })
    win.reload()
  })
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

// ─── IPC: Select directory ──────────────────────────────────────────────────
ipcMain.handle('select-directory', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return filePaths[0] || null
})

// ─── IPC: Read audio file as ArrayBuffer ────────────────────────────────────
ipcMain.handle('read-audio-file', async (_, filePath) => {
  const buffer = fs.readFileSync(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

// ─── IPC: Separate Stems using Demucs ───────────────────────────────────────
const { execFile } = require('child_process')
const util = require('util')
const execFileAsync = util.promisify(execFile)

ipcMain.handle('check-stems', (_, trackId, settings) => {
  if (!trackId) return null
  
  const devDir = path.join('D:\\SpotifyDJ_Stems', trackId)
  const prodDir = path.join(app.getPath('userData'), 'stems', trackId)
  
  const primaryStemsDir = settings?.stemsDir ? path.join(settings.stemsDir, trackId) : (isDev ? devDir : prodDir)

  const checkDir = (stemsDir) => {
    if (!stemsDir) return null
    const result = {
      vocals: path.join(stemsDir, 'vocals.wav'),
      drums: path.join(stemsDir, 'drums.wav'),
      bass: path.join(stemsDir, 'bass.wav'),
      other: path.join(stemsDir, 'other.wav')
    }
    if (fs.existsSync(result.vocals) && fs.existsSync(result.drums) && fs.existsSync(result.bass) && fs.existsSync(result.other)) {
      return result
    }
    return null
  }

  // Always prefer the environment's target directory or user setting first
  const primaryResult = checkDir(primaryStemsDir)
  if (primaryResult) return primaryResult

  // Fallback to the other directory so old stems are not lost (only if no custom setting)
  if (!settings?.stemsDir) {
    return checkDir(isDev ? prodDir : devDir)
  }
  return null
})

let demucsWorker = null
let workerIdleTimer = null
let currentDemucsTask = null
let demucsQueuePromise = Promise.resolve()

function startDemucsWorker() {
  if (demucsWorker) return
  const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' })
  demucsWorker = require('child_process').fork(path.join(__dirname, 'demucsWorker.mjs'), [], { 
    env,
    execArgv: ['--max-old-space-size=8192'] 
  })
  
  demucsWorker.on('message', (msg) => {
    if (!currentDemucsTask) return
    
    if (workerIdleTimer) { clearTimeout(workerIdleTimer); workerIdleTimer = null }
    
    if (msg.type === 'progress') {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('demucs-progress', { trackId: msg.trackId, progress: msg.progress }))
    } else if (msg.type === 'done') {
      currentDemucsTask.resolve(msg.outputDir)
      currentDemucsTask = null
      resetWorkerIdleTimer()
    } else if (msg.type === 'error') {
      currentDemucsTask.reject(new Error(msg.error))
      currentDemucsTask = null
      if (demucsWorker) {
        demucsWorker.kill()
        demucsWorker = null
      }
    }
  })
  
  demucsWorker.on('exit', () => {
    demucsWorker = null
    if (currentDemucsTask) {
      currentDemucsTask.reject(new Error('Worker exited unexpectedly'))
      currentDemucsTask = null
    }
  })
}

function resetWorkerIdleTimer() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer)
  workerIdleTimer = setTimeout(() => {
    if (demucsWorker && !currentDemucsTask) {
      demucsWorker.kill()
      demucsWorker = null
      console.log('[StemSeparator IPC] Idle worker killed')
    }
  }, 60000)
}

ipcMain.on('cancel-demucs', (event, trackId) => {
  if (currentDemucsTask && currentDemucsTask.trackId === trackId) {
    if (demucsWorker) {
      demucsWorker.kill()
      demucsWorker = null
    }
    currentDemucsTask.reject(new Error('Cancelled'))
    currentDemucsTask = null
    console.log('[StemSeparator IPC] Cancelled track', trackId)
  }
})

ipcMain.handle('separate-stems', async (event, wavBuffer, trackId, settings) => {
  const execute = async () => {
    const tempDir = isDev ? 'D:\\SpotifyDJ_Temp' : app.getPath('temp')
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
    
    const inputWav = path.join(tempDir, `demucs_in_${Date.now()}.wav`)
    const outDir = path.join(tempDir, `demucs_out_${Date.now()}`)

    try {
      fs.writeFileSync(inputWav, Buffer.from(wavBuffer))
      
      startDemucsWorker()
      if (workerIdleTimer) { clearTimeout(workerIdleTimer); workerIdleTimer = null }
      
      console.log('[StemSeparator IPC] Sending track to worker:', inputWav)
      
      const sourceStemsDir = await new Promise((resolve, reject) => {
        currentDemucsTask = { trackId, resolve, reject, inputWav, outDir }
        demucsWorker.send({ type: 'process', inputPath: inputWav, outputDir: outDir, trackId })
      })
      
      if (!fs.existsSync(path.join(sourceStemsDir, 'vocals.wav')) || 
          !fs.existsSync(path.join(sourceStemsDir, 'drums.wav')) ||
          !fs.existsSync(path.join(sourceStemsDir, 'bass.wav')) ||
          !fs.existsSync(path.join(sourceStemsDir, 'other.wav'))) {
        throw new Error('Demucs reported success but output files are missing.')
      }
      
      let finalStemsDir = sourceStemsDir
      if (trackId) {
        const baseStemsDir = settings?.stemsDir || (isDev ? 'D:\\SpotifyDJ_Stems' : path.join(app.getPath('userData'), 'stems'))
        finalStemsDir = path.join(baseStemsDir, trackId)
        if (!fs.existsSync(finalStemsDir)) {
          fs.mkdirSync(finalStemsDir, { recursive: true })
        }
        fs.copyFileSync(path.join(sourceStemsDir, 'vocals.wav'), path.join(finalStemsDir, 'vocals.wav'))
        fs.copyFileSync(path.join(sourceStemsDir, 'drums.wav'), path.join(finalStemsDir, 'drums.wav'))
        fs.copyFileSync(path.join(sourceStemsDir, 'bass.wav'), path.join(finalStemsDir, 'bass.wav'))
        fs.copyFileSync(path.join(sourceStemsDir, 'other.wav'), path.join(finalStemsDir, 'other.wav'))
      }
      
      return {
        vocals: path.join(finalStemsDir, 'vocals.wav'),
        drums: path.join(finalStemsDir, 'drums.wav'),
        bass: path.join(finalStemsDir, 'bass.wav'),
        other: path.join(finalStemsDir, 'other.wav')
      }
    } catch (error) {
      console.error('[StemSeparator IPC] Error:', error)
      return null
    } finally {
      try {
        if (fs.existsSync(inputWav)) fs.unlinkSync(inputWav)
        if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })
      } catch (e) {
        console.error('[StemSeparator IPC] Cleanup error:', e)
      }
    }
  }

  const myPromise = demucsQueuePromise.then(() => execute())
  demucsQueuePromise = myPromise.catch(() => {})
  return myPromise
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
ipcMain.handle('search-youtube', async (_, query, settings) => {
  try {
    const r = await ytSearch(query)
    if (!r || !r.videos || r.videos.length === 0) {
      throw new Error('No results found on YouTube.')
    }
    
    const video = r.videos[0]
    const title = video.title.replace(/[\/\\?%*:|"<>]/g, '') // Sanitize filename
    const videoId = video.videoId
    
    // Save to userData/songs in production, so we don't write to read-only ASAR
    const songsDir = settings?.rootSongsDir || (isDev 
      ? path.join(__dirname, '../songs')
      : path.join(app.getPath('userData'), 'songs'))
    if (!fs.existsSync(songsDir)) {
      fs.mkdirSync(songsDir, { recursive: true })
    }

    const tempFilePath = path.join(songsDir, `${title}.webm`)

    const metaFilePath = path.join(songsDir, `${title}.meta.json`)

    // If file already exists, ensure meta file exists and return
    if (fs.existsSync(tempFilePath)) {
      // Ensure meta file exists (migration for older downloads)
      if (!fs.existsSync(metaFilePath)) {
        try { fs.writeFileSync(metaFilePath, JSON.stringify({ videoId })) } catch (_) {}
      }
      return { path: tempFilePath, name: title, videoId }
    }

    // Download audio stream using yt-dlp as WebM with retry logic
    // YouTube intermittently returns 403 errors; retrying usually works.
    const MAX_RETRIES = 2
    let lastError = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
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
        lastError = null
        break // Success
      } catch (dlErr) {
        lastError = dlErr
        const is403 = dlErr.stderr && dlErr.stderr.includes('403')
        if (is403 && attempt < MAX_RETRIES) {
          console.log(`[YouTube] 403 error on attempt ${attempt + 1}, retrying in ${(attempt + 1) * 1500}ms...`)
          await new Promise(res => setTimeout(res, (attempt + 1) * 1500))
        } else {
          break // Non-retryable error or max retries reached
        }
      }
    }

    if (lastError) {
      // Clean up partial download if any
      try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath) } catch (_) {}
      const is403 = lastError.stderr && lastError.stderr.includes('403')
      throw new Error(is403 
        ? 'YouTube blocked the download (403 Forbidden). Please try again in a moment.'
        : `Download failed: ${lastError.stderr || lastError.message}`)
    }

    // Save videoId metadata alongside the audio file
    try { fs.writeFileSync(metaFilePath, JSON.stringify({ videoId })) } catch (_) {}

    return { path: tempFilePath, name: title, videoId }
  } catch (error) {
    console.error('YouTube search error:', error)
    throw error
  }
})

// ─── IPC: Load Default Library ──────────────────────────────────────────────
ipcMain.handle('load-default-library', async (_, settings) => {
  const songsDir = settings?.rootSongsDir || (isDev 
    ? path.join(__dirname, '../songs')
    : path.join(app.getPath('userData'), 'songs'))
  if (!fs.existsSync(songsDir)) return []
  
  const exts = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm'])
  const results = []

  try {
    const entries = fs.readdirSync(songsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() && exts.has(path.extname(entry.name).toLowerCase())) {
        const filePath = path.join(songsDir, entry.name)
        const baseName = entry.name.replace(/\.[^.]+$/, '')
        const metaPath = path.join(songsDir, `${baseName}.meta.json`)
        
        // Try to recover videoId from sidecar .meta.json file
        let videoId = null
        try {
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            videoId = meta.videoId || null
          }
        } catch (_) {}
        
        results.push({ path: filePath, videoId })
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

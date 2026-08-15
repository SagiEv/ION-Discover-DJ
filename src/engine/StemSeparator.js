import { getTrackId, useAppStore } from '../store/appStore.js'

/**
 * Utility to convert an AudioBuffer to a WAV ArrayBuffer.
 */
function audioBufferToWav(buffer, opt) {
  opt = opt || {}
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = opt.float32 ? 3 : 1
  const bitDepth = format === 3 ? 32 : 16

  let result
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }

  return encodeWAV(result, format, sampleRate, numChannels, bitDepth)
}

function interleave(inputL, inputR) {
  const length = inputL.length + inputR.length
  const result = new Float32Array(length)

  let index = 0
  let inputIndex = 0

  while (index < length) {
    result[index++] = inputL[inputIndex]
    result[index++] = inputR[inputIndex]
    inputIndex++
  }
  return result
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)

  /* RIFF identifier */
  writeString(view, 0, 'RIFF')
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  /* RIFF type */
  writeString(view, 8, 'WAVE')
  /* format chunk identifier */
  writeString(view, 12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, format, true)
  /* channel count */
  view.setUint16(22, numChannels, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true)
  /* bits per sample */
  view.setUint16(34, bitDepth, true)
  /* data chunk identifier */
  writeString(view, 36, 'data')
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true)

  if (format === 1) { // Raw PCM
    floatTo16BitPCM(view, 44, samples)
  } else {
    writeFloat32(view, 44, samples)
  }

  return buffer
}

function writeFloat32(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true)
  }
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export async function processStems(audioBuffer, audioEngine, trackId) {
  let stemPaths = null;
  if (trackId) {
    console.log(`[StemSeparator] Checking for existing stems for trackId: ${trackId}`)
    stemPaths = await window.electronAPI.checkStems(trackId)
  }

  if (!stemPaths) {
    console.log('[StemSeparator] Converting AudioBuffer to WAV...')
    let wavBuffer = audioBufferToWav(audioBuffer)
    audioBuffer = null // Free memory
    
    console.log('[StemSeparator] Sending WAV to main process for separation...')
    // We need an IPC call to save the buffer and run demucs
    stemPaths = await window.electronAPI.separateStems(wavBuffer, trackId)
    wavBuffer = null // Free memory
  } else {
    console.log('[StemSeparator] Found existing stems on disk!')
  }

  if (!stemPaths) {
    throw new Error('Stem separation failed in main process.')
  }
  
  console.log('[StemSeparator] Received stem paths, decoding...', stemPaths)
  
  const loadAndDecode = async (p) => {
    const arr = await window.electronAPI.readAudioFile(p)
    return await audioEngine.decodeAudio(arr)
  }
  
  const vocals = await loadAndDecode(stemPaths.vocals)
  const drums = await loadAndDecode(stemPaths.drums)
  const bass = await loadAndDecode(stemPaths.bass)
  const other = await loadAndDecode(stemPaths.other)
  
  console.log('[StemSeparator] Stems ready!')
  return { vocalsBuffer: vocals, drumsBuffer: drums, bassBuffer: bass, otherBuffer: other }
}

export async function processLibraryTrackStems(track, audioEngine) {
  const trackId = getTrackId(track);
  
  if (!trackId) throw new Error('Invalid track')
  
  const existing = await window.electronAPI.checkStems(trackId)
  if (existing) {
    console.log('[StemSeparator] Found existing stems, skipping queue separation.')
    return existing
  }

  // Helper to allow cancelling during the heavy frontend processing phase
  const checkCancelled = () => {
    const { stemQueue } = useAppStore.getState()
    const item = stemQueue.find(i => i.trackId === trackId)
    if (!item || item.status === 'cancelled') {
      throw new Error('Cancelled')
    }
  }

  const { updateStemProgress } = useAppStore.getState()

  console.log(`[StemSeparator] Background queue reading ${track.path}...`)
  updateStemProgress(trackId, { progress: 'Reading audio...' })
  checkCancelled()
  const arr = await window.electronAPI.readAudioFile(track.path)
  
  console.log(`[StemSeparator] Background queue decoding ${track.path}...`)
  updateStemProgress(trackId, { progress: 'Decoding audio...' })
  checkCancelled()
  let audioBuffer = await audioEngine.decodeAudio(arr)
  
  console.log(`[StemSeparator] Background queue converting to WAV...`)
  updateStemProgress(trackId, { progress: 'Converting to WAV...' })
  checkCancelled()
  let wavBuffer = audioBufferToWav(audioBuffer)
  audioBuffer = null // Free memory
  
  console.log(`[StemSeparator] Background queue starting separation...`)
  updateStemProgress(trackId, { progress: 'Sending to AI engine...' })
  checkCancelled()
  const stemPaths = await window.electronAPI.separateStems(wavBuffer, trackId)
  wavBuffer = null // Free memory
  
  if (!stemPaths) {
    throw new Error('Stem separation failed. Please check disk space or permissions.')
  }
  
  return stemPaths
}

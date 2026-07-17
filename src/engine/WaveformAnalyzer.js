/**
 * WaveformAnalyzer — pre-computes waveform peak data from an AudioBuffer.
 * Returns an array of {min, max} pairs normalized to -1..1.
 * This is done once on track load, then rendered on canvas.
 */
export function computeWaveform(audioBuffer, samples = 1000) {
  const channel = audioBuffer.getChannelData(0)
  const blockSize = Math.floor(channel.length / samples)
  const waveform = []

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    let min = Infinity
    let max = -Infinity
    for (let j = 0; j < blockSize; j++) {
      const v = channel[start + j]
      if (v < min) min = v
      if (v > max) max = v
    }
    waveform.push({ min, max })
  }
  return waveform
}

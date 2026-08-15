import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { computeWaveform } from '../engine/WaveformAnalyzer.js'

const ACCENT = { A: '#1db954', B: '#3b82f6', cue: '#f59e0b' }

export function WaveformView({ deckId }) {
  const canvasRef = useRef(null)
  const track = useAppStore(s => deckId === 'A' ? s.deckA.track : s.deckB.track)
  const isLoading = useAppStore(s => deckId === 'A' ? s.deckA.isLoading : s.deckB.isLoading)
  const position = useAppStore(s => deckId === 'A' ? s.deckA.position : s.deckB.position)
  const duration = useAppStore(s => deckId === 'A' ? s.deckA.duration : s.deckB.duration)
  const cuePoint = useAppStore(s => deckId === 'A' ? s.deckA.cuePoint : s.deckB.cuePoint)

  const accent = ACCENT[deckId]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0c0d16'
    ctx.fillRect(0, 0, W, H)

    if (isLoading) {
      return
    }

    if (!track?.waveform) {
      // Empty state
      ctx.strokeStyle = '#1e2038'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      return
    }

    const waveform = track.waveform
    const progress = duration > 0 ? position / duration : 0
    const playheadX = Math.floor(progress * W)

    // Draw waveform bars
    const barW = W / waveform.length
    for (let i = 0; i < waveform.length; i++) {
      const x = i * barW
      const { min, max } = waveform[i]
      const top = ((1 - max) / 2) * H
      const bot = ((1 - min) / 2) * H
      const barH = Math.max(1, bot - top)

      // Color: played portion = accent, unplayed = dimmed
      if (x < playheadX) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.85
      } else {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.25
      }
      ctx.fillRect(x, top, Math.max(1, barW - 0.5), barH)
    }
    ctx.globalAlpha = 1

    // Cue point marker
    if (duration > 0) {
      const cueX = Math.floor((cuePoint / duration) * W)
      ctx.strokeStyle = ACCENT.cue
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cueX, 0)
      ctx.lineTo(cueX, H)
      ctx.stroke()
    }

    // Playhead
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, H)
    ctx.stroke()
    ctx.globalAlpha = 1

  }, [track, isLoading, position, cuePoint, duration, deckId, accent])

  return (
    <div className="deck__waveform" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} />
      {isLoading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255, 255, 255, 0.8)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          fontWeight: 500,
          animation: 'waveform-loading-pulse 1.5s ease-in-out infinite',
          pointerEvents: 'none',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)'
        }}>
          Loading "{track?.name || 'Track'}"...
        </div>
      )}
      <style>{`
        @keyframes waveform-loading-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

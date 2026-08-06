import React, { useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import iconUrl from '../../wheel.png'

/**
 * Interactive jog wheel component.
 * Click-and-drag horizontally to scratch/seek.
 * Sends delta values to onJog callback.
 */
export function JogWheel({ deckId, onJog, onJogRelease }) {
  const isA = deckId === 'A'
  const position = useAppStore(s => isA ? s.deckA.position : s.deckB.position)

  // 1.8 seconds per full rotation (33 1/3 RPM standard)
  const angle = (position || 0) * 200

  const wheelRef = useRef(null)
  const dragState = useRef(null)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const rect = wheelRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)

    dragState.current = { centerX, centerY, lastAngle: startAngle }
    wheelRef.current.classList.add('jog-wheel--active')

    const handleMouseMove = (e) => {
      if (!dragState.current) return
      const { centerX, centerY, lastAngle } = dragState.current
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
      let delta = currentAngle - lastAngle

      // Handle wrapping around ±π
      if (delta > Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI

      // Convert to MIDI-like relative value (64 = center)
      const midiDelta = Math.round(64 + delta * 20)
      const clamped = Math.max(1, Math.min(127, midiDelta))
      onJog(deckId, clamped)

      dragState.current.lastAngle = currentAngle
    }

    const handleMouseUp = () => {
      dragState.current = null
      wheelRef.current?.classList.remove('jog-wheel--active')
      onJogRelease(deckId)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [deckId, onJog, onJogRelease])

  return (
    <div
      ref={wheelRef}
      className={`jog-wheel jog-wheel--${deckId.toLowerCase()}`}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="jog-wheel__inner"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <img src={iconUrl} alt="Vinyl Icon" className="jog-wheel__icon" draggable="false" />
      </div>
      {/* Tick marks around the rim */}
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={i}
          className="jog-wheel__tick"
          style={{ transform: `rotate(${i * 15}deg)` }}
        />
      ))}
    </div>
  )
}

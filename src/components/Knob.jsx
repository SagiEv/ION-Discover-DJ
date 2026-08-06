import React, { useCallback, useRef, useState } from 'react'

/**
 * Skeuomorphic rotary knob component.
 * Drag vertically or scroll to change value.
 * Renders a chrome-look circle with a rotating pointer line.
 */
export function Knob({ value = 0.5, onChange, size = 44, label, min = 0, max = 1 }) {
  const knobRef = useRef(null)
  const dragStart = useRef(null)

  // Map value (0-1) to rotation degrees: 7 o'clock (-135°) to 5 o'clock (+135°)
  const normalized = (value - min) / (max - min)
  const rotation = -135 + normalized * 270

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    dragStart.current = { y: e.clientY, value }

    const handleMouseMove = (e) => {
      if (!dragStart.current) return
      const dy = dragStart.current.y - e.clientY // up = positive
      const sensitivity = 0.005
      const newVal = Math.max(min, Math.min(max, dragStart.current.value + dy * sensitivity))
      onChange(newVal)
    }

    const handleMouseUp = () => {
      dragStart.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [value, onChange, min, max])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.02 : 0.02
    const newVal = Math.max(min, Math.min(max, value + delta))
    onChange(newVal)
  }, [value, onChange, min, max])

  return (
    <div className="knob-wrap-hw">
      {label && <label className="knob-label-hw">{label}</label>}
      <div
        ref={knobRef}
        className="knob-hw"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <div
          className="knob-hw__pointer"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div className="knob-hw__dot" />
      </div>
    </div>
  )
}

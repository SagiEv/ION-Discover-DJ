import React, { useState, useEffect } from 'react'

export function CountdownETA({ totalSteps, currentStep, trackId, progressStr }) {
  const [timeLeft, setTimeLeft] = useState(null)
  
  useEffect(() => {
    if (currentStep <= 0 || currentStep >= totalSteps) return
    
    if (!window.__etaTracker) window.__etaTracker = {}
    let tracker = window.__etaTracker[trackId]
    
    if (!tracker) {
      tracker = { time: Date.now(), step: currentStep, progress: progressStr }
      window.__etaTracker[trackId] = tracker
    } else if (tracker.progress !== progressStr) {
      // Progress updated!
      const elapsed = Date.now() - tracker.time
      const stepsDone = currentStep - tracker.step
      if (stepsDone > 0) {
        const msPerStep = elapsed / stepsDone
        const msLeft = msPerStep * (totalSteps - currentStep)
        tracker.estimatedFinish = Date.now() + msLeft
        tracker.progress = progressStr
      }
    }
    
    if (!tracker.estimatedFinish) return

    const updateTimer = () => {
      const remaining = Math.max(0, tracker.estimatedFinish - Date.now())
      setTimeLeft(remaining)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [currentStep, totalSteps, trackId, progressStr])

  if (timeLeft === null) return null
  
  const totalSeconds = Math.round(timeLeft / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  
  return <span style={{ color: 'var(--text-dim)' }}>{m > 0 ? `~${m}m ${s}s left` : `~${s}s left`}</span>
}

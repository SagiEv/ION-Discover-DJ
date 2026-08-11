import { BaseEffect } from './BaseEffect.js'

class AbstractRepeatEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)

    this.delayNode = this.ctx.createDelay(4.0) // Up to 4 beats at 60 BPM = 4s
    this.feedbackGain = this.ctx.createGain()
    this.captureGain = this.ctx.createGain() // Controls input to the loop

    // Route: input -> capture -> delay -> wet
    //                            \      /
    //                             feedback
    
    this.inputNode.connect(this.captureGain)
    this.captureGain.connect(this.delayNode)
    this.delayNode.connect(this.wetGain)
    
    this.delayNode.connect(this.feedbackGain)
    this.feedbackGain.connect(this.delayNode)
    
    // Dry signal is also mixed in normally when effect is off
    
    this.onTempoChange()
  }

  onTempoChange() {
    if (this.bpm <= 0) return
    const secondsPerBeat = 60.0 / this.bpm
    const delayTime = secondsPerBeat * this.beatLength
    const clampedDelay = Math.max(0.01, Math.min(3.9, delayTime))
    this.delayNode.delayTime.setTargetAtTime(clampedDelay, this.ctx.currentTime, 0.05)
  }

  dispose() {
    super.dispose()
    this.delayNode.disconnect()
    this.feedbackGain.disconnect()
    this.captureGain.disconnect()
  }
}

export class RollEffect extends AbstractRepeatEffect {
  constructor(audioContext) {
    super(audioContext)
    this.captureGain.gain.value = 1.0
    this.feedbackGain.gain.value = 0.0 // Initially no feedback
  }

  _updateMix() {
    const t = this.ctx.currentTime
    if (!this.isOn) {
      // Normal playback: full dry, no wet. Allow new audio to enter the delay line.
      this.dryGain.gain.setTargetAtTime(1.0, t, 0.01)
      this.wetGain.gain.setTargetAtTime(0.0, t, 0.01)
      
      this.captureGain.gain.setTargetAtTime(1.0, t, 0.01)
      this.feedbackGain.gain.setTargetAtTime(0.0, t, 0.01) // Clear the loop
      return
    }

    // Roll is active! 
    // 1. Mute the dry signal (slip mode - track continues underneath but we don't hear it)
    this.dryGain.gain.setTargetAtTime(0.0, t, 0.01)
    
    // 2. Play the wet signal (the loop)
    this.wetGain.gain.setTargetAtTime(1.0, t, 0.01)
    
    // 3. Close the capture gate so new audio doesn't enter the loop
    this.captureGain.gain.setTargetAtTime(0.0, t, 0.01)
    
    // 4. Maximize feedback so the captured audio loops perfectly
    this.feedbackGain.gain.setTargetAtTime(1.0, t, 0.01)
  }
}

export class BeatRepeatEffect extends AbstractRepeatEffect {
  constructor(audioContext) {
    super(audioContext)
    this.captureGain.gain.value = 1.0
    this.feedbackGain.gain.value = 0.0
  }

  _updateMix() {
    const t = this.ctx.currentTime
    if (!this.isOn) {
      // Normal playback
      this.dryGain.gain.setTargetAtTime(1.0, t, 0.01)
      this.wetGain.gain.setTargetAtTime(0.0, t, 0.01)
      this.captureGain.gain.setTargetAtTime(1.0, t, 0.01)
      this.feedbackGain.gain.setTargetAtTime(0.0, t, 0.01)
      return
    }

    // Amount controls the mix and the decay (feedback)
    const wetMix = this.amount
    const dryMix = 1.0 - this.amount
    
    this.dryGain.gain.setTargetAtTime(dryMix, t, 0.01)
    this.wetGain.gain.setTargetAtTime(wetMix, t, 0.01)
    
    // For Beat Repeat, we might want to capture continuously or capture once and decay.
    // Classic DJ Beat Repeat often captures continuously and creates a rhythmic tail.
    this.captureGain.gain.setTargetAtTime(1.0, t, 0.01)
    
    // Feedback scales with amount, but never reaches 1.0 to avoid infinite buildup,
    // maxing out around 0.9 for a long tail.
    const feedback = this.amount * 0.9
    this.feedbackGain.gain.setTargetAtTime(feedback, t, 0.01)
  }
}

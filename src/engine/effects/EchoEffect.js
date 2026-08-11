import { BaseEffect } from './BaseEffect.js'

export class EchoEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)

    this.delayNode = this.ctx.createDelay(5.0) // max 5 seconds delay
    this.feedbackGain = this.ctx.createGain()
    this.filterNode = this.ctx.createBiquadFilter() // lowpass to simulate analog echo

    // Default echo settings
    this.feedbackGain.gain.value = 0.6
    this.filterNode.type = 'lowpass'
    this.filterNode.frequency.value = 3000 // roll off high frequencies

    // Route: input -> delay -> filter -> wet
    //                 \         /
    //                  - feedback
    
    this.inputNode.connect(this.delayNode)
    this.delayNode.connect(this.filterNode)
    this.filterNode.connect(this.wetGain)
    
    // Feedback loop
    this.filterNode.connect(this.feedbackGain)
    this.feedbackGain.connect(this.delayNode)

    this.onTempoChange()
  }

  onTempoChange() {
    if (this.bpm <= 0) return
    
    // Calculate delay time in seconds based on bpm and beatLength
    const secondsPerBeat = 60.0 / this.bpm
    const delayTime = secondsPerBeat * this.beatLength
    
    // Clamp between 0.01 and 4.9 seconds
    const clampedDelay = Math.max(0.01, Math.min(4.9, delayTime))
    
    this.delayNode.delayTime.setTargetAtTime(clampedDelay, this.ctx.currentTime, 0.05)
  }

  dispose() {
    super.dispose()
    this.delayNode.disconnect()
    this.feedbackGain.disconnect()
    this.filterNode.disconnect()
  }
}

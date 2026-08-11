import { BaseEffect } from './BaseEffect.js'

export class FlangerEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)

    this.delayNode = this.ctx.createDelay(0.02) // max 20ms
    this.lfo = this.ctx.createOscillator()
    this.lfoGain = this.ctx.createGain()
    this.feedbackGain = this.ctx.createGain()
    
    // Default values
    this.delayNode.delayTime.value = 0.005 // 5ms base delay
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0.25 // Sweep very slowly, or sync to beat
    
    this.lfoGain.gain.value = 0.003 // +/- 3ms sweep
    this.feedbackGain.gain.value = 0.5 // High feedback for the "jet" sound

    // LFO -> DelayTime
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.delayNode.delayTime)
    this.lfo.start()

    // Audio routing
    this.inputNode.connect(this.delayNode)
    this.delayNode.connect(this.wetGain)
    
    // Feedback
    this.delayNode.connect(this.feedbackGain)
    this.feedbackGain.connect(this.delayNode)
    
    // Mix dry signal into the wet output for the comb filtering effect
    this.inputNode.connect(this.wetGain)
    
    this.onTempoChange()
  }

  onTempoChange() {
    if (this.bpm <= 0) return
    
    // Sync LFO to beat length. E.g., beatLength = 4 means one sweep every 4 beats
    const secondsPerBeat = 60.0 / this.bpm
    const cycleDuration = secondsPerBeat * this.beatLength
    
    const freq = 1.0 / cycleDuration
    this.lfo.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1)
  }

  dispose() {
    super.dispose()
    this.lfo.stop()
    this.lfo.disconnect()
    this.lfoGain.disconnect()
    this.delayNode.disconnect()
    this.feedbackGain.disconnect()
  }
}

export class PhaserEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)
    
    // A phaser is typically a chain of allpass filters modulated by an LFO
    const numStages = 4
    this.stages = []
    
    this.lfo = this.ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0.5
    this.lfo.start()

    let prevNode = this.inputNode
    
    for (let i = 0; i < numStages; i++) {
      const allpass = this.ctx.createBiquadFilter()
      allpass.type = 'allpass'
      allpass.frequency.value = 1000
      
      // Modulate frequency of allpass
      const lfoGain = this.ctx.createGain()
      lfoGain.gain.value = 800 // sweep range
      
      this.lfo.connect(lfoGain)
      lfoGain.connect(allpass.frequency)
      
      prevNode.connect(allpass)
      prevNode = allpass
      this.stages.push({ allpass, lfoGain })
    }
    
    prevNode.connect(this.wetGain)
    
    // Mix dry into wet for the phase cancellation effect
    this.inputNode.connect(this.wetGain)
    
    this.onTempoChange()
  }

  onTempoChange() {
    if (this.bpm <= 0) return
    const secondsPerBeat = 60.0 / this.bpm
    const cycleDuration = secondsPerBeat * this.beatLength
    const freq = 1.0 / cycleDuration
    this.lfo.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1)
  }

  dispose() {
    super.dispose()
    this.lfo.stop()
    this.lfo.disconnect()
    this.stages.forEach(s => {
      s.lfoGain.disconnect()
      s.allpass.disconnect()
    })
  }
}

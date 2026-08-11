import { BaseEffect } from './BaseEffect.js'

export class FilterEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)

    this.filterNode = this.ctx.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.Q.value = 1.5 // slight resonance

    this.inputNode.connect(this.filterNode)
    this.filterNode.connect(this.wetGain)
    
    // For filter, we might want 100% wet when active to truly filter the audio
    // We override setAmount to control the filter frequency rather than just wet/dry mix,
    // or we can use wet/dry + fixed filter, but a sweep is better.
  }

  setAmount(value) {
    super.setAmount(value)
    
    // A standard DJ filter maps 0-0.5 to Low-pass (sweeping down)
    // and 0.5-1.0 to High-pass (sweeping up).
    // Let's implement that classic bi-directional filter knob style,
    // but the user requirement specified:
    // - Low-pass filtering
    // - High-pass filtering
    // - Filter amount/frequency control
    
    // Since UI has "Amount (Wet/Dry)", we will map Amount to Wet/Dry and use the filter mode.
    // However, to make it sound good, Amount will control the cutoff frequency and we force wet=1.0 if it's on.
  }

  // Override updateMix for custom filter behavior
  _updateMix() {
    if (!this.isOn) {
      this.dryGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01)
      this.wetGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.01)
      return
    }

    // When on, fully wet, no dry (otherwise filter sounds phasey)
    this.dryGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.01)
    this.wetGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01)

    // Mode is set via this.filterMode ('lowpass' or 'highpass'), default to lowpass if undefined
    const isLowpass = this.filterMode !== 'highpass'
    this.filterNode.type = isLowpass ? 'lowpass' : 'highpass'
    
    // Map amount (0 to 1) to frequency
    // Lowpass: amount 0 = 20kHz (open), amount 1 = 100Hz (closed)
    // Highpass: amount 0 = 20Hz (open), amount 1 = 10kHz (closed)
    
    const minFreq = 100
    const maxFreq = 20000
    
    let targetFreq = maxFreq
    if (isLowpass) {
      // Exponential sweep downwards
      targetFreq = maxFreq * Math.pow(minFreq / maxFreq, this.amount)
    } else {
      // Exponential sweep upwards
      targetFreq = minFreq * Math.pow(maxFreq / minFreq, this.amount)
    }
    
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.01)
  }
  
  // Custom setter for filter mode
  setFilterMode(mode) {
    this.filterMode = mode // 'lowpass' or 'highpass'
    this._updateMix()
  }

  dispose() {
    super.dispose()
    this.filterNode.disconnect()
  }
}

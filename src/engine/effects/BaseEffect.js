export class BaseEffect {
  constructor(audioContext) {
    this.ctx = audioContext

    // Internal nodes
    this.inputNode = this.ctx.createGain()
    this.outputNode = this.ctx.createGain()
    
    this.dryGain = this.ctx.createGain()
    this.wetGain = this.ctx.createGain()

    // By default, full dry
    this.dryGain.gain.value = 1.0
    this.wetGain.gain.value = 0.0

    // Connect input to dry path immediately
    this.inputNode.connect(this.dryGain)
    this.dryGain.connect(this.outputNode)
    this.wetGain.connect(this.outputNode)

    this.isOn = false
    this.amount = 0.5 // 0.0 to 1.0
    this.beatLength = 1 // in beats
    this.bpm = 120 // current deck BPM
  }

  // To be implemented by subclasses
  // They should connect the FX processing chain between fxInput and wetGain
  setupEffectChain(fxInput) {
    // Example: fxInput.connect(myFilter); myFilter.connect(this.wetGain);
  }

  // Called when effect parameters change from UI
  setAmount(value) {
    this.amount = Math.max(0, Math.min(1, value))
    this._updateMix()
  }

  toggle(isOn) {
    this.isOn = isOn
    this._updateMix()
  }

  setBpm(bpm) {
    this.bpm = bpm || 120
    this.onTempoChange()
  }

  setBeatLength(beats) {
    this.beatLength = beats || 1
    this.onTempoChange()
  }

  // Hook for subclasses to update time-based parameters
  onTempoChange() {}

  // Equal power crossfade for wet/dry
  _updateMix() {
    if (!this.isOn) {
      // Bypass: full dry, no wet
      this.dryGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01)
      this.wetGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.01)
      return
    }

    // Amount determines the wet/dry mix
    const wetMix = this.amount
    const dryMix = 1.0 - this.amount

    // Linear crossfade for now, can be equal power if needed: Math.cos(dryMix * Math.PI/2)
    this.dryGain.gain.setTargetAtTime(dryMix, this.ctx.currentTime, 0.01)
    this.wetGain.gain.setTargetAtTime(wetMix, this.ctx.currentTime, 0.01)
  }

  dispose() {
    this.inputNode.disconnect()
    this.outputNode.disconnect()
    this.dryGain.disconnect()
    this.wetGain.disconnect()
  }
}

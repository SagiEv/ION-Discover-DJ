import { BaseEffect } from './BaseEffect.js'

// Simple procedural impulse response generator for Reverb
function generateImpulseResponse(ctx, duration = 2.0, decay = 2.0) {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const impulse = ctx.createBuffer(2, length, sampleRate)
  
  for (let c = 0; c < 2; c++) {
    const channelData = impulse.getChannelData(c)
    for (let i = 0; i < length; i++) {
      // White noise exponentially decaying
      const t = i / sampleRate
      const noise = (Math.random() * 2 - 1)
      channelData[i] = noise * Math.pow(1 - t / duration, decay)
    }
  }
  return impulse
}

let sharedImpulseResponse = null

export class ReverbEffect extends BaseEffect {
  constructor(audioContext) {
    super(audioContext)

    this.convolver = this.ctx.createConvolver()
    this.highpass = this.ctx.createBiquadFilter()
    
    // Filter out muddy low frequencies from the reverb
    this.highpass.type = 'highpass'
    this.highpass.frequency.value = 200

    if (!sharedImpulseResponse) {
      sharedImpulseResponse = generateImpulseResponse(this.ctx, 2.5, 3.0)
    }
    
    this.convolver.buffer = sharedImpulseResponse

    this.inputNode.connect(this.highpass)
    this.highpass.connect(this.convolver)
    this.convolver.connect(this.wetGain)
  }

  dispose() {
    super.dispose()
    this.convolver.disconnect()
    this.highpass.disconnect()
  }
}

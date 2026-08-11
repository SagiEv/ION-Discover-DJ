import { EchoEffect } from './EchoEffect.js'
import { ReverbEffect } from './ReverbEffect.js'
import { FilterEffect } from './FilterEffect.js'
import { FlangerEffect, PhaserEffect } from './ModulationEffect.js'
import { RollEffect, BeatRepeatEffect } from './RepeatEffect.js'

const EffectMap = {
  'Echo': EchoEffect,
  'Reverb': ReverbEffect,
  'Filter': FilterEffect,
  'Flanger': FlangerEffect,
  'Phaser': PhaserEffect,
  'Delay': EchoEffect, // Using Echo for Delay since they are similar in this context
  'Roll': RollEffect,
  'Beat Repeat': BeatRepeatEffect,
}

export class FXChain {
  constructor(audioContext) {
    this.ctx = audioContext

    // The chain has an input and output that remain constant
    this.inputNode = this.ctx.createGain()
    this.outputNode = this.ctx.createGain()

    this.activeEffect = null
    this.activeEffectName = null
    
    // Default pass-through if no effect is loaded (though we usually have one loaded but turned off)
    this.inputNode.connect(this.outputNode)
  }

  setEffect(effectName) {
    if (this.activeEffectName === effectName) return

    const EffectClass = EffectMap[effectName]
    if (!EffectClass) {
      console.warn(`Effect ${effectName} not found`)
      return
    }

    // Disconnect old effect
    if (this.activeEffect) {
      this.inputNode.disconnect(this.activeEffect.inputNode)
      this.activeEffect.outputNode.disconnect(this.outputNode)
      this.activeEffect.dispose()
    } else {
      // Disconnect the dry pass-through
      this.inputNode.disconnect(this.outputNode)
    }

    // Create new effect
    this.activeEffect = new EffectClass(this.ctx)
    this.activeEffectName = effectName

    // Re-route
    this.inputNode.connect(this.activeEffect.inputNode)
    this.activeEffect.outputNode.connect(this.outputNode)
  }

  setAmount(amount) {
    if (this.activeEffect) {
      this.activeEffect.setAmount(amount)
    }
  }

  toggle(isOn) {
    if (this.activeEffect) {
      this.activeEffect.toggle(isOn)
    }
  }

  setBeatLength(beats) {
    if (this.activeEffect) {
      this.activeEffect.setBeatLength(beats)
    }
  }

  setBpm(bpm) {
    if (this.activeEffect) {
      this.activeEffect.setBpm(bpm)
    }
  }

  // Example: used to switch between lowpass and highpass on the filter
  setFilterMode(mode) {
    if (this.activeEffect && typeof this.activeEffect.setFilterMode === 'function') {
      this.activeEffect.setFilterMode(mode)
    }
  }

  dispose() {
    if (this.activeEffect) {
      this.inputNode.disconnect(this.activeEffect.inputNode)
      this.activeEffect.outputNode.disconnect(this.outputNode)
      this.activeEffect.dispose()
    } else {
      this.inputNode.disconnect(this.outputNode)
    }
  }
}

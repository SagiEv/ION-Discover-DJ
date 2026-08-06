/**
 * MidiController — connects to the ION Discovery DJ via Web MIDI API.
 *
 * Usage:
 *   const midi = new MidiController()
 *   await midi.connect()
 *   midi.onMessage = (msg) => { ... }  // { type, channel, note/cc, value }
 */
export class MidiController {
  constructor() {
    this.access = null
    this.inputs = []
    this.electronDeviceNames = null
    this.onMessage = null       // callback: (msg) => void
    this.onDeviceChange = null  // callback: (inputs) => void
    this._connected = false
  }

  async connect() {
    // 1. Try Electron Node.js IPC bypass first
    if (window.electronAPI && window.electronAPI.midiConnect) {
      const inputs = await window.electronAPI.midiConnect()
      this._connected = true
      this.electronDeviceNames = inputs
      
      // Bind via IPC
      window.electronAPI.onMidiMessage((msg) => {
        if (this.onMessage) this.onMessage(msg)
      })
      
      if (this.onDeviceChange) this.onDeviceChange(inputs)
      return inputs
    }

    // 2. Fallback to Web MIDI API (for standard browsers)
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI API not supported in this browser.')
    }
    this.access = await navigator.requestMIDIAccess({ sysex: false })
    this._bindInputs()
    this.access.onstatechange = () => {
      this._bindInputs()
      if (this.onDeviceChange) this.onDeviceChange(this._getInputNames())
    }
    this._connected = true
    return this._getInputNames()
  }

  _bindInputs() {
    // Remove old listeners
    for (const input of this.inputs) {
      input.onmidimessage = null
    }
    this.inputs = []

    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => this._handleMessage(event)
      this.inputs.push(input)
    }
  }

  _handleMessage(event) {
    const [status, data1, data2] = event.data
    const type = status & 0xf0
    const channel = status & 0x0f

    const msg = { raw: event.data, channel }

    if (type === 0x90 && data2 > 0) {
      msg.type = 'noteon'
      msg.note = data1
      msg.velocity = data2
    } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
      msg.type = 'noteoff'
      msg.note = data1
      msg.velocity = 0
    } else if (type === 0xb0) {
      msg.type = 'cc'
      msg.cc = data1
      msg.value = data2
    } else {
      return // ignore other message types
    }

    if (this.onMessage) this.onMessage(msg)
  }

  _getInputNames() {
    if (this.electronDeviceNames) return this.electronDeviceNames
    return this.inputs.map(i => i.name)
  }

  get isConnected() {
    return this._connected && (this.electronDeviceNames ? this.electronDeviceNames.length > 0 : this.inputs.length > 0)
  }

  get deviceNames() {
    return this._getInputNames()
  }

  send(msg) {
    if (this._connected && window.electronAPI?.midiSend) {
      window.electronAPI.midiSend(msg)
    }
  }
}

// ─── MIDI Mapper ───────────────────────────────────────────────────────────────
/**
 * MidiMapper — translates raw MIDI messages into named app actions
 * based on a user-defined mapping config.
 *
 * Mapping format (JSON):
 * {
 *   "play_A":      { "type": "noteon", "channel": 0, "note": 11 },
 *   "crossfader":  { "type": "cc",     "channel": 0, "cc": 8    },
 *   ...
 * }
 */
export class MidiMapper {
  constructor(mapping = {}) {
    this.mapping = mapping
    // Build reverse lookup: serialized key → action name
    this._reverseMap = {}
    this._buildReverseMap()
  }

  _buildReverseMap() {
    this._reverseMap = {}
    for (const [action, def] of Object.entries(this.mapping)) {
      const key = this._key(def)
      this._reverseMap[key] = action
    }
  }

  _key(def) {
    if (def.type === 'cc') return `cc:${def.channel}:${def.cc}`
    return `note:${def.channel}:${def.note}`
  }

  _keyFromMsg(msg) {
    if (msg.type === 'cc') return `cc:${msg.channel}:${msg.cc}`
    if (msg.type === 'noteon' || msg.type === 'noteoff') return `note:${msg.channel}:${msg.note}`
    return null
  }

  resolve(msg) {
    const key = this._keyFromMsg(msg)
    if (!key) return null
    const action = this._reverseMap[key]
    if (!action) return null
    return { action, msg }
  }

  setMapping(mapping) {
    this.mapping = mapping
    this._buildReverseMap()
  }

  addAction(action, msgDef) {
    this.mapping[action] = msgDef
    this._buildReverseMap()
  }

  removeAction(action) {
    delete this.mapping[action]
    this._buildReverseMap()
  }
}

// ─── Default ION Discovery DJ action names ────────────────────────────────────
export const ION_ACTIONS = [
  // Deck A
  'play_pause_A',
  // 'play_A', 'pause_A', // Older separated versions
  'cue_A', 'sync_A', 'rev_A',
  'pitch_minus_A', 'pitch_plus_A', 'pitch_slider_A', 'load_A',
  'jog_A', 'jog_touch_A',
  'treble_A', 'bass_A', 'volume_A',
  // Deck B
  'play_pause_B',
  // 'play_B', 'pause_B', // Older separated versions
  'cue_B', 'sync_B', 'rev_B',
  'pitch_minus_B', 'pitch_plus_B', 'pitch_slider_B', 'load_B',
  'jog_B', 'jog_touch_B',
  'treble_B', 'bass_B', 'volume_B',
  // Center
  'crossfader', 'master_volume', 'browse_turn', 'browse_press', 'scratch_toggle',
]

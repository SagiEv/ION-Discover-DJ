import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'
import { MidiController, MidiMapper, ION_ACTIONS } from '../midi/MidiController.js'
import { getDJController } from '../engine/DJController.js'

const ACTION_LABELS = {
  play_A: 'PLAY/STUTTER – Deck A',
  pause_A: 'PAUSE – Deck A',
  cue_A: 'CUE – Deck A',
  sync_A: 'SYNC – Deck A',
  rev_A: 'REV – Deck A',
  pitch_minus_A: 'PITCH –% – Deck A',
  pitch_plus_A: 'PITCH +% – Deck A',
  load_A: 'LOAD – Deck A',
  jog_A: 'JOG WHEEL – Deck A',
  jog_touch_A: 'JOG TOUCH – Deck A',
  treble_A: 'TREBLE knob – Deck A',
  bass_A: 'BASS knob – Deck A',
  volume_A: 'VOLUME knob – Deck A',
  play_B: 'PLAY/STUTTER – Deck B',
  pause_B: 'PAUSE – Deck B',
  cue_B: 'CUE – Deck B',
  sync_B: 'SYNC – Deck B',
  rev_B: 'REV – Deck B',
  pitch_minus_B: 'PITCH –% – Deck B',
  pitch_plus_B: 'PITCH +% – Deck B',
  load_B: 'LOAD – Deck B',
  jog_B: 'JOG WHEEL – Deck B',
  jog_touch_B: 'JOG TOUCH – Deck B',
  treble_B: 'TREBLE knob – Deck B',
  bass_B: 'BASS knob – Deck B',
  volume_B: 'VOLUME knob – Deck B',
  crossfader: 'CROSSFADER',
  master_volume: 'MASTER VOLUME',
  browse_turn: 'BROWSE KNOB (turn)',
  browse_press: 'BROWSE KNOB (press)',
  scratch_toggle: 'SCRATCH/SEARCH toggle',
}

function describeMsg(def) {
  if (!def) return null
  if (def.type === 'cc') return `CC${def.cc} Ch${def.channel + 1}`
  return `Note${def.note} Ch${def.channel + 1}`
}

// Shared MIDI controller instance (module-level)
let midiCtrl = null
let midiMapper = null

export function useMidi() {
  const store = useAppStore.getState()

  useEffect(() => {
    if (midiCtrl) return

    midiCtrl = new MidiController()
    midiMapper = new MidiMapper({})

    async function init() {
      try {
        const devices = await midiCtrl.connect()
        useAppStore.getState().setMidiConnected(true, devices)

        // Load saved mapping
        const saved = await window.electronAPI?.loadMidiMapping()
        if (saved) {
          midiMapper.setMapping(saved)
          useAppStore.getState().setMidiMapping(saved)
        }
      } catch (e) {
        console.warn('MIDI connect failed:', e.message)
        useAppStore.getState().setMidiConnected(false, [])
      }
    }

    midiCtrl.onMessage = (msg) => {
      const learnState = useAppStore.getState()

      // MIDI learn mode: capture next message for the target action
      if (learnState.isMidiLearnMode && learnState.midiLearnTarget) {
        const def = msg.type === 'cc'
          ? { type: 'cc', channel: msg.channel, cc: msg.cc }
          : { type: msg.type, channel: msg.channel, note: msg.note }

        midiMapper.addAction(learnState.midiLearnTarget, def)
        const newMapping = { ...midiMapper.mapping }
        useAppStore.getState().setMidiMapping(newMapping)
        useAppStore.getState().stopMidiLearn()
        window.electronAPI?.saveMidiMapping(newMapping)
        return
      }

      // Normal operation: resolve and dispatch
      const resolved = midiMapper.resolve(msg)
      if (resolved) {
        getDJController().dispatch(resolved.action, msg)
      }
    }

    midiCtrl.onDeviceChange = (names) => {
      useAppStore.getState().setMidiConnected(names.length > 0, names)
    }

    init()
  }, [])

  return { midiCtrl, midiMapper }
}

export function MidiLearnModal({ onClose }) {
  const mapping = useAppStore(s => s.midiMapping)
  const learnTarget = useAppStore(s => s.midiLearnTarget)
  const startLearn = useAppStore(s => s.startMidiLearn)
  const stopLearn = useAppStore(s => s.stopMidiLearn)

  const handleRowClick = (action) => {
    if (learnTarget === action) {
      stopLearn()
    } else {
      startLearn(action)
    }
  }

  const handleClear = () => {
    if (learnTarget) {
      if (midiMapper) midiMapper.removeAction(learnTarget)
      const newMapping = { ...(midiMapper?.mapping ?? {}) }
      delete newMapping[learnTarget]
      useAppStore.getState().setMidiMapping(newMapping)
      useAppStore.getState().stopMidiLearn()
      window.electronAPI?.saveMidiMapping(newMapping)
    }
  }

  return (
    <div className="midi-learn-overlay" onClick={onClose}>
      <div className="midi-learn-modal" onClick={e => e.stopPropagation()}>
        <h2>🎛️ MIDI Learn</h2>
        <p>
          Click any control row, then move the corresponding knob or press the button on your
          ION Discovery DJ. The mapping will be saved automatically.
        </p>

        <div className="midi-learn-grid">
          {ION_ACTIONS.map(action => {
            const def = mapping[action]
            const isLearning = learnTarget === action
            return (
              <div
                key={action}
                className={`midi-learn-row${isLearning ? ' learning' : ''}${def ? ' mapped' : ''}`}
                onClick={() => handleRowClick(action)}
              >
                <span className="midi-learn-row__name">{ACTION_LABELS[action] ?? action}</span>
                {isLearning
                  ? <span className="midi-learn-row__waiting">Waiting…</span>
                  : def
                    ? <span className="midi-learn-row__mapped">{describeMsg(def)}</span>
                    : <span className="midi-learn-row__mapped" style={{ color: 'var(--text-muted)' }}>—</span>
                }
              </div>
            )
          })}
        </div>

        <div className="midi-learn-footer">
          {learnTarget && (
            <button onClick={handleClear}>Clear Selected</button>
          )}
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

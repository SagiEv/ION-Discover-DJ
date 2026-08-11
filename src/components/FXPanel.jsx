import React from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'
import { Knob } from './Knob.jsx'

export function FXPanel({ deckId }) {
  const dj = getDJController()
  const isA = deckId === 'A'
  const fxState = useAppStore(s => isA ? s.deckA.fx : s.deckB.fx)
  const isPlaying = useAppStore(s => isA ? s.deckA.isPlaying : s.deckB.isPlaying)

  const fxOptions = [
    'Echo', 'Reverb', 'Filter', 'Flanger', 'Phaser', 'Delay', 'Roll', 'Beat Repeat'
  ]

  const timings = [0.5, 1, 2, 4]
  const timingLabels = { 0.5: '1/2', 1: '1', 2: '2', 4: '4' }

  const getFxAbbreviation = (fx) => {
    switch (fx) {
      case 'Echo': return 'ECO'
      case 'Reverb': return 'RVB'
      case 'Filter': return 'FLT'
      case 'Flanger': return 'FLG'
      case 'Phaser': return 'PHS'
      case 'Delay': return 'DLY'
      case 'Roll': return 'ROL'
      case 'Beat Repeat': return 'RPT'
      default: return fx.substring(0, 3).toUpperCase()
    }
  }

  return (
    <div className={`fx-panel fx-panel--${deckId.toLowerCase()}`}>
      <div className="fx-panel__header">
        <span className="fx-panel__title">FX DECK {deckId}</span>
        <button
          className={`hw-btn hw-btn--fx-on ${fxState.isOn ? (isA ? 'active--a' : 'active--b') : ''}`}
          onClick={() => dj.toggleFX(deckId)}
        >
          {fxState.isOn ? 'FX ON' : 'FX OFF'}
        </button>
      </div>

      <div className="fx-panel__body">
        <div className="fx-panel__grid">
          {fxOptions.map(fx => (
            <button
              key={fx}
              className={`fx-btn fx-btn--grid ${fxState.selectedEffect === fx ? 'active' : ''}`}
              onClick={() => dj.setFXType(deckId, fx)}
              title={fx}
            >
              {getFxAbbreviation(fx)}
            </button>
          ))}
        </div>

        <div className="fx-panel__main-control">
          <div className="fx-amount">
            <Knob
              label={fxState.selectedEffect === 'Filter' ? 'FREQ' : 'AMOUNT'}
              value={fxState.amount}
              onChange={v => dj.setFXAmount(deckId, v)}
              size={44}
            />
          </div>
        </div>

        {fxState.selectedEffect === 'Filter' && (
          <div className="fx-panel__row fx-panel__row--filter-mode">
            <button 
              className={`fx-btn ${fxState.filterMode === 'lowpass' ? 'active' : ''}`}
              onClick={() => dj.setFilterMode(deckId, 'lowpass')}
            >
              LPF
            </button>
            <button 
              className={`fx-btn ${fxState.filterMode === 'highpass' ? 'active' : ''}`}
              onClick={() => dj.setFilterMode(deckId, 'highpass')}
            >
              HPF
            </button>
          </div>
        )}

        {fxState.selectedEffect !== 'Filter' && fxState.selectedEffect !== 'Reverb' && (
          <div className="fx-panel__timing">
            <div className="fx-panel__timing-label">BEAT</div>
            <div className="fx-panel__timing-buttons">
              {timings.map(t => (
                <button
                  key={t}
                  className={`fx-btn fx-btn--timing ${fxState.beatTiming === t ? 'active' : ''}`}
                  onClick={() => dj.setFXTiming(deckId, t)}
                >
                  {timingLabels[t]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

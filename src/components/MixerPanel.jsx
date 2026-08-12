import React from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'

export function MixerPanel() {
  const crossfader = useAppStore(s => s.crossfader)
  const masterVolume = useAppStore(s => s.masterVolume)
  const volumeA = useAppStore(s => s.deckA.volume)
  const volumeB = useAppStore(s => s.deckB.volume)
  const bassA = useAppStore(s => s.deckA.bass)
  const bassB = useAppStore(s => s.deckB.bass)
  const eqMode = useAppStore(s => s.eqMode)
  const dj = getDJController()

  return (
    <div className="mixer">
      {/* Left: Deck A volume fader */}
      <div className="mixer__side mixer__side--a">
        <div className="mixer__vol">
          <label>{eqMode === '3-band' ? 'LOW (A)' : 'A'}</label>
          <input
            id="fader-a"
            type="range" min="0" max="1" step="0.01"
            value={eqMode === '3-band' ? (bassA ?? 0.5) : (volumeA ?? 0.8)}
            onChange={e => {
              if (eqMode === '3-band') dj.setBass('A', parseFloat(e.target.value))
              else dj.setVolume('A', parseFloat(e.target.value))
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {Math.round((eqMode === '3-band' ? (bassA ?? 0.5) : (volumeA ?? 0.8)) * 100)}%
        </div>
      </div>

      {/* Center: crossfader + master */}
      <div className="mixer__center">
        <div className="mixer__xfader-label">
          <span className="a">A</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Crossfader
          </span>
          <span className="b">B</span>
        </div>
        <input
          id="crossfader"
          type="range" min="0" max="1" step="0.005"
          className="mixer__xfader"
          value={crossfader}
          onChange={e => dj.setCrossfader(parseFloat(e.target.value))}
        />
        <div className="mixer__master">
          <label>Master Volume</label>
          <input
            id="master-volume"
            type="range" min="0" max="1" step="0.01"
            value={masterVolume}
            onChange={e => dj.setMasterVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* Right: Deck B volume fader */}
      <div className="mixer__side mixer__side--b">
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {Math.round((eqMode === '3-band' ? (bassB ?? 0.5) : (volumeB ?? 0.8)) * 100)}%
        </div>
        <div className="mixer__vol">
          <label>{eqMode === '3-band' ? 'LOW (B)' : 'B'}</label>
          <input
            id="fader-b"
            type="range" min="0" max="1" step="0.01"
            value={eqMode === '3-band' ? (bassB ?? 0.5) : (volumeB ?? 0.8)}
            onChange={e => {
              if (eqMode === '3-band') dj.setBass('B', parseFloat(e.target.value))
              else dj.setVolume('B', parseFloat(e.target.value))
            }}
          />
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'
import '../index.css'

export function SettingsModal({ onClose }) {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const handleBrowseSongs = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const dir = await window.electronAPI.selectDirectory()
      if (dir) {
        updateSettings({ rootSongsDir: dir })
      }
    }
  }

  const handleBrowseStems = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const dir = await window.electronAPI.selectDirectory()
      if (dir) {
        updateSettings({ stemsDir: dir })
      }
    }
  }

  const handleToggleAutoProcess = (e) => {
    updateSettings({ autoProcessStems: e.target.checked })
  }

  const [defaultPaths, setDefaultPaths] = useState({ songsDir: '', stemsDir: '' })

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getDefaultPaths) {
      window.electronAPI.getDefaultPaths().then(setDefaultPaths)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body settings-body">
          <div className="settings-group">
            <h3>Storage Configuration</h3>
            
            <div className="setting-item">
              <label>Root Songs Directory</label>
              <div className="input-with-button">
                <input 
                  type="text" 
                  value={settings.rootSongsDir || ''} 
                  placeholder={`Default (${defaultPaths.songsDir || 'Loading...'})`} 
                  onChange={e => updateSettings({ rootSongsDir: e.target.value })} 
                />
                <button onClick={handleBrowseSongs} className="browse-btn">Browse</button>
              </div>
              <small>
                Directory where downloaded songs and subtitles will be saved.
              </small>
            </div>

            <div className="setting-item">
              <label>Stems Storage Directory</label>
              <div className="input-with-button">
                <input 
                  type="text" 
                  value={settings.stemsDir || ''} 
                  placeholder={`Default (${defaultPaths.stemsDir || 'Loading...'})`} 
                  onChange={e => updateSettings({ stemsDir: e.target.value })} 
                />
                <button onClick={handleBrowseStems} className="browse-btn">Browse</button>
              </div>
              <small>
                Directory where separated AI stems (vocals, drums, etc.) will be stored.
              </small>
            </div>
          </div>

          <div className="settings-group">
            <h3>Processing</h3>
            
            <div className="setting-item toggle-item">
              <label>
                Auto-process AI Stems
              </label>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={settings.autoProcessStems} 
                  onChange={handleToggleAutoProcess} 
                />
                <span className="slider"></span>
              </label>
            </div>
            <small style={{ marginTop: '5px', display: 'block', color: 'var(--text-muted)' }}>Automatically queue downloaded songs for stem separation.</small>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
